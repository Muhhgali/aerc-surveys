import { createHash } from "node:crypto";
import { ApplicationError } from "@/src/application/errors";
import type { StartOrResumeVoteResult, VotingRepository, VoteRecord } from "@/src/application/ports/data-repositories";
import type { VoteChoice } from "@/src/domain/voting";

export class VoteService {
  constructor(private readonly votes: VotingRepository) {}

  async startOrResume(command: { authSessionId: string; userId: string; surveyId: string; propertyId: string; idempotencyKey: string; requestId: string }, now = new Date()): Promise<StartOrResumeVoteResult> {
    const existing = await this.votes.findForUserSurvey(command.surveyId, command.userId);
    if (existing?.status === "submitted") return { vote: existing, disposition: "completed" };
    await this.requireOpenSurvey(command.surveyId, now);
    const participant = await this.votes.getParticipant(command.surveyId, command.userId, command.propertyId);
    if (!participant || participant.status !== "eligible") throw new ApplicationError("unauthorized_property", "User is not eligible to vote for this property");
    return this.votes.startOrResume({ authSessionId: command.authSessionId, participant, idempotencyKey: command.idempotencyKey, requestId: command.requestId });
  }

  async resume(surveyId: string, userId: string): Promise<VoteRecord> {
    const vote = await this.votes.findForUserSurvey(surveyId, userId);
    if (!vote) throw new ApplicationError("not_found", "Vote workflow was not found");
    return vote;
  }

  async autosave(command: { voteId: string; userId: string; questionId: string; choice: VoteChoice; idempotencyKey: string; requestId: string }, now = new Date()): Promise<VoteRecord> {
    const vote = await this.getOwnedVote(command.voteId, command.userId);
    if (vote.status !== "draft") throw new ApplicationError("invalid_vote_state", "Submitted vote answers are immutable");
    const survey = await this.requireOpenSurvey(vote.surveyId, now);
    if (!survey.questions.some((question) => question.id === command.questionId && question.status === "active")) {
      throw new ApplicationError("invalid_answers", "Question does not belong to the active survey");
    }
    const payloadSha256 = createHash("sha256").update(`${command.voteId}:${command.questionId}:${command.choice}`, "utf8").digest("hex");
    return this.votes.saveAnswer({ ...command, payloadSha256 });
  }

  async getOwnedVote(voteId: string, userId: string): Promise<VoteRecord> {
    const vote = await this.votes.findOwnedVote(voteId, userId);
    if (!vote) throw new ApplicationError("not_found", "Vote not found");
    return vote;
  }

  private async requireOpenSurvey(surveyId: string, now: Date) {
    const survey = await this.votes.getSurvey(surveyId);
    if (!survey) throw new ApplicationError("invalid_survey", "Survey does not exist");
    if (survey.status !== "active" || (survey.startsAt && survey.startsAt > now) || (survey.closesAt && survey.closesAt <= now)) {
      throw new ApplicationError("closed_survey", "Survey is not open for voting");
    }
    return survey;
  }
}
