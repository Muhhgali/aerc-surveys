import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { SessionStore } from "@/src/application/ports/repositories";
import type { AssuranceLevel } from "@/src/domain/identity";
import type { SessionCredential, TrustedSession } from "@/src/domain/session";

export class SessionService {
  constructor(
    private readonly store: SessionStore,
    private readonly ttlSeconds: number,
  ) {}

  async create(subjectId: string, assuranceLevel: AssuranceLevel): Promise<SessionCredential> {
    const createdAt = new Date();
    const token = randomBytes(32).toString("base64url");
    const session: TrustedSession = {
      sessionId: randomUUID(),
      subjectId,
      assuranceLevel,
      createdAt: createdAt.toISOString(),
      expiresAt: new Date(createdAt.getTime() + this.ttlSeconds * 1000).toISOString(),
    };
    await this.store.create(session, hashSessionToken(token));
    return { session, token };
  }

  async requireActive(token: string, now = new Date()): Promise<TrustedSession> {
    const session = await this.store.findByTokenHash(hashSessionToken(token));
    if (!session || session.revokedAt || new Date(session.expiresAt) <= now) {
      throw new InvalidSessionError();
    }
    return session;
  }

  async revoke(token: string): Promise<void> {
    await this.store.revokeByTokenHash(hashSessionToken(token), new Date().toISOString());
  }
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export class InvalidSessionError extends Error {
  constructor() {
    super("Session is missing, expired, or revoked");
    this.name = "InvalidSessionError";
  }
}
