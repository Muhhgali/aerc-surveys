import { readFileSync, writeFileSync } from "node:fs";
import postgres from "postgres";

/**
 * Prepares a remote PostgreSQL for the E2E harness, which refuses to run against anything but a
 * database named `aerc_surveys_test`. Reads an admin connection string from .env.e2e.local, creates
 * that database when missing, and writes the derived test URL back to the same file.
 * Nothing is printed except host/database names — never credentials.
 */
const file = process.argv[2] ?? ".env.e2e.local";
const testDatabaseName = "aerc_surveys_test";

function readVariable(contents: string, key: string) {
  const line = contents.split(/\r?\n/).find((entry) => entry.trim().startsWith(`${key}=`));
  return line?.slice(line.indexOf("=") + 1).replace(/^["']|["']$/g, "").trim();
}

async function main() {
  const contents = readFileSync(file, "utf8");
  const adminUrl = readVariable(contents, "E2E_ADMIN_DATABASE_URL") ?? readVariable(contents, "DATABASE_URL");
  if (!adminUrl) throw new Error(`${file} must define E2E_ADMIN_DATABASE_URL or DATABASE_URL`);

  const admin = new URL(adminUrl);
  console.log(`admin target: ${admin.hostname}:${admin.port || "5432"}${admin.pathname}`);

  const sql = postgres(adminUrl, { max: 1, prepare: false, connect_timeout: 20 });
  try {
    const existing = await sql<{ count: number }[]>`select count(*)::int as count from pg_database where datname = ${testDatabaseName}`;
    if (existing[0].count === 0) {
      await sql.unsafe(`create database "${testDatabaseName}"`);
      console.log(`created database ${testDatabaseName}`);
    } else {
      console.log(`database ${testDatabaseName} already exists`);
    }
  } finally {
    await sql.end({ timeout: 5 });
  }

  const target = new URL(adminUrl);
  target.pathname = `/${testDatabaseName}`;
  const withoutTestUrl = contents.split(/\r?\n/).filter((line) => !line.trim().startsWith("E2E_DATABASE_URL="));
  writeFileSync(file, `${[...withoutTestUrl, `E2E_DATABASE_URL=${target.toString()}`].join("\n").replace(/\n{3,}/g, "\n\n")}\n`, "utf8");
  console.log(`E2E_DATABASE_URL written to ${file} (database ${testDatabaseName})`);
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "failed to bootstrap the test database");
  process.exit(1);
});
