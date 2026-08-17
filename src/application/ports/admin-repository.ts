import type { AdminPrincipal, PlatformPermission, PlatformRoleKey } from "@/src/domain/admin-rbac";
import type { PublishableSurvey, SurveyStatus } from "@/src/domain/survey-management";

export interface PageQuery { page: number; pageSize: number; search?: string; }
export interface PageResult<T> { items: T[]; page: number; pageSize: number; total: number; }

export interface AdminSurveySummary {
  id: string; titleRu: string; titleKk: string | null; protocolNumber: string; status: SurveyStatus; version: number;
  lockVersion: number; startsAt: string | null; closesAt: string | null; createdAt: string; questionCount: number; eligibleCount: number; completedCount: number;
}

export interface AdminSurveyDetail extends AdminSurveySummary {
  organizationId: string; descriptionRu: string; descriptionKk: string;
  questions: { id: string; position: number; textRu: string; textKk: string | null; required: boolean }[];
  targets: { id: string; type: "building" | "property" | "organization" | "personal_account"; organizationId: string | null; propertyId: string | null; personalAccountId: string | null; city: string | null; street: string | null; building: string | null }[];
}

export interface SurveyDraftInput {
  protocolNumber: string; titleRu: string; titleKk: string; descriptionRu: string; descriptionKk: string;
  startsAt: Date; closesAt: Date;
}

export interface SurveyTargetInput {
  type: "building" | "property" | "organization" | "personal_account";
  organizationId?: string; propertyId?: string; personalAccountId?: string; city?: string; street?: string; building?: string;
}

export interface AdminRepository {
  getPrincipal(userId: string): Promise<AdminPrincipal | null>;
  dashboard(): Promise<Record<string, unknown>>;
  listSurveys(query: PageQuery & { status?: SurveyStatus; from?: Date; to?: Date }): Promise<PageResult<AdminSurveySummary>>;
  getSurvey(id: string): Promise<AdminSurveyDetail | null>;
  createSurvey(input: SurveyDraftInput, actorId: string, requestId: string): Promise<AdminSurveyDetail>;
  updateSurvey(id: string, input: SurveyDraftInput, expectedLockVersion: number, actorId: string, requestId: string): Promise<AdminSurveyDetail>;
  addQuestion(surveyId: string, input: { textRu: string; textKk: string; required: boolean }, actorId: string, requestId: string): Promise<AdminSurveyDetail>;
  updateQuestion(surveyId: string, questionId: string, input: { textRu: string; textKk: string; required: boolean }, actorId: string, requestId: string): Promise<AdminSurveyDetail>;
  deleteQuestion(surveyId: string, questionId: string, actorId: string, requestId: string): Promise<AdminSurveyDetail>;
  duplicateQuestion(surveyId: string, questionId: string, actorId: string, requestId: string): Promise<AdminSurveyDetail>;
  moveQuestion(surveyId: string, questionId: string, direction: "up" | "down", actorId: string, requestId: string): Promise<AdminSurveyDetail>;
  replaceTargets(surveyId: string, targets: SurveyTargetInput[], actorId: string, requestId: string): Promise<AdminSurveyDetail>;
  publishSurvey(id: string, actorId: string, requestId: string): Promise<AdminSurveyDetail>;
  transitionSurvey(id: string, to: "closed" | "archived", actorId: string, requestId: string): Promise<AdminSurveyDetail>;
  results(id: string): Promise<Record<string, unknown> | null>;
  participants(id: string, query: PageQuery, includePii: boolean): Promise<PageResult<Record<string, unknown>>>;
  documents(query: PageQuery & { status?: string }): Promise<PageResult<Record<string, unknown>>>;
  document(id: string): Promise<Record<string, unknown> | null>;
  audit(query: PageQuery & { eventType?: string; requestId?: string; subjectType?: string; subjectId?: string; from?: Date; to?: Date }): Promise<PageResult<Record<string, unknown>>>;
  users(query: PageQuery): Promise<PageResult<Record<string, unknown>>>;
  assignRole(userId: string, role: PlatformRoleKey, actorId: string, requestId: string): Promise<void>;
  revokeRole(userId: string, role: PlatformRoleKey, actorId: string, requestId: string): Promise<void>;
  setAdminDisabled(userId: string, disabled: boolean, actorId: string, requestId: string): Promise<void>;
  listRoles(): Promise<Record<string, unknown>[]>;
  resultsExport(id: string, actorId: string, requestId: string): Promise<Record<string, unknown>[]>;
  participantsExport(id: string, includePii: boolean, actorId: string, requestId: string): Promise<Record<string, unknown>[]>;
  availableSurveys(userId: string): Promise<Record<string, unknown>[]>;
  adminOwnsPermission(userId: string, permission: PlatformPermission): Promise<boolean>;
  loadPublishableSurvey(id: string): Promise<PublishableSurvey | null>;
}
