CREATE TABLE `music_tracks` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `title` text NOT NULL,
  `artist` text DEFAULT '' NOT NULL,
  `album` text DEFAULT '' NOT NULL,
  `audio_url` text NOT NULL,
  `cover_url` text DEFAULT '' NOT NULL,
  `lyrics` text DEFAULT '' NOT NULL,
  `source_url` text DEFAULT '' NOT NULL,
  `license` text DEFAULT '' NOT NULL,
  `license_url` text DEFAULT '' NOT NULL,
  `duration` real DEFAULT 0 NOT NULL,
  `enabled` integer DEFAULT 1 NOT NULL,
  `sort_order` integer DEFAULT 0 NOT NULL,
  `created_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
  `updated_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `music_tracks_order_idx` ON `music_tracks` (`sort_order`, `id`);
