CREATE TABLE IF NOT EXISTS "support_message_edit_audit" (
  "id" serial PRIMARY KEY NOT NULL,
  "message_id" integer NOT NULL,
  "previous_message" text NOT NULL,
  "edited_by" integer,
  "edited_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "support_message_edit_audit"
    ADD CONSTRAINT "support_message_edit_audit_message_id_support_messages_id_fk"
    FOREIGN KEY ("message_id") REFERENCES "public"."support_messages"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "support_message_edit_audit"
    ADD CONSTRAINT "support_message_edit_audit_edited_by_users_id_fk"
    FOREIGN KEY ("edited_by") REFERENCES "public"."users"("id")
    ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "support_message_edit_audit_message_id_idx"
  ON "support_message_edit_audit" ("message_id");