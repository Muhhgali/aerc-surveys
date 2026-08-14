import type { PropertyAccount } from "@/src/domain/property";
import type { VoteChoice } from "@/src/domain/voting";

export interface LocalPersonalAccount extends PropertyAccount {
  localPropertyId: string;
  localPersonalAccountId: string;
}

export interface PersonalAccountRepository {
  findActiveByReference(source: string, accountNumber: string): Promise<LocalPersonalAccount | null>;
}

export interface SurveyVotingState {
  id: string;
  status: "draft" | "scheduled" | "active" | "closed" | "archived";
  startsAt: Date | null;
  closesAt: Date | null;
  questions: readonly { id: string; required: boolean; status: "active" | "inactive" }[];
}

export interface EligibleParticipant {
  id: string;
  surveyId: string;
  userId: string;
  propertyId: string;
  status: "eligible" | "ineligible" | "revoked";
}

export interface VoteRecord {
  id: string;
  surveyId: string;
  userId: string;
  propertyId: string;
  idempotencyKey: string;
}

export interface SubmitVoteRecord {
  authSessionId: string;
  participant: EligibleParticipant;
  idempotencyKey: string;
  answers: readonly { questionId: string; choice: VoteChoice }[];
  requestId: string;
}

export interface VotingRepository {
  getSurvey(surveyId: string): Promise<SurveyVotingState | null>;
  getParticipant(surveyId: string, userId: string, propertyId: string): Promise<EligibleParticipant | null>;
  findByIdempotencyKey(idempotencyKey: string): Promise<VoteRecord | null>;
  submit(record: SubmitVoteRecord): Promise<VoteRecord>;
  findOwnedVote(voteId: string, userId: string): Promise<VoteRecord | null>;
}

export interface OrganizationMembershipRepository {
  hasActiveMembership(userId: string, organizationId: string): Promise<boolean>;
}
