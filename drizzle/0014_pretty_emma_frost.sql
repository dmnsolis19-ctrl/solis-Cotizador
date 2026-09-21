CREATE TABLE `document_sequences` (
	`public_id` text PRIMARY KEY NOT NULL,
	`owner_email` text NOT NULL,
	`scope` text NOT NULL,
	`value` integer DEFAULT 0 NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `document_sequences_owner_scope_uidx` ON `document_sequences` (`owner_email`,`scope`);