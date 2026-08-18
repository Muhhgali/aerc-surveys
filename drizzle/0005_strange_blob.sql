CREATE TABLE "property_holdings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"personal_account_id" uuid,
	"organization_id" uuid,
	"source" text DEFAULT 'mock' NOT NULL,
	"status" "record_status" DEFAULT 'active' NOT NULL,
	"verified_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "property_holdings" ADD CONSTRAINT "property_holdings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_holdings" ADD CONSTRAINT "property_holdings_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_holdings" ADD CONSTRAINT "property_holdings_personal_account_id_personal_accounts_id_fk" FOREIGN KEY ("personal_account_id") REFERENCES "public"."personal_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_holdings" ADD CONSTRAINT "property_holdings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "property_holdings_identity_account_unique" ON "property_holdings" USING btree ("user_id","property_id","personal_account_id") WHERE "property_holdings"."personal_account_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "property_holdings_identity_property_unique" ON "property_holdings" USING btree ("user_id","property_id") WHERE "property_holdings"."personal_account_id" is null;--> statement-breakpoint
CREATE INDEX "property_holdings_property_idx" ON "property_holdings" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX "property_holdings_account_idx" ON "property_holdings" USING btree ("personal_account_id");--> statement-breakpoint
INSERT INTO "property_holdings" ("user_id", "property_id", "personal_account_id", "organization_id", "source", "status", "verified_at")
SELECT DISTINCT ON (sp.user_id, sp.property_id, sp.personal_account_id)
  sp.user_id, sp.property_id, sp.personal_account_id, sp.organization_id, 'migrated_survey_participant', 'active', now()
FROM survey_participants sp
WHERE sp.status = 'eligible'
ORDER BY sp.user_id, sp.property_id, sp.personal_account_id, sp.created_at
ON CONFLICT DO NOTHING;