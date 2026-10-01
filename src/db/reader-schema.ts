import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { posts } from "./schema";
import type { BenchmarkInsight, JobStatus } from "@/lib/reader-ai";

export const readerInsights = sqliteTable("reader_insights", {
  postId: integer("post_id")
    .primaryKey()
    .references(() => posts.id, { onDelete: "cascade" }),
  summary: text("summary"),
  summaryHash: text("summary_hash"),
  summaryRevision: integer("summary_revision").notNull().default(0),
  summaryUpdatedAt: integer("summary_updated_at"),
  benchmark: text("benchmark", { mode: "json" }).$type<BenchmarkInsight>(),
  benchmarkHash: text("benchmark_hash"),
  benchmarkUpdatedAt: integer("benchmark_updated_at"),
});

/** Payload contains only the revision fence. Credentials and article text never enter jobs. */
export const backgroundJobs = sqliteTable(
  "background_jobs",
  {
    id: text("id").primaryKey(),
    type: text("type").notNull(),
    postId: integer("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    contentHash: text("content_hash").notNull(),
    payload: text("payload", { mode: "json" }).$type<{ revision: number }>().notNull(),
    authorization: text("authorization", { enum: ["admin", "auto"] }).notNull(),
    dedupeKey: text("dedupe_key").notNull(),
    status: text("status").$type<JobStatus>().notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(3),
    availableAt: integer("available_at").notNull(),
    leaseUntil: integer("lease_until"),
    leaseToken: text("lease_token"),
    error: text("error"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [
    uniqueIndex("background_jobs_dedupe_idx").on(t.dedupeKey),
    index("background_jobs_claim_idx").on(t.status, t.availableAt, t.leaseUntil),
    index("background_jobs_post_idx").on(t.postId, t.createdAt),
  ],
);
