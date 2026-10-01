CREATE TABLE `reader_insights` (
  `post_id` integer PRIMARY KEY NOT NULL REFERENCES `posts`(`id`) ON DELETE CASCADE,
  `summary` text,
  `summary_hash` text,
  `summary_revision` integer DEFAULT 0 NOT NULL,
  `summary_updated_at` integer,
  `benchmark` text,
  `benchmark_hash` text,
  `benchmark_updated_at` integer
);
--> statement-breakpoint
CREATE TABLE `background_jobs` (
  `id` text PRIMARY KEY NOT NULL,
  `type` text NOT NULL,
  `post_id` integer NOT NULL REFERENCES `posts`(`id`) ON DELETE CASCADE,
  `content_hash` text NOT NULL,
  `payload` text NOT NULL,
  `authorization` text NOT NULL CHECK (`authorization` IN ('admin','auto')),
  `dedupe_key` text NOT NULL,
  `status` text DEFAULT 'pending' NOT NULL CHECK (`status` IN ('pending','running','retry','succeeded','failed','cancelled')),
  `attempts` integer DEFAULT 0 NOT NULL,
  `max_attempts` integer DEFAULT 3 NOT NULL,
  `available_at` integer NOT NULL,
  `lease_until` integer,
  `lease_token` text,
  `error` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `background_jobs_dedupe_idx` ON `background_jobs` (`dedupe_key`);
--> statement-breakpoint
CREATE INDEX `background_jobs_claim_idx` ON `background_jobs` (`status`,`available_at`,`lease_until`);
--> statement-breakpoint
CREATE INDEX `background_jobs_post_idx` ON `background_jobs` (`post_id`,`created_at`);
