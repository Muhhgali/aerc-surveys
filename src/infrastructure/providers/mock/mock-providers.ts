import { randomUUID } from "node:crypto";
import type {
  DocumentStorageProvider,
  IdentityProvider,
  NotificationProvider,
  PropertyProvider,
  SigningProvider,
} from "@/src/application/ports/providers";
import type { RequestContext } from "@/src/domain/shared";
import type { StructuredLogger } from "@/src/infrastructure/logging/structured-logger";
import { executeProviderCall, ProviderCallError } from "@/src/infrastructure/providers/runtime";

interface MockRuntimeOptions {
  timeoutMs: number;
  maxRetries: number;
  logger: StructuredLogger;
}

function run<T>(options: MockRuntimeOptions, context: RequestContext, operation: string, idempotent: boolean, call: () => T) {
  return executeProviderCall(context, options.logger, {
    operation,
    idempotent,
    defaultTimeoutMs: options.timeoutMs,
    maxRetries: options.maxRetries,
  }, async (signal) => {
    if (signal.aborted) throw new Error("Aborted");
    return call();
  });
}

export class MockIdentityProvider implements IdentityProvider {
  readonly name = "mock" as const;
  constructor(private readonly runtime: MockRuntimeOptions) {}

  startAuthentication(_: { callbackUri: string }, context: RequestContext) {
    return run(this.runtime, context, "identity.start", false, () => ({
      challengeId: randomUUID(),
      expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
    }));
  }

  completeAuthentication(_: { challengeId: string; response: string }, context: RequestContext) {
    return run(this.runtime, context, "identity.complete", false, () => ({
      subjectId: "mock-subject-1911",
      displayName: "Демо пользователь",
      assuranceLevel: "demo" as const,
      verifiedAt: new Date().toISOString(),
      attributes: {},
    }));
  }
}

export class MockPropertyProvider implements PropertyProvider {
  readonly name = "mock" as const;
  private readonly accounts = new Map([
    ["1911", {
      account: {
        propertyId: "mock-property-geodezicheskaya-12-52",
        accountId: "1911",
        externalAccountId: "mock-account-1911",
        source: "mock",
        address: "г. Астана, ул. Геодезическая, д. 12",
        unit: "52",
        ownershipKind: "residential" as const,
      },
      authorizedSubjectIds: new Set(["00000000-0000-4000-8000-000000000001"]),
    }],
  ]);
  constructor(private readonly runtime: MockRuntimeOptions) {}

  resolveAccount(input: { subjectId: string; accountReference: string }, context: RequestContext) {
    return run(this.runtime, context, "property.resolve", true, () => {
      const fixture = this.accounts.get(input.accountReference);
      if (!fixture) throw new ProviderCallError("not_found", "Personal account was not found");
      if (!fixture.authorizedSubjectIds.has(input.subjectId)) {
        throw new ProviderCallError("unauthorized", "Identity is not verified for this personal account");
      }
      return fixture.account;
    });
  }

  checkVotingEligibility(input: { subjectId: string; propertyId: string; surveyId: string }, context: RequestContext) {
    return run(this.runtime, context, "property.eligibility", true, () => {
      const fixture = [...this.accounts.values()].find((candidate) => candidate.account.propertyId === input.propertyId);
      if (!fixture || !fixture.authorizedSubjectIds.has(input.subjectId)) {
        throw new ProviderCallError("unauthorized", "Identity is not eligible for this property");
      }
      return { eligible: true, verified: true, verificationSource: "mock", property: fixture.account };
    });
  }
}

export class MockSigningProvider implements SigningProvider {
  readonly name = "mock" as const;
  constructor(private readonly runtime: MockRuntimeOptions) {}

  startSigning(_: { subjectId: string; documentDigest: string }, context: RequestContext) {
    return run(this.runtime, context, "signing.start", false, () => ({
      signingRequestId: randomUUID(),
      expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
    }));
  }

  verifySigning(input: { signingRequestId: string }, context: RequestContext) {
    return run(this.runtime, context, "signing.verify", true, () => ({
      evidenceId: randomUUID(),
      subjectId: "mock-subject-1911",
      documentDigest: "mock-document-digest",
      signedAt: new Date().toISOString(),
      providerReference: input.signingRequestId,
    }));
  }
}

export class MockNotificationProvider implements NotificationProvider {
  readonly name = "mock" as const;
  constructor(private readonly runtime: MockRuntimeOptions) {}

  send(_: { recipientReference: string; templateId: string; variables: Readonly<Record<string, string>> }, context: RequestContext) {
    return run(this.runtime, context, "notification.send", false, () => ({ messageId: randomUUID() }));
  }
}

export class MockDocumentStorageProvider implements DocumentStorageProvider {
  readonly name = "mock" as const;
  private readonly objects = new Map<string, { contentType: string; bytes: Uint8Array; sha256: string; version: string }>();
  constructor(private readonly runtime: MockRuntimeOptions) {}

  put(input: { key: string; contentType: string; bytes: Uint8Array; sha256: string }, context: RequestContext) {
    return run(this.runtime, context, "document.put", false, () => {
      const version = randomUUID();
      this.objects.set(input.key, { ...input, bytes: input.bytes.slice(), version });
      return { storageKey: input.key, version };
    });
  }

  get(input: { storageKey: string }, context: RequestContext) {
    return run(this.runtime, context, "document.get", true, () => {
      const object = this.objects.get(input.storageKey);
      if (!object) throw new Error("Mock document not found");
      return { contentType: object.contentType, bytes: object.bytes.slice(), sha256: object.sha256 };
    });
  }
}
