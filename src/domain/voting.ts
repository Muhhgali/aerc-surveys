import type { IsoDateTime } from "./shared";

export type VoteChoice = "for" | "against" | "abstain";

export interface VoteAnswer {
  questionId: string;
  choice: VoteChoice;
}

export interface VoteSubmission {
  surveyId: string;
  subjectId: string;
  propertyId: string;
  answers: readonly VoteAnswer[];
  signingEvidenceId: string;
  idempotencyKey: string;
  submittedAt: IsoDateTime;
}

export interface RecordedVote {
  voteId: string;
  documentId: string;
  recordedAt: IsoDateTime;
}
