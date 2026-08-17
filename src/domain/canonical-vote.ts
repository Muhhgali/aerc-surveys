import { createHash } from "node:crypto";
import type { VoteChoice } from "@/src/domain/voting";

export interface CanonicalVote {
  schemaVersion: 1;
  voteId: string;
  survey: {
    id: string;
    version: number;
    protocolNumber: string;
    questions: readonly { id: string; position: number; textRu: string; textKk: string | null; answer: VoteChoice }[];
  };
  participantReference: string;
  propertyReference: string;
  accountReference: string;
  frozenAt: string;
  documentVersion: number;
}

export type JsonValue = null | boolean | number | string | readonly JsonValue[] | { readonly [key: string]: JsonValue };

export function deterministicSerialize(value: JsonValue): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Canonical JSON cannot contain non-finite numbers");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(deterministicSerialize).join(",")}]`;
  const object = value as Readonly<Record<string, JsonValue>>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${deterministicSerialize(object[key])}`).join(",")}}`;
}

export function canonicalVoteHash(vote: CanonicalVote): { serialized: string; sha256: string } {
  const serialized = deterministicSerialize(vote as unknown as JsonValue);
  return { serialized, sha256: createHash("sha256").update(serialized, "utf8").digest("hex") };
}
