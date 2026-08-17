import type { IdentityChallenge, IdentityMethod, VerifiedIdentity } from "@/src/domain/identity";
import type { PropertyAccount, VotingEligibility } from "@/src/domain/property";
import type { RequestContext, Result } from "@/src/domain/shared";

export type ProviderErrorCode =
  | "invalid_request"
  | "unauthorized"
  | "not_found"
  | "conflict"
  | "timeout"
  | "unavailable"
  | "not_configured"
  | "unexpected";

export interface ProviderError {
  code: ProviderErrorCode;
  message: string;
  requestId: string;
  retryable: boolean;
  cause?: unknown;
}

export type ProviderResult<T> = Result<T, ProviderError>;

export interface IdentityProvider {
  readonly name: IdentityMethod;
  startAuthentication(input: { callbackUri: string }, context: RequestContext): Promise<ProviderResult<IdentityChallenge>>;
  completeAuthentication(input: { challengeId: string; response: string }, context: RequestContext): Promise<ProviderResult<VerifiedIdentity>>;
}

export interface PropertyProvider {
  readonly name: "mock" | "aerc";
  resolveAccount(input: { subjectId: string; accountReference: string }, context: RequestContext): Promise<ProviderResult<PropertyAccount>>;
  checkVotingEligibility(input: { subjectId: string; propertyId: string; surveyId: string }, context: RequestContext): Promise<ProviderResult<VotingEligibility>>;
}

export interface SigningRequest {
  signingRequestId: string;
  expiresAt: string;
  verificationUri?: string;
}

export type SigningLifecycleStatus = "pending" | "ready" | "verified" | "finalized" | "cancelled" | "expired" | "failed";

export interface SigningEvidence {
  evidenceId: string;
  subjectId: string;
  documentDigest: string;
  signedAt: string;
  providerReference: string;
}

export interface SigningProvider {
  readonly name: "mock" | "egov_qr" | "digital_id";
  createSigningRequest(input: { subjectId: string; documentDigest: string }, context: RequestContext): Promise<ProviderResult<SigningRequest>>;
  getSigningStatus(input: { signingRequestId: string }, context: RequestContext): Promise<ProviderResult<{ status: SigningLifecycleStatus }>>;
  verifySignature(input: { signingRequestId: string; expectedDocumentDigest: string }, context: RequestContext): Promise<ProviderResult<SigningEvidence>>;
  cancelSigningRequest(input: { signingRequestId: string }, context: RequestContext): Promise<ProviderResult<{ cancelled: boolean }>>;
  finalizeSignedDocument(input: { signingRequestId: string; documentDigest: string; finalDocumentSha256: string }, context: RequestContext): Promise<ProviderResult<{ evidenceId: string; finalizedAt: string; finalDocumentSha256: string }>>;
}

export interface NotificationProvider {
  readonly name: "mock" | "disabled";
  send(input: { recipientReference: string; templateId: string; variables: Readonly<Record<string, string>> }, context: RequestContext): Promise<ProviderResult<{ messageId: string }>>;
}

export interface DocumentStorageProvider {
  readonly name: "mock" | "database" | "object_storage";
  put(input: { key: string; contentType: string; bytes: Uint8Array; sha256: string }, context: RequestContext): Promise<ProviderResult<{ storageKey: string; version: string }>>;
  get(input: { storageKey: string }, context: RequestContext): Promise<ProviderResult<{ contentType: string; bytes: Uint8Array; sha256: string }>>;
}
