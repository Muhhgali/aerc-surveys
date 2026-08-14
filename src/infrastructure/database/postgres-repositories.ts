import "server-only";

import type {
  EligibleParticipant,
  LocalPersonalAccount,
  OrganizationMembershipRepository,
  PersonalAccountRepository,
  SubmitVoteRecord,
  SurveyVotingState,
  VoteRecord,
  VotingRepository,
} from "@/src/application/ports/data-repositories";
import type { AuditEvent, AuditRepository } from "@/src/application/ports/repositories";
import type { DatabaseClient } from "@/src/infrastructure/database/client";

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

  async findByIdempotencyKey(idempotencyKey: string): Promise<VoteRecord | null> {
    const rows = await this.sql<VoteRecord[]>`
      select id, survey_id as "surveyId", user_id as "userId", property_id as "propertyId", idempotency_key as "idempotencyKey"
      from votes where idempotency_key = ${idempotencyKey} limit 1
    `;
    return rows[0] ?? null;
  }

  async submit(record: SubmitVoteRecord): Promise<VoteRecord> {
    return this.sql.begin(async (transaction) => {
      const existing = await transaction<VoteRecord[]>`
        select id, survey_id as "surveyId", user_id as "userId", property_id as "propertyId", idempotency_key as "idempotencyKey"
        from votes where idempotency_key = ${record.idempotencyKey} limit 1
      `;
      if (existing[0]) return existing[0];

      const voteSessions = await transaction<{ id: string }[]>`
        insert into vote_sessions (auth_session_id, participant_id, status, idempotency_key, expires_at, submitted_at)
        values (${record.authSessionId}, ${record.participant.id}, 'submitted', ${record.idempotencyKey}, now() + interval '30 minutes', now())
        returning id
      `;
      const inserted = await transaction<VoteRecord[]>`
        insert into votes (vote_session_id, survey_id, participant_id, user_id, property_id, status, idempotency_key, submitted_at)
        values (${voteSessions[0].id}, ${record.participant.surveyId}, ${record.participant.id}, ${record.participant.userId},
                ${record.participant.propertyId}, 'submitted', ${record.idempotencyKey}, now())
        returning id, survey_id as "surveyId", user_id as "userId", property_id as "propertyId", idempotency_key as "idempotencyKey"
      `;
      for (const answer of record.answers) {
        await transaction`
          insert into vote_answers (vote_id, question_id, choice)
          values (${inserted[0].id}, ${answer.questionId}, ${answer.choice})
        `;
        await transaction`
          insert into audit_logs (event_type, actor_user_id, subject_type, subject_id, request_id, outcome, metadata)
          values ('answer_changed', ${record.participant.userId}, 'vote', ${inserted[0].id}, ${record.requestId}, 'success',
                  ${transaction.json({ questionId: answer.questionId })})
        `;
      }
      await transaction`
        insert into audit_logs (event_type, actor_user_id, subject_type, subject_id, request_id, outcome, metadata)
        values ('vote_submitted', ${record.participant.userId}, 'vote', ${inserted[0].id}, ${record.requestId}, 'success',
                ${transaction.json({ surveyId: record.participant.surveyId, propertyId: record.participant.propertyId })})
      `;
      return inserted[0];
    });
  }

  async findOwnedVote(voteId: string, userId: string): Promise<VoteRecord | null> {
    const rows = await this.sql<VoteRecord[]>`
      select id, survey_id as "surveyId", user_id as "userId", property_id as "propertyId", idempotency_key as "idempotencyKey"
      from votes where id = ${voteId} and user_id = ${userId} limit 1
    `;
    return rows[0] ?? null;
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
