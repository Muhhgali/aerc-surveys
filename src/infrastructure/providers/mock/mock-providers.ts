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

  completeAuthentication(input: { challengeId: string; response: string }, context: RequestContext) {
    return run(this.runtime, context, "identity.complete", false, () => ({
      subjectId: input.response === "approved-admin" ? "mock-admin" : "mock-subject-1911",
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

  createSigningRequest(input: { subjectId: string; documentDigest: string }, context: RequestContext) {
    return run(this.runtime, context, "signing.create", false, () => {
      const expiresAt = new Date(Date.now() + 5 * 60_000).toISOString();
      const signingRequestId = Buffer.from(JSON.stringify({ subjectId: input.subjectId, digest: input.documentDigest, expiresAt }), "utf8").toString("base64url");
      if (!mockSigningRequests.has(signingRequestId)) mockSigningRequests.set(signingRequestId, { subjectId: input.subjectId, digest: input.documentDigest, expiresAt, status: "pending" });
      return { signingRequestId, expiresAt };
    });
  }

  getSigningStatus(input: { signingRequestId: string }, context: RequestContext) {
    return run(this.runtime, context, "signing.status", true, () => {
      const request = mockSigningState(input.signingRequestId);
      if (new Date(request.expiresAt) <= new Date()) return { status: "expired" as const };
      if (request.status === "pending") request.status = "ready";
      return { status: request.status };
    });
  }

  verifySignature(input: { signingRequestId: string; expectedDocumentDigest: string }, context: RequestContext) {
    return run(this.runtime, context, "signing.verify", true, () => {
      const request = mockSigningState(input.signingRequestId);
      if (request.digest !== input.expectedDocumentDigest) throw new ProviderCallError("conflict", "Document digest does not match signing request");
      if (["cancelled", "finalized"].includes(request.status) || new Date(request.expiresAt) <= new Date()) throw new ProviderCallError("conflict", "Signing request cannot be verified");
      request.status = "verified"; request.evidenceId ??= randomUUID(); request.signedAt ??= new Date().toISOString();
      return { evidenceId: request.evidenceId, subjectId: request.subjectId, documentDigest: request.digest, signedAt: request.signedAt, providerReference: input.signingRequestId };
    });
  }

  cancelSigningRequest(input: { signingRequestId: string }, context: RequestContext) {
    return run(this.runtime, context, "signing.cancel", false, () => {
      const request = mockSigningState(input.signingRequestId);
      if (request.status === "finalized") throw new ProviderCallError("conflict", "Finalized signing request cannot be cancelled");
      request.status = "cancelled";
      return { cancelled: true };
    });
  }

  finalizeSignedDocument(input: { signingRequestId: string; documentDigest: string; finalDocumentSha256: string }, context: RequestContext) {
    return run(this.runtime, context, "signing.finalize", false, () => {
      const request = mockSigningState(input.signingRequestId);
      if (request.digest !== input.documentDigest) throw new ProviderCallError("conflict", "Final document does not match the signing request");
      if (request.status === "finalized" && request.finalDocumentSha256 === input.finalDocumentSha256) return { evidenceId: request.evidenceId!, finalizedAt: request.finalizedAt!, finalDocumentSha256: input.finalDocumentSha256 };
      if (request.status !== "verified") throw new ProviderCallError("conflict", "Verified signature is required before finalization");
      request.status = "finalized"; request.evidenceId ??= randomUUID(); request.finalizedAt = new Date().toISOString(); request.finalDocumentSha256 = input.finalDocumentSha256;
      return { evidenceId: request.evidenceId, finalizedAt: request.finalizedAt, finalDocumentSha256: input.finalDocumentSha256 };
    });
  }
}

type MockSigningState = { subjectId: string; digest: string; expiresAt: string; status: "pending" | "ready" | "verified" | "finalized" | "cancelled"; evidenceId?: string; signedAt?: string; finalDocumentSha256?: string; finalizedAt?: string };
const mockSigningRequests = new Map<string, MockSigningState>();

function decodeMockSigningRequest(value: string): { subjectId: string; digest: string; expiresAt: string } {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Record<string, unknown>;
    if (typeof parsed.subjectId !== "string" || typeof parsed.digest !== "string" || typeof parsed.expiresAt !== "string") throw new Error("invalid");
    return parsed as { subjectId: string; digest: string; expiresAt: string };
  } catch {
    throw new ProviderCallError("not_found", "Signing request was not found");
  }
}

function mockSigningState(value: string): MockSigningState {
  const existing = mockSigningRequests.get(value); if (existing) return existing;
  const decoded = decodeMockSigningRequest(value); const restored: MockSigningState = { ...decoded, status: "pending" };
  mockSigningRequests.set(value, restored); return restored;
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
