import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const musicTracks = sqliteTable(
  "music_tracks",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    title: text("title").notNull(),
    artist: text("artist").notNull().default(""),
    album: text("album").notNull().default(""),
    audioUrl: text("audio_url").notNull(),
    coverUrl: text("cover_url").notNull().default(""),
    lyrics: text("lyrics").notNull().default(""),
    sourceUrl: text("source_url").notNull().default(""),
    license: text("license").notNull().default(""),
    licenseUrl: text("license_url").notNull().default(""),
    duration: real("duration").notNull().default(0),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(CAST(unixepoch('subsec') * 1000 AS INTEGER))`),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(CAST(unixepoch('subsec') * 1000 AS INTEGER))`)
      .$onUpdate(() => new Date()),
  },
  (table) => [index("music_tracks_order_idx").on(table.sortOrder, table.id)],
);
