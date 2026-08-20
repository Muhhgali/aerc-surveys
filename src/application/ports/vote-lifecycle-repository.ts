import type { CanonicalVote } from "@/src/domain/canonical-vote";
import type { VoteState } from "@/src/domain/vote-lifecycle";
import type { VoteChoice } from "@/src/domain/voting";

export interface CanonicalVoteSource {
  vote: { id: string; surveyId: string; userId: string; propertyId: string; status: VoteState; stateVersion: number };
  surveyVersion: number;
  protocolNumber: string;
  participantReference: string;
  propertyReference: string;
  accountReference: string;
  address: string;
  unit: string;
  participantDisplayName: string;
  questions: readonly { id: string; position: number; textRu: string; textKk: string | null; required: boolean; choice: VoteChoice | null }[];
}

export interface VisualSignatureRecord { id: string; voteId: string; storageKey: string; sha256: string; createdAt: string; }
export interface FinalDocumentRecord { documentId: string; publicId: string; version: number; voteId: string; storageKey: string; sha256: string; canonicalSha256: string; signingProvider: string; signingStatus: string; createdAt: string; }
export interface PublicDocumentVerification { publicId: string; protocolNumber: string; createdAt: string; documentStatus: string; signingStatus: string; sha256: string; integrityValid: boolean; }

export interface VoteLifecycleRepository {
  loadCanonicalSource(voteId: string, userId: string): Promise<CanonicalVoteSource | null>;
  freezeCanonical(input: { voteId: string; userId: string; canonical: CanonicalVote; canonicalSha256: string; requestId: string }): Promise<void>;
  transition(input: { voteId: string; userId: string; from: VoteState; to: VoteState; requestId: string; signingProvider?: string; signedSha256?: string }): Promise<void>;
  createOrGetSignatureRequest(input: { voteId: string; provider: string; providerRequestId: string; documentDigest: string; expiresAt: string }): Promise<{ id: string; providerRequestId: string }>;
  markSignatureVerified(input: { requestId: string; evidenceReference: string; evidence: Readonly<Record<string, unknown>> }): Promise<void>;
  saveVisualSignature(input: { voteId: string; userId: string; storageKey: string; sha256: string; metadata: Readonly<Record<string, unknown>> }): Promise<VisualSignatureRecord>;
  getVisualSignature(voteId: string): Promise<VisualSignatureRecord | null>;
  findFinalDocument(voteId: string): Promise<FinalDocumentRecord | null>;
  getOwnedDocumentAsset(publicId: string, userId: string): Promise<{ storageKey: string; sha256: string } | null>;
  allocateSheetNumber(voteId: string, userId: string): Promise<number>;
  getVoteContacts(voteId: string): Promise<{ phone: string | null; email: string | null; fullName: string | null } | null>;
  completeDocument(input: { publicId: string; voteId: string; userId: string; authSessionId: string; submitIdempotencyKey: string; surveyId: string; surveyVersion: number; storageKey: string; sha256: string; canonicalSha256: string; signingProvider: string; verificationReference: string; sizeBytes: number; signatureRequestId: string; requestId: string }): Promise<FinalDocumentRecord>;
  getPublicVerification(publicId: string): Promise<PublicDocumentVerification | null>;
  listSurveySignatories(surveyId: string): Promise<{ roleKey: string; displayName: string }[]>;
}
