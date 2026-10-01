import { integer, primaryKey, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

import type { AudioKind, PodcastLine, TimelineEntry } from "@/lib/post-audio";

import { posts } from "./schema";

/** 文章的朗读 / 播客音频。朗读稿每次从正文生成；播客稿由作者审过后保存在这里 */
export const postAudio = sqliteTable(
  "post_audio",
  {
    postId: integer("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    kind: text("kind").$type<AudioKind>().notNull(),
    lines: text("lines", { mode: "json" }).$type<PodcastLine[]>(),
    linesUpdatedAt: integer("lines_updated_at"),
    /** 每次请求合成加一，过时的任务结果直接丢弃 */
    revision: integer("revision").notNull().default(0),
    /** 合成进度：已完成 / 总段数 */
    progress: integer("progress").notNull().default(0),
    total: integer("total").notNull().default(0),
    audioUrl: text("audio_url"),
    mediaId: integer("media_id"),
    duration: real("duration").notNull().default(0),
    timeline: text("timeline", { mode: "json" }).$type<TimelineEntry[]>(),
    /** 合成时的正文哈希；与当前正文不同即「已过期」 */
    contentHash: text("content_hash"),
    hosts: text("hosts", { mode: "json" }).$type<string[]>(),
    updatedAt: integer("updated_at"),
  },
  (t) => [primaryKey({ columns: [t.postId, t.kind] })],
);
