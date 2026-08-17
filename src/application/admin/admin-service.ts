import { ApplicationError } from "@/src/application/errors";
import type { AdminRepository, PageQuery, SurveyDraftInput, SurveyTargetInput } from "@/src/application/ports/admin-repository";
import { platformRoleKeys, type PlatformPermission, type PlatformRoleKey } from "@/src/domain/admin-rbac";
import { escapeCsvCell, type SurveyStatus } from "@/src/domain/survey-management";

export class AdminService {
  constructor(private readonly repository: AdminRepository) {}

  async authorize(userId: string, permission: PlatformPermission) {
    const principal = await this.repository.getPrincipal(userId);
    if (!principal || !principal.permissions.includes(permission)) throw new ApplicationError("forbidden", "Administrative permission is required");
    return principal;
  }

  dashboard() { return this.repository.dashboard(); }
  surveys(query: PageQuery & { status?: SurveyStatus; from?: Date; to?: Date }) { return this.repository.listSurveys(query); }
  survey(id: string) { return this.repository.getSurvey(id); }
  create(input: SurveyDraftInput, actorId: string, requestId: string) { return this.repository.createSurvey(input, actorId, requestId); }
  update(id: string, input: SurveyDraftInput, expected: number, actorId: string, requestId: string) { return this.repository.updateSurvey(id, input, expected, actorId, requestId); }
  addQuestion(id: string, input: { textRu: string; textKk: string; required: boolean }, actorId: string, requestId: string) { return this.repository.addQuestion(id, input, actorId, requestId); }
  updateQuestion(id: string, questionId: string, input: { textRu: string; textKk: string; required: boolean }, actorId: string, requestId: string) { return this.repository.updateQuestion(id, questionId, input, actorId, requestId); }
  deleteQuestion(id: string, questionId: string, actorId: string, requestId: string) { return this.repository.deleteQuestion(id, questionId, actorId, requestId); }
  duplicateQuestion(id: string, questionId: string, actorId: string, requestId: string) { return this.repository.duplicateQuestion(id, questionId, actorId, requestId); }
  moveQuestion(id: string, questionId: string, direction: "up" | "down", actorId: string, requestId: string) { return this.repository.moveQuestion(id, questionId, direction, actorId, requestId); }
  targets(id: string, targets: SurveyTargetInput[], actorId: string, requestId: string) { return this.repository.replaceTargets(id, targets, actorId, requestId); }
  publish(id: string, actorId: string, requestId: string) { return this.repository.publishSurvey(id, actorId, requestId); }
  transition(id: string, to: "closed" | "archived", actorId: string, requestId: string) { return this.repository.transitionSurvey(id, to, actorId, requestId); }
  results(id: string) { return this.repository.results(id); }
  participants(id: string, query: PageQuery, includePii: boolean) { return this.repository.participants(id, query, includePii); }
  documents(query: PageQuery & { status?: string }) { return this.repository.documents(query); }
  document(id: string) { return this.repository.document(id); }
  audit(query: PageQuery & { eventType?: string; requestId?: string; subjectType?: string; subjectId?: string; from?: Date; to?: Date }) { return this.repository.audit(query); }
  users(query: PageQuery) { return this.repository.users(query); }
  roles() { return this.repository.listRoles(); }

  assignRole(userId: string, role: string, actorId: string, requestId: string) {
    if (!platformRoleKeys.includes(role as PlatformRoleKey)) throw new ApplicationError("invalid_request", "Unknown platform role");
    return this.repository.assignRole(userId, role as PlatformRoleKey, actorId, requestId);
  }
  revokeRole(userId: string, role: string, actorId: string, requestId: string) {
    if (!platformRoleKeys.includes(role as PlatformRoleKey)) throw new ApplicationError("invalid_request", "Unknown platform role");
    return this.repository.revokeRole(userId, role as PlatformRoleKey, actorId, requestId);
  }
  setDisabled(userId: string, disabled: boolean, actorId: string, requestId: string) { return this.repository.setAdminDisabled(userId, disabled, actorId, requestId); }

  async exportResults(id: string, actorId: string, requestId: string): Promise<string> {
    const rows = await this.repository.resultsExport(id, actorId, requestId);
    return this.csv(["Protocol", "Survey", "Question", "FOR", "AGAINST", "ABSTAIN", "Total", "Participation"], rows);
  }
  async exportParticipants(id: string, includePii: boolean, actorId: string, requestId: string): Promise<string> {
    const rows = await this.repository.participantsExport(id, includePii, actorId, requestId);
    return this.csv(["Participant", "Property", "Account", "Eligibility", "Vote state", "Started at", "Submitted at", "Document ID"], rows);
  }
  private csv(headers: string[], rows: Record<string, unknown>[]) {
    return `\uFEFF${headers.map(escapeCsvCell).join(",")}\r\n${rows.map((row) => Object.values(row).map(escapeCsvCell).join(",")).join("\r\n")}`;
  }
}
