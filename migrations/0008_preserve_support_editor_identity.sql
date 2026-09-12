ALTER TABLE "support_messages"
  ADD COLUMN IF NOT EXISTS "edited_by_name" text;
--> statement-breakpoint
ALTER TABLE "support_message_edit_audit"
  ADD COLUMN IF NOT EXISTS "edited_by_name" text;
--> statement-breakpoint
UPDATE "support_messages" AS message
SET "edited_by_name" = editor."full_name"
FROM "users" AS editor
WHERE message."edited_by" = editor."id"
  AND message."edited_by_name" IS NULL;
--> statement-breakpoint
UPDATE "support_message_edit_audit" AS audit
SET "edited_by_name" = editor."full_name"
FROM "users" AS editor
WHERE audit."edited_by" = editor."id"
  AND audit."edited_by_name" IS NULL;