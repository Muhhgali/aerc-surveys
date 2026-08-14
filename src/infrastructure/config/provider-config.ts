import "server-only";

export type ProviderConfig = Readonly<{
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
  const production = env.NODE_ENV === "production";
  const config = {
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
  } satisfies ProviderConfig;

  if (production && env.ALLOW_MOCK_PROVIDERS_IN_PRODUCTION !== "true") {
    const unsafe = [config.identity, config.property, config.signing, config.notification, config.documentStorage].includes("mock");
    if (unsafe) throw new ConfigurationError("Mock providers are forbidden in production");
  }
  if (production && config.sessionStore === "memory") {
    throw new ConfigurationError("In-memory sessions are forbidden in production");
  }
  return config;
}
