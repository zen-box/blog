import "server-only";
import { randomUUID } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, getSqlite } from "@/db";
import { backgroundJobs as jobs } from "@/db/reader-schema";
import type { JobStatus, ReaderJobView } from "@/lib/reader-ai";
import { AiError, describeAiError } from "./ai";

export type BackgroundJob = typeof jobs.$inferSelect;
export type JobHandler = (job: BackgroundJob, signal: AbortSignal) => Promise<() => boolean | void>;
const handlers = new Map<string, JobHandler>();
export function registerJobHandler(type: string, handler: JobHandler) {
  handlers.set(type, handler);
}
export function getJob(id: string) {
  return db.select().from(jobs).where(eq(jobs.id, id)).get() ?? null;
}
export function listJobs(postId?: number, limit = 50) {
  return db
    .select()
    .from(jobs)
    .where(postId === undefined ? undefined : eq(jobs.postId, postId))
    .orderBy(desc(jobs.createdAt), desc(jobs.id))
    .limit(Math.min(100, Math.max(1, limit)))
    .all();
}
/** Safe representation for admin API: the ownership token is never exposed. */
export function publicJob(job: BackgroundJob): ReaderJobView {
  const { leaseToken: _token, payload: _payload, dedupeKey: _dedupe, ...view } = job;
  void _token;
  void _payload;
  void _dedupe;
  return view;
}
export function insertSummaryJob(input: {
  postId: number;
  contentHash: string;
  revision: number;
  authorization: "admin" | "auto";
  force?: boolean;
}) {
  const now = Date.now();
  const id = randomUUID();
  const dedupeKey = `summary:${input.postId}:${input.contentHash}${input.force ? `:${id}` : ""}`;
  db.insert(jobs)
    .values({
      id,
      type: "summary",
      postId: input.postId,
      contentHash: input.contentHash,
      payload: { revision: input.revision },
      authorization: input.authorization,
      dedupeKey,
      availableAt: now,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing()
    .run();
  return db.select().from(jobs).where(eq(jobs.dedupeKey, dedupeKey)).get()!;
}
/** 文章音频（朗读、播客）等任务；每次请求都是新任务，靠 revision 丢弃过时结果 */
export function insertJob(input: {
  type: string;
  postId: number;
  contentHash: string;
  revision: number;
  authorization: "admin" | "auto";
}) {
  const now = Date.now();
  const id = randomUUID();
  db.insert(jobs)
    .values({
      id,
      type: input.type,
      postId: input.postId,
      contentHash: input.contentHash,
      payload: { revision: input.revision },
      authorization: input.authorization,
      dedupeKey: `${input.type}:${input.postId}:${input.revision}:${id}`,
      availableAt: now,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  return getJob(id)!;
}
/** 同一篇文章同类的排队任务已经过时，直接取消，免得白白调用服务 */
export function cancelQueuedJobs(postId: number, type: string) {
  getSqlite()
    .prepare(
      "UPDATE background_jobs SET status='cancelled', error='已有更新的请求', updated_at=? WHERE post_id=? AND type=? AND status IN ('pending','retry')",
    )
    .run(Date.now(), postId, type);
}
export function cancelJob(id: string) {
  getSqlite()
    .prepare(
      "UPDATE background_jobs SET status='cancelled', lease_token=NULL, lease_until=NULL, updated_at=? WHERE id=? AND status IN ('pending','running','retry')",
    )
    .run(Date.now(), id);
  const job = getJob(id);
  if (!job) throw new AiError("任务不存在", 404);
  return job;
}
/** Explicit admin retry keeps durable authorization but refreshes source/revision via reader-ai. */
export function retryJob(id: string, contentHash: string, revision: number) {
  const job = getJob(id);
  if (!job) throw new AiError("任务不存在", 404);
  if (!["failed", "cancelled"].includes(job.status))
    throw new AiError("只有失败或已取消任务可以重试", 409);
  const changed = db
    .update(jobs)
    .set({
      status: "pending",
      attempts: 0,
      error: null,
      contentHash,
      dedupeKey: `${job.type}:${job.postId}:${contentHash}:retry:${randomUUID()}`,
      payload: { revision },
      authorization: "admin",
      leaseToken: null,
      leaseUntil: null,
      availableAt: Date.now(),
      updatedAt: Date.now(),
    })
    .where(and(eq(jobs.id, id), eq(jobs.status, job.status)))
    .run().changes;
  if (!changed) throw new AiError("任务状态已变化，请刷新后重试", 409);
  return getJob(id)!;
}

/** One SQLite statement chooses and claims. Expired owners cannot heartbeat or commit. */
export function claimJob(options: { now?: number; leaseMs?: number } = {}): BackgroundJob | null {
  const now = options.now ?? Date.now();
  const leaseMs = Math.max(50, options.leaseMs ?? 30000);
  const token = randomUUID();
  const sqlite = getSqlite();
  return sqlite
    .transaction(() => {
      sqlite
        .prepare(
          "UPDATE background_jobs SET status='failed', error='任务中断次数过多，请手动重试', lease_token=NULL, lease_until=NULL, updated_at=? WHERE attempts>=max_attempts AND ((status='running' AND lease_until<=?) OR status IN ('pending','retry'))",
        )
        .run(now, now);
      const row = sqlite
        .prepare(
          `UPDATE background_jobs SET status='running', attempts=attempts+1,
      lease_token=?, lease_until=?, updated_at=?, error=NULL WHERE id=(
      SELECT id FROM background_jobs WHERE attempts<max_attempts AND
      ((status IN ('pending','retry') AND available_at<=?) OR (status='running' AND lease_until<=?))
      ORDER BY available_at, created_at, id LIMIT 1) RETURNING id`,
        )
        .get(token, now + leaseMs, now, now, now) as { id: string } | undefined;
      return row ? getJob(row.id) : null;
    })
    .immediate();
}
export function heartbeatJob(id: string, token: string, leaseMs = 30000, now = Date.now()) {
  return (
    getSqlite()
      .prepare(
        "UPDATE background_jobs SET lease_until=?, updated_at=? WHERE id=? AND status='running' AND lease_token=? AND lease_until>?",
      )
      .run(now + leaseMs, now, id, token, now).changes === 1
  );
}
function owns(job: BackgroundJob, now = Date.now()) {
  const current = getJob(job.id);
  return (
    current?.status === "running" &&
    current.leaseToken === job.leaseToken &&
    (current.leaseUntil ?? 0) > now
  );
}
export async function runOne(
  options: {
    leaseMs?: number;
    signal?: AbortSignal;
    handler?: JobHandler;
    retryDelayMs?: number;
  } = {},
) {
  const job = claimJob({ leaseMs: options.leaseMs });
  if (!job) return null;
  const leaseMs = Math.max(50, options.leaseMs ?? 30000);
  const abort = new AbortController();
  const signal = AbortSignal.any([abort.signal, ...(options.signal ? [options.signal] : [])]);
  const pulse = setInterval(
    () => {
      try {
        if (!heartbeatJob(job.id, job.leaseToken!, leaseMs)) abort.abort();
      } catch {
        abort.abort();
      }
    },
    Math.max(10, Math.min(1000, Math.floor(leaseMs / 3))),
  );
  pulse.unref();
  try {
    let handler = options.handler ?? handlers.get(job.type);
    if (!handler && job.type === "summary")
      handler = (await import("./reader-ai")).executeSummaryJob;
    if (!handler && (job.type === "narration" || job.type === "podcast"))
      handler = (await import("./post-audio")).executeAudioJob;
    if (!handler) throw new AiError("不支持此任务类型", 400);
    const apply = await handler(job, signal);
    if (signal.aborted) throw signal.reason;
    getSqlite()
      .transaction(() => {
        if (!owns(job)) return;
        const applied = apply();
        db.update(jobs)
          .set({
            status: applied === false ? "cancelled" : "succeeded",
            leaseToken: null,
            leaseUntil: null,
            error: applied === false ? "内容已变化或有更新的请求，已丢弃过时结果" : null,
            updatedAt: Date.now(),
          })
          .where(eq(jobs.id, job.id))
          .run();
      })
      .immediate();
  } catch (error) {
    getSqlite()
      .transaction(() => {
        if (!owns(job)) return;
        const exhausted = job.attempts >= job.maxAttempts;
        db.update(jobs)
          .set({
            status: exhausted ? "failed" : "retry",
            leaseToken: null,
            leaseUntil: null,
            error: describeAiError(error, signal).message,
            availableAt:
              Date.now() +
              (options.retryDelayMs ?? Math.min(300000, 5000 * 2 ** (job.attempts - 1))),
            updatedAt: Date.now(),
          })
          .where(eq(jobs.id, job.id))
          .run();
      })
      .immediate();
  } finally {
    clearInterval(pulse);
    abort.abort();
  }
  return getJob(job.id);
}
export const tick = runOne;

type Worker = {
  timer?: NodeJS.Timeout;
  active?: Promise<unknown>;
  abort?: AbortController;
  stopped: boolean;
};
const holder = globalThis as typeof globalThis & { __blogJobWorker?: Worker };
/** Start from instrumentation, never at import time. One in-flight task per process. */
export function startJobWorker(intervalMs = 1000) {
  if (holder.__blogJobWorker && !holder.__blogJobWorker.stopped) return;
  const worker: Worker = { stopped: false };
  holder.__blogJobWorker = worker;
  const poll = () => {
    if (worker.stopped || worker.active) return;
    worker.abort = new AbortController();
    worker.active = runOne({ signal: worker.abort.signal })
      .catch(() => {})
      .finally(() => {
        worker.active = undefined;
      });
  };
  worker.timer = setInterval(poll, Math.max(100, intervalMs));
  worker.timer.unref();
  poll();
}
export async function stopJobWorker() {
  const worker = holder.__blogJobWorker;
  if (!worker) return;
  worker.stopped = true;
  clearInterval(worker.timer);
  worker.abort?.abort();
  await worker.active;
}
export function jobCounts() {
  return db
    .select({ status: jobs.status, count: sql<number>`count(*)` })
    .from(jobs)
    .groupBy(jobs.status)
    .all()
    .reduce(
      (counts, row) => ({ ...counts, [row.status]: row.count }),
      {} as Partial<Record<JobStatus, number>>,
    );
}
