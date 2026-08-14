import "server-only";

import { ApplicationError } from "@/src/application/errors";
import type { AuthenticationRepository, CurrentUser } from "@/src/application/ports/authentication-repository";
import type {
  EligibleParticipant,
  LocalPersonalAccount,
  OrganizationMembershipRepository,
  PersonalAccountRepository,
  StartOrResumeVoteRecord,
  StartOrResumeVoteResult,
  SurveyVotingState,
  VoteRecord,
  VotingRepository,
} from "@/src/application/ports/data-repositories";
import type { AuditEvent, AuditRepository } from "@/src/application/ports/repositories";
import type { IdentityMethod, VerifiedIdentity } from "@/src/domain/identity";
import type { VoteChoice } from "@/src/domain/voting";
import type { DatabaseClient } from "@/src/infrastructure/database/client";

export class PostgresAuthenticationRepository implements AuthenticationRepository {
  constructor(private readonly sql: DatabaseClient) {}

  async resolveVerifiedIdentity(provider: IdentityMethod, identity: VerifiedIdentity): Promise<CurrentUser | null> {
    const rows = await this.sql<CurrentUser[]>`
      update external_identities ei set verified_at = ${identity.verifiedAt}, updated_at = now()
      from users u
      where ei.user_id = u.id and ei.provider = ${provider} and ei.provider_subject = ${identity.subjectId}
        and u.status = 'active'
      returning u.id, u.display_name as "displayName"
    `;
    return rows[0] ?? null;
  }

  async findActiveUser(userId: string): Promise<CurrentUser | null> {
    const rows = await this.sql<CurrentUser[]>`
      select id, display_name as "displayName" from users where id = ${userId} and status = 'active' limit 1
    `;
    return rows[0] ?? null;
  }
}

export class PostgresPersonalAccountRepository implements PersonalAccountRepository {
  constructor(private readonly sql: DatabaseClient) {}

  async findActiveByReference(source: string, accountNumber: string): Promise<LocalPersonalAccount | null> {
    const rows = await this.sql<{
      personal_account_id: string;
      property_id: string;
      external_account_id: string;
      account_number: string;
      source: string;
      city: string;
      street: string;
      building: string;
      premise: string;
      property_type: string;
    }[]>`
      select pa.id as personal_account_id, p.id as property_id, pa.external_account_id,
             pa.account_number, pa.source, p.city, p.street, p.building, p.premise, p.property_type
      from personal_accounts pa
      join properties p on p.id = pa.property_id
      where pa.source = ${source} and pa.account_number = ${accountNumber}
        and pa.status = 'active' and p.status = 'active'
      limit 1
    `;
    const row = rows[0];
    if (!row) return null;
    return {
      localPersonalAccountId: row.personal_account_id,
      localPropertyId: row.property_id,
      propertyId: row.property_id,
      accountId: row.account_number,
      externalAccountId: row.external_account_id,
      source: row.source,
      address: `г. ${row.city}, ул. ${row.street}, д. ${row.building}`,
      unit: row.premise,
      ownershipKind: row.property_type === "non_residential" ? "non_residential" : "residential",
    };
  }
}

export class PostgresVotingRepository implements VotingRepository {
  constructor(private readonly sql: DatabaseClient) {}

  async getSurvey(surveyId: string): Promise<SurveyVotingState | null> {
    const surveys = await this.sql<{ id: string; status: SurveyVotingState["status"]; starts_at: Date | null; closes_at: Date | null }[]>`
      select id, status, starts_at, closes_at from surveys where id = ${surveyId} limit 1
    `;
    const survey = surveys[0];
    if (!survey) return null;
    const questions = await this.sql<{ id: string; required: boolean; status: "active" | "inactive" }[]>`
      select id, required, status from survey_questions where survey_id = ${surveyId} order by position
    `;
    return { id: survey.id, status: survey.status, startsAt: survey.starts_at, closesAt: survey.closes_at, questions };
  }

  async getParticipant(surveyId: string, userId: string, propertyId: string): Promise<EligibleParticipant | null> {
    const rows = await this.sql<EligibleParticipant[]>`
      select id, survey_id as "surveyId", user_id as "userId", property_id as "propertyId", status
      from survey_participants
      where survey_id = ${surveyId} and user_id = ${userId} and property_id = ${propertyId}
      limit 1
    `;
    return rows[0] ?? null;
  }

  async findOwnedVote(voteId: string, userId: string): Promise<VoteRecord | null> {
    return this.loadVote(voteId, userId);
  }

  async findForUserSurvey(surveyId: string, userId: string): Promise<VoteRecord | null> {
    const rows = await this.sql<{ id: string }[]>`
      select id from votes where survey_id = ${surveyId} and user_id = ${userId} and status <> 'invalidated'
      order by created_at desc limit 1
    `;
    return rows[0] ? this.loadVote(rows[0].id, userId) : null;
  }

  async startOrResume(record: StartOrResumeVoteRecord): Promise<StartOrResumeVoteResult> {
    const outcome = await this.sql.begin(async (transaction) => {
      const participants = await transaction<EligibleParticipant[]>`
        select id, survey_id as "surveyId", user_id as "userId", property_id as "propertyId", status
        from survey_participants where id = ${record.participant.id} for update
      `;
      const participant = participants[0];
      if (!participant || participant.status !== "eligible" || participant.userId !== record.participant.userId || participant.propertyId !== record.participant.propertyId) {
        throw new ApplicationError("unauthorized_property", "Participant eligibility changed");
      }
      const existing = await transaction<{ id: string; status: "draft" | "submitted" }[]>`
        select id, status from votes where survey_id = ${participant.surveyId} and user_id = ${participant.userId}
          and property_id = ${participant.propertyId} and status <> 'invalidated' limit 1
      `;
      if (existing[0]) {
        await transaction`
          update vote_sessions set auth_session_id = ${record.authSessionId}, updated_at = now()
          where id = (select vote_session_id from votes where id = ${existing[0].id})
        `;
        await transaction`
          insert into audit_logs (event_type, actor_user_id, subject_type, subject_id, request_id, outcome, metadata)
          values ('VOTE_RESUMED', ${participant.userId}, 'vote', ${existing[0].id}, ${record.requestId}, 'success', ${transaction.json({ surveyId: participant.surveyId })})
        `;
        return { id: existing[0].id, disposition: existing[0].status === "submitted" ? "completed" as const : "resumed" as const };
      }
      const sessions = await transaction<{ id: string }[]>`
        insert into vote_sessions (auth_session_id, participant_id, status, idempotency_key, expires_at)
        values (${record.authSessionId}, ${participant.id}, 'started', ${record.idempotencyKey}, now() + interval '30 days') returning id
      `;
      const votes = await transaction<{ id: string }[]>`
        insert into votes (vote_session_id, survey_id, participant_id, user_id, property_id, status, idempotency_key)
        values (${sessions[0].id}, ${participant.surveyId}, ${participant.id}, ${participant.userId}, ${participant.propertyId}, 'draft', ${record.idempotencyKey}) returning id
      `;
      await transaction`
        insert into audit_logs (event_type, actor_user_id, subject_type, subject_id, request_id, outcome, metadata)
        values ('VOTE_STARTED', ${participant.userId}, 'vote', ${votes[0].id}, ${record.requestId}, 'success', ${transaction.json({ surveyId: participant.surveyId })})
      `;
      return { id: votes[0].id, disposition: "started" as const };
    });
    const vote = await this.loadVote(outcome.id, record.participant.userId);
    if (!vote) throw new ApplicationError("not_found", "Vote workflow could not be loaded");
    return { vote, disposition: outcome.disposition };
  }

  async saveAnswer(record: { voteId: string; userId: string; questionId: string; choice: VoteChoice; idempotencyKey: string; payloadSha256: string; requestId: string }): Promise<VoteRecord> {
    await this.sql.begin(async (transaction) => {
      const previous = await transaction<{ voteId: string; payloadSha256: string }[]>`
        select vote_id as "voteId", payload_sha256 as "payloadSha256" from vote_autosaves where idempotency_key = ${record.idempotencyKey}
      `;
      if (previous[0]) {
        if (previous[0].voteId !== record.voteId || previous[0].payloadSha256 !== record.payloadSha256) {
          throw new ApplicationError("idempotency_conflict", "Idempotency key was reused with a different payload");
        }
        return;
      }
      const votes = await transaction<{ surveyId: string; status: "draft" | "submitted" | "invalidated"; stateVersion: number; surveyStatus: string; startsAt: Date | null; closesAt: Date | null }[]>`
        select v.survey_id as "surveyId", v.status, v.state_version as "stateVersion", s.status as "surveyStatus", s.starts_at as "startsAt", s.closes_at as "closesAt"
        from votes v join surveys s on s.id = v.survey_id
        where v.id = ${record.voteId} and v.user_id = ${record.userId} for update of v
      `;
      const vote = votes[0];
      if (!vote) throw new ApplicationError("not_found", "Vote not found");
      const now = new Date();
      if (vote.status !== "draft") throw new ApplicationError("invalid_vote_state", "Submitted vote answers are immutable");
      if (vote.surveyStatus !== "active" || (vote.startsAt && vote.startsAt > now) || (vote.closesAt && vote.closesAt <= now)) {
        throw new ApplicationError("closed_survey", "Survey is not open for voting");
      }
      const questions = await transaction<{ present: boolean }[]>`
        select exists(select 1 from survey_questions where id = ${record.questionId} and survey_id = ${vote.surveyId} and status = 'active') as present
      `;
      if (!questions[0]?.present) throw new ApplicationError("invalid_answers", "Question does not belong to the active survey");
      await transaction`
        insert into vote_answers (vote_id, question_id, choice) values (${record.voteId}, ${record.questionId}, ${record.choice})
        on conflict (vote_id, question_id) do update set choice = excluded.choice, updated_at = now()
      `;
      const nextVersion = vote.stateVersion + 1;
      await transaction`update votes set state_version = ${nextVersion}, updated_at = now() where id = ${record.voteId}`;
      await transaction`
        insert into vote_autosaves (vote_id, idempotency_key, payload_sha256, state_version)
        values (${record.voteId}, ${record.idempotencyKey}, ${record.payloadSha256}, ${nextVersion})
      `;
      await transaction`
        insert into audit_logs (event_type, actor_user_id, subject_type, subject_id, request_id, outcome, metadata)
        values ('VOTE_ANSWER_CHANGED', ${record.userId}, 'vote', ${record.voteId}, ${record.requestId}, 'success', ${transaction.json({ questionId: record.questionId, stateVersion: String(nextVersion) })})
      `;
    });
    const vote = await this.loadVote(record.voteId, record.userId);
    if (!vote) throw new ApplicationError("not_found", "Vote not found");
    return vote;
  }

  async submitDraft(record: { voteId: string; userId: string; authSessionId: string; idempotencyKey: string; requestId: string }): Promise<VoteRecord> {
    await this.sql.begin(async (transaction) => {
      const sameKey = await transaction<{ id: string; userId: string }[]>`
        select id, user_id as "userId" from votes where submit_idempotency_key = ${record.idempotencyKey} limit 1
      `;
      if (sameKey[0] && (sameKey[0].id !== record.voteId || sameKey[0].userId !== record.userId)) {
        throw new ApplicationError("idempotency_conflict", "Idempotency key belongs to another submission");
      }
      const rows = await transaction<{
        status: "draft" | "submitted" | "invalidated"; surveyId: string; propertyId: string; participantId: string;
        participantStatus: string; surveyStatus: string; startsAt: Date | null; closesAt: Date | null; voteSessionId: string;
      }[]>`
        select v.status, v.survey_id as "surveyId", v.property_id as "propertyId", v.participant_id as "participantId",
          sp.status as "participantStatus", s.status as "surveyStatus", s.starts_at as "startsAt", s.closes_at as "closesAt",
          v.vote_session_id as "voteSessionId"
        from votes v join surveys s on s.id = v.survey_id join survey_participants sp on sp.id = v.participant_id
        where v.id = ${record.voteId} and v.user_id = ${record.userId} for update of v
      `;
      const vote = rows[0];
      if (!vote) throw new ApplicationError("not_found", "Vote not found");
      if (vote.status === "submitted") return;
      if (vote.status !== "draft") throw new ApplicationError("invalid_vote_state", "Vote cannot be submitted");
      const now = new Date();
      if (vote.surveyStatus !== "active" || (vote.startsAt && vote.startsAt > now) || (vote.closesAt && vote.closesAt <= now)) {
        throw new ApplicationError("closed_survey", "Survey is not open for voting");
      }
      if (vote.participantStatus !== "eligible") throw new ApplicationError("unauthorized_property", "Participant is no longer eligible");
      const completeness = await transaction<{ requiredCount: number; answeredCount: number }[]>`
        select (count(*) filter (where q.required))::int as "requiredCount",
          (count(a.question_id) filter (where q.required))::int as "answeredCount"
        from survey_questions q left join vote_answers a on a.question_id = q.id and a.vote_id = ${record.voteId}
        where q.survey_id = ${vote.surveyId} and q.status = 'active'
      `;
      if (!completeness[0] || completeness[0].requiredCount !== completeness[0].answeredCount) {
        throw new ApplicationError("invalid_answers", "All required survey questions must be answered");
      }
      await transaction`
        update votes set status = 'submitted', submit_idempotency_key = ${record.idempotencyKey}, submitted_at = now(), updated_at = now(), state_version = state_version + 1
        where id = ${record.voteId}
      `;
      await transaction`
        update vote_sessions set status = 'submitted', auth_session_id = ${record.authSessionId}, submitted_at = now(), updated_at = now()
        where id = ${vote.voteSessionId}
      `;
      await transaction`
        insert into audit_logs (event_type, actor_user_id, subject_type, subject_id, request_id, outcome, metadata)
        values ('VOTE_SUBMITTED', ${record.userId}, 'vote', ${record.voteId}, ${record.requestId}, 'success', ${transaction.json({ surveyId: vote.surveyId })})
      `;
    });
    const vote = await this.loadVote(record.voteId, record.userId);
    if (!vote) throw new ApplicationError("not_found", "Vote not found");
    return vote;
  }

  private async loadVote(voteId: string, userId: string): Promise<VoteRecord | null> {
    const rows = await this.sql<{
      id: string; surveyId: string; userId: string; propertyId: string; idempotencyKey: string; status: VoteRecord["status"];
      stateVersion: number; submittedAt: Date | null; accountNumber: string; city: string; street: string; building: string; unit: string;
    }[]>`
      select v.id, v.survey_id as "surveyId", v.user_id as "userId", v.property_id as "propertyId", v.idempotency_key as "idempotencyKey",
        v.status, v.state_version as "stateVersion", v.submitted_at as "submittedAt", pa.account_number as "accountNumber",
        p.city, p.street, p.building, p.premise as unit
      from votes v join survey_participants sp on sp.id = v.participant_id
      join properties p on p.id = v.property_id join personal_accounts pa on pa.id = sp.personal_account_id
      where v.id = ${voteId} and v.user_id = ${userId} limit 1
    `;
    const row = rows[0];
    if (!row) return null;
    const answers = await this.sql<{ questionId: string; choice: VoteChoice }[]>`
      select question_id as "questionId", choice from vote_answers where vote_id = ${voteId} order by question_id
    `;
    return {
      id: row.id, surveyId: row.surveyId, userId: row.userId, propertyId: row.propertyId,
      idempotencyKey: row.idempotencyKey, status: row.status, stateVersion: row.stateVersion,
      submittedAt: row.submittedAt?.toISOString() ?? null, accountNumber: row.accountNumber,
      address: `г. ${row.city}, ул. ${row.street}, д. ${row.building}`, unit: row.unit, answers,
    };
  }
}

export class PostgresOrganizationMembershipRepository implements OrganizationMembershipRepository {
  constructor(private readonly sql: DatabaseClient) {}

  async hasActiveMembership(userId: string, organizationId: string): Promise<boolean> {
    const rows = await this.sql<{ present: boolean }[]>`
      select exists(
        select 1 from organization_members om
        join users u on u.id = om.user_id and u.status = 'active'
        join organizations o on o.id = om.organization_id and o.status = 'active'
        where om.user_id = ${userId} and om.organization_id = ${organizationId}
      ) as present
    `;
    return rows[0]?.present === true;
  }
}

export class PostgresAuditRepository implements AuditRepository {
  constructor(private readonly sql: DatabaseClient) {}

  async append(event: AuditEvent): Promise<void> {
    await this.sql`
      insert into audit_logs (id, event_type, actor_user_id, subject_type, subject_id, request_id, outcome, metadata, occurred_at)
      values (${event.eventId}, ${event.eventType}, ${event.actorId ?? null}, ${event.metadata.subjectType ?? null},
              ${event.subjectId ?? null}, ${event.requestId}, ${event.outcome}, ${this.sql.json(event.metadata)}, ${event.occurredAt})
    `;
  }
}
