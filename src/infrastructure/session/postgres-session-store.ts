import "server-only";

import type { SessionStore } from "@/src/application/ports/repositories";
import type { TrustedSession } from "@/src/domain/session";
import type { DatabaseClient } from "@/src/infrastructure/database/client";

export class PostgresSessionStore implements SessionStore {
  constructor(private readonly sql: DatabaseClient) {}

  async create(session: TrustedSession): Promise<void> {
    await this.sql`
      insert into auth_sessions (id, user_id, assurance_level, created_at, expires_at, revoked_at)
      values (${session.sessionId}, ${session.subjectId}, ${session.assuranceLevel}, ${session.createdAt}, ${session.expiresAt}, ${session.revokedAt ?? null})
    `;
  }

  async findById(sessionId: string): Promise<TrustedSession | null> {
    const rows = await this.sql<{
      sessionId: string;
      subjectId: string;
      assuranceLevel: TrustedSession["assuranceLevel"];
      createdAt: Date;
      expiresAt: Date;
      revokedAt: Date | null;
    }[]>`
      select id as "sessionId", user_id as "subjectId", assurance_level as "assuranceLevel",
             created_at as "createdAt", expires_at as "expiresAt", revoked_at as "revokedAt"
      from auth_sessions where id = ${sessionId} limit 1
    `;
    const row = rows[0];
    if (!row) return null;
    return {
      sessionId: row.sessionId,
      subjectId: row.subjectId,
      assuranceLevel: row.assuranceLevel,
      createdAt: row.createdAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
      revokedAt: row.revokedAt?.toISOString(),
    };
  }

  async revoke(sessionId: string, revokedAt: string): Promise<void> {
    await this.sql`update auth_sessions set revoked_at = ${revokedAt} where id = ${sessionId}`;
  }
}
