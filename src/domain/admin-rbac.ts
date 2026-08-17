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
  "participant.read",
  "participant.pii.read",
  "document.read",
  "document.pdf.read",
  "audit.read",
  "export.results",
  "export.participants",
  "role.manage",
  "user.manage",
] as const;

export type PlatformPermission = (typeof platformPermissionKeys)[number];

export interface AdminPrincipal {
  userId: string;
  displayName: string;
  roles: PlatformRoleKey[];
  permissions: PlatformPermission[];
}

export const rolePermissionMatrix: Record<PlatformRoleKey, readonly PlatformPermission[]> = {
  super_admin: platformPermissionKeys,
  admin: platformPermissionKeys,
  survey_manager: ["admin.access", "survey.read", "survey.create", "survey.update_draft", "survey.publish", "survey.close", "survey.archive", "survey.results.read", "participant.read", "document.read", "document.pdf.read", "export.results", "export.participants"],
  operator: ["admin.access", "survey.read", "survey.create", "survey.update_draft", "survey.results.read", "participant.read", "document.read", "document.pdf.read"],
  auditor: ["admin.access", "survey.read", "survey.results.read", "participant.read", "document.read", "document.pdf.read", "audit.read", "export.results"],
  viewer: ["admin.access", "survey.read", "survey.results.read", "participant.read", "document.read"],
};
