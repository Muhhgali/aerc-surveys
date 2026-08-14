import { createHash } from "node:crypto";
import postgres from "postgres";
import { seedDevelopmentData, seedIds } from "../src/infrastructure/database/seed-data";

const foreign = {
  user: "90000000-0000-4000-8000-000000000001",
  participant: "90000000-0000-4000-8000-000000000002",
  session: "90000000-0000-4000-8000-000000000003",
  voteSession: "90000000-0000-4000-8000-000000000004",
  vote: "90000000-0000-4000-8000-000000000005",
  survey: "80000000-0000-4000-8000-000000000001",
  question: "80000000-0000-4000-8000-000000000002",
} as const;

export const foreignSessionToken = "foreign-test-session-token-with-enough-entropy";

function testDatabaseUrl() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("E2E requires DATABASE_URL for persistent PostgreSQL");
  if (process.env.APP_ENV !== "test") throw new Error("E2E database mutations require APP_ENV=test");
  const databaseName = decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));
  if (databaseName !== "aerc_surveys_test") throw new Error("E2E requires a dedicated database named aerc_surveys_test");
  return url;
}

export function e2eDatabase() {
  return postgres(testDatabaseUrl(), { max: 1, prepare: false });
}

export async function resetE2eState() {
  const sql = e2eDatabase();
  try {
    await sql.begin(async (transaction) => {
      await transaction`delete from audit_logs where actor_user_id in (${seedIds.voterUser}, ${foreign.user})`;
      await transaction`delete from documents where vote_id in (select id from votes where user_id in (${seedIds.voterUser}, ${foreign.user}))`;
      await transaction`delete from signature_requests where vote_session_id in (select id from vote_sessions where participant_id in (${seedIds.participant}, ${foreign.participant}))`;
      await transaction`delete from votes where user_id in (${seedIds.voterUser}, ${foreign.user})`;
      await transaction`delete from vote_sessions where participant_id in (${seedIds.participant}, ${foreign.participant})`;
      await transaction`delete from auth_sessions where user_id in (${seedIds.voterUser}, ${foreign.user})`;
      await transaction`delete from survey_participants where id = ${foreign.participant}`;
      await transaction`delete from external_identities where user_id = ${foreign.user}`;
      await transaction`delete from users where id = ${foreign.user}`;
      await transaction`delete from surveys where id = ${foreign.survey}`;
      await transaction`update surveys set status = 'active', starts_at = '2026-08-01T00:00:00+05:00', closes_at = '2026-08-25T23:59:59+05:00' where id = ${seedIds.survey12}`;
    });
    await seedDevelopmentData(sql);
  } finally {
    await sql.end();
  }
}

export async function createForeignSurveyQuestion() {
  const sql = e2eDatabase();
  try {
    await sql`
      insert into surveys (id, organization_id, protocol_number, title_ru, status, starts_at, closes_at, published_at)
      values (${foreign.survey}, ${seedIds.organization}, 'E2E-FOREIGN', 'Foreign survey fixture', 'active', now() - interval '1 day', now() + interval '1 day', now())
    `;
    await sql`
      insert into survey_questions (id, survey_id, position, text_ru, required, status)
      values (${foreign.question}, ${foreign.survey}, 1, 'Foreign survey question', true, 'active')
    `;
    return foreign.question;
  } finally {
    await sql.end();
  }
}

export async function createForeignSession(withVote = false) {
  const sql = e2eDatabase();
  try {
    await sql.begin(async (transaction) => {
      await transaction`insert into users (id, display_name, type, status) values (${foreign.user}, 'Foreign test user', 'individual', 'active')`;
      await transaction`
        insert into auth_sessions (id, token_hash, user_id, assurance_level, expires_at)
        values (${foreign.session}, ${createHash("sha256").update(foreignSessionToken).digest("hex")}, ${foreign.user}, 'demo', now() + interval '1 hour')
      `;
      if (!withVote) return;
      await transaction`
        insert into survey_participants (id, survey_id, user_id, property_id, personal_account_id, status, verified_source, verified_at)
        values (${foreign.participant}, ${seedIds.survey12}, ${foreign.user}, ${seedIds.property}, ${seedIds.personalAccount}, 'eligible', 'test', now())
      `;
      await transaction`
        insert into vote_sessions (id, auth_session_id, participant_id, status, idempotency_key, expires_at)
        values (${foreign.voteSession}, ${foreign.session}, ${foreign.participant}, 'started', '90000000-0000-4000-8000-000000000006', now() + interval '1 day')
      `;
      await transaction`
        insert into votes (id, vote_session_id, survey_id, participant_id, user_id, property_id, status, idempotency_key)
        values (${foreign.vote}, ${foreign.voteSession}, ${seedIds.survey12}, ${foreign.participant}, ${foreign.user}, ${seedIds.property}, 'draft', '90000000-0000-4000-8000-000000000007')
      `;
    });
    return foreign.vote;
  } finally {
    await sql.end();
  }
}

export async function expireSessionToken(rawToken: string) {
  const sql = e2eDatabase();
  try {
    await sql`update auth_sessions set expires_at = now() - interval '1 minute' where token_hash = ${createHash("sha256").update(rawToken).digest("hex")}`;
  } finally {
    await sql.end();
  }
}
