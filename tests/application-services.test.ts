import { describe, expect, it } from "vitest";
import { OrganizationService } from "@/src/application/organization/organization-service";
import type {
  EligibleParticipant,
  LocalPersonalAccount,
  SubmitVoteRecord,
  SurveyVotingState,
  VoteRecord,
  VotingRepository,
} from "@/src/application/ports/data-repositories";
import { PropertyService } from "@/src/application/property/property-service";
import { VoteService } from "@/src/application/voting/vote-service";
import { MockPropertyProvider } from "@/src/infrastructure/providers/mock/mock-providers";

const userId = "00000000-0000-4000-8000-000000000001";
const surveyId = "00000000-0000-4000-8000-000000000012";
const propertyId = "00000000-0000-4000-8000-000000000201";
const questionId = "00000000-0000-4000-8000-000000000101";

const logger = { info: () => undefined, warn: () => undefined, error: () => undefined };

class FakeVotingRepository implements VotingRepository {
  survey: SurveyVotingState | null = {
    id: surveyId, status: "active", startsAt: null, closesAt: null,
    questions: [{ id: questionId, required: true, status: "active" }],
  };
  participant: EligibleParticipant | null = { id: "participant", surveyId, userId, propertyId, status: "eligible" };
  existing: VoteRecord | null = null;
  owned: VoteRecord | null = null;
  submitError: unknown;

  async getSurvey() { return this.survey; }
  async getParticipant() { return this.participant; }
  async findByIdempotencyKey() { return this.existing; }
  async submit(record: SubmitVoteRecord): Promise<VoteRecord> {
    if (this.submitError) throw this.submitError;
    return { id: "vote", surveyId: record.participant.surveyId, userId: record.participant.userId, propertyId: record.participant.propertyId, idempotencyKey: record.idempotencyKey };
  }
  async findOwnedVote() { return this.owned; }
}

function command() {
  return {
    authSessionId: "00000000-0000-4000-8000-000000000501",
    userId, surveyId, propertyId,
    idempotencyKey: "00000000-0000-4000-8000-000000000601",
    requestId: "request-test-0001",
    answers: [{ questionId, choice: "for" as const }],
  };
}

describe("VoteService", () => {
  it("rejects an invalid survey", async () => {
    const repository = new FakeVotingRepository();
    repository.survey = null;
    await expect(new VoteService(repository).submit(command())).rejects.toMatchObject({ code: "invalid_survey" });
  });

  it("rejects a closed survey", async () => {
    const repository = new FakeVotingRepository();
    repository.survey = { ...repository.survey!, status: "closed" };
    await expect(new VoteService(repository).submit(command())).rejects.toMatchObject({ code: "closed_survey" });
  });

  it("rejects an unauthorized property", async () => {
    const repository = new FakeVotingRepository();
    repository.participant = null;
    await expect(new VoteService(repository).submit(command())).rejects.toMatchObject({ code: "unauthorized_property" });
  });

  it("maps a database duplicate vote constraint", async () => {
    const repository = new FakeVotingRepository();
    repository.submitError = { code: "23505" };
    await expect(new VoteService(repository).submit(command())).rejects.toMatchObject({ code: "duplicate_vote" });
  });

  it("enforces vote ownership", async () => {
    const repository = new FakeVotingRepository();
    repository.owned = null;
    await expect(new VoteService(repository).getOwnedVote("another-vote", userId)).rejects.toMatchObject({ code: "not_found" });
    repository.owned = { id: "owned", surveyId, userId, propertyId, idempotencyKey: "owned-key" };
    await expect(new VoteService(repository).getOwnedVote("owned", userId)).resolves.toMatchObject({ id: "owned", userId });
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
