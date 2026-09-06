CREATE TABLE `suppliers` (
	`public_id` text PRIMARY KEY NOT NULL,
	`owner_email` text NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`tax_id` text DEFAULT '' NOT NULL,
	`contact_name` text DEFAULT '' NOT NULL,
	`email` text DEFAULT '' NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`address` text DEFAULT '' NOT NULL,
	`payment_terms` text DEFAULT '' NOT NULL,
	`currency` text DEFAULT 'CLP' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_by` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `suppliers_owner_code_uidx` ON `suppliers` (`owner_email`,`code`);--> statement-breakpoint
CREATE INDEX `suppliers_owner_name_idx` ON `suppliers` (`owner_email`,`name`,`active`);--> statement-breakpoint
ALTER TABLE `inventory_balances` ADD `average_unit_cost` text DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE `material_allocations` ADD `issue_unit_cost` text DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE `purchase_request_items` ADD `unit_cost` text DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE `purchase_request_items` ADD `line_total` text DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE `purchase_requests` ADD `supplier_public_id` text;--> statement-breakpoint
ALTER TABLE `purchase_requests` ADD `currency` text DEFAULT 'CLP' NOT NULL;--> statement-breakpoint
ALTER TABLE `purchase_requests` ADD `discount_percent` text DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE `purchase_requests` ADD `tax_percent` text DEFAULT '19' NOT NULL;--> statement-breakpoint
ALTER TABLE `purchase_requests` ADD `subtotal` text DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE `purchase_requests` ADD `discount_amount` text DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE `purchase_requests` ADD `net_subtotal` text DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE `purchase_requests` ADD `tax_amount` text DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE `purchase_requests` ADD `total` text DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE `purchase_requests` ADD `approved_by` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `purchase_requests` ADD `approved_at` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `purchase_requests` ADD `approval_notes` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `purchase_requests` ADD `ordered_by` text DEFAULT '' NOT NULL;