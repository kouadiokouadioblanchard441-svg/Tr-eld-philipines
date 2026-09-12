CREATE TABLE IF NOT EXISTS "support_messages" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL,
  "sender_role" text NOT NULL,
  "message" text DEFAULT '' NOT NULL,
  "attachment_name" text,
  "attachment_mime_type" text,
  "attachment_data" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;