import "server-only";

import { createHash } from "node:crypto";

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
import type { CanonicalVote } from "@/src/domain/canonical-vote";
import type { FinalDocumentRecord, PublicDocumentVerification, VoteLifecycleRepository, CanonicalVoteSource, VisualSignatureRecord } from "@/src/application/ports/vote-lifecycle-repository";
import type { VoteState } from "@/src/domain/vote-lifecycle";
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

export class PostgresVotingRepository implements VotingRepository, VoteLifecycleRepository {
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
      select id from votes where survey_id = ${surveyId} and user_id = ${userId} and status <> 'voided'
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
      const existing = await transaction<{ id: string; status: VoteState }[]>`
        select id, status from votes where survey_id = ${participant.surveyId} and user_id = ${participant.userId}
          and property_id = ${participant.propertyId} and status <> 'voided' limit 1
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
        values (${record.authSessionId}, ${participant.id}, 'draft', ${record.idempotencyKey}, now() + interval '30 days') returning id
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
      const votes = await transaction<{ surveyId: string; status: VoteState; stateVersion: number; surveyStatus: string; startsAt: Date | null; closesAt: Date | null }[]>`
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
        status: VoteState; surveyId: string; propertyId: string; participantId: string;
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

  async loadCanonicalSource(voteId: string, userId: string): Promise<CanonicalVoteSource | null> {
    const rows = await this.sql<{
      id: string; surveyId: string; userId: string; propertyId: string; status: VoteState; stateVersion: number;
      surveyVersion: number; protocolNumber: string; participantReference: string; propertyReference: string;
      accountReference: string; city: string; street: string; building: string; unit: string; participantDisplayName: string;
    }[]>`
      select v.id, v.survey_id as "surveyId", v.user_id as "userId", v.property_id as "propertyId", v.status,
        v.state_version as "stateVersion", s.version as "surveyVersion", s.protocol_number as "protocolNumber",
        sp.id::text as "participantReference", coalesce(p.external_property_id, p.id::text) as "propertyReference",
        pa.account_number as "accountReference", p.city, p.street, p.building, p.premise as unit, u.display_name as "participantDisplayName"
      from votes v join surveys s on s.id = v.survey_id join survey_participants sp on sp.id = v.participant_id
      join users u on u.id = v.user_id join properties p on p.id = v.property_id
      left join personal_accounts pa on pa.id = sp.personal_account_id
      where v.id = ${voteId} and v.user_id = ${userId} limit 1
    `;
    const row = rows[0]; if (!row) return null;
    const questions = await this.sql<{ id: string; position: number; textRu: string; textKk: string | null; required: boolean; choice: VoteChoice | null }[]>`
      select q.id, q.position, q.text_ru as "textRu", q.text_kk as "textKk", q.required, a.choice
      from survey_questions q left join vote_answers a on a.question_id = q.id and a.vote_id = ${voteId}
      where q.survey_id = ${row.surveyId} and q.status = 'active' order by q.position
    `;
    return { vote: { id: row.id, surveyId: row.surveyId, userId: row.userId, propertyId: row.propertyId, status: row.status, stateVersion: row.stateVersion }, surveyVersion: row.surveyVersion, protocolNumber: row.protocolNumber, participantReference: row.participantReference, propertyReference: row.propertyReference, accountReference: row.accountReference, address: `г. ${row.city}, ул. ${row.street}, д. ${row.building}`, unit: row.unit, participantDisplayName: row.participantDisplayName, questions };
  }

  async freezeCanonical(input: { voteId: string; userId: string; canonical: CanonicalVote; canonicalSha256: string; requestId: string }): Promise<void> {
    const rows = await this.sql<{ id: string }[]>`
      update votes set status = 'ready_to_sign', canonical_payload = ${this.sql.json(input.canonical as never)}, canonical_sha256 = ${input.canonicalSha256}, ready_at = ${input.canonical.frozenAt}
      where id = ${input.voteId} and user_id = ${input.userId} and status = 'draft' returning id
    `;
    if (!rows[0]) throw new ApplicationError("invalid_vote_state", "Vote cannot be locked for signing");
    await this.sql`insert into audit_logs (event_type, actor_user_id, subject_type, subject_id, request_id, outcome, metadata) values ('VOTE_READY', ${input.userId}, 'vote', ${input.voteId}, ${input.requestId}, 'success', ${this.sql.json({ canonicalSha256: input.canonicalSha256 })})`;
  }

  async transition(input: { voteId: string; userId: string; from: VoteState; to: VoteState; requestId: string; signingProvider?: string; signedSha256?: string }): Promise<void> {
    const rows = await this.sql<{ id: string; voteSessionId: string }[]>`
      update votes set status = ${input.to}, signing_provider = coalesce(${input.signingProvider ?? null}, signing_provider),
        signed_sha256 = coalesce(${input.signedSha256 ?? null}, signed_sha256), signed_at = case when ${input.to} = 'signed' then now() else signed_at end
      where id = ${input.voteId} and user_id = ${input.userId} and status = ${input.from}
      returning id, vote_session_id as "voteSessionId"
    `;
    if (!rows[0]) throw new ApplicationError("invalid_vote_state", "Vote state changed concurrently or transition is invalid");
    await this.sql`update vote_sessions set status = ${input.to}, updated_at = now() where id = ${rows[0].voteSessionId}`;
    const eventType = input.to === "signing" ? "SIGNATURE_STARTED" : input.to === "signed" ? "SIGNATURE_COMPLETED" : `VOTE_${input.to.toUpperCase()}`;
    await this.sql`insert into audit_logs (event_type, actor_user_id, subject_type, subject_id, request_id, outcome, metadata) values (${eventType}, ${input.userId}, 'vote', ${input.voteId}, ${input.requestId}, 'success', ${this.sql.json({ from: input.from, to: input.to })})`;
  }

  async createOrGetSignatureRequest(input: { voteId: string; provider: string; providerRequestId: string; documentDigest: string; expiresAt: string }): Promise<{ id: string; providerRequestId: string }> {
    const existing = await this.sql<{ id: string; providerRequestId: string; documentDigest: string }[]>`select id, provider_request_id as "providerRequestId", document_digest as "documentDigest" from signature_requests where vote_id = ${input.voteId} and status in ('created','pending','verified') limit 1`;
    if (existing[0]) {
      if (existing[0].documentDigest !== input.documentDigest) throw new ApplicationError("idempotency_conflict", "Existing signing request uses another canonical hash");
      return { id: existing[0].id, providerRequestId: existing[0].providerRequestId };
    }
    const rows = await this.sql<{ id: string }[]>`
      insert into signature_requests (vote_session_id, vote_id, provider, provider_request_id, document_digest, status, expires_at)
      select vote_session_id, id, ${input.provider}, ${input.providerRequestId}, ${input.documentDigest}, 'pending', ${input.expiresAt} from votes where id = ${input.voteId} returning id
    `;
    return { id: rows[0].id, providerRequestId: input.providerRequestId };
  }

  async markSignatureVerified(input: { requestId: string; evidenceReference: string; evidence: Readonly<Record<string, unknown>> }): Promise<void> {
    await this.sql`update signature_requests set status = 'verified', evidence_reference = ${input.evidenceReference}, evidence = ${this.sql.json(input.evidence as never)}, completed_at = now(), updated_at = now() where id = ${input.requestId} and status in ('pending','verified')`;
  }

  async saveVisualSignature(input: { voteId: string; userId: string; storageKey: string; sha256: string; metadata: Readonly<Record<string, unknown>> }): Promise<VisualSignatureRecord> {
    const rows = await this.sql<{ id: string; voteId: string; storageKey: string; sha256: string; createdAt: Date }[]>`
      insert into visual_signatures (vote_id, storage_key, sha256, metadata)
      select ${input.voteId}, ${input.storageKey}, ${input.sha256}, ${this.sql.json(input.metadata as never)}
      where exists (select 1 from votes where id = ${input.voteId} and user_id = ${input.userId} and status = 'draft')
      on conflict (vote_id) do update set storage_key = excluded.storage_key, sha256 = excluded.sha256, metadata = excluded.metadata, created_at = now()
      returning id, vote_id as "voteId", storage_key as "storageKey", sha256, created_at as "createdAt"
    `;
    if (!rows[0]) throw new ApplicationError("invalid_vote_state", "Visual signature cannot be changed");
    return { ...rows[0], createdAt: rows[0].createdAt.toISOString() };
  }

  async getVisualSignature(voteId: string): Promise<VisualSignatureRecord | null> {
    const rows = await this.sql<{ id: string; voteId: string; storageKey: string; sha256: string; createdAt: Date }[]>`select id, vote_id as "voteId", storage_key as "storageKey", sha256, created_at as "createdAt" from visual_signatures where vote_id = ${voteId}`;
    return rows[0] ? { ...rows[0], createdAt: rows[0].createdAt.toISOString() } : null;
  }

  async findFinalDocument(voteId: string): Promise<FinalDocumentRecord | null> {
    const rows = await this.documentQuery(voteId); return rows[0] ? mapDocument(rows[0]) : null;
  }

  async getOwnedDocumentAsset(publicId: string, userId: string): Promise<{ storageKey: string; sha256: string } | null> {
    const rows = await this.sql<{ storageKey: string; sha256: string }[]>`
      select dv.storage_key as "storageKey", dv.sha256 from documents d
      join votes v on v.id=d.vote_id join document_versions dv on dv.document_id=d.id and dv.version=d.current_version
      where d.public_id=${publicId} and v.user_id=${userId} and d.status='generated' limit 1
    `;
    return rows[0] ?? null;
  }

  async completeDocument(input: { publicId: string; voteId: string; userId: string; authSessionId: string; submitIdempotencyKey: string; surveyId: string; surveyVersion: number; storageKey: string; sha256: string; canonicalSha256: string; signingProvider: string; verificationReference: string; sizeBytes: number; signatureRequestId: string; requestId: string }): Promise<FinalDocumentRecord> {
    await this.sql.begin(async (transaction) => {
      const existing = await transaction<{ id: string }[]>`select id from documents where vote_id = ${input.voteId} limit 1`;
      if (existing[0]) return;
      const votes = await transaction<{ status: VoteState; voteSessionId: string; canonicalSha256: string }[]>`select status, vote_session_id as "voteSessionId", canonical_sha256 as "canonicalSha256" from votes where id = ${input.voteId} and user_id = ${input.userId} for update`;
      if (!votes[0] || votes[0].status !== "signed" || votes[0].canonicalSha256 !== input.canonicalSha256) throw new ApplicationError("invalid_vote_state", "Only the signed canonical vote can be finalized");
      const docs = await transaction<{ id: string }[]>`insert into documents (public_id, vote_id, survey_id, document_type, status, current_version) values (${input.publicId}, ${input.voteId}, ${input.surveyId}, 'voting_sheet', 'generated', 1) returning id`;
      await transaction`insert into document_versions (document_id, version, survey_version, storage_key, content_type, sha256, canonical_sha256, signing_provider, signing_status, verification_reference, size_bytes) values (${docs[0].id}, 1, ${input.surveyVersion}, ${input.storageKey}, 'application/pdf', ${input.sha256}, ${input.canonicalSha256}, ${input.signingProvider}, 'finalized', ${input.verificationReference}, ${input.sizeBytes})`;
      await transaction`update signature_requests set status = 'finalized', updated_at = now() where id = ${input.signatureRequestId} and status = 'verified'`;
      await transaction`update votes set status = 'submitted', submit_idempotency_key = ${input.submitIdempotencyKey}, submitted_at = now() where id = ${input.voteId}`;
      await transaction`update vote_sessions set status = 'submitted', auth_session_id = ${input.authSessionId}, submitted_at = now(), updated_at = now() where id = ${votes[0].voteSessionId}`;
      await transaction`insert into audit_logs (event_type, actor_user_id, subject_type, subject_id, request_id, outcome, metadata) values ('DOCUMENT_GENERATED', ${input.userId}, 'document', ${docs[0].id}, ${input.requestId}, 'success', ${transaction.json({ voteId: input.voteId, sha256: input.sha256 })})`;
      await transaction`insert into audit_logs (event_type, actor_user_id, subject_type, subject_id, request_id, outcome, metadata) values ('VOTE_SUBMITTED', ${input.userId}, 'vote', ${input.voteId}, ${input.requestId}, 'success', ${transaction.json({ surveyId: input.surveyId })})`;
    });
    const document = await this.findFinalDocument(input.voteId); if (!document) throw new ApplicationError("document_failed", "Final document was not persisted"); return document;
  }

  async getPublicVerification(publicId: string): Promise<PublicDocumentVerification | null> {
    const rows = await this.sql<{ publicId: string; protocolNumber: string; createdAt: Date; documentStatus: string; signingStatus: string; sha256: string; assetSha256: string; bytes: Buffer }[]>`
      select d.public_id as "publicId", s.protocol_number as "protocolNumber", dv.created_at as "createdAt", d.status as "documentStatus", dv.signing_status as "signingStatus", dv.sha256, ba.sha256 as "assetSha256", ba.bytes
      from documents d join document_versions dv on dv.document_id = d.id and dv.version = d.current_version
      join surveys s on s.id = d.survey_id join binary_assets ba on ba.storage_key = dv.storage_key where d.public_id = ${publicId} limit 1
    `;
    const row = rows[0]; if (!row) return null;
    return { publicId: row.publicId, protocolNumber: row.protocolNumber, createdAt: row.createdAt.toISOString(), documentStatus: row.documentStatus, signingStatus: row.signingStatus, sha256: row.sha256, integrityValid: createHash("sha256").update(row.bytes).digest("hex") === row.sha256 && row.assetSha256 === row.sha256 };
  }

  private documentQuery(voteId: string) {
    return this.sql<{ documentId: string; publicId: string; version: number; voteId: string; storageKey: string; sha256: string; canonicalSha256: string; signingProvider: string; signingStatus: string; createdAt: Date }[]>`
      select d.id as "documentId", d.public_id as "publicId", dv.version, d.vote_id as "voteId", dv.storage_key as "storageKey", dv.sha256, dv.canonical_sha256 as "canonicalSha256", dv.signing_provider as "signingProvider", dv.signing_status as "signingStatus", dv.created_at as "createdAt"
      from documents d join document_versions dv on dv.document_id = d.id and dv.version = d.current_version where d.vote_id = ${voteId} limit 1
    `;
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

function mapDocument(row: { documentId: string; publicId: string; version: number; voteId: string; storageKey: string; sha256: string; canonicalSha256: string; signingProvider: string; signingStatus: string; createdAt: Date }): FinalDocumentRecord {
  return { ...row, createdAt: row.createdAt.toISOString() };
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
