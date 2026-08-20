import type { OrganizationAccessRoleKey } from "@/src/domain/organization-access";

export const platformRoleKeys = ["super_admin", "admin", "survey_manager", "operator", "auditor", "viewer"] as const;
export type PlatformRoleKey = (typeof platformRoleKeys)[number];

export const platformPermissionKeys = [
  "admin.access",
  "survey.read",
  "survey.create",
  "survey.update_draft",
  "survey.publish",
  "survey.close",
  "survey.archive",
  "survey.results.read",
  "survey.results.read_live",
  "survey.progress.read",
  "survey.signatory.manage",
  "survey.sign",
  "protocol.generate",
  "participant.read",
  "participant.pii.read",
  "document.read",
  "document.pdf.read",
  "audit.read",
  "export.results",
  "export.participants",
  "role.manage",
  "user.manage",
  "user.invite",
  "org.manage",
] as const;

export type PlatformPermission = (typeof platformPermissionKeys)[number];

export interface OrganizationGrant {
  organizationId: string;
  role: OrganizationAccessRoleKey;
  permissions: PlatformPermission[];
}

export interface AdminPrincipal {
  userId: string;
  displayName: string;
  roles: PlatformRoleKey[];
  /** Union of platform-role and organization-grant permissions; used for UI affordances. */
  permissions: PlatformPermission[];
  /** Permissions coming from platform roles only. Authoritative for unscoped operations. */
  platformPermissions: PlatformPermission[];
  organizationGrants: OrganizationGrant[];
  platformWide: boolean;
}

export interface PermissionScope {
  organizationId?: string;
  surveyOrganizationId?: string;
}

const orgScoped: readonly PlatformPermission[] = [
  "admin.access", "survey.read", "survey.create", "survey.update_draft", "survey.publish", "survey.close", "survey.archive",
  "survey.results.read", "survey.progress.read", "survey.signatory.manage", "survey.sign", "protocol.generate",
  "participant.read", "document.read", "document.pdf.read", "export.results", "export.participants", "user.invite",
];

export const organizationRolePermissionMatrix: Record<OrganizationAccessRoleKey, readonly PlatformPermission[]> = {
  organization_admin: orgScoped,
  chairman: orgScoped,
  organization_director: orgScoped.filter((key) => key !== "survey.signatory.manage"),
  osi_manager: ["admin.access", "survey.read", "survey.create", "survey.update_draft", "survey.progress.read", "participant.read", "document.read", "document.pdf.read", "user.invite"],
  ksk_manager: ["admin.access", "survey.read", "survey.create", "survey.update_draft", "survey.progress.read", "participant.read", "document.read", "document.pdf.read", "user.invite"],
  survey_manager: ["admin.access", "survey.read", "survey.create", "survey.update_draft", "survey.publish", "survey.close", "survey.progress.read", "survey.results.read", "survey.signatory.manage", "participant.read", "document.read", "document.pdf.read", "export.results"],
  viewer: ["admin.access", "survey.read", "survey.progress.read", "survey.results.read", "participant.read", "document.read"],
};

/**
 * Permissions an organization-scoped principal may exercise without naming an organization.
 * Everything else must carry a scope, otherwise a grant in organization A would authorize
 * an operation on organization B's data.
 */
const unscopedForOrganizationPrincipals: readonly PlatformPermission[] = ["admin.access", "survey.read", "document.read", "survey.create"];

export const rolePermissionMatrix: Record<PlatformRoleKey, readonly PlatformPermission[]> = {
  super_admin: platformPermissionKeys,
  admin: platformPermissionKeys.filter((key) => key !== "survey.results.read_live"),
  survey_manager: ["admin.access", "survey.read", "survey.create", "survey.update_draft", "survey.publish", "survey.close", "survey.archive", "survey.results.read", "survey.progress.read", "survey.signatory.manage", "protocol.generate", "participant.read", "document.read", "document.pdf.read", "export.results", "export.participants"],
  operator: ["admin.access", "survey.read", "survey.create", "survey.update_draft", "survey.progress.read", "participant.read", "document.read", "document.pdf.read"],
  auditor: ["admin.access", "survey.read", "survey.results.read", "survey.progress.read", "participant.read", "document.read", "document.pdf.read", "audit.read", "export.results"],
  viewer: ["admin.access", "survey.read", "survey.progress.read", "participant.read", "document.read"],
};

export function unionPermissions(...lists: readonly (readonly PlatformPermission[])[]): PlatformPermission[] {
  return [...new Set(lists.flat())];
}

export function principalCan(principal: AdminPrincipal, permission: PlatformPermission, scope?: PermissionScope): boolean {
  if (principal.roles.includes("super_admin")) return true;
  const organizationId = scope?.organizationId ?? scope?.surveyOrganizationId;
  if (principal.platformWide) return principal.permissions.includes(permission);
  if (organizationId) {
    return principal.organizationGrants.some((grant) => grant.organizationId === organizationId && grant.permissions.includes(permission));
  }
  if (principal.organizationGrants.length && !unscopedForOrganizationPrincipals.includes(permission)) {
    // A tenant-scoped principal must not act on unnamed resources: the caller has to resolve the organization first.
    return principal.platformPermissions.includes(permission);
  }
  return principal.permissions.includes(permission);
}

export function assertAssignableRole(actor: AdminPrincipal, role: PlatformRoleKey): void {
  if (role === "super_admin" && !actor.roles.includes("super_admin")) {
    throw new Error("cannot_assign_super_admin");
  }
}

export function canInviteWithPermissions(actor: AdminPrincipal, requested: readonly PlatformPermission[], organizationId: string): boolean {
  if (actor.roles.includes("super_admin")) return true;
  if (!principalCan(actor, "user.invite", { organizationId })) return false;
  return requested.every((permission) => principalCan(actor, permission, { organizationId }));
}
