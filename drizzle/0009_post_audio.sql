CREATE TABLE `post_audio` (
  `post_id` integer NOT NULL REFERENCES `posts`(`id`) ON DELETE CASCADE,
  `kind` text NOT NULL CHECK (`kind` IN ('narration','podcast')),
  `lines` text,
  `lines_updated_at` integer,
  `revision` integer DEFAULT 0 NOT NULL,
  `progress` integer DEFAULT 0 NOT NULL,
  `total` integer DEFAULT 0 NOT NULL,
  `audio_url` text,
  `media_id` integer,
  `duration` real DEFAULT 0 NOT NULL,
  `timeline` text,
  `content_hash` text,
  `hosts` text,
  `updated_at` integer,
  PRIMARY KEY (`post_id`, `kind`)
);
