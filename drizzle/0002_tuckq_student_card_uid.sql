ALTER TABLE `tuckq_students` ADD `card_uid` text;
--> statement-breakpoint
CREATE INDEX `idx_tuckq_students_card_uid` ON `tuckq_students` (`card_uid`);
