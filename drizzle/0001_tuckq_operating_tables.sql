CREATE TABLE `tuckq_students` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `class_name` text,
  `email` text,
  `password` text,
  `account_limit` integer DEFAULT 2500 NOT NULL,
  `status` text DEFAULT 'active' NOT NULL,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_tuckq_students_status` ON `tuckq_students` (`status`);
--> statement-breakpoint
CREATE TABLE `tuckq_catalogue` (
  `id` text PRIMARY KEY NOT NULL,
  `day` text NOT NULL,
  `name` text NOT NULL,
  `category` text,
  `price` integer NOT NULL,
  `stock` integer DEFAULT 0 NOT NULL,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_tuckq_catalogue_day` ON `tuckq_catalogue` (`day`);
--> statement-breakpoint
CREATE TABLE `tuckq_queue` (
  `number` integer PRIMARY KEY NOT NULL,
  `student_id` text NOT NULL,
  `student_name` text NOT NULL,
  `joined` text,
  `wait` text,
  `status` text NOT NULL,
  `slot` text,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_tuckq_queue_status` ON `tuckq_queue` (`status`);
--> statement-breakpoint
CREATE TABLE `tuckq_bookings` (
  `student_id` text PRIMARY KEY NOT NULL,
  `student_name` text NOT NULL,
  `slot` text NOT NULL,
  `ticket` integer,
  `created` text,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_tuckq_bookings_slot` ON `tuckq_bookings` (`slot`);
--> statement-breakpoint
CREATE TABLE `tuckq_sales` (
  `bill_no` text PRIMARY KEY NOT NULL,
  `student_id` text NOT NULL,
  `student_name` text NOT NULL,
  `cashier` text,
  `channel` text,
  `pickup_status` text,
  `date` text,
  `time` text,
  `iso` text,
  `total` integer DEFAULT 0 NOT NULL,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_tuckq_sales_student_date` ON `tuckq_sales` (`student_id`,`date`);
--> statement-breakpoint
CREATE INDEX `idx_tuckq_sales_date` ON `tuckq_sales` (`date`);
--> statement-breakpoint
CREATE TABLE `tuckq_sale_items` (
  `id` text PRIMARY KEY NOT NULL,
  `bill_no` text NOT NULL,
  `item_id` text,
  `item_name` text NOT NULL,
  `qty` integer DEFAULT 1 NOT NULL,
  `price` integer NOT NULL,
  `total` integer NOT NULL,
  FOREIGN KEY (`bill_no`) REFERENCES `tuckq_sales`(`bill_no`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_tuckq_sale_items_bill_no` ON `tuckq_sale_items` (`bill_no`);
--> statement-breakpoint
CREATE TABLE `tuckq_preorders` (
  `bill_no` text PRIMARY KEY NOT NULL,
  `student_id` text NOT NULL,
  `student_name` text NOT NULL,
  `pickup_slot` text,
  `status` text NOT NULL,
  `total` integer DEFAULT 0 NOT NULL,
  `items_json` text NOT NULL,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_tuckq_preorders_status` ON `tuckq_preorders` (`status`);
--> statement-breakpoint
CREATE TABLE `tuckq_mail_events` (
  `id` text PRIMARY KEY NOT NULL,
  `date` text,
  `time` text,
  `to_email` text,
  `student_id` text,
  `student_name` text,
  `subject` text,
  `body` text,
  `type` text,
  `status` text,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_tuckq_mail_events_student_id` ON `tuckq_mail_events` (`student_id`);
--> statement-breakpoint
CREATE TABLE `tuckq_settings` (
  `key` text PRIMARY KEY NOT NULL,
  `value` text NOT NULL,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
