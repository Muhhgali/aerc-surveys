CREATE TYPE "public"."meeting_form" AS ENUM('in_person', 'absentee', 'mixed', 'electronic');
--> statement-breakpoint
CREATE TYPE "public"."document_language" AS ENUM('ru', 'kk', 'bilingual');
--> statement-breakpoint
CREATE TYPE "public"."invitation_status" AS ENUM('pending', 'accepted', 'expired', 'revoked');
--> statement-breakpoint
CREATE TYPE "public"."otp_channel" AS ENUM('whatsapp', 'email', 'invite', 'mock');
--> statement-breakpoint
ALTER TABLE "surveys" ADD COLUMN "meeting_form" "meeting_form" DEFAULT 'electronic' NOT NULL;
--> statement-breakpoint
ALTER TABLE "surveys" ADD COLUMN "document_language" "document_language" DEFAULT 'ru' NOT NULL;
--> statement-breakpoint
ALTER TABLE "survey_questions" ADD COLUMN "voting_rule" jsonb DEFAULT '{"type":"percentage_of_all_eligible","thresholdPercent":51}'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "votes" ADD COLUMN "sheet_number" integer;
--> statement-breakpoint
CREATE UNIQUE INDEX "votes_survey_sheet_unique" ON "votes" USING btree ("survey_id","sheet_number") WHERE "sheet_number" is not null;
--> statement-breakpoint
CREATE UNIQUE INDEX "documents_survey_protocol_unique" ON "documents" USING btree ("survey_id") WHERE "document_type" = 'protocol';
--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"display_name" text NOT NULL,
	"organization_id" uuid NOT NULL,
	"organization_role" text NOT NULL,
	"permissions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"token_hash" text NOT NULL,
	"status" "invitation_status" DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"invited_by_user_id" uuid,
	"accepted_at" timestamp with time zone,
	"accepted_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invitations_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "organization_access_grants" (
	"user_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"role_key" text NOT NULL,
	"permissions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"assigned_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_access_grants_user_id_organization_id_role_key_pk" PRIMARY KEY("user_id","organization_id","role_key")
);
--> statement-breakpoint
CREATE TABLE "survey_signatories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"survey_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "survey_signature_policies" (
	"survey_id" uuid NOT NULL,
	"role_key" text NOT NULL,
	"min_required" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "survey_signature_policies_survey_id_role_key_pk" PRIMARY KEY("survey_id","role_key"),
	CONSTRAINT "survey_signature_policies_min_nonnegative" CHECK ("min_required" >= 0)
);
--> statement-breakpoint
CREATE TABLE "otp_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel" "otp_channel" NOT NULL,
	"recipient_hash" text NOT NULL,
	"code_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"consumed_at" timestamp with time zone,
	"last_sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "otp_challenges_attempts_nonnegative" CHECK ("attempt_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "vote_contact_details" (
	"vote_id" uuid PRIMARY KEY NOT NULL,
	"phone" text,
	"email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vote_contact_details_has_value" CHECK ("phone" is not null or "email" is not null)
);
--> statement-breakpoint
CREATE TABLE "survey_eligibility_snapshots" (
	"survey_id" uuid PRIMARY KEY NOT NULL,
	"eligible_total" integer NOT NULL,
	"apartment_owners" integer DEFAULT 0 NOT NULL,
	"non_residential_owners" integer DEFAULT 0 NOT NULL,
	"snapshot" jsonb NOT NULL,
	"sha256" text NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "survey_result_snapshots" (
	"survey_id" uuid PRIMARY KEY NOT NULL,
	"snapshot" jsonb NOT NULL,
	"sha256" text NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "official_signatures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"survey_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role_key" text NOT NULL,
	"visual_storage_key" text NOT NULL,
	"result_sha256" text NOT NULL,
	"signed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invited_by_user_id_users_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_accepted_user_id_users_id_fk" FOREIGN KEY ("accepted_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "organization_access_grants" ADD CONSTRAINT "organization_access_grants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "organization_access_grants" ADD CONSTRAINT "organization_access_grants_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "organization_access_grants" ADD CONSTRAINT "organization_access_grants_assigned_by_user_id_users_id_fk" FOREIGN KEY ("assigned_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "survey_signatories" ADD CONSTRAINT "survey_signatories_survey_id_surveys_id_fk" FOREIGN KEY ("survey_id") REFERENCES "public"."surveys"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "survey_signatories" ADD CONSTRAINT "survey_signatories_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "survey_signature_policies" ADD CONSTRAINT "survey_signature_policies_survey_id_surveys_id_fk" FOREIGN KEY ("survey_id") REFERENCES "public"."surveys"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "vote_contact_details" ADD CONSTRAINT "vote_contact_details_vote_id_votes_id_fk" FOREIGN KEY ("vote_id") REFERENCES "public"."votes"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "survey_eligibility_snapshots" ADD CONSTRAINT "survey_eligibility_snapshots_survey_id_surveys_id_fk" FOREIGN KEY ("survey_id") REFERENCES "public"."surveys"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "survey_result_snapshots" ADD CONSTRAINT "survey_result_snapshots_survey_id_surveys_id_fk" FOREIGN KEY ("survey_id") REFERENCES "public"."surveys"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "official_signatures" ADD CONSTRAINT "official_signatures_survey_id_surveys_id_fk" FOREIGN KEY ("survey_id") REFERENCES "public"."surveys"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "official_signatures" ADD CONSTRAINT "official_signatures_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "official_signatures" ADD CONSTRAINT "official_signatures_visual_storage_key_binary_assets_storage_key_fk" FOREIGN KEY ("visual_storage_key") REFERENCES "public"."binary_assets"("storage_key") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "invitations_org_idx" ON "invitations" USING btree ("organization_id","status");
--> statement-breakpoint
CREATE INDEX "invitations_email_idx" ON "invitations" USING btree ("email");
--> statement-breakpoint
CREATE INDEX "organization_access_grants_org_idx" ON "organization_access_grants" USING btree ("organization_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "survey_signatories_unique" ON "survey_signatories" USING btree ("survey_id","user_id","role_key");
--> statement-breakpoint
CREATE INDEX "survey_signatories_survey_idx" ON "survey_signatories" USING btree ("survey_id");
--> statement-breakpoint
CREATE INDEX "otp_challenges_recipient_idx" ON "otp_challenges" USING btree ("recipient_hash","created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "official_signatures_unique" ON "official_signatures" USING btree ("survey_id","user_id","role_key");
--> statement-breakpoint
CREATE INDEX "official_signatures_survey_idx" ON "official_signatures" USING btree ("survey_id");
--> statement-breakpoint
INSERT INTO "platform_permissions" ("permission_key", "description_ru") VALUES
 ('survey.results.read_live', 'Технический просмотр голосов до закрытия'),
 ('survey.progress.read', 'Просмотр прогресса участия без разбивки голосов'),
 ('survey.signatory.manage', 'Назначение подписантов опроса'),
 ('survey.sign', 'Подписание итогов опроса'),
 ('protocol.generate', 'Формирование итогового протокола'),
 ('user.invite', 'Приглашение пользователей'),
 ('org.manage', 'Управление организациями')
ON CONFLICT ("permission_key") DO NOTHING;
--> statement-breakpoint
INSERT INTO "role_permissions" ("role_id", "permission_key")
SELECT r.id, p.permission_key
FROM platform_roles r
CROSS JOIN platform_permissions p
WHERE p.permission_key IN ('survey.results.read_live','survey.progress.read','survey.signatory.manage','survey.sign','protocol.generate','user.invite','org.manage')
  AND (
    (r.role_key = 'super_admin')
    OR (r.role_key = 'admin' AND p.permission_key <> 'survey.results.read_live')
    OR (r.role_key = 'survey_manager' AND p.permission_key IN ('survey.progress.read','survey.signatory.manage','protocol.generate'))
    OR (r.role_key = 'operator' AND p.permission_key IN ('survey.progress.read'))
    OR (r.role_key = 'auditor' AND p.permission_key IN ('survey.progress.read'))
    OR (r.role_key = 'viewer' AND p.permission_key IN ('survey.progress.read'))
  )
ON CONFLICT DO NOTHING;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION prevent_published_survey_content_mutation() RETURNS trigger AS $$
BEGIN
  IF OLD.status <> 'draft' AND (
    NEW.organization_id IS DISTINCT FROM OLD.organization_id OR
    NEW.protocol_number IS DISTINCT FROM OLD.protocol_number OR
    NEW.version IS DISTINCT FROM OLD.version OR
    NEW.title_ru IS DISTINCT FROM OLD.title_ru OR
    NEW.title_kk IS DISTINCT FROM OLD.title_kk OR
    NEW.description_ru IS DISTINCT FROM OLD.description_ru OR
    NEW.description_kk IS DISTINCT FROM OLD.description_kk OR
    NEW.starts_at IS DISTINCT FROM OLD.starts_at OR
    NEW.closes_at IS DISTINCT FROM OLD.closes_at OR
    NEW.meeting_form IS DISTINCT FROM OLD.meeting_form OR
    NEW.document_language IS DISTINCT FROM OLD.document_language
  ) THEN
    RAISE EXCEPTION 'published survey content is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION prevent_published_survey_child_mutation() RETURNS trigger AS $$
DECLARE target_survey_id uuid; target_status survey_status;
BEGIN
  target_survey_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.survey_id ELSE NEW.survey_id END;
  SELECT status INTO target_status FROM surveys WHERE id = target_survey_id;
  IF target_status <> 'draft' THEN
    IF TG_OP = 'UPDATE' AND NEW.survey_id = OLD.survey_id AND
       NEW.position IS NOT DISTINCT FROM OLD.position AND NEW.text_ru IS NOT DISTINCT FROM OLD.text_ru AND
       NEW.text_kk IS NOT DISTINCT FROM OLD.text_kk AND NEW.required IS NOT DISTINCT FROM OLD.required AND
       NEW.status IS NOT DISTINCT FROM OLD.status AND NEW.voting_rule IS NOT DISTINCT FROM OLD.voting_rule THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'published survey questions are immutable' USING ERRCODE = '23514';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION prevent_published_signatory_mutation() RETURNS trigger AS $$
DECLARE target_survey_id uuid; target_status survey_status;
BEGIN
  target_survey_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.survey_id ELSE NEW.survey_id END;
  SELECT status INTO target_status FROM surveys WHERE id = target_survey_id;
  IF target_status <> 'draft' THEN
    RAISE EXCEPTION 'published survey signatories are immutable' USING ERRCODE = '23514';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER survey_signatories_published_immutable BEFORE INSERT OR UPDATE OR DELETE ON survey_signatories
FOR EACH ROW EXECUTE FUNCTION prevent_published_signatory_mutation();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION prevent_published_signature_policy_mutation() RETURNS trigger AS $$
DECLARE target_survey_id uuid; target_status survey_status;
BEGIN
  target_survey_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.survey_id ELSE NEW.survey_id END;
  SELECT status INTO target_status FROM surveys WHERE id = target_survey_id;
  IF target_status <> 'draft' THEN
    RAISE EXCEPTION 'published signature policy is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER survey_signature_policies_published_immutable BEFORE INSERT OR UPDATE OR DELETE ON survey_signature_policies
FOR EACH ROW EXECUTE FUNCTION prevent_published_signature_policy_mutation();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION prevent_vote_contact_mutation_after_lock() RETURNS trigger AS $$
DECLARE vote_status vote_status;
BEGIN
  SELECT status INTO vote_status FROM votes WHERE id = NEW.vote_id;
  IF vote_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'vote contact details are immutable after lock' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER vote_contact_details_immutable AFTER INSERT OR UPDATE ON vote_contact_details
FOR EACH ROW EXECUTE FUNCTION prevent_vote_contact_mutation_after_lock();
