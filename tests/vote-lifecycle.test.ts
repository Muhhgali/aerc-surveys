import { describe, expect, it } from "vitest";
import { canonicalVoteHash, deterministicSerialize, type CanonicalVote } from "@/src/domain/canonical-vote";
import { answersAreMutable, canTransitionVote } from "@/src/domain/vote-lifecycle";
import { MockSigningProvider } from "@/src/infrastructure/providers/mock/mock-providers";

const canonical: CanonicalVote = { schemaVersion: 1, voteId: "vote-1", survey: { id: "survey-1", version: 2, protocolNumber: "12", questions: [{ id: "q1", position: 1, textRu: "Вопрос", textKk: null, answer: "for" }] }, participantReference: "participant-1", propertyReference: "property-1", accountReference: "1911", frozenAt: "2026-08-17T00:00:00.000Z", documentVersion: 1 };

describe("canonical vote and state machine", () => {
  it("produces the same hash for the same canonical data", () => expect(canonicalVoteHash(canonical)).toEqual(canonicalVoteHash(structuredClone(canonical))));
  it("changes hash whenever an answer changes", () => expect(canonicalVoteHash(canonical).sha256).not.toBe(canonicalVoteHash({ ...canonical, survey: { ...canonical.survey, questions: [{ ...canonical.survey.questions[0], answer: "against" }] } }).sha256));
  it("sorts object keys deterministically", () => expect(deterministicSerialize({ b: 2, a: 1 })).toBe('{"a":1,"b":2}'));
  it("allows only declared transitions and locks answers at canonical snapshot", () => {
    expect(canTransitionVote("draft", "ready_to_sign")).toBe(true); expect(canTransitionVote("ready_to_sign", "submitted")).toBe(false);
    expect(answersAreMutable("draft")).toBe(true); expect(answersAreMutable("ready_to_sign")).toBe(false); expect(answersAreMutable("signed")).toBe(false);
  });
});

describe("MockSigningProvider lifecycle", () => {
  const provider = new MockSigningProvider({ timeoutMs: 500, maxRetries: 0, logger: { info: () => undefined, warn: () => undefined, error: () => undefined } });
  const context = { requestId: "signing-test-request" };

  it("makes verify/finalize retries idempotent", async () => {
    const created = await provider.createSigningRequest({ subjectId: "user-1", documentDigest: "a".repeat(64) }, context); expect(created.ok).toBe(true); if (!created.ok) return;
    await expect(provider.getSigningStatus({ signingRequestId: created.value.signingRequestId }, context)).resolves.toMatchObject({ ok: true, value: { status: "ready" } });
    const first = await provider.verifySignature({ signingRequestId: created.value.signingRequestId, expectedDocumentDigest: "a".repeat(64) }, context);
    const replay = await provider.verifySignature({ signingRequestId: created.value.signingRequestId, expectedDocumentDigest: "a".repeat(64) }, context);
    expect(replay).toEqual(first);
    const finalized = await provider.finalizeSignedDocument({ signingRequestId: created.value.signingRequestId, documentDigest: "a".repeat(64), finalDocumentSha256: "b".repeat(64) }, context);
    await expect(provider.finalizeSignedDocument({ signingRequestId: created.value.signingRequestId, documentDigest: "a".repeat(64), finalDocumentSha256: "b".repeat(64) }, context)).resolves.toEqual(finalized);
  });

  it("emulates cancellation, expiry and digest mismatch", async () => {
    const created = await provider.createSigningRequest({ subjectId: "user-2", documentDigest: "c".repeat(64) }, context); if (!created.ok) throw new Error("mock create failed");
    await provider.cancelSigningRequest({ signingRequestId: created.value.signingRequestId }, context);
    await expect(provider.getSigningStatus({ signingRequestId: created.value.signingRequestId }, context)).resolves.toMatchObject({ ok: true, value: { status: "cancelled" } });
    await expect(provider.verifySignature({ signingRequestId: created.value.signingRequestId, expectedDocumentDigest: "c".repeat(64) }, context)).resolves.toMatchObject({ ok: false, error: { code: "conflict" } });
    const expired = Buffer.from(JSON.stringify({ subjectId: "user-3", digest: "d".repeat(64), expiresAt: "2020-01-01T00:00:00.000Z" })).toString("base64url");
    await expect(provider.getSigningStatus({ signingRequestId: expired }, context)).resolves.toMatchObject({ ok: true, value: { status: "expired" } });
  });
});
