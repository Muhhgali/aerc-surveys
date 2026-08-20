import type { AdminPrincipal, PlatformPermission, PlatformRoleKey } from "@/src/domain/admin-rbac";
import type { OrganizationAccessRoleKey } from "@/src/domain/organization-access";
import type { OrganizationCreateInput, OrganizationUpdateInput } from "@/src/domain/organization";
import type { MeetingForm, DocumentLanguage } from "@/src/domain/meeting-form";
import type { SignaturePolicyRequirement, SigningState, SurveySignatoryRoleKey } from "@/src/domain/signature-policy";
import type { PublishableSurvey, SurveyStatus } from "@/src/domain/survey-management";
import type { VotingRule } from "@/src/domain/voting-rules";

export interface PageQuery { page: number; pageSize: number; search?: string; }
export interface PageResult<T> { items: T[]; page: number; pageSize: number; total: number; }

/** `null` means platform-wide access. An array restricts every read to those organizations. */
export type TenantScope = string[] | null;

export interface OrganizationUserInput {
  displayName: string;
  login: string;
  passwordHash: string;
  email?: string;
  phone?: string;
  role: OrganizationAccessRoleKey;
}

export interface AdminSurveySummary {
  id: string; organizationId?: string; titleRu: string; titleKk: string | null; protocolNumber: string; status: SurveyStatus; version: number;
  lockVersion: number; startsAt: string | null; closesAt: string | null; createdAt: string; questionCount: number; eligibleCount: number; completedCount: number;
}

export interface AdminSurveyDetail extends AdminSurveySummary {
  organizationId: string; descriptionRu: string; descriptionKk: string;
  meetingForm?: MeetingForm; documentLanguage?: DocumentLanguage; signingState?: SigningState;
  questions: { id: string; position: number; textRu: string; textKk: string | null; required: boolean; votingRule?: VotingRule }[];
  targets: { id: string; type: "building" | "property" | "organization" | "personal_account"; organizationId: string | null; propertyId: string | null; personalAccountId: string | null; city: string | null; street: string | null; building: string | null }[];
  signatories?: { id: string; userId: string; roleKey: SurveySignatoryRoleKey; displayName: string; email: string | null; signedAt?: string | null }[];
  signaturePolicy?: SignaturePolicyRequirement[];
  protocolPublicId?: string | null;
}

export interface SurveyDraftInput {
  protocolNumber: string; titleRu: string; titleKk: string; descriptionRu: string; descriptionKk: string;
  startsAt: Date; closesAt: Date; organizationId?: string; meetingForm?: MeetingForm; documentLanguage?: DocumentLanguage;
}

export interface SurveyTargetInput {
  type: "building" | "property" | "organization" | "personal_account";
  organizationId?: string; propertyId?: string; personalAccountId?: string; city?: string; street?: string; building?: string;
}

export interface AdminRepository {
  getPrincipal(userId: string): Promise<AdminPrincipal | null>;
  dashboard(scope: TenantScope): Promise<Record<string, unknown>>;
  listSurveys(query: PageQuery & { status?: SurveyStatus; from?: Date; to?: Date }, scope: TenantScope): Promise<PageResult<AdminSurveySummary>>;
  getSurvey(id: string): Promise<AdminSurveyDetail | null>;
  createSurvey(input: SurveyDraftInput, actorId: string, requestId: string): Promise<AdminSurveyDetail>;
  updateSurvey(id: string, input: SurveyDraftInput, expectedLockVersion: number, actorId: string, requestId: string): Promise<AdminSurveyDetail>;
  addQuestion(surveyId: string, input: { textRu: string; textKk: string; required: boolean; votingRule?: VotingRule }, actorId: string, requestId: string): Promise<AdminSurveyDetail>;
  updateQuestion(surveyId: string, questionId: string, input: { textRu: string; textKk: string; required: boolean; votingRule?: VotingRule }, actorId: string, requestId: string): Promise<AdminSurveyDetail>;
  deleteQuestion(surveyId: string, questionId: string, actorId: string, requestId: string): Promise<AdminSurveyDetail>;
  duplicateQuestion(surveyId: string, questionId: string, actorId: string, requestId: string): Promise<AdminSurveyDetail>;
  moveQuestion(surveyId: string, questionId: string, direction: "up" | "down", actorId: string, requestId: string): Promise<AdminSurveyDetail>;
  replaceTargets(surveyId: string, targets: SurveyTargetInput[], actorId: string, requestId: string): Promise<AdminSurveyDetail>;
  publishSurvey(id: string, actorId: string, requestId: string): Promise<AdminSurveyDetail>;
  transitionSurvey(id: string, to: "closed" | "archived", actorId: string, requestId: string): Promise<AdminSurveyDetail>;
  results(id: string): Promise<Record<string, unknown> | null>;
  progress(id: string): Promise<Record<string, unknown> | null>;
  inviteUser(input: { email: string; displayName: string; organizationId: string; organizationRole: string; permissions: string[] }, actorId: string, requestId: string): Promise<Record<string, unknown>>;
  acceptInvitation(token: string, requestId: string): Promise<{ userId: string }>;
  replaceSignatories(surveyId: string, signatories: { userId: string; roleKey: string; displayName: string }[], actorId: string, requestId: string): Promise<AdminSurveyDetail>;
  replaceSignaturePolicy(surveyId: string, policy: { roleKey: string; minRequired: number }[], actorId: string, requestId: string): Promise<AdminSurveyDetail>;
  organizations(scope: TenantScope): Promise<Record<string, unknown>[]>;
  createOrganization(input: OrganizationCreateInput, actorId: string, requestId: string): Promise<Record<string, unknown>>;
  updateOrganization(id: string, input: OrganizationUpdateInput, actorId: string, requestId: string): Promise<Record<string, unknown>>;
  organizationUsers(organizationId: string): Promise<Record<string, unknown>[]>;
  createOrganizationUser(organizationId: string, input: OrganizationUserInput, actorId: string, requestId: string): Promise<Record<string, unknown>>;
  resetOrganizationUserPassword(organizationId: string, userId: string, passwordHash: string, actorId: string, requestId: string): Promise<void>;
  setOrganizationUserRole(organizationId: string, userId: string, role: OrganizationAccessRoleKey, actorId: string, requestId: string): Promise<void>;
  searchUsers(query: string, scope: TenantScope): Promise<Record<string, unknown>[]>;
  attention(userId: string): Promise<Record<string, unknown>[]>;
  addOfficialSignature(input: { surveyId: string; userId: string; signatoryId: string; png: Uint8Array; verificationBaseUrl: string }, requestId: string): Promise<Record<string, unknown>>;
  generateProtocol(surveyId: string, actorId: string, requestId: string, verificationBaseUrl: string): Promise<Record<string, unknown>>;
  closeAndSnapshot(id: string, actorId: string, requestId: string): Promise<AdminSurveyDetail>;
  participants(id: string, query: PageQuery, includePii: boolean): Promise<PageResult<Record<string, unknown>>>;
  documents(query: PageQuery & { status?: string }, scope: TenantScope): Promise<PageResult<Record<string, unknown>>>;
  document(id: string, scope: TenantScope): Promise<Record<string, unknown> | null>;
  audit(query: PageQuery & { eventType?: string; requestId?: string; subjectType?: string; subjectId?: string; from?: Date; to?: Date }): Promise<PageResult<Record<string, unknown>>>;
  users(query: PageQuery): Promise<PageResult<Record<string, unknown>>>;
  assignRole(userId: string, role: PlatformRoleKey, actorId: string, requestId: string): Promise<void>;
  revokeRole(userId: string, role: PlatformRoleKey, actorId: string, requestId: string): Promise<void>;
  setAdminDisabled(userId: string, disabled: boolean, actorId: string, requestId: string): Promise<void>;
  listRoles(): Promise<Record<string, unknown>[]>;
  resultsExport(id: string, actorId: string, requestId: string): Promise<Record<string, unknown>[]>;
  participantsExport(id: string, includePii: boolean, actorId: string, requestId: string): Promise<Record<string, unknown>[]>;
  availableSurveys(userId: string): Promise<Record<string, unknown>[]>;
  ownerDocuments(userId: string): Promise<Record<string, unknown>[]>;
  adminOwnsPermission(userId: string, permission: PlatformPermission): Promise<boolean>;
  loadPublishableSurvey(id: string): Promise<PublishableSurvey | null>;
}
