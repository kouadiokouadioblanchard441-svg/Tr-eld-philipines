-- Configure how many manual tasks each product exposes and the reward per task.
ALTER TABLE IF EXISTS "products"
  ADD COLUMN IF NOT EXISTS "daily_task_count" integer NOT NULL DEFAULT 1;

ALTER TABLE IF EXISTS "products"
  ADD COLUMN IF NOT EXISTS "task_reward" integer NOT NULL DEFAULT 300;

-- Preserve the existing daily product earning for products created before the
-- manual-task flow. New products calculate daily_earnings from task settings.
UPDATE "products"
SET "task_reward" = "daily_earnings"
WHERE "daily_task_count" = 1
  AND "task_reward" = 300
  AND "daily_earnings" <> 300;

CREATE TABLE IF NOT EXISTS "user_product_task_claims" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_product_id" integer NOT NULL REFERENCES "user_products"("id") ON DELETE CASCADE,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "task_number" integer NOT NULL,
  "claim_date" date NOT NULL,
  "reward" integer NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "user_product_task_day_unique"
    UNIQUE("user_product_id", "task_number", "claim_date")
);