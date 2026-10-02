import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { posts } from "./schema";

/** 系列：多篇文章按顺序组成一组 */
export const series = sqliteTable("series", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(CAST(unixepoch('subsec') * 1000 AS INTEGER))`),
});

/** 一篇文章最多属于一个系列；position 是在系列里的顺序 */
export const seriesPosts = sqliteTable(
  "series_posts",
  {
    postId: integer("post_id")
      .primaryKey()
      .references(() => posts.id, { onDelete: "cascade" }),
    seriesId: integer("series_id")
      .notNull()
      .references(() => series.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
  },
  (t) => [index("series_posts_order_idx").on(t.seriesId, t.position)],
);
