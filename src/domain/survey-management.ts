import { createHash } from "node:crypto";
import { ApplicationError } from "@/src/application/errors";
import { deterministicSerialize, type JsonValue } from "@/src/domain/canonical-vote";

export const surveyStatuses = ["draft", "scheduled", "active", "closed", "archived"] as const;
export type SurveyStatus = (typeof surveyStatuses)[number];

const transitions: Record<SurveyStatus, readonly SurveyStatus[]> = {
  draft: ["scheduled", "active"],
  scheduled: ["active", "closed"],
  active: ["closed"],
  closed: ["archived"],
  archived: [],
};

export function assertSurveyTransition(from: SurveyStatus, to: SurveyStatus): void {
  if (!transitions[from].includes(to)) throw new ApplicationError("invalid_survey", `Survey cannot transition from ${from} to ${to}`);
}

export interface PublishableSurvey {
  id: string;
  version: number;
  protocolNumber: string;
  titleRu: string;
  titleKk: string | null;
  descriptionRu: string;
  descriptionKk: string;
  startsAt: Date | null;
  closesAt: Date | null;
  questions: readonly { id: string; position: number; textRu: string; textKk: string | null; required: boolean }[];
  targets: readonly Record<string, unknown>[];
}

export function validateForPublish(survey: PublishableSurvey): void {
  const errors: string[] = [];
  if (!survey.protocolNumber.trim()) errors.push("protocol_number");
  if (!survey.titleRu.trim() || !survey.titleKk?.trim()) errors.push("bilingual_title");
  if (!survey.descriptionRu.trim() || !survey.descriptionKk.trim()) errors.push("bilingual_description");
  if (!survey.startsAt || !survey.closesAt || survey.closesAt <= survey.startsAt) errors.push("period");
  if (survey.questions.length === 0) errors.push("questions");
  if (survey.questions.some((question) => !question.textRu.trim() || !question.textKk?.trim())) errors.push("bilingual_questions");
  if (new Set(survey.questions.map((question) => question.position)).size !== survey.questions.length) errors.push("question_order");
  if (survey.targets.length === 0) errors.push("targeting");
  if (errors.length) throw new ApplicationError("invalid_request", `Survey is not publishable: ${errors.join(", ")}`);
}

export function createSurveySnapshot(survey: PublishableSurvey): { snapshot: Record<string, unknown>; sha256: string } {
  const snapshot = {
    documentVersion: 1,
    surveyId: survey.id,
    surveyVersion: survey.version,
    protocolNumber: survey.protocolNumber,
    title: { ru: survey.titleRu, kk: survey.titleKk },
    description: { ru: survey.descriptionRu, kk: survey.descriptionKk },
    startsAt: survey.startsAt?.toISOString() ?? null,
    closesAt: survey.closesAt?.toISOString() ?? null,
    questions: [...survey.questions].sort((a, b) => a.position - b.position).map((question) => ({ id: question.id, position: question.position, text: { ru: question.textRu, kk: question.textKk }, required: question.required })),
    targets: survey.targets,
  };
  const serialized = deterministicSerialize(snapshot as JsonValue);
  return { snapshot, sha256: createHash("sha256").update(serialized).digest("hex") };
}

export function maskAccount(value: string): string {
  return `••••${value.slice(-4)}`;
}

export function escapeCsvCell(value: unknown): string {
  let text = String(value ?? "").replaceAll("\r", " ").replaceAll("\n", " ");
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
