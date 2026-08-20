ALTER TABLE "survey_signatories" ADD COLUMN IF NOT EXISTS "display_name" text;
--> statement-breakpoint
UPDATE "survey_signatories" AS ss SET "display_name" = u.display_name
FROM "users" AS u
WHERE u.id = ss.user_id AND (ss.display_name IS NULL OR btrim(ss.display_name) = '');
--> statement-breakpoint
UPDATE "survey_signatories" SET "display_name" = 'Подписант' WHERE "display_name" IS NULL OR btrim("display_name") = '';
--> statement-breakpoint
ALTER TABLE "survey_signatories" ALTER COLUMN "display_name" SET NOT NULL;
--> statement-breakpoint
DROP INDEX IF EXISTS "survey_signatories_unique";
--> statement-breakpoint
ALTER TABLE "official_signatures" ADD COLUMN IF NOT EXISTS "signatory_id" uuid;
--> statement-breakpoint
UPDATE "official_signatures" AS os SET "signatory_id" = ss.id
FROM "survey_signatories" AS ss
WHERE os.signatory_id IS NULL
  AND ss.survey_id = os.survey_id
  AND ss.user_id = os.user_id
  AND ss.role_key = os.role_key;
--> statement-breakpoint
DELETE FROM "official_signatures" WHERE "signatory_id" IS NULL;
--> statement-breakpoint
ALTER TABLE "official_signatures" ALTER COLUMN "signatory_id" SET NOT NULL;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "official_signatures" ADD CONSTRAINT "official_signatures_signatory_id_survey_signatories_id_fk"
		FOREIGN KEY ("signatory_id") REFERENCES "public"."survey_signatories"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DROP INDEX IF EXISTS "official_signatures_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "official_signatures_signatory_unique" ON "official_signatures" USING btree ("signatory_id");
