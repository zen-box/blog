CREATE TABLE `link_previews` (
	`url` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`title` text,
	`description` text,
	`site_name` text,
	`image` text,
	`image_width` integer,
	`image_height` integer,
	`thumbhash` text,
	`icon` text,
	`error` text,
	`fetched_at` integer NOT NULL
);
