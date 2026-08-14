import { config } from "dotenv";

config({ path: [".env.local", ".env"] });

export function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  return url;
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
