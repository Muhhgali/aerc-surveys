import "server-only";

import { cookies } from "next/headers";
import { ApplicationError } from "@/src/application/errors";
import type { SessionService } from "@/src/application/session/session-service";
import type { TrustedSession } from "@/src/domain/session";

export async function requireCurrentSession(sessions: SessionService, cookieName: string): Promise<TrustedSession> {
  const token = (await cookies()).get(cookieName)?.value;
  if (!token) throw new ApplicationError("unauthenticated", "Authentication is required");
  try {
    return await sessions.requireActive(token);
  } catch {
    throw new ApplicationError("unauthenticated", "Session is expired or revoked");
  }
}
