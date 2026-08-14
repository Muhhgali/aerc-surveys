import type { SessionStore } from "@/src/application/ports/repositories";
import type { TrustedSession } from "@/src/domain/session";

/** Development/test adapter only. Production composition rejects this store. */
export class InMemorySessionStore implements SessionStore {
  private readonly sessions = new Map<string, TrustedSession>();

  async create(session: TrustedSession, tokenHash: string): Promise<void> {
    this.sessions.set(tokenHash, session);
  }

  async findByTokenHash(tokenHash: string): Promise<TrustedSession | null> {
    return this.sessions.get(tokenHash) ?? null;
  }

  async revokeByTokenHash(tokenHash: string, revokedAt: string): Promise<void> {
    const session = this.sessions.get(tokenHash);
    if (session) this.sessions.set(tokenHash, { ...session, revokedAt });
  }
}
