import "server-only";

import type { CredentialRecord, CredentialRepository } from "@/src/application/ports/credential-repository";
import type { DatabaseClient } from "@/src/infrastructure/database/client";

type Row = {
  userId: string;
  login: string;
  passwordHash: string;
  mustChangePassword: boolean;
  failedAttempts: number;
  lockedUntil: Date | null;
};

export class PostgresCredentialRepository implements CredentialRepository {
  constructor(private readonly sql: DatabaseClient) {}

  /** Disabled console access or a non-active user makes the credential invisible, so login fails closed. */
  async findByLogin(login: string): Promise<CredentialRecord | null> {
    const rows = await this.sql<Row[]>`
      select uc.user_id as "userId", uc.login, uc.password_hash as "passwordHash", uc.must_change_password as "mustChangePassword",
        uc.failed_attempts as "failedAttempts", uc.locked_until as "lockedUntil"
      from user_credentials uc
      join users u on u.id = uc.user_id
      left join platform_access_controls pac on pac.user_id = uc.user_id
      where uc.login = ${login} and u.status = 'active' and pac.disabled_at is null
      limit 1
    `;
    return rows[0] ?? null;
  }

  async findByUserId(userId: string): Promise<CredentialRecord | null> {
    const rows = await this.sql<Row[]>`
      select uc.user_id as "userId", uc.login, uc.password_hash as "passwordHash", uc.must_change_password as "mustChangePassword",
        uc.failed_attempts as "failedAttempts", uc.locked_until as "lockedUntil"
      from user_credentials uc
      join users u on u.id = uc.user_id
      where uc.user_id = ${userId} and u.status = 'active'
      limit 1
    `;
    return rows[0] ?? null;
  }

  async registerFailure(userId: string, failedAttempts: number, lockedUntil: Date | null): Promise<void> {
    await this.sql`update user_credentials set failed_attempts=${failedAttempts}, locked_until=${lockedUntil}, updated_at=now() where user_id=${userId}`;
  }

  async registerSuccess(userId: string): Promise<void> {
    await this.sql`update user_credentials set failed_attempts=0, locked_until=null, last_login_at=now(), updated_at=now() where user_id=${userId}`;
  }

  async updatePassword(userId: string, passwordHash: string, mustChangePassword: boolean): Promise<void> {
    await this.sql`
      update user_credentials set password_hash=${passwordHash}, must_change_password=${mustChangePassword},
        failed_attempts=0, locked_until=null, updated_at=now()
      where user_id=${userId}
    `;
  }
}
