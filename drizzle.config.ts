import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";
import { normalizeDatabaseUrl } from "./src/infrastructure/database/database-url";

config({ path: [".env.local", ".env"] });
const databaseUrl = process.env.DATABASE_URL ? normalizeDatabaseUrl(process.env.DATABASE_URL).url : undefined;

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/infrastructure/database/schema.ts",
  out: "./drizzle",
  ...(databaseUrl ? { dbCredentials: { url: databaseUrl } } : {}),
  strict: true,
  verbose: true,
});
