import { describe, expect, it, vi } from "vitest";
import { AdminService } from "@/src/application/admin/admin-service";
import { ApplicationError } from "@/src/application/errors";
import type { AdminRepository } from "@/src/application/ports/admin-repository";
import { organizationRolePermissionMatrix, principalCan, unionPermissions, type AdminPrincipal } from "@/src/domain/admin-rbac";
import { rolePermissionMatrix } from "@/src/domain/admin-rbac";

const orgA = "11111111-1111-4111-8111-111111111111";
const orgB = "22222222-2222-4222-8222-222222222222";

function organizationPrincipal(organizationId: string, role: keyof typeof organizationRolePermissionMatrix = "organization_admin"): AdminPrincipal {
  const permissions = [...organizationRolePermissionMatrix[role]];
  return {
    userId: `user-${organizationId}`, displayName: "Организация", roles: [], platformWide: false,
    permissions, platformPermissions: [],
    organizationGrants: [{ organizationId, role, permissions }],
  };
}

const superAdmin: AdminPrincipal = {
  userId: "super", displayName: "АЕРЦ", roles: ["super_admin"], platformWide: true,
  permissions: unionPermissions(rolePermissionMatrix.super_admin), platformPermissions: unionPermissions(rolePermissionMatrix.super_admin),
  organizationGrants: [],
};

describe("RBAC scoping", () => {
  it("keeps an organization principal inside its own organization", () => {
    const principal = organizationPrincipal(orgA);
    expect(principalCan(principal, "survey.publish", { organizationId: orgA })).toBe(true);
    expect(principalCan(principal, "survey.publish", { organizationId: orgB })).toBe(false);
    expect(principalCan(principal, "survey.results.read", { surveyOrganizationId: orgB })).toBe(false);
  });

  it("refuses tenant-scoped permissions when no organization is named", () => {
    const principal = organizationPrincipal(orgA);
    expect(principalCan(principal, "admin.access")).toBe(true);
    expect(principalCan(principal, "survey.publish")).toBe(false);
    expect(principalCan(principal, "export.results")).toBe(false);
  });

  it("never grants platform-wide administration to an organization role", () => {
    for (const permissions of Object.values(organizationRolePermissionMatrix)) {
      expect(permissions).not.toContain("role.manage");
      expect(permissions).not.toContain("user.manage");
      expect(permissions).not.toContain("org.manage");
      expect(permissions).not.toContain("audit.read");
      expect(permissions).not.toContain("participant.pii.read");
    }
  });

  it("gives a viewer read-only rights", () => {
    const viewer = organizationPrincipal(orgA, "viewer");
    expect(principalCan(viewer, "survey.read", { organizationId: orgA })).toBe(true);
    expect(principalCan(viewer, "survey.create", { organizationId: orgA })).toBe(false);
    expect(principalCan(viewer, "survey.update_draft", { organizationId: orgA })).toBe(false);
  });

  it("lets the AERC super admin reach every organization", () => {
    expect(principalCan(superAdmin, "survey.publish", { organizationId: orgB })).toBe(true);
    expect(principalCan(superAdmin, "audit.read")).toBe(true);
  });
});

function repositoryStub() {
  const page = { items: [], page: 1, pageSize: 20, total: 0 };
  return {
    dashboard: vi.fn(async () => ({})),
    listSurveys: vi.fn(async () => page),
    documents: vi.fn(async () => page),
    document: vi.fn(async () => null),
    organizations: vi.fn(async () => []),
    searchUsers: vi.fn(async () => []),
    organizationUsers: vi.fn(async () => []),
    createSurvey: vi.fn(async () => ({ id: "survey" })),
    createOrganizationUser: vi.fn(async () => ({ id: "user" })),
    getSurvey: vi.fn(async () => ({ organizationId: orgB })),
    getPrincipal: vi.fn(async () => organizationPrincipal(orgA)),
  };
}

function service(repository: ReturnType<typeof repositoryStub>) {
  return new AdminService(repository as unknown as AdminRepository, { hash: async () => "digest", verify: async () => true });
}

describe("AdminService tenant boundary", () => {
  it("passes the granted organizations as the read scope", async () => {
    const repository = repositoryStub();
    const admin = service(repository);
    const principal = organizationPrincipal(orgA);
    await admin.dashboard(principal);
    await admin.surveys({ page: 1, pageSize: 20 }, principal);
    await admin.documents({ page: 1, pageSize: 20 }, principal);
    await admin.organizations(principal);
    await admin.searchUsers("иванов", principal);
    expect(repository.dashboard).toHaveBeenCalledWith([orgA]);
    expect(repository.listSurveys).toHaveBeenCalledWith(expect.anything(), [orgA]);
    expect(repository.documents).toHaveBeenCalledWith(expect.anything(), [orgA]);
    expect(repository.organizations).toHaveBeenCalledWith([orgA]);
    expect(repository.searchUsers).toHaveBeenCalledWith("иванов", [orgA]);
  });

  it("reads without a scope for platform-wide principals", async () => {
    const repository = repositoryStub();
    await service(repository).dashboard(superAdmin);
    expect(repository.dashboard).toHaveBeenCalledWith(null);
  });

  it("refuses to create a survey for a foreign organization", async () => {
    const repository = repositoryStub();
    const admin = service(repository);
    const draft = { protocolNumber: "1", titleRu: "t", titleKk: "t", descriptionRu: "d", descriptionKk: "d", startsAt: new Date(), closesAt: new Date() };
    expect(() => admin.create({ ...draft, organizationId: orgB }, organizationPrincipal(orgA), "req")).toThrow(ApplicationError);
    expect(repository.createSurvey).not.toHaveBeenCalled();
  });

  it("stamps the owning organization when the principal has exactly one grant", async () => {
    const repository = repositoryStub();
    const draft = { protocolNumber: "1", titleRu: "t", titleKk: "t", descriptionRu: "d", descriptionKk: "d", startsAt: new Date(), closesAt: new Date() };
    await service(repository).create(draft, organizationPrincipal(orgA), "req");
    expect(repository.createSurvey).toHaveBeenCalledWith(expect.objectContaining({ organizationId: orgA }), expect.any(String), "req");
  });

  it("blocks user administration and updates in a foreign organization", async () => {
    const repository = repositoryStub();
    const admin = service(repository);
    const principal = organizationPrincipal(orgA);
    expect(() => admin.organizationUsers(orgB, principal)).toThrow(/Нет доступа/);
    await expect(admin.createOrganizationUser(orgB, { displayName: "Иванов Иван", login: "user.b", password: "Osi2026Pass", role: "survey_manager" }, principal, "req")).rejects.toThrow(/Нет доступа/);
    await expect(admin.resetOrganizationUserPassword(orgB, "user", "Osi2026Pass", principal, "req")).rejects.toThrow(/Нет доступа/);
    await expect(admin.setOrganizationUserRole(orgB, "user", "viewer", principal, "req")).rejects.toThrow(/Нет доступа/);
    expect(repository.organizationUsers).not.toHaveBeenCalled();
    expect(repository.createOrganizationUser).not.toHaveBeenCalled();
  });

  it("refuses a survey read authorization when the survey belongs to another organization", async () => {
    const repository = repositoryStub();
    await expect(service(repository).authorize("user", "survey.read", { surveyId: "survey-of-b" })).rejects.toThrow(/permission/);
  });

  it("hashes the password before it reaches the repository", async () => {
    const repository = repositoryStub();
    const admin = service(repository);
    await admin.createOrganizationUser(orgA, { displayName: "Иванов Иван", login: "user.a", password: "Osi2026Pass", role: "survey_manager" }, organizationPrincipal(orgA), "req");
    expect(repository.createOrganizationUser).toHaveBeenCalledWith(orgA, expect.objectContaining({ passwordHash: "digest", login: "user.a" }), expect.any(String), "req");
    expect(JSON.stringify(repository.createOrganizationUser.mock.calls)).not.toContain("Osi2026Pass");
  });

  it("rejects a weak password and a malformed login for organization users", async () => {
    const repository = repositoryStub();
    const admin = service(repository);
    const principal = organizationPrincipal(orgA);
    await expect(admin.createOrganizationUser(orgA, { displayName: "Иванов Иван", login: "ab", password: "Osi2026Pass", role: "survey_manager" }, principal, "req")).rejects.toThrow(/Логин/);
    await expect(admin.createOrganizationUser(orgA, { displayName: "Иванов Иван", login: "user.a", password: "short1", role: "survey_manager" }, principal, "req")).rejects.toThrow(/символов/);
    await expect(admin.createOrganizationUser(orgA, { displayName: "Иванов Иван", login: "user.a", password: "Osi2026Pass", role: "super_admin" }, principal, "req")).rejects.toThrow(/роль/);
  });
});
