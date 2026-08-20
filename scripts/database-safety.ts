import { config } from "dotenv";
import { normalizeDatabaseUrl, type DatabaseTarget } from "../src/infrastructure/database/database-url";

config({ path: [".env.local", ".env"] });

export function requireDatabaseUrl(): string {
  return requireDatabaseTarget().url;
}

export function requireDatabaseTarget(): DatabaseTarget {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  return normalizeDatabaseUrl(url);
}

const previewEnvironments = new Set(["development", "test", "staging"]);

export interface PreviewSeedTarget {
  url: string;
  host: string;
  database: string;
  environment: string;
  remote: boolean;
}

/**
 * Guards the non-production Preview bootstrap. Production is rejected outright and every other
 * environment must be named explicitly, so this can never become a production seed bypass.
 */
export function assertPreviewSeedMutation(): PreviewSeedTarget {
  const target = requireDatabaseTarget();
  const environment = process.env.APP_ENV;
  if (!environment) throw new Error("preview seed requires an explicit APP_ENV");
  if (environment === "production") throw new Error("preview seed is never allowed when APP_ENV=production");
  if (!previewEnvironments.has(environment)) throw new Error(`preview seed refuses the unknown environment: ${environment}`);
  if (process.env.ALLOW_PREVIEW_SEED !== "true") throw new Error("preview seed requires ALLOW_PREVIEW_SEED=true");
  if (!target.database) throw new Error("DATABASE_URL must name the target database");
  return { url: target.url, host: `${target.host}:${target.port}`, database: target.database, environment, remote: target.remote };
}

export function assertDevelopmentDatabaseMutation(action: "seed" | "reset"): string {
  const url = requireDatabaseUrl();
  if (process.env.APP_ENV !== "development") throw new Error(`${action} is allowed only when APP_ENV=development`);
  if (process.env.ALLOW_DEVELOPMENT_SEED !== "true") throw new Error(`${action} requires ALLOW_DEVELOPMENT_SEED=true`);
  const databaseName = decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));
  const expectedName = process.env.DEVELOPMENT_DATABASE_NAME;
  if (!expectedName || databaseName !== expectedName) {
    throw new Error(`${action} requires DEVELOPMENT_DATABASE_NAME to exactly match the configured database`);
  }
  if (action === "reset" && process.env.CONFIRM_DEVELOPMENT_RESET !== "RESET_DEVELOPMENT_DATA") {
    throw new Error("reset requires CONFIRM_DEVELOPMENT_RESET=RESET_DEVELOPMENT_DATA");
  }
  return url;
}
