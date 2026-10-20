CREATE TABLE `catalog_bundles` (
	`public_id` text PRIMARY KEY NOT NULL,
	`owner_email` text NOT NULL,
	`name` text NOT NULL,
	`specialty` text NOT NULL,
	`currency` text DEFAULT 'CLP' NOT NULL,
	`payload_json` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `catalog_bundles_owner_idx` ON `catalog_bundles` (`owner_email`);--> statement-breakpoint
CREATE TABLE `supplier_comparisons` (
	`public_id` text PRIMARY KEY NOT NULL,
	`owner_email` text NOT NULL,
	`purchase_request_public_id` text NOT NULL,
	`payload_json` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `supplier_comparisons_owner_purchase_uidx` ON `supplier_comparisons` (`owner_email`,`purchase_request_public_id`);--> statement-breakpoint
ALTER TABLE `purchase_requests` ADD `dispatch_net` text DEFAULT '0' NOT NULL;