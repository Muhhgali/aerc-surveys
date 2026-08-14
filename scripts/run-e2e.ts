import { spawn, type ChildProcess } from "node:child_process";
import { resolve } from "node:path";

const baseUrl = "http://127.0.0.1:3100";

async function isReady() {
  try {
    const response = await fetch(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(2_000) });
    return response.ok;
  } catch {
    return false;
  }
}

function waitForExit(child: ChildProcess) {
  return new Promise<number>((resolveExit, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => resolveExit(code ?? 1));
  });
}

async function stopProcessTree(server: ChildProcess) {
  if (!server.pid || server.exitCode !== null) return;
  if (process.platform === "win32") {
    const killer = spawn("taskkill", ["/pid", String(server.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
    await Promise.race([waitForExit(killer), new Promise((resolveTimeout) => setTimeout(resolveTimeout, 10_000))]);
    return;
  }
  server.kill("SIGTERM");
  await Promise.race([waitForExit(server), new Promise((resolveTimeout) => setTimeout(resolveTimeout, 10_000))]);
  if (server.exitCode === null) server.kill("SIGKILL");
}

async function main() {
  if (await isReady()) throw new Error(`Port 3100 is already serving an application; refusing to reuse an unowned E2E server`);

  const nextCli = resolve("node_modules/next/dist/bin/next");
  const playwrightCli = resolve("node_modules/@playwright/test/cli.js");
  const server = spawn(process.execPath, [nextCli, "start", "--hostname", "127.0.0.1", "--port", "3100"], {
    env: process.env,
    stdio: "inherit",
    windowsHide: true,
  });

  try {
    const deadline = Date.now() + 120_000;
    while (!(await isReady())) {
      if (server.exitCode !== null) throw new Error(`E2E server exited before readiness with code ${server.exitCode}`);
      if (Date.now() >= deadline) throw new Error("E2E server did not become ready within 120 seconds");
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
    }

    const tests = spawn(process.execPath, [playwrightCli, "test"], { env: process.env, stdio: "inherit", windowsHide: true });
    process.exitCode = await waitForExit(tests);
  } finally {
    await stopProcessTree(server);
  }
}

void main().then(
  () => process.exit(process.exitCode ?? 0),
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : "E2E runner failed");
    process.exit(1);
  },
);
