CREATE TABLE `series` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `name` text NOT NULL,
  `slug` text NOT NULL,
  `description` text,
  `created_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `series_slug_unique` ON `series` (`slug`);
--> statement-breakpoint
CREATE TABLE `series_posts` (
  `post_id` integer PRIMARY KEY NOT NULL REFERENCES `posts`(`id`) ON DELETE CASCADE,
  `series_id` integer NOT NULL REFERENCES `series`(`id`) ON DELETE CASCADE,
  `position` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `series_posts_order_idx` ON `series_posts` (`series_id`,`position`);
