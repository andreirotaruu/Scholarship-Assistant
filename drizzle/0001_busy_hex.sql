CREATE INDEX `applications_user_updated_idx` ON `applications` (`user_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `experiences_user_verified_idx` ON `experiences` (`user_id`,`verified`);--> statement-breakpoint
CREATE UNIQUE INDEX `profiles_user_id_idx` ON `profiles` (`user_id`);