CREATE TABLE `app_settings` (
	`owner_email` text PRIMARY KEY NOT NULL,
	`company_json` text DEFAULT '{}' NOT NULL,
	`economic_settings_json` text DEFAULT '{}' NOT NULL,
	`source_schema_version` integer DEFAULT 0 NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `catalog_items` (
	`public_id` text PRIMARY KEY NOT NULL,
	`owner_email` text NOT NULL,
	`code` text NOT NULL,
	`type` text DEFAULT 'Material' NOT NULL,
	`category` text DEFAULT 'General' NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`unit` text DEFAULT 'un' NOT NULL,
	`unit_cost` text DEFAULT '0' NOT NULL,
	`unit_price` text DEFAULT '0' NOT NULL,
	`currency` text DEFAULT 'CLP' NOT NULL,
	`supplier` text DEFAULT '' NOT NULL,
	`reference` text DEFAULT '' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`payload_json` text DEFAULT '{}' NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `catalog_owner_code_uidx` ON `catalog_items` (`owner_email`,`code`);--> statement-breakpoint
CREATE INDEX `catalog_owner_type_idx` ON `catalog_items` (`owner_email`,`type`);--> statement-breakpoint
CREATE TABLE `clients` (
	`public_id` text PRIMARY KEY NOT NULL,
	`owner_email` text NOT NULL,
	`name` text NOT NULL,
	`tax_id` text DEFAULT '' NOT NULL,
	`contact_name` text DEFAULT '' NOT NULL,
	`email` text DEFAULT '' NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`address` text DEFAULT '' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`payload_json` text DEFAULT '{}' NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `clients_owner_idx` ON `clients` (`owner_email`,`name`);--> statement-breakpoint
CREATE TABLE `import_history` (
	`export_id` text PRIMARY KEY NOT NULL,
	`owner_email` text NOT NULL,
	`contract` text NOT NULL,
	`schema_version` integer NOT NULL,
	`exported_at` text DEFAULT '' NOT NULL,
	`imported_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`summary_json` text DEFAULT '{}' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `quote_items` (
	`public_id` text PRIMARY KEY NOT NULL,
	`owner_email` text NOT NULL,
	`quote_public_id` text NOT NULL,
	`position` integer NOT NULL,
	`name` text NOT NULL,
	`detail` text DEFAULT '' NOT NULL,
	`quantity` text DEFAULT '1' NOT NULL,
	`unit` text DEFAULT 'un' NOT NULL,
	`unit_cost` text DEFAULT '0' NOT NULL,
	`unit_price` text DEFAULT '0' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `quote_items_quote_idx` ON `quote_items` (`owner_email`,`quote_public_id`,`position`);--> statement-breakpoint
CREATE TABLE `quote_templates` (
	`public_id` text PRIMARY KEY NOT NULL,
	`owner_email` text NOT NULL,
	`name` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`payload_json` text NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `templates_owner_idx` ON `quote_templates` (`owner_email`,`name`);--> statement-breakpoint
CREATE TABLE `quotes` (
	`public_id` text PRIMARY KEY NOT NULL,
	`owner_email` text NOT NULL,
	`number` text NOT NULL,
	`root_public_id` text NOT NULL,
	`parent_public_id` text DEFAULT '' NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`client_public_id` text DEFAULT '' NOT NULL,
	`client_name` text NOT NULL,
	`project` text NOT NULL,
	`issue_date` text NOT NULL,
	`status` text DEFAULT 'Borrador' NOT NULL,
	`currency` text DEFAULT 'CLP' NOT NULL,
	`locked` integer DEFAULT false NOT NULL,
	`gross_subtotal` text DEFAULT '0' NOT NULL,
	`net_subtotal` text DEFAULT '0' NOT NULL,
	`tax` text DEFAULT '0' NOT NULL,
	`total` text DEFAULT '0' NOT NULL,
	`direct_cost` text DEFAULT '0' NOT NULL,
	`internal_cost` text DEFAULT '0' NOT NULL,
	`estimated_profit` text DEFAULT '0' NOT NULL,
	`margin_percent` text DEFAULT '0' NOT NULL,
	`payload_json` text NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `quotes_owner_number_uidx` ON `quotes` (`owner_email`,`number`);--> statement-breakpoint
CREATE INDEX `quotes_owner_date_idx` ON `quotes` (`owner_email`,`issue_date`);--> statement-breakpoint
CREATE TABLE `work_order_activities` (
	`public_id` text PRIMARY KEY NOT NULL,
	`owner_email` text NOT NULL,
	`work_order_public_id` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`payload_json` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `activities_order_idx` ON `work_order_activities` (`owner_email`,`work_order_public_id`,`position`);--> statement-breakpoint
CREATE TABLE `work_order_costs` (
	`public_id` text PRIMARY KEY NOT NULL,
	`owner_email` text NOT NULL,
	`work_order_public_id` text NOT NULL,
	`entry_date` text DEFAULT '' NOT NULL,
	`payload_json` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `costs_order_idx` ON `work_order_costs` (`owner_email`,`work_order_public_id`,`entry_date`);--> statement-breakpoint
CREATE TABLE `work_orders` (
	`public_id` text PRIMARY KEY NOT NULL,
	`owner_email` text NOT NULL,
	`number` text NOT NULL,
	`quote_public_id` text NOT NULL,
	`client_name` text NOT NULL,
	`project` text NOT NULL,
	`status` text NOT NULL,
	`responsible` text DEFAULT '' NOT NULL,
	`payload_json` text NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `work_orders_owner_number_uidx` ON `work_orders` (`owner_email`,`number`);