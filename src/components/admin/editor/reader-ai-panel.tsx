"use client";

import {
  FileTextIcon,
  GaugeIcon,
  HeadphonesIcon,
  LoaderCircleIcon,
  RotateCcwIcon,
  SparklesIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useNow } from "@/hooks/use-now";
import { formatRelative } from "@/lib/format";
import type { BenchmarkExtraction, ReaderAiAdminState, ReaderJobView } from "@/lib/reader-ai";
import { cn } from "@/lib/utils";

import { useConfirm } from "../confirm";
import { ACTIVE_JOB, JOB_STATUS } from "../job-status";
import { AudioPanel } from "./audio-panel";

type Proposal = BenchmarkExtraction & { contentHash: string };
type Tab = "summary" | "benchmark" | "listen";

function Note({
  tone = "muted",
  children,
}: {
  tone?: "muted" | "warn";
  children: React.ReactNode;
}) {
  return (
    <p
      className={cn(
        "flex gap-2 rounded-lg px-3 py-2 text-xs leading-relaxed",
        tone === "warn"
          ? "bg-amber-500/10 text-amber-800 dark:text-amber-300"
          : "bg-muted/60 text-muted-foreground",
      )}
    >
      {tone === "warn" && <TriangleAlertIcon className="mt-0.5 size-3.5 shrink-0" />}
      <span>{children}</span>
    </p>
  );
}

/** 一行状态：读者是否看得到 */
function Visibility({
  exists,
  stale,
  hidden,
  updatedAt,
  now,
}: {
  exists: boolean;
  stale: boolean;
  hidden: boolean;
  updatedAt?: number;
  now: number;
}) {
  const [dot, text] = !exists
    ? ["bg-border", "还没有内容"]
    : stale
      ? ["bg-amber-500", "正文更新过，暂不向读者显示"]
      : hidden
        ? ["bg-border", "已保存，前台显示已关闭"]
        : ["bg-emerald-500", "读者可见"];
  return (
    <p className="flex items-center gap-2 text-xs text-muted-foreground">
      <span aria-hidden className={cn("size-1.5 rounded-full", dot)} />
      {text}
      {exists && updatedAt ? (
        <span className="text-subtle">· 更新于 {formatRelative(updatedAt, now)}</span>
      ) : null}
    </p>
  );
}

function ReaderAiBody({ postId, dirty }: { postId: number; dirty: boolean }) {
  const [tab, setTab] = useState<Tab>("summary");
  const [state, setState] = useState<ReaderAiAdminState | null>(null);
  const [sourceHash, setSourceHash] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [conclusion, setConclusion] = useState("");
  const edited = useRef(false),
    initialHash = useRef(""),
    requestId = useRef(0),
    confirm = useConfirm();
  const now = useNow();

  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      const ticket = ++requestId.current;
      try {
        const response = await fetch(`/api/admin/reader-ai?postId=${postId}`, { signal });
        const data = await response.json();
        if (!response.ok) throw Error(data.error || "读者内容读取失败");
        if (signal?.aborted || ticket !== requestId.current) return;
        setState(data);
        if (!initialHash.current) {
          initialHash.current = data.contentHash;
          setSourceHash(data.contentHash);
        }
        if (!edited.current) setText(data.summary?.text ?? "");
      } catch (error) {
        if (!signal?.aborted && ticket === requestId.current) setError((error as Error).message);
      }
    },
    [postId],
  );
  useEffect(() => {
    const controller = new AbortController();
    const frame = requestAnimationFrame(() => void refresh(controller.signal));
    const timer = setInterval(() => void refresh(controller.signal), 1500);
    return () => {
      cancelAnimationFrame(frame);
      clearInterval(timer);
      controller.abort();
    };
  }, [refresh]);

  const changed = dirty || Boolean(state && sourceHash && sourceHash !== state.contentHash);
  async function submit(payload: unknown, endpoint = "/api/admin/reader-ai") {
    if (changed) {
      setError("正文有变化，请保存后重新打开读者 AI 内容");
      return null;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw Error(data.error || "操作失败，请重试");
      return data;
    } catch (error) {
      setError((error as Error).message);
      return null;
    } finally {
      setBusy(false);
    }
  }
  async function generate() {
    if (!state) return;
    const result = await submit({ op: "generate", postId, contentHash: sourceHash, force: true });
    if (result) {
      edited.current = false;
      toast.success("已开始生成摘要", { description: "完成后会自动填进来，可以先做别的" });
      await refresh();
    }
  }
  async function saveSummary(value = text) {
    const result = await submit({
      op: "saveSummary",
      postId,
      contentHash: sourceHash,
      text: value,
    });
    if (result) {
      edited.current = false;
      setState(result);
      setText(result.summary?.text ?? "");
      toast.success(value ? "摘要已保存" : "摘要已清除");
    }
  }
  async function extract() {
    const result = await submit({ op: "extractBenchmark", postId });
    if (result) {
      if (!result.matched) {
        setError(result.message);
        return;
      }
      setProposal(result);
      setSelected([]);
      setConclusion(result.conclusion);
    }
  }
  async function saveBenchmark(clear = false) {
    if (!clear && !proposal) return;
    const result = await submit({
      op: "saveBenchmark",
      postId,
      contentHash: clear ? sourceHash : proposal!.contentHash,
      conclusion: clear ? "" : conclusion,
      itemKeys: clear ? [] : selected,
    });
    if (result) {
      setState(result);
      setProposal(null);
      setSelected([]);
      toast.success(clear ? "测评速览已清除" : "测评速览已公开");
    }
  }
  async function jobAction(job: ReaderJobView, op: "retry" | "cancel") {
    if (await submit({ op, jobId: job.id }, "/api/admin/jobs")) await refresh();
  }

  const running = state?.jobs.some((job) => ACTIVE_JOB.includes(job.status));
  const tabs: { key: Tab; label: string; icon: React.ReactNode; dot?: string }[] = [
    {
      key: "summary",
      label: "AI 摘要",
      icon: <FileTextIcon className="size-3.5" />,
      dot: state?.summary ? (state.stale.summary ? "bg-amber-500" : "bg-emerald-500") : undefined,
    },
    {
      key: "benchmark",
      label: "测评速览",
      icon: <GaugeIcon className="size-3.5" />,
      dot: state?.benchmark
        ? state.stale.benchmark
          ? "bg-amber-500"
          : "bg-emerald-500"
        : undefined,
    },
    { key: "listen", label: "收听", icon: <HeadphonesIcon className="size-3.5" /> },
  ];

  return (
    <>
      <SheetHeader className="border-b border-border px-5 pt-4 pb-0">
        <SheetTitle>读者看到的 AI 内容</SheetTitle>
        <SheetDescription>根据已保存的正文生成，你确认后才会显示在文章开头。</SheetDescription>
        <div role="tablist" className="mt-3 flex gap-5">
          {tabs.map((item) => (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={tab === item.key}
              onClick={() => setTab(item.key)}
              className="relative flex h-10 items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground aria-selected:text-foreground"
            >
              {item.icon}
              {item.label}
              {item.dot && <span aria-hidden className={cn("size-1.5 rounded-full", item.dot)} />}
              {tab === item.key && (
                <motion.span
                  layoutId="reader-ai-tab"
                  className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-brand"
                  transition={{ type: "spring", stiffness: 500, damping: 40 }}
                />
              )}
            </button>
          ))}
        </div>
      </SheetHeader>

      {tab === "listen" ? (
        <AudioPanel postId={postId} dirty={dirty} />
      ) : (
        <>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5" data-lenis-prevent>
            {changed && <Note tone="warn">正文有未保存的变化，请保存后再管理读者 AI 内容。</Note>}
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            {!state ? (
              <div className="space-y-3">
                <Skeleton className="h-3.5 w-32" />
                <Skeleton className="h-36 w-full rounded-xl" />
              </div>
            ) : tab === "summary" ? (
              <>
                <Visibility
                  exists={!!state.summary}
                  stale={state.stale.summary}
                  hidden={!state.config.showSummary}
                  updatedAt={state.summary?.updatedAt}
                  now={now}
                />
                {!state.config.enabled && (
                  <Note>
                    读者 AI 已在
                    <Link href="/admin/ai" className="mx-1 text-brand hover:underline">
                      AI 助手
                    </Link>
                    页面关闭，开启后才能生成摘要。
                  </Note>
                )}
                <div className="overflow-hidden rounded-xl border border-input transition-[border-color,box-shadow] focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30">
                  <Textarea
                    aria-label="读者 AI 摘要"
                    maxLength={500}
                    className="min-h-40 resize-none rounded-none border-0 bg-transparent px-3.5 py-3 leading-relaxed shadow-none focus-visible:ring-0 dark:bg-transparent"
                    value={text}
                    onChange={(event) => {
                      edited.current = true;
                      setText(event.target.value);
                    }}
                    placeholder="用两三句话告诉读者这篇文章讲了什么。可以让 AI 先写一版，再自己改。"
                  />
                  <div className="flex items-center gap-2 border-t border-border/60 px-2 py-1.5">
                    <Button
                      variant="ghost"
                      size="xs"
                      className="text-brand hover:text-brand"
                      disabled={busy || changed || !state.config.enabled || running}
                      onClick={() => void generate()}
                    >
                      <SparklesIcon />
                      {state.summary || text ? "让 AI 重写" : "AI 生成"}
                    </Button>
                    {running && (
                      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                        <LoaderCircleIcon className="size-3 animate-spin" />
                        正在生成…
                      </span>
                    )}
                    <span className="ml-auto pr-1 font-mono text-[11px] text-subtle tabular-nums">
                      {text.length}/500
                    </span>
                  </div>
                </div>
                {state.jobs.length > 0 && (
                  <section aria-labelledby="reader-jobs">
                    <h3 id="reader-jobs" className="mb-2 text-xs font-medium text-subtle">
                      生成记录
                    </h3>
                    <ul className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border">
                      {state.jobs.map((job) => {
                        const status = JOB_STATUS[job.status];
                        return (
                          <li
                            key={job.id}
                            className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3.5 py-2.5"
                          >
                            <span
                              className={cn(
                                "grid size-6 shrink-0 place-items-center rounded-full",
                                status.tone,
                              )}
                            >
                              {status.icon}
                            </span>
                            <span className="text-sm">{status.label}</span>
                            <span className="text-xs text-subtle">
                              {job.authorization === "auto" ? "发布后自动" : "手动"} · 第{" "}
                              {job.attempts}/{job.maxAttempts} 次 ·{" "}
                              {formatRelative(job.updatedAt, now)}
                            </span>
                            {ACTIVE_JOB.includes(job.status) ? (
                              <Button
                                size="xs"
                                variant="ghost"
                                className="ml-auto"
                                disabled={busy || changed}
                                onClick={() => void jobAction(job, "cancel")}
                              >
                                取消
                              </Button>
                            ) : ["failed", "cancelled"].includes(job.status) ? (
                              <Button
                                size="xs"
                                variant="outline"
                                className="ml-auto"
                                disabled={busy || changed}
                                onClick={() => void jobAction(job, "retry")}
                              >
                                <RotateCcwIcon />
                                重试
                              </Button>
                            ) : null}
                            {job.error && (
                              <p className="basis-full pl-9 text-xs leading-relaxed text-destructive">
                                {job.error}
                              </p>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                )}
              </>
            ) : proposal ? (
              <>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm text-foreground">
                    从测试报告里找到 {proposal.items.length} 项指标
                    <span className="block text-xs text-muted-foreground">
                      勾选要公开的，核对原文依据后保存
                    </span>
                  </p>
                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={() =>
                      setSelected(
                        selected.length === proposal.items.length
                          ? []
                          : proposal.items.map((item) => item.key),
                      )
                    }
                  >
                    {selected.length === proposal.items.length ? "全不选" : "全选"}
                  </Button>
                </div>
                <ul className="space-y-2" aria-label="待确认的测评指标">
                  {proposal.items.map((item) => {
                    const checked = selected.includes(item.key);
                    return (
                      <li key={item.key}>
                        <label
                          className={cn(
                            "flex cursor-pointer gap-3 rounded-xl border px-3.5 py-3 transition-colors",
                            checked
                              ? "border-brand/40 bg-brand-soft/35"
                              : "border-border hover:bg-muted/50",
                          )}
                        >
                          <Checkbox
                            className="mt-0.5"
                            checked={checked}
                            onCheckedChange={(value) =>
                              setSelected((current) =>
                                value
                                  ? [...current, item.key]
                                  : current.filter((key) => key !== item.key),
                              )
                            }
                          />
                          <span className="min-w-0">
                            <span className="block text-xs text-muted-foreground">
                              {item.label}
                            </span>
                            <span className="block text-sm break-words">{item.value}</span>
                            {item.evidence.map((evidence) => (
                              <span
                                key={evidence.line}
                                className="mt-1 block truncate font-mono text-[11px] text-subtle"
                                title={evidence.text}
                              >
                                L{evidence.line} {evidence.text}
                              </span>
                            ))}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">一句话结论</p>
                  <Textarea
                    aria-label="测评速览结论"
                    maxLength={500}
                    value={conclusion}
                    onChange={(event) => setConclusion(event.target.value)}
                  />
                </div>
              </>
            ) : state.benchmark ? (
              <>
                <Visibility
                  exists
                  stale={state.stale.benchmark}
                  hidden={!state.config.showBenchmark}
                  updatedAt={state.benchmark.updatedAt}
                  now={now}
                />
                <div className="overflow-hidden rounded-xl border border-border">
                  <p className="px-4 py-3 text-sm leading-relaxed">{state.benchmark.conclusion}</p>
                  <dl className="grid grid-cols-2 gap-px border-t border-border/70 bg-border/70">
                    {state.benchmark.items.map((item) => (
                      <div key={item.key} className="bg-card px-4 py-2.5">
                        <dt className="text-[11px] text-muted-foreground">{item.label}</dt>
                        <dd className="mt-0.5 text-sm break-words">{item.value}</dd>
                      </div>
                    ))}
                    {state.benchmark.items.length % 2 === 1 && (
                      <div aria-hidden className="bg-card" />
                    )}
                  </dl>
                </div>
              </>
            ) : (
              <div className="py-10 text-center">
                <GaugeIcon className="mx-auto size-5 text-subtle" />
                <p className="mt-3 text-sm">还没有测评速览</p>
                <p className="mx-auto mt-1 max-w-xs text-xs leading-relaxed text-muted-foreground">
                  文章里有 NodeQuality 或 Check.Place
                  的测试报告时，可以提取关键指标，确认后显示给读者。
                </p>
              </div>
            )}
          </div>

          {state && (
            <footer className="flex items-center gap-2 border-t border-border px-5 py-3">
              {tab === "summary" ? (
                <>
                  {state.summary && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground"
                      disabled={busy || changed}
                      onClick={async () => {
                        if (
                          await confirm({ title: "清除这篇文章的 AI 摘要？", confirmText: "清除" })
                        )
                          await saveSummary("");
                      }}
                    >
                      清除摘要
                    </Button>
                  )}
                  <Button
                    size="sm"
                    className="ml-auto"
                    disabled={busy || changed || (!text.trim() && !state.summary)}
                    onClick={() => void saveSummary()}
                  >
                    保存摘要
                  </Button>
                </>
              ) : proposal ? (
                <>
                  <Button variant="ghost" size="sm" onClick={() => setProposal(null)}>
                    放弃
                  </Button>
                  <Button
                    size="sm"
                    className="ml-auto"
                    disabled={busy || changed || !selected.length || !conclusion.trim()}
                    onClick={() => void saveBenchmark()}
                  >
                    公开 {selected.length} 项指标
                  </Button>
                </>
              ) : (
                <>
                  {state.benchmark && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground"
                      disabled={busy || changed}
                      onClick={async () => {
                        if (await confirm({ title: "清除已公开的测评速览？", confirmText: "清除" }))
                          await saveBenchmark(true);
                      }}
                    >
                      清除速览
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant={state.benchmark ? "outline" : "default"}
                    className="ml-auto"
                    disabled={busy || changed}
                    onClick={() => void extract()}
                  >
                    {busy ? <LoaderCircleIcon className="animate-spin" /> : <GaugeIcon />}
                    {state.benchmark ? "重新提取" : "提取测评指标"}
                  </Button>
                </>
              )}
            </footer>
          )}
        </>
      )}
    </>
  );
}

/** 读者 AI（文章开头的 AI 摘要与测评速览）的管理抽屉；每次打开都重新读取 */
export function ReaderAiSheet({
  postId,
  dirty,
  open,
  onOpenChange,
}: {
  postId?: number;
  dirty: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-lg">
        {postId ? <ReaderAiBody postId={postId} dirty={dirty} /> : null}
      </SheetContent>
    </Sheet>
  );
}
