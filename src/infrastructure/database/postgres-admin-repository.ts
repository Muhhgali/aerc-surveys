import "server-only";

import type postgres from "postgres";

import { ApplicationError } from "@/src/application/errors";
import type {
  AdminRepository, AdminSurveyDetail, AdminSurveySummary, PageQuery, PageResult, SurveyDraftInput, SurveyTargetInput,
} from "@/src/application/ports/admin-repository";
import type { AdminPrincipal, PlatformPermission, PlatformRoleKey } from "@/src/domain/admin-rbac";
import { assertSurveyTransition, createSurveySnapshot, validateForPublish, type PublishableSurvey, type SurveyStatus } from "@/src/domain/survey-management";
import type { DatabaseClient } from "@/src/infrastructure/database/client";
import { availableSurveysSql, materializeSurveyParticipantsSql } from "@/src/infrastructure/database/targeting-sql";

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
      join user_platform_roles upr on upr.user_id = u.id
      join platform_roles pr on pr.id = upr.role_id
      join role_permissions rp on rp.role_id = pr.id
      where u.id = ${userId} and u.status = 'active' and pac.disabled_at is null
      group by u.id, u.display_name
    `;
    return rows[0] ?? null;
  }

  async adminOwnsPermission(userId: string, permission: PlatformPermission) {
    return Boolean((await this.getPrincipal(userId))?.permissions.includes(permission));
  }

  async dashboard(): Promise<Record<string, unknown>> {
    const [surveys, participants, documents, activity] = await Promise.all([
      this.sql<Record<string, number>[]>`select count(*) filter (where status='draft')::int as draft, count(*) filter (where status='scheduled')::int as scheduled, count(*) filter (where status='active')::int as active, count(*) filter (where status='closed')::int as closed from surveys`,
      this.sql<{ eligible: number; started: number; completed: number }[]>`select count(*) filter (where sp.status='eligible')::int as eligible, count(distinct v.id) filter (where v.status <> 'voided')::int as started, count(distinct v.id) filter (where v.status='submitted')::int as completed from survey_participants sp left join votes v on v.participant_id=sp.id`,
      this.sql<{ finalized: number }[]>`select count(*)::int as finalized from documents where status='generated'`,
      this.sql<Record<string, unknown>[]>`select al.id, al.event_type as "eventType", al.outcome, al.request_id as "requestId", al.occurred_at as "occurredAt", u.display_name as actor from audit_logs al left join users u on u.id=al.actor_user_id order by al.occurred_at desc limit 8`,
    ]);
    const p = participants[0] ?? { eligible: 0, started: 0, completed: 0 };
    return { surveys: surveys[0] ?? {}, participants: p, participationPercent: p.eligible ? Math.round(p.completed * 10000 / p.eligible) / 100 : 0, documents: documents[0] ?? { finalized: 0 }, activity };
  }

  async listSurveys(query: PageQuery & { status?: SurveyStatus; from?: Date; to?: Date }): Promise<PageResult<AdminSurveySummary>> {
    const { size, offset } = page(query); const search = query.search?.trim() || null; const status = query.status ?? null;
    const from = query.from ?? null; const to = query.to ?? null;
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
      group by s.id order by s.created_at desc limit ${size} offset ${offset}
    `;
    return { items: rows.map(this.summary), page: Math.floor(offset / size) + 1, pageSize: size, total: rows[0]?.total ?? 0 };
  }

  private summary = (row: SurveyRow): AdminSurveySummary => ({
    id: row.id, titleRu: row.titleRu, titleKk: row.titleKk, protocolNumber: row.protocolNumber, status: row.status, version: row.version,
    lockVersion: row.lockVersion, startsAt: iso(row.startsAt), closesAt: iso(row.closesAt), createdAt: iso(row.createdAt)!, questionCount: row.questionCount, eligibleCount: row.eligibleCount, completedCount: row.completedCount,
  });

  async getSurvey(id: string): Promise<AdminSurveyDetail | null> {
    const rows = await this.sql<SurveyRow[]>`
      select s.id, s.organization_id as "organizationId", s.protocol_number as "protocolNumber", s.version, s.lock_version as "lockVersion",
        s.title_ru as "titleRu", s.title_kk as "titleKk", s.description_ru as "descriptionRu", s.description_kk as "descriptionKk", s.status,
        s.starts_at as "startsAt", s.closes_at as "closesAt", s.created_at as "createdAt",
        (select count(*)::int from survey_questions q where q.survey_id=s.id and q.status='active') as "questionCount",
        (select count(*)::int from survey_participants sp where sp.survey_id=s.id and sp.status='eligible') as "eligibleCount",
        (select count(*)::int from votes v where v.survey_id=s.id and v.status='submitted') as "completedCount"
      from surveys s where s.id=${id} limit 1
    `;
    if (!rows[0]) return null;
    const [questions, targets] = await Promise.all([
      this.sql<{ id: string; position: number; textRu: string; textKk: string | null; required: boolean }[]>`select id, position, text_ru as "textRu", text_kk as "textKk", required from survey_questions where survey_id=${id} and status='active' order by position`,
      this.sql<AdminSurveyDetail["targets"]>`select id, target_type as type, organization_id as "organizationId", property_id as "propertyId", personal_account_id as "personalAccountId", city, street, building from survey_targets where survey_id=${id} order by created_at`,
    ]);
    return { ...this.summary(rows[0]), organizationId: rows[0].organizationId, descriptionRu: rows[0].descriptionRu, descriptionKk: rows[0].descriptionKk, questions, targets };
  }

  async createSurvey(input: SurveyDraftInput, actorId: string, requestId: string) {
    const result = await this.sql.begin(async (tx) => {
      const organizations = await tx<{ id: string }[]>`select id from organizations where status='active' order by created_at limit 1`;
      if (!organizations[0]) throw new ApplicationError("invalid_request", "An active organization is required");
      const rows = await tx<{ id: string }[]>`insert into surveys (organization_id, protocol_number, title_ru, title_kk, description_ru, description_kk, starts_at, closes_at, status) values (${organizations[0].id}, ${input.protocolNumber.trim()}, ${input.titleRu.trim()}, ${input.titleKk.trim()}, ${input.descriptionRu.trim()}, ${input.descriptionKk.trim()}, ${input.startsAt}, ${input.closesAt}, 'draft') returning id`;
      await this.auditTx(tx, "SURVEY_CREATED", actorId, "survey", rows[0].id, requestId, { protocolNumber: input.protocolNumber.trim() });
      return rows[0].id;
    });
    return (await this.getSurvey(result))!;
  }

  async updateSurvey(id: string, input: SurveyDraftInput, expected: number, actorId: string, requestId: string) {
    await this.sql.begin(async (tx) => {
      const rows = await tx<{ id: string }[]>`update surveys set protocol_number=${input.protocolNumber.trim()}, title_ru=${input.titleRu.trim()}, title_kk=${input.titleKk.trim()}, description_ru=${input.descriptionRu.trim()}, description_kk=${input.descriptionKk.trim()}, starts_at=${input.startsAt}, closes_at=${input.closesAt}, lock_version=lock_version+1, updated_at=now() where id=${id} and status='draft' and lock_version=${expected} returning id`;
      if (!rows[0]) await this.throwDraftOrConflict(tx, id, expected);
      await this.auditTx(tx, "SURVEY_UPDATED", actorId, "survey", id, requestId, { lockVersion: expected + 1 });
    });
    return (await this.getSurvey(id))!;
  }

  async addQuestion(surveyId: string, input: { textRu: string; textKk: string; required: boolean }, actorId: string, requestId: string) {
    await this.sql.begin(async (tx) => {
      await this.lockDraft(tx, surveyId);
      const rows = await tx<{ id: string }[]>`insert into survey_questions (survey_id, position, text_ru, text_kk, required) values (${surveyId}, (select coalesce(max(position),0)+1 from survey_questions where survey_id=${surveyId}), ${input.textRu.trim()}, ${input.textKk.trim()}, ${input.required}) returning id`;
      await tx`update surveys set lock_version=lock_version+1, updated_at=now() where id=${surveyId}`;
      await this.auditTx(tx, "QUESTION_CREATED", actorId, "survey", surveyId, requestId, { questionId: rows[0].id });
    });
    return (await this.getSurvey(surveyId))!;
  }

  async updateQuestion(surveyId: string, questionId: string, input: { textRu: string; textKk: string; required: boolean }, actorId: string, requestId: string) {
    await this.sql.begin(async (tx) => {
      await this.lockDraft(tx, surveyId);
      const rows = await tx`update survey_questions set text_ru=${input.textRu.trim()}, text_kk=${input.textKk.trim()}, required=${input.required}, updated_at=now() where id=${questionId} and survey_id=${surveyId}`;
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

  async loadPublishableSurvey(id: string): Promise<PublishableSurvey | null> {
    const survey = await this.getSurvey(id); if (!survey) return null;
    return { id: survey.id, version: survey.version, protocolNumber: survey.protocolNumber, titleRu: survey.titleRu, titleKk: survey.titleKk, descriptionRu: survey.descriptionRu, descriptionKk: survey.descriptionKk, startsAt: survey.startsAt ? new Date(survey.startsAt) : null, closesAt: survey.closesAt ? new Date(survey.closesAt) : null, questions: survey.questions, targets: survey.targets };
  }

  async publishSurvey(id: string, actorId: string, requestId: string) {
    await this.sql.begin(async (tx) => {
      const status = await tx<{ status: SurveyStatus }[]>`select status from surveys where id=${id} for update`;
      if (!status[0]) throw new ApplicationError("not_found", "Survey was not found");
      if (status[0].status !== "draft") throw new ApplicationError("invalid_survey", "Only a draft can be published");
      const details = await this.loadPublishableSurvey(id); if (!details) throw new ApplicationError("not_found", "Survey was not found");
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
      await tx`update surveys set status=${to}, updated_at=now() where id=${id}`;
      await this.auditTx(tx, to === "closed" ? "SURVEY_CLOSED" : "SURVEY_ARCHIVED", actorId, "survey", id, requestId, {});
    });
    return (await this.getSurvey(id))!;
  }

  async results(id: string): Promise<Record<string, unknown> | null> {
    const survey = await this.getSurvey(id); if (!survey) return null;
    const rows = await this.sql<Record<string, unknown>[]>`
      select q.id as "questionId", q.position, q.text_ru as "textRu", q.text_kk as "textKk",
        count(*) filter (where va.choice='for')::int as "for", count(*) filter (where va.choice='against')::int as "against",
        count(*) filter (where va.choice='abstain')::int as "abstain", count(va.vote_id)::int as total
      from survey_questions q left join votes v on v.survey_id=q.survey_id and v.status='submitted'
      left join vote_answers va on va.vote_id=v.id and va.question_id=q.id where q.survey_id=${id} and q.status='active'
      group by q.id order by q.position
    `;
    const eligible = survey.eligibleCount; const completed = survey.completedCount;
    return { survey: this.summary({ ...survey, startsAt: survey.startsAt ? new Date(survey.startsAt) : null, closesAt: survey.closesAt ? new Date(survey.closesAt) : null, createdAt: new Date(survey.createdAt), descriptionRu: survey.descriptionRu, descriptionKk: survey.descriptionKk } as SurveyRow), participation: { eligible, started: await this.startedCount(id), completed, percent: eligible ? Math.round(completed * 10000 / eligible) / 100 : 0 }, questions: rows };
  }

  private async startedCount(id: string) { const rows = await this.sql<{ count: number }[]>`select count(*)::int as count from votes where survey_id=${id} and status <> 'voided'`; return rows[0]?.count ?? 0; }

  async participants(id: string, query: PageQuery, includePii: boolean): Promise<PageResult<Record<string, unknown>>> {
    const { size, offset } = page(query); const search = query.search?.trim() || null;
    const rows = await this.sql<(Record<string, unknown> & { total: number })[]>`
      select sp.id as "participantReference", concat(p.city, ', ', p.street, ' ', p.building, ', ', p.premise) as property,
        case when ${includePii} then coalesce(pa.account_number,'') else case when pa.account_number is null then '' else concat('••••',right(pa.account_number,4)) end end as account,
        sp.status as eligibility, coalesce(v.status::text,'not_started') as "voteState", v.created_at as "startedAt", v.submitted_at as "submittedAt", d.public_id as "documentId", count(*) over()::int as total
      from survey_participants sp join properties p on p.id=sp.property_id left join personal_accounts pa on pa.id=sp.personal_account_id
      left join votes v on v.participant_id=sp.id and v.status <> 'voided' left join documents d on d.vote_id=v.id and d.status='generated'
      where sp.survey_id=${id} and (${search}::text is null or sp.id::text ilike '%'||${search}||'%' or p.street ilike '%'||${search}||'%' or right(coalesce(pa.account_number,''),4) ilike '%'||${search}||'%')
      order by sp.created_at desc limit ${size} offset ${offset}
    `;
    return { items: rows.map(withoutTotal), page: Math.floor(offset / size) + 1, pageSize: size, total: rows[0]?.total ?? 0 };
  }

  async documents(query: PageQuery & { status?: string }): Promise<PageResult<Record<string, unknown>>> {
    const { size, offset } = page(query); const search=query.search?.trim()||null; const status=query.status||null;
    const rows = await this.sql<(Record<string, unknown> & { total: number })[]>`
      select d.public_id as "documentId", d.survey_id as "surveyId", s.title_ru as survey, s.protocol_number as protocol, dv.survey_version as version,
        d.created_at as "createdAt", dv.signing_provider as "signingProvider", dv.signing_status as "signingStatus",
        case when ba.sha256=dv.sha256 then 'valid' else 'invalid' end as "integrityStatus", count(*) over()::int as total
      from documents d join surveys s on s.id=d.survey_id join document_versions dv on dv.document_id=d.id and dv.version=d.current_version left join binary_assets ba on ba.storage_key=dv.storage_key
      where (${search}::text is null or d.public_id::text ilike '%'||${search}||'%' or s.protocol_number ilike '%'||${search}||'%' or s.title_ru ilike '%'||${search}||'%') and (${status}::text is null or dv.signing_status::text=${status})
      order by d.created_at desc limit ${size} offset ${offset}
    `;
    return { items: rows.map(withoutTotal), page: Math.floor(offset/size)+1, pageSize:size, total:rows[0]?.total??0 };
  }

  async document(id: string) {
    const rows = await this.sql<Record<string, unknown>[]>`
      select d.public_id as "documentId", d.survey_id as "surveyId", s.title_ru as survey, s.protocol_number as protocol, dv.survey_version as "surveyVersion", d.vote_id as "voteReference",
        coalesce(p.external_property_id,p.id::text) as "propertyReference", dv.created_at as "generatedAt", dv.signing_provider as "signingProvider", dv.signing_status as "signingStatus", dv.sha256,
        case when ba.sha256=dv.sha256 then 'valid' else 'invalid' end as integrity, dv.verification_reference as "verificationLink"
      from documents d join surveys s on s.id=d.survey_id join document_versions dv on dv.document_id=d.id and dv.version=d.current_version
      join votes v on v.id=d.vote_id join properties p on p.id=v.property_id left join binary_assets ba on ba.storage_key=dv.storage_key where d.public_id=${id} limit 1
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
    return items.map(r=>({participant:r.participantReference,property:r.property,account:r.account,eligibility:r.eligibility,voteState:r.voteState,startedAt:r.startedAt,submittedAt:r.submittedAt,documentId:r.documentId}));
  }

  async availableSurveys(userId:string){return this.sql.unsafe<Record<string,unknown>[]>(availableSurveysSql,[userId]);}

  private async lockDraft(tx:Tx,id:string){const rows=await tx<{status:SurveyStatus}[]>`select status from surveys where id=${id} for update`;if(!rows[0])throw new ApplicationError("not_found","Survey was not found");if(rows[0].status!=="draft")throw new ApplicationError("invalid_survey","Published survey content is immutable");}
  private async throwDraftOrConflict(tx:Tx,id:string,expected:number):Promise<never>{const rows=await tx<{status:SurveyStatus;lockVersion:number}[]>`select status,lock_version as "lockVersion" from surveys where id=${id}`;if(!rows[0])throw new ApplicationError("not_found","Survey was not found");if(rows[0].status!=="draft")throw new ApplicationError("invalid_survey","Published survey content is immutable");throw new ApplicationError("concurrency_conflict",`Survey changed from lock version ${expected} to ${rows[0].lockVersion}`);}
  private auditTx(tx:Tx,eventType:string,actorId:string,subjectType:string,subjectId:string,requestId:string,metadata:Record<string,unknown>){return tx`insert into audit_logs(event_type,actor_user_id,subject_type,subject_id,request_id,outcome,metadata) values(${eventType},${actorId},${subjectType},${subjectId},${requestId},'success',${tx.json(metadata as postgres.JSONValue)})`;}
  private appendAudit(eventType:string,actorId:string,subjectType:string,subjectId:string,requestId:string,metadata:Record<string,unknown>){return this.sql`insert into audit_logs(event_type,actor_user_id,subject_type,subject_id,request_id,outcome,metadata) values(${eventType},${actorId},${subjectType},${subjectId},${requestId},'success',${this.sql.json(metadata as postgres.JSONValue)})`;}
  private translateConstraint(error:unknown):never{if(error&&typeof error==='object'&&'code'in error&&(error as {code?:string}).code==='23514')throw new ApplicationError("invalid_request","The last active super administrator cannot be removed or disabled");throw error;}
}
