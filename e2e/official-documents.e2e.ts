import { expect, test, type Page } from "@playwright/test";
import { e2eDatabase, resetE2eState, confirmSurveyOwner, loginAsOwner, signAndSubmitVote } from "./support";

const origin = "http://127.0.0.1:3100";
const surveyId = "00000000-0000-4000-8000-000000000041";

async function loginAdmin(page: Page) {
  await page.goto("/admin/login");
  await page.getByLabel("Логин").fill("admin@aerc.kz");
  await page.getByLabel("Пароль").fill("DemoAdmin26");
  await page.getByRole("button", { name: /Войти в консоль/ }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

function pdfImageCount(bytes: Buffer) {
  return [...bytes.toString("latin1").matchAll(/\/Subtype\s*\/Image/g)].length;
}

test.beforeEach(async () => resetE2eState());

test("owner votes on the CCTV survey, then officials sign after close and final PDFs follow the Word templates", async ({ page }) => {
  test.setTimeout(120_000);
  await loginAsOwner(page);
  const card = page.locator(".survey-card", { hasText: "видеонаблюдения" });
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: /Пройти/ }).click();
  await page.getByRole("button", { name: /^Начать/ }).click();
  await confirmSurveyOwner(page);
  for (const choice of ["За", "За", "За"]) {
    await page.getByRole("button", { name: new RegExp(`^${choice}`) }).click();
    await expect(page.getByTestId("save-status")).toContainText("Сохранено");
    await page.getByRole("button", { name: /Далее|Проверить/ }).click();
  }
  await page.getByRole("button", { name: /Перейти к подтверждению/ }).click();
  const documentId = await signAndSubmitVote(page);

  const sheetV1 = await page.request.get(`/api/documents/${documentId}/pdf`);
  expect(sheetV1.status()).toBe(200);
  const sheetV1Bytes = Buffer.from(await sheetV1.body());
  expect(sheetV1Bytes.subarray(0, 5).toString()).toBe("%PDF-");
  expect(sheetV1Bytes.byteLength).toBeGreaterThan(4_000);
  const sheetV1Images = pdfImageCount(sheetV1Bytes);
  expect(sheetV1Images).toBeGreaterThan(1);

  await page.request.delete("/api/session", { headers: { origin } });
  await loginAdmin(page);

  const premature = await page.request.post(`/api/admin/surveys/${surveyId}/signatures`, {
    headers: { origin, "content-type": "application/json" },
    data: { signatoryId: "00000000-0000-4000-8000-000000000001", dataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==" },
  });
  expect(premature.status()).toBeGreaterThanOrEqual(400);

  await page.goto(`/admin/surveys/${surveyId}`);
  await expect(page.getByRole("button", { name: "Подписать" })).toHaveCount(0);
  await page.getByRole("link", { name: "Прогресс" }).click();
  await expect(page.getByText(/доступна после закрытия/)).toBeVisible();

  await page.goto(`/admin/surveys/${surveyId}`);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Закрыть" }).click();
  await expect(page.getByText("Закрыт", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Перейти к результатам" })).toBeVisible();
  await expect(page.getByText("Подписание итоговых документов")).toBeVisible();

  await page.getByRole("link", { name: "Перейти к результатам" }).click();
  const resultRows = page.locator(".admin-table tbody tr");
  await expect(resultRows).toHaveCount(3);
  await expect(resultRows.nth(0).locator(".result-for")).toHaveText("1");
  await expect(page.getByText("ПРИНЯТО").first()).toBeVisible();

  await page.goto(`/admin/surveys/${surveyId}`);
  for (let index = 0; index < 6; index += 1) {
    await page.getByRole("button", { name: "Подписать" }).first().click();
    const canvas = page.getByLabel("Поле для рукописной подписи");
    const box = await canvas.boundingBox();
    if (!box) throw new Error("Official signature canvas is missing");
    await canvas.dispatchEvent("pointerdown", { pointerId: 1, clientX: box.x + 24, clientY: box.y + 28, buttons: 1 });
    await canvas.dispatchEvent("pointermove", { pointerId: 1, clientX: box.x + 120, clientY: box.y + 52, buttons: 1 });
    await canvas.dispatchEvent("pointerup", { pointerId: 1, clientX: box.x + 120, clientY: box.y + 52 });
    await page.getByRole("button", { name: /Готово/ }).click();
    await expect(page.getByText("Подпись сохранена")).toBeVisible();
  }
  await expect(page.getByRole("button", { name: "Подписать" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Протокол PDF" })).toBeVisible();

  const protocolLink = await page.getByRole("link", { name: "Протокол PDF" }).getAttribute("href");
  expect(protocolLink).toMatch(/\/api\/documents\/[0-9a-f-]+\/pdf$/);
  const protocolPdf = await page.request.get(protocolLink!);
  expect(protocolPdf.status()).toBe(200);
  const protocolBytes = Buffer.from(await protocolPdf.body());
  expect(protocolBytes.subarray(0, 5).toString()).toBe("%PDF-");
  expect(protocolBytes.byteLength).toBeGreaterThan(3_000);
  expect(pdfImageCount(protocolBytes)).toBeGreaterThan(3);

  const sheetV2 = await page.request.get(`/api/documents/${documentId}/pdf`);
  const sheetV2Bytes = Buffer.from(await sheetV2.body());
  expect(sheetV2Bytes.byteLength).toBeGreaterThan(sheetV1Bytes.byteLength);
  expect(pdfImageCount(sheetV2Bytes)).toBeGreaterThan(sheetV1Images);

  const sql = e2eDatabase();
  try {
    const [document] = await sql<{ version: number }[]>`
      select d.current_version as version from documents d where d.public_id=${documentId}
    `;
    expect(document.version).toBe(2);
    const versions = await sql<{ version: number }[]>`
      select dv.version from documents d join document_versions dv on dv.document_id=d.id
      where d.public_id=${documentId} order by dv.version
    `;
    expect(versions.map((row) => row.version)).toEqual([1, 2]);
    const signatures = await sql<{ count: number }[]>`select count(*)::int as count from official_signatures where survey_id=${surveyId}`;
    expect(signatures[0].count).toBe(6);
    const protocol = await sql<{ publicId: string }[]>`select public_id as "publicId" from documents where survey_id=${surveyId} and document_type='protocol'`;
    expect(protocol[0]?.publicId).toBeTruthy();
  } finally {
    await sql.end();
  }
});
