import { ApplicationError } from "@/src/application/errors";
import type { VotingRepository } from "@/src/application/ports/data-repositories";
import type { VoteLifecycleRepository } from "@/src/application/ports/vote-lifecycle-repository";
import { canonicalVoteHash, type CanonicalVote } from "@/src/domain/canonical-vote";

export class VoteLifecycleService {
  constructor(private readonly surveys: VotingRepository, private readonly lifecycle: VoteLifecycleRepository) {}

  async prepareCanonical(voteId: string, userId: string, requestId: string, frozenAt = new Date().toISOString()) {
    const source = await this.lifecycle.loadCanonicalSource(voteId, userId);
    if (!source) throw new ApplicationError("not_found", "Vote draft was not found");
    if (source.vote.status !== "draft") throw new ApplicationError("invalid_vote_state", "Vote is already locked for signing");
    const survey = await this.surveys.getSurvey(source.vote.surveyId);
    const now = new Date(frozenAt);
    if (!survey) throw new ApplicationError("invalid_survey", "Survey does not exist");
    if (survey.status !== "active" || (survey.startsAt && survey.startsAt > now) || (survey.closesAt && survey.closesAt <= now)) {
      throw new ApplicationError("closed_survey", "Survey is not open");
    }
    if (source.questions.some((question) => question.required && !question.choice)) {
      throw new ApplicationError("invalid_answers", "All required questions must be answered");
    }
    const canonical: CanonicalVote = {
      schemaVersion: 1,
      voteId,
      survey: {
        id: source.vote.surveyId,
        version: source.surveyVersion,
        protocolNumber: source.protocolNumber,
        questions: source.questions.filter((question) => question.choice).map((question) => ({
          id: question.id, position: question.position, textRu: question.textRu, textKk: question.textKk, answer: question.choice!,
        })),
      },
      participantReference: source.participantReference,
      propertyReference: source.propertyReference,
      accountReference: source.accountReference,
      frozenAt,
      documentVersion: 1,
    };
    const { sha256 } = canonicalVoteHash(canonical);
    await this.lifecycle.freezeCanonical({ voteId, userId, canonical, canonicalSha256: sha256, requestId });
    return { source, canonical, sha256 };
  }
}
