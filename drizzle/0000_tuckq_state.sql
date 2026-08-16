CREATE TABLE `tuckq_state` (
  `key` text PRIMARY KEY NOT NULL,
  `value` text NOT NULL,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_tuckq_state_updated_at` ON `tuckq_state` (`updated_at`);
