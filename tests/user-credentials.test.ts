import { describe, expect, it } from "vitest";
import { CredentialAuthService } from "@/src/application/auth/credential-auth-service";
import { ApplicationError } from "@/src/application/errors";
import type { CredentialRecord, CredentialRepository } from "@/src/application/ports/credential-repository";
import { assertPasswordPolicy, isLockedOut, MAX_FAILED_ATTEMPTS, nextLockout, normalizeLogin, parseLogin } from "@/src/domain/user-credentials";
import { generateTemporaryPassword, hashPassword, verifyPassword } from "@/src/infrastructure/auth/password-hasher";

class MemoryCredentials implements CredentialRepository {
  constructor(private readonly records: Map<string, CredentialRecord>) {}
  async findByLogin(login: string) { return [...this.records.values()].find((record) => record.login === login) ?? null; }
  async findByUserId(userId: string) { return this.records.get(userId) ?? null; }
  async registerFailure(userId: string, failedAttempts: number, lockedUntil: Date | null) {
    const record = this.records.get(userId)!;
    this.records.set(userId, { ...record, failedAttempts, lockedUntil });
  }
  async registerSuccess(userId: string) {
    const record = this.records.get(userId)!;
    this.records.set(userId, { ...record, failedAttempts: 0, lockedUntil: null });
  }
  async updatePassword(userId: string, passwordHash: string, mustChangePassword: boolean) {
    const record = this.records.get(userId)!;
    this.records.set(userId, { ...record, passwordHash, mustChangePassword, failedAttempts: 0, lockedUntil: null });
  }
}

const hasher = { hash: hashPassword, verify: verifyPassword };
const sessions = {
  create: async (subjectId: string, assuranceLevel: string) => ({
    session: { sessionId: "session-1", subjectId, assuranceLevel, createdAt: "2026-08-20T10:00:00.000Z", expiresAt: "2026-08-20T10:30:00.000Z" },
    token: `token-${subjectId}`,
  }),
};

async function service(password: string, overrides: Partial<CredentialRecord> = {}) {
  const records = new Map<string, CredentialRecord>([["user-1", {
    userId: "user-1", login: "osi.manager", passwordHash: await hashPassword(password),
    mustChangePassword: true, failedAttempts: 0, lockedUntil: null, ...overrides,
  }]]);
  const repository = new MemoryCredentials(records);
  return { records, auth: new CredentialAuthService(repository, sessions as never, hasher) };
}

describe("credential policy", () => {
  it("normalizes logins and rejects malformed ones", () => {
    expect(normalizeLogin("  OSI.Manager ")).toBe("osi.manager");
    expect(parseLogin("OSI_Manager-1")).toBe("osi_manager-1");
    expect(() => parseLogin("ab")).toThrow(/Логин/);
    expect(() => parseLogin("менеджер")).toThrow(/Логин/);
  });

  it("requires a long password with letters and digits", () => {
    expect(() => assertPasswordPolicy("Osi2026Pass")).not.toThrow();
    expect(() => assertPasswordPolicy("short1")).toThrow(/символов/);
    expect(() => assertPasswordPolicy("passwordwithoutdigits")).toThrow(/цифры/);
  });

  it("locks out only after the configured number of failures", () => {
    const now = new Date("2026-08-20T10:00:00.000Z");
    expect(nextLockout(MAX_FAILED_ATTEMPTS - 1, now)).toBeNull();
    expect(nextLockout(MAX_FAILED_ATTEMPTS, now)).toBeInstanceOf(Date);
    expect(isLockedOut(new Date(now.getTime() + 1000), now)).toBe(true);
    expect(isLockedOut(new Date(now.getTime() - 1000), now)).toBe(false);
  });
});

describe("password hashing", () => {
  it("never stores the plaintext and verifies only the right password", async () => {
    const digest = await hashPassword("Osi2026Pass");
    expect(digest).not.toContain("Osi2026Pass");
    expect(digest.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("Osi2026Pass", digest)).toBe(true);
    expect(await verifyPassword("osi2026pass", digest)).toBe(false);
    expect(await verifyPassword("Osi2026Pass", "not-a-digest")).toBe(false);
  });

  it("produces a distinct digest per call and a usable temporary password", async () => {
    expect(await hashPassword("Osi2026Pass")).not.toBe(await hashPassword("Osi2026Pass"));
    const temporary = generateTemporaryPassword();
    expect(() => assertPasswordPolicy(temporary)).not.toThrow();
  });
});

describe("credential authentication", () => {
  it("issues a session and reports a temporary password", async () => {
    const { auth } = await service("Osi2026Pass");
    const result = await auth.authenticate("  OSI.Manager ", "Osi2026Pass");
    expect(result.userId).toBe("user-1");
    expect(result.mustChangePassword).toBe(true);
  });

  it("gives the same answer for an unknown login and a wrong password", async () => {
    const { auth } = await service("Osi2026Pass");
    await expect(auth.authenticate("osi.manager", "Wrong2026Pass")).rejects.toThrow(/Неверный логин или пароль/);
    await expect(auth.authenticate("nobody", "Wrong2026Pass")).rejects.toThrow(/Неверный логин или пароль/);
  });

  it("locks the account after repeated failures and refuses even the right password", async () => {
    const { auth, records } = await service("Osi2026Pass");
    for (let attempt = 0; attempt < MAX_FAILED_ATTEMPTS; attempt += 1) {
      await expect(auth.authenticate("osi.manager", "Wrong2026Pass")).rejects.toThrow(ApplicationError);
    }
    expect(records.get("user-1")?.lockedUntil).toBeInstanceOf(Date);
    await expect(auth.authenticate("osi.manager", "Osi2026Pass")).rejects.toThrow(/заблокирован/);
  });

  it("changes a temporary password and then authenticates with the new one", async () => {
    const { auth, records } = await service("Osi2026Pass");
    await expect(auth.changePassword("user-1", "Wrong2026Pass", "Osi2026Next")).rejects.toThrow(/Текущий пароль/);
    await expect(auth.changePassword("user-1", "Osi2026Pass", "Osi2026Pass")).rejects.toThrow(/отличаться/);
    await expect(auth.changePassword("user-1", "Osi2026Pass", "short1")).rejects.toThrow(/символов/);
    await auth.changePassword("user-1", "Osi2026Pass", "Osi2026Next");
    expect(records.get("user-1")?.mustChangePassword).toBe(false);
    expect((await auth.authenticate("osi.manager", "Osi2026Next")).mustChangePassword).toBe(false);
  });
});
