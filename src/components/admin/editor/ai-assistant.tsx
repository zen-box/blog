"use client";

import { isolateHistory } from "@codemirror/commands";
import type { EditorView } from "@codemirror/view";
import { Command as CommandPrimitive } from "cmdk";
import {
  BookOpenTextIcon,
  BriefcaseIcon,
  CornerDownLeftIcon,
  EllipsisIcon,
  FoldVerticalIcon,
  LanguagesIcon,
  LoaderCircleIcon,
  type LucideIcon,
  MessageCircleIcon,
  PilcrowIcon,
  RotateCcwIcon,
  SparklesIcon,
  SpellCheck2Icon,
  SpellCheckIcon,
  TagsIcon,
  TriangleAlertIcon,
  UnfoldVerticalIcon,
  WandSparklesIcon,
  XIcon,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";

import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command";
import { Kbd } from "@/components/ui/kbd";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  type ProtectedText,
  protectText,
  restoreProtected,
  sectionChanges,
  type SectionChange,
  unwrapMarkdown,
} from "@/lib/ai-text";
import { diffStats, readableDiff } from "@/lib/text-diff";
import { cn } from "@/lib/utils";
import type { EditorPost } from "@/server/admin";

import { streamAi } from "./ai-client";
import { showInlineSuggestion } from "./ai-inline";
import { Delta } from "./text-diff";

const EASE = [0.16, 1, 0.3, 1] as const;

type Action = { label: string; hint: string; icon: LucideIcon };
const REWRITES: Action[] = [
  { label: "润色", hint: "更通顺自然", icon: WandSparklesIcon },
  { label: "精简", hint: "删掉冗余", icon: FoldVerticalIcon },
  { label: "扩写", hint: "补充细节", icon: UnfoldVerticalIcon },
  { label: "改口语", hint: "像聊天一样", icon: MessageCircleIcon },
  { label: "改正式", hint: "更书面", icon: BriefcaseIcon },
  { label: "纠错", hint: "错字与标点", icon: SpellCheckIcon },
  { label: "翻译", hint: "中英互译", icon: LanguagesIcon },
];
/** 划词后浮层里直接给出的几个 */
const QUICK = ["润色", "精简", "扩写", "纠错"];

export type DocTask = "format" | "proofread" | "polish";
export const DOC_TASKS: Record<DocTask, Action> = {
  polish: { label: "全文润色", hint: "逐节给出修改建议", icon: WandSparklesIcon },
  proofread: { label: "全文校对", hint: "错别字、标点和语病", icon: SpellCheck2Icon },
  format: { label: "AI 排版", hint: "只整理 Markdown 格式", icon: PilcrowIcon },
};
const DOC_ORDER: DocTask[] = ["polish", "proofread", "format"];

type Task = "rewrite" | DocTask;
type Range = { from: number; to: number };
type AiJob = Range & { task: Task; command: string; source: string };
type Proposal = Range & {
  task: Task;
  source: string;
  title: string;
  before: string;
  after: string;
  instruction: string;
  sections: SectionChange[];
};

const KEEP = "__BLOG_AI_KEEP_";
/** 生成中的文字：占位符换回原文，末尾半截的占位符先不显示 */
function readable(value: string, pieces: ProtectedText["pieces"]) {
  let text = value.replace(
    /__BLOG_AI_KEEP_(\d+)__/g,
    (token, i) => pieces[Number(i)]?.source ?? token,
  );
  for (let i = Math.max(0, text.length - KEEP.length - 8); i < text.length; i++) {
    const rest = text.slice(i);
    if (rest.startsWith("__") && (KEEP.startsWith(rest) || /^__BLOG_AI_KEEP_\d*_?$/.test(rest))) {
      text = text.slice(0, i);
      break;
    }
  }
  return text;
}

/** 划词改写的动作名：预设按钮直接显示，自定义要求统一叫「按要求改写」 */
const rewriteLabel = (command: string) =>
  REWRITES.some((item) => item.label === command) ? command : "按要求改写";

const subscribeNothing = () => () => {};
/** ⌘ 或 Ctrl；服务端渲染时先按 Ctrl，注水后再换 */
function useModKey() {
  return useSyncExternalStore(
    subscribeNothing,
    () => (/Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl"),
    () => "Ctrl",
  );
}

/**
 * 编辑器 AI：划词改写在正文里原地预览，整篇任务按小节审阅。
 * 建议只是预览，接受前不修改正文；整篇修改应用前先存一份历史快照。
 */
export function useAiAssistant({
  post,
  viewRef,
  onPreview,
  snapshot,
  onDocStart,
}: {
  post: EditorPost;
  viewRef: React.RefObject<EditorView | null>;
  onPreview: (markdown: string | null) => void;
  snapshot: () => Promise<void>;
  /** 整篇任务开始时调用，用来打开审阅面板 */
  onDocStart?: () => void;
}) {
  const [job, setJob] = useState<AiJob | null>(null);
  const [busy, setBusy] = useState(false);
  const [applying, setApplying] = useState(false);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [stream, setStream] = useState("");
  const [ignored, setIgnored] = useState<number[]>([]);
  const [error, setError] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const serial = useRef(0);
  const active = useRef<{
    cancel: () => void;
    accept: () => void;
    proposal: Proposal | null;
    busy: boolean;
    /** 正在进行划词改写（生成中、待接受或出错） */
    rewriting: boolean;
    menuOpen: boolean;
  }>({
    cancel: () => {},
    accept: () => {},
    proposal: null,
    busy: false,
    rewriting: false,
    menuOpen: false,
  });

  function discard() {
    serial.current++;
    controller.current?.abort();
    setBusy(false);
    setProposal(null);
    setStream("");
    setError("");
    setJob(null);
    onPreview(null);
    const view = viewRef.current;
    if (view) showInlineSuggestion(view, null);
  }

  async function generate(task: Task, command = "") {
    const view = viewRef.current;
    if (!view && task === "rewrite") return;
    const source = view?.state.doc.toString() ?? post.content;
    const { from, to } =
      task === "rewrite" ? view!.state.selection.main : { from: 0, to: source.length };
    const range = { from, to };
    if (task === "rewrite" && range.from === range.to) {
      toast.error("先选中要改写的文字");
      return;
    }
    if (!source.trim()) {
      toast.error("先写一些正文吧");
      return;
    }
    discard();
    setMenuOpen(false);
    setBusy(true);
    setIgnored([]);
    setJob({ task, command, from: range.from, to: range.to, source });
    if (task !== "rewrite") onDocStart?.();
    const ticket = serial.current,
      ctrl = new AbortController();
    controller.current = ctrl;
    const before = source.slice(range.from, range.to);
    // 收起选区，正文里原地显示的差异才看得清；放弃时再恢复
    if (task === "rewrite") view!.dispatch({ selection: { anchor: range.to } });
    try {
      const protectedText = protectText(before);
      // 含受保护内容（代码、公式等）时流式文字里是占位符，不在正文里实时预览
      const live = (after: string) => {
        if (
          task === "rewrite" &&
          protectedText.pieces.length === 0 &&
          view &&
          view.state.doc.toString() === source
        )
          showInlineSuggestion(view, { ...range, before, after, streaming: true });
      };
      live("");
      const context =
        task === "rewrite"
          ? source.slice(Math.max(0, range.from - 1200), range.from) +
            "\n[所选文字]\n" +
            source.slice(range.to, range.to + 1200)
          : "";
      const raw = await streamAi(
        { task, title: post.title, content: protectedText.text, instruction: command, context },
        ctrl.signal,
        (value) => {
          if (ticket !== serial.current) return;
          setStream(readable(value, protectedText.pieces));
          live(value);
        },
      );
      if (ticket !== serial.current) return;
      const after = restoreProtected(unwrapMarkdown(raw), protectedText);
      setProposal({
        task,
        source,
        title: post.title,
        before,
        after,
        from: range.from,
        to: range.to,
        instruction: command,
        sections: task === "rewrite" ? [] : sectionChanges(source, after),
      });
      setStream("");
      if (task === "rewrite" && view && view.state.doc.toString() === source)
        showInlineSuggestion(view, { from: range.from, to: range.to, before, after });
      if (task !== "rewrite") onPreview(after);
    } catch (e) {
      if (ticket !== serial.current || ctrl.signal.aborted) return;
      setError((e as Error).message);
      onPreview(null);
      if (view)
        showInlineSuggestion(
          view,
          task === "rewrite" && view.state.doc.toString() === source
            ? { ...range, before, after: "", anchorOnly: true }
            : null,
        );
    } finally {
      if (ticket === serial.current) setBusy(false);
    }
  }

  /** 用户主动放弃：划词改写恢复原来的选区，方便换个说法再试 */
  function cancel() {
    const current = job;
    discard();
    const view = viewRef.current;
    if (current?.task === "rewrite" && view && view.state.doc.toString() === current.source) {
      view.dispatch({ selection: { anchor: current.from, head: current.to } });
      view.focus();
    }
  }

  /** 用同样的要求再来一次；划词改写会先恢复原来的选区 */
  function retry() {
    if (!job) return;
    const view = viewRef.current;
    if (job.task === "rewrite" && view) {
      if (view.state.doc.toString() !== job.source) {
        discard();
        toast.error("正文已变化，请重新选择文字");
        return;
      }
      view.dispatch({ selection: { anchor: job.from, head: job.to } });
    }
    void generate(job.task, job.command);
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
      toast.success("已应用建议", { description: "不满意可以按 Ctrl/⌘ + Z 撤销" });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setApplying(false);
    }
  }

  useEffect(() => {
    active.current = {
      cancel,
      accept: () => void apply(),
      proposal,
      busy,
      rewriting: job?.task === "rewrite",
      menuOpen,
    };
  });
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.isComposing) return;
      const current = active.current;
      const dialog = document.querySelector('[role="dialog"]');
      if (
        (event.ctrlKey || event.metaKey) &&
        !event.shiftKey &&
        !event.altKey &&
        event.key.toLowerCase() === "j"
      ) {
        if (current.menuOpen) event.preventDefault();
        if (dialog) return;
        event.preventDefault();
        setMenuOpen(true);
        return;
      }
      if (dialog) return;
      // 只在正文或建议条上响应，免得在别的输入框里按 Tab / Esc 误操作
      const focus = document.activeElement;
      if (
        focus &&
        focus !== document.body &&
        !viewRef.current?.dom.contains(focus) &&
        !focus.closest("[data-ai-bar]")
      )
        return;
      if (event.key === "Escape" && (current.busy || current.rewriting)) {
        event.preventDefault();
        event.stopPropagation();
        current.cancel();
      }
      if (
        event.key === "Tab" &&
        !event.shiftKey &&
        current.proposal?.task === "rewrite" &&
        !current.busy
      ) {
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
  }, [viewRef]);

  return {
    job,
    busy,
    applying,
    proposal,
    stream,
    ignored,
    error,
    menuOpen,
    setMenuOpen,
    generate,
    retry,
    apply,
    discard,
    cancel,
    ignore: (index: number) => setIgnored((list) => [...list, index]),
  };
}
export type AiAssistant = ReturnType<typeof useAiAssistant>;

type MenuExtras = {
  /** 页面没有「读者 AI」 */
  isPost: boolean;
  onMetadata: () => void;
  onReaderAi: () => void;
};

type Item = Action & { value: string; run: () => void; keywords?: string };
function matches(item: Item, query: string) {
  return !query || `${item.label} ${item.hint} ${item.keywords ?? ""}`.includes(query);
}

/** AI 命令菜单：顶部输入框既是搜索，也能直接写改写要求 */
function AiCommandMenu({
  ai,
  selection,
  isPost,
  onMetadata,
  onReaderAi,
  onDone,
}: MenuExtras & {
  ai: AiAssistant;
  selection: Range | null;
  onDone: () => void;
}) {
  const mod = useModKey();
  const [query, setQuery] = useState("");
  const instruction = query.trim();
  const rewrite: Item[] = selection
    ? REWRITES.map((item) => ({
        ...item,
        value: `rewrite-${item.label}`,
        run: () => void ai.generate("rewrite", item.label),
      }))
    : [];
  const doc: Item[] = DOC_ORDER.map((task) => ({
    ...DOC_TASKS[task],
    value: `doc-${task}`,
    keywords: "整篇 全文",
    run: () => void ai.generate(task),
  }));
  const info: Item[] = [
    {
      label: isPost ? "生成摘要、标签和链接" : "生成链接和 SEO 描述",
      hint: isPost ? "填进文章设置" : "填进页面设置",
      icon: TagsIcon,
      value: "metadata",
      keywords: "文章信息 SEO 分类 slug",
      run: onMetadata,
    },
    ...(isPost
      ? [
          {
            label: "读者看到的 AI 摘要",
            hint: "摘要与测评速览",
            icon: BookOpenTextIcon,
            value: "reader-ai",
            keywords: "读者 测评",
            run: onReaderAi,
          },
        ]
      : []),
  ];
  const all = [
    { heading: selection ? `改写选中的 ${selection.to - selection.from} 字` : "", items: rewrite },
    { heading: "整篇文章", items: doc },
    { heading: "文章信息", items: info },
  ];
  const filter = (text: string) =>
    all.map((group) => ({ ...group, items: group.items.filter((item) => matches(item, text)) }));
  const firstFor = (text: string) =>
    text ? "custom" : (filter(text).find((group) => group.items.length)?.items[0].value ?? "");
  const groups = filter(instruction);
  const [value, setValue] = useState(() => firstFor(""));
  const run = (fn: () => void) => () => {
    onDone();
    fn();
  };

  return (
    <Command
      shouldFilter={false}
      loop
      value={value}
      onValueChange={setValue}
      className="rounded-none! bg-transparent p-0"
    >
      <div className="flex items-center gap-2.5 border-b border-border px-3.5">
        <SparklesIcon className="size-4 shrink-0 text-brand" aria-hidden />
        <CommandPrimitive.Input
          autoFocus
          value={query}
          onValueChange={(next) => {
            setQuery(next);
            setValue(firstFor(next.trim()));
          }}
          placeholder={selection ? "告诉 AI 怎么改这段文字…" : "搜索 AI 操作…"}
          className="h-11 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-subtle"
        />
      </div>
      <CommandList className="max-h-[min(31rem,68vh)] p-1.5" data-lenis-prevent>
        {instruction && (
          <CommandGroup>
            <CommandItem
              value="custom"
              disabled={!selection}
              onSelect={run(() => void ai.generate("rewrite", instruction))}
              className="rounded-lg px-2.5 py-[0.4375rem]"
            >
              <CornerDownLeftIcon className="text-brand" />
              <span className="min-w-0 truncate">
                {selection
                  ? `按要求改写：${instruction}`
                  : "先在正文里选中文字，再让 AI 按要求改写"}
              </span>
            </CommandItem>
          </CommandGroup>
        )}
        {!selection && !instruction && (
          <p className="mx-1.5 mt-1 mb-1 rounded-lg bg-muted/60 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
            在正文里选中一段文字，就能让 AI 润色、精简、扩写或翻译。
          </p>
        )}
        {groups.map(
          (group) =>
            group.items.length > 0 && (
              <CommandGroup key={group.heading || "rewrite"} heading={group.heading || undefined}>
                {group.items.map((item) => (
                  <CommandItem
                    key={item.value}
                    value={item.value}
                    onSelect={run(item.run)}
                    className="rounded-lg px-2.5 py-[0.4375rem]"
                  >
                    <item.icon className="text-muted-foreground" />
                    {item.label}
                    <CommandShortcut className="tracking-normal text-subtle">
                      {item.hint}
                    </CommandShortcut>
                  </CommandItem>
                ))}
              </CommandGroup>
            ),
        )}
      </CommandList>
      <div className="flex items-center gap-3 border-t border-border px-3.5 py-2 text-[11px] text-subtle pointer-coarse:hidden">
        <span className="inline-flex items-center gap-1">
          <Kbd>↵</Kbd>执行
        </span>
        <span className="inline-flex items-center gap-1">
          <Kbd>Esc</Kbd>关闭
        </span>
        <span className="ml-auto inline-flex items-center gap-1">
          <Kbd>{mod}</Kbd>
          <Kbd>J</Kbd>
          随时打开
        </span>
      </div>
    </Command>
  );
}

/** 工具栏右侧的 AI 入口 */
export function AiMenuButton({
  ai,
  viewRef,
  selection,
  ...extras
}: MenuExtras & {
  ai: AiAssistant;
  viewRef: React.RefObject<EditorView | null>;
  selection: Range | null;
}) {
  const mod = useModKey();
  return (
    <Popover open={ai.menuOpen} onOpenChange={ai.setMenuOpen}>
      <Tooltip>
        <TooltipTrigger
          render={
            <PopoverTrigger
              render={
                <button
                  type="button"
                  aria-label="AI 写作助手"
                  onMouseDown={(e) => e.preventDefault()}
                  className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-brand transition-colors hover:bg-brand-soft data-popup-open:bg-brand-soft"
                />
              }
            />
          }
        >
          {ai.busy ? (
            <LoaderCircleIcon className="size-4 animate-spin" />
          ) : (
            <SparklesIcon className="size-4" />
          )}
          AI
        </TooltipTrigger>
        <TooltipContent>
          AI 写作助手<span className="ml-2 opacity-60">{mod} + J</span>
        </TooltipContent>
      </Tooltip>
      <PopoverContent
        align="end"
        sideOffset={6}
        finalFocus={() => viewRef.current?.contentDOM ?? true}
        className="w-[22rem] max-w-[calc(100vw-1rem)] gap-0 overflow-hidden p-0"
      >
        <AiCommandMenu
          ai={ai}
          selection={selection}
          {...extras}
          onDone={() => ai.setMenuOpen(false)}
        />
      </PopoverContent>
    </Popover>
  );
}

/** 选中文字后浮在选区上方的快捷改写 */
export function AiSelectionBubble({
  ai,
  viewRef,
  selection,
  ...extras
}: MenuExtras & {
  ai: AiAssistant;
  viewRef: React.RefObject<EditorView | null>;
  selection: Range | null;
}) {
  const key = selection ? `${selection.from}-${selection.to}` : "";
  // 选区停稳（松开鼠标、键盘选择停顿）之后才出现，拖选过程中不打扰
  const [settled, setSettled] = useState("");
  const [focused, setFocused] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const bubble = useRef<HTMLDivElement>(null);
  const pointerDown = useRef(false);

  useEffect(() => {
    if (!key) return;
    const timer = setTimeout(() => {
      if (!pointerDown.current) setSettled(key);
    }, 220);
    return () => clearTimeout(timer);
  }, [key]);

  useEffect(() => {
    const down = () => {
      pointerDown.current = true;
    };
    const up = () => {
      pointerDown.current = false;
      const range = viewRef.current?.state.selection.main;
      if (range && !range.empty) setSettled(`${range.from}-${range.to}`);
    };
    const focus = () => setFocused(!!viewRef.current?.dom.contains(document.activeElement));
    document.addEventListener("pointerdown", down, true);
    document.addEventListener("pointerup", up, true);
    document.addEventListener("focusin", focus);
    return () => {
      document.removeEventListener("pointerdown", down, true);
      document.removeEventListener("pointerup", up, true);
      document.removeEventListener("focusin", focus);
    };
  }, [viewRef]);

  const show = !!selection && settled === key && (focused || moreOpen) && !ai.job && !ai.menuOpen;

  useEffect(() => {
    if (!show || !selection) return;
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const view = viewRef.current;
        const start = view?.coordsAtPos(selection.from);
        const end = view?.coordsAtPos(selection.to);
        const anchor = start ?? end;
        if (!anchor) {
          setPos(null);
          return;
        }
        const width = bubble.current?.offsetWidth ?? 280,
          height = bubble.current?.offsetHeight ?? 38;
        // 触屏把位置让给系统的复制菜单
        const limit = toolbarBottom() + 6;
        const below =
          !start || matchMedia("(pointer: coarse)").matches || start.top - height - 8 < limit;
        const top = below ? (end ?? anchor).bottom + 10 : start.top - height - 8;
        const sameLine = start && end && Math.abs(start.top - end.top) < 4;
        const left = sameLine ? (start.left + end.left) / 2 - width / 2 : anchor.left;
        setPos(
          top < limit || top > innerHeight - height
            ? null
            : { left: Math.min(Math.max(8, left), innerWidth - width - 8), top },
        );
      });
    };
    measure();
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [show, selection, viewRef]);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          ref={bubble}
          role="toolbar"
          aria-label="AI 改写选中的文字"
          initial={{ opacity: 0, y: 4, scale: 0.98 }}
          animate={{ opacity: pos ? 1 : 0, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 4, scale: 0.98, transition: { duration: 0.12 } }}
          transition={{ duration: 0.22, ease: EASE }}
          style={pos ?? { left: -9999, top: -9999 }}
          onMouseDown={(e) => e.preventDefault()}
          className="fixed z-40 flex items-center gap-0.5 rounded-full border border-border/80 bg-popover/95 p-1 text-xs shadow-float backdrop-blur-md"
        >
          <SparklesIcon aria-hidden className="mr-0.5 ml-1.5 size-3.5 text-brand" />
          {QUICK.map((label) => (
            <button
              key={label}
              type="button"
              onClick={() => void ai.generate("rewrite", label)}
              className="h-7 rounded-full px-2.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {label}
            </button>
          ))}
          <span aria-hidden className="mx-0.5 h-4 w-px bg-border" />
          <Popover open={moreOpen} onOpenChange={setMoreOpen}>
            <PopoverTrigger
              render={
                <button
                  type="button"
                  aria-label="更多 AI 操作"
                  className="grid size-7 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground data-popup-open:bg-muted data-popup-open:text-foreground"
                />
              }
            >
              <EllipsisIcon className="size-4" />
            </PopoverTrigger>
            <PopoverContent
              align="start"
              sideOffset={8}
              finalFocus={() => viewRef.current?.contentDOM ?? true}
              className="w-[22rem] max-w-[calc(100vw-1rem)] gap-0 overflow-hidden p-0"
            >
              <AiCommandMenu
                ai={ai}
                selection={selection}
                {...extras}
                onDone={() => setMoreOpen(false)}
              />
            </PopoverContent>
          </Popover>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** 与 .cm-ai-anchor 的 padding-bottom 一致 */
const ANCHOR_SPACE = 44;
/** 编辑器吸顶工具栏的下沿，浮层不要盖住它 */
const toolbarBottom = () =>
  Math.max(
    56,
    document.querySelector("[data-editor-toolbar]")?.getBoundingClientRect().bottom ?? 0,
  );

const barButton =
  "inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground";

/** 划词改写的状态条：贴在建议文字下方，生成中可停止，生成后接受、重试或放弃 */
export function AiRewriteBar({
  ai,
  viewRef,
}: {
  ai: AiAssistant;
  viewRef: React.RefObject<EditorView | null>;
}) {
  const job = ai.job?.task === "rewrite" ? ai.job : null;
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const bar = useRef<HTMLDivElement>(null);
  const proposal = ai.proposal?.task === "rewrite" ? ai.proposal : null;
  const stats = useMemo(
    () => (proposal ? diffStats(readableDiff(proposal.before, proposal.after)) : null),
    [proposal],
  );

  useEffect(() => {
    if (!job) return;
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const view = viewRef.current;
        if (!view) return;
        // 段落下方留好的空白（.cm-ai-anchor 的 padding-bottom）
        const line = view.dom.querySelector(".cm-ai-anchor");
        const top = line
          ? line.getBoundingClientRect().bottom - ANCHOR_SPACE + 4
          : (view.coordsAtPos(Math.min(job.to, view.state.doc.length))?.bottom ?? innerHeight) + 8;
        const width = bar.current?.offsetWidth ?? 320;
        const left = view.contentDOM.getBoundingClientRect().left;
        setPos({
          left: Math.min(Math.max(8, left), innerWidth - width - 8),
          top: Math.min(Math.max(top, toolbarBottom() + 6), innerHeight - 52),
        });
      });
    };
    measure();
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [job, ai.stream, ai.proposal, ai.error, viewRef]);

  const label = job ? rewriteLabel(job.command) : "";
  return (
    <AnimatePresence>
      {job && (
        <motion.div
          key="ai-bar"
          ref={bar}
          data-ai-bar
          role="toolbar"
          aria-label="AI 改写建议"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: pos ? 1 : 0, y: 0 }}
          exit={{ opacity: 0, y: 6, transition: { duration: 0.15 } }}
          transition={{ duration: 0.28, ease: EASE }}
          style={pos ?? { left: -9999, top: -9999 }}
          onMouseDown={(e) => e.preventDefault()}
          className="fixed z-40 flex max-w-[calc(100vw-1rem)] items-center gap-1 rounded-full border border-border/80 bg-popover/95 py-1 pr-1 pl-3 text-xs shadow-float backdrop-blur-md"
        >
          {ai.error ? (
            <>
              <TriangleAlertIcon className="size-3.5 shrink-0 text-destructive" />
              <span
                role="alert"
                className="max-w-[26rem] truncate text-destructive"
                title={ai.error}
              >
                {ai.error}
              </span>
              <button type="button" onClick={ai.retry} className={cn(barButton, "ml-1")}>
                <RotateCcwIcon className="size-3.5" />
                重试
              </button>
              <button
                type="button"
                onClick={ai.cancel}
                aria-label="关闭"
                className={cn(barButton, "size-7 justify-center px-0")}
              >
                <XIcon className="size-3.5" />
              </button>
            </>
          ) : ai.busy ? (
            <>
              <LoaderCircleIcon className="size-3.5 animate-spin text-brand" />
              <span role="status" className="text-muted-foreground">
                AI 正在{label}…
              </span>
              {ai.stream && (
                <span className="font-mono text-[11px] text-subtle tabular-nums">
                  {ai.stream.length} 字
                </span>
              )}
              <button type="button" onClick={ai.cancel} className={cn(barButton, "ml-1")}>
                停止
                <Kbd className="pointer-coarse:hidden">Esc</Kbd>
              </button>
            </>
          ) : proposal ? (
            <>
              <SparklesIcon className="size-3.5 text-brand" />
              <span className="font-medium text-foreground">{label}</span>
              {stats && <Delta {...stats} />}
              <span aria-hidden className="mx-1 h-4 w-px bg-border" />
              <button
                type="button"
                onClick={() => void ai.apply()}
                disabled={ai.applying}
                className="inline-flex h-7 items-center gap-1.5 rounded-full bg-foreground pr-1.5 pl-3 text-background transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                接受
                <Kbd className="bg-background/15 text-background/80 pointer-coarse:hidden">Tab</Kbd>
              </button>
              <button
                type="button"
                onClick={ai.retry}
                aria-label="重新生成"
                title="重新生成"
                className={cn(barButton, "size-7 justify-center px-0")}
              >
                <RotateCcwIcon className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={ai.cancel}
                aria-label="放弃建议"
                title="放弃（Esc）"
                className={cn(barButton, "size-7 justify-center px-0")}
              >
                <XIcon className="size-3.5" />
              </button>
            </>
          ) : null}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
