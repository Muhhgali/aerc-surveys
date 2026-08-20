import { afterEach, describe, expect, it } from "vitest";
import { ConfigurationError, loadProviderConfig } from "@/src/infrastructure/config/provider-config";
import { assertPreviewSeedMutation } from "@/scripts/database-safety";
import { normalizeDatabaseUrl, runtimeDatabaseUrl, runtimePoolMax } from "@/src/infrastructure/database/database-url";

const previewEnvironment = {
  // Vercel always builds with NODE_ENV=production; APP_ENV is what selects the runtime profile.
  NODE_ENV: "production",
  APP_ENV: "staging",
  DATABASE_URL: "postgresql://preview-user@db.example.test:6543/postgres",
  IDENTITY_PROVIDER: "mock",
  PROPERTY_PROVIDER: "mock",
  SIGNING_PROVIDER: "mock",
  NOTIFICATION_PROVIDER: "mock",
  DOCUMENT_STORAGE_PROVIDER: "database",
  SESSION_STORE: "database",
  ENABLE_MOCK_AUTH: "true",
  ALLOW_MOCK_PROVIDERS_IN_PRODUCTION: "false",
} satisfies NodeJS.ProcessEnv;

const seedGuardKeys = ["APP_ENV", "DATABASE_URL", "ALLOW_PREVIEW_SEED"] as const;
const originalSeedEnv = Object.fromEntries(seedGuardKeys.map((key) => [key, process.env[key]]));

function withSeedEnv(overrides: Partial<Record<(typeof seedGuardKeys)[number], string | undefined>>) {
  for (const key of seedGuardKeys) {
    const value = overrides[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

afterEach(() => {
  for (const key of seedGuardKeys) {
    const value = originalSeedEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("Vercel Preview environment profile", () => {
  it("accepts the staging preview profile with mock providers and mock authentication", () => {
    const config = loadProviderConfig(previewEnvironment);
    expect(config).toMatchObject({
      environment: "staging", identity: "mock", property: "mock", signing: "mock",
      documentStorage: "database", sessionStore: "database", enableMockAuth: true,
    });
  });

  it("keeps production fail-closed so the development admin endpoint can never be reachable", () => {
    expect(() => loadProviderConfig({ ...previewEnvironment, APP_ENV: "production" }))
      .toThrow(ConfigurationError);
    expect(() => loadProviderConfig({
      ...previewEnvironment, APP_ENV: "production", IDENTITY_PROVIDER: "egov", PROPERTY_PROVIDER: "aerc",
      SIGNING_PROVIDER: "egov_qr", NOTIFICATION_PROVIDER: "disabled", DOCUMENT_STORAGE_PROVIDER: "object_storage",
    })).toThrow("Mock authentication endpoint is forbidden in production");
  });

  it("refuses a preview that would lose persistence", () => {
    expect(() => loadProviderConfig({ ...previewEnvironment, SESSION_STORE: "memory" }))
      .toThrow("In-memory sessions are forbidden in staging and production");
    expect(() => loadProviderConfig({ ...previewEnvironment, DOCUMENT_STORAGE_PROVIDER: "mock" }))
      .toThrow("Mock persistent storage is forbidden in staging and production");
    const withoutDatabase: NodeJS.ProcessEnv = { ...previewEnvironment };
    delete withoutDatabase.DATABASE_URL;
    expect(() => loadProviderConfig(withoutDatabase)).toThrow("DATABASE_URL must be explicitly configured in staging and production");
  });
});

describe("preview seed guard", () => {
  it("reports the target host and database without exposing credentials", () => {
    withSeedEnv({ APP_ENV: "staging", DATABASE_URL: "postgresql://user:secret@db.example.test:6543/postgres", ALLOW_PREVIEW_SEED: "true" });
    const target = assertPreviewSeedMutation();
    expect(target).toMatchObject({ environment: "staging", host: "db.example.test:6543", database: "postgres" });
    expect(JSON.stringify({ host: target.host, database: target.database })).not.toContain("secret");
  });

  it("never runs against production and refuses unknown environments", () => {
    withSeedEnv({ APP_ENV: "production", DATABASE_URL: previewEnvironment.DATABASE_URL, ALLOW_PREVIEW_SEED: "true" });
    expect(() => assertPreviewSeedMutation()).toThrow("never allowed when APP_ENV=production");

    withSeedEnv({ APP_ENV: "preview", DATABASE_URL: previewEnvironment.DATABASE_URL, ALLOW_PREVIEW_SEED: "true" });
    expect(() => assertPreviewSeedMutation()).toThrow("refuses the unknown environment: preview");
  });

  it("requires the explicit opt-in flag and an explicit environment", () => {
    withSeedEnv({ APP_ENV: "staging", DATABASE_URL: previewEnvironment.DATABASE_URL, ALLOW_PREVIEW_SEED: undefined });
    expect(() => assertPreviewSeedMutation()).toThrow("requires ALLOW_PREVIEW_SEED=true");

    withSeedEnv({ APP_ENV: undefined, DATABASE_URL: previewEnvironment.DATABASE_URL, ALLOW_PREVIEW_SEED: "true" });
    expect(() => assertPreviewSeedMutation()).toThrow("requires an explicit APP_ENV");
  });
});

describe("database URL normalisation", () => {
  it("requires SSL on remote hosts and unwraps a copied Supabase password placeholder", () => {
    const target = normalizeDatabaseUrl("postgresql://postgres.example:[demo-pass]@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres");
    expect(target).toMatchObject({
      remote: true,
      sslmode: "require",
      port: "5432",
      database: "postgres",
    });
    expect(target.host).toContain("pooler.supabase.com");
    expect(target.url).toContain("sslmode=require");
    expect(target.url).not.toContain("[");
    expect(target.url).not.toContain("]");
  });

  it("rejects a copied documentation placeholder instead of a real connection string", () => {
    expect(() => normalizeDatabaseUrl("postgresql://postgres.example:<demo-pass>@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres?sslmode=require"))
      .toThrow("documentation placeholder");
  });

  it("leaves loopback connections without SSL", () => {
    const target = normalizeDatabaseUrl("postgresql://postgres@127.0.0.1:55432/aerc_surveys_test");
    expect(target).toMatchObject({ remote: false, sslmode: "disable", port: "55432", database: "aerc_surveys_test" });
  });

  it("moves serverless runtime onto the Supabase transaction pooler", () => {
    const target = runtimeDatabaseUrl("postgresql://postgres.example:secret@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres?sslmode=require");
    expect(target.port).toBe("6543");
    expect(runtimePoolMax(true, "5")).toBe(5);
    expect(runtimePoolMax(true, "20")).toBe(5);
    expect(runtimePoolMax(false, "10")).toBe(10);
    // Explicit empty value, not the ambient DATABASE_POOL_MAX the developer's shell may export.
    expect(runtimePoolMax(true, "")).toBe(5);
    expect(runtimePoolMax(false, "")).toBe(10);
  });
});
