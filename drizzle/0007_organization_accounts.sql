ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "contact_name" text;
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "contact_phone" text;
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "contact_email" text;
--> statement-breakpoint
ALTER TABLE "vote_contact_details" ADD COLUMN IF NOT EXISTS "full_name" text;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_credentials" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"login" text NOT NULL,
	"password_hash" text NOT NULL,
	"must_change_password" boolean DEFAULT true NOT NULL,
	"failed_attempts" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_credentials_login_unique" UNIQUE("login"),
	CONSTRAINT "user_credentials_failed_attempts_nonnegative" CHECK ("user_credentials"."failed_attempts" >= 0)
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "user_credentials" ADD CONSTRAINT "user_credentials_user_id_users_id_fk"
		FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;
