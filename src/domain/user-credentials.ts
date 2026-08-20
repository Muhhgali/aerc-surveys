/** Login + password rules for console accounts. Pure domain: no hashing, no storage, no Node APIs. */

export const MIN_PASSWORD_LENGTH = 10;
export const MAX_PASSWORD_LENGTH = 128;
export const MAX_FAILED_ATTEMPTS = 8;
export const LOCKOUT_MINUTES = 15;

const loginPattern = /^[a-z0-9][a-z0-9._@+-]{2,63}$/;

export class CredentialPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CredentialPolicyError";
  }
}

/** Logins are case-insensitive; the normalized form is what gets stored and compared. */
export function normalizeLogin(login: string): string {
  return login.trim().toLowerCase();
}

export function parseLogin(login: string): string {
  const normalized = normalizeLogin(login);
  if (!loginPattern.test(normalized)) {
    throw new CredentialPolicyError("Логин: 3–64 символа, латиница, цифры и . _ - + @");
  }
  return normalized;
}

export function assertPasswordPolicy(password: string): void {
  if (password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
    throw new CredentialPolicyError(`Пароль должен содержать от ${MIN_PASSWORD_LENGTH} до ${MAX_PASSWORD_LENGTH} символов`);
  }
  if (!/[A-Za-zА-Яа-я]/.test(password) || !/\d/.test(password)) {
    throw new CredentialPolicyError("Пароль должен содержать буквы и цифры");
  }
}

export function isLockedOut(lockedUntil: Date | null, now: Date): boolean {
  return Boolean(lockedUntil && lockedUntil.getTime() > now.getTime());
}

export function nextLockout(failedAttempts: number, now: Date): Date | null {
  if (failedAttempts < MAX_FAILED_ATTEMPTS) return null;
  return new Date(now.getTime() + LOCKOUT_MINUTES * 60_000);
}
