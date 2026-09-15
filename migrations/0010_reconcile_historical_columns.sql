-- Compatibility migration for imported Neon databases.
--
-- This migration is intentionally additive. It only fills in columns that
-- older installations may not have; it never creates, renames, alters, or
-- removes a table, column, or row. `IF EXISTS` also keeps the migration safe
-- when an older database does not contain one of the affected tables yet.

ALTER TABLE IF EXISTS "users"
  ADD COLUMN IF NOT EXISTS "earnings_balance" numeric(15, 2) NOT NULL DEFAULT '0',
  ADD COLUMN IF NOT EXISTS "avatar_url" text;
--> statement-breakpoint

ALTER TABLE IF EXISTS "deposits"
  ADD COLUMN IF NOT EXISTS "payment_channel_id" integer,
  ADD COLUMN IF NOT EXISTS "payment_number_id" integer,
  ADD COLUMN IF NOT EXISTS "channel_name" text,
  ADD COLUMN IF NOT EXISTS "screenshot" text,
  ADD COLUMN IF NOT EXISTS "payment_message" text,
  ADD COLUMN IF NOT EXISTS "reference" text,
  ADD COLUMN IF NOT EXISTS "soleaspay_reference" text,
  ADD COLUMN IF NOT EXISTS "soleaspay_order_id" text,
  ADD COLUMN IF NOT EXISTS "inpay_order_number" text,
  ADD COLUMN IF NOT EXISTS "inpay_out_trade_no" text,
  ADD COLUMN IF NOT EXISTS "omnipay_id" text,
  ADD COLUMN IF NOT EXISTS "omnipay_reference" text,
  ADD COLUMN IF NOT EXISTS "sendavapay_reference" text,
  ADD COLUMN IF NOT EXISTS "sendavapay_token" text,
  ADD COLUMN IF NOT EXISTS "westpay_reference" text,
  ADD COLUMN IF NOT EXISTS "ashtech_transaction_id" text,
  ADD COLUMN IF NOT EXISTS "ashtech_reference" text,
  ADD COLUMN IF NOT EXISTS "processed_at" timestamp,
  ADD COLUMN IF NOT EXISTS "processed_by" integer;
--> statement-breakpoint

ALTER TABLE IF EXISTS "user_products"
  ADD COLUMN IF NOT EXISTS "days_remaining" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "total_earned" numeric(15, 2) NOT NULL DEFAULT '0',
  ADD COLUMN IF NOT EXISTS "is_active" boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "assigned_by_admin" boolean NOT NULL DEFAULT false;
--> statement-breakpoint

ALTER TABLE IF EXISTS "tasks"
  ADD COLUMN IF NOT EXISTS "sort_order" integer NOT NULL DEFAULT 0;
--> statement-breakpoint

ALTER TABLE IF EXISTS "user_tasks"
  ADD COLUMN IF NOT EXISTS "reward_claimed" boolean NOT NULL DEFAULT true;
--> statement-breakpoint

ALTER TABLE IF EXISTS "withdrawals"
  ADD COLUMN IF NOT EXISTS "net_amount" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "fees" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "account_name" text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "account_number" text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "payment_method" text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "inpay_order_number" text,
  ADD COLUMN IF NOT EXISTS "inpay_out_trade_no" text,
  ADD COLUMN IF NOT EXISTS "omnipay_id" text,
  ADD COLUMN IF NOT EXISTS "omnipay_reference" text,
  ADD COLUMN IF NOT EXISTS "processed_at" timestamp,
  ADD COLUMN IF NOT EXISTS "processed_by" integer;
--> statement-breakpoint

ALTER TABLE IF EXISTS "payment_channels"
  ADD COLUMN IF NOT EXISTS "redirect_url" text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "is_api" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "created_at" timestamp NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS "modified_by" integer,
  ADD COLUMN IF NOT EXISTS "modified_at" timestamp;
--> statement-breakpoint

ALTER TABLE IF EXISTS "payment_numbers"
  ADD COLUMN IF NOT EXISTS "sort_order" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "created_at" timestamp NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS "created_by" integer;
--> statement-breakpoint

ALTER TABLE IF EXISTS "staking_products"
  ADD COLUMN IF NOT EXISTS "description" text,
  ADD COLUMN IF NOT EXISTS "price" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "return_amount" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "lock_days" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "launch_date" timestamp,
  ADD COLUMN IF NOT EXISTS "image_url" text,
  ADD COLUMN IF NOT EXISTS "sort_order" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "created_at" timestamp NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS "created_by" integer;
--> statement-breakpoint

ALTER TABLE IF EXISTS "user_stakings"
  ADD COLUMN IF NOT EXISTS "amount_paid" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "return_amount" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "purchased_at" timestamp NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS "release_date" timestamp NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS "released_at" timestamp;
--> statement-breakpoint

ALTER TABLE IF EXISTS "referral_commissions"
  ADD COLUMN IF NOT EXISTS "product_id" integer;
--> statement-breakpoint

ALTER TABLE IF EXISTS "platform_settings"
  ADD COLUMN IF NOT EXISTS "modified_by" integer,
  ADD COLUMN IF NOT EXISTS "modified_at" timestamp;
--> statement-breakpoint

ALTER TABLE IF EXISTS "transactions"
  ADD COLUMN IF NOT EXISTS "description" text NOT NULL DEFAULT '';