CREATE TABLE `quote_events` (
	`public_id` text PRIMARY KEY NOT NULL,
	`owner_email` text NOT NULL,
	`quote_public_id` text NOT NULL,
	`event_type` text NOT NULL,
	`actor` text DEFAULT '' NOT NULL,
	`detail` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `quote_events_quote_idx` ON `quote_events` (`owner_email`,`quote_public_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `quotes` ADD `locked_at` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `quotes` ADD `approved_at` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `quotes` ADD `approved_by` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `quotes` ADD `approval_notes` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `work_orders` ADD `created_date` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `work_orders` ADD `currency` text DEFAULT 'CLP' NOT NULL;--> statement-breakpoint
ALTER TABLE `work_orders` ADD `approved_sale` text DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE `work_orders` ADD `planned_start` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `work_orders` ADD `planned_end` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `work_orders` ADD `notes` text DEFAULT '' NOT NULL;