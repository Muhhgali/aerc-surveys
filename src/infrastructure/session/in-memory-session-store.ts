import type { SessionStore } from "@/src/application/ports/repositories";
import type { TrustedSession } from "@/src/domain/session";

/** Development/test adapter only. Production composition rejects this store. */
export class InMemorySessionStore implements SessionStore {
  private readonly sessions = new Map<string, TrustedSession>();

  async create(session: TrustedSession): Promise<void> {
    this.sessions.set(session.sessionId, session);
  }

  async findById(sessionId: string): Promise<TrustedSession | null> {
    return this.sessions.get(sessionId) ?? null;
  }

  async revoke(sessionId: string, revokedAt: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) this.sessions.set(sessionId, { ...session, revokedAt });
  }
}
