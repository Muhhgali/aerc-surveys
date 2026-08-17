import type { PropertyAccount } from "@/src/domain/property";
import type { VoteChoice } from "@/src/domain/voting";
import type { VoteState } from "@/src/domain/vote-lifecycle";

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
  status: VoteState;
  stateVersion: number;
  submittedAt: string | null;
  accountNumber: string;
  address: string;
  unit: string;
  answers: readonly { questionId: string; choice: VoteChoice }[];
}

export interface StartOrResumeVoteRecord {
  authSessionId: string;
  participant: EligibleParticipant;
  idempotencyKey: string;
  requestId: string;
}

export interface StartOrResumeVoteResult {
  vote: VoteRecord;
  disposition: "started" | "resumed" | "completed";
}

export interface VotingRepository {
  getSurvey(surveyId: string): Promise<SurveyVotingState | null>;
  getParticipant(surveyId: string, userId: string, propertyId: string): Promise<EligibleParticipant | null>;
  findOwnedVote(voteId: string, userId: string): Promise<VoteRecord | null>;
  findForUserSurvey(surveyId: string, userId: string): Promise<VoteRecord | null>;
  startOrResume(record: StartOrResumeVoteRecord): Promise<StartOrResumeVoteResult>;
  saveAnswer(record: { voteId: string; userId: string; questionId: string; choice: VoteChoice; idempotencyKey: string; payloadSha256: string; requestId: string }): Promise<VoteRecord>;
}

export interface OrganizationMembershipRepository {
  hasActiveMembership(userId: string, organizationId: string): Promise<boolean>;
}
