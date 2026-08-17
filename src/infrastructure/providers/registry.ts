import "server-only";

import type {
  DocumentStorageProvider,
  IdentityProvider,
  NotificationProvider,
  PropertyProvider,
  SigningProvider,
} from "@/src/application/ports/providers";
import type { ProviderConfig } from "@/src/infrastructure/config/provider-config";
import type { StructuredLogger } from "@/src/infrastructure/logging/structured-logger";
import type { DatabaseClient } from "@/src/infrastructure/database/client";
import { DatabaseDocumentStorageProvider } from "@/src/infrastructure/providers/database-document-storage-provider";
import {
  MockDocumentStorageProvider,
  MockIdentityProvider,
  MockNotificationProvider,
  MockPropertyProvider,
  MockSigningProvider,
} from "@/src/infrastructure/providers/mock/mock-providers";

export interface ProviderRegistry {
  identity: IdentityProvider;
  property: PropertyProvider;
  signing: SigningProvider;
  notification: NotificationProvider;
  documentStorage: DocumentStorageProvider;
}

export class ProviderNotInstalledError extends Error {
  constructor(provider: string) {
    super(`Provider adapter is selected but not installed: ${provider}`);
    this.name = "ProviderNotInstalledError";
  }
}

export function createProviderRegistry(config: ProviderConfig, logger: StructuredLogger, database?: DatabaseClient): ProviderRegistry {
  const runtime = { timeoutMs: config.providerTimeoutMs, maxRetries: config.providerMaxRetries, logger };
  return {
    identity: config.identity === "mock" ? new MockIdentityProvider(runtime) : unavailable(config.identity),
    property: config.property === "mock" ? new MockPropertyProvider(runtime) : unavailable(config.property),
    signing: config.signing === "mock" ? new MockSigningProvider(runtime) : unavailable(config.signing),
    notification: config.notification === "mock" ? new MockNotificationProvider(runtime) : unavailable(config.notification),
    documentStorage: config.documentStorage === "mock"
      ? new MockDocumentStorageProvider(runtime)
      : config.documentStorage === "database" && database
        ? new DatabaseDocumentStorageProvider(database)
        : unavailable(config.documentStorage),
  };
}

function unavailable(provider: string): never {
  throw new ProviderNotInstalledError(provider);
}
