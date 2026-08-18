import { expect, test, type Page } from "@playwright/test";
import { e2eDatabase, resetE2eState } from "./support";

const origin = "http://127.0.0.1:3100";
const voterId = "00000000-0000-4000-8000-000000000001";
const seedSurveyId = "00000000-0000-4000-8000-000000000012";

async function loginAdmin(page: Page) {
  await page.goto("/admin/login");
  await page.getByRole("button", { name: /development admin/i }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole("heading", { name: "Состояние платформы" })).toBeVisible();
}

async function loginVoter(page: Page) {
  const response = await page.request.post("/api/dev/session", { headers: { origin } });
  expect(response.status()).toBe(200);
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Мои опросы" })).toBeVisible();
}

test.beforeEach(async () => resetE2eState());

test("admin publishes a targeted survey, observes a final vote and closes it", async ({ page }) => {
  await loginAdmin(page);
  await page.goto("/admin/surveys/new");
  const protocol = `E2E-${Date.now()}`;
  await page.getByLabel("Номер протокола").fill(protocol);
  await page.getByLabel("Название · RU").fill("E2E голосование дома");
  await page.getByLabel("Название · KZ").fill("Үйдің E2E дауыс беруі");
  await page.getByLabel("Описание · RU").fill("Проверка полного административного жизненного цикла");
  await page.getByLabel("Описание · KZ").fill("Әкімшілік өмірлік циклін толық тексеру");
  await page.getByLabel("Начало").fill(localInput(new Date(Date.now() - 60_000)));
  await page.getByLabel("Завершение").fill(localInput(new Date(Date.now() + 2 * 86_400_000)));
  await page.getByRole("button", { name: "Сохранить черновик" }).click();
  await expect(page).toHaveURL(/\/admin\/surveys\/[0-9a-f-]+\/edit$/);
  const surveyId = page.url().split("/").at(-2)!;

  const ru = page.getByPlaceholder("Текст вопроса RU"); const kk = page.getByPlaceholder("Сұрақ мәтіні KZ");
  for (const [index, values] of [[1,"Благоустройство двора","Ауланы абаттандыру"],[2,"Обновление освещения","Жарықтандыруды жаңарту"],[3,"Ремонт подъезда","Кіреберісті жөндеу"]] as const) {
    await ru.fill(values[1]); await kk.fill(values[2]); await page.getByRole("button", { name: "Добавить" }).click();
    await expect(page.getByText(`Вопросы · ${index}`)).toBeVisible();
  }
  await page.locator(".admin-question-list article").nth(2).getByRole("button", { name: "Выше" }).click();
  await page.getByLabel("Город").fill("Астана"); await page.getByLabel("Улица").fill("Геодезическая"); await page.getByLabel("Дом").fill("12");
  await page.getByRole("button", { name: "Назначить дому" }).click();
  await expect(page.getByText("Предпросмотр · RU / KZ")).toBeVisible();

  await page.goto(`/admin/surveys/${surveyId}`);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Опубликовать" }).click();
  await expect(page.getByText("Активен", { exact: true })).toBeVisible();

  await page.request.delete("/api/session", { headers: { origin } });
  await loginVoter(page);
  const card = page.locator(".survey-card", { hasText: "E2E голосование дома" });
  await expect(card).toBeVisible(); await card.getByRole("button", { name: "Пройти" }).click();
  await page.getByRole("button", { name: /^Начать/ }).click();
  await page.getByLabel("Лицевой счёт").fill("1911"); await page.getByRole("button", { name: /Найти объект/ }).click();
  await page.getByRole("button", { name: /Перейти к голосованию/ }).click();
  for (const choice of ["За", "Против", "Воздержусь"]) {
    await page.getByRole("button", { name: new RegExp(`^${choice}`) }).click();
    await expect(page.getByTestId("save-status")).toContainText("Сохранено");
    await page.getByRole("button", { name: /Далее|Проверить/ }).click();
  }
  await page.getByRole("button", { name: /Перейти к подтверждению/ }).click();
  await page.getByRole("button", { name: /Добавить визуальную подпись/ }).click();
  const canvas=page.getByLabel("Поле для рукописной подписи");const box=await canvas.boundingBox();if(!box)throw new Error("Signature canvas missing");
  await canvas.dispatchEvent("pointerdown",{pointerId:1,clientX:box.x+20,clientY:box.y+30,buttons:1});await canvas.dispatchEvent("pointermove",{pointerId:1,clientX:box.x+120,clientY:box.y+60,buttons:1});await canvas.dispatchEvent("pointerup",{pointerId:1,clientX:box.x+120,clientY:box.y+60});
  await page.getByRole("button", { name: "Готово" }).click(); await page.getByRole("button", { name: /Подтвердить и отправить/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: /Отправить голосование/ }).click();
  await expect(page.getByRole("heading", { name: "Голос принят" })).toBeVisible(); const documentId=(await page.locator(".document-id").textContent())!.trim();

  await page.request.delete("/api/session", { headers: { origin } }); await loginAdmin(page);
  await page.goto(`/admin/surveys/${surveyId}/results`); await expect(page.getByText("Participation")).toBeVisible();
  const resultRows=page.locator(".admin-table tbody tr"); await expect(resultRows).toHaveCount(3); await expect(resultRows.nth(0)).toContainText("1");
  const resultsExport=await page.request.get(`/api/admin/surveys/${surveyId}/results/export`);expect(resultsExport.status()).toBe(200);expect(await resultsExport.text()).toContain(protocol);
  await page.goto(`/admin/surveys/${surveyId}/participants`); await expect(page.getByText("••••1911")).toBeVisible();
  const participantsExport=await page.request.get(`/api/admin/surveys/${surveyId}/participants/export`);expect(participantsExport.status()).toBe(200);expect(await participantsExport.text()).toContain("1911");
  await page.goto("/admin/documents"); await expect(page.getByText(documentId)).toBeVisible(); await page.goto(`/admin/documents/${documentId}`); await expect(page.getByText("valid",{exact:true})).toBeVisible();
  const pdf=await page.request.get(`/api/documents/${documentId}/pdf`);expect(pdf.status()).toBe(200);
  const closed=await page.request.post(`/api/admin/surveys/${surveyId}/close`,{headers:{origin}});expect(closed.status()).toBe(200);
  await page.request.delete("/api/session", { headers: { origin } }); await loginVoter(page);
  const rejected=await page.request.post(`/api/surveys/${surveyId}/votes`,{headers:{origin},data:{accountReference:"1911",idempotencyKey:crypto.randomUUID()}});expect(rejected.status()).toBe(409);
  await page.request.delete("/api/session", { headers: { origin } }); await loginAdmin(page);
  const archived=await page.request.post(`/api/admin/surveys/${surveyId}/archive`,{headers:{origin}});expect(archived.status()).toBe(200);expect((await archived.json()).status).toBe("archived");
  const audit=await page.request.get("/api/admin/audit?eventType=SURVEY_ARCHIVED");expect(audit.status()).toBe(200);
  const auditBody=await audit.json() as {items:{subjectId:string}[]};expect(auditBody.items.some(item=>item.subjectId===surveyId)).toBe(true);
});

test("account targeting reaches an owner who has never participated in any survey", async ({ page }) => {
  await clearParticipation();
  await loginAdmin(page);
  await page.goto("/admin/surveys/new");
  const protocol = `E2E-ACCOUNT-${Date.now()}`;
  await page.getByLabel("Номер протокола").fill(protocol);
  await page.getByLabel("Название · RU").fill("Опрос по лицевому счёту");
  await page.getByLabel("Название · KZ").fill("Жеке шот бойынша сауалнама");
  await page.getByLabel("Описание · RU").fill("Адресная рассылка по лицевому счёту 1911");
  await page.getByLabel("Описание · KZ").fill("1911 жеке шоты бойынша мекенжайлық тарату");
  await page.getByLabel("Начало").fill(localInput(new Date(Date.now() - 60_000)));
  await page.getByLabel("Завершение").fill(localInput(new Date(Date.now() + 2 * 86_400_000)));
  await page.getByRole("button", { name: "Сохранить черновик" }).click();
  await expect(page).toHaveURL(/\/admin\/surveys\/[0-9a-f-]+\/edit$/);
  const surveyId = page.url().split("/").at(-2)!;

  await page.getByPlaceholder("Текст вопроса RU").fill("Утвердить смету на 2026 год");
  await page.getByPlaceholder("Сұрақ мәтіні KZ").fill("2026 жылға смета бекітілсін");
  await page.getByRole("button", { name: "Добавить" }).click();
  await expect(page.getByText("Вопросы · 1")).toBeVisible();

  await page.locator(".admin-target-grid textarea").fill("1911");
  await page.getByRole("button", { name: "Проверить CSV" }).click();
  await expect(page.getByText("Resolved: 1")).toBeVisible();
  await page.getByRole("button", { name: "Подтвердить import" }).click();
  await expect(page.getByText("1 targets")).toBeVisible();

  await page.goto(`/admin/surveys/${surveyId}`);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Опубликовать" }).click();
  await expect(page.getByText("Активен", { exact: true })).toBeVisible();
  await expect(page.getByText("1 eligible")).toBeVisible();

  await page.request.delete("/api/session", { headers: { origin } });
  await loginVoter(page);
  const card = page.locator(".survey-card", { hasText: "Опрос по лицевому счёту" });
  await expect(card).toBeVisible();
  await expect(page.locator(".survey-card", { hasText: "ПРОТОКОЛ №12" })).toHaveCount(0);
  await card.getByRole("button", { name: "Пройти" }).click();
  await page.getByRole("button", { name: /^Начать/ }).click();
  await page.getByLabel("Лицевой счёт").fill("1911");
  await page.getByRole("button", { name: /Найти объект/ }).click();
  await page.getByRole("button", { name: /Перейти к голосованию/ }).click();
  await page.getByRole("button", { name: /^За/ }).click();
  await expect(page.getByTestId("save-status")).toContainText("Сохранено");
  await page.getByRole("button", { name: /Проверить/ }).click();
  await page.getByRole("button", { name: /Перейти к подтверждению/ }).click();
  // A toast expiring mid-stroke remounts the screen and clears the canvas.
  await expect(page.locator(".toast")).toHaveCount(0);
  await page.getByRole("button", { name: /Добавить визуальную подпись/ }).click();
  const canvas = page.getByLabel("Поле для рукописной подписи"); const box = await canvas.boundingBox(); if (!box) throw new Error("Signature canvas missing");
  await canvas.dispatchEvent("pointerdown", { pointerId: 1, clientX: box.x + 20, clientY: box.y + 30, buttons: 1 });
  await canvas.dispatchEvent("pointermove", { pointerId: 1, clientX: box.x + 110, clientY: box.y + 55, buttons: 1 });
  await canvas.dispatchEvent("pointerup", { pointerId: 1, clientX: box.x + 110, clientY: box.y + 55 });
  await page.getByRole("button", { name: "Готово" }).click();
  await page.getByRole("button", { name: /Подтвердить и отправить/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: /Отправить голосование/ }).click();
  await expect(page.getByRole("heading", { name: "Голос принят" })).toBeVisible();
  const documentId = (await page.locator(".document-id").textContent())!.trim();

  await page.request.delete("/api/session", { headers: { origin } });
  await loginAdmin(page);
  await page.goto(`/admin/surveys/${surveyId}/results`);
  await expect(page.locator(".admin-table tbody tr")).toHaveCount(1);
  await page.goto(`/admin/surveys/${surveyId}/participants`);
  await expect(page.getByText("••••1911")).toBeVisible();
  await page.goto(`/admin/documents/${documentId}`);
  await expect(page.getByText("valid", { exact: true })).toBeVisible();
  expect((await page.request.get(`/api/documents/${documentId}/pdf`)).status()).toBe(200);
});

test("admin mutations enforce optimistic concurrency and audited role assignment", async ({ page }) => {
  await loginAdmin(page);
  const created=await page.request.post("/api/admin/surveys",{headers:{origin},data:validDraft()});
  expect(created.status()).toBe(201);
  const survey=await created.json() as {id:string;lockVersion:number};
  const update={...validDraft(),protocolNumber:"LOCK-UPDATED",expectedLockVersion:survey.lockVersion};
  const first=await page.request.patch(`/api/admin/surveys/${survey.id}`,{headers:{origin},data:update});
  expect(first.status()).toBe(200);
  const stale=await page.request.patch(`/api/admin/surveys/${survey.id}`,{headers:{origin},data:update});
  expect(stale.status()).toBe(409);

  expect((await page.request.post(`/api/admin/users/${voterId}/roles`,{headers:{origin},data:{role:"viewer"}})).status()).toBe(204);
  expect((await page.request.delete(`/api/admin/users/${voterId}/roles/viewer`,{headers:{origin}})).status()).toBe(204);
  const audit=await page.request.get("/api/admin/audit?eventType=ROLE_ASSIGNED");
  expect(audit.status()).toBe(200);
  expect((await audit.json()).total).toBeGreaterThan(0);
});

test("platform RBAC blocks privilege escalation and omits full participant account", async ({ page }) => {
  await loginVoter(page);
  expect((await page.request.get("/api/admin/dashboard")).status()).toBe(403);
  await page.goto("/admin"); await expect(page.getByText("Для этого раздела нужна административная роль.")).toBeVisible();

  await assignOnly("viewer");
  expect((await page.request.get("/api/admin/surveys")).status()).toBe(200);
  expect((await page.request.post("/api/admin/surveys",{headers:{origin},data:validDraft()})).status()).toBe(403);

  await assignOnly("operator");
  expect((await page.request.post(`/api/admin/surveys/${seedSurveyId}/publish`,{headers:{origin}})).status()).toBe(403);

  await assignOnly("survey_manager");
  expect((await page.request.post(`/api/admin/users/${voterId}/roles`,{headers:{origin},data:{role:"super_admin"}})).status()).toBe(403);
  const participants=await page.request.get(`/api/admin/surveys/${seedSurveyId}/participants`);expect(participants.status()).toBe(200);
  const body=await participants.json() as {items:{account:string}[]};expect(body.items[0].account).toBe("••••1911");
  expect(Object.values(body.items[0])).not.toContain("1911");
  expect((await page.request.delete("/api/admin/audit/anything",{headers:{origin}})).status()).toBe(404);
});

async function clearParticipation(){const sql=e2eDatabase();try{await sql`delete from survey_participants`;}finally{await sql.end();}}
async function assignOnly(role:string){const sql=e2eDatabase();try{await sql.begin(async tx=>{await tx`delete from user_platform_roles where user_id=${voterId}`;await tx`insert into user_platform_roles(user_id,role_id) select ${voterId},id from platform_roles where role_key=${role}`;await tx`insert into platform_access_controls(user_id) values(${voterId}) on conflict(user_id) do update set disabled_at=null`;});}finally{await sql.end();}}
function localInput(date:Date){const shifted=new Date(date.getTime()-date.getTimezoneOffset()*60_000);return shifted.toISOString().slice(0,16)}
function validDraft(){return{protocolNumber:"DENIED",titleRu:"Denied",titleKk:"Тыйым",descriptionRu:"Denied",descriptionKk:"Тыйым",startsAt:new Date().toISOString(),closesAt:new Date(Date.now()+86_400_000).toISOString()}}
