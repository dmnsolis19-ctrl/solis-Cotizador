CREATE TABLE `work_order_evidence` (
	`public_id` text PRIMARY KEY NOT NULL,
	`owner_email` text NOT NULL,
	`work_order_public_id` text NOT NULL,
	`storage_key` text NOT NULL,
	`file_name` text NOT NULL,
	`content_type` text NOT NULL,
	`byte_size` integer DEFAULT 0 NOT NULL,
	`caption` text DEFAULT '' NOT NULL,
	`created_by_user_public_id` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `evidence_order_idx` ON `work_order_evidence` (`owner_email`,`work_order_public_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `work_order_signoffs` (
	`public_id` text PRIMARY KEY NOT NULL,
	`owner_email` text NOT NULL,
	`work_order_public_id` text NOT NULL,
	`customer_name` text NOT NULL,
	`customer_role` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`storage_key` text NOT NULL,
	`signed_at` text NOT NULL,
	`created_by_user_public_id` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `signoffs_order_idx` ON `work_order_signoffs` (`owner_email`,`work_order_public_id`,`signed_at`);