import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let database: PGlite;

beforeAll(async () => {
  database = new PGlite();
  for (const file of ["0000_production_data_model.sql", "0001_regular_madelyne_pryor.sql", "0002_superb_zodiak.sql", "0003_vote_document_immutability.sql", "0004_shiny_grandmaster.sql"]) {
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
      "vote_autosaves", "binary_assets", "visual_signatures", "signature_requests", "documents", "document_versions", "audit_logs", "integration_requests",
      "platform_roles", "platform_permissions", "role_permissions", "user_platform_roles", "platform_access_controls", "survey_versions",
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

  it("enforces lifecycle and immutable answers in PostgreSQL", async () => {
    await database.exec(`
      insert into properties (id, city, street, building, premise, property_type) values ('20000000-0000-4000-8000-000000000003', 'Astana', 'Street', '1', '2', 'apartment');
      insert into survey_participants (id, survey_id, user_id, property_id, status, verified_source, verified_at)
        values ('20000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000003', 'eligible', 'test', now());
      insert into vote_sessions (id, auth_session_id, participant_id, status, idempotency_key, expires_at)
      values ('20000000-0000-4000-8000-000000000007', '10000000-0000-4000-8000-000000000006', '20000000-0000-4000-8000-000000000005', 'draft', 'immut-session', now() + interval '1 hour');
      insert into votes (id, vote_session_id, survey_id, participant_id, user_id, property_id, status, idempotency_key)
      values ('20000000-0000-4000-8000-000000000009', '20000000-0000-4000-8000-000000000007', '10000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000003', 'draft', 'immut-vote');
      update surveys set status='draft' where id='10000000-0000-4000-8000-000000000004';
      insert into survey_questions (id, survey_id, position, text_ru) values ('20000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000004', 1, 'Question');
      update surveys set status='active' where id='10000000-0000-4000-8000-000000000004';
      insert into vote_answers (vote_id, question_id, choice) values ('20000000-0000-4000-8000-000000000009', '20000000-0000-4000-8000-000000000010', 'for');
      update votes set status = 'ready_to_sign', canonical_payload = '{}', canonical_sha256 = repeat('a', 64) where id = '20000000-0000-4000-8000-000000000009';
    `);
    await expect(database.exec(`update vote_answers set choice = 'against' where vote_id = '20000000-0000-4000-8000-000000000009'`)).rejects.toMatchObject({ code: "23514" });
    await expect(database.exec(`update votes set status = 'submitted' where id = '20000000-0000-4000-8000-000000000009'`)).rejects.toMatchObject({ code: "23514" });
  });

  it("prevents document and binary asset tampering", async () => {
    await database.exec(`
      insert into binary_assets (storage_key, content_type, bytes, sha256, size_bytes) values ('test/immutable.pdf', 'application/pdf', decode('25504446','hex'), repeat('a',64), 4);
      insert into documents (id, public_id, survey_id, document_type, status, current_version) values ('21000000-0000-4000-8000-000000000001', '21000000-0000-5000-a000-000000000002', '10000000-0000-4000-8000-000000000004', 'voting_sheet', 'generated', 1);
      insert into document_versions (document_id, version, survey_version, storage_key, content_type, sha256, canonical_sha256, signing_provider, signing_status, verification_reference, size_bytes) values ('21000000-0000-4000-8000-000000000001', 1, 1, 'test/immutable.pdf', 'application/pdf', repeat('a',64), repeat('b',64), 'mock', 'finalized', '/verify/test', 4);
    `);
    await expect(database.exec(`update document_versions set sha256=repeat('c',64) where document_id='21000000-0000-4000-8000-000000000001'`)).rejects.toMatchObject({ code: "23514" });
    await expect(database.exec(`update binary_assets set bytes=decode('00','hex') where storage_key='test/immutable.pdf'`)).rejects.toMatchObject({ code: "23514" });
  });

  it("protects published survey content and the last active super admin", async () => {
    await database.exec(`
      insert into users (id, display_name) values ('22000000-0000-4000-8000-000000000001', 'Only admin');
      insert into platform_access_controls (user_id) values ('22000000-0000-4000-8000-000000000001');
      insert into user_platform_roles (user_id, role_id)
        select '22000000-0000-4000-8000-000000000001', id from platform_roles where role_key='super_admin';
    `);
    await expect(database.exec(`delete from user_platform_roles where user_id='22000000-0000-4000-8000-000000000001'`)).rejects.toMatchObject({ code: "23514" });
    await expect(database.exec(`update surveys set title_ru='Tampered' where id='10000000-0000-4000-8000-000000000004'`)).rejects.toMatchObject({ code: "23514" });
    await expect(database.exec(`update survey_questions set text_ru='Tampered' where id='20000000-0000-4000-8000-000000000010'`)).rejects.toMatchObject({ code: "23514" });
  });
});

describe("Stage 2.5 upgrade migration", () => {
  it("preserves sessions, drafts and answers while upgrading to Stage 3", async () => {
    const upgraded = new PGlite();
    try {
      for (const file of ["0000_production_data_model.sql", "0001_regular_madelyne_pryor.sql"]) await upgraded.exec((await readFile(resolve(process.cwd(), `drizzle/${file}`), "utf8")).replaceAll("--> statement-breakpoint", ""));
      await upgraded.exec(`
        insert into users (id, display_name) values ('30000000-0000-4000-8000-000000000001', 'Upgrade voter');
        insert into organizations (id, bin, legal_name, display_name, type) values ('30000000-0000-4000-8000-000000000002', 'UPGRADE', 'Upgrade', 'Upgrade', 'osi');
        insert into properties (id, city, street, building, premise, property_type) values ('30000000-0000-4000-8000-000000000003', 'Astana', 'Street', '1', '2', 'apartment');
        insert into personal_accounts (id, external_account_id, account_number, property_id) values ('30000000-0000-4000-8000-000000000004', 'upgrade-account', '3000', '30000000-0000-4000-8000-000000000003');
        insert into surveys (id, organization_id, protocol_number, title_ru, status) values ('30000000-0000-4000-8000-000000000005', '30000000-0000-4000-8000-000000000002', 'U1', 'Upgrade survey', 'active');
        insert into survey_questions (id, survey_id, position, text_ru) values ('30000000-0000-4000-8000-000000000006', '30000000-0000-4000-8000-000000000005', 1, 'Upgrade question');
        insert into survey_participants (id, survey_id, user_id, property_id, personal_account_id, status, verified_source, verified_at) values ('30000000-0000-4000-8000-000000000007', '30000000-0000-4000-8000-000000000005', '30000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000004', 'eligible', 'test', now());
        insert into auth_sessions (id, token_hash, user_id, assurance_level, expires_at) values ('30000000-0000-4000-8000-000000000008', 'upgrade-token-hash', '30000000-0000-4000-8000-000000000001', 'demo', now() + interval '1 hour');
        insert into vote_sessions (id, auth_session_id, participant_id, status, idempotency_key, expires_at) values ('30000000-0000-4000-8000-000000000009', '30000000-0000-4000-8000-000000000008', '30000000-0000-4000-8000-000000000007', 'started', 'upgrade-session', now() + interval '1 hour');
        insert into votes (id, vote_session_id, survey_id, participant_id, user_id, property_id, status, idempotency_key) values ('30000000-0000-4000-8000-000000000010', '30000000-0000-4000-8000-000000000009', '30000000-0000-4000-8000-000000000005', '30000000-0000-4000-8000-000000000007', '30000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000003', 'draft', 'upgrade-vote');
        insert into vote_answers (vote_id, question_id, choice) values ('30000000-0000-4000-8000-000000000010', '30000000-0000-4000-8000-000000000006', 'abstain');
      `);
      for (const file of ["0002_superb_zodiak.sql", "0003_vote_document_immutability.sql"]) await upgraded.exec((await readFile(resolve(process.cwd(), `drizzle/${file}`), "utf8")).replaceAll("--> statement-breakpoint", ""));
      const result = await upgraded.query<{ vote_status: string; session_status: string; choice: string; token_hash: string }>(`select v.status as vote_status, vs.status as session_status, va.choice, a.token_hash from votes v join vote_sessions vs on vs.id=v.vote_session_id join vote_answers va on va.vote_id=v.id join auth_sessions a on a.id=vs.auth_session_id where v.id='30000000-0000-4000-8000-000000000010'`);
      expect(result.rows[0]).toEqual({ vote_status: "draft", session_status: "draft", choice: "abstain", token_hash: "upgrade-token-hash" });
    } finally { await upgraded.close(); }
  });
});

describe("Stage 3 to Stage 4 upgrade migration", () => {
  it("preserves sessions, votes, signatures, documents and audit", async () => {
    const upgraded = new PGlite();
    try {
      for (const file of ["0000_production_data_model.sql", "0001_regular_madelyne_pryor.sql", "0002_superb_zodiak.sql", "0003_vote_document_immutability.sql"]) await upgraded.exec((await readFile(resolve(process.cwd(), `drizzle/${file}`), "utf8")).replaceAll("--> statement-breakpoint", ""));
      await upgraded.exec(`
        insert into users (id,display_name) values ('33000000-0000-4000-8000-000000000001','Stage 3 user');
        insert into organizations (id,bin,legal_name,display_name,type) values ('33000000-0000-4000-8000-000000000002','S3','S3','S3','osi');
        insert into properties (id,city,street,building,premise,property_type) values ('33000000-0000-4000-8000-000000000003','Astana','Street','1','1','apartment');
        insert into surveys (id,organization_id,protocol_number,title_ru,status) values ('33000000-0000-4000-8000-000000000004','33000000-0000-4000-8000-000000000002','S3','Stage 3','active');
        insert into survey_participants (id,survey_id,user_id,property_id,status,verified_source,verified_at) values ('33000000-0000-4000-8000-000000000005','33000000-0000-4000-8000-000000000004','33000000-0000-4000-8000-000000000001','33000000-0000-4000-8000-000000000003','eligible','test',now());
        insert into auth_sessions (id,token_hash,user_id,assurance_level,expires_at) values ('33000000-0000-4000-8000-000000000006','stage4-upgrade-session','33000000-0000-4000-8000-000000000001','demo',now()+interval '1 hour');
        insert into audit_logs (event_type,actor_user_id,request_id,outcome) values ('AUTH_SUCCESS','33000000-0000-4000-8000-000000000001','stage4-upgrade','success');
      `);
      await upgraded.exec((await readFile(resolve(process.cwd(), "drizzle/0004_shiny_grandmaster.sql"), "utf8")).replaceAll("--> statement-breakpoint", ""));
      const result = await upgraded.query<{ sessions: number; participants: number; audit: number; roles: number }>(`select (select count(*)::int from auth_sessions) sessions,(select count(*)::int from survey_participants) participants,(select count(*)::int from audit_logs) audit,(select count(*)::int from platform_roles) roles`);
      expect(result.rows[0]).toEqual({ sessions: 1, participants: 1, audit: 1, roles: 6 });
    } finally { await upgraded.close(); }
  });
});
