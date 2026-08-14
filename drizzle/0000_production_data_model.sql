CREATE TYPE "public"."document_status" AS ENUM('pending', 'generated', 'failed', 'archived');--> statement-breakpoint
CREATE TYPE "public"."integration_status" AS ENUM('started', 'succeeded', 'failed', 'timed_out');--> statement-breakpoint
CREATE TYPE "public"."organization_role" AS ENUM('owner', 'administrator', 'representative', 'auditor');--> statement-breakpoint
CREATE TYPE "public"."organization_type" AS ENUM('osi', 'ksk', 'management_company', 'other');--> statement-breakpoint
CREATE TYPE "public"."participant_status" AS ENUM('eligible', 'ineligible', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."property_type" AS ENUM('apartment', 'non_residential', 'house', 'other');--> statement-breakpoint
CREATE TYPE "public"."question_status" AS ENUM('active', 'inactive');--> statement-breakpoint
CREATE TYPE "public"."record_status" AS ENUM('active', 'inactive', 'blocked');--> statement-breakpoint
CREATE TYPE "public"."signature_status" AS ENUM('pending', 'completed', 'failed', 'expired', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."survey_status" AS ENUM('draft', 'scheduled', 'active', 'closed', 'archived');--> statement-breakpoint
CREATE TYPE "public"."survey_target_type" AS ENUM('building', 'property', 'organization', 'personal_account');--> statement-breakpoint
CREATE TYPE "public"."user_type" AS ENUM('individual', 'organization_representative');--> statement-breakpoint
CREATE TYPE "public"."vote_choice" AS ENUM('for', 'against', 'abstain');--> statement-breakpoint
CREATE TYPE "public"."vote_session_status" AS ENUM('started', 'ready_to_sign', 'signed', 'submitted', 'expired', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."vote_status" AS ENUM('draft', 'submitted', 'invalidated');--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_type" text NOT NULL,
	"actor_user_id" uuid,
	"subject_type" text,
	"subject_id" uuid,
	"request_id" text NOT NULL,
	"outcome" text NOT NULL,
	"ip_hash" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_logs_outcome_valid" CHECK ("audit_logs"."outcome" in ('success', 'failure'))
);
--> statement-breakpoint
CREATE TABLE "auth_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"assurance_level" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"storage_key" text NOT NULL,
	"content_type" text NOT NULL,
	"sha256" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_versions_storage_key_unique" UNIQUE("storage_key"),
	CONSTRAINT "document_versions_version_positive" CHECK ("document_versions"."version" > 0),
	CONSTRAINT "document_versions_size_nonnegative" CHECK ("document_versions"."size_bytes" >= 0)
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vote_id" uuid,
	"survey_id" uuid NOT NULL,
	"document_type" text NOT NULL,
	"status" "document_status" DEFAULT 'pending' NOT NULL,
	"current_version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "external_identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"provider_subject" text NOT NULL,
	"verified_at" timestamp with time zone NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integration_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" text NOT NULL,
	"provider" text NOT NULL,
	"operation" text NOT NULL,
	"status" "integration_status" DEFAULT 'started' NOT NULL,
	"attempts" integer DEFAULT 1 NOT NULL,
	"duration_ms" integer,
	"error_code" text,
	"response_reference" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "integration_requests_request_id_unique" UNIQUE("request_id"),
	CONSTRAINT "integration_requests_attempts_positive" CHECK ("integration_requests"."attempts" > 0)
);
--> statement-breakpoint
CREATE TABLE "organization_members" (
	"user_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"role" "organization_role" NOT NULL,
	"verified_source" text NOT NULL,
	"verified_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_members_user_id_organization_id_pk" PRIMARY KEY("user_id","organization_id")
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bin" text NOT NULL,
	"legal_name" text NOT NULL,
	"display_name" text NOT NULL,
	"type" "organization_type" NOT NULL,
	"status" "record_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_bin_unique" UNIQUE("bin")
);
--> statement-breakpoint
CREATE TABLE "personal_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"external_account_id" text NOT NULL,
	"account_number" text NOT NULL,
	"property_id" uuid NOT NULL,
	"source" text DEFAULT 'mock' NOT NULL,
	"status" "record_status" DEFAULT 'active' NOT NULL,
	"last_verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "properties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"city" text NOT NULL,
	"street" text NOT NULL,
	"building" text NOT NULL,
	"premise" text NOT NULL,
	"property_type" "property_type" NOT NULL,
	"external_property_id" text,
	"source" text DEFAULT 'mock' NOT NULL,
	"status" "record_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "signature_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vote_session_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"provider_request_id" text,
	"document_digest" text NOT NULL,
	"status" "signature_status" DEFAULT 'pending' NOT NULL,
	"evidence_reference" text,
	"expires_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "survey_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"survey_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"personal_account_id" uuid,
	"organization_id" uuid,
	"status" "participant_status" NOT NULL,
	"verified_source" text NOT NULL,
	"verified_at" timestamp with time zone NOT NULL,
	"eligibility_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "survey_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"survey_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"text_ru" text NOT NULL,
	"text_kk" text,
	"required" boolean DEFAULT true NOT NULL,
	"status" "question_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "survey_questions_position_positive" CHECK ("survey_questions"."position" > 0)
);
--> statement-breakpoint
CREATE TABLE "survey_targets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"survey_id" uuid NOT NULL,
	"target_type" "survey_target_type" NOT NULL,
	"organization_id" uuid,
	"property_id" uuid,
	"personal_account_id" uuid,
	"city" text,
	"street" text,
	"building" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "survey_targets_reference_matches_type" CHECK (
    ("survey_targets"."target_type" = 'organization' and "survey_targets"."organization_id" is not null and "survey_targets"."property_id" is null and "survey_targets"."personal_account_id" is null)
    or ("survey_targets"."target_type" = 'property' and "survey_targets"."organization_id" is null and "survey_targets"."property_id" is not null and "survey_targets"."personal_account_id" is null)
    or ("survey_targets"."target_type" = 'personal_account' and "survey_targets"."organization_id" is null and "survey_targets"."property_id" is null and "survey_targets"."personal_account_id" is not null)
    or ("survey_targets"."target_type" = 'building' and "survey_targets"."organization_id" is null and "survey_targets"."property_id" is null and "survey_targets"."personal_account_id" is null and "survey_targets"."city" is not null and "survey_targets"."street" is not null and "survey_targets"."building" is not null)
  )
);
--> statement-breakpoint
CREATE TABLE "surveys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"protocol_number" text NOT NULL,
	"title_ru" text NOT NULL,
	"title_kk" text,
	"status" "survey_status" DEFAULT 'draft' NOT NULL,
	"starts_at" timestamp with time zone,
	"closes_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "surveys_period_valid" CHECK ("surveys"."closes_at" is null or "surveys"."starts_at" is null or "surveys"."closes_at" > "surveys"."starts_at")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"display_name" text NOT NULL,
	"iin_hash" text,
	"phone" text,
	"email" text,
	"type" "user_type" DEFAULT 'individual' NOT NULL,
	"status" "record_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vote_answers" (
	"vote_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"choice" "vote_choice" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vote_answers_vote_id_question_id_pk" PRIMARY KEY("vote_id","question_id")
);
--> statement-breakpoint
CREATE TABLE "vote_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"auth_session_id" uuid NOT NULL,
	"participant_id" uuid NOT NULL,
	"status" "vote_session_status" DEFAULT 'started' NOT NULL,
	"idempotency_key" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"submitted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vote_sessions_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "votes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vote_session_id" uuid NOT NULL,
	"survey_id" uuid NOT NULL,
	"participant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"status" "vote_status" DEFAULT 'draft' NOT NULL,
	"idempotency_key" text NOT NULL,
	"submitted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "votes_vote_session_id_unique" UNIQUE("vote_session_id"),
	CONSTRAINT "votes_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_vote_id_votes_id_fk" FOREIGN KEY ("vote_id") REFERENCES "public"."votes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_survey_id_surveys_id_fk" FOREIGN KEY ("survey_id") REFERENCES "public"."surveys"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_identities" ADD CONSTRAINT "external_identities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_accounts" ADD CONSTRAINT "personal_accounts_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signature_requests" ADD CONSTRAINT "signature_requests_vote_session_id_vote_sessions_id_fk" FOREIGN KEY ("vote_session_id") REFERENCES "public"."vote_sessions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_participants" ADD CONSTRAINT "survey_participants_survey_id_surveys_id_fk" FOREIGN KEY ("survey_id") REFERENCES "public"."surveys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_participants" ADD CONSTRAINT "survey_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_participants" ADD CONSTRAINT "survey_participants_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_participants" ADD CONSTRAINT "survey_participants_personal_account_id_personal_accounts_id_fk" FOREIGN KEY ("personal_account_id") REFERENCES "public"."personal_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_participants" ADD CONSTRAINT "survey_participants_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_questions" ADD CONSTRAINT "survey_questions_survey_id_surveys_id_fk" FOREIGN KEY ("survey_id") REFERENCES "public"."surveys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_targets" ADD CONSTRAINT "survey_targets_survey_id_surveys_id_fk" FOREIGN KEY ("survey_id") REFERENCES "public"."surveys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_targets" ADD CONSTRAINT "survey_targets_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_targets" ADD CONSTRAINT "survey_targets_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_targets" ADD CONSTRAINT "survey_targets_personal_account_id_personal_accounts_id_fk" FOREIGN KEY ("personal_account_id") REFERENCES "public"."personal_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "surveys" ADD CONSTRAINT "surveys_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vote_answers" ADD CONSTRAINT "vote_answers_vote_id_votes_id_fk" FOREIGN KEY ("vote_id") REFERENCES "public"."votes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vote_answers" ADD CONSTRAINT "vote_answers_question_id_survey_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."survey_questions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vote_sessions" ADD CONSTRAINT "vote_sessions_auth_session_id_auth_sessions_id_fk" FOREIGN KEY ("auth_session_id") REFERENCES "public"."auth_sessions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vote_sessions" ADD CONSTRAINT "vote_sessions_participant_id_survey_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."survey_participants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "votes" ADD CONSTRAINT "votes_vote_session_id_vote_sessions_id_fk" FOREIGN KEY ("vote_session_id") REFERENCES "public"."vote_sessions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "votes" ADD CONSTRAINT "votes_survey_id_surveys_id_fk" FOREIGN KEY ("survey_id") REFERENCES "public"."surveys"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "votes" ADD CONSTRAINT "votes_participant_id_survey_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."survey_participants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "votes" ADD CONSTRAINT "votes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "votes" ADD CONSTRAINT "votes_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_logs_request_idx" ON "audit_logs" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "audit_logs_actor_idx" ON "audit_logs" USING btree ("actor_user_id");--> statement-breakpoint
CREATE INDEX "auth_sessions_user_idx" ON "auth_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "document_versions_document_version_unique" ON "document_versions" USING btree ("document_id","version");--> statement-breakpoint
CREATE INDEX "documents_survey_idx" ON "documents" USING btree ("survey_id");--> statement-breakpoint
CREATE UNIQUE INDEX "external_identities_provider_subject_unique" ON "external_identities" USING btree ("provider","provider_subject");--> statement-breakpoint
CREATE INDEX "external_identities_user_idx" ON "external_identities" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "integration_requests_provider_operation_idx" ON "integration_requests" USING btree ("provider","operation");--> statement-breakpoint
CREATE INDEX "organization_members_org_idx" ON "organization_members" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "personal_accounts_source_external_unique" ON "personal_accounts" USING btree ("source","external_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "personal_accounts_source_number_unique" ON "personal_accounts" USING btree ("source","account_number");--> statement-breakpoint
CREATE INDEX "personal_accounts_property_idx" ON "personal_accounts" USING btree ("property_id");--> statement-breakpoint
CREATE UNIQUE INDEX "properties_source_external_unique" ON "properties" USING btree ("source","external_property_id") WHERE "properties"."external_property_id" is not null;--> statement-breakpoint
CREATE INDEX "properties_building_idx" ON "properties" USING btree ("city","street","building");--> statement-breakpoint
CREATE UNIQUE INDEX "signature_requests_provider_request_unique" ON "signature_requests" USING btree ("provider","provider_request_id") WHERE "signature_requests"."provider_request_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "survey_participants_identity_property_unique" ON "survey_participants" USING btree ("survey_id","user_id","property_id");--> statement-breakpoint
CREATE INDEX "survey_participants_survey_idx" ON "survey_participants" USING btree ("survey_id");--> statement-breakpoint
CREATE UNIQUE INDEX "survey_questions_survey_position_unique" ON "survey_questions" USING btree ("survey_id","position");--> statement-breakpoint
CREATE INDEX "survey_targets_survey_idx" ON "survey_targets" USING btree ("survey_id");--> statement-breakpoint
CREATE UNIQUE INDEX "surveys_org_protocol_unique" ON "surveys" USING btree ("organization_id","protocol_number");--> statement-breakpoint
CREATE UNIQUE INDEX "users_iin_hash_unique" ON "users" USING btree ("iin_hash") WHERE "users"."iin_hash" is not null;--> statement-breakpoint
CREATE INDEX "users_email_idx" ON "users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "votes_one_final_vote_unique" ON "votes" USING btree ("survey_id","user_id","property_id") WHERE "votes"."status" = 'submitted';--> statement-breakpoint
CREATE INDEX "votes_participant_idx" ON "votes" USING btree ("participant_id");