ALTER TABLE "support_messages"
  ADD COLUMN IF NOT EXISTS "edited_by" integer,
  ADD COLUMN IF NOT EXISTS "edited_at" timestamp;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "support_messages"
    ADD CONSTRAINT "support_messages_edited_by_users_id_fk"
    FOREIGN KEY ("edited_by") REFERENCES "public"."users"("id")
    ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;