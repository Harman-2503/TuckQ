CREATE TABLE `mail_outbox` (
  `id` text PRIMARY KEY NOT NULL,
  `to_email` text NOT NULL,
  `subject` text NOT NULL,
  `body` text NOT NULL,
  `status` text NOT NULL,
  `provider_id` text,
  `reason` text,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_mail_outbox_created_at` ON `mail_outbox` (`created_at`);
