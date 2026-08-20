export interface CredentialRecord {
  userId: string;
  login: string;
  passwordHash: string;
  mustChangePassword: boolean;
  failedAttempts: number;
  lockedUntil: Date | null;
}

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(password: string, digest: string): Promise<boolean>;
}

export interface CredentialRepository {
  /** Only active users with an enabled console access record are returned. */
  findByLogin(login: string): Promise<CredentialRecord | null>;
  findByUserId(userId: string): Promise<CredentialRecord | null>;
  registerFailure(userId: string, failedAttempts: number, lockedUntil: Date | null): Promise<void>;
  registerSuccess(userId: string): Promise<void>;
  updatePassword(userId: string, passwordHash: string, mustChangePassword: boolean): Promise<void>;
}
