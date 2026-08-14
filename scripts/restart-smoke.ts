import { spawn, type ChildProcess } from "node:child_process";
import { resolve } from "node:path";
import { config } from "dotenv";
import { resetE2eState } from "../e2e/support";

config({ path: [".env.local", ".env"] });

const baseUrl = "http://127.0.0.1:3101";
const surveyId = "00000000-0000-4000-8000-000000000012";
const questionIds = [1, 2, 3].map((number) => `00000000-0000-4000-8000-${String(number).padStart(12, "0")}`);

async function isReady() {
  try {
    return (await fetch(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(2_000) })).ok;
  } catch {
    return false;
  }
}

function waitForExit(child: ChildProcess) {
  return new Promise<void>((resolveExit) => child.once("exit", () => resolveExit()));
}

async function startServer() {
  if (await isReady()) throw new Error("Port 3101 is already serving an application; refusing to reuse it");
  const server = spawn(process.execPath, [resolve("node_modules/next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", "3101"], {
    env: process.env, stdio: "inherit", windowsHide: true,
  });
  const deadline = Date.now() + 120_000;
  while (!(await isReady())) {
    if (server.exitCode !== null) throw new Error(`Restart smoke server exited with code ${server.exitCode}`);
    if (Date.now() >= deadline) throw new Error("Restart smoke server did not become ready");
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
  }
  return server;
}

async function stopServer(server: ChildProcess) {
  if (!server.pid || server.exitCode !== null) return;
  if (process.platform === "win32") {
    server.kill();
    await Promise.race([waitForExit(server), new Promise((resolveTimeout) => setTimeout(resolveTimeout, 5_000))]);
    if (server.exitCode === null) {
      const killer = spawn("taskkill", ["/pid", String(server.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
      await Promise.race([waitForExit(killer), new Promise((resolveTimeout) => setTimeout(resolveTimeout, 5_000))]);
    }
  } else {
    server.kill("SIGTERM");
    await Promise.race([waitForExit(server), new Promise((resolveTimeout) => setTimeout(resolveTimeout, 10_000))]);
    if (server.exitCode === null) server.kill("SIGKILL");
  }
  const deadline = Date.now() + 10_000;
  while (await isReady()) {
    if (Date.now() >= deadline) throw new Error("Restart smoke server did not stop within 10 seconds");
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }
}

async function jsonRequest(path: string, init: RequestInit, cookie?: string) {
  const headers = new Headers(init.headers);
  if (init.method && init.method !== "GET") headers.set("origin", baseUrl);
  if (cookie) headers.set("cookie", cookie);
  if (init.body) headers.set("content-type", "application/json");
  return fetch(`${baseUrl}${path}`, { ...init, headers });
}

async function main() {
  await resetE2eState();
  const server = await startServer();
  let replacement: ChildProcess | undefined;
  try {
    const login = await jsonRequest("/api/dev/session", { method: "POST" });
    if (!login.ok) throw new Error(`Mock login failed: ${login.status}`);
    const rawSetCookie = login.headers.get("set-cookie");
    const cookie = rawSetCookie?.match(/^(aerc_session=[^;]+)/)?.[1];
    if (!cookie) throw new Error("Session cookie was not returned");

    const started = await jsonRequest(`/api/surveys/${surveyId}/votes`, {
      method: "POST", body: JSON.stringify({ accountReference: "1911", idempotencyKey: crypto.randomUUID() }),
    }, cookie);
    if (started.status !== 201) throw new Error(`Vote start failed: ${started.status}`);
    const voteId = ((await started.json()) as { vote: { id: string } }).vote.id;

    for (const [index, questionId] of questionIds.entries()) {
      const saved = await jsonRequest(`/api/votes/${voteId}/answers`, {
        method: "PUT", body: JSON.stringify({ questionId, choice: index === 1 ? "against" : "for", idempotencyKey: crypto.randomUUID() }),
      }, cookie);
      if (!saved.ok) throw new Error(`Autosave ${index + 1} failed: ${saved.status}`);
    }

    await stopServer(server);
    replacement = await startServer();

    const session = await jsonRequest("/api/session", { method: "GET" }, cookie);
    if (!session.ok) throw new Error(`Session did not survive restart: ${session.status}`);
    const restored = await jsonRequest(`/api/surveys/${surveyId}/votes`, { method: "GET" }, cookie);
    if (!restored.ok) throw new Error(`Vote did not survive restart: ${restored.status}`);
    const vote = (await restored.json()) as { vote: { id: string; answers: unknown[] } };
    if (vote.vote.id !== voteId || vote.vote.answers.length !== 3) throw new Error("Restored vote differs from persistent state");
    console.log(JSON.stringify({ restart: "passed", session: "restored", voteId, answers: 3 }));
  } finally {
    await stopServer(replacement ?? server);
  }
}

void main().then(
  () => process.exit(0),
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : "Restart smoke failed");
    process.exit(1);
  },
);
