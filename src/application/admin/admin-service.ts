import { ApplicationError } from "@/src/application/errors";
import type { AdminRepository, PageQuery, SurveyDraftInput, SurveyTargetInput, TenantScope } from "@/src/application/ports/admin-repository";
import type { PasswordHasher } from "@/src/application/ports/credential-repository";
import { canInviteWithPermissions, platformRoleKeys, principalCan, type AdminPrincipal, type PlatformPermission, type PlatformRoleKey } from "@/src/domain/admin-rbac";
import { OrganizationValidationError, parseOrganizationCreate, parseOrganizationUpdate } from "@/src/domain/organization";
import { isOrganizationAccessRole, organizationAccessRoleKeys, type OrganizationAccessRoleKey } from "@/src/domain/organization-access";
import { escapeCsvCell, type SurveyStatus } from "@/src/domain/survey-management";
import { assertPasswordPolicy, CredentialPolicyError, parseLogin } from "@/src/domain/user-credentials";
import type { VotingRule } from "@/src/domain/voting-rules";

export class AdminService {
  constructor(private readonly repository: AdminRepository, private readonly hasher: PasswordHasher) {}

  /** Server-side tenant boundary: organization principals only ever read their own organizations. */
  private scope(principal?: AdminPrincipal): TenantScope {
    if (!principal || principal.platformWide) return null;
    return principal.organizationGrants.map((grant) => grant.organizationId);
  }

  private assertGrantedOrganization(principal: AdminPrincipal, organizationId: string) {
    if (principal.platformWide) return;
    if (!principal.organizationGrants.some((grant) => grant.organizationId === organizationId)) {
      throw new ApplicationError("forbidden", "Нет доступа к этой организации");
    }
  }

  async authorize(userId: string, permission: PlatformPermission, scope?: { organizationId?: string; surveyId?: string }) {
    const principal = await this.repository.getPrincipal(userId);
    if (!principal) throw new ApplicationError("forbidden", "Administrative permission is required");
    let organizationId = scope?.organizationId;
    if (!organizationId && scope?.surveyId) {
      const survey = await this.repository.getSurvey(scope.surveyId);
      organizationId = survey?.organizationId;
    }
    if (!principalCan(principal, permission, { organizationId, surveyOrganizationId: organizationId })) {
      throw new ApplicationError("forbidden", "Administrative permission is required");
    }
    return principal;
  }

  dashboard(principal?: AdminPrincipal) { return this.repository.dashboard(this.scope(principal)); }
  attention(userId: string) { return this.repository.attention(userId); }
  surveys(query: PageQuery & { status?: SurveyStatus; from?: Date; to?: Date }, principal?: AdminPrincipal) {
    return this.repository.listSurveys(query, this.scope(principal));
  }
  survey(id: string) { return this.repository.getSurvey(id); }
  create(input: SurveyDraftInput, actor: AdminPrincipal, requestId: string) {
    return this.repository.createSurvey(this.withOwningOrganization(input, actor), actor.userId, requestId);
  }
  update(id: string, input: SurveyDraftInput, expected: number, actor: AdminPrincipal, requestId: string) {
    return this.repository.updateSurvey(id, this.withOwningOrganization(input, actor), expected, actor.userId, requestId);
  }

  /** An organization principal can only file surveys under an organization it holds a grant for. */
  private withOwningOrganization(input: SurveyDraftInput, actor: AdminPrincipal): SurveyDraftInput {
    if (actor.platformWide) return input;
    const organizationId = input.organizationId ?? (actor.organizationGrants.length === 1 ? actor.organizationGrants[0].organizationId : undefined);
    if (!organizationId) throw new ApplicationError("invalid_request", "Выберите организацию, от имени которой проводится опрос");
    this.assertGrantedOrganization(actor, organizationId);
    return { ...input, organizationId };
  }
  addQuestion(id: string, input: { textRu: string; textKk: string; required: boolean; votingRule?: VotingRule }, actorId: string, requestId: string) { return this.repository.addQuestion(id, input, actorId, requestId); }
  updateQuestion(id: string, questionId: string, input: { textRu: string; textKk: string; required: boolean; votingRule?: VotingRule }, actorId: string, requestId: string) { return this.repository.updateQuestion(id, questionId, input, actorId, requestId); }
  deleteQuestion(id: string, questionId: string, actorId: string, requestId: string) { return this.repository.deleteQuestion(id, questionId, actorId, requestId); }
  duplicateQuestion(id: string, questionId: string, actorId: string, requestId: string) { return this.repository.duplicateQuestion(id, questionId, actorId, requestId); }
  moveQuestion(id: string, questionId: string, direction: "up" | "down", actorId: string, requestId: string) { return this.repository.moveQuestion(id, questionId, direction, actorId, requestId); }
  targets(id: string, targets: SurveyTargetInput[], actorId: string, requestId: string) { return this.repository.replaceTargets(id, targets, actorId, requestId); }
  signatories(id: string, signatories: { userId: string; roleKey: string; displayName: string }[], actorId: string, requestId: string) { return this.repository.replaceSignatories(id, signatories, actorId, requestId); }
  signaturePolicy(id: string, policy: { roleKey: string; minRequired: number }[], actorId: string, requestId: string) { return this.repository.replaceSignaturePolicy(id, policy, actorId, requestId); }
  publish(id: string, actorId: string, requestId: string) { return this.repository.publishSurvey(id, actorId, requestId); }
  transition(id: string, to: "closed" | "archived", actorId: string, requestId: string) { return this.repository.transitionSurvey(id, to, actorId, requestId); }
  progress(id: string) { return this.repository.progress(id); }

  async results(id: string) {
    const survey = await this.repository.getSurvey(id);
    if (!survey) return null;
    const closed = survey.status === "closed" || survey.status === "archived";
    if (!closed) return this.repository.progress(id);
    return this.repository.results(id);
  }

  participants(id: string, query: PageQuery, includePii: boolean) { return this.repository.participants(id, query, includePii); }
  documents(query: PageQuery & { status?: string }, principal?: AdminPrincipal) { return this.repository.documents(query, this.scope(principal)); }
  document(id: string, principal?: AdminPrincipal) { return this.repository.document(id, this.scope(principal)); }
  audit(query: PageQuery & { eventType?: string; requestId?: string; subjectType?: string; subjectId?: string; from?: Date; to?: Date }) { return this.repository.audit(query); }
  users(query: PageQuery) { return this.repository.users(query); }
  searchUsers(query: string, principal?: AdminPrincipal) { return this.repository.searchUsers(query, this.scope(principal)); }
  organizations(principal?: AdminPrincipal) { return this.repository.organizations(this.scope(principal)); }

  createOrganization(input: { bin: string; legalName: string; displayName: string; type: string; contactName?: string | null; contactPhone?: string | null; contactEmail?: string | null }, actorId: string, requestId: string) {
    return this.repository.createOrganization(this.validated(() => parseOrganizationCreate(input)), actorId, requestId);
  }

  updateOrganization(id: string, input: { legalName: string; displayName: string; type: string; status: string; contactName?: string | null; contactPhone?: string | null; contactEmail?: string | null }, actor: AdminPrincipal, requestId: string) {
    this.assertGrantedOrganization(actor, id);
    return this.repository.updateOrganization(id, this.validated(() => parseOrganizationUpdate(input)), actor.userId, requestId);
  }

  organizationUsers(organizationId: string, actor: AdminPrincipal) {
    this.assertGrantedOrganization(actor, organizationId);
    return this.repository.organizationUsers(organizationId);
  }

  /**
   * Creates a console account for an organization. The plaintext password is returned once so the
   * administrator can hand it over; only its scrypt digest reaches the database.
   */
  async createOrganizationUser(
    organizationId: string,
    input: { displayName: string; login: string; password: string; email?: string; phone?: string; role: string },
    actor: AdminPrincipal,
    requestId: string,
  ) {
    this.assertGrantedOrganization(actor, organizationId);
    const role = this.organizationRole(input.role);
    if (!canInviteWithPermissions(actor, [], organizationId)) throw new ApplicationError("forbidden", "Нет права добавлять пользователей организации");
    const displayName = input.displayName.trim();
    if (displayName.length < 3 || displayName.length > 200) throw new ApplicationError("invalid_request", "Укажите ФИО пользователя (3–200 символов)");
    const login = this.validated(() => parseLogin(input.login));
    this.validated(() => assertPasswordPolicy(input.password));
    const created = await this.repository.createOrganizationUser(organizationId, {
      displayName, login, passwordHash: await this.hasher.hash(input.password), email: input.email?.trim() || undefined, phone: input.phone?.trim() || undefined, role,
    }, actor.userId, requestId);
    return { ...created, login };
  }

  async resetOrganizationUserPassword(organizationId: string, userId: string, password: string, actor: AdminPrincipal, requestId: string) {
    this.assertGrantedOrganization(actor, organizationId);
    if (!canInviteWithPermissions(actor, [], organizationId)) throw new ApplicationError("forbidden", "Нет права менять пароли пользователей организации");
    this.validated(() => assertPasswordPolicy(password));
    await this.repository.resetOrganizationUserPassword(organizationId, userId, await this.hasher.hash(password), actor.userId, requestId);
    return { reset: true };
  }

  async setOrganizationUserRole(organizationId: string, userId: string, role: string, actor: AdminPrincipal, requestId: string) {
    this.assertGrantedOrganization(actor, organizationId);
    if (!canInviteWithPermissions(actor, [], organizationId)) throw new ApplicationError("forbidden", "Нет права менять роли в организации");
    await this.repository.setOrganizationUserRole(organizationId, userId, this.organizationRole(role), actor.userId, requestId);
    return { updated: true };
  }

  private organizationRole(role: string): OrganizationAccessRoleKey {
    if (!isOrganizationAccessRole(role)) throw new ApplicationError("invalid_request", "Неизвестная роль организации");
    return role;
  }

  private validated<T>(parse: () => T): T {
    try {
      return parse();
    } catch (error) {
      if (error instanceof OrganizationValidationError || error instanceof CredentialPolicyError) {
        throw new ApplicationError("invalid_request", error.message);
      }
      throw error;
    }
  }

  roles() { return this.repository.listRoles(); }

  async invite(input: { email: string; displayName: string; organizationId: string; organizationRole: string; permissions: string[] }, actor: AdminPrincipal, requestId: string) {
    if (!organizationAccessRoleKeys.includes(input.organizationRole as (typeof organizationAccessRoleKeys)[number])) {
      throw new ApplicationError("invalid_request", "Unknown organization role");
    }
    if (!canInviteWithPermissions(actor, input.permissions as PlatformPermission[], input.organizationId)) {
      throw new ApplicationError("forbidden", "Cannot invite with permissions you do not have");
    }
    return this.repository.inviteUser(input, actor.userId, requestId);
  }

  acceptInvitation(token: string, requestId: string) { return this.repository.acceptInvitation(token, requestId); }
  signOfficial(input: { surveyId: string; userId: string; signatoryId: string; png: Uint8Array; verificationBaseUrl: string }, requestId: string) {
    return this.repository.addOfficialSignature(input, requestId);
  }
  generateProtocol(surveyId: string, actorId: string, requestId: string, origin: string) {
    return this.repository.generateProtocol(surveyId, actorId, requestId, origin);
  }

  assignRole(userId: string, role: string, actor: AdminPrincipal, requestId: string) {
    if (!platformRoleKeys.includes(role as PlatformRoleKey)) throw new ApplicationError("invalid_request", "Unknown platform role");
    if (role === "super_admin" && !actor.roles.includes("super_admin")) throw new ApplicationError("forbidden", "Only super_admin can assign super_admin");
    return this.repository.assignRole(userId, role as PlatformRoleKey, actor.userId, requestId);
  }
  revokeRole(userId: string, role: string, actor: AdminPrincipal, requestId: string) {
    if (!platformRoleKeys.includes(role as PlatformRoleKey)) throw new ApplicationError("invalid_request", "Unknown platform role");
    if (role === "super_admin" && !actor.roles.includes("super_admin")) throw new ApplicationError("forbidden", "Only super_admin can revoke super_admin");
    return this.repository.revokeRole(userId, role as PlatformRoleKey, actor.userId, requestId);
  }
  setDisabled(userId: string, disabled: boolean, actorId: string, requestId: string) { return this.repository.setAdminDisabled(userId, disabled, actorId, requestId); }

  async exportResults(id: string, actor: AdminPrincipal, requestId: string): Promise<string> {
    const payload = await this.results(id);
    if (!payload || !("questions" in payload)) throw new ApplicationError("forbidden", "Results are available after the survey is closed");
    const rows = await this.repository.resultsExport(id, actor.userId, requestId);
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
