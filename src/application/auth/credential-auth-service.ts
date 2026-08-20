import { ApplicationError } from "@/src/application/errors";
import type { CredentialRepository, PasswordHasher } from "@/src/application/ports/credential-repository";
import type { SessionService } from "@/src/application/session/session-service";
import { assertPasswordPolicy, CredentialPolicyError, isLockedOut, nextLockout, normalizeLogin } from "@/src/domain/user-credentials";

/** Never distinguishes "unknown login" from "wrong password": both surface the same message. */
const GENERIC_FAILURE = "Неверный логин или пароль";

/** Digest of an unused throwaway password, verified when the login is unknown so response time stays flat. */
const DECOY_DIGEST = "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

export class CredentialAuthService {
  constructor(
    private readonly repository: CredentialRepository,
    private readonly sessions: SessionService,
    private readonly hasher: PasswordHasher,
  ) {}

  async authenticate(rawLogin: string, password: string, now = new Date()) {
    const login = normalizeLogin(rawLogin);
    const record = await this.repository.findByLogin(login);
    if (!record) {
      await this.hasher.verify(password, DECOY_DIGEST);
      throw new ApplicationError("unauthenticated", GENERIC_FAILURE);
    }
    if (isLockedOut(record.lockedUntil, now)) {
      throw new ApplicationError("unauthenticated", "Вход временно заблокирован из-за неудачных попыток. Повторите позже.");
    }
    if (!(await this.hasher.verify(password, record.passwordHash))) {
      const failedAttempts = record.failedAttempts + 1;
      await this.repository.registerFailure(record.userId, failedAttempts, nextLockout(failedAttempts, now));
      throw new ApplicationError("unauthenticated", GENERIC_FAILURE);
    }
    await this.repository.registerSuccess(record.userId);
    const credential = await this.sessions.create(record.userId, "verified");
    return { credential, userId: record.userId, mustChangePassword: record.mustChangePassword };
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const record = await this.repository.findByUserId(userId);
    if (!record) throw new ApplicationError("forbidden", "Для этой учётной записи не задан пароль");
    if (!(await this.hasher.verify(currentPassword, record.passwordHash))) {
      throw new ApplicationError("unauthenticated", "Текущий пароль указан неверно");
    }
    if (currentPassword === newPassword) throw new ApplicationError("invalid_request", "Новый пароль должен отличаться от текущего");
    try {
      assertPasswordPolicy(newPassword);
    } catch (error) {
      if (error instanceof CredentialPolicyError) throw new ApplicationError("invalid_request", error.message);
      throw error;
    }
    await this.repository.updatePassword(userId, await this.hasher.hash(newPassword), false);
    return { changed: true };
  }
}
