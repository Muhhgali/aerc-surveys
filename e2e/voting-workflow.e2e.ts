import { expect, request, test, type Page } from "@playwright/test";
import { createForeignSession, createForeignSurveyQuestion, e2eDatabase, expireSessionToken, foreignSessionToken, resetE2eState } from "./support";

const surveyId = "00000000-0000-4000-8000-000000000012";
const questionIds = [1, 2, 3, 4, 5, 6].map((number) => `00000000-0000-4000-8000-${String(number).padStart(12, "0")}`);

async function login(page: Page) {
  await page.goto("/login");
  await page.getByRole("button", { name: /Войти через eGov/ }).click();
  const proceed = page.getByRole("button", { name: /Продолжить/ });
  await expect(proceed).toBeEnabled({ timeout: 4_000 });
  await proceed.click();
  await expect(page.getByRole("heading", { name: "Мои опросы" })).toBeVisible();
}

async function startVoteViaApi(page: Page) {
  const response = await page.request.post(`/api/surveys/${surveyId}/votes`, {
    headers: { origin: "http://127.0.0.1:3100" },
    data: { accountReference: "1911", idempotencyKey: crypto.randomUUID() },
  });
  expect(response.status()).toBe(201);
  return (await response.json() as { vote: { id: string } }).vote.id;
}

test.beforeEach(async () => resetE2eState());

test("happy path persists answers across refresh and submits idempotently", async ({ page }) => {
  await login(page);
  await page.locator(".survey-card", { hasText: "ПРОТОКОЛ №12" }).getByRole("button", { name: /Пройти/ }).click();
  await page.getByRole("button", { name: /^Начать/ }).click();
  await page.getByLabel("Лицевой счёт").fill("1911");
  await page.getByRole("button", { name: /Найти объект/ }).click();
  await expect(page.getByText("г. Астана, ул. Геодезическая, д. 12")).toBeVisible();
  await expect(page.getByText("52", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Перейти к голосованию/ }).click();

  for (const answer of ["За", "Против", "За"]) {
    await page.getByRole("button", { name: new RegExp(`^${answer}`) }).click();
    await expect(page.getByTestId("save-status")).toContainText("Сохранено");
    await page.getByRole("button", { name: /Далее/ }).click();
  }
  await page.reload();
  await expect(page.getByRole("button", { name: /^За/ })).toHaveClass(/selected/);
  await page.getByRole("button", { name: /Далее/ }).click();
  await expect(page.getByRole("button", { name: /^Против/ })).toHaveClass(/selected/);
  await page.getByRole("button", { name: /Далее/ }).click();
  await expect(page.getByRole("button", { name: /^За/ })).toHaveClass(/selected/);
  await page.getByRole("button", { name: /Далее/ }).click();

  for (const answer of ["За", "Воздержусь", "За"]) {
    await page.getByRole("button", { name: new RegExp(`^${answer}`) }).click();
    await expect(page.getByTestId("save-status")).toContainText("Сохранено");
    await page.getByRole("button", { name: /Далее|Проверить/ }).click();
  }
  await expect(page.getByText("6 из 6 вопросов заполнено")).toBeVisible();
  await page.getByRole("button", { name: /Перейти к подтверждению/ }).click();
  await page.getByRole("button", { name: /Добавить визуальную подпись/ }).click();
  const canvas = page.getByLabel("Поле для рукописной подписи");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("Signature canvas is not visible");
  await canvas.dispatchEvent("pointerdown", { pointerId: 1, clientX: box.x + 20, clientY: box.y + 35, buttons: 1 });
  await canvas.dispatchEvent("pointermove", { pointerId: 1, clientX: box.x + 110, clientY: box.y + 60, buttons: 1 });
  await canvas.dispatchEvent("pointerup", { pointerId: 1, clientX: box.x + 110, clientY: box.y + 60 });
  await page.getByRole("button", { name: /Готово/ }).click();
  await page.getByRole("button", { name: /Подтвердить и отправить/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: /Отправить голосование/ }).click();
  await expect(page.getByRole("heading", { name: "Голос принят" })).toBeVisible();
  const voteId = (await page.locator(".document-id").textContent())?.trim();
  expect(voteId).toMatch(/^[0-9a-f-]{36}$/);
  if (!voteId) throw new Error("Submitted vote ID is missing");

  const duplicate = await page.request.post(`/api/votes/${voteId}/submit`, {
    headers: { origin: "http://127.0.0.1:3100" }, data: { idempotencyKey: crypto.randomUUID() },
  });
  expect(duplicate.status()).toBe(200);

  const sql = e2eDatabase();
  try {
    const [{ answers }] = await sql<{ answers: number }[]>`select count(*)::int as answers from vote_answers where vote_id = ${voteId}`;
    expect(answers).toBe(6);
    const audit = await sql<{ event_type: string; metadata: unknown }[]>`select event_type, metadata from audit_logs where actor_user_id = '00000000-0000-4000-8000-000000000001'`;
    const events = new Set(audit.map((event) => event.event_type));
    for (const expected of ["AUTH_SUCCESS", "SESSION_CREATED", "PERSONAL_ACCOUNT_LOOKUP", "PROPERTY_RESOLVED", "ELIGIBILITY_RESOLVED", "SURVEY_OPENED", "VOTE_STARTED", "VOTE_ANSWER_CHANGED", "VOTE_SUBMIT_ATTEMPT", "VOTE_SUBMITTED"]) {
      expect(events.has(expected), `${expected} audit event is missing`).toBe(true);
    }
    expect(JSON.stringify(audit)).not.toMatch(/aerc_session|data:image|session-token|password/i);
  } finally { await sql.end(); }
});

test("rejects invalid account and account without relationship", async ({ page }) => {
  await login(page);
  const invalid = await page.request.post("/api/personal-accounts/resolve", { headers: { origin: "http://127.0.0.1:3100" }, data: { accountReference: "9999" } });
  expect(invalid.status()).toBe(404);
  await createForeignSession();
  const foreign = await request.newContext({ baseURL: "http://127.0.0.1:3100", extraHTTPHeaders: { cookie: `aerc_session=${foreignSessionToken}`, origin: "http://127.0.0.1:3100" } });
  const unrelated = await foreign.post("/api/personal-accounts/resolve", { data: { accountReference: "1911" } });
  expect(unrelated.status()).toBe(403);
  await foreign.dispose();
});

test("rejects expired session and cross-origin mutation", async ({ page }) => {
  await login(page);
  const cookie = (await page.context().cookies()).find((item) => item.name === "aerc_session");
  if (!cookie) throw new Error("Session cookie is missing");
  const crossOrigin = await page.request.post("/api/personal-accounts/resolve", { headers: { origin: "https://evil.example" }, data: { accountReference: "1911" } });
  expect(crossOrigin.status()).toBe(401);
  await expireSessionToken(cookie.value);
  expect((await page.request.get("/api/session")).status()).toBe(401);
});

test("rejects closed survey, property injection, foreign question and idempotency replay", async ({ page }) => {
  await login(page);
  const substitutedSurvey = await page.request.post("/api/surveys/70000000-0000-4000-8000-000000000001/votes", {
    headers: { origin: "http://127.0.0.1:3100" },
    data: { accountReference: "1911", idempotencyKey: crypto.randomUUID() },
  });
  expect(substitutedSurvey.status()).toBe(404);
  const injected = await page.request.post(`/api/surveys/${surveyId}/votes`, {
    headers: { origin: "http://127.0.0.1:3100" },
    data: { accountReference: "1911", propertyId: "00000000-0000-4000-8000-999999999999", idempotencyKey: crypto.randomUUID() },
  });
  expect(injected.status()).toBe(400);
  const voteId = await startVoteViaApi(page);
  const key = crypto.randomUUID();
  const saved = await page.request.put(`/api/votes/${voteId}/answers`, { headers: { origin: "http://127.0.0.1:3100" }, data: { idempotencyKey: key, questionId: questionIds[0], choice: "for" } });
  expect(saved.status()).toBe(200);
  const replay = await page.request.put(`/api/votes/${voteId}/answers`, { headers: { origin: "http://127.0.0.1:3100" }, data: { idempotencyKey: key, questionId: questionIds[0], choice: "against" } });
  expect(replay.status()).toBe(409);
  const foreignQuestionId = await createForeignSurveyQuestion();
  const foreignQuestion = await page.request.put(`/api/votes/${voteId}/answers`, { headers: { origin: "http://127.0.0.1:3100" }, data: { idempotencyKey: crypto.randomUUID(), questionId: foreignQuestionId, choice: "for" } });
  expect(foreignQuestion.status()).toBe(422);
  expect((await page.request.post(`/api/votes/${voteId}/submit`, { headers: { origin: "http://127.0.0.1:3100" }, data: { idempotencyKey: crypto.randomUUID() } })).status()).toBe(422);

  const sql = e2eDatabase();
  try { await sql`update surveys set status = 'closed' where id = ${surveyId}`; } finally { await sql.end(); }
  const closedSave = await page.request.put(`/api/votes/${voteId}/answers`, { headers: { origin: "http://127.0.0.1:3100" }, data: { idempotencyKey: crypto.randomUUID(), questionId: questionIds[1], choice: "for" } });
  expect(closedSave.status()).toBe(409);
});

test("prevents access to another user's vote", async ({ page }) => {
  await login(page);
  const foreignVoteId = await createForeignSession(true);
  const response = await page.request.put(`/api/votes/${foreignVoteId}/answers`, {
    headers: { origin: "http://127.0.0.1:3100" },
    data: { idempotencyKey: crypto.randomUUID(), questionId: questionIds[0], choice: "for" },
  });
  expect(response.status()).toBe(404);
});
