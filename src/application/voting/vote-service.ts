import { ApplicationError } from "@/src/application/errors";
import type { VotingRepository, VoteRecord } from "@/src/application/ports/data-repositories";
import type { VoteChoice } from "@/src/domain/voting";

export interface SubmitVoteCommand {
  authSessionId: string;
  userId: string;
  surveyId: string;
  propertyId: string;
  idempotencyKey: string;
  requestId: string;
  answers: readonly { questionId: string; choice: VoteChoice }[];
}

export class VoteService {
  constructor(private readonly votes: VotingRepository) {}

  async submit(command: SubmitVoteCommand, now = new Date()): Promise<VoteRecord> {
    const existing = await this.votes.findByIdempotencyKey(command.idempotencyKey);
    if (existing) {
      if (existing.userId !== command.userId) throw new ApplicationError("duplicate_vote", "Idempotency key belongs to another user");
      return existing;
    }

    const survey = await this.votes.getSurvey(command.surveyId);
    if (!survey) throw new ApplicationError("invalid_survey", "Survey does not exist");
    if (survey.status !== "active" || (survey.startsAt && survey.startsAt > now) || (survey.closesAt && survey.closesAt <= now)) {
      throw new ApplicationError("closed_survey", "Survey is not open for voting");
    }

    const participant = await this.votes.getParticipant(command.surveyId, command.userId, command.propertyId);
    if (!participant || participant.status !== "eligible") {
      throw new ApplicationError("unauthorized_property", "User is not eligible to vote for this property");
    }

    const activeQuestions = survey.questions.filter((question) => question.status === "active");
    const answerMap = new Map(command.answers.map((answer) => [answer.questionId, answer]));
    const allKnown = command.answers.every((answer) => activeQuestions.some((question) => question.id === answer.questionId));
    const allRequired = activeQuestions.filter((question) => question.required).every((question) => answerMap.has(question.id));
    if (!allKnown || !allRequired || answerMap.size !== command.answers.length) {
      throw new ApplicationError("invalid_answers", "Answers do not match active survey questions");
    }

    try {
      return await this.votes.submit({
        authSessionId: command.authSessionId,
        participant,
        idempotencyKey: command.idempotencyKey,
        answers: command.answers,
        requestId: command.requestId,
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ApplicationError("duplicate_vote", "A final vote already exists for this user and property");
      throw error;
    }
  }

  async getOwnedVote(voteId: string, userId: string): Promise<VoteRecord> {
    const vote = await this.votes.findOwnedVote(voteId, userId);
    if (!vote) throw new ApplicationError("not_found", "Vote not found");
    return vote;
  }
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}
