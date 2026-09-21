CREATE TABLE `field_work_template_activities` (
	`public_id` text PRIMARY KEY NOT NULL,
	`owner_email` text NOT NULL,
	`template_public_id` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`title` text NOT NULL,
	`required` integer DEFAULT true NOT NULL,
	`default_notes` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `field_template_activities_idx` ON `field_work_template_activities` (`owner_email`,`template_public_id`,`position`);--> statement-breakpoint
CREATE TABLE `field_work_templates` (
	`public_id` text PRIMARY KEY NOT NULL,
	`owner_email` text NOT NULL,
	`name` text NOT NULL,
	`category` text DEFAULT 'General' NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_by` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `field_templates_owner_name_uidx` ON `field_work_templates` (`owner_email`,`name`);--> statement-breakpoint
CREATE INDEX `field_templates_owner_category_idx` ON `field_work_templates` (`owner_email`,`category`,`active`);--> statement-breakpoint
CREATE TABLE `material_request_items` (
	`public_id` text PRIMARY KEY NOT NULL,
	`owner_email` text NOT NULL,
	`request_public_id` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`catalog_item_public_id` text DEFAULT '' NOT NULL,
	`code` text DEFAULT '' NOT NULL,
	`description` text NOT NULL,
	`quantity` text DEFAULT '1' NOT NULL,
	`unit` text DEFAULT 'un' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `material_request_items_idx` ON `material_request_items` (`owner_email`,`request_public_id`,`position`);--> statement-breakpoint
CREATE TABLE `material_requests` (
	`public_id` text PRIMARY KEY NOT NULL,
	`owner_email` text NOT NULL,
	`work_order_public_id` text NOT NULL,
	`activity_public_id` text NOT NULL,
	`status` text DEFAULT 'Pendiente' NOT NULL,
	`urgency` text DEFAULT 'Normal' NOT NULL,
	`needed_date` text DEFAULT '' NOT NULL,
	`justification` text DEFAULT '' NOT NULL,
	`requested_by_user_public_id` text NOT NULL,
	`requested_by` text NOT NULL,
	`reviewed_by` text DEFAULT '' NOT NULL,
	`reviewed_at` text DEFAULT '' NOT NULL,
	`response_notes` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `material_requests_order_idx` ON `material_requests` (`owner_email`,`work_order_public_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `material_requests_status_idx` ON `material_requests` (`owner_email`,`status`,`needed_date`);