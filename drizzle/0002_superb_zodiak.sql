CREATE TABLE "binary_assets" ("storage_key" text PRIMARY KEY NOT NULL,"content_type" text NOT NULL,"bytes" bytea NOT NULL,"sha256" text NOT NULL,"size_bytes" integer NOT NULL,"created_at" timestamp with time zone DEFAULT now() NOT NULL,CONSTRAINT "binary_assets_size_nonnegative" CHECK ("binary_assets"."size_bytes" >= 0));
--> statement-breakpoint
CREATE TABLE "visual_signatures" ("id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,"vote_id" uuid NOT NULL,"storage_key" text NOT NULL,"sha256" text NOT NULL,"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,"created_at" timestamp with time zone DEFAULT now() NOT NULL,CONSTRAINT "visual_signatures_vote_id_unique" UNIQUE("vote_id"));
--> statement-breakpoint
ALTER TABLE "signature_requests" ALTER COLUMN "status" SET DATA TYPE text;
--> statement-breakpoint
UPDATE "signature_requests" SET "status" = 'verified' WHERE "status" = 'completed';
--> statement-breakpoint
ALTER TABLE "signature_requests" ALTER COLUMN "status" SET DEFAULT 'created'::text;
--> statement-breakpoint
DROP TYPE "public"."signature_status";
--> statement-breakpoint
CREATE TYPE "public"."signature_status" AS ENUM('created', 'pending', 'verified', 'finalized', 'failed', 'expired', 'cancelled');
--> statement-breakpoint
ALTER TABLE "signature_requests" ALTER COLUMN "status" SET DEFAULT 'created'::"public"."signature_status";
--> statement-breakpoint
ALTER TABLE "signature_requests" ALTER COLUMN "status" SET DATA TYPE "public"."signature_status" USING "status"::"public"."signature_status";
--> statement-breakpoint
ALTER TABLE "vote_sessions" ALTER COLUMN "status" SET DATA TYPE text;
--> statement-breakpoint
UPDATE "vote_sessions" SET "status" = 'draft' WHERE "status" = 'started';
--> statement-breakpoint
UPDATE "vote_sessions" SET "status" = 'voided' WHERE "status" IN ('expired', 'cancelled');
--> statement-breakpoint
ALTER TABLE "vote_sessions" ALTER COLUMN "status" SET DEFAULT 'draft'::text;
--> statement-breakpoint
DROP TYPE "public"."vote_session_status";
--> statement-breakpoint
CREATE TYPE "public"."vote_session_status" AS ENUM('draft', 'ready_to_sign', 'signing', 'signed', 'submitted', 'voided');
--> statement-breakpoint
ALTER TABLE "vote_sessions" ALTER COLUMN "status" SET DEFAULT 'draft'::"public"."vote_session_status";
--> statement-breakpoint
ALTER TABLE "vote_sessions" ALTER COLUMN "status" SET DATA TYPE "public"."vote_session_status" USING "status"::"public"."vote_session_status";
--> statement-breakpoint
DROP INDEX "votes_one_final_vote_unique";
--> statement-breakpoint
DROP INDEX "votes_one_workflow_unique";
--> statement-breakpoint
ALTER TABLE "votes" ALTER COLUMN "status" SET DATA TYPE text;
--> statement-breakpoint
UPDATE "votes" SET "status" = 'voided' WHERE "status" = 'invalidated';
--> statement-breakpoint
ALTER TABLE "votes" ALTER COLUMN "status" SET DEFAULT 'draft'::text;
--> statement-breakpoint
DROP TYPE "public"."vote_status";
--> statement-breakpoint
CREATE TYPE "public"."vote_status" AS ENUM('draft', 'ready_to_sign', 'signing', 'signed', 'submitted', 'voided');
--> statement-breakpoint
ALTER TABLE "votes" ALTER COLUMN "status" SET DEFAULT 'draft'::"public"."vote_status";
--> statement-breakpoint
ALTER TABLE "votes" ALTER COLUMN "status" SET DATA TYPE "public"."vote_status" USING "status"::"public"."vote_status";
--> statement-breakpoint
ALTER TABLE "document_versions" ADD COLUMN "survey_version" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE "document_versions" ADD COLUMN "canonical_sha256" text DEFAULT 'legacy-unavailable' NOT NULL;
--> statement-breakpoint
ALTER TABLE "document_versions" ADD COLUMN "signing_provider" text DEFAULT 'legacy' NOT NULL;
--> statement-breakpoint
ALTER TABLE "document_versions" ADD COLUMN "signing_status" "signature_status" DEFAULT 'finalized' NOT NULL;
--> statement-breakpoint
ALTER TABLE "document_versions" ADD COLUMN "verification_reference" text DEFAULT 'legacy-unavailable' NOT NULL;
--> statement-breakpoint
ALTER TABLE "document_versions" ADD COLUMN "immutable" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE "document_versions" ALTER COLUMN "survey_version" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "document_versions" ALTER COLUMN "canonical_sha256" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "document_versions" ALTER COLUMN "signing_provider" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "document_versions" ALTER COLUMN "signing_status" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "document_versions" ALTER COLUMN "verification_reference" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "public_id" uuid DEFAULT gen_random_uuid() NOT NULL;
--> statement-breakpoint
ALTER TABLE "signature_requests" ADD COLUMN "vote_id" uuid;
--> statement-breakpoint
UPDATE "signature_requests" sr SET "vote_id" = v."id" FROM "votes" v WHERE v."vote_session_id" = sr."vote_session_id";
--> statement-breakpoint
ALTER TABLE "signature_requests" ALTER COLUMN "vote_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "signature_requests" ADD COLUMN "evidence" jsonb;
--> statement-breakpoint
ALTER TABLE "surveys" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE "votes" ADD COLUMN "canonical_payload" jsonb;
--> statement-breakpoint
ALTER TABLE "votes" ADD COLUMN "canonical_sha256" text;
--> statement-breakpoint
ALTER TABLE "votes" ADD COLUMN "signed_sha256" text;
--> statement-breakpoint
ALTER TABLE "votes" ADD COLUMN "signing_provider" text;
--> statement-breakpoint
ALTER TABLE "votes" ADD COLUMN "ready_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "votes" ADD COLUMN "signed_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "visual_signatures" ADD CONSTRAINT "visual_signatures_vote_id_votes_id_fk" FOREIGN KEY ("vote_id") REFERENCES "public"."votes"("id") ON DELETE restrict;
--> statement-breakpoint
ALTER TABLE "visual_signatures" ADD CONSTRAINT "visual_signatures_storage_key_binary_assets_storage_key_fk" FOREIGN KEY ("storage_key") REFERENCES "public"."binary_assets"("storage_key") ON DELETE restrict;
--> statement-breakpoint
ALTER TABLE "signature_requests" ADD CONSTRAINT "signature_requests_vote_id_votes_id_fk" FOREIGN KEY ("vote_id") REFERENCES "public"."votes"("id") ON DELETE restrict;
--> statement-breakpoint
CREATE UNIQUE INDEX "documents_vote_unique" ON "documents" USING btree ("vote_id") WHERE "vote_id" is not null;
--> statement-breakpoint
CREATE UNIQUE INDEX "signature_requests_active_vote_unique" ON "signature_requests" USING btree ("vote_id") WHERE "status" in ('created', 'pending', 'verified');
--> statement-breakpoint
CREATE UNIQUE INDEX "votes_one_workflow_unique" ON "votes" USING btree ("survey_id","user_id","property_id") WHERE "status" <> 'voided';
--> statement-breakpoint
CREATE UNIQUE INDEX "votes_one_final_vote_unique" ON "votes" USING btree ("survey_id","user_id","property_id") WHERE "status" = 'submitted';
--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_public_id_unique" UNIQUE("public_id");
