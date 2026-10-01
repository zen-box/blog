"use client";

import type { EditorView } from "@codemirror/view";
import { CheckIcon, LoaderCircleIcon, RotateCcwIcon, SparklesIcon, XIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { type AiMetadata, parseMetadata } from "@/lib/ai-text";
import { cn } from "@/lib/utils";
import type { EditorPost } from "@/server/admin";

import { streamAi } from "./ai-client";

export type MetaField = keyof AiMetadata;
type MetaState =
  | { status: "idle" }
  | { status: "busy" }
  | { status: "error"; error: string }
  | { status: "done"; data: AiMetadata; source: string; title: string };

/** AI 根据正文建议链接、分类、标签、摘要和 SEO 描述；建议显示在文章设置里，逐项采用 */
export function useAiMetadata({
  post,
  viewRef,
  categories,
  update,
}: {
  post: EditorPost;
  viewRef: React.RefObject<EditorView | null>;
  categories: { id: number; name: string }[];
  update: (patch: Partial<EditorPost>) => void;
}) {
  const [state, setState] = useState<MetaState>({ status: "idle" });
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);

  async function run() {
    const source = viewRef.current?.state.doc.toString() ?? post.content;
    if (!source.trim()) {
      toast.error("先写一些正文吧");
      return;
    }
    controller.current?.abort();
    const ctrl = new AbortController();
    controller.current = ctrl;
    setState({ status: "busy" });
    try {
      const raw = await streamAi(
        { task: "metadata", title: post.title, content: source, instruction: "", context: "" },
        ctrl.signal,
        () => {},
      );
      if (ctrl.signal.aborted) return;
      setState({
        status: "done",
        data: parseMetadata(raw, categories),
        source,
        title: post.title,
      });
    } catch (e) {
      if (!ctrl.signal.aborted) setState({ status: "error", error: (e as Error).message });
    }
  }

  function apply(fields: MetaField[]) {
    if (state.status !== "done") return;
    const current = viewRef.current?.state.doc.toString() ?? post.content;
    if (current !== state.source || post.title !== state.title) {
      setState({ status: "idle" });
      toast.error("正文或标题已变化，请重新生成建议");
      return;
    }
    const patch: Partial<EditorPost> = {};
    for (const field of fields) Object.assign(patch, { [field]: state.data[field] });
    update(patch);
  }

  function clear() {
    controller.current?.abort();
    setState({ status: "idle" });
  }

  return { state, run, apply, clear };
}
export type AiMetadataState = ReturnType<typeof useAiMetadata>;

/** 某个字段当前的值是否已经和建议一致 */
export function isApplied(post: EditorPost, data: AiMetadata, field: MetaField) {
  if (field === "tags")
    return JSON.stringify([...post.tags].sort()) === JSON.stringify([...data.tags].sort());
  return post[field] === data[field];
}

/** 文章设置顶部的 AI 入口 */
export function AiMetadataCard({
  meta,
  fields,
  post,
}: {
  meta: AiMetadataState;
  fields: MetaField[];
  post: EditorPost;
}) {
  const { state } = meta;
  const pending =
    state.status === "done" ? fields.filter((field) => !isApplied(post, state.data, field)) : [];
  return (
    <div className="rounded-xl border border-border bg-linear-to-br from-brand-soft/70 via-card to-card p-3.5">
      <div className="flex items-start gap-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-border/70 bg-card text-brand">
          {state.status === "busy" ? (
            <LoaderCircleIcon className="size-4 animate-spin" />
          ) : (
            <SparklesIcon className="size-4" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">让 AI 帮你填写</p>
          <p
            role={state.status === "error" ? "alert" : "status"}
            className={cn(
              "mt-0.5 text-xs leading-relaxed",
              state.status === "error" ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {state.status === "idle" &&
              (fields.includes("excerpt")
                ? "读一遍正文，建议链接、分类、标签、摘要和 SEO 描述。"
                : "读一遍正文，建议链接和 SEO 描述。")}
            {state.status === "busy" && "AI 正在读全文，通常十几秒就好…"}
            {state.status === "error" && state.error}
            {state.status === "done" &&
              (pending.length
                ? `建议已放在对应的输入框下面，还有 ${pending.length} 项没采用。`
                : "建议都已采用，记得保存文章。")}
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-end gap-1.5">
        {state.status === "idle" && (
          <Button size="sm" onClick={() => void meta.run()}>
            <SparklesIcon />
            生成建议
          </Button>
        )}
        {state.status === "busy" && (
          <Button size="sm" variant="ghost" onClick={meta.clear}>
            取消
          </Button>
        )}
        {state.status === "error" && (
          <Button size="sm" variant="outline" onClick={() => void meta.run()}>
            <RotateCcwIcon />
            重试
          </Button>
        )}
        {state.status === "done" && (
          <>
            <Button size="sm" variant="ghost" onClick={meta.clear}>
              <XIcon />
              清除
            </Button>
            <Button size="sm" variant="ghost" onClick={() => void meta.run()}>
              <RotateCcwIcon />
              重新生成
            </Button>
            <Button size="sm" disabled={!pending.length} onClick={() => meta.apply(pending)}>
              <CheckIcon />
              全部采用
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

/** 字段下方的一条建议 */
export function MetaSuggestion({
  applied,
  onApply,
  mono,
  children,
}: {
  applied: boolean;
  onApply: () => void;
  mono?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-lg border border-dashed px-2.5 py-2 text-xs leading-relaxed transition-colors",
        applied ? "border-border text-muted-foreground" : "border-brand/35 bg-brand-soft/40",
      )}
    >
      <SparklesIcon aria-hidden className="mt-[3px] size-3.5 shrink-0 text-brand" />
      <div
        className={cn(
          "min-w-0 flex-1 break-words",
          applied ? "text-muted-foreground" : "text-foreground/90",
          mono && "font-mono",
        )}
      >
        {children}
      </div>
      {applied ? (
        <span className="inline-flex shrink-0 items-center gap-1 text-subtle">
          <CheckIcon className="size-3" />
          已采用
        </span>
      ) : (
        <button
          type="button"
          onClick={onApply}
          className="-my-0.5 shrink-0 rounded-md px-1.5 py-0.5 font-medium text-brand transition-colors hover:bg-brand/10"
        >
          采用
        </button>
      )}
    </div>
  );
}
