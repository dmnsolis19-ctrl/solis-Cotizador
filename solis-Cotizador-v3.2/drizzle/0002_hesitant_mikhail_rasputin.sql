CREATE TABLE `document_snapshots` (
	`public_id` text PRIMARY KEY NOT NULL,
	`owner_email` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_public_id` text NOT NULL,
	`document_number` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`storage_key` text NOT NULL,
	`file_name` text NOT NULL,
	`content_type` text DEFAULT 'application/pdf' NOT NULL,
	`byte_size` integer DEFAULT 0 NOT NULL,
	`sha256` text DEFAULT '' NOT NULL,
	`created_by` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `documents_owner_entity_version_uidx` ON `document_snapshots` (`owner_email`,`entity_type`,`entity_public_id`,`version`);--> statement-breakpoint
CREATE INDEX `documents_owner_entity_idx` ON `document_snapshots` (`owner_email`,`entity_type`,`entity_public_id`,`created_at`);