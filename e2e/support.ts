import { expect, type Page } from "@playwright/test";
import { createHash } from "node:crypto";
import postgres from "postgres";
import { seedDevelopmentData, seedIds, seededSurveyIds } from "../src/infrastructure/database/seed-data";

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
      await transaction`truncate table official_signatures, survey_result_snapshots, survey_eligibility_snapshots, otp_challenges, invitations, vote_contact_details, survey_signatories, survey_signature_policies, organization_access_grants, audit_logs, survey_versions, document_versions, documents, signature_requests, visual_signatures, binary_assets, vote_autosaves, vote_answers, votes, vote_sessions, auth_sessions restart identity cascade`;
      await transaction`update surveys set status='draft' where id not in ${transaction([...seededSurveyIds])}`;
      await transaction`delete from surveys where id not in ${transaction([...seededSurveyIds])}`;
      await transaction`delete from user_platform_roles where user_id <> ${seedIds.representativeUser}`;
      await transaction`delete from user_platform_roles upr using platform_roles pr where upr.role_id=pr.id and upr.user_id=${seedIds.representativeUser} and pr.role_key <> 'super_admin'`;
      await transaction`delete from platform_access_controls where user_id <> ${seedIds.representativeUser}`;
      await transaction`delete from survey_participants where id = ${foreign.participant}`;
      await transaction`delete from external_identities where user_id = ${foreign.user}`;
      await transaction`delete from users where id = ${foreign.user}`;
      await transaction`delete from surveys where id = ${foreign.survey}`;
      // Console accounts and organizations created by a previous run would collide on the unique login and BIN.
      await transaction`
        delete from users u where u.id not in (${seedIds.voterUser}, ${seedIds.representativeUser})
          and not exists (select 1 from survey_participants sp where sp.user_id = u.id)
      `;
      await transaction`delete from organizations where id not in ${transaction([seedIds.organization, seedIds.organizationKsk, seedIds.organizationService])}`;
      // Seeded surveys must be draft before seed upserts titles/questions; the published-content trigger
      // rejects those updates while status is active.
      await transaction`update surveys set status = 'draft' where id in ${transaction([...seededSurveyIds])}`;
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
      values (${foreign.survey}, ${seedIds.organization}, 'E2E-FOREIGN', 'Foreign survey fixture', 'draft', now() - interval '1 day', now() + interval '1 day', now())
    `;
    await sql`
      insert into survey_questions (id, survey_id, position, text_ru, required, status)
      values (${foreign.question}, ${foreign.survey}, 1, 'Foreign survey question', true, 'active')
    `;
    await sql`update surveys set status='active' where id=${foreign.survey}`;
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
        values (${foreign.voteSession}, ${foreign.session}, ${foreign.participant}, 'draft', '90000000-0000-4000-8000-000000000006', now() + interval '1 day')
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

export async function fillOwnerAccount(page: Page) {
  const field = page.getByLabel("Лицевой счёт");
  await field.click();
  await field.pressSequentially("1911", { delay: 40 });
  await expect(field).toHaveValue("1911");
}

export async function confirmOwnerProperty(page: Page) {
  await fillOwnerAccount(page);
  await page.getByRole("button", { name: /Найти объект/ }).click();
  await expect(page.getByText("г. Астана, ул. Геодезическая, д. 12")).toBeVisible();
  await page.getByRole("button", { name: /Показать опросы/ }).click();
  await expect(page.getByRole("heading", { name: "Мои опросы" })).toBeVisible();
}

export async function loginAsOwner(page: Page) {
  await page.goto("/login");
  await page.getByRole("button", { name: /Войти через eGov/ }).click();
  const proceed = page.getByRole("button", { name: /Продолжить/ });
  await expect(proceed).toBeEnabled({ timeout: 4_000 });
  await proceed.click();
  await expect(page.getByRole("heading", { name: "Укажите лицевой счёт" })).toBeVisible();
  await confirmOwnerProperty(page);
}

export async function confirmSurveyOwner(page: Page) {
  const name = page.getByLabel("ФИО собственника");
  await expect(name).toBeVisible();
  if (!(await name.inputValue()).trim()) await name.fill("Зубенко Михаил Петрович");
  await page.getByRole("button", { name: /Перейти к голосованию/ }).click();
}

export async function drawSignature(page: Page) {
  await page.getByRole("button", { name: /Добавить визуальную подпись/ }).click();
  const canvas = page.getByLabel("Поле для рукописной подписи");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("Signature canvas is missing");
  await canvas.dispatchEvent("pointerdown", { pointerId: 1, clientX: box.x + 20, clientY: box.y + 30, buttons: 1 });
  await canvas.dispatchEvent("pointermove", { pointerId: 1, clientX: box.x + 110, clientY: box.y + 55, buttons: 1 });
  await canvas.dispatchEvent("pointerup", { pointerId: 1, clientX: box.x + 110, clientY: box.y + 55 });
  await page.getByRole("button", { name: /Готово/ }).click();
  await expect(page.getByRole("img", { name: "Ваша подпись" })).toBeVisible();
}

/** Signature plus contacts are both required before the confirmation button leaves its disabled state. */
export async function signAndSubmitVote(page: Page) {
  await drawSignature(page);
  await page.getByLabel("Телефон").fill("7010000000");
  await page.getByLabel("Email").fill("owner@example.kz");
  const confirm = page.getByRole("button", { name: /Подтверждаю голосование/ });
  await expect(confirm).toBeEnabled();
  await confirm.click();
  await page.getByRole("dialog").getByRole("button", { name: /Отправить голосование/ }).click();
  await expect(page.getByRole("heading", { name: "Голос принят" })).toBeVisible();
  const documentId = (await page.locator(".document-id").textContent())?.trim();
  if (!documentId) throw new Error("Final document ID is missing");
  return documentId;
}
