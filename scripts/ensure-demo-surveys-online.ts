import { DEMO_ADMIN_LOGIN, DEMO_ADMIN_PASSWORD, DEMO_CHAIRMAN_LOGIN, DEMO_CHAIRMAN_PASSWORD } from "../src/domain/demo-fixtures";

const origin = process.env.DEMO_BASE_URL ?? "https://aerc-surveys.vercel.app";

function cookieHeader(response: Response) {
  const setter = response.headers.getSetCookie?.() ?? [];
  if (setter.length) return setter.map((entry) => entry.split(";", 1)[0]).join("; ");
  const fallback = response.headers.get("set-cookie");
  return fallback ? fallback.split(";", 1)[0] : "";
}

async function json(response: Response) {
  const text = await response.text();
  try { return JSON.parse(text) as Record<string, unknown>; } catch { return { raw: text.slice(0, 400) }; }
}

async function main() {
  const chairmanLogin = await fetch(`${origin}/api/auth/login`, {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({ login: DEMO_CHAIRMAN_LOGIN, password: DEMO_CHAIRMAN_PASSWORD }),
  });
  if (!chairmanLogin.ok) throw new Error(`chairman login ${chairmanLogin.status} ${JSON.stringify(await json(chairmanLogin))}`);
  let cookie = cookieHeader(chairmanLogin);
  const surveys = await fetch(`${origin}/api/admin/surveys?page=1&pageSize=100`, { headers: { cookie, origin } });
  if (!surveys.ok) throw new Error(`chairman surveys ${surveys.status} ${JSON.stringify(await json(surveys))}`);
  const chairmanBody = await surveys.json() as { items: { protocolNumber: string; titleRu: string }[]; total: number };
  console.info("chairman-surveys", chairmanBody.total, chairmanBody.items.map((item) => item.protocolNumber).join(", ") || "(none)");
  await fetch(`${origin}/api/session`, { method: "DELETE", headers: { origin, cookie, "content-type": "application/json" } });

  const adminLogin = await fetch(`${origin}/api/auth/login`, {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({ login: DEMO_ADMIN_LOGIN, password: DEMO_ADMIN_PASSWORD }),
  });
  if (!adminLogin.ok) throw new Error(`admin login ${adminLogin.status} ${JSON.stringify(await json(adminLogin))}`);
  cookie = cookieHeader(adminLogin);
  const all = await fetch(`${origin}/api/admin/surveys?page=1&pageSize=100`, { headers: { cookie, origin } });
  if (!all.ok) throw new Error(`admin surveys ${all.status} ${JSON.stringify(await json(all))}`);
  const adminBody = await all.json() as { items: { protocolNumber: string; status: string }[]; total: number };
  console.info("admin-surveys", adminBody.total, adminBody.items.map((item) => `${item.protocolNumber}:${item.status}`).join(", ") || "(none)");
  const audit = await fetch(`${origin}/api/admin/audit?page=1&pageSize=1`, { headers: { cookie, origin } });
  const auditBody = await audit.json() as { total?: number };
  console.info("admin-audit", auditBody.total ?? audit.status);
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "demo console check failed");
  process.exit(1);
});
