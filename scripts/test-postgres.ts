import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

/**
 * Wire-protocol PostgreSQL for machines that cannot run Docker or a native server (PostgreSQL
 * refuses to start from an elevated Windows shell). Data lives in .pglite-test/ so a run can be
 * inspected afterwards; the port differs from the default so it never collides with a real server.
 */
const port = Number(process.env.TEST_PG_PORT ?? 55433);
// One directory per port so a server left running from an earlier session cannot lock this one's data.
const dataDir = resolve(`.pglite-test-${port}`);

async function main() {
  mkdirSync(dataDir, { recursive: true });
  const database = await PGlite.create({ dataDir });
  // PGlite interleaves the wire protocol when it serves clients concurrently ("bind message supplies
  // N parameters" / out-of-range offsets), so connections are queued one at a time. Run the app with
  // DATABASE_POOL_MAX=1 against this server.
  const server = new PGLiteSocketServer({ db: database, port, host: "127.0.0.1", maxConnections: 1 });
  await server.start();
  console.log(`test postgres ready on 127.0.0.1:${port}`);

  const shutdown = async () => {
    await server.stop().catch(() => undefined);
    await database.close().catch(() => undefined);
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "failed to start test postgres");
  process.exit(1);
});
