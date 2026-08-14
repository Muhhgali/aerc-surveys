import "server-only";

export type ProviderConfig = Readonly<{
  environment: "development" | "test" | "staging" | "production";
  identity: "mock" | "egov" | "digital_id";
  property: "mock" | "aerc";
  signing: "mock" | "egov_qr" | "digital_id";
  notification: "mock" | "disabled";
  documentStorage: "mock" | "object_storage";
  sessionStore: "memory" | "database";
  providerTimeoutMs: number;
  providerMaxRetries: number;
  sessionCookieName: string;
  sessionTtlSeconds: number;
  enableMockAuth: boolean;
}>;

export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigurationError";
  }
}

const allowed = {
  IDENTITY_PROVIDER: ["mock", "egov", "digital_id"],
  PROPERTY_PROVIDER: ["mock", "aerc"],
  SIGNING_PROVIDER: ["mock", "egov_qr", "digital_id"],
  NOTIFICATION_PROVIDER: ["mock", "disabled"],
  DOCUMENT_STORAGE_PROVIDER: ["mock", "object_storage"],
  SESSION_STORE: ["memory", "database"],
} as const;

function selection<K extends keyof typeof allowed>(env: NodeJS.ProcessEnv, key: K, production: boolean): (typeof allowed)[K][number] {
  const raw = env[key];
  if (!raw && production) throw new ConfigurationError(`${key} must be explicitly configured in production`);
  const value = raw ?? allowed[key][0];
  if (!(allowed[key] as readonly string[]).includes(value)) {
    throw new ConfigurationError(`${key} has unsupported value: ${value}`);
  }
  return value as (typeof allowed)[K][number];
}

function positiveInteger(env: NodeJS.ProcessEnv, key: string, fallback: number): number {
  const value = Number(env[key] ?? fallback);
  if (!Number.isSafeInteger(value) || value < 0) throw new ConfigurationError(`${key} must be a non-negative integer`);
  return value;
}

export function loadProviderConfig(env: NodeJS.ProcessEnv = process.env): ProviderConfig {
  const inferredEnvironment = env.NODE_ENV === "test" ? "test" : env.NODE_ENV === "production" ? "production" : "development";
  const environment = env.APP_ENV ?? inferredEnvironment;
  if (!(["development", "test", "staging", "production"] as const).includes(environment as "development")) {
    throw new ConfigurationError(`APP_ENV has unsupported value: ${environment}`);
  }
  const production = environment === "production";
  const persistentEnvironment = environment === "staging" || production;
  const config = {
    environment: environment as ProviderConfig["environment"],
    identity: selection(env, "IDENTITY_PROVIDER", production),
    property: selection(env, "PROPERTY_PROVIDER", production),
    signing: selection(env, "SIGNING_PROVIDER", production),
    notification: selection(env, "NOTIFICATION_PROVIDER", production),
    documentStorage: selection(env, "DOCUMENT_STORAGE_PROVIDER", production),
    sessionStore: selection(env, "SESSION_STORE", production),
    providerTimeoutMs: positiveInteger(env, "PROVIDER_TIMEOUT_MS", 5_000),
    providerMaxRetries: positiveInteger(env, "PROVIDER_MAX_RETRIES", 2),
    sessionCookieName: env.SESSION_COOKIE_NAME ?? "aerc_session",
    sessionTtlSeconds: positiveInteger(env, "SESSION_TTL_SECONDS", 1_800),
    enableMockAuth: env.ENABLE_MOCK_AUTH === "true",
  } satisfies ProviderConfig;

  if (production && env.ALLOW_MOCK_PROVIDERS_IN_PRODUCTION !== "true") {
    const unsafe = [config.identity, config.property, config.signing, config.notification, config.documentStorage].includes("mock");
    if (unsafe) throw new ConfigurationError("Mock providers are forbidden in production");
  }
  if (persistentEnvironment && config.sessionStore === "memory") {
    throw new ConfigurationError("In-memory sessions are forbidden in staging and production");
  }
  if (persistentEnvironment && config.documentStorage === "mock") {
    throw new ConfigurationError("Mock persistent storage is forbidden in staging and production");
  }
  if (persistentEnvironment && !env.DATABASE_URL) {
    throw new ConfigurationError("DATABASE_URL must be explicitly configured in staging and production");
  }
  if (production && config.enableMockAuth) {
    throw new ConfigurationError("Mock authentication endpoint is forbidden in production");
  }
  return config;
}
