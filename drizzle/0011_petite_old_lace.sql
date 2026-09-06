ALTER TABLE `work_orders` ADD `closed_at` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `work_orders` ADD `closed_by` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `work_orders` ADD `closure_notes` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `work_orders` ADD `budgeted_cost` text DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE `work_orders` ADD `actual_cost` text DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE `work_orders` ADD `actual_profit` text DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE `work_orders` ADD `actual_margin_percent` text DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE `work_orders` ADD `closure_snapshot_json` text DEFAULT '{}' NOT NULL;