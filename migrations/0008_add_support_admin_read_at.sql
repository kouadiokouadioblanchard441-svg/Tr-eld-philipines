ALTER TABLE "support_conversations"
  ADD COLUMN IF NOT EXISTS "admin_read_at" timestamp;