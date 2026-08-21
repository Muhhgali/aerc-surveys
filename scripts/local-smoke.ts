const origin = "http://localhost:3000";
const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==";

function sessionCookie(response: Response) {
  const cookies = typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [response.headers.get("set-cookie") ?? ""];
  const match = cookies.find((entry) => entry.startsWith("aerc_session="));
  return match ? match.split(";", 1)[0] : "";
}

async function check(label: string, input: string, init: RequestInit = {}) {
  const started = Date.now();
  const response = await fetch(input, { ...init, redirect: "manual" });
  const elapsed = Date.now() - started;
  const type = response.headers.get("content-type") ?? "";
  const body = type.includes("json") ? await response.json() : await response.text();
  const snippet = typeof body === "string"
    ? body.includes("Проверяем доступ") ? "contains-access-check"
      : body.includes("Вход в консоль") ? "login-form"
        : body.includes("admin-shell") || body.includes("Обзор") ? "admin-console"
          : `html:${body.length}`
    : JSON.stringify(body).slice(0, 180);
  console.log(`${label} ${response.status} ${elapsed}ms ${snippet}`);
  return { response, body };
}

async function main() {
  const health = await check("health", `${origin}/api/health`);
await check("admin-unauth", `${origin}/admin`);
await check("admin-login-page", `${origin}/admin/login`);
await check("home", `${origin}/`);

const login = await fetch(`${origin}/api/auth/login`, {
  method: "POST",
  headers: { origin, "content-type": "application/json" },
  body: JSON.stringify({ login: "admin@aerc.kz", password: "DemoAdmin26" }),
});
const loginJson = await login.json() as { authenticated?: boolean; error?: { message?: string } };
console.log(`password-login ${login.status} authenticated=${Boolean(loginJson.authenticated)} error=${loginJson.error?.message ?? "none"}`);
const adminCookie = sessionCookie(login);
if (!adminCookie) {
  console.log("password-login missing session cookie");
} else {
  const dashboard = await fetch(`${origin}/api/admin/dashboard`, { headers: { cookie: adminCookie } });
  const payload = await dashboard.json() as Record<string, unknown>;
  const error = payload.error && typeof payload.error === "object" && "message" in payload.error ? String((payload.error as { message?: string }).message) : "";
  console.log(`admin-dashboard ${dashboard.status} ${error || Object.keys(payload).join(",")}`);
}

  const chairman = await fetch(`${origin}/api/auth/login`, {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({ login: "chairman@geodez12.kz", password: "Chairman26" }),
  });
  const chairmanJson = await chairman.json() as { authenticated?: boolean; error?: { message?: string } };
  console.log(`chairman-login ${chairman.status} authenticated=${Boolean(chairmanJson.authenticated)} error=${chairmanJson.error?.message ?? "none"}`);
  const chairmanCookie = sessionCookie(chairman);
  if (chairmanCookie) {
    const dashboard = await fetch(`${origin}/api/admin/dashboard`, { headers: { cookie: chairmanCookie } });
    const payload = await dashboard.json() as Record<string, unknown>;
    const error = payload.error && typeof payload.error === "object" && "message" in payload.error ? String((payload.error as { message?: string }).message) : "";
    console.log(`chairman-dashboard ${dashboard.status} ${error || Object.keys(payload).join(",")}`);
    await fetch(`${origin}/api/session`, { method: "DELETE", headers: { cookie: chairmanCookie, origin } });
  }

  const owner = await fetch(`${origin}/api/dev/session`, {
  method: "POST",
  headers: { origin, "content-type": "application/json" },
  body: "{}",
});
const ownerCookie = sessionCookie(owner);
console.log(`owner-session ${owner.status}`);
if (ownerCookie) {
  const headers = { cookie: ownerCookie, origin, "content-type": "application/json" };
  const resolved = await fetch(`${origin}/api/personal-accounts/resolve`, { method: "POST", headers, body: JSON.stringify({ accountReference: "1911" }) });
  const resolvedBody = await resolved.json() as { account?: { address?: string; unit?: string }; error?: { message?: string } };
  console.log(`resolve-1911 ${resolved.status} ${resolvedBody.account ? `${resolvedBody.account.address ?? ""} ${resolvedBody.account.unit ?? ""}`.trim() : resolvedBody.error?.message ?? "no-account"}`);
  const surveys = await fetch(`${origin}/api/surveys`, { headers });
  const listed = await surveys.json() as { surveys?: { id: string; questions?: { id: string }[] }[]; error?: { message?: string } };
  console.log(`owner-surveys ${surveys.status} count=${listed.surveys?.length ?? listed.error?.message ?? "unknown"}`);
  const survey = listed.surveys?.[0];
  if (!survey) {
    console.log("start-vote skipped (no published surveys)");
  } else {
  const started = await fetch(`${origin}/api/surveys/${survey.id}/votes`, {
    method: "POST", headers, body: JSON.stringify({ accountReference: "1911", idempotencyKey: crypto.randomUUID() }),
  });
  const startedBody = await started.json() as { vote?: { id: string; status: string }; error?: { message?: string } };
  console.log(`start-vote ${started.status} ${startedBody.vote?.status ?? startedBody.error?.message ?? "no-vote"}`);
  if (startedBody.vote?.id) {
    const voteId = startedBody.vote.id;
    for (const question of survey.questions ?? []) {
      const saved = await fetch(`${origin}/api/votes/${voteId}/answers`, {
        method: "PUT", headers, body: JSON.stringify({ idempotencyKey: crypto.randomUUID(), questionId: question.id, choice: "for" }),
      });
      if (!saved.ok) {
        const body = await saved.json() as { error?: { message?: string } };
        console.log(`answer ${saved.status} ${body.error?.message ?? "failed"}`);
        break;
      }
    }
    const contacts = await fetch(`${origin}/api/votes/${voteId}/contacts`, {
      method: "PUT", headers, body: JSON.stringify({ phone: "+77010000000", email: "owner@example.kz", fullName: "Иванов Иван Иванович" }),
    });
    console.log(`contacts ${contacts.status}`);
    const signature = await fetch(`${origin}/api/votes/${voteId}/visual-signature`, {
      method: "POST", headers, body: JSON.stringify({ dataUrl: png }),
    });
    console.log(`signature ${signature.status}`);
    const submitted = await fetch(`${origin}/api/votes/${voteId}/submit`, {
      method: "POST", headers, body: JSON.stringify({ idempotencyKey: crypto.randomUUID() }),
    });
    const submittedBody = await submitted.json() as { vote?: { status?: string }; document?: { id?: string }; error?: { message?: string } };
    console.log(`submit ${submitted.status} ${submittedBody.vote?.status ?? submittedBody.error?.message ?? "no-status"} doc=${Boolean(submittedBody.document?.id)}`);
    if (adminCookie) {
      const progress = await fetch(`${origin}/api/admin/surveys/${survey.id}/progress`, { headers: { cookie: adminCookie } });
      const progressBody = await progress.json() as { participation?: { completed?: number }; error?: { message?: string } };
      console.log(`admin-progress ${progress.status} completed=${progressBody.participation?.completed ?? progressBody.error?.message ?? "unknown"}`);
    }
  }
  }
}

  if (health.response.status !== 200) process.exitCode = 1;
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "local smoke failed");
  process.exit(1);
});

export {};
