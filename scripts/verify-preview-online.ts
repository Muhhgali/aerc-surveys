import postgres from "postgres";
import { requireDatabaseTarget } from "./database-safety";
import { postgresClientOptions } from "../src/infrastructure/database/database-url";
import { DEMO_ADMIN_LOGIN, DEMO_ADMIN_PASSWORD } from "../src/domain/demo-fixtures";
import { seedIds } from "../src/infrastructure/database/seed-data";

function cookieHeader(response: Response): string {
  const setter = response.headers.getSetCookie?.() ?? [];
  if (setter.length) return setter.map((entry) => entry.split(";", 1)[0]).join("; ");
  const fallback = response.headers.get("set-cookie");
  return fallback ? fallback.split(";", 1)[0] : "";
}

async function fixtures() {
  const target = requireDatabaseTarget();
  const sql = postgres(target.url, postgresClientOptions(target));
  try {
    const [users] = await sql<{ n: number }[]>`select count(*)::int as n from users`;
    const [roles] = await sql<{ n: number }[]>`
      select count(*)::int as n from user_platform_roles upr
      join platform_roles r on r.id = upr.role_id
      where upr.user_id = ${seedIds.representativeUser} and r.role_key = 'super_admin'
    `;
    const [account] = await sql<{ account_number: string; city: string; street: string; building: string; premise: string }[]>`
      select pa.account_number, p.city, p.street, p.building, p.premise
      from personal_accounts pa join properties p on p.id = pa.property_id
      where pa.account_number = '1911' and pa.status = 'active'
    `;
    const [holding] = await sql<{ n: number }[]>`
      select count(*)::int as n from property_holdings
      where user_id = ${seedIds.voterUser} and personal_account_id = ${seedIds.personalAccount} and status = 'active'
    `;
    const [surveyCount] = await sql<{ n: number }[]>`select count(*)::int as n from surveys`;
    const [chairman] = await sql<{ login: string; role: string }[]>`
      select uc.login, g.role_key as role
      from user_credentials uc
      join organization_access_grants g on g.user_id = uc.user_id
      where uc.user_id = ${seedIds.chairmanUser} and g.organization_id = ${seedIds.organizationChairman}
    `;
    const [org] = await sql<{ display_name: string }[]>`select display_name from organizations where id = ${seedIds.organizationChairman}`;
    const [audit] = await sql<{ n: number }[]>`select count(*)::int as n from audit_logs`;
    return {
      host: `${target.host}:${target.port}`,
      users: users.n,
      superAdmin: roles.n === 1,
      account1911: account ?? null,
      holding: holding.n === 1,
      surveys: surveyCount.n,
      chairman: chairman ?? null,
      organization: org?.display_name ?? null,
      audit: audit.n,
    };
  } finally {
    await sql.end({ timeout: 1 }).catch(() => undefined);
  }
}

async function json(response: Response) {
  const text = await response.text();
  try { return JSON.parse(text) as Record<string, unknown>; } catch { return { raw: text.slice(0, 400) }; }
}

async function httpFlow(baseUrl: string) {
  const origin = baseUrl;
  const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  const headers = (cookie: string, extra: Record<string, string> = {}) => ({
    origin, cookie, "content-type": "application/json", ...extra,
  });

  const health = await fetch(`${baseUrl}/api/health`);
  if (!health.ok) throw new Error(`health ${health.status}`);

  const adminLogin = await fetch(`${baseUrl}/api/dev/admin-session`, {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({ method: "password", login: DEMO_ADMIN_LOGIN, password: DEMO_ADMIN_PASSWORD }),
  });
  if (!adminLogin.ok) throw new Error(`admin login ${adminLogin.status} ${JSON.stringify(await json(adminLogin))}`);
  let cookie = cookieHeader(adminLogin);

  const created = await fetch(`${baseUrl}/api/admin/surveys`, {
    method: "POST", headers: headers(cookie),
    body: JSON.stringify({
      protocolNumber: `ONLINE-${Date.now()}`,
      titleRu: "Онлайн проверка targeting", titleKk: "Онлайн тексеру",
      descriptionRu: "Preview flow", descriptionKk: "Preview flow",
      startsAt: new Date(Date.now() - 60_000).toISOString(),
      closesAt: new Date(Date.now() + 2 * 86_400_000).toISOString(),
    }),
  });
  if (created.status !== 201) throw new Error(`create survey ${created.status} ${JSON.stringify(await json(created))}`);
  const survey = await created.json() as { id: string };

  const question = await fetch(`${baseUrl}/api/admin/surveys/${survey.id}/questions`, {
    method: "POST", headers: headers(cookie),
    body: JSON.stringify({ textRu: "Утвердить смету", textKk: "Смета бекітілсін", required: true }),
  });
  if (![200, 201].includes(question.status)) throw new Error(`question ${question.status} ${JSON.stringify(await json(question))}`);

  const references = await fetch(`${baseUrl}/api/admin/references`, { headers: { cookie, origin } });
  const refBody = await references.json() as { accounts: { id: string; accountNumber: string }[] };
  const account = refBody.accounts.find((item) => item.accountNumber === "1911");
  if (!account) throw new Error("personal account 1911 missing from admin references");

  const targets = await fetch(`${baseUrl}/api/admin/surveys/${survey.id}/targets`, {
    method: "PUT", headers: headers(cookie),
    body: JSON.stringify({ targets: [{ type: "personal_account", personalAccountId: account.id }] }),
  });
  if (!targets.ok) throw new Error(`targets ${targets.status} ${JSON.stringify(await json(targets))}`);

  const published = await fetch(`${baseUrl}/api/admin/surveys/${survey.id}/publish`, { method: "POST", headers: headers(cookie) });
  const publishedBody = await json(published);
  if (!published.ok) throw new Error(`publish ${published.status} ${JSON.stringify(publishedBody)}`);

  await fetch(`${baseUrl}/api/session`, { method: "DELETE", headers: headers(cookie) });
  const ownerLogin = await fetch(`${baseUrl}/api/dev/session`, { method: "POST", headers: { origin } });
  if (!ownerLogin.ok) throw new Error(`owner login ${ownerLogin.status} ${JSON.stringify(await json(ownerLogin))}`);
  cookie = cookieHeader(ownerLogin);

  const catalogue = await fetch(`${baseUrl}/api/surveys`, { headers: { cookie } });
  const catalogueBody = await catalogue.json() as { surveys: { id: string; protocol: string }[] };
  const visible = catalogueBody.surveys.some((item) => item.id === survey.id);
  if (!visible) throw new Error(`owner catalogue missing new survey; got ${catalogueBody.surveys.map((item) => item.protocol).join(",")}`);

  const voteStart = await fetch(`${baseUrl}/api/surveys/${survey.id}/votes`, {
    method: "POST", headers: headers(cookie),
    body: JSON.stringify({ accountReference: "1911", idempotencyKey: crypto.randomUUID() }),
  });
  if (![200, 201].includes(voteStart.status)) throw new Error(`start vote ${voteStart.status} ${JSON.stringify(await json(voteStart))}`);
  const voteBody = await voteStart.json() as { vote: { id: string }; questions?: { id: string }[] };
  const voteId = voteBody.vote.id;
  const questionId = (await (await fetch(`${baseUrl}/api/surveys` , { headers: { cookie } })).json() as { surveys: { id: string; questions: { id: string }[] }[] })
    .surveys.find((item) => item.id === survey.id)?.questions[0]?.id;
  if (!questionId) throw new Error("published survey has no questions in owner catalogue");

  const answered = await fetch(`${baseUrl}/api/votes/${voteId}/answers`, {
    method: "PUT", headers: headers(cookie),
    body: JSON.stringify({ idempotencyKey: crypto.randomUUID(), questionId, choice: "for" }),
  });
  if (!answered.ok) throw new Error(`answer ${answered.status} ${JSON.stringify(await json(answered))}`);

  const signature = await fetch(`${baseUrl}/api/votes/${voteId}/visual-signature`, {
    method: "POST", headers: headers(cookie),
    body: JSON.stringify({ dataUrl: png }),
  });
  if (![200, 201].includes(signature.status)) throw new Error(`signature ${signature.status} ${JSON.stringify(await json(signature))}`);

  const submitted = await fetch(`${baseUrl}/api/votes/${voteId}/submit`, {
    method: "POST", headers: headers(cookie),
    body: JSON.stringify({ idempotencyKey: crypto.randomUUID() }),
  });
  const submittedBody = await json(submitted);
  if (!submitted.ok) throw new Error(`submit ${submitted.status} ${JSON.stringify(submittedBody)}`);

  await fetch(`${baseUrl}/api/session`, { method: "DELETE", headers: headers(cookie) });
  const adminAgain = await fetch(`${baseUrl}/api/dev/admin-session`, {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({ method: "password", login: DEMO_ADMIN_LOGIN, password: DEMO_ADMIN_PASSWORD }),
  });
  cookie = cookieHeader(adminAgain);
  const results = await fetch(`${baseUrl}/api/admin/surveys/${survey.id}/results`, { headers: { cookie } });
  const participants = await fetch(`${baseUrl}/api/admin/surveys/${survey.id}/participants`, { headers: { cookie } });
  return {
    surveyId: survey.id,
    publishedEligible: (publishedBody as { eligibleCount?: number }).eligibleCount ?? publishedBody,
    ownerSawSurvey: visible,
    submit: submitted.status,
    documentId: (submittedBody.document as { id?: string } | undefined)?.id ?? null,
    resultsStatus: results.status,
    participantsStatus: participants.status,
    participants: await json(participants),
    results: await json(results),
  };
}

async function main() {
  const data = await fixtures();
  console.info(JSON.stringify({ fixtures: data }, null, 2));
  const missing = [
    data.users >= 3 ? null : "users",
    data.superAdmin ? null : "super_admin",
    data.account1911?.account_number === "1911" ? null : "account1911",
    data.holding ? null : "holding",
    data.surveys === 0 ? null : "surveys_not_empty",
    data.chairman?.login === "chairman@geodez12.kz" && data.chairman.role === "chairman" ? null : "chairman",
    data.organization ? null : "chairman_organization",
    data.audit === 0 ? null : "audit_not_empty",
  ].filter(Boolean);
  if (missing.length) {
    console.error(JSON.stringify({ incompleteFixtures: missing }));
    process.exitCode = 1;
    return;
  }
  const baseUrl = process.env.PREVIEW_BASE_URL;
  if (!baseUrl) return;
  const flow = await httpFlow(baseUrl.replace(/\/$/, ""));
  console.info(JSON.stringify({ flow: {
    surveyId: flow.surveyId,
    ownerSawSurvey: flow.ownerSawSurvey,
    submit: flow.submit,
    documentId: flow.documentId,
    resultsStatus: flow.resultsStatus,
    participantsStatus: flow.participantsStatus,
    participantAccounts: Array.isArray((flow.participants as { items?: { account?: string }[] }).items)
      ? (flow.participants as { items: { account?: string }[] }).items.map((item) => item.account)
      : flow.participants,
  } }, null, 2));
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "preview verify failed");
  process.exit(1);
});
