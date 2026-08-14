import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let database: PGlite;

beforeAll(async () => {
  database = new PGlite();
  for (const file of ["0000_production_data_model.sql", "0001_regular_madelyne_pryor.sql"]) {
    const migration = await readFile(resolve(process.cwd(), `drizzle/${file}`), "utf8");
    await database.exec(migration.replaceAll("--> statement-breakpoint", ""));
  }
});

afterAll(async () => {
  await database.close();
});

describe("PostgreSQL migration", () => {
  it("creates the complete production data model", async () => {
    const result = await database.query<{ table_name: string }>(`
      select table_name from information_schema.tables
      where table_schema = 'public' and table_type = 'BASE TABLE'
    `);
    const tables = new Set(result.rows.map((row) => row.table_name));
    for (const table of [
      "users", "external_identities", "organizations", "organization_members", "properties", "personal_accounts",
      "surveys", "survey_questions", "survey_targets", "survey_participants", "vote_sessions", "votes", "vote_answers",
      "vote_autosaves", "signature_requests", "documents", "document_versions", "audit_logs", "integration_requests",
    ]) expect(tables.has(table), `${table} is missing`).toBe(true);
  });

  it("enforces one submitted vote per user, property and survey", async () => {
    await database.exec(`
      insert into users (id, display_name) values ('10000000-0000-4000-8000-000000000001', 'Voter');
      insert into organizations (id, bin, legal_name, display_name, type) values ('10000000-0000-4000-8000-000000000002', 'TEST-BIN', 'Test', 'Test', 'osi');
      insert into properties (id, city, street, building, premise, property_type) values ('10000000-0000-4000-8000-000000000003', 'Astana', 'Street', '1', '1', 'apartment');
      insert into surveys (id, organization_id, protocol_number, title_ru, status) values ('10000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000002', 'T1', 'Test', 'active');
      insert into survey_participants (id, survey_id, user_id, property_id, status, verified_source, verified_at)
        values ('10000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000003', 'eligible', 'test', now());
      insert into auth_sessions (id, token_hash, user_id, assurance_level, expires_at) values ('10000000-0000-4000-8000-000000000006', 'test-token-hash', '10000000-0000-4000-8000-000000000001', 'demo', now() + interval '1 hour');
      insert into vote_sessions (id, auth_session_id, participant_id, status, idempotency_key, expires_at)
        values ('10000000-0000-4000-8000-000000000007', '10000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000005', 'submitted', 'idem-1', now() + interval '1 hour'),
               ('10000000-0000-4000-8000-000000000008', '10000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000005', 'submitted', 'idem-2', now() + interval '1 hour');
      insert into votes (vote_session_id, survey_id, participant_id, user_id, property_id, status, idempotency_key, submitted_at)
        values ('10000000-0000-4000-8000-000000000007', '10000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000003', 'submitted', 'vote-idem-1', now());
    `);
    await expect(database.exec(`
      insert into votes (vote_session_id, survey_id, participant_id, user_id, property_id, status, idempotency_key, submitted_at)
      values ('10000000-0000-4000-8000-000000000008', '10000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000003', 'submitted', 'vote-idem-2', now());
    `)).rejects.toMatchObject({ code: "23505" });
  });
});
