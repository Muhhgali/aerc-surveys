import { expect, test, type APIResponse, type Page } from "@playwright/test";
import { seedIds } from "../src/infrastructure/database/seed-data";
import { confirmSurveyOwner, loginAsOwner, resetE2eState, signAndSubmitVote } from "./support";

const origin = "http://127.0.0.1:3100";
const aerc = { login: "admin@aerc.kz", password: "DemoAdmin26" };

test.beforeEach(async () => resetE2eState());

async function signIn(page: Page, login: string, password: string, replacement?: string) {
  await page.goto("/admin/login");
  await page.getByLabel("Логин").fill(login);
  await page.getByLabel("Пароль").fill(password);
  await page.getByRole("button", { name: /Войти в консоль/ }).click();
  if (replacement) {
    await expect(page.getByRole("heading", { name: "Задайте постоянный пароль" })).toBeVisible();
    await page.getByLabel("Новый пароль").fill(replacement);
    await page.getByLabel("Повторите пароль").fill(replacement);
    await page.getByRole("button", { name: /Сохранить и войти/ }).click();
  }
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole("heading", { name: "Вход в консоль опросов" })).toHaveCount(0);
  expect((await page.request.get("/api/admin/dashboard")).status()).toBe(200);
}

async function signOut(page: Page) {
  await page.request.delete("/api/session", { headers: { origin } });
}

async function createOrganization(page: Page, suffix: string) {
  const response = await page.request.post("/api/admin/organizations", {
    headers: { origin },
    data: {
      displayName: `Организация ${suffix}`, legalName: `ТОО «Организация ${suffix}»`,
      bin: `${suffix}`.padStart(12, "7"), type: "osi", contactName: "Иванов И. И.", contactPhone: "+7 701 000 00 00", contactEmail: `office${suffix}@osi.kz`,
    },
  });
  expect(response.status()).toBe(201);
  return (await response.json()).id as string;
}

async function createOrganizationUser(page: Page, organizationId: string, login: string, role = "organization_admin") {
  const response = await page.request.post(`/api/admin/organizations/${organizationId}/users`, {
    headers: { origin },
    data: { displayName: "Иванов Иван Иванович", login, password: "TempPass2026", role, email: `${login}` },
  });
  expect(response.status()).toBe(201);
  return { login, password: "TempPass2026", userId: (await response.json()).id as string };
}

async function publishOrganizationSurvey(page: Page, protocol: string, title: string) {
  const draft = await page.request.post("/api/admin/surveys", {
    headers: { origin },
    data: {
      protocolNumber: protocol, titleRu: title, titleKk: `${title} KZ`,
      descriptionRu: "Опрос организации", descriptionKk: "Ұйым сауалнамасы",
      startsAt: new Date(Date.now() - 60_000).toISOString(), closesAt: new Date(Date.now() + 2 * 86_400_000).toISOString(),
    },
  });
  expect(draft.status()).toBe(201);
  const surveyId = (await draft.json()).id as string;
  const question = await page.request.post(`/api/admin/surveys/${surveyId}/questions`, {
    headers: { origin }, data: { textRu: "Утвердить смету на 2026 год", textKk: "2026 жылға смета бекітілсін", required: true },
  });
  expect(question.status()).toBe(201);
  const targets = await page.request.put(`/api/admin/surveys/${surveyId}/targets`, {
    headers: { origin }, data: { targets: [{ type: "personal_account", personalAccountId: seedIds.personalAccount }] },
  });
  expect(targets.status()).toBe(200);
  const published = await page.request.post(`/api/admin/surveys/${surveyId}/publish`, { headers: { origin } });
  expect(published.status()).toBe(200);
  expect((await published.json()).status).toBe("active");
  return surveyId;
}

async function voteAsOwner(page: Page, title: string) {
  await loginAsOwner(page);
  const card = page.locator(".survey-card", { hasText: title });
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "Пройти" }).click();
  await page.getByRole("button", { name: /^Начать/ }).click();
  await confirmSurveyOwner(page);
  await page.getByRole("button", { name: /^За/ }).click();
  await expect(page.getByTestId("save-status")).toContainText("Сохранено");
  await page.getByRole("button", { name: /Проверить/ }).click();
  await page.getByRole("button", { name: /Перейти к подтверждению/ }).click();
  await expect(page.locator(".toast")).toHaveCount(0);
  return signAndSubmitVote(page);
}

function denied(response: APIResponse) {
  expect([403, 404]).toContain(response.status());
}

test("A: AERC admin creates an organization and its console account from the console", async ({ page }) => {
  await signIn(page, aerc.login, aerc.password);
  await page.goto("/admin/organizations");
  const organizationForm = page.locator(".admin-panel", { hasText: "Новая организация" });
  await organizationForm.getByLabel("Краткое название").fill("ОСИ Сарыарка");
  await organizationForm.getByLabel("Юридическое наименование").fill("ОСИ «Сарыарка»");
  await organizationForm.getByLabel("БИН (12 цифр)").fill("990000000001");
  await organizationForm.getByLabel("Контактное лицо").fill("Иванов И. И.");
  await organizationForm.getByLabel("Телефон").fill("+7 701 000 00 00");
  await organizationForm.getByLabel("Email").fill("office@saryarka.kz");
  await organizationForm.getByRole("button", { name: "Добавить организацию" }).click();

  const row = page.locator(".admin-table tbody tr", { hasText: "ОСИ Сарыарка" });
  await expect(row).toBeVisible();
  await expect(row).toContainText("990000000001");
  await expect(row).toContainText("+77010000000");
  await row.getByRole("button", { name: "Пользователи" }).click();

  const users = page.locator(".admin-panel", { hasText: "Пользователи организации" });
  await users.getByLabel("ФИО").fill("Иванов Иван Иванович");
  await users.getByLabel("Логин").fill("ivanov@saryarka.kz");
  await users.getByLabel("Временный пароль").fill("TempPass2026");
  await users.getByLabel("Роль в организации").selectOption("survey_manager");
  await users.getByRole("button", { name: "Добавить пользователя" }).click();
  await expect(users.getByText("Передайте доступ пользователю:")).toBeVisible();

  const userRow = users.locator("tbody tr", { hasText: "ivanov@saryarka.kz" });
  await expect(userRow).toContainText("Временный");
  await userRow.locator("select").selectOption("organization_admin");
  await expect(page.getByText("Роль обновлена")).toBeVisible();

  await signOut(page);
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Вход в консоль опросов" })).toBeVisible();
});

test("B–D: an organization runs its own survey, the owner votes and both consoles see the result", async ({ page }) => {
  await signIn(page, aerc.login, aerc.password);
  const organizationId = await createOrganization(page, "1");
  const account = await createOrganizationUser(page, organizationId, "manager@org-one.kz");
  await signOut(page);

  await signIn(page, account.login, account.password, "OrgOnePass2026");
  const visible = await page.request.get("/api/admin/organizations");
  expect(visible.status()).toBe(200);
  const organizations = (await visible.json()).items as { id: string }[];
  expect(organizations.map((organization) => organization.id)).toEqual([organizationId]);
  expect((await page.request.get("/api/admin/audit")).status()).toBe(403);
  expect((await page.request.get("/api/admin/users")).status()).toBe(403);

  const surveyId = await publishOrganizationSurvey(page, `ORG-${Date.now()}`, "Опрос организации");
  await signOut(page);

  const documentId = await voteAsOwner(page, "Опрос организации");
  await signOut(page);

  await signIn(page, account.login, "OrgOnePass2026");
  const progress = await page.request.get(`/api/admin/surveys/${surveyId}/progress`);
  expect(progress.status()).toBe(200);
  expect((await progress.json()).participation.completed).toBe(1);
  expect((await page.request.post(`/api/admin/surveys/${surveyId}/close`, { headers: { origin } })).status()).toBe(200);
  const results = await page.request.get(`/api/admin/surveys/${surveyId}/results`);
  expect(results.status()).toBe(200);
  expect(JSON.stringify(await results.json())).toContain("Утвердить смету на 2026 год");
  const protocol = await page.request.post(`/api/admin/surveys/${surveyId}/protocol`, { headers: { origin } });
  expect(protocol.status()).toBe(200);
  await signOut(page);

  await signIn(page, aerc.login, aerc.password);
  await page.goto(`/admin/surveys/${surveyId}/results`);
  await expect(page.locator(".admin-table tbody tr")).toHaveCount(1);
  await page.goto(`/admin/documents/${documentId}`);
  await expect(page.getByText("valid", { exact: true })).toBeVisible();
});

test("seeded chairman logs in as an organization principal and can create a survey", async ({ page }) => {
  await signIn(page, "chairman@geodez12.kz", "Chairman26");
  const organizations = await page.request.get("/api/admin/organizations");
  expect(organizations.status()).toBe(200);
  expect(((await organizations.json()).items as { id: string }[]).map((item) => item.id)).toEqual([seedIds.organizationChairman]);
  expect((await page.request.get("/api/admin/audit")).status()).toBe(403);
  const created = await page.request.post("/api/admin/surveys", {
    headers: { origin },
    data: {
      protocolNumber: `CHAIR-${Date.now()}`, titleRu: "Опрос председателя", titleKk: "Төраға сауалнамасы",
      descriptionRu: "Черновик председателя ОСИ", descriptionKk: "ОСИ төрағасының жобасы",
      startsAt: new Date(Date.now() - 60_000).toISOString(), closesAt: new Date(Date.now() + 2 * 86_400_000).toISOString(),
    },
  });
  expect(created.status()).toBe(201);
  expect((await created.json() as { organizationId: string }).organizationId).toBe(seedIds.organizationChairman);
});

test("E: one organization cannot reach another organization's survey, results, participants or documents", async ({ page }) => {
  await signIn(page, aerc.login, aerc.password);
  const organizationA = await createOrganization(page, "1");
  const organizationB = await createOrganization(page, "2");
  const userA = await createOrganizationUser(page, organizationA, "manager@org-a.kz");
  await createOrganizationUser(page, organizationB, "manager@org-b.kz");
  await signOut(page);

  await signIn(page, "manager@org-b.kz", "TempPass2026", "OrgBPass2026");
  const surveyB = await publishOrganizationSurvey(page, `ORG-B-${Date.now()}`, "Опрос организации B");
  await signOut(page);

  const documentId = await voteAsOwner(page, "Опрос организации B");
  await signOut(page);

  await signIn(page, userA.login, userA.password, "OrgAPass2026");
  await page.goto("/admin/surveys");
  await expect(page.getByText("Опрос организации B")).toHaveCount(0);
  await page.goto("/admin/organizations");
  await expect(page.locator(".admin-table tbody tr")).toHaveCount(1);

  const surveys = await page.request.get("/api/admin/surveys");
  expect(JSON.stringify(await surveys.json())).not.toContain(surveyB);
  denied(await page.request.get(`/api/admin/surveys/${surveyB}`));
  denied(await page.request.get(`/api/admin/surveys/${surveyB}/results`));
  denied(await page.request.get(`/api/admin/surveys/${surveyB}/progress`));
  denied(await page.request.get(`/api/admin/surveys/${surveyB}/participants`));
  denied(await page.request.get(`/api/admin/surveys/${surveyB}/results/export`));
  denied(await page.request.get(`/api/admin/surveys/${surveyB}/participants/export`));
  denied(await page.request.get(`/api/admin/documents/${documentId}`));
  denied(await page.request.get(`/api/admin/organizations/${organizationB}/users`));
  denied(await page.request.post(`/api/admin/organizations/${organizationB}/users`, {
    headers: { origin }, data: { displayName: "Чужой пользователь", login: "intruder@org-b.kz", password: "TempPass2026", role: "organization_admin" },
  }));
  denied(await page.request.post(`/api/admin/surveys/${surveyB}/close`, { headers: { origin } }));
  denied(await page.request.patch(`/api/admin/organizations/${organizationB}`, {
    headers: { origin }, data: { displayName: "Захвачено", legalName: "Захвачено", type: "osi", status: "inactive" },
  }));
  const foreignDraft = await page.request.post("/api/admin/surveys", {
    headers: { origin },
    data: {
      protocolNumber: `HIJACK-${Date.now()}`, titleRu: "Чужой опрос", titleKk: "Бөтен сауалнама",
      descriptionRu: "Попытка создать опрос за другую организацию", descriptionKk: "Басқа ұйым үшін сауалнама",
      organizationId: organizationB, startsAt: new Date().toISOString(), closesAt: new Date(Date.now() + 86_400_000).toISOString(),
    },
  });
  expect(foreignDraft.status()).toBe(403);
});
