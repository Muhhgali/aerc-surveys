import postgres from "postgres";
import { requireDatabaseUrl } from "./database-safety";

async function main() {
  const sql = postgres(requireDatabaseUrl(), { max: 1, prepare: false, connect_timeout: 10 });
  try {
    await sql`select 1 as healthy`;
    console.info("Database connectivity: healthy");
  } catch {
    console.error("Database connectivity: unhealthy");
    process.exitCode = 1;
  } finally {
    await sql.end();
  }
}

void main();
