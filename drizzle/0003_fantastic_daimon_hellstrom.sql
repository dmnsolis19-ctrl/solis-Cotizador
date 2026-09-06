CREATE TABLE `sync_receipts` (
	`operation_id` text PRIMARY KEY NOT NULL,
	`owner_email` text NOT NULL,
	`operation_type` text NOT NULL,
	`payload_hash` text NOT NULL,
	`result_json` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `sync_receipts_owner_idx` ON `sync_receipts` (`owner_email`,`created_at`);