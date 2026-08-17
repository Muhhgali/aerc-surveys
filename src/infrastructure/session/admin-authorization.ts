import "server-only";

import type { PlatformPermission } from "@/src/domain/admin-rbac";
import { createApplication } from "@/src/infrastructure/composition-root";
import { requireCurrentSession } from "@/src/infrastructure/session/current-session";

export async function requireAdminPermission(permission: PlatformPermission) {
  const app = createApplication();
  const session = await requireCurrentSession(app.sessions, app.config.sessionCookieName);
  const principal = await app.admin.authorize(session.subjectId, permission);
  return { app, session, principal };
}
