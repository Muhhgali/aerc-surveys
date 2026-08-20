import "server-only";

import type postgres from "postgres";

import { ApplicationError } from "@/src/application/errors";
import type {
  AdminRepository, AdminSurveyDetail, AdminSurveySummary, OrganizationUserInput, PageQuery, PageResult, SurveyDraftInput, SurveyTargetInput, TenantScope,
} from "@/src/application/ports/admin-repository";
import type { AdminPrincipal, OrganizationGrant, PlatformPermission, PlatformRoleKey } from "@/src/domain/admin-rbac";
import { organizationRolePermissionMatrix, unionPermissions } from "@/src/domain/admin-rbac";
import type { OrganizationAccessRoleKey } from "@/src/domain/organization-access";
import type { OrganizationCreateInput, OrganizationUpdateInput } from "@/src/domain/organization";
import { formatBuildingAddress, protocolDocumentTimestamp } from "@/src/domain/official-document-template";
import { parseSignaturePolicy, deriveSigningState, signaturePolicyFulfilled, type SurveySignatoryRoleKey } from "@/src/domain/signature-policy";
import { assertSurveyTransition, createSurveySnapshot, validateForPublish, type PublishableSurvey, type SurveyStatus } from "@/src/domain/survey-management";
import { decorateChoiceCounts, defaultVotingRule, parseVotingRule, type VotingRule } from "@/src/domain/voting-rules";
import { persistClosedSurvey, ensureDueSurveyWindows, ensureSurveyWindow } from "@/src/infrastructure/database/survey-window";
import { hashSessionToken } from "@/src/application/session/session-service";
import { createHash } from "node:crypto";
import { randomBytes } from "node:crypto";
import type { DatabaseClient } from "@/src/infrastructure/database/client";
import { availableSurveysSql, materializeSurveyParticipantsSql, ownerDocumentsSql } from "@/src/infrastructure/database/targeting-sql";

type Sql = DatabaseClient;
type Tx = postgres.TransactionSql;
type SurveyRow = {
  id: string; organizationId: string; protocolNumber: string; version: number; lockVersion: number; titleRu: string; titleKk: string | null;
  descriptionRu: string; descriptionKk: string; status: SurveyStatus; startsAt: Date | null; closesAt: Date | null; createdAt: Date;
  questionCount: number; eligibleCount: number; completedCount: number;
};

const iso = (value: Date | string | null) => value ? new Date(value).toISOString() : null;
const page = (query: PageQuery) => ({ size: Math.min(Math.max(query.pageSize || 20, 1), 100), offset: (Math.max(query.page || 1, 1) - 1) * Math.min(Math.max(query.pageSize || 20, 1), 100) });
function withoutTotal(row: Record<string, unknown> & { total: number }) { const result: Record<string, unknown> = { ...row }; delete result.total; return result; }

export class PostgresAdminRepository implements AdminRepository {
  constructor(private readonly sql: Sql) {}

  async getPrincipal(userId: string): Promise<AdminPrincipal | null> {
    const rows = await this.sql<{ userId: string; displayName: string; roles: PlatformRoleKey[]; permissions: PlatformPermission[] }[]>`
      select u.id as "userId", u.display_name as "displayName",
        coalesce(array_agg(distinct pr.role_key) filter (where pr.role_key is not null), '{}') as roles,
        coalesce(array_agg(distinct rp.permission_key) filter (where rp.permission_key is not null), '{}') as permissions
      from users u
      left join platform_access_controls pac on pac.user_id = u.id
      left join user_platform_roles upr on upr.user_id = u.id
      left join platform_roles pr on pr.id = upr.role_id
      left join role_permissions rp on rp.role_id = pr.id
      where u.id = ${userId} and u.status = 'active' and pac.disabled_at is null
      group by u.id, u.display_name
    `;
    if (!rows[0]) return null;
    let grants: { organizationId: string; roleKey: OrganizationAccessRoleKey; permissions: string[] }[] = [];
    try {
      grants = await this.sql<{ organizationId: string; roleKey: OrganizationAccessRoleKey; permissions: string[] }[]>`
        select organization_id as "organizationId", role_key as "roleKey", permissions from organization_access_grants where user_id=${userId}
      `;
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? String((error as { code?: string }).code ?? "") : "";
      if (code !== "42P01") throw error;
    }
    const organizationGrants: OrganizationGrant[] = grants.map((grant) => {
      const base = organizationRolePermissionMatrix[grant.roleKey] ?? [];
      const extra = (grant.permissions ?? []) as PlatformPermission[];
      return { organizationId: grant.organizationId, role: grant.roleKey, permissions: unionPermissions(base, extra) };
    });
    const orgPermissions = organizationGrants.flatMap((grant) => grant.permissions);
    const platformWide = rows[0].roles.includes("super_admin") || rows[0].roles.includes("admin");
    const permissions = unionPermissions(rows[0].permissions, orgPermissions);
    if (!permissions.includes("admin.access") && !platformWide) return null;
    return { userId: rows[0].userId, displayName: rows[0].displayName, roles: rows[0].roles, permissions, platformPermissions: rows[0].permissions, organizationGrants, platformWide };
  }

  async adminOwnsPermission(userId: string, permission: PlatformPermission) {
    return Boolean((await this.getPrincipal(userId))?.permissions.includes(permission));
  }

  async dashboard(scope: TenantScope): Promise<Record<string, unknown>> {
    await ensureDueSurveyWindows(this.sql, "survey-window");
    const orgs = scope ?? null;
    const [surveys, participants, documents, activity] = await Promise.all([
      this.sql<Record<string, number>[]>`select count(*) filter (where status='draft')::int as draft, count(*) filter (where status='scheduled')::int as scheduled, count(*) filter (where status='active')::int as active, count(*) filter (where status='closed')::int as closed from surveys s where ${orgs}::uuid[] is null or s.organization_id = any(${orgs}::uuid[])`,
      this.sql<{ eligible: number; started: number; completed: number }[]>`select count(*) filter (where sp.status='eligible')::int as eligible, count(distinct v.id) filter (where v.status <> 'voided')::int as started, count(distinct v.id) filter (where v.status='submitted')::int as completed from survey_participants sp join surveys s on s.id=sp.survey_id left join votes v on v.participant_id=sp.id where ${orgs}::uuid[] is null or s.organization_id = any(${orgs}::uuid[])`,
      this.sql<{ finalized: number }[]>`select count(*)::int as finalized from documents d join surveys s on s.id=d.survey_id where d.status='generated' and (${orgs}::uuid[] is null or s.organization_id = any(${orgs}::uuid[]))`,
      orgs
        ? this.sql<Record<string, unknown>[]>`select al.id, al.event_type as "eventType", al.outcome, al.request_id as "requestId", al.occurred_at as "occurredAt", u.display_name as actor from audit_logs al left join users u on u.id=al.actor_user_id join surveys s on s.id=al.subject_id and al.subject_type='survey' where s.organization_id = any(${orgs}::uuid[]) order by al.occurred_at desc limit 8`
        : this.sql<Record<string, unknown>[]>`select al.id, al.event_type as "eventType", al.outcome, al.request_id as "requestId", al.occurred_at as "occurredAt", u.display_name as actor from audit_logs al left join users u on u.id=al.actor_user_id order by al.occurred_at desc limit 8`,
    ]);
    const p = participants[0] ?? { eligible: 0, started: 0, completed: 0 };
    return { surveys: surveys[0] ?? {}, participants: p, participationPercent: p.eligible ? Math.round(p.completed * 10000 / p.eligible) / 100 : 0, documents: documents[0] ?? { finalized: 0 }, activity };
  }

  async listSurveys(query: PageQuery & { status?: SurveyStatus; from?: Date; to?: Date }, scope: TenantScope): Promise<PageResult<AdminSurveySummary>> {
    await ensureDueSurveyWindows(this.sql, "survey-window");
    const { size, offset } = page(query); const search = query.search?.trim() || null; const status = query.status ?? null;
    const from = query.from ?? null; const to = query.to ?? null; const orgs = scope ?? null;
    const rows = await this.sql<(SurveyRow & { total: number })[]>`
      select s.id, s.organization_id as "organizationId", s.protocol_number as "protocolNumber", s.version, s.lock_version as "lockVersion",
        s.title_ru as "titleRu", s.title_kk as "titleKk", s.description_ru as "descriptionRu", s.description_kk as "descriptionKk",
        s.status, s.starts_at as "startsAt", s.closes_at as "closesAt", s.created_at as "createdAt",
        count(distinct q.id)::int as "questionCount", count(distinct sp.id) filter (where sp.status='eligible')::int as "eligibleCount",
        count(distinct v.id) filter (where v.status='submitted')::int as "completedCount", count(*) over()::int as total
      from surveys s left join survey_questions q on q.survey_id=s.id and q.status='active'
      left join survey_participants sp on sp.survey_id=s.id left join votes v on v.survey_id=s.id
      where (${search}::text is null or s.title_ru ilike '%'||${search}||'%' or coalesce(s.title_kk,'') ilike '%'||${search}||'%' or s.protocol_number ilike '%'||${search}||'%')
        and (${status}::text is null or s.status::text=${status}) and (${from}::timestamptz is null or s.starts_at >= ${from}) and (${to}::timestamptz is null or s.starts_at <= ${to})
        and (${orgs}::uuid[] is null or s.organization_id = any(${orgs}::uuid[]))
      group by s.id order by s.created_at desc limit ${size} offset ${offset}
    `;
    return { items: rows.map(this.summary), page: Math.floor(offset / size) + 1, pageSize: size, total: rows[0]?.total ?? 0 };
  }

  private summary = (row: SurveyRow): AdminSurveySummary => ({
    id: row.id, organizationId: row.organizationId, titleRu: row.titleRu, titleKk: row.titleKk, protocolNumber: row.protocolNumber, status: row.status, version: row.version,
    lockVersion: row.lockVersion, startsAt: iso(row.startsAt), closesAt: iso(row.closesAt), createdAt: iso(row.createdAt)!, questionCount: row.questionCount, eligibleCount: row.eligibleCount, completedCount: row.completedCount,
  });

  /**
   * `executor` must be supplied when the caller already holds a transaction on this survey:
   * reading through the pool instead would block on its own row lock until the statement timeout.
   */
  async getSurvey(id: string, executor?: Tx): Promise<AdminSurveyDetail | null> {
    const sql = executor ?? this.sql;
    if (!executor) await ensureSurveyWindow(this.sql, id, null, "survey-window");
    const rows = await sql<SurveyRow[]>`
      select s.id, s.organization_id as "organizationId", s.protocol_number as "protocolNumber", s.version, s.lock_version as "lockVersion",
        s.title_ru as "titleRu", s.title_kk as "titleKk", s.description_ru as "descriptionRu", s.description_kk as "descriptionKk", s.status,
        s.starts_at as "startsAt", s.closes_at as "closesAt", s.created_at as "createdAt",
        (select count(*)::int from survey_questions q where q.survey_id=s.id and q.status='active') as "questionCount",
        (select count(*)::int from survey_participants sp where sp.survey_id=s.id and sp.status='eligible') as "eligibleCount",
        (select count(*)::int from votes v where v.survey_id=s.id and v.status='submitted') as "completedCount"
      from surveys s where s.id=${id} limit 1
    `;
    if (!rows[0]) return null;
    const [questions, targets, signatories, policy, signatures, protocol] = await Promise.all([
      sql<{ id: string; position: number; textRu: string; textKk: string | null; required: boolean; votingRule: Record<string, unknown> }[]>`select id, position, text_ru as "textRu", text_kk as "textKk", required, voting_rule as "votingRule" from survey_questions where survey_id=${id} and status='active' order by position`,
      sql<AdminSurveyDetail["targets"]>`select id, target_type as type, organization_id as "organizationId", property_id as "propertyId", personal_account_id as "personalAccountId", city, street, building from survey_targets where survey_id=${id} order by created_at`,
      sql<{ id: string; userId: string; roleKey: SurveySignatoryRoleKey; displayName: string; email: string | null; signedAt: Date | null }[]>`
        select ss.id, ss.user_id as "userId", ss.role_key as "roleKey", ss.display_name as "displayName", u.email, os.signed_at as "signedAt"
        from survey_signatories ss join users u on u.id=ss.user_id
        left join official_signatures os on os.signatory_id=ss.id
        where ss.survey_id=${id} order by ss.created_at`,
      sql<{ roleKey: string; minRequired: number }[]>`select role_key as "roleKey", min_required as "minRequired" from survey_signature_policies where survey_id=${id}`,
      sql<{ roleKey: SurveySignatoryRoleKey }[]>`select role_key as "roleKey" from official_signatures where survey_id=${id}`,
      sql<{ publicId: string }[]>`select public_id as "publicId" from documents where survey_id=${id} and document_type='protocol' and status='generated' limit 1`,
    ]);
    const assigned = new Map<string, number>();
    for (const row of signatories) assigned.set(row.roleKey, (assigned.get(row.roleKey) ?? 0) + 1);
    const signaturePolicy = policy.map((row) => ({ roleKey: row.roleKey as SurveySignatoryRoleKey, minRequired: row.minRequired, assignedCount: assigned.get(row.roleKey) ?? 0 }));
    const meeting = await sql<{ meetingForm: AdminSurveyDetail["meetingForm"]; documentLanguage: AdminSurveyDetail["documentLanguage"] }[]>`select meeting_form as "meetingForm", document_language as "documentLanguage" from surveys where id=${id}`;
    return {
      ...this.summary(rows[0]), organizationId: rows[0].organizationId, descriptionRu: rows[0].descriptionRu, descriptionKk: rows[0].descriptionKk,
      meetingForm: meeting[0]?.meetingForm, documentLanguage: meeting[0]?.documentLanguage,
      questions: questions.map((question) => ({ ...question, votingRule: parseVotingRule(question.votingRule) })),
      targets, signatories: signatories.map((row) => ({ ...row, signedAt: row.signedAt ? row.signedAt.toISOString() : null })), signaturePolicy,
      protocolPublicId: protocol[0]?.publicId ?? null,
      signingState: deriveSigningState({ surveyStatus: rows[0].status, policy: signaturePolicy, signatures, protocolReady: Boolean(protocol[0]) }),
    };
  }

  async createSurvey(input: SurveyDraftInput, actorId: string, requestId: string) {
    const result = await this.sql.begin(async (tx) => {
      const organizationId = input.organizationId ?? (await tx<{ id: string }[]>`select id from organizations where status='active' order by created_at limit 1`)[0]?.id;
      if (!organizationId) throw new ApplicationError("invalid_request", "An active organization is required");
      const rows = await tx<{ id: string }[]>`insert into surveys (organization_id, protocol_number, title_ru, title_kk, description_ru, description_kk, starts_at, closes_at, meeting_form, document_language, status) values (${organizationId}, ${input.protocolNumber.trim()}, ${input.titleRu.trim()}, ${input.titleKk.trim()}, ${input.descriptionRu.trim()}, ${input.descriptionKk.trim()}, ${input.startsAt}, ${input.closesAt}, ${input.meetingForm ?? "electronic"}, ${input.documentLanguage ?? "ru"}, 'draft') returning id`;
      await this.auditTx(tx, "SURVEY_CREATED", actorId, "survey", rows[0].id, requestId, { protocolNumber: input.protocolNumber.trim() });
      return rows[0].id;
    });
    return (await this.getSurvey(result))!;
  }

  async updateSurvey(id: string, input: SurveyDraftInput, expected: number, actorId: string, requestId: string) {
    await this.sql.begin(async (tx) => {
      const rows = await tx<{ id: string }[]>`update surveys set protocol_number=${input.protocolNumber.trim()}, title_ru=${input.titleRu.trim()}, title_kk=${input.titleKk.trim()}, description_ru=${input.descriptionRu.trim()}, description_kk=${input.descriptionKk.trim()}, starts_at=${input.startsAt}, closes_at=${input.closesAt}, meeting_form=${input.meetingForm ?? "electronic"}, document_language=${input.documentLanguage ?? "ru"}, organization_id=coalesce(${input.organizationId ?? null}, organization_id), lock_version=lock_version+1, updated_at=now() where id=${id} and status='draft' and lock_version=${expected} returning id`;
      if (!rows[0]) await this.throwDraftOrConflict(tx, id, expected);
      await this.auditTx(tx, "SURVEY_UPDATED", actorId, "survey", id, requestId, { lockVersion: expected + 1 });
    });
    return (await this.getSurvey(id))!;
  }

  async addQuestion(surveyId: string, input: { textRu: string; textKk: string; required: boolean; votingRule?: VotingRule }, actorId: string, requestId: string) {
    await this.sql.begin(async (tx) => {
      await this.lockDraft(tx, surveyId);
      const rule = parseVotingRule(input.votingRule ?? defaultVotingRule);
      const rows = await tx<{ id: string }[]>`insert into survey_questions (survey_id, position, text_ru, text_kk, required, voting_rule) values (${surveyId}, (select coalesce(max(position),0)+1 from survey_questions where survey_id=${surveyId}), ${input.textRu.trim()}, ${input.textKk.trim()}, ${input.required}, ${tx.json(rule as never)}) returning id`;
      await tx`update surveys set lock_version=lock_version+1, updated_at=now() where id=${surveyId}`;
      await this.auditTx(tx, "QUESTION_CREATED", actorId, "survey", surveyId, requestId, { questionId: rows[0].id });
    });
    return (await this.getSurvey(surveyId))!;
  }

  async updateQuestion(surveyId: string, questionId: string, input: { textRu: string; textKk: string; required: boolean; votingRule?: VotingRule }, actorId: string, requestId: string) {
    await this.sql.begin(async (tx) => {
      await this.lockDraft(tx, surveyId);
      const rule = parseVotingRule(input.votingRule ?? defaultVotingRule);
      const rows = await tx`update survey_questions set text_ru=${input.textRu.trim()}, text_kk=${input.textKk.trim()}, required=${input.required}, voting_rule=${tx.json(rule as never)}, updated_at=now() where id=${questionId} and survey_id=${surveyId}`;
      if (!rows.count) throw new ApplicationError("not_found", "Question was not found");
      await tx`update surveys set lock_version=lock_version+1, updated_at=now() where id=${surveyId}`;
      await this.auditTx(tx, "QUESTION_UPDATED", actorId, "survey", surveyId, requestId, { questionId });
    });
    return (await this.getSurvey(surveyId))!;
  }

  async deleteQuestion(surveyId: string, questionId: string, actorId: string, requestId: string) {
    await this.sql.begin(async (tx) => {
      await this.lockDraft(tx, surveyId);
      const current = await tx<{ position: number }[]>`delete from survey_questions where id=${questionId} and survey_id=${surveyId} returning position`;
      if (!current[0]) throw new ApplicationError("not_found", "Question was not found");
      await tx`update survey_questions set position=position-1, updated_at=now() where survey_id=${surveyId} and position>${current[0].position}`;
      await tx`update surveys set lock_version=lock_version+1, updated_at=now() where id=${surveyId}`;
      await this.auditTx(tx, "QUESTION_REMOVED", actorId, "survey", surveyId, requestId, { questionId });
    });
    return (await this.getSurvey(surveyId))!;
  }

  async duplicateQuestion(surveyId: string, questionId: string, actorId: string, requestId: string) {
    await this.sql.begin(async (tx) => {
      await this.lockDraft(tx, surveyId);
      const source = await tx<{ position: number; textRu: string; textKk: string | null; required: boolean }[]>`select position, text_ru as "textRu", text_kk as "textKk", required from survey_questions where id=${questionId} and survey_id=${surveyId}`;
      if (!source[0]) throw new ApplicationError("not_found", "Question was not found");
      await tx`update survey_questions set position=position+1 where survey_id=${surveyId} and position>${source[0].position}`;
      const copy = await tx<{ id: string }[]>`insert into survey_questions (survey_id, position, text_ru, text_kk, required) values (${surveyId}, ${source[0].position + 1}, ${source[0].textRu}, ${source[0].textKk}, ${source[0].required}) returning id`;
      await tx`update surveys set lock_version=lock_version+1, updated_at=now() where id=${surveyId}`;
      await this.auditTx(tx, "QUESTION_CREATED", actorId, "survey", surveyId, requestId, { questionId: copy[0].id, duplicatedFrom: questionId });
    });
    return (await this.getSurvey(surveyId))!;
  }

  async moveQuestion(surveyId: string, questionId: string, direction: "up" | "down", actorId: string, requestId: string) {
    await this.sql.begin(async (tx) => {
      await this.lockDraft(tx, surveyId);
      const rows = await tx<{ position: number }[]>`select position from survey_questions where id=${questionId} and survey_id=${surveyId} for update`;
      if (!rows[0]) throw new ApplicationError("not_found", "Question was not found");
      const next = rows[0].position + (direction === "up" ? -1 : 1); if (next < 1) return;
      const other = await tx<{ id: string }[]>`select id from survey_questions where survey_id=${surveyId} and position=${next} for update`;
      if (!other[0]) return;
      await tx`update survey_questions set position=2147483647 where id=${questionId}`;
      await tx`update survey_questions set position=${rows[0].position} where id=${other[0].id}`;
      await tx`update survey_questions set position=${next} where id=${questionId}`;
      await tx`update surveys set lock_version=lock_version+1, updated_at=now() where id=${surveyId}`;
      await this.auditTx(tx, "QUESTION_UPDATED", actorId, "survey", surveyId, requestId, { questionId, direction });
    });
    return (await this.getSurvey(surveyId))!;
  }

  async replaceTargets(surveyId: string, targets: SurveyTargetInput[], actorId: string, requestId: string) {
    await this.sql.begin(async (tx) => {
      await this.lockDraft(tx, surveyId); await tx`delete from survey_targets where survey_id=${surveyId}`;
      for (const target of targets) {
        await tx`insert into survey_targets (survey_id, target_type, organization_id, property_id, personal_account_id, city, street, building) values (${surveyId}, ${target.type}, ${target.organizationId ?? null}, ${target.propertyId ?? null}, ${target.personalAccountId ?? null}, ${target.city?.trim() ?? null}, ${target.street?.trim() ?? null}, ${target.building?.trim() ?? null})`;
      }
      await tx`update surveys set lock_version=lock_version+1, updated_at=now() where id=${surveyId}`;
      await this.auditTx(tx, "TARGET_UPDATED", actorId, "survey", surveyId, requestId, { count: targets.length });
    });
    return (await this.getSurvey(surveyId))!;
  }

  async loadPublishableSurvey(id: string, executor?: Tx): Promise<PublishableSurvey | null> {
    const survey = await this.getSurvey(id, executor); if (!survey) return null;
    return {
      id: survey.id, version: survey.version, protocolNumber: survey.protocolNumber, titleRu: survey.titleRu, titleKk: survey.titleKk,
      descriptionRu: survey.descriptionRu, descriptionKk: survey.descriptionKk, startsAt: survey.startsAt ? new Date(survey.startsAt) : null,
      closesAt: survey.closesAt ? new Date(survey.closesAt) : null, meetingForm: survey.meetingForm ?? "electronic",
      documentLanguage: survey.documentLanguage ?? "ru",
      questions: survey.questions.map((question) => ({ ...question, votingRule: parseVotingRule(question.votingRule) })),
      targets: survey.targets, signatories: survey.signatories ?? [], signaturePolicy: survey.signaturePolicy ?? [],
    };
  }

  async publishSurvey(id: string, actorId: string, requestId: string) {
    await this.sql.begin(async (tx) => {
      const status = await tx<{ status: SurveyStatus }[]>`select status from surveys where id=${id} for update`;
      if (!status[0]) throw new ApplicationError("not_found", "Survey was not found");
      if (status[0].status !== "draft") throw new ApplicationError("invalid_survey", "Only a draft can be published");
      const details = await this.loadPublishableSurvey(id, tx); if (!details) throw new ApplicationError("not_found", "Survey was not found");
      validateForPublish(details); const frozen = createSurveySnapshot(details);
      await tx`insert into survey_versions (survey_id, version, snapshot, sha256, published_by_user_id) values (${id}, ${details.version}, ${tx.json(frozen.snapshot as postgres.JSONValue)}, ${frozen.sha256}, ${actorId})`;
      const nextStatus = details.startsAt! > new Date() ? "scheduled" : "active";
      await tx`update surveys set status=${nextStatus}, published_at=now(), updated_at=now() where id=${id}`;
      await tx.unsafe(materializeSurveyParticipantsSql, [id]);
      await this.auditTx(tx, "SURVEY_PUBLISHED", actorId, "survey", id, requestId, { version: details.version, sha256: frozen.sha256, status: nextStatus });
    });
    return (await this.getSurvey(id))!;
  }

  async transitionSurvey(id: string, to: "closed" | "archived", actorId: string, requestId: string) {
    await this.sql.begin(async (tx) => {
      const rows = await tx<{ status: SurveyStatus }[]>`select status from surveys where id=${id} for update`;
      if (!rows[0]) throw new ApplicationError("not_found", "Survey was not found"); assertSurveyTransition(rows[0].status, to);
      if (to === "closed") await persistClosedSurvey(tx, id, actorId, requestId, false);
      else {
        await tx`update surveys set status=${to}, updated_at=now() where id=${id}`;
        await this.auditTx(tx, "SURVEY_ARCHIVED", actorId, "survey", id, requestId, {});
      }
    });
    return (await this.getSurvey(id))!;
  }

  async results(id: string): Promise<Record<string, unknown> | null> {
    const snapshot = await this.sql<{ snapshot: Record<string, unknown>; sha256: string }[]>`select snapshot, sha256 from survey_result_snapshots where survey_id=${id} limit 1`;
    const survey = await this.getSurvey(id); if (!survey) return null;
    if (snapshot[0]) {
      const sealed = snapshot[0].snapshot;
      const eligible = Number(sealed.eligibleTotal ?? survey.eligibleCount);
      const completed = Number(sealed.participated ?? survey.completedCount);
      return {
        survey: this.summary({ ...survey, startsAt: survey.startsAt ? new Date(survey.startsAt) : null, closesAt: survey.closesAt ? new Date(survey.closesAt) : null, createdAt: new Date(survey.createdAt), descriptionRu: survey.descriptionRu, descriptionKk: survey.descriptionKk } as SurveyRow),
        sealed: true, sha256: snapshot[0].sha256, ...sealed,
        questions: Array.isArray(sealed.questions) ? (sealed.questions as Record<string, unknown>[]).map((question) => ({
          ...question,
          ...decorateChoiceCounts({ for: Number(question.for ?? 0), against: Number(question.against ?? 0), abstain: Number(question.abstain ?? 0) }),
        })) : sealed.questions,
        participation: { eligible, started: completed, completed, percent: eligible ? Math.round(completed * 10000 / eligible) / 100 : 0 },
      };
    }
    const rows = await this.sql<Record<string, unknown>[]>`
      select q.id as "questionId", q.position, q.text_ru as "textRu", q.text_kk as "textKk",
        count(*) filter (where va.choice='for')::int as "for", count(*) filter (where va.choice='against')::int as "against",
        count(*) filter (where va.choice='abstain')::int as "abstain", count(va.vote_id)::int as total
      from survey_questions q left join votes v on v.survey_id=q.survey_id and v.status='submitted'
      left join vote_answers va on va.vote_id=v.id and va.question_id=q.id where q.survey_id=${id} and q.status='active'
      group by q.id order by q.position
    `;
    const eligible = survey.eligibleCount; const completed = survey.completedCount;
    const questions = rows.map((row) => {
      const decorated = decorateChoiceCounts({ for: Number(row.for ?? 0), against: Number(row.against ?? 0), abstain: Number(row.abstain ?? 0) });
      return { ...row, ...decorated };
    });
    return { survey: this.summary({ ...survey, startsAt: survey.startsAt ? new Date(survey.startsAt) : null, closesAt: survey.closesAt ? new Date(survey.closesAt) : null, createdAt: new Date(survey.createdAt), descriptionRu: survey.descriptionRu, descriptionKk: survey.descriptionKk } as SurveyRow), participation: { eligible, started: await this.startedCount(id), completed, percent: eligible ? Math.round(completed * 10000 / eligible) / 100 : 0 }, questions };
  }

  private async startedCount(id: string) { const rows = await this.sql<{ count: number }[]>`select count(*)::int as count from votes where survey_id=${id} and status <> 'voided'`; return rows[0]?.count ?? 0; }

  async participants(id: string, query: PageQuery, includePii: boolean): Promise<PageResult<Record<string, unknown>>> {
    const { size, offset } = page(query); const search = query.search?.trim() || null;
    const rows = await this.sql<(Record<string, unknown> & { total: number })[]>`
      select sp.id as "participantReference", u.display_name as "fullName", concat(p.city, ', ', p.street, ' ', p.building, ', ', p.premise) as property,
        case when ${includePii} then coalesce(pa.account_number,'') else case when pa.account_number is null then '' else concat('••••',right(pa.account_number,4)) end end as account,
        sp.status as eligibility, coalesce(v.status::text,'not_started') as "voteState", v.created_at as "startedAt", v.submitted_at as "submittedAt", d.public_id as "documentId", count(*) over()::int as total
      from survey_participants sp join users u on u.id=sp.user_id join properties p on p.id=sp.property_id left join personal_accounts pa on pa.id=sp.personal_account_id
      left join votes v on v.participant_id=sp.id and v.status <> 'voided' left join documents d on d.vote_id=v.id and d.status='generated'
      where sp.survey_id=${id} and (${search}::text is null or sp.id::text ilike '%'||${search}||'%' or u.display_name ilike '%'||${search}||'%' or p.street ilike '%'||${search}||'%' or right(coalesce(pa.account_number,''),4) ilike '%'||${search}||'%')
      order by sp.created_at desc limit ${size} offset ${offset}
    `;
    return { items: rows.map(withoutTotal), page: Math.floor(offset / size) + 1, pageSize: size, total: rows[0]?.total ?? 0 };
  }

  async documents(query: PageQuery & { status?: string }, scope: TenantScope): Promise<PageResult<Record<string, unknown>>> {
    const { size, offset } = page(query); const search=query.search?.trim()||null; const status=query.status||null; const orgs=scope??null;
    const rows = await this.sql<(Record<string, unknown> & { total: number })[]>`
      select d.public_id as "documentId", d.survey_id as "surveyId", s.title_ru as survey, s.protocol_number as protocol, dv.survey_version as version,
        d.created_at as "createdAt", dv.signing_provider as "signingProvider", dv.signing_status as "signingStatus",
        case when ba.sha256=dv.sha256 then 'valid' else 'invalid' end as "integrityStatus", count(*) over()::int as total
      from documents d join surveys s on s.id=d.survey_id join document_versions dv on dv.document_id=d.id and dv.version=d.current_version left join binary_assets ba on ba.storage_key=dv.storage_key
      where (${search}::text is null or d.public_id::text ilike '%'||${search}||'%' or s.protocol_number ilike '%'||${search}||'%' or s.title_ru ilike '%'||${search}||'%') and (${status}::text is null or dv.signing_status::text=${status})
        and (${orgs}::uuid[] is null or s.organization_id = any(${orgs}::uuid[]))
      order by d.created_at desc limit ${size} offset ${offset}
    `;
    return { items: rows.map(withoutTotal), page: Math.floor(offset/size)+1, pageSize:size, total:rows[0]?.total??0 };
  }

  async document(id: string, scope: TenantScope) {
    const orgs = scope ?? null;
    const rows = await this.sql<Record<string, unknown>[]>`
      select d.public_id as "documentId", d.survey_id as "surveyId", s.title_ru as survey, s.protocol_number as protocol, dv.survey_version as "surveyVersion", d.vote_id as "voteReference",
        coalesce(p.external_property_id,p.id::text) as "propertyReference", dv.created_at as "generatedAt", dv.signing_provider as "signingProvider", dv.signing_status as "signingStatus", dv.sha256,
        case when ba.sha256=dv.sha256 then 'valid' else 'invalid' end as integrity, dv.verification_reference as "verificationLink"
      from documents d join surveys s on s.id=d.survey_id join document_versions dv on dv.document_id=d.id and dv.version=d.current_version
      left join votes v on v.id=d.vote_id left join properties p on p.id=v.property_id left join binary_assets ba on ba.storage_key=dv.storage_key
      where d.public_id=${id} and (${orgs}::uuid[] is null or s.organization_id = any(${orgs}::uuid[])) limit 1
    `; return rows[0] ?? null;
  }

  async audit(query: PageQuery & { eventType?: string; requestId?: string; subjectType?: string; subjectId?: string; from?: Date; to?: Date }): Promise<PageResult<Record<string, unknown>>> {
    const {size,offset}=page(query); const search=query.search?.trim()||null; const event=query.eventType||null; const request=query.requestId||null; const subjectType=query.subjectType||null; const subjectId=query.subjectId||null;
    const rows=await this.sql<(Record<string, unknown>&{total:number})[]>`
      select al.id, al.event_type as "eventType", u.display_name as actor, al.subject_type as "subjectType", al.subject_id as "subjectId", al.request_id as "requestId", al.outcome, al.metadata, al.occurred_at as "occurredAt", count(*) over()::int as total
      from audit_logs al left join users u on u.id=al.actor_user_id where (${event}::text is null or al.event_type=${event}) and (${request}::text is null or al.request_id=${request})
        and (${subjectType}::text is null or al.subject_type=${subjectType}) and (${subjectId}::text is null or al.subject_id=${subjectId})
        and (${search}::text is null or coalesce(u.display_name,'') ilike '%'||${search}||'%' or al.event_type ilike '%'||${search}||'%')
        and (${query.from ?? null}::timestamptz is null or al.occurred_at>=${query.from ?? null}) and (${query.to ?? null}::timestamptz is null or al.occurred_at<=${query.to ?? null})
      order by al.occurred_at desc limit ${size} offset ${offset}`;
    return {items:rows.map(withoutTotal),page:Math.floor(offset/size)+1,pageSize:size,total:rows[0]?.total??0};
  }

  async users(query: PageQuery): Promise<PageResult<Record<string, unknown>>> {
    const {size,offset}=page(query); const search=query.search?.trim()||null;
    const rows=await this.sql<(Record<string,unknown>&{total:number})[]>`
      select u.id, u.display_name as "displayName", u.status, pac.disabled_at as "adminDisabledAt", coalesce(array_agg(distinct pr.role_key) filter(where pr.role_key is not null),'{}') as roles,
        max(al.occurred_at) as "lastActivity", count(*) over()::int as total
      from users u left join platform_access_controls pac on pac.user_id=u.id left join user_platform_roles upr on upr.user_id=u.id left join platform_roles pr on pr.id=upr.role_id left join audit_logs al on al.actor_user_id=u.id
      where (${search}::text is null or u.display_name ilike '%'||${search}||'%' or coalesce(u.email,'') ilike '%'||${search}||'%') group by u.id,pac.disabled_at order by u.display_name limit ${size} offset ${offset}`;
    return {items:rows.map(withoutTotal),page:Math.floor(offset/size)+1,pageSize:size,total:rows[0]?.total??0};
  }

  async listRoles() { return this.sql<Record<string,unknown>[]>`select pr.role_key as key, pr.name_ru as name, pr.description_ru as description, coalesce(array_agg(rp.permission_key order by rp.permission_key),'{}') as permissions from platform_roles pr left join role_permissions rp on rp.role_id=pr.id group by pr.id order by pr.role_key`; }

  async assignRole(userId:string,role:PlatformRoleKey,actorId:string,requestId:string){await this.sql.begin(async tx=>{await tx`insert into platform_access_controls(user_id) values(${userId}) on conflict(user_id) do update set disabled_at=null,disabled_by_user_id=null,updated_at=now()`;const result=await tx`insert into user_platform_roles(user_id,role_id,assigned_by_user_id) select ${userId},id,${actorId} from platform_roles where role_key=${role} on conflict do nothing`;if(!result.count) { const found=await tx`select 1 from platform_roles where role_key=${role}`; if(!found.count) throw new ApplicationError("invalid_request","Unknown role"); }await this.auditTx(tx,"ROLE_ASSIGNED",actorId,"user",userId,requestId,{role});});}
  async revokeRole(userId:string,role:PlatformRoleKey,actorId:string,requestId:string){try{await this.sql.begin(async tx=>{await tx`delete from user_platform_roles upr using platform_roles pr where upr.role_id=pr.id and upr.user_id=${userId} and pr.role_key=${role}`;await this.auditTx(tx,"ROLE_REVOKED",actorId,"user",userId,requestId,{role});});}catch(error){this.translateConstraint(error);}}
  async setAdminDisabled(userId:string,disabled:boolean,actorId:string,requestId:string){try{await this.sql.begin(async tx=>{await tx`insert into platform_access_controls(user_id,disabled_at,disabled_by_user_id,reason) values(${userId},${disabled?new Date():null},${disabled?actorId:null},${disabled?'disabled_by_admin':null}) on conflict(user_id) do update set disabled_at=excluded.disabled_at,disabled_by_user_id=excluded.disabled_by_user_id,reason=excluded.reason,updated_at=now()`;await this.auditTx(tx,disabled?"ADMIN_ACCESS_DISABLED":"ADMIN_ACCESS_ENABLED",actorId,"user",userId,requestId,{});});}catch(error){this.translateConstraint(error);}}

  async resultsExport(id:string,actorId:string,requestId:string){const result=await this.results(id);if(!result)throw new ApplicationError("not_found","Survey was not found");const survey=result.survey as AdminSurveySummary;const participation=result.participation as {percent:number};const rows=(result.questions as Record<string,unknown>[]).map(q=>({protocol:survey.protocolNumber,survey:survey.titleRu,question:q.textRu,for:q.for,against:q.against,abstain:q.abstain,total:q.total,participation:`${participation.percent}%`}));await this.appendAudit("RESULTS_EXPORTED",actorId,"survey",id,requestId,{rowCount:rows.length});return rows;}
  async participantsExport(id:string,includePii:boolean,actorId:string,requestId:string){
    const pageSize=100;
    const firstPage=await this.participants(id,{page:1,pageSize,search:""},includePii);
    const items=[...firstPage.items];
    for(let page=2;items.length<firstPage.total;page+=1){
      const nextPage=await this.participants(id,{page,pageSize,search:""},includePii);
      if(nextPage.items.length===0)break;
      items.push(...nextPage.items);
    }
    await this.appendAudit("PARTICIPANTS_EXPORTED",actorId,"survey",id,requestId,{rowCount:items.length,pii:includePii});
    return items.map(r=>({fullName:r.fullName,participant:r.participantReference,property:r.property,account:r.account,eligibility:r.eligibility,voteState:r.voteState,startedAt:r.startedAt,submittedAt:r.submittedAt,documentId:r.documentId}));
  }

  async availableSurveys(userId:string){return this.sql.unsafe<Record<string,unknown>[]>(availableSurveysSql,[userId]);}
  async ownerDocuments(userId:string){return this.sql.unsafe<Record<string,unknown>[]>(ownerDocumentsSql,[userId]);}

  async progress(id: string) {
    const survey = await this.getSurvey(id); if (!survey) return null;
    const eligible = survey.eligibleCount; const completed = survey.completedCount;
    return { survey: { id: survey.id, protocolNumber: survey.protocolNumber, titleRu: survey.titleRu, status: survey.status, signingState: survey.signingState, closesAt: survey.closesAt }, participation: { eligible, completed, remaining: Math.max(0, eligible - completed), percent: eligible ? Math.round(completed * 10000 / eligible) / 100 : 0 } };
  }

  async inviteUser(input: { email: string; displayName: string; organizationId: string; organizationRole: string; permissions: string[] }, actorId: string, requestId: string) {
    const token = randomBytes(32).toString("base64url");
    const rows = await this.sql.begin(async (tx) => {
      const inserted = await tx<{ id: string }[]>`
        insert into invitations (email, display_name, organization_id, organization_role, permissions, token_hash, expires_at, invited_by_user_id)
        values (${input.email.trim().toLowerCase()}, ${input.displayName.trim()}, ${input.organizationId}, ${input.organizationRole}, ${tx.json(input.permissions)}, ${hashSessionToken(token)}, now() + interval '7 days', ${actorId}) returning id
      `;
      await this.auditTx(tx, "USER_INVITED", actorId, "invitation", inserted[0].id, requestId, { email: input.email.trim().toLowerCase(), organizationId: input.organizationId, role: input.organizationRole });
      return inserted[0].id;
    });
    return { invitationId: rows, token };
  }

  async acceptInvitation(token: string, requestId: string) {
    const hash = hashSessionToken(token);
    return this.sql.begin(async (tx) => {
      const rows = await tx<{ id: string; email: string; displayName: string; organizationId: string; organizationRole: OrganizationAccessRoleKey; permissions: string[] }[]>`
        select id, email, display_name as "displayName", organization_id as "organizationId", organization_role as "organizationRole", permissions
        from invitations where token_hash=${hash} and status='pending' and expires_at > now() for update
      `;
      if (!rows[0]) throw new ApplicationError("not_found", "Invitation is invalid or expired");
      const existing = await tx<{ id: string }[]>`select id from users where lower(email)=${rows[0].email} limit 1`;
      const userId = existing[0]?.id ?? (await tx<{ id: string }[]>`insert into users (display_name, email, type, status) values (${rows[0].displayName}, ${rows[0].email}, 'organization_representative', 'active') returning id`)[0].id;
      await tx`insert into organization_access_grants (user_id, organization_id, role_key, permissions) values (${userId}, ${rows[0].organizationId}, ${rows[0].organizationRole}, ${tx.json(rows[0].permissions)}) on conflict do nothing`;
      await tx`insert into platform_access_controls (user_id) values (${userId}) on conflict do nothing`;
      await tx`update invitations set status='accepted', accepted_at=now(), accepted_user_id=${userId}, updated_at=now() where id=${rows[0].id}`;
      await this.auditTx(tx, "INVITATION_ACCEPTED", userId, "invitation", rows[0].id, requestId, { organizationId: rows[0].organizationId });
      return { userId };
    });
  }

  async replaceSignatories(surveyId: string, signatories: { userId: string; roleKey: string; displayName: string }[], actorId: string, requestId: string) {
    await this.sql.begin(async (tx) => {
      await this.lockDraft(tx, surveyId);
      await tx`delete from survey_signatories where survey_id=${surveyId}`;
      for (const row of signatories) {
        const displayName = row.displayName.trim();
        if (!displayName) throw new ApplicationError("invalid_request", "Укажите ФИО подписанта");
        await tx`insert into survey_signatories (survey_id, user_id, role_key, display_name) values (${surveyId}, ${row.userId}, ${row.roleKey}, ${displayName})`;
      }
      await tx`update surveys set lock_version=lock_version+1, updated_at=now() where id=${surveyId}`;
      await this.auditTx(tx, "SIGNATORIES_UPDATED", actorId, "survey", surveyId, requestId, { count: signatories.length });
    });
    return (await this.getSurvey(surveyId))!;
  }

  async replaceSignaturePolicy(surveyId: string, policy: { roleKey: string; minRequired: number }[], actorId: string, requestId: string) {
    await this.sql.begin(async (tx) => {
      await this.lockDraft(tx, surveyId);
      await tx`delete from survey_signature_policies where survey_id=${surveyId}`;
      for (const row of policy) {
        await tx`insert into survey_signature_policies (survey_id, role_key, min_required) values (${surveyId}, ${row.roleKey}, ${row.minRequired})`;
      }
      await tx`update surveys set lock_version=lock_version+1, updated_at=now() where id=${surveyId}`;
      await this.auditTx(tx, "SIGNATURE_POLICY_UPDATED", actorId, "survey", surveyId, requestId, { count: policy.length });
    });
    return (await this.getSurvey(surveyId))!;
  }

  async organizations(scope: TenantScope) {
    const orgs = scope ?? null;
    return this.sql<Record<string, unknown>[]>`
      select id, display_name as name, legal_name as "legalName", bin, type, status,
        contact_name as "contactName", contact_phone as "contactPhone", contact_email as "contactEmail"
      from organizations
      where (${orgs}::uuid[] is null or id = any(${orgs}::uuid[]))
      order by status, display_name
    `;
  }

  async createOrganization(input: OrganizationCreateInput, actorId: string, requestId: string) {
    try {
      return await this.sql.begin(async (tx) => {
        const rows = await tx<Record<string, unknown>[]>`
          insert into organizations (bin, legal_name, display_name, type, contact_name, contact_phone, contact_email, status)
          values (${input.bin}, ${input.legalName}, ${input.displayName}, ${input.type}, ${input.contactName}, ${input.contactPhone}, ${input.contactEmail}, 'active')
          returning id, display_name as name, legal_name as "legalName", bin, type, status,
            contact_name as "contactName", contact_phone as "contactPhone", contact_email as "contactEmail"
        `;
        const organizationId = String(rows[0].id);
        await tx`insert into organization_members (user_id, organization_id, role, verified_source, verified_at)
          values (${actorId}, ${organizationId}, 'administrator', 'admin_console', now())
          on conflict do nothing`;
        await this.auditTx(tx, "ORGANIZATION_CREATED", actorId, "organization", organizationId, requestId, { bin: input.bin, type: input.type });
        return rows[0];
      });
    } catch (error) {
      throw this.uniqueViolation(error, "Организация с таким БИН уже существует");
    }
  }

  async updateOrganization(id: string, input: OrganizationUpdateInput, actorId: string, requestId: string) {
    const rows = await this.sql<Record<string, unknown>[]>`
      update organizations set legal_name=${input.legalName}, display_name=${input.displayName}, type=${input.type},
        contact_name=${input.contactName}, contact_phone=${input.contactPhone}, contact_email=${input.contactEmail},
        status=${input.status}, updated_at=now()
      where id=${id}
      returning id, display_name as name, legal_name as "legalName", bin, type, status,
        contact_name as "contactName", contact_phone as "contactPhone", contact_email as "contactEmail"
    `;
    if (!rows[0]) throw new ApplicationError("not_found", "Организация не найдена");
    await this.appendAudit("ORGANIZATION_UPDATED", actorId, "organization", id, requestId, { status: input.status });
    return rows[0];
  }

  async organizationUsers(organizationId: string) {
    return this.sql<Record<string, unknown>[]>`
      select u.id, u.display_name as "displayName", u.email, u.phone, u.status,
        g.role_key as "role", uc.login, uc.must_change_password as "mustChangePassword", uc.last_login_at as "lastLoginAt",
        pac.disabled_at as "disabledAt"
      from organization_access_grants g
      join users u on u.id=g.user_id
      left join user_credentials uc on uc.user_id=u.id
      left join platform_access_controls pac on pac.user_id=u.id
      where g.organization_id=${organizationId}
      order by u.display_name
    `;
  }

  async createOrganizationUser(organizationId: string, input: OrganizationUserInput, actorId: string, requestId: string) {
    try {
      return await this.sql.begin(async (tx) => {
        const organization = await tx<{ id: string }[]>`select id from organizations where id=${organizationId} and status='active'`;
        if (!organization[0]) throw new ApplicationError("not_found", "Организация не найдена или неактивна");
        const users = await tx<{ id: string }[]>`
          insert into users (display_name, email, phone, type, status)
          values (${input.displayName}, ${input.email ?? null}, ${input.phone ?? null}, 'organization_representative', 'active') returning id
        `;
        const userId = users[0].id;
        await tx`insert into user_credentials (user_id, login, password_hash, must_change_password) values (${userId}, ${input.login}, ${input.passwordHash}, true)`;
        await tx`insert into organization_members (user_id, organization_id, role, verified_source, verified_at) values (${userId}, ${organizationId}, 'representative', 'admin_console', now()) on conflict do nothing`;
        await tx`insert into organization_access_grants (user_id, organization_id, role_key, permissions) values (${userId}, ${organizationId}, ${input.role}, ${tx.json([])})`;
        await tx`insert into platform_access_controls (user_id) values (${userId}) on conflict (user_id) do nothing`;
        await this.auditTx(tx, "ORGANIZATION_USER_CREATED", actorId, "user", userId, requestId, { organizationId, role: input.role, login: input.login });
        return { userId, displayName: input.displayName, role: input.role, organizationId };
      });
    } catch (error) {
      throw this.uniqueViolation(error, "Такой логин уже занят");
    }
  }

  async resetOrganizationUserPassword(organizationId: string, userId: string, passwordHash: string, actorId: string, requestId: string) {
    await this.sql.begin(async (tx) => {
      const member = await tx<{ userId: string }[]>`select user_id as "userId" from organization_access_grants where organization_id=${organizationId} and user_id=${userId} limit 1`;
      if (!member[0]) throw new ApplicationError("not_found", "Пользователь не найден в этой организации");
      const updated = await tx`update user_credentials set password_hash=${passwordHash}, must_change_password=true, failed_attempts=0, locked_until=null, updated_at=now() where user_id=${userId}`;
      if (!updated.count) throw new ApplicationError("not_found", "У пользователя нет учётных данных для входа");
      await this.auditTx(tx, "ORGANIZATION_USER_PASSWORD_RESET", actorId, "user", userId, requestId, { organizationId });
    });
  }

  async setOrganizationUserRole(organizationId: string, userId: string, role: OrganizationAccessRoleKey, actorId: string, requestId: string) {
    await this.sql.begin(async (tx) => {
      const existing = await tx<{ roleKey: string }[]>`select role_key as "roleKey" from organization_access_grants where organization_id=${organizationId} and user_id=${userId} limit 1`;
      if (!existing[0]) throw new ApplicationError("not_found", "Пользователь не найден в этой организации");
      await tx`delete from organization_access_grants where organization_id=${organizationId} and user_id=${userId}`;
      await tx`insert into organization_access_grants (user_id, organization_id, role_key, permissions, assigned_by_user_id) values (${userId}, ${organizationId}, ${role}, ${tx.json([])}, ${actorId})`;
      await this.auditTx(tx, "ORGANIZATION_USER_ROLE_CHANGED", actorId, "user", userId, requestId, { organizationId, role, previousRole: existing[0].roleKey });
    });
  }

  async searchUsers(query: string, scope: TenantScope) {
    const search = `%${query.trim()}%`;
    const orgs = scope ?? null;
    return this.sql<Record<string, unknown>[]>`
      select u.id, u.display_name as "displayName", u.email, u.phone from users u
      where u.status='active' and (u.display_name ilike ${search} or coalesce(u.email,'') ilike ${search})
        and (${orgs}::uuid[] is null or exists (select 1 from organization_access_grants g where g.user_id=u.id and g.organization_id = any(${orgs}::uuid[])))
      order by u.display_name limit 20
    `;
  }

  private uniqueViolation(error: unknown, message: string): unknown {
    if (error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "23505") {
      return new ApplicationError("invalid_request", message);
    }
    return error;
  }

  async attention(userId: string) {
    return this.sql<Record<string, unknown>[]>`
      select s.id, s.protocol_number as protocol, s.title_ru as title, s.status, ss.id as "signatoryId", ss.role_key as "roleKey", ss.display_name as "displayName"
      from survey_signatories ss join surveys s on s.id=ss.survey_id
      left join official_signatures os on os.signatory_id=ss.id
      where ss.user_id=${userId} and s.status='closed' and os.id is null
      order by s.closes_at desc limit 20
    `;
  }

  async addOfficialSignature(input: { surveyId: string; userId: string; signatoryId: string; png: Uint8Array; verificationBaseUrl: string }, requestId: string) {
    const snapshot = await this.sql<{ sha256: string }[]>`select sha256 from survey_result_snapshots where survey_id=${input.surveyId}`;
    if (!snapshot[0]) throw new ApplicationError("invalid_survey", "Results are not sealed");
    const assigned = await this.sql<{ id: string; roleKey: SurveySignatoryRoleKey; userId: string }[]>`
      select id, role_key as "roleKey", user_id as "userId" from survey_signatories where id=${input.signatoryId} and survey_id=${input.surveyId}
    `;
    if (!assigned[0]) throw new ApplicationError("forbidden", "Signer is not assigned to this survey");
    if (assigned[0].userId !== input.userId) throw new ApplicationError("forbidden", "This account cannot sign for the selected person");
    const sha256 = createHash("sha256").update(input.png).digest("hex");
    const storageKey = `official-signatures/${input.surveyId}/${input.signatoryId}/${sha256}.png`;
    await this.sql`insert into binary_assets (storage_key, content_type, bytes, sha256, size_bytes) values (${storageKey}, 'image/png', ${Buffer.from(input.png)}, ${sha256}, ${input.png.byteLength}) on conflict (storage_key) do nothing`;
    try {
      await this.sql`insert into official_signatures (survey_id, signatory_id, user_id, role_key, visual_storage_key, result_sha256) values (${input.surveyId}, ${input.signatoryId}, ${input.userId}, ${assigned[0].roleKey}, ${storageKey}, ${snapshot[0].sha256})`;
    } catch (error) {
      throw this.uniqueViolation(error, "This person has already signed");
    }
    await this.appendAudit("OFFICIAL_SIGNED", input.userId, "survey", input.surveyId, requestId, { signatoryId: input.signatoryId, roleKey: assigned[0].roleKey, resultSha256: snapshot[0].sha256 });
    const finalized = await this.finalizeOfficialDocumentsIfReady(input.surveyId, input.userId, requestId, input.verificationBaseUrl);
    return { signed: true, resultSha256: snapshot[0].sha256, ...finalized };
  }

  async generateProtocol(surveyId: string, actorId: string, requestId: string, verificationBaseUrl: string) {
    return this.finalizeOfficialDocumentsIfReady(surveyId, actorId, requestId, verificationBaseUrl, true);
  }

  private async finalizeOfficialDocumentsIfReady(surveyId: string, actorId: string, requestId: string, verificationBaseUrl: string, requireProtocol = false) {
    const survey = await this.getSurvey(surveyId);
    if (!survey) throw new ApplicationError("not_found", "Survey was not found");
    if (survey.status !== "closed" && survey.status !== "archived") throw new ApplicationError("invalid_survey", "Protocol is available after close");
    const policy = parseSignaturePolicy(survey.signaturePolicy);
    const signatures = await this.sql<{ roleKey: SurveySignatoryRoleKey }[]>`select role_key as "roleKey" from official_signatures where survey_id=${surveyId}`;
    if (!signaturePolicyFulfilled(policy, signatures)) {
      if (requireProtocol) throw new ApplicationError("forbidden", "Signature requirements are not fulfilled");
      return { protocolReady: false };
    }
    const origin = verificationBaseUrl.replace(/\/$/, "");
    const sheets = await this.appendOfficialVotingSheets(surveyId, actorId, requestId, origin);
    const protocol = await this.persistProtocolDocument(survey, actorId, requestId, origin);
    return { protocolReady: true, ...protocol, votingSheetsUpdated: sheets };
  }

  private async resolveSurveyBuildingAddress(survey: AdminSurveyDetail): Promise<string> {
    const fromParticipants = await this.sql<{ city: string | null; street: string | null; building: string | null }[]>`
      select p.city, p.street, p.building
      from survey_participants sp join properties p on p.id = sp.property_id
      where sp.survey_id = ${survey.id} and sp.status = 'eligible'
      group by p.city, p.street, p.building
    `;
    const formatted = [
      ...fromParticipants.map((row) => formatBuildingAddress(row)),
      ...survey.targets.map((row) => formatBuildingAddress(row)),
    ].filter(Boolean);
    return [...new Set(formatted)].join("; ");
  }

  private async persistProtocolDocument(survey: AdminSurveyDetail, actorId: string, requestId: string, origin: string) {
    const existing = await this.sql<{ publicId: string }[]>`select public_id as "publicId" from documents where survey_id=${survey.id} and document_type='protocol' limit 1`;
    if (existing[0]) return { publicId: existing[0].publicId, alreadyExisted: true };
    const results = await this.results(survey.id);
    const eligibility = await this.sql<{ apartmentOwners: number; nonResidentialOwners: number; eligibleTotal: number }[]>`select apartment_owners as "apartmentOwners", non_residential_owners as "nonResidentialOwners", eligible_total as "eligibleTotal" from survey_eligibility_snapshots where survey_id=${survey.id}`;
    const signatories = await this.loadSignedAppearances(survey.id);
    const { PdfKitVotingSheetRenderer } = await import("@/src/infrastructure/documents/pdfkit-voting-sheet-renderer");
    const pdf = new PdfKitVotingSheetRenderer();
    const publicId = crypto.randomUUID();
    const bytes = await pdf.renderProtocol({
      protocolNumber: survey.protocolNumber, titleRu: survey.titleRu, address: await this.resolveSurveyBuildingAddress(survey),
      meetingForm: survey.meetingForm ?? "electronic", createdAt: protocolDocumentTimestamp(survey.closesAt), documentId: publicId, verificationUrl: `${origin || "https://verify.local"}/verify/${publicId}`,
      apartmentOwners: eligibility[0]?.apartmentOwners ?? 0, nonResidentialOwners: eligibility[0]?.nonResidentialOwners ?? 0, eligibleTotal: eligibility[0]?.eligibleTotal ?? survey.eligibleCount,
      participated: survey.completedCount, questions: ((results?.questions as Record<string, unknown>[]) ?? []).map((question) => ({
        position: Number(question.position), text: String(question.textRu ?? ""), for: Number(question.for ?? 0), against: Number(question.against ?? 0), abstain: Number(question.abstain ?? 0), accepted: Boolean((question.decision as { accepted?: boolean } | undefined)?.accepted),
      })),
      signatories, draft: false,
    });
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const storageKey = `documents/${publicId}/protocol-v1.pdf`;
    await this.sql`insert into binary_assets (storage_key, content_type, bytes, sha256, size_bytes) values (${storageKey}, 'application/pdf', ${Buffer.from(bytes)}, ${sha256}, ${bytes.byteLength}) on conflict (storage_key) do nothing`;
    await this.sql.begin(async (tx) => {
      const again = await tx<{ publicId: string }[]>`select public_id as "publicId" from documents where survey_id=${survey.id} and document_type='protocol' for update`;
      if (again[0]) return;
      const docs = await tx<{ id: string }[]>`insert into documents (public_id, survey_id, document_type, status, current_version) values (${publicId}, ${survey.id}, 'protocol', 'generated', 1) returning id`;
      await tx`insert into document_versions (document_id, version, survey_version, storage_key, content_type, sha256, canonical_sha256, signing_provider, signing_status, verification_reference, size_bytes) values (${docs[0].id}, 1, ${survey.version}, ${storageKey}, 'application/pdf', ${sha256}, ${sha256}, 'mock', 'finalized', ${`/verify/${publicId}`}, ${bytes.byteLength})`;
      await this.auditTx(tx, "PROTOCOL_GENERATED", actorId, "document", docs[0].id, requestId, { sha256 });
    });
    return { publicId, sha256, alreadyExisted: false };
  }

  private async loadSignedAppearances(surveyId: string) {
    const rows = await this.sql<{ roleKey: string; displayName: string; signed: boolean; bytes: Buffer | null }[]>`
      select ss.role_key as "roleKey", ss.display_name as "displayName", os.id is not null as signed, ba.bytes
      from survey_signatories ss
      left join official_signatures os on os.signatory_id=ss.id
      left join binary_assets ba on ba.storage_key=os.visual_storage_key
      where ss.survey_id=${surveyId}
      order by ss.created_at
    `;
    return rows.map((row) => ({ roleKey: row.roleKey, displayName: row.displayName, signed: row.signed, image: row.bytes ? new Uint8Array(row.bytes) : undefined }));
  }

  private async appendOfficialVotingSheets(surveyId: string, actorId: string, requestId: string, origin: string) {
    const signatories = await this.loadSignedAppearances(surveyId);
    const votes = await this.sql<{
      voteId: string; publicId: string; documentId: string; currentVersion: number; surveyVersion: number; canonical: Record<string, unknown> | null;
      canonicalSha256: string; sheetNumber: number | null; submittedAt: Date | null; address: string; unit: string; accountReference: string | null;
      visualBytes: Buffer | null; phone: string | null; email: string | null; fullName: string | null;
    }[]>`
      select v.id as "voteId", d.public_id as "publicId", d.id as "documentId", d.current_version as "currentVersion",
        dv.survey_version as "surveyVersion", v.canonical_payload as canonical, v.canonical_sha256 as "canonicalSha256",
        v.sheet_number as "sheetNumber", v.submitted_at as "submittedAt",
        concat('г. ', p.city, ', ул. ', p.street, ', д. ', p.building) as address, p.premise as unit, pa.account_number as "accountReference",
        vis.bytes as "visualBytes", c.phone, c.email, c.full_name as "fullName"
      from votes v
      join documents d on d.vote_id=v.id and d.document_type='voting_sheet'
      join document_versions dv on dv.document_id=d.id and dv.version=1
      join properties p on p.id=v.property_id
      left join survey_participants sp on sp.id=v.participant_id
      left join personal_accounts pa on pa.id=sp.personal_account_id
      left join visual_signatures vs on vs.vote_id=v.id
      left join binary_assets vis on vis.storage_key=vs.storage_key
      left join vote_contact_details c on c.vote_id=v.id
      where v.survey_id=${surveyId} and v.status='submitted'
    `;
    const { PdfKitVotingSheetRenderer } = await import("@/src/infrastructure/documents/pdfkit-voting-sheet-renderer");
    const pdf = new PdfKitVotingSheetRenderer();
    let updated = 0;
    for (const vote of votes) {
      if (vote.currentVersion >= 2) continue;
      const canonical = vote.canonical as { survey?: { protocolNumber?: string; questions?: { position: number; textRu: string; answer: "for" | "against" | "abstain" }[] }; frozenAt?: string } | null;
      const sourceQuestions = canonical?.survey?.questions ?? [];
      if (!sourceQuestions.length || !vote.canonicalSha256) continue;
      const questions = sourceQuestions.map((question) => ({ position: question.position, text: question.textRu, answer: question.answer }));
      const bytes = await pdf.renderVotingSheet({
        protocolNumber: String(canonical?.survey?.protocolNumber ?? ""),
        address: vote.address, accountReference: vote.accountReference ?? "", unit: vote.unit,
        participantDisplayName: vote.fullName?.trim() || "—",
        createdAt: canonical?.frozenAt ?? vote.submittedAt?.toISOString() ?? new Date().toISOString(),
        documentId: vote.publicId, documentVersion: 2, surveyVersion: vote.surveyVersion, signingProvider: "mock",
        signingStatus: "finalized", documentHashReference: vote.canonicalSha256, verificationUrl: `${origin || "https://verify.local"}/verify/${vote.publicId}`,
        questions, visualSignature: vote.visualBytes ? new Uint8Array(vote.visualBytes) : undefined,
        sheetNumber: vote.sheetNumber ?? undefined, phone: vote.phone, email: vote.email,
        submittedAt: vote.submittedAt?.toISOString(), electronicVoting: true, signatories,
      });
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      const storageKey = `documents/${vote.publicId}/v2.pdf`;
      await this.sql`insert into binary_assets (storage_key, content_type, bytes, sha256, size_bytes) values (${storageKey}, 'application/pdf', ${Buffer.from(bytes)}, ${sha256}, ${bytes.byteLength}) on conflict (storage_key) do nothing`;
      await this.sql.begin(async (tx) => {
        const current = await tx<{ currentVersion: number }[]>`select current_version as "currentVersion" from documents where id=${vote.documentId} for update`;
        if (!current[0] || current[0].currentVersion >= 2) return;
        await tx`insert into document_versions (document_id, version, survey_version, storage_key, content_type, sha256, canonical_sha256, signing_provider, signing_status, verification_reference, size_bytes)
          values (${vote.documentId}, 2, ${vote.surveyVersion}, ${storageKey}, 'application/pdf', ${sha256}, ${vote.canonicalSha256}, 'mock', 'finalized', ${`/verify/${vote.publicId}`}, ${bytes.byteLength})`;
        await tx`update documents set current_version=2, updated_at=now() where id=${vote.documentId}`;
        await this.auditTx(tx, "DOCUMENT_VERSION_ADDED", actorId, "document", vote.documentId, requestId, { version: 2, sha256, reason: "official_signatures" });
      });
      updated += 1;
    }
    return updated;
  }

  async closeAndSnapshot(id: string, actorId: string, requestId: string) {
    return this.transitionSurvey(id, "closed", actorId, requestId);
  }

  private async lockDraft(tx:Tx,id:string){const rows=await tx<{status:SurveyStatus}[]>`select status from surveys where id=${id} for update`;if(!rows[0])throw new ApplicationError("not_found","Survey was not found");if(rows[0].status!=="draft")throw new ApplicationError("invalid_survey","Published survey content is immutable");}
  private async throwDraftOrConflict(tx:Tx,id:string,expected:number):Promise<never>{const rows=await tx<{status:SurveyStatus;lockVersion:number}[]>`select status,lock_version as "lockVersion" from surveys where id=${id}`;if(!rows[0])throw new ApplicationError("not_found","Survey was not found");if(rows[0].status!=="draft")throw new ApplicationError("invalid_survey","Published survey content is immutable");throw new ApplicationError("concurrency_conflict",`Survey changed from lock version ${expected} to ${rows[0].lockVersion}`);}
  private auditTx(tx:Tx,eventType:string,actorId:string,subjectType:string,subjectId:string,requestId:string,metadata:Record<string,unknown>){return tx`insert into audit_logs(event_type,actor_user_id,subject_type,subject_id,request_id,outcome,metadata) values(${eventType},${actorId},${subjectType},${subjectId},${requestId},'success',${tx.json(metadata as postgres.JSONValue)})`;}
  private appendAudit(eventType:string,actorId:string,subjectType:string,subjectId:string,requestId:string,metadata:Record<string,unknown>){return this.sql`insert into audit_logs(event_type,actor_user_id,subject_type,subject_id,request_id,outcome,metadata) values(${eventType},${actorId},${subjectType},${subjectId},${requestId},'success',${this.sql.json(metadata as postgres.JSONValue)})`;}
  private translateConstraint(error:unknown):never{if(error&&typeof error==='object'&&'code'in error&&(error as {code?:string}).code==='23514')throw new ApplicationError("invalid_request","The last active super administrator cannot be removed or disabled");throw error;}
}
