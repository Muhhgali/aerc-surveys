import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { availableSurveysSql, materializeSurveyParticipantsSql, ownerDocumentsSql } from "@/src/infrastructure/database/targeting-sql";

const migrations = [
  "0000_production_data_model.sql", "0001_regular_madelyne_pryor.sql", "0002_superb_zodiak.sql",
  "0003_vote_document_immutability.sql", "0004_shiny_grandmaster.sql", "0005_strange_blob.sql",
];

const id = {
  owner: "50000000-0000-4000-8000-000000000001",
  neighbour: "50000000-0000-4000-8000-000000000002",
  outsider: "50000000-0000-4000-8000-000000000003",
  organization: "50000000-0000-4000-8000-000000000101",
  property: "50000000-0000-4000-8000-000000000201",
  neighbourProperty: "50000000-0000-4000-8000-000000000202",
  foreignProperty: "50000000-0000-4000-8000-000000000203",
  account1911: "50000000-0000-4000-8000-000000000301",
  neighbourAccount: "50000000-0000-4000-8000-000000000302",
  foreignAccount: "50000000-0000-4000-8000-000000000303",
  survey: "50000000-0000-4000-8000-000000000401",
  question: "50000000-0000-4000-8000-000000000501",
} as const;

let database: PGlite;

async function publish(surveyId: string = id.survey) {
  await database.query(materializeSurveyParticipantsSql, [surveyId]);
}

async function participants(surveyId: string = id.survey) {
  const result = await database.query<{ user_id: string; personal_account_id: string | null; verified_source: string }>(
    `select user_id, personal_account_id, verified_source from survey_participants where survey_id = $1 order by user_id`,
    [surveyId],
  );
  return result.rows;
}

async function catalogue(userId: string) {
  const result = await database.query<{ id: string; status: string }>(availableSurveysSql, [userId]);
  return result.rows;
}

async function target(values: {
  type: "building" | "property" | "personal_account" | "organization";
  city?: string; street?: string; building?: string; propertyId?: string; personalAccountId?: string; organizationId?: string;
}) {
  await database.query(
    `insert into survey_targets (survey_id, target_type, city, street, building, property_id, personal_account_id, organization_id)
     values ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [id.survey, values.type, values.city ?? null, values.street ?? null, values.building ?? null,
      values.propertyId ?? null, values.personalAccountId ?? null, values.organizationId ?? null],
  );
}

beforeAll(async () => {
  database = new PGlite();
  for (const file of migrations) {
    const migration = await readFile(resolve(process.cwd(), `drizzle/${file}`), "utf8");
    await database.exec(migration.replaceAll("--> statement-breakpoint", ""));
  }
  // A fresh installation: identities, properties and accounts exist, but nobody has ever
  // participated in a survey. This is what the previous publish resolver could not handle.
  await database.exec(`
    insert into users (id, display_name) values
      ('${id.owner}', 'Демо собственник'),
      ('${id.neighbour}', 'Сосед по дому'),
      ('${id.outsider}', 'Собственник другого дома');
    insert into organizations (id, bin, legal_name, display_name, type) values
      ('${id.organization}', 'PREVIEW-BIN', 'ОСИ-КСК', 'ОСИ-КСК', 'osi');
    insert into properties (id, city, street, building, premise, property_type) values
      ('${id.property}', 'Астана', 'Геодезическая', '12', '52', 'apartment'),
      ('${id.neighbourProperty}', 'Астана', 'Геодезическая', '12', '53', 'apartment'),
      ('${id.foreignProperty}', 'Астана', 'Другая', '7', '1', 'apartment');
    insert into personal_accounts (id, external_account_id, account_number, property_id) values
      ('${id.account1911}', 'mock-account-1911', '1911', '${id.property}'),
      ('${id.neighbourAccount}', 'mock-account-1912', '1912', '${id.neighbourProperty}'),
      ('${id.foreignAccount}', 'mock-account-7001', '7001', '${id.foreignProperty}');
    insert into property_holdings (user_id, property_id, personal_account_id) values
      ('${id.owner}', '${id.property}', '${id.account1911}'),
      ('${id.neighbour}', '${id.neighbourProperty}', '${id.neighbourAccount}'),
      ('${id.outsider}', '${id.foreignProperty}', '${id.foreignAccount}');
    insert into surveys (id, organization_id, protocol_number, title_ru, description_ru, status, starts_at, closes_at)
      values ('${id.survey}', '${id.organization}', 'PREVIEW-1', 'Новый опрос дома', 'Проверка targeting',
              'draft', now() - interval '1 hour', now() + interval '7 days');
    insert into survey_questions (id, survey_id, position, text_ru)
      values ('${id.question}', '${id.survey}', 1, 'Утвердить план работ');
  `);
});

beforeEach(async () => {
  await database.exec(`
    delete from vote_answers;
    delete from documents;
    delete from votes;
    delete from vote_sessions;
    delete from auth_sessions;
    delete from survey_participants;
    update surveys set status = 'draft', published_at = null where id = '${id.survey}';
    delete from survey_targets;
    delete from organization_members;
    update property_holdings set status = 'active';
  `);
});

afterAll(async () => {
  await database.close();
});

describe("local survey targeting", () => {
  it("gives an account target a participant without any previous participation", async () => {
    await target({ type: "personal_account", personalAccountId: id.account1911 });
    expect(await participants()).toHaveLength(0);

    await publish();

    const rows = await participants();
    expect(rows).toEqual([{ user_id: id.owner, personal_account_id: id.account1911, verified_source: "local_property_read_model" }]);
  });

  it("publishes the survey into the owner catalogue and leaves other identities untouched", async () => {
    await target({ type: "personal_account", personalAccountId: id.account1911 });
    await publish();
    await database.exec(`update surveys set status = 'active', published_at = now() where id = '${id.survey}'`);

    expect((await catalogue(id.owner)).map((row) => row.id)).toEqual([id.survey]);
    expect(await catalogue(id.neighbour)).toHaveLength(0);
    expect(await catalogue(id.outsider)).toHaveLength(0);
  });

  it("lets the eligible owner start a vote against the materialised participant", async () => {
    await target({ type: "personal_account", personalAccountId: id.account1911 });
    await publish();
    await database.exec(`update surveys set status = 'active', published_at = now() where id = '${id.survey}'`);

    const eligible = await database.query<{ id: string; status: string }>(
      `select id, status from survey_participants where survey_id = $1 and user_id = $2 and property_id = $3`,
      [id.survey, id.owner, id.property],
    );
    expect(eligible.rows[0]?.status).toBe("eligible");

    await database.exec(`
      insert into auth_sessions (id, token_hash, user_id, assurance_level, expires_at)
        values ('50000000-0000-4000-8000-000000000601', 'targeting-token-hash', '${id.owner}', 'demo', now() + interval '1 hour');
      insert into vote_sessions (id, auth_session_id, participant_id, status, idempotency_key, expires_at)
        values ('50000000-0000-4000-8000-000000000602', '50000000-0000-4000-8000-000000000601', '${eligible.rows[0].id}', 'draft', 'targeting-session', now() + interval '1 day');
      insert into votes (id, vote_session_id, survey_id, participant_id, user_id, property_id, status, idempotency_key)
        values ('50000000-0000-4000-8000-000000000603', '50000000-0000-4000-8000-000000000602', '${id.survey}', '${eligible.rows[0].id}', '${id.owner}', '${id.property}', 'draft', 'targeting-vote');
    `);
    const votes = await database.query<{ count: number }>(`select count(*)::int as count from votes where survey_id = $1`, [id.survey]);
    expect(votes.rows[0].count).toBe(1);
  });

  it("reaches every holder of the targeted building and no foreign property", async () => {
    await target({ type: "building", city: "Астана", street: "Геодезическая", building: "12" });
    await publish();

    expect((await participants()).map((row) => row.user_id)).toEqual([id.owner, id.neighbour].sort());
  });

  it("reaches a targeted property and organization membership", async () => {
    await target({ type: "property", propertyId: id.foreignProperty });
    await database.exec(`
      insert into organization_members (user_id, organization_id, role, verified_source, verified_at)
        values ('${id.neighbour}', '${id.organization}', 'representative', 'test', now());
    `);
    await target({ type: "organization", organizationId: id.organization });
    await publish();

    expect((await participants()).map((row) => row.user_id)).toEqual([id.outsider, id.neighbour].sort());
  });

  it("ignores targets that resolve to nothing and holdings that are inactive", async () => {
    await target({ type: "personal_account", personalAccountId: id.neighbourAccount });
    await database.exec(`update property_holdings set status = 'inactive' where personal_account_id = '${id.neighbourAccount}'`);
    await publish();
    expect(await participants()).toHaveLength(0);

    await database.exec(`delete from survey_targets where survey_id = '${id.survey}'`);
    await target({ type: "building", city: "Астана", street: "Несуществующая", building: "999" });
    await publish();
    expect(await participants()).toHaveLength(0);
  });

  it("stays idempotent across duplicate targets and repeated publishes", async () => {
    await target({ type: "personal_account", personalAccountId: id.account1911 });
    await target({ type: "property", propertyId: id.property });
    await target({ type: "building", city: "Астана", street: "Геодезическая", building: "12" });

    await publish();
    await publish();
    await publish();

    expect((await participants()).filter((row) => row.user_id === id.owner)).toHaveLength(1);
  });

  it("keeps closed, archived and draft surveys out of the owner catalogue", async () => {
    await target({ type: "personal_account", personalAccountId: id.account1911 });
    await publish();

    expect(await catalogue(id.owner)).toHaveLength(0);
    for (const status of ["active", "scheduled"]) {
      await database.exec(`update surveys set status = '${status}' where id = '${id.survey}'`);
      expect(await catalogue(id.owner)).toHaveLength(1);
    }
    for (const status of ["closed", "archived"]) {
      await database.exec(`update surveys set status = '${status}' where id = '${id.survey}'`);
      expect(await catalogue(id.owner)).toHaveLength(0);
    }
  });

  it("keeps a submitted vote visible after the survey closes", async () => {
    await target({ type: "personal_account", personalAccountId: id.account1911 });
    await publish();
    await database.exec(`update surveys set status = 'active', published_at = now() where id = '${id.survey}'`);
    const eligible = await database.query<{ id: string }>(
      `select id from survey_participants where survey_id = $1 and user_id = $2`,
      [id.survey, id.owner],
    );
    await database.exec(`
      insert into auth_sessions (id, token_hash, user_id, assurance_level, expires_at)
        values ('50000000-0000-4000-8000-000000000701', 'closed-token-hash', '${id.owner}', 'demo', now() + interval '1 hour');
      insert into vote_sessions (id, auth_session_id, participant_id, status, idempotency_key, expires_at, submitted_at)
        values ('50000000-0000-4000-8000-000000000702', '50000000-0000-4000-8000-000000000701', '${eligible.rows[0].id}', 'submitted', 'closed-session', now() + interval '1 day', now());
      insert into votes (id, vote_session_id, survey_id, participant_id, user_id, property_id, status, idempotency_key, submitted_at)
        values ('50000000-0000-4000-8000-000000000703', '50000000-0000-4000-8000-000000000702', '${id.survey}', '${eligible.rows[0].id}', '${id.owner}', '${id.property}', 'submitted', 'closed-vote', now());
    `);
    await database.exec(`update surveys set status = 'closed' where id = '${id.survey}'`);
    const rows = await catalogue(id.owner);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(id.survey);
  });

  it("lists submitted voting sheets only for the owning identity", async () => {
    await target({ type: "personal_account", personalAccountId: id.account1911 });
    await publish();
    const eligible = await database.query<{ id: string }>(
      `select id from survey_participants where survey_id = $1 and user_id = $2`,
      [id.survey, id.owner],
    );
    await database.exec(`
      insert into auth_sessions (id, token_hash, user_id, assurance_level, expires_at)
        values ('50000000-0000-4000-8000-000000000801', 'sheet-token-hash', '${id.owner}', 'demo', now() + interval '1 hour');
      insert into vote_sessions (id, auth_session_id, participant_id, status, idempotency_key, expires_at, submitted_at)
        values ('50000000-0000-4000-8000-000000000802', '50000000-0000-4000-8000-000000000801', '${eligible.rows[0].id}', 'submitted', 'sheet-session', now() + interval '1 day', now());
      insert into votes (id, vote_session_id, survey_id, participant_id, user_id, property_id, status, idempotency_key, submitted_at)
        values ('50000000-0000-4000-8000-000000000803', '50000000-0000-4000-8000-000000000802', '${id.survey}', '${eligible.rows[0].id}', '${id.owner}', '${id.property}', 'submitted', 'sheet-vote', now());
      insert into documents (id, public_id, vote_id, survey_id, document_type, status, current_version)
        values ('50000000-0000-4000-8000-000000000804', '50000000-0000-4000-8000-000000000805', '50000000-0000-4000-8000-000000000803', '${id.survey}', 'voting_sheet', 'generated', 1);
    `);
    const owned = await database.query<{ id: string; protocol: string; account: string }>(ownerDocumentsSql, [id.owner]);
    expect(owned.rows).toHaveLength(1);
    expect(owned.rows[0]).toMatchObject({ id: "50000000-0000-4000-8000-000000000805", protocol: "PREVIEW-1", account: "1911" });
    const neighbour = await database.query(ownerDocumentsSql, [id.neighbour]);
    expect(neighbour.rows).toHaveLength(0);
  });
});
