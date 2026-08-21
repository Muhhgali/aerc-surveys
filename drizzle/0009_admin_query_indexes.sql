CREATE INDEX IF NOT EXISTS "surveys_organization_status_idx" ON "surveys" USING btree ("organization_id","status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_logs_occurred_idx" ON "audit_logs" USING btree ("occurred_at" DESC);
