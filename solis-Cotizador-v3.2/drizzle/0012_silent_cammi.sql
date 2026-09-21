CREATE TABLE `billing_documents` (
	`public_id` text PRIMARY KEY NOT NULL,
	`owner_email` text NOT NULL,
	`number` text NOT NULL,
	`work_order_public_id` text NOT NULL,
	`quote_public_id` text NOT NULL,
	`client_name` text NOT NULL,
	`project` text NOT NULL,
	`concept` text DEFAULT 'Anticipo' NOT NULL,
	`status` text DEFAULT 'Borrador' NOT NULL,
	`currency` text DEFAULT 'CLP' NOT NULL,
	`issue_date` text DEFAULT '' NOT NULL,
	`due_date` text DEFAULT '' NOT NULL,
	`net_amount` text DEFAULT '0' NOT NULL,
	`tax_percent` text DEFAULT '19' NOT NULL,
	`tax_amount` text DEFAULT '0' NOT NULL,
	`total_amount` text DEFAULT '0' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_by` text DEFAULT '' NOT NULL,
	`issued_at` text DEFAULT '' NOT NULL,
	`voided_at` text DEFAULT '' NOT NULL,
	`voided_by` text DEFAULT '' NOT NULL,
	`void_reason` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `billing_owner_number_uidx` ON `billing_documents` (`owner_email`,`number`);--> statement-breakpoint
CREATE INDEX `billing_owner_order_status_idx` ON `billing_documents` (`owner_email`,`work_order_public_id`,`status`);--> statement-breakpoint
CREATE INDEX `billing_owner_due_idx` ON `billing_documents` (`owner_email`,`due_date`,`status`);--> statement-breakpoint
CREATE TABLE `billing_payments` (
	`public_id` text PRIMARY KEY NOT NULL,
	`owner_email` text NOT NULL,
	`billing_document_public_id` text NOT NULL,
	`payment_date` text NOT NULL,
	`amount` text DEFAULT '0' NOT NULL,
	`method` text DEFAULT 'Transferencia' NOT NULL,
	`reference` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`recorded_by` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `billing_payments_document_idx` ON `billing_payments` (`owner_email`,`billing_document_public_id`,`payment_date`);