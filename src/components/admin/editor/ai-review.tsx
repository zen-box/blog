"use client";

import {
  CheckIcon,
  CircleCheckIcon,
  LoaderCircleIcon,
  RotateCcwIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { proseText } from "@/lib/ai-text";
import { blockStats, paragraphDiff } from "@/lib/text-diff";
import { cn } from "@/lib/utils";

import { type AiAssistant, DOC_TASKS, type DocTask } from "./ai-assistant";
import { Delta, TextDiffView } from "./text-diff";

const EASE = [0.16, 1, 0.3, 1] as const;
const TABS = [
  { key: "changes", label: "逐节修改" },
  { key: "preview", label: "预览全文" },
] as const;

function Streaming({ text }: { text: string }) {
  if (!text)
    return (
      <div className="space-y-3 px-5 py-6" aria-hidden>
        {["w-11/12", "w-full", "w-4/5", "w-full", "w-2/3"].map((width, i) => (
          <Skeleton key={i} className={cn("h-3.5", width)} />
        ))}
      </div>
    );
  return (
    <p className="px-5 py-5 text-[13.5px] leading-[1.8] break-words whitespace-pre-wrap text-muted-foreground">
      {text}
      <span aria-hidden className="cm-ai-stream" />
    </p>
  );
}

function Centered({ icon, title, note }: { icon: React.ReactNode; title: string; note?: string }) {
  return (
    <div className="grid h-full min-h-56 place-items-center px-8 text-center">
      <div>
        {icon}
        <p className="mt-3 text-sm text-foreground">{title}</p>
        {note && <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{note}</p>}
      </div>
    </div>
  );
}

/** 整篇任务（润色、校对、排版）的审阅面板：逐节接受或忽略，也可以预览修改后的全文 */
export function AiReview({ ai, preview }: { ai: AiAssistant; preview: React.ReactNode }) {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("changes");
  const body = useRef<HTMLDivElement>(null);
  const proposal = ai.proposal;
  const sections = useMemo(
    () =>
      proposal?.sections.map((section, index) => {
        const blocks = paragraphDiff(section.before, section.after);
        return { ...section, index, blocks, stats: blockStats(blocks) };
      }) ?? [],
    [proposal],
  );
  // 生成过程中跟着新文字滚动；生成完回到顶部从第一处修改看起
  const wasBusy = useRef(false);
  useEffect(() => {
    const el = body.current;
    if (el && ai.busy) el.scrollTop = el.scrollHeight;
    else if (el && wasBusy.current) el.scrollTop = 0;
    wasBusy.current = ai.busy;
  }, [ai.busy, ai.stream]);

  const job = ai.job;
  if (!job || job.task === "rewrite") return null;
  const meta = DOC_TASKS[job.task as DocTask];
  const visible = sections.filter((section) => !ai.ignored.includes(section.index));
  const totals = visible.reduce(
    (sum, section) => ({
      added: sum.added + section.stats.added,
      removed: sum.removed + section.stats.removed,
    }),
    { added: 0, removed: 0 },
  );
  const textChanged =
    job.task === "format" && !!proposal && proseText(proposal.before) !== proseText(proposal.after);
  const reviewing = !ai.busy && !ai.error && !!proposal && sections.length > 0;

  return (
    <div className="flex h-full min-h-0 flex-col" data-ai-review>
      <header className="flex items-center gap-3 border-b border-border/70 px-5 py-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
          <meta.icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-medium text-foreground">{meta.label}</h2>
          <p role="status" className="mt-0.5 truncate text-xs text-muted-foreground">
            {ai.busy ? (
              `AI 正在通读全文${ai.stream ? ` · 已写 ${ai.stream.length.toLocaleString("zh-CN")} 字` : "…"}`
            ) : ai.error ? (
              "没能生成建议"
            ) : reviewing ? (
              <>
                {visible.length} 处修改 · <Delta {...totals} /> 字
              </>
            ) : proposal ? (
              "没有需要修改的地方"
            ) : null}
          </p>
        </div>
        {reviewing && (
          <div className="flex shrink-0 rounded-lg border border-border p-0.5 text-xs">
            {TABS.map((item) => (
              <button
                key={item.key}
                type="button"
                aria-pressed={tab === item.key}
                onClick={() => {
                  setTab(item.key);
                  body.current?.scrollTo({ top: 0 });
                }}
                className={cn(
                  "relative h-6 rounded-md px-2.5 transition-colors",
                  tab === item.key
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {tab === item.key && (
                  <motion.span
                    layoutId="ai-review-tab"
                    className="absolute inset-0 rounded-md bg-muted"
                    transition={{ type: "spring", stiffness: 500, damping: 40 }}
                  />
                )}
                <span className="relative">{item.label}</span>
              </button>
            ))}
          </div>
        )}
      </header>

      <div ref={body} className="min-h-0 flex-1 overflow-y-auto" data-lenis-prevent>
        {ai.busy ? (
          <Streaming text={ai.stream} />
        ) : ai.error ? (
          <Centered
            icon={<TriangleAlertIcon className="mx-auto size-5 text-destructive" />}
            title={ai.error}
          />
        ) : !proposal ? null : !sections.length ? (
          <Centered
            icon={<CircleCheckIcon className="mx-auto size-5 text-(--diff-add)" />}
            title="没有需要修改的地方"
            note="AI 通读了全文，没有找到要改的。"
          />
        ) : tab === "preview" ? (
          <div className="px-6 pt-5 pb-16">
            <p className="mb-6 rounded-lg bg-brand-soft/60 px-3 py-2 text-xs text-brand">
              这是接受全部修改后的样子，正文还没有改动。
            </p>
            {preview}
          </div>
        ) : (
          <div className="space-y-4 px-5 py-5">
            {textChanged && (
              <div
                role="alert"
                className="flex gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/8 px-3.5 py-2.5 text-xs leading-relaxed text-amber-800 dark:text-amber-300"
              >
                <TriangleAlertIcon className="mt-0.5 size-3.5 shrink-0" />
                AI 排版时改动了文字本身，不只是格式。请逐处核对后再决定是否接受。
              </div>
            )}
            <AnimatePresence initial={false}>
              {visible.map((section) => (
                <motion.article
                  key={section.index}
                  layout
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, height: 0, marginTop: 0, transition: { duration: 0.25 } }}
                  transition={{ duration: 0.3, ease: EASE }}
                  className="overflow-hidden rounded-xl border border-border bg-card"
                  aria-label={`${section.title}的修改`}
                >
                  <header className="flex items-center gap-2.5 border-b border-border/60 py-2 pr-2 pl-4">
                    <span className="min-w-0 truncate text-sm font-medium">{section.title}</span>
                    <Delta {...section.stats} />
                    <div className="ml-auto flex shrink-0 items-center gap-1">
                      <Button variant="ghost" size="xs" onClick={() => ai.ignore(section.index)}>
                        忽略
                      </Button>
                      <Button
                        variant="outline"
                        size="xs"
                        disabled={ai.applying}
                        onClick={() => void ai.apply(section.index)}
                      >
                        <CheckIcon />
                        接受
                      </Button>
                    </div>
                  </header>
                  <TextDiffView blocks={section.blocks} className="px-4 py-3.5" />
                </motion.article>
              ))}
            </AnimatePresence>
            {!visible.length && (
              <p className="py-10 text-center text-sm text-muted-foreground">
                已忽略全部修改，可以放弃这次建议
              </p>
            )}
          </div>
        )}
      </div>

      <footer className="flex items-center gap-2 border-t border-border/70 px-5 py-3">
        {ai.busy ? (
          <>
            <span className="text-xs text-subtle">生成完成后可以逐节审阅</span>
            <Button variant="outline" size="sm" className="ml-auto" onClick={ai.discard}>
              停止生成
            </Button>
          </>
        ) : ai.error ? (
          <>
            <Button variant="ghost" size="sm" onClick={ai.discard}>
              关闭
            </Button>
            <Button size="sm" className="ml-auto" onClick={ai.retry}>
              <RotateCcwIcon />
              重试
            </Button>
          </>
        ) : proposal ? (
          <>
            <Button variant="ghost" size="sm" onClick={ai.discard}>
              {sections.length ? "放弃" : "关闭"}
            </Button>
            {sections.length > 0 && (
              <>
                <Button variant="ghost" size="sm" onClick={ai.retry}>
                  <RotateCcwIcon />
                  重新生成
                </Button>
                <Button
                  size="sm"
                  className="ml-auto"
                  disabled={ai.applying || !visible.length}
                  title="应用前会先存一份历史版本，接受后也可以按 Ctrl/⌘ + Z 撤销"
                  onClick={() => void ai.apply()}
                >
                  {ai.applying ? <LoaderCircleIcon className="animate-spin" /> : <CheckIcon />}
                  {ai.applying ? "正在存历史版本…" : `接受全部 ${visible.length} 处`}
                </Button>
              </>
            )}
          </>
        ) : null}
      </footer>
    </div>
  );
}

/**
 * 审阅面板放不进右栏时（窄屏、或切到了写作模式）：
 * 窄屏用底部抽屉，另外留一个浮动胶囊，随时点开继续审阅。
 */
export function AiReviewDock({
  ai,
  inPane,
  compact,
  sheetOpen,
  onSheetOpenChange,
  onShow,
  preview,
}: {
  ai: AiAssistant;
  inPane: boolean;
  compact: boolean;
  sheetOpen: boolean;
  onSheetOpenChange: (open: boolean) => void;
  onShow: () => void;
  preview: React.ReactNode;
}) {
  const task = ai.job && ai.job.task !== "rewrite" ? (ai.job.task as DocTask) : null;
  const meta = task ? DOC_TASKS[task] : null;
  const showPill = !!meta && !inPane && !(compact && sheetOpen);
  return (
    <>
      {compact && (
        <Sheet open={!!task && sheetOpen} onOpenChange={onSheetOpenChange}>
          <SheetContent
            side="bottom"
            showCloseButton={false}
            className="h-[88svh] gap-0 rounded-t-2xl p-0"
          >
            <SheetTitle className="sr-only">AI 修改建议</SheetTitle>
            <SheetDescription className="sr-only">逐节查看并接受 AI 的修改建议</SheetDescription>
            <span aria-hidden className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-border" />
            <AiReview ai={ai} preview={preview} />
          </SheetContent>
        </Sheet>
      )}
      <AnimatePresence>
        {showPill && (
          <motion.button
            type="button"
            onClick={onShow}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.35, ease: EASE }}
            className="fixed bottom-12 left-1/2 z-40 inline-flex -translate-x-1/2 items-center gap-2 rounded-full border border-border bg-popover/95 py-1.5 pr-3.5 pl-1.5 text-sm whitespace-nowrap shadow-float backdrop-blur md:left-[calc(50%+var(--sidebar-width,0px)/2)]"
          >
            <span className="grid size-7 place-items-center rounded-full bg-brand-soft text-brand">
              {ai.busy ? (
                <LoaderCircleIcon className="size-3.5 animate-spin" />
              ) : (
                <meta.icon className="size-3.5" />
              )}
            </span>
            <span>
              {meta.label}
              <span className="text-muted-foreground">
                {ai.busy
                  ? " · 生成中"
                  : ai.error
                    ? " · 生成失败"
                    : ai.proposal
                      ? ` · ${ai.proposal.sections.length - ai.ignored.length} 处修改`
                      : ""}
              </span>
            </span>
            <span className="text-brand">查看</span>
          </motion.button>
        )}
      </AnimatePresence>
    </>
  );
}
