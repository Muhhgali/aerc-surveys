import { createHash } from "node:crypto";
import { ApplicationError } from "@/src/application/errors";
import type { PdfRenderer } from "@/src/application/ports/pdf-renderer";
import type { DocumentStorageProvider, SigningProvider } from "@/src/application/ports/providers";
import type { FinalDocumentRecord, VoteLifecycleRepository } from "@/src/application/ports/vote-lifecycle-repository";
import type { RequestContext } from "@/src/domain/shared";
import type { VoteLifecycleService } from "@/src/application/voting/vote-lifecycle-service";

export class DocumentLifecycleService {
  constructor(private readonly lifecycle: VoteLifecycleService, private readonly votes: VoteLifecycleRepository, private readonly signing: SigningProvider, private readonly storage: DocumentStorageProvider, private readonly pdf: PdfRenderer) {}

  getOwnedDocumentAsset(publicId: string, userId: string) { return this.votes.getOwnedDocumentAsset(publicId, userId); }

  async signGenerateAndSubmit(input: { voteId: string; userId: string; authSessionId: string; idempotencyKey: string; verificationBaseUrl: string }, context: RequestContext): Promise<FinalDocumentRecord> {
    if (!await this.votes.loadCanonicalSource(input.voteId, input.userId)) throw new ApplicationError("not_found", "Vote was not found");
    const existing = await this.votes.findFinalDocument(input.voteId);
    if (existing) return existing;
    const prepared = await this.lifecycle.prepareCanonical(input.voteId, input.userId, context.requestId);
    await this.votes.transition({ voteId: input.voteId, userId: input.userId, from: "ready_to_sign", to: "signing", signingProvider: this.signing.name, requestId: context.requestId });
    const created = await this.signing.createSigningRequest({ subjectId: input.userId, documentDigest: prepared.sha256 }, context);
    if (!created.ok) throw new ApplicationError("signing_failed", "Signing request could not be created");
    const request = await this.votes.createOrGetSignatureRequest({ voteId: input.voteId, provider: this.signing.name, providerRequestId: created.value.signingRequestId, documentDigest: prepared.sha256, expiresAt: created.value.expiresAt });
    const status = await this.signing.getSigningStatus({ signingRequestId: request.providerRequestId }, context);
    if (!status.ok || !["ready", "verified"].includes(status.value.status)) throw new ApplicationError("signing_failed", "Signing request is not ready");
    const verified = await this.signing.verifySignature({ signingRequestId: request.providerRequestId, expectedDocumentDigest: prepared.sha256 }, context);
    if (!verified.ok || verified.value.documentDigest !== prepared.sha256 || verified.value.subjectId !== input.userId) throw new ApplicationError("signing_failed", "Signature evidence does not match the canonical vote");
    await this.votes.markSignatureVerified({ requestId: request.id, evidenceReference: verified.value.evidenceId, evidence: { providerReference: verified.value.providerReference, signedAt: verified.value.signedAt, documentDigest: verified.value.documentDigest } });
    await this.votes.transition({ voteId: input.voteId, userId: input.userId, from: "signing", to: "signed", signedSha256: prepared.sha256, requestId: context.requestId });

    const visual = await this.votes.getVisualSignature(input.voteId);
    const visualAsset = visual ? await this.storage.get({ storageKey: visual.storageKey }, context) : null;
    const publicId = uuidFromHash(createHash("sha256").update(`${input.voteId}:${prepared.sha256}:1`).digest("hex"));
    const verificationUrl = `${input.verificationBaseUrl.replace(/\/$/, "")}/verify/${publicId}`;
    const pdfBytes = await this.pdf.renderVotingSheet({
      protocolNumber: prepared.source.protocolNumber, address: prepared.source.address, accountReference: prepared.source.accountReference,
      unit: prepared.source.unit, participantDisplayName: prepared.source.participantDisplayName, createdAt: prepared.canonical.frozenAt,
      documentId: publicId, documentVersion: 1, surveyVersion: prepared.source.surveyVersion, signingProvider: this.signing.name,
      signingStatus: "verified", documentHashReference: prepared.sha256, verificationUrl,
      questions: prepared.canonical.survey.questions.map((question) => ({ position: question.position, text: question.textRu, answer: question.answer })),
      visualSignature: visualAsset?.ok ? visualAsset.value.bytes : undefined,
    });
    const pdfSha256 = createHash("sha256").update(pdfBytes).digest("hex");
    const storageKey = `documents/${publicId}/v1.pdf`;
    const stored = await this.storage.put({ key: storageKey, contentType: "application/pdf", bytes: pdfBytes, sha256: pdfSha256 }, context);
    if (!stored.ok) throw new ApplicationError("document_failed", "Final PDF could not be stored");
    const finalized = await this.signing.finalizeSignedDocument({ signingRequestId: request.providerRequestId, documentDigest: prepared.sha256, finalDocumentSha256: pdfSha256 }, context);
    if (!finalized.ok || finalized.value.finalDocumentSha256 !== pdfSha256) throw new ApplicationError("signing_failed", "Signed document finalization failed");
    return this.votes.completeDocument({ publicId, voteId: input.voteId, userId: input.userId, authSessionId: input.authSessionId, submitIdempotencyKey: input.idempotencyKey, surveyId: prepared.source.vote.surveyId, surveyVersion: prepared.source.surveyVersion, storageKey, sha256: pdfSha256, canonicalSha256: prepared.sha256, signingProvider: this.signing.name, verificationReference: verificationUrl, sizeBytes: pdfBytes.byteLength, signatureRequestId: request.id, requestId: context.requestId });
  }
}

function uuidFromHash(hash: string): string {
  const value = `${hash.slice(0, 12)}5${hash.slice(13, 16)}a${hash.slice(17, 32)}`;
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20, 32)}`;
}
