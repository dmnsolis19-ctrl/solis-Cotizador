CREATE TABLE `inventory_balances` (
	`public_id` text PRIMARY KEY NOT NULL,
	`owner_email` text NOT NULL,
	`warehouse_public_id` text NOT NULL,
	`catalog_item_public_id` text NOT NULL,
	`item_code` text DEFAULT '' NOT NULL,
	`item_name` text NOT NULL,
	`unit` text DEFAULT 'un' NOT NULL,
	`quantity` text DEFAULT '0' NOT NULL,
	`reserved_quantity` text DEFAULT '0' NOT NULL,
	`minimum_quantity` text DEFAULT '0' NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `inventory_balance_item_uidx` ON `inventory_balances` (`owner_email`,`warehouse_public_id`,`catalog_item_public_id`);--> statement-breakpoint
CREATE INDEX `inventory_balance_owner_item_idx` ON `inventory_balances` (`owner_email`,`catalog_item_public_id`);--> statement-breakpoint
CREATE TABLE `inventory_movements` (
	`public_id` text PRIMARY KEY NOT NULL,
	`owner_email` text NOT NULL,
	`warehouse_public_id` text NOT NULL,
	`catalog_item_public_id` text NOT NULL,
	`movement_type` text NOT NULL,
	`quantity` text NOT NULL,
	`stock_before` text NOT NULL,
	`stock_after` text NOT NULL,
	`reserved_before` text DEFAULT '0' NOT NULL,
	`reserved_after` text DEFAULT '0' NOT NULL,
	`work_order_public_id` text DEFAULT '' NOT NULL,
	`activity_public_id` text DEFAULT '' NOT NULL,
	`material_request_public_id` text DEFAULT '' NOT NULL,
	`reference` text DEFAULT '' NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	`actor` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `inventory_movements_item_idx` ON `inventory_movements` (`owner_email`,`warehouse_public_id`,`catalog_item_public_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `inventory_movements_order_idx` ON `inventory_movements` (`owner_email`,`work_order_public_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `material_allocations` (
	`public_id` text PRIMARY KEY NOT NULL,
	`owner_email` text NOT NULL,
	`material_request_public_id` text NOT NULL,
	`material_request_item_public_id` text NOT NULL,
	`warehouse_public_id` text NOT NULL,
	`catalog_item_public_id` text NOT NULL,
	`requested_quantity` text NOT NULL,
	`reserved_quantity` text DEFAULT '0' NOT NULL,
	`issued_quantity` text DEFAULT '0' NOT NULL,
	`returned_quantity` text DEFAULT '0' NOT NULL,
	`status` text DEFAULT 'Reservada' NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `material_allocation_item_uidx` ON `material_allocations` (`owner_email`,`material_request_item_public_id`);--> statement-breakpoint
CREATE INDEX `material_allocations_request_idx` ON `material_allocations` (`owner_email`,`material_request_public_id`);--> statement-breakpoint
CREATE TABLE `purchase_request_items` (
	`public_id` text PRIMARY KEY NOT NULL,
	`owner_email` text NOT NULL,
	`purchase_request_public_id` text NOT NULL,
	`material_request_item_public_id` text NOT NULL,
	`catalog_item_public_id` text DEFAULT '' NOT NULL,
	`description` text NOT NULL,
	`quantity` text NOT NULL,
	`unit` text DEFAULT 'un' NOT NULL,
	`received_quantity` text DEFAULT '0' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `purchase_request_items_idx` ON `purchase_request_items` (`owner_email`,`purchase_request_public_id`);--> statement-breakpoint
CREATE TABLE `purchase_requests` (
	`public_id` text PRIMARY KEY NOT NULL,
	`owner_email` text NOT NULL,
	`number` text NOT NULL,
	`material_request_public_id` text NOT NULL,
	`work_order_public_id` text NOT NULL,
	`warehouse_public_id` text NOT NULL,
	`status` text DEFAULT 'Solicitada' NOT NULL,
	`supplier` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_by` text NOT NULL,
	`ordered_at` text DEFAULT '' NOT NULL,
	`received_at` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `purchase_requests_owner_number_uidx` ON `purchase_requests` (`owner_email`,`number`);--> statement-breakpoint
CREATE INDEX `purchase_requests_status_idx` ON `purchase_requests` (`owner_email`,`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `warehouses` (
	`public_id` text PRIMARY KEY NOT NULL,
	`owner_email` text NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`location` text DEFAULT '' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `warehouses_owner_code_uidx` ON `warehouses` (`owner_email`,`code`);--> statement-breakpoint
CREATE INDEX `warehouses_owner_active_idx` ON `warehouses` (`owner_email`,`active`);