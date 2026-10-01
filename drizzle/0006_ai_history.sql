CREATE TABLE `ai_usage` (
  `day` text PRIMARY KEY NOT NULL,
  `calls` integer DEFAULT 0 NOT NULL,
  `input_tokens` integer DEFAULT 0 NOT NULL,
  `output_tokens` integer DEFAULT 0 NOT NULL,
  `unknown_usage` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `post_versions` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `post_id` integer NOT NULL REFERENCES `posts`(`id`) ON DELETE CASCADE,
  `created_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
  `reason` text NOT NULL,
  `snapshot` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `post_versions_post_created_idx` ON `post_versions` (`post_id`, `created_at`, `id`);
