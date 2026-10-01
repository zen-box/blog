"use client";

import { isolateHistory } from "@codemirror/commands";
import type { EditorView } from "@codemirror/view";
import { SparklesIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  parseMetadata,
  protectText,
  proseText,
  restoreProtected,
  sectionChanges,
  unwrapMarkdown,
  wordDiff,
  type AiMetadata,
  type SectionChange,
} from "@/lib/ai-text";
import type { EditorPost } from "@/server/admin";
import { type AiTask, streamAi } from "./ai-client";
import { showInlineSuggestion } from "./ai-inline";

const REWRITES = ["润色", "精简", "扩写", "改口语", "改正式", "纠错", "翻译"];
type Proposal = {
  task: AiTask;
  source: string;
  title: string;
  before: string;
  after: string;
  from: number;
  to: number;
  instruction: string;
  sections: SectionChange[];
  metadata?: AiMetadata;
};
export function AiDiff({ before, after }: { before: string; after: string }) {
  return (
    <div className="text-sm leading-relaxed break-words whitespace-pre-wrap">
      {wordDiff(before, after).map((part, i) =>
        part.kind === "remove" ? (
          <del key={i} className="bg-destructive/10 text-foreground">
            {part.text}
          </del>
        ) : part.kind === "add" ? (
          <ins key={i} className="bg-brand-soft text-foreground no-underline">
            {part.text}
          </ins>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </div>
  );
}
export function AiAssistant({
  post,
  viewRef,
  selection,
  categories,
  update,
  onPreview,
  snapshot,
}: {
  post: EditorPost;
  viewRef: React.RefObject<EditorView | null>;
  selection: { from: number; to: number } | null;
  categories: { id: number; name: string }[];
  update: (patch: Partial<EditorPost>) => void;
  onPreview: (markdown: string | null) => void;
  snapshot: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false),
    [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState(false),
    [applying, setApplying] = useState(false);
  const [proposal, setProposal] = useState<Proposal | null>(null),
    [stream, setStream] = useState("");
  const [choices, setChoices] = useState<Record<string, boolean>>({}),
    [ignored, setIgnored] = useState<number[]>([]);
  const [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null),
    serial = useRef(0);
  const active = useRef<{
    discard: () => void;
    accept: () => void;
    proposal: Proposal | null;
    busy: boolean;
  }>({ discard: () => {}, accept: () => {}, proposal: null, busy: false });
  function discard() {
    serial.current++;
    controller.current?.abort();
    setBusy(false);
    setProposal(null);
    setStream("");
    setError("");
    onPreview(null);
    const view = viewRef.current;
    if (view) showInlineSuggestion(view, null);
  }
  async function generate(task: AiTask, command = instruction) {
    const view = viewRef.current;
    if (!view && task === "rewrite") return;
    const source = view?.state.doc.toString() ?? post.content;
    const range = task === "rewrite" ? view!.state.selection.main : { from: 0, to: source.length };
    if (task === "rewrite" && range.from === range.to) {
      toast.error("先选中要改写的文字");
      return;
    }
    if (!source.trim()) {
      toast.error("先写一些正文吧");
      return;
    }
    discard();
    setOpen(false);
    setBusy(true);
    setIgnored([]);
    setChoices({});
    const ticket = serial.current,
      ctrl = new AbortController();
    controller.current = ctrl;
    const before = source.slice(range.from, range.to);
    try {
      const protectedText = task === "metadata" ? null : protectText(before);
      const context =
        task === "rewrite"
          ? source.slice(Math.max(0, range.from - 1200), range.from) +
            "\n[所选文字]\n" +
            source.slice(range.to, range.to + 1200)
          : "";
      const raw = await streamAi(
        {
          task,
          title: post.title,
          content: protectedText?.text ?? before,
          instruction: command,
          context,
        },
        ctrl.signal,
        (value) => {
          if (ticket !== serial.current) return;
          setStream(value);
          if (
            task === "rewrite" &&
            protectedText?.pieces.length === 0 &&
            view &&
            view.state.doc.toString() === source
          )
            showInlineSuggestion(view, { from: range.from, to: range.to, before, after: value });
        },
      );
      if (ticket !== serial.current) return;
      const after =
        task === "metadata" ? raw : restoreProtected(unwrapMarkdown(raw), protectedText!);
      const metadata = task === "metadata" ? parseMetadata(raw, categories) : undefined;
      const next = {
        task,
        source,
        title: post.title,
        before,
        after,
        from: range.from,
        to: range.to,
        instruction: command,
        sections: task === "rewrite" || task === "metadata" ? [] : sectionChanges(source, after),
        metadata,
      };
      setProposal(next);
      setStream("");
      if (task === "rewrite" && view && view.state.doc.toString() === source)
        showInlineSuggestion(view, { from: range.from, to: range.to, before, after });
      if (task !== "rewrite" && task !== "metadata") onPreview(after);
    } catch (e) {
      if (ticket !== serial.current || ctrl.signal.aborted) return;
      setError((e as Error).message);
      onPreview(null);
      if (view) showInlineSuggestion(view, null);
    } finally {
      if (ticket === serial.current) setBusy(false);
    }
  }
  async function apply(sectionIndex?: number) {
    if (!proposal || applying || busy) return;
    const view = viewRef.current;
    if (
      (view?.state.doc.toString() ?? post.content) !== proposal.source ||
      post.title !== proposal.title
    ) {
      discard();
      toast.error("正文或标题已变化，请重新生成建议");
      return;
    }
    setApplying(true);
    try {
      if (proposal.task === "metadata") {
        const patch: Partial<EditorPost> = {};
        for (const field of ["excerpt", "seoDescription", "slug", "tags", "categoryId"] as const)
          if (choices[field]) Object.assign(patch, { [field]: proposal.metadata![field] });
        update(patch);
        discard();
        return;
      }
      if (proposal.task !== "rewrite") await snapshot();
      if (!view || view.state.doc.toString() !== proposal.source)
        throw new Error("正文已变化，请重新生成建议");
      let changes: { from: number; to: number; insert: string }[];
      if (proposal.task === "rewrite")
        changes = [{ from: proposal.from, to: proposal.to, insert: proposal.after }];
      else
        changes = proposal.sections
          .filter((_, index) =>
            sectionIndex === undefined ? !ignored.includes(index) : index === sectionIndex,
          )
          .map((part) => ({ from: part.from, to: part.to, insert: part.after }));
      const remaining =
        sectionIndex === undefined
          ? []
          : proposal.sections.filter(
              (_, index) => index !== sectionIndex && !ignored.includes(index),
            );
      view.dispatch({ changes, userEvent: "input.ai", annotations: isolateHistory.of("full") });
      if (remaining.length && sectionIndex !== undefined) {
        const accepted = proposal.sections[sectionIndex],
          delta = accepted.after.length - (accepted.to - accepted.from);
        const shifted = remaining.map((part) =>
          part.from >= accepted.to
            ? { ...part, from: part.from + delta, to: part.to + delta }
            : part,
        );
        setProposal({ ...proposal, source: view.state.doc.toString(), sections: shifted });
        setIgnored([]);
      } else discard();
      view.focus();
      toast.success("已应用建议，可按 Ctrl/⌘ + Z 撤销");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setApplying(false);
    }
  }
  useEffect(() => {
    active.current = { discard, accept: () => void apply(), proposal, busy };
  });
  useEffect(() => {
    const metadata = () => {
      void generate("metadata");
    };
    window.addEventListener("blog-ai-metadata", metadata);
    return () => window.removeEventListener("blog-ai-metadata", metadata);
  });
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.isComposing || document.querySelector('[role="dialog"]')) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "j") {
        event.preventDefault();
        setOpen(true);
        return;
      }
      const current = active.current;
      if (event.key === "Escape" && (current.proposal || current.busy)) {
        event.preventDefault();
        event.stopPropagation();
        current.discard();
      }
      if (event.key === "Tab" && current.proposal?.task === "rewrite" && !current.busy) {
        event.preventDefault();
        event.stopPropagation();
        current.accept();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      controller.current?.abort();
    };
  }, []);
  const [rect, setRect] = useState<{ left: number; bottom: number } | null>(null);
  useEffect(() => {
    const measure = () => {
      const point = selection && viewRef.current?.coordsAtPos(selection.to);
      setRect(
        point && point.bottom >= 0 && point.top < window.innerHeight
          ? { left: point.left, bottom: point.bottom }
          : null,
      );
    };
    const frame = requestAnimationFrame(measure);
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [selection, viewRef]);
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} aria-label="AI 写作助手">
        <SparklesIcon className="size-3.5" />
        AI 助手
      </Button>
      {selection && rect && !busy && !proposal && !open && (
        <div
          role="toolbar"
          aria-label="划词 AI 改写"
          className="fixed z-40 flex max-w-[calc(100vw-2rem)] flex-wrap gap-1 rounded-xl border border-border bg-card p-2 shadow-float"
          style={{
            top: Math.min(rect.bottom + 8, window.innerHeight - 120),
            left: Math.max(16, Math.min(rect.left, window.innerWidth - 350)),
          }}
          onMouseDown={(event) => event.preventDefault()}
        >
          {REWRITES.map((command) => (
            <Button
              key={command}
              variant="ghost"
              size="sm"
              onClick={() => void generate("rewrite", command)}
            >
              {command}
            </Button>
          ))}
          <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
            自定义
          </Button>
        </div>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>AI 写作助手</DialogTitle>
            <DialogDescription>
              建议先预览再应用，正文改动可撤销。Ctrl/⌘ + J 打开。
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap gap-2">
            {REWRITES.map((command) => (
              <Button
                key={command}
                variant="outline"
                size="sm"
                onClick={() => void generate("rewrite", command)}
              >
                {command}
              </Button>
            ))}
          </div>
          <Input
            aria-label="自定义 AI 指令"
            value={instruction}
            onChange={(event) => setInstruction(event.target.value)}
            placeholder="例如：翻译成英文，保留专有名词"
          />
          <Button disabled={!instruction.trim()} onClick={() => void generate("rewrite")}>
            改写所选文字
          </Button>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => void generate("format")}>
              AI 排版
            </Button>
            <Button variant="outline" onClick={() => void generate("proofread")}>
              全文校对
            </Button>
            <Button variant="outline" onClick={() => void generate("polish")}>
              全文润色
            </Button>
            <Button variant="outline" onClick={() => void generate("metadata")}>
              生成文章信息
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      {(busy || proposal || error) && (
        <div className="my-3 space-y-3 rounded-xl border border-border bg-card p-4" data-ai-review>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {busy && (
            <>
              <p role="status" className="text-sm text-muted-foreground">
                AI 正在生成建议…
              </p>
              <pre
                className="max-h-40 overflow-auto text-xs whitespace-pre-wrap"
                role="region"
                aria-label="AI 正在生成的文字"
                tabIndex={0}
              >
                {stream}
              </pre>
              <Button variant="outline" size="sm" onClick={discard}>
                停止生成
              </Button>
            </>
          )}
          {proposal && (
            <>
              {proposal.task === "rewrite" ? (
                <>
                  <p className="text-xs text-muted-foreground">Tab 接受 · Esc 放弃</p>
                  <AiDiff before={proposal.before} after={proposal.after} />
                </>
              ) : proposal.task === "metadata" ? (
                <div className="space-y-2">
                  {(
                    [
                      ["excerpt", "摘要"],
                      ["seoDescription", "SEO 描述"],
                      ["slug", "英文 slug"],
                      ["tags", "标签"],
                      ["categoryId", "分类"],
                    ] as const
                  ).map(([field, label]) => (
                    <label key={field} className="flex items-start gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={!!choices[field]}
                        onChange={(event) =>
                          setChoices((cur) => ({ ...cur, [field]: event.target.checked }))
                        }
                      />
                      <span>
                        <span className="font-medium">{label}：</span>
                        {field === "categoryId"
                          ? (categories.find((c) => c.id === proposal.metadata?.categoryId)?.name ??
                            "不设置分类")
                          : field === "tags"
                            ? proposal.metadata?.tags.join("、")
                            : proposal.metadata?.[field]}
                      </span>
                    </label>
                  ))}
                </div>
              ) : (
                <>
                  {proposal.task === "format" &&
                    proseText(proposal.before) !== proseText(proposal.after) && (
                      <p role="alert" className="text-sm text-destructive">
                        AI 排版改动了文字，请核对差异后决定是否应用。
                      </p>
                    )}
                  {proposal.sections.length === 0 && (
                    <p className="text-sm text-muted-foreground">没有需要修改的内容</p>
                  )}
                  {proposal.sections.map(
                    (section, index) =>
                      !ignored.includes(index) && (
                        <div key={index} className="space-y-2 border-b border-border pb-3">
                          <p className="text-sm font-medium">{section.title}</p>
                          <div
                            className="max-h-60 overflow-auto"
                            role="region"
                            aria-label={`${section.title}修改差异`}
                            tabIndex={0}
                          >
                            <AiDiff before={section.before} after={section.after} />
                          </div>
                          <div className="flex gap-2">
                            <Button disabled={applying} size="sm" onClick={() => void apply(index)}>
                              接受此节
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setIgnored((cur) => [...cur, index])}
                            >
                              忽略此节
                            </Button>
                          </div>
                        </div>
                      ),
                  )}
                </>
              )}
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={
                    applying ||
                    (proposal.task === "metadata" && !Object.values(choices).some(Boolean))
                  }
                  size="sm"
                  onClick={() => void apply()}
                >
                  {applying
                    ? "保存快照…"
                    : proposal.task === "rewrite"
                      ? "接受改写"
                      : proposal.task === "metadata"
                        ? "填入所选建议"
                        : "接受全部建议"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void generate(proposal.task, proposal.instruction)}
                >
                  重新生成
                </Button>
                <Button variant="ghost" size="sm" onClick={discard}>
                  放弃建议
                </Button>
              </div>
            </>
          )}
          {error && !proposal && (
            <Button variant="ghost" size="sm" onClick={discard}>
              关闭提示
            </Button>
          )}
        </div>
      )}
    </>
  );
}
