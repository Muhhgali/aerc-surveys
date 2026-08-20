import "server-only";

import postgres from "postgres";
import { postgresClientOptions, runtimeDatabaseUrl, runtimePoolMax } from "@/src/infrastructure/database/database-url";

export type DatabaseClient = ReturnType<typeof postgres>;

let client: DatabaseClient | undefined;

export function getDatabaseClient(): DatabaseClient {
  if (client) return client;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL must be configured for database-backed operations");
  const target = runtimeDatabaseUrl(url);
  client = postgres(target.url, {
    ...postgresClientOptions(target, { max: runtimePoolMax(target.remote), connect_timeout: target.remote ? 8 : 5 }),
    idle_timeout: 20,
    max_lifetime: 60 * 5,
    connection: {
      statement_timeout: 8000,
    },
  });
  return client;
}
