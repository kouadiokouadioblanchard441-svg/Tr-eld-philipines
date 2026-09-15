-- Allow each mission to define how a referred person qualifies.
ALTER TABLE IF EXISTS "tasks"
  ADD COLUMN IF NOT EXISTS "condition_type" text NOT NULL DEFAULT 'deposit_or_product';