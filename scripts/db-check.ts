import postgres from "postgres";
import { requireDatabaseTarget } from "./database-safety";
import { postgresClientOptions } from "../src/infrastructure/database/database-url";

function redact(text: string): string {
  return text.replace(/postgresql:\/\/[^@\s]+@/gi, "postgresql://***@");
}

async function main() {
  const target = requireDatabaseTarget();
  console.info(JSON.stringify({
    host: target.host,
    port: target.port,
    database: target.database,
    sslmode: target.sslmode,
    remote: target.remote,
  }));
  const sql = postgres(target.url, postgresClientOptions(target));
  try {
    await sql`select 1 as healthy`;
    console.info("Database connectivity: healthy");
  } catch (error) {
    const err = error as { message?: string; code?: string };
    console.error("Database connectivity: unhealthy");
    console.error(JSON.stringify({ code: err.code ?? "unknown", message: redact(err.message ?? "connection failed") }));
    if (err.code === "28P01") {
      console.error("Supabase rejected the database password (the pooler always reports user \"postgres\" even when the URI user is postgres.<project-ref>). Reset it in Dashboard → Project Settings → Database → Database password, then put the new password in DATABASE_URL with no brackets.");
    }
    process.exitCode = 1;
  } finally {
    await sql.end();
  }
}

void main();
