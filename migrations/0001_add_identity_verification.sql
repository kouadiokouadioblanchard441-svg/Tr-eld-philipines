CREATE TABLE "identity_verifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"full_name" text NOT NULL,
	"id_number" text NOT NULL,
	"id_front" text NOT NULL,
	"id_back" text NOT NULL,
	"selfie" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "identity_verifications_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "balance" SET DEFAULT '816';--> statement-breakpoint
ALTER TABLE "deposits" ADD COLUMN "westpay_reference" text;--> statement-breakpoint
ALTER TABLE "deposits" ADD COLUMN "ashtech_transaction_id" text;--> statement-breakpoint
ALTER TABLE "deposits" ADD COLUMN "ashtech_reference" text;--> statement-breakpoint
ALTER TABLE "identity_verifications" ADD CONSTRAINT "identity_verifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;