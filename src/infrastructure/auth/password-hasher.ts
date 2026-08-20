import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt) as (password: string, salt: Buffer, keylen: number, options: { N: number; r: number; p: number; maxmem: number }) => Promise<Buffer>;

const PARAMS = { N: 16_384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 } as const;
const KEY_LENGTH = 32;

/** Stored format: scrypt$N$r$p$base64(salt)$base64(key). Parameters travel with the digest so they can be raised later. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(password.normalize("NFKC"), salt, KEY_LENGTH, PARAMS);
  return `scrypt$${PARAMS.N}$${PARAMS.r}$${PARAMS.p}$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(password: string, digest: string): Promise<boolean> {
  const parts = digest.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, saltPart, keyPart] = parts;
  const salt = Buffer.from(saltPart, "base64");
  const expected = Buffer.from(keyPart, "base64");
  if (!salt.length || !expected.length) return false;
  const candidate = await scryptAsync(password.normalize("NFKC"), salt, expected.length, {
    N: Number(n), r: Number(r), p: Number(p), maxmem: PARAMS.maxmem,
  });
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

/** Temporary password handed to an organization user; must be changed on first login. */
export function generateTemporaryPassword(): string {
  const alphabet = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";
  const digits = "23456789";
  const bytes = randomBytes(14);
  const letters = [...bytes.subarray(0, 10)].map((byte) => alphabet[byte % alphabet.length]).join("");
  const numbers = [...bytes.subarray(10)].map((byte) => digits[byte % digits.length]).join("");
  return `${letters}${numbers}`;
}
