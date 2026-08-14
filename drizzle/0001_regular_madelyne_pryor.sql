CREATE TABLE "vote_autosaves" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vote_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"payload_sha256" text NOT NULL,
	"state_version" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vote_autosaves_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD COLUMN "token_hash" text;--> statement-breakpoint
UPDATE "auth_sessions" SET "token_hash" = 'legacy-invalidated-' || "id"::text, "revoked_at" = coalesce("revoked_at", now());--> statement-breakpoint
ALTER TABLE "auth_sessions" ALTER COLUMN "token_hash" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "votes" ADD COLUMN "submit_idempotency_key" text;--> statement-breakpoint
ALTER TABLE "votes" ADD COLUMN "state_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "votes" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "vote_autosaves" ADD CONSTRAINT "vote_autosaves_vote_id_votes_id_fk" FOREIGN KEY ("vote_id") REFERENCES "public"."votes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "vote_autosaves_vote_idx" ON "vote_autosaves" USING btree ("vote_id");--> statement-breakpoint
CREATE UNIQUE INDEX "votes_one_workflow_unique" ON "votes" USING btree ("survey_id","user_id","property_id") WHERE "votes"."status" <> 'invalidated';--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_token_hash_unique" UNIQUE("token_hash");--> statement-breakpoint
ALTER TABLE "votes" ADD CONSTRAINT "votes_submit_idempotency_key_unique" UNIQUE("submit_idempotency_key");
