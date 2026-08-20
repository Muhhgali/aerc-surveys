import postgres from "postgres";
import { requireDatabaseTarget } from "./database-safety";
import { postgresClientOptions } from "../src/infrastructure/database/database-url";

const expectedTables = [
  "users", "external_identities", "auth_sessions", "organizations", "properties", "personal_accounts",
  "surveys", "survey_questions", "survey_participants", "vote_sessions", "vote_answers", "votes", "audit_logs",
] as const;

async function main() {
  const target = requireDatabaseTarget();
  const sql = postgres(target.url, postgresClientOptions(target));
  try {
    const tables = await sql<{ table_name: string }[]>`
      select table_name from information_schema.tables where table_schema = 'public' and table_name = any(${expectedTables as unknown as string[]})
    `;
    const present = new Set(tables.map((table) => table.table_name));
    const missing = expectedTables.filter((table) => !present.has(table));
    if (missing.length) throw new Error(`Missing required tables: ${missing.join(", ")}`);
    const [{ count: users }] = await sql<{ count: number }[]>`select count(*)::int as count from users`;
    const [{ count: surveys }] = await sql<{ count: number }[]>`select count(*)::int as count from surveys`;
    console.info(JSON.stringify({ database: "healthy", tables: expectedTables.length, users, surveys }));
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Persistent database smoke failed");
    process.exitCode = 1;
  } finally {
    await sql.end();
  }
}

void main();
