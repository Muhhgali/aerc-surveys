import "server-only";

import postgres from "postgres";

export type DatabaseClient = ReturnType<typeof postgres>;

let client: DatabaseClient | undefined;

export function getDatabaseClient(): DatabaseClient {
  if (client) return client;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL must be configured for database-backed operations");
  client = postgres(url, {
    max: Number(process.env.DATABASE_POOL_MAX ?? 10),
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,
  });
  return client;
}
