"use client";

import { LoaderIcon, RefreshCwIcon, RotateCcwIcon, SparklesIcon, XIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { useNow } from "@/hooks/use-now";
import { formatDateTime, formatRelative } from "@/lib/format";
import type { JobStatus, ReaderJobView } from "@/lib/reader-ai";
import { cn } from "@/lib/utils";

import { ACTIVE_JOB as ACTIVE, JOB_STATUS as STATUS } from "./job-status";

type Filter = "all" | "active" | "failed" | "succeeded" | "cancelled";

const FILTERS: { key: Filter; label: string; match: (s: JobStatus) => boolean }[] = [
  { key: "all", label: "全部", match: () => true },
  { key: "active", label: "进行中", match: (s) => ACTIVE.includes(s) },
  { key: "failed", label: "失败", match: (s) => s === "failed" },
  { key: "succeeded", label: "已完成", match: (s) => s === "succeeded" },
  { key: "cancelled", label: "已取消", match: (s) => s === "cancelled" },
];

const TYPE_LABEL: Record<string, string> = { summary: "生成 AI 摘要" };

export function JobsManager() {
  const [jobs, setJobs] = useState<ReaderJobView[]>([]);
  const [titles, setTitles] = useState<Record<number, string>>({});
  const [filter, setFilter] = useState<Filter>("all");
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [acting, setActing] = useState<string | null>(null);
  const now = useNow();

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch("/api/admin/jobs?limit=100", { signal });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "任务读取失败");
      if (signal?.aborted) return;
      setJobs(data.jobs);
      setTitles(data.titles ?? {});
      setLoaded(true);
    } catch (e) {
      if (!signal?.aborted) toast.error((e as Error).message);
    }
  }, []);

  const active = jobs.some((j) => ACTIVE.includes(j.status));

  // 有任务在跑时每 2.5 秒刷新一次，否则 15 秒
  useEffect(() => {
    const ctrl = new AbortController();
    const first = requestAnimationFrame(() => void load(ctrl.signal));
    const timer = setInterval(
      () => {
        if (document.visibilityState === "visible") void load(ctrl.signal);
      },
      active ? 2500 : 15000,
    );
    return () => {
      cancelAnimationFrame(first);
      clearInterval(timer);
      ctrl.abort();
    };
  }, [load, active]);

  async function act(job: ReaderJobView, op: "retry" | "cancel") {
    setActing(job.id);
    try {
      const res = await fetch("/api/admin/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op, jobId: job.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "任务操作失败");
      toast.success(op === "retry" ? "已重新加入队列" : "已取消");
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setActing(null);
    }
  }

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  const counts = Object.fromEntries(
    FILTERS.map((f) => [f.key, jobs.filter((j) => f.match(j.status)).length]),
  ) as Record<Filter, number>;
  const visible = jobs.filter((j) => FILTERS.find((f) => f.key === filter)!.match(j.status));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div
          role="tablist"
          aria-label="按状态筛选"
          className="flex flex-wrap gap-1 rounded-xl border border-border bg-card p-1"
        >
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              role="tab"
              aria-selected={filter === f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                "relative inline-flex h-7 items-center gap-1.5 rounded-lg px-3 text-xs transition-colors",
                filter === f.key
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {filter === f.key && (
                <motion.span
                  layoutId="jobs-filter"
                  className="absolute inset-0 rounded-lg bg-muted"
                  transition={{ type: "spring", stiffness: 500, damping: 40 }}
                />
              )}
              <span className="relative">{f.label}</span>
              {counts[f.key] > 0 && (
                <span className="relative text-subtle tabular-nums">{counts[f.key]}</span>
              )}
            </button>
          ))}
        </div>
        <span className="text-xs text-muted-foreground">
          {active ? "有任务在进行，列表会自动刷新" : "最近 100 个任务"}
        </span>
        <button
          type="button"
          onClick={() => void refresh()}
          aria-label="刷新"
          className="ml-auto grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <RefreshCwIcon className={cn("size-4", refreshing && "animate-spin")} />
        </button>
      </div>

      <section className="overflow-hidden rounded-2xl border border-border bg-card">
        {!loaded ? (
          <div className="space-y-px">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-4 px-5 py-4">
                <span className="size-8 animate-pulse rounded-full bg-muted" />
                <span className="h-3.5 w-48 animate-pulse rounded bg-muted" />
              </div>
            ))}
          </div>
        ) : visible.length ? (
          <ul>
            <AnimatePresence initial={false}>
              {visible.map((job) => {
                const status = STATUS[job.status];
                const title = titles[job.postId] ?? `文章 #${job.postId}`;
                const canCancel = ACTIVE.includes(job.status);
                const canRetry = job.status === "failed" || job.status === "cancelled";
                return (
                  <motion.li
                    key={job.id}
                    layout="position"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    data-job-id={job.id}
                    className="flex items-start gap-4 border-b border-border/60 px-5 py-3.5 last:border-b-0"
                  >
                    <span
                      className={cn(
                        "mt-0.5 grid size-8 shrink-0 place-items-center rounded-full",
                        status.tone,
                      )}
                      aria-hidden
                    >
                      {status.icon}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                        <Link
                          href={`/admin/posts/${job.postId}`}
                          className="truncate text-sm text-foreground hover:text-brand"
                        >
                          {title}
                        </Link>
                        <span className="text-xs text-muted-foreground">{status.label}</span>
                      </div>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <SparklesIcon className="size-3" />
                          {TYPE_LABEL[job.type] ?? "后台任务"}
                        </span>
                        <span aria-hidden>·</span>
                        <span>{job.authorization === "auto" ? "发布后自动" : "手动生成"}</span>
                        {job.attempts > 1 && (
                          <>
                            <span aria-hidden>·</span>
                            <span>
                              第 {job.attempts} / {job.maxAttempts} 次
                            </span>
                          </>
                        )}
                        {job.status === "retry" && (
                          <>
                            <span aria-hidden>·</span>
                            <span>
                              {new Date(job.availableAt).toLocaleTimeString("zh-CN", {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}{" "}
                              重试
                            </span>
                          </>
                        )}
                      </p>
                      {job.error && job.status !== "succeeded" && (
                        <p
                          className="mt-1.5 line-clamp-2 text-xs text-destructive"
                          title={job.error}
                        >
                          {job.error}
                        </p>
                      )}
                    </div>
                    <time
                      dateTime={new Date(job.updatedAt).toISOString()}
                      title={formatDateTime(job.updatedAt)}
                      className="mt-1 shrink-0 text-xs text-subtle tabular-nums"
                    >
                      {now ? formatRelative(job.updatedAt, now) : ""}
                    </time>
                    {(canCancel || canRetry) && (
                      <button
                        type="button"
                        disabled={acting === job.id}
                        onClick={() => void act(job, canRetry ? "retry" : "cancel")}
                        className="-mr-2 inline-flex h-7 shrink-0 items-center gap-1 rounded-lg px-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
                      >
                        {acting === job.id ? (
                          <LoaderIcon className="size-3 animate-spin" />
                        ) : canRetry ? (
                          <RotateCcwIcon className="size-3" />
                        ) : (
                          <XIcon className="size-3" />
                        )}
                        {canRetry ? "重试" : "取消"}
                      </button>
                    )}
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ul>
        ) : (
          <div className="flex flex-col items-center px-6 py-14 text-center">
            <span className="grid size-12 place-items-center rounded-full bg-muted text-muted-foreground">
              <SparklesIcon className="size-5" />
            </span>
            <p className="mt-4 text-sm text-foreground">
              {filter === "all" ? "还没有后台任务" : "没有这个状态的任务"}
            </p>
            <p className="mt-1 max-w-sm text-xs text-muted-foreground">
              在编辑器里生成 AI 摘要，或在「AI 助手」中开启发布后自动生成，任务会显示在这里。
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
