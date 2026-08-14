import { describe, expect, it } from "vitest";
import { OrganizationService } from "@/src/application/organization/organization-service";
import type {
  EligibleParticipant,
  LocalPersonalAccount,
  StartOrResumeVoteRecord,
  SurveyVotingState,
  VoteRecord,
  VotingRepository,
} from "@/src/application/ports/data-repositories";
import type { SessionStore } from "@/src/application/ports/repositories";
import { PropertyService } from "@/src/application/property/property-service";
import { hashSessionToken, SessionService } from "@/src/application/session/session-service";
import { VoteService } from "@/src/application/voting/vote-service";
import { MockPropertyProvider } from "@/src/infrastructure/providers/mock/mock-providers";

const userId = "00000000-0000-4000-8000-000000000001";
const surveyId = "00000000-0000-4000-8000-000000000012";
const propertyId = "00000000-0000-4000-8000-000000000201";
const questionId = "00000000-0000-4000-8000-000000000101";

const logger = { info: () => undefined, warn: () => undefined, error: () => undefined };
const draftVote = (): VoteRecord => ({
  id: "00000000-0000-4000-8000-000000000701", surveyId, userId, propertyId,
  idempotencyKey: "00000000-0000-4000-8000-000000000601", status: "draft", stateVersion: 1,
  submittedAt: null, accountNumber: "1911", address: "г. Астана, ул. Геодезическая, д. 12", unit: "52", answers: [],
});

class FakeVotingRepository implements VotingRepository {
  survey: SurveyVotingState | null = {
    id: surveyId, status: "active", startsAt: null, closesAt: null,
    questions: [{ id: questionId, required: true, status: "active" }],
  };
  participant: EligibleParticipant | null = { id: "participant", surveyId, userId, propertyId, status: "eligible" };
  existing: VoteRecord | null = null;
  owned: VoteRecord | null = null;

  async getSurvey() { return this.survey; }
  async getParticipant() { return this.participant; }
  async findOwnedVote() { return this.owned; }
  async findForUserSurvey() { return this.existing; }
  async startOrResume(record: StartOrResumeVoteRecord) { return { vote: { ...draftVote(), idempotencyKey: record.idempotencyKey }, disposition: "started" as const }; }
  async saveAnswer(record: Parameters<VotingRepository["saveAnswer"]>[0]) { return { ...draftVote(), stateVersion: 2, answers: [{ questionId: record.questionId, choice: record.choice }] }; }
  async submitDraft() { return { ...(this.owned ?? draftVote()), status: "submitted" as const, submittedAt: new Date().toISOString() }; }
}

function startCommand() {
  return {
    authSessionId: "00000000-0000-4000-8000-000000000501",
    userId, surveyId, propertyId,
    idempotencyKey: "00000000-0000-4000-8000-000000000601",
    requestId: "request-test-0001",
  };
}

describe("VoteService", () => {
  it("rejects an invalid survey", async () => {
    const repository = new FakeVotingRepository();
    repository.survey = null;
    await expect(new VoteService(repository).startOrResume(startCommand())).rejects.toMatchObject({ code: "invalid_survey" });
  });

  it("rejects a closed survey", async () => {
    const repository = new FakeVotingRepository();
    repository.survey = { ...repository.survey!, status: "closed" };
    await expect(new VoteService(repository).startOrResume(startCommand())).rejects.toMatchObject({ code: "closed_survey" });
  });

  it("rejects an unauthorized property", async () => {
    const repository = new FakeVotingRepository();
    repository.participant = null;
    await expect(new VoteService(repository).startOrResume(startCommand())).rejects.toMatchObject({ code: "unauthorized_property" });
  });

  it("returns a completed workflow instead of creating a second vote", async () => {
    const repository = new FakeVotingRepository();
    repository.existing = { ...draftVote(), status: "submitted", submittedAt: new Date().toISOString() };
    await expect(new VoteService(repository).startOrResume(startCommand())).resolves.toMatchObject({ disposition: "completed", vote: { status: "submitted" } });
  });

  it("enforces vote ownership", async () => {
    const repository = new FakeVotingRepository();
    repository.owned = null;
    await expect(new VoteService(repository).getOwnedVote("another-vote", userId)).rejects.toMatchObject({ code: "not_found" });
    repository.owned = { ...draftVote(), id: "owned", idempotencyKey: "owned-key" };
    await expect(new VoteService(repository).getOwnedVote("owned", userId)).resolves.toMatchObject({ id: "owned", userId });
  });

  it("rejects an answer from another survey and freezes submitted answers", async () => {
    const repository = new FakeVotingRepository();
    repository.owned = draftVote();
    const service = new VoteService(repository);
    await expect(service.autosave({ voteId: repository.owned.id, userId, questionId: "00000000-0000-4000-8000-999999999999", choice: "for", idempotencyKey: crypto.randomUUID(), requestId: "request-test-foreign" }))
      .rejects.toMatchObject({ code: "invalid_answers" });
    repository.owned = { ...draftVote(), status: "submitted" };
    await expect(service.autosave({ voteId: repository.owned.id, userId, questionId, choice: "for", idempotencyKey: crypto.randomUUID(), requestId: "request-test-final" }))
      .rejects.toMatchObject({ code: "invalid_vote_state" });
  });
});

describe("SessionService", () => {
  it("stores only a token hash and rejects expired or revoked sessions", async () => {
    let storedHash = "";
    let storedSession: Parameters<SessionStore["create"]>[0] | null = null;
    const store: SessionStore = {
      create: async (session, tokenHash) => { storedSession = session; storedHash = tokenHash; },
      findByTokenHash: async (tokenHash) => tokenHash === storedHash ? storedSession : null,
      revokeByTokenHash: async (_tokenHash, revokedAt) => { if (storedSession) storedSession = { ...storedSession, revokedAt }; },
    };
    const service = new SessionService(store, 60);
    const credential = await service.create(userId, "demo");
    expect(credential.token).toHaveLength(43);
    expect(storedHash).toBe(hashSessionToken(credential.token));
    expect(storedHash).not.toContain(credential.token);
    await expect(service.requireActive(credential.token)).resolves.toMatchObject({ subjectId: userId });
    await service.revoke(credential.token);
    await expect(service.requireActive(credential.token)).rejects.toThrow("expired, or revoked");
  });
});

describe("PropertyService", () => {
  const provider = new MockPropertyProvider({ timeoutMs: 500, maxRetries: 0, logger });
  const account: LocalPersonalAccount = {
    localPropertyId: propertyId,
    localPersonalAccountId: "00000000-0000-4000-8000-000000000301",
    propertyId,
    accountId: "1911",
    source: "mock",
    address: "г. Астана, ул. Геодезическая, д. 12",
    unit: "52",
    ownershipKind: "residential",
  };
  const accounts = { findActiveByReference: async (_source: string, number: string) => number === "1911" ? account : null };

  it("rejects an invalid personal account", async () => {
    const service = new PropertyService(provider, accounts);
    await expect(service.resolveForIdentity(userId, "9999", { requestId: "request-test-0002" })).rejects.toMatchObject({ code: "invalid_personal_account" });
  });

  it("resolves the valid mock personal account", async () => {
    const service = new PropertyService(provider, accounts);
    await expect(service.resolveForIdentity(userId, "1911", { requestId: "request-test-0003" })).resolves.toMatchObject({
      accountId: "1911", unit: "52", localPropertyId: propertyId,
    });
  });

  it("does not treat knowledge of an account number as ownership", async () => {
    const service = new PropertyService(provider, accounts);
    await expect(service.resolveForIdentity("00000000-0000-4000-8000-999999999999", "1911", { requestId: "request-test-0004" }))
      .rejects.toMatchObject({ code: "unauthorized_property" });
  });
});

describe("OrganizationService", () => {
  it("requires a verified organization membership", async () => {
    const organizationId = "00000000-0000-4000-8000-000000000101";
    const service = new OrganizationService({ hasActiveMembership: async (candidate, organization) => candidate === userId && organization === organizationId });
    await expect(service.requireMembership(userId, organizationId)).resolves.toBeUndefined();
    await expect(service.requireMembership("other-user", organizationId)).rejects.toMatchObject({ code: "unauthorized_property" });
  });
});
