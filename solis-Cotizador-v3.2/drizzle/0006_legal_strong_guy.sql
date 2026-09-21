CREATE TABLE `user_notifications` (
	`public_id` text PRIMARY KEY NOT NULL,
	`owner_email` text NOT NULL,
	`recipient_user_public_id` text NOT NULL,
	`recipient_email` text NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`message` text DEFAULT '' NOT NULL,
	`entity_type` text DEFAULT '' NOT NULL,
	`entity_public_id` text DEFAULT '' NOT NULL,
	`read_at` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `notifications_recipient_idx` ON `user_notifications` (`owner_email`,`recipient_user_public_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `notifications_unread_idx` ON `user_notifications` (`owner_email`,`recipient_user_public_id`,`read_at`);--> statement-breakpoint
ALTER TABLE `work_orders` ADD `assigned_user_public_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `work_orders` ADD `assigned_user_email` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `work_orders` ADD `priority` text DEFAULT 'Normal' NOT NULL;--> statement-breakpoint
ALTER TABLE `work_orders` ADD `due_date` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `work_orders` ADD `assignment_updated_at` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE INDEX `work_orders_owner_assignee_idx` ON `work_orders` (`owner_email`,`assigned_user_public_id`,`status`);