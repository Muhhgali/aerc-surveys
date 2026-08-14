import { randomUUID } from "node:crypto";
import type { SessionStore } from "@/src/application/ports/repositories";
import type { AssuranceLevel } from "@/src/domain/identity";
import type { TrustedSession } from "@/src/domain/session";

export class SessionService {
  constructor(
    private readonly store: SessionStore,
    private readonly ttlSeconds: number,
  ) {}

  async create(subjectId: string, assuranceLevel: AssuranceLevel): Promise<TrustedSession> {
    const createdAt = new Date();
    const session: TrustedSession = {
      sessionId: randomUUID(),
      subjectId,
      assuranceLevel,
      createdAt: createdAt.toISOString(),
      expiresAt: new Date(createdAt.getTime() + this.ttlSeconds * 1000).toISOString(),
    };
    await this.store.create(session);
    return session;
  }

  async requireActive(sessionId: string, now = new Date()): Promise<TrustedSession> {
    const session = await this.store.findById(sessionId);
    if (!session || session.revokedAt || new Date(session.expiresAt) <= now) {
      throw new InvalidSessionError();
    }
    return session;
  }

  async revoke(sessionId: string): Promise<void> {
    await this.store.revoke(sessionId, new Date().toISOString());
  }
}

export class InvalidSessionError extends Error {
  constructor() {
    super("Session is missing, expired, or revoked");
    this.name = "InvalidSessionError";
  }
}
