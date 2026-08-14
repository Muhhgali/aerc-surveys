import "server-only";

import { SessionService } from "@/src/application/session/session-service";
import { loadProviderConfig } from "@/src/infrastructure/config/provider-config";
import { consoleLogger } from "@/src/infrastructure/logging/structured-logger";
import { createProviderRegistry } from "@/src/infrastructure/providers/registry";
import { InMemorySessionStore } from "@/src/infrastructure/session/in-memory-session-store";

/** Server composition root. Real database/provider adapters are intentionally not implemented yet. */
export function createApplication() {
  const config = loadProviderConfig();
  const providers = createProviderRegistry(config, consoleLogger);
  if (config.sessionStore !== "memory") {
    throw new Error("Database session adapter is selected but not installed");
  }
  const sessions = new SessionService(new InMemorySessionStore(), config.sessionTtlSeconds);
  return { config, providers, sessions };
}
