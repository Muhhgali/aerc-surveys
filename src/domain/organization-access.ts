export const organizationAccessRoleKeys = [
  "organization_admin",
  "chairman",
  "organization_director",
  "osi_manager",
  "ksk_manager",
  "survey_manager",
  "viewer",
] as const;
export type OrganizationAccessRoleKey = (typeof organizationAccessRoleKeys)[number];

export const organizationRoleNames: Record<OrganizationAccessRoleKey, string> = {
  organization_admin: "Администратор организации",
  chairman: "Председатель",
  organization_director: "Директор обслуживающей компании",
  osi_manager: "Менеджер ОСИ",
  ksk_manager: "Менеджер КСК",
  survey_manager: "Организатор голосования",
  viewer: "Наблюдатель (только просмотр)",
};

export function isOrganizationAccessRole(value: string): value is OrganizationAccessRoleKey {
  return (organizationAccessRoleKeys as readonly string[]).includes(value);
}
