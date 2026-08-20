import { createHash } from "node:crypto";
import { decorateChoiceCounts, evaluateQuestionDecision, parseVotingRule } from "@/src/domain/voting-rules";
import type { DatabaseClient } from "@/src/infrastructure/database/client";
import type postgres from "postgres";

type Tx = postgres.TransactionSql;

export async function ensureSurveyWindow(sql: DatabaseClient, surveyId: string, actorId: string | null, requestId: string): Promise<void> {
  await sql.begin(async (tx) => {
    await closeSurveyIfDue(tx, surveyId, actorId, requestId);
  });
}

export async function ensureDueSurveyWindows(sql: DatabaseClient, requestId: string): Promise<void> {
  const due = await sql<{ id: string }[]>`
    select id from surveys
    where (status='scheduled' and starts_at is not null and starts_at <= now())
       or (status='active' and closes_at is not null and closes_at <= now())
  `;
  for (const row of due) await ensureSurveyWindow(sql, row.id, null, requestId);
}

export async function closeSurveyIfDue(tx: Tx, surveyId: string, actorId: string | null, requestId: string): Promise<void> {
  const rows = await tx<{ status: string; startsAt: Date | null; closesAt: Date | null }[]>`
    select status, starts_at as "startsAt", closes_at as "closesAt" from surveys where id=${surveyId} for update
  `;
  const survey = rows[0];
  if (!survey) return;
  const now = new Date();
  if (survey.status === "scheduled" && survey.startsAt && survey.startsAt <= now) {
    await tx`update surveys set status='active', updated_at=now() where id=${surveyId}`;
    await tx`insert into audit_logs(event_type,actor_user_id,subject_type,subject_id,request_id,outcome,metadata) values('SURVEY_ACTIVATED',${actorId},'survey',${surveyId},${requestId},'success',${tx.json({ automatic: true })})`;
  }
  const current = (await tx<{ status: string; closesAt: Date | null }[]>`select status, closes_at as "closesAt" from surveys where id=${surveyId}`)[0];
  if (!current || current.status !== "active") return;
  if (current.closesAt && current.closesAt <= now) await persistClosedSurvey(tx, surveyId, actorId, requestId, true);
}

export async function persistClosedSurvey(tx: Tx, surveyId: string, actorId: string | null, requestId: string, automatic: boolean): Promise<void> {
  const existing = await tx<{ surveyId: string }[]>`select survey_id as "surveyId" from survey_result_snapshots where survey_id=${surveyId}`;
  await tx`update surveys set status='closed', updated_at=now() where id=${surveyId} and status in ('active','scheduled')`;
  if (existing[0]) return;

  const eligibility = await tx<{ total: number; apartment: number; nonResidential: number }[]>`
    select count(*)::int as total,
      count(*) filter (where p.property_type='apartment')::int as apartment,
      count(*) filter (where p.property_type='non_residential')::int as "nonResidential"
    from survey_participants sp join properties p on p.id=sp.property_id
    where sp.survey_id=${surveyId} and sp.status='eligible'
  `;
  const eligibleTotal = eligibility[0]?.total ?? 0;
  const eligibilitySnapshot = {
    eligibleTotal,
    apartmentOwners: eligibility[0]?.apartment ?? 0,
    nonResidentialOwners: eligibility[0]?.nonResidential ?? 0,
  };
  const eligibilitySha = createHash("sha256").update(JSON.stringify(eligibilitySnapshot)).digest("hex");
  await tx`insert into survey_eligibility_snapshots (survey_id, eligible_total, apartment_owners, non_residential_owners, snapshot, sha256)
    values (${surveyId}, ${eligibilitySnapshot.eligibleTotal}, ${eligibilitySnapshot.apartmentOwners}, ${eligibilitySnapshot.nonResidentialOwners}, ${tx.json(eligibilitySnapshot)}, ${eligibilitySha})
    on conflict (survey_id) do nothing`;

  const questions = await tx<{ questionId: string; position: number; textRu: string; textKk: string | null; votingRule: Record<string, unknown> }[]>`
    select q.id as "questionId", q.position, q.text_ru as "textRu", q.text_kk as "textKk", q.voting_rule as "votingRule"
    from survey_questions q where q.survey_id=${surveyId} and q.status='active' order by q.position
  `;
  const tallies = await tx<{ questionId: string; forCount: number; againstCount: number; abstainCount: number; participated: number }[]>`
    select q.id as "questionId",
      count(*) filter (where va.choice='for')::int as "forCount",
      count(*) filter (where va.choice='against')::int as "againstCount",
      count(*) filter (where va.choice='abstain')::int as "abstainCount",
      count(distinct v.id) filter (where v.status='submitted')::int as participated
    from survey_questions q
    left join votes v on v.survey_id=q.survey_id and v.status='submitted'
    left join vote_answers va on va.vote_id=v.id and va.question_id=q.id
    where q.survey_id=${surveyId} and q.status='active'
    group by q.id
  `;
  const tallyById = new Map(tallies.map((row) => [row.questionId, row]));
  const submitted = await tx<{ count: number }[]>`select count(*)::int as count from votes where survey_id=${surveyId} and status='submitted'`;
  const participated = submitted[0]?.count ?? 0;
  const results = questions.map((question) => {
    const tally = tallyById.get(question.questionId);
    const counts = { for: tally?.forCount ?? 0, against: tally?.againstCount ?? 0, abstain: tally?.abstainCount ?? 0, eligible: eligibleTotal, participated };
    const decorated = decorateChoiceCounts(counts);
    const decision = evaluateQuestionDecision(parseVotingRule(question.votingRule), counts);
    return {
      questionId: question.questionId, position: question.position, textRu: question.textRu, textKk: question.textKk,
      for: decorated.for, against: decorated.against, abstain: decorated.abstain, total: decorated.total,
      percentFor: decorated.percentFor, percentAgainst: decorated.percentAgainst, percentAbstain: decorated.percentAbstain,
      notVoted: Math.max(0, eligibleTotal - participated),
      decision,
    };
  });
  const snapshot = { eligibleTotal, participated, notVoted: Math.max(0, eligibleTotal - participated), questions: results };
  const sha256 = createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
  await tx`insert into survey_result_snapshots (survey_id, snapshot, sha256) values (${surveyId}, ${tx.json(snapshot as never)}, ${sha256}) on conflict (survey_id) do nothing`;
  await tx`insert into audit_logs(event_type,actor_user_id,subject_type,subject_id,request_id,outcome,metadata) values('SURVEY_CLOSED',${actorId},'survey',${surveyId},${requestId},'success',${tx.json({ automatic })})`;
  await tx`insert into audit_logs(event_type,actor_user_id,subject_type,subject_id,request_id,outcome,metadata) values('RESULTS_CALCULATED',${actorId},'survey',${surveyId},${requestId},'success',${tx.json({ sha256 })})`;
}

