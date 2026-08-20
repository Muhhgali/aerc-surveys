import "server-only";

import { ApplicationError } from "@/src/application/errors";
import type { PlatformPermission } from "@/src/domain/admin-rbac";
import { createApplication } from "@/src/infrastructure/composition-root";
import { requireCurrentSession } from "@/src/infrastructure/session/current-session";

const ACCESS_TIMEOUT_MS = 12_000;

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new ApplicationError("invalid_request", message)), ms);
    promise.then((value) => {
      clearTimeout(timer);
      resolve(value);
    }, (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

export async function requireAdminPermission(permission: PlatformPermission, scope?: { organizationId?: string; surveyId?: string }) {
  const app = createApplication();
  const session = await requireCurrentSession(app.sessions, app.config.sessionCookieName);
  const principal = await app.admin.authorize(session.subjectId, permission, scope);
  return { app, session, principal };
}

export function requireAdminAccess(scope?: { organizationId?: string; surveyId?: string }) {
  return withTimeout(
    requireAdminPermission("admin.access", scope),
    ACCESS_TIMEOUT_MS,
    "Проверка доступа не завершилась: PostgreSQL не ответил вовремя.",
  );
}
