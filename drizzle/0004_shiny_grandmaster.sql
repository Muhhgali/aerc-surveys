CREATE TABLE "platform_access_controls" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"disabled_at" timestamp with time zone,
	"disabled_by_user_id" uuid,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_permissions" (
	"permission_key" text PRIMARY KEY NOT NULL,
	"description_ru" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"role_key" text NOT NULL,
	"name_ru" text NOT NULL,
	"description_ru" text DEFAULT '' NOT NULL,
	"system" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_roles_role_key_unique" UNIQUE("role_key")
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"role_id" uuid NOT NULL,
	"permission_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "role_permissions_role_id_permission_key_pk" PRIMARY KEY("role_id","permission_key")
);
--> statement-breakpoint
CREATE TABLE "survey_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"survey_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"sha256" text NOT NULL,
	"published_by_user_id" uuid,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "survey_versions_version_positive" CHECK ("survey_versions"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "user_platform_roles" (
	"user_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"assigned_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_platform_roles_user_id_role_id_pk" PRIMARY KEY("user_id","role_id")
);
--> statement-breakpoint
ALTER TABLE "surveys" ADD COLUMN "description_ru" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "surveys" ADD COLUMN "description_kk" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "surveys" ADD COLUMN "lock_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "platform_access_controls" ADD CONSTRAINT "platform_access_controls_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_access_controls" ADD CONSTRAINT "platform_access_controls_disabled_by_user_id_users_id_fk" FOREIGN KEY ("disabled_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_platform_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."platform_roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_key_platform_permissions_permission_key_fk" FOREIGN KEY ("permission_key") REFERENCES "public"."platform_permissions"("permission_key") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_versions" ADD CONSTRAINT "survey_versions_survey_id_surveys_id_fk" FOREIGN KEY ("survey_id") REFERENCES "public"."surveys"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_versions" ADD CONSTRAINT "survey_versions_published_by_user_id_users_id_fk" FOREIGN KEY ("published_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_platform_roles" ADD CONSTRAINT "user_platform_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_platform_roles" ADD CONSTRAINT "user_platform_roles_role_id_platform_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."platform_roles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_platform_roles" ADD CONSTRAINT "user_platform_roles_assigned_by_user_id_users_id_fk" FOREIGN KEY ("assigned_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "survey_versions_survey_version_unique" ON "survey_versions" USING btree ("survey_id","version");--> statement-breakpoint
CREATE INDEX "user_platform_roles_role_idx" ON "user_platform_roles" USING btree ("role_id","user_id");--> statement-breakpoint
CREATE INDEX "audit_logs_event_occurred_idx" ON "audit_logs" USING btree ("event_type","occurred_at");--> statement-breakpoint
CREATE INDEX "documents_survey_created_idx" ON "documents" USING btree ("survey_id","created_at");--> statement-breakpoint
CREATE INDEX "survey_participants_survey_status_idx" ON "survey_participants" USING btree ("survey_id","status");--> statement-breakpoint
CREATE INDEX "surveys_status_period_idx" ON "surveys" USING btree ("status","starts_at","closes_at");--> statement-breakpoint
CREATE INDEX "votes_survey_status_idx" ON "votes" USING btree ("survey_id","status");
--> statement-breakpoint
INSERT INTO "platform_permissions" ("permission_key", "description_ru") VALUES
 ('admin.access', 'Доступ к административной консоли'),
 ('survey.read', 'Просмотр опросов'),
 ('survey.create', 'Создание опросов'),
 ('survey.update_draft', 'Редактирование черновиков'),
 ('survey.publish', 'Публикация опросов'),
 ('survey.close', 'Закрытие опросов'),
 ('survey.archive', 'Архивация опросов'),
 ('survey.results.read', 'Просмотр результатов'),
 ('participant.read', 'Просмотр участников'),
 ('participant.pii.read', 'Просмотр полных реквизитов участников'),
 ('document.read', 'Просмотр реестра документов'),
 ('document.pdf.read', 'Загрузка PDF документов'),
 ('audit.read', 'Просмотр журнала аудита'),
 ('export.results', 'Экспорт результатов'),
 ('export.participants', 'Экспорт участников'),
 ('role.manage', 'Управление платформенными ролями'),
 ('user.manage', 'Управление административным доступом');
--> statement-breakpoint
INSERT INTO "platform_roles" ("id", "role_key", "name_ru", "description_ru") VALUES
 ('40000000-0000-4000-8000-000000000001', 'super_admin', 'Суперадминистратор', 'Полный доступ и защита последнего активного администратора'),
 ('40000000-0000-4000-8000-000000000002', 'admin', 'Администратор', 'Управление системой, пользователями и опросами'),
 ('40000000-0000-4000-8000-000000000003', 'survey_manager', 'Менеджер опросов', 'Публикация, результаты и жизненный цикл опросов'),
 ('40000000-0000-4000-8000-000000000004', 'operator', 'Оператор', 'Создание и редактирование черновиков'),
 ('40000000-0000-4000-8000-000000000005', 'auditor', 'Аудитор', 'Результаты, документы и журнал аудита'),
 ('40000000-0000-4000-8000-000000000006', 'viewer', 'Наблюдатель', 'Доступ только для чтения');
--> statement-breakpoint
INSERT INTO "role_permissions" ("role_id", "permission_key")
SELECT r.id, p.permission_key
FROM platform_roles r CROSS JOIN platform_permissions p
WHERE r.role_key IN ('super_admin', 'admin')
   OR (r.role_key = 'survey_manager' AND p.permission_key IN ('admin.access','survey.read','survey.create','survey.update_draft','survey.publish','survey.close','survey.archive','survey.results.read','participant.read','document.read','document.pdf.read','export.results','export.participants'))
   OR (r.role_key = 'operator' AND p.permission_key IN ('admin.access','survey.read','survey.create','survey.update_draft','survey.results.read','participant.read','document.read','document.pdf.read'))
   OR (r.role_key = 'auditor' AND p.permission_key IN ('admin.access','survey.read','survey.results.read','participant.read','document.read','document.pdf.read','audit.read','export.results'))
   OR (r.role_key = 'viewer' AND p.permission_key IN ('admin.access','survey.read','survey.results.read','participant.read','document.read'));
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
    NEW.closes_at IS DISTINCT FROM OLD.closes_at
  ) THEN
    RAISE EXCEPTION 'published survey content is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER surveys_published_content_immutable BEFORE UPDATE ON surveys
FOR EACH ROW EXECUTE FUNCTION prevent_published_survey_content_mutation();
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
       NEW.status IS NOT DISTINCT FROM OLD.status THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'published survey questions are immutable' USING ERRCODE = '23514';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER survey_questions_published_immutable BEFORE INSERT OR UPDATE OR DELETE ON survey_questions
FOR EACH ROW EXECUTE FUNCTION prevent_published_survey_child_mutation();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION prevent_published_target_mutation() RETURNS trigger AS $$
DECLARE target_survey_id uuid; target_status survey_status;
BEGIN
  target_survey_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.survey_id ELSE NEW.survey_id END;
  SELECT status INTO target_status FROM surveys WHERE id = target_survey_id;
  IF target_status <> 'draft' THEN
    RAISE EXCEPTION 'published survey targets are immutable' USING ERRCODE = '23514';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER survey_targets_published_immutable BEFORE INSERT OR UPDATE OR DELETE ON survey_targets
FOR EACH ROW EXECUTE FUNCTION prevent_published_target_mutation();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION prevent_survey_version_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'published survey versions are immutable' USING ERRCODE = '23514';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER survey_versions_immutable BEFORE UPDATE OR DELETE ON survey_versions
FOR EACH ROW EXECUTE FUNCTION prevent_survey_version_mutation();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION ensure_another_active_super_admin(target_user uuid) RETURNS void AS $$
DECLARE remaining_count integer;
BEGIN
  SELECT count(DISTINCT upr.user_id) INTO remaining_count
  FROM user_platform_roles upr
  JOIN platform_roles pr ON pr.id = upr.role_id AND pr.role_key = 'super_admin'
  JOIN users u ON u.id = upr.user_id AND u.status = 'active'
  LEFT JOIN platform_access_controls pac ON pac.user_id = u.id
  WHERE upr.user_id <> target_user AND pac.disabled_at IS NULL;
  IF remaining_count = 0 THEN
    RAISE EXCEPTION 'cannot remove or disable the last active super_admin' USING ERRCODE = '23514';
  END IF;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION protect_last_super_admin_role() RETURNS trigger AS $$
DECLARE role_key_value text;
BEGIN
  SELECT role_key INTO role_key_value FROM platform_roles WHERE id = OLD.role_id;
  IF role_key_value = 'super_admin' THEN PERFORM ensure_another_active_super_admin(OLD.user_id); END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER user_platform_roles_last_super_admin BEFORE DELETE ON user_platform_roles
FOR EACH ROW EXECUTE FUNCTION protect_last_super_admin_role();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION protect_last_super_admin_access() RETURNS trigger AS $$
BEGIN
  IF OLD.disabled_at IS NULL AND NEW.disabled_at IS NOT NULL AND EXISTS (
    SELECT 1 FROM user_platform_roles upr JOIN platform_roles pr ON pr.id = upr.role_id
    WHERE upr.user_id = NEW.user_id AND pr.role_key = 'super_admin'
  ) THEN PERFORM ensure_another_active_super_admin(NEW.user_id); END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER platform_access_last_super_admin BEFORE UPDATE ON platform_access_controls
FOR EACH ROW EXECUTE FUNCTION protect_last_super_admin_access();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION protect_last_super_admin_user_status() RETURNS trigger AS $$
BEGIN
  IF OLD.status = 'active' AND NEW.status <> 'active' AND EXISTS (
    SELECT 1 FROM user_platform_roles upr JOIN platform_roles pr ON pr.id = upr.role_id
    WHERE upr.user_id = NEW.id AND pr.role_key = 'super_admin'
  ) THEN PERFORM ensure_another_active_super_admin(NEW.id); END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER users_last_super_admin BEFORE UPDATE OF status ON users
FOR EACH ROW EXECUTE FUNCTION protect_last_super_admin_user_status();
