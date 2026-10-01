"use client";
import Link from "next/link";
import { RefreshCwIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type { JobStatus, ReaderJobView } from "@/lib/reader-ai";
import { READER_JOB_LABELS } from "./job-status";
export function JobsManager() {
  const [jobs, setJobs] = useState<ReaderJobView[]>([]),
    [counts, setCounts] = useState<Partial<Record<JobStatus, number>>>({}),
    [filter, setFilter] = useState<JobStatus | "all">("all");
  const [loaded, setLoaded] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch("/api/admin/jobs?limit=100", { signal });
      const data = await response.json();
      if (!response.ok) throw Error(data.error || "任务读取失败");
      if (signal?.aborted) return;
      setJobs(data.jobs);
      setCounts(data.counts);
      setLoaded(true);
    } catch (error) {
      if (!signal?.aborted) setError((error as Error).message);
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    const frame = requestAnimationFrame(() => void load(controller.signal));
    const timer = setInterval(() => void load(controller.signal), 2500);
    return () => {
      cancelAnimationFrame(frame);
      controller.abort();
      clearInterval(timer);
    };
  }, [load]);
  async function action(jobId: string, op: "retry" | "cancel") {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op, jobId }),
      });
      const data = await response.json();
      if (!response.ok) throw Error(data.error || "任务操作失败");
      await load();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const visible = jobs.filter((job) => filter === "all" || job.status === filter);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={filter === "all" ? "default" : "outline"}
          aria-pressed={filter === "all"}
          onClick={() => setFilter("all")}
        >
          全部
        </Button>
        {(Object.keys(READER_JOB_LABELS) as JobStatus[]).map((status) => (
          <Button
            key={status}
            size="sm"
            variant={filter === status ? "default" : "outline"}
            aria-pressed={filter === status}
            onClick={() => setFilter(status)}
          >
            {READER_JOB_LABELS[status]} · {counts[status] ?? 0}
          </Button>
        ))}
        <Button size="sm" variant="ghost" className="ml-auto" onClick={() => void load()}>
          <RefreshCwIcon className="size-3.5" />
          刷新
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {!loaded ? (
        <p role="status" className="text-sm text-muted-foreground">
          正在读取任务…
        </p>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            显示最近 100 个任务。失败任务可重试，等待或生成中的任务可取消。
          </p>
          <div className="space-y-3">
            {visible.map((job) => (
              <div
                key={job.id}
                data-job-id={job.id}
                className="space-y-2 rounded-xl border border-border bg-card p-4"
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-medium">
                    {job.type === "summary" ? "文章摘要" : "后台任务"}
                  </span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
                    {READER_JOB_LABELS[job.status]}
                  </span>
                  <Link
                    href={`/admin/posts/${job.postId}`}
                    className="text-sm text-brand underline underline-offset-4"
                  >
                    文章 #{job.postId}
                  </Link>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {new Date(job.createdAt).toLocaleString("zh-CN")}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {job.authorization === "auto" ? "发布或更新后自动生成" : "管理员主动生成"} · 尝试{" "}
                  {job.attempts} / {job.maxAttempts}
                  {job.status === "retry"
                    ? ` · 将于 ${new Date(job.availableAt).toLocaleTimeString("zh-CN")} 重试`
                    : ""}
                </p>
                {job.error && <p className="text-sm text-destructive">{job.error}</p>}
                <div className="flex gap-2">
                  {["pending", "running", "retry"].includes(job.status) && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => void action(job.id, "cancel")}
                    >
                      取消任务
                    </Button>
                  )}
                  {["failed", "cancelled"].includes(job.status) && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => void action(job.id, "retry")}
                    >
                      重试任务
                    </Button>
                  )}
                </div>
              </div>
            ))}
            {!visible.length && (
              <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
                暂无此状态的任务。开启自动摘要后发布文章，或在编辑器中主动生成摘要，即可看到任务。
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
