import type { TrustedSession } from "@/src/domain/session";
import type { RecordedVote, VoteSubmission } from "@/src/domain/voting";
import type { AuditEventType } from "@/src/domain/audit";

export interface SessionStore {
  create(session: TrustedSession, tokenHash: string): Promise<void>;
  findByTokenHash(tokenHash: string): Promise<TrustedSession | null>;
  revokeByTokenHash(tokenHash: string, revokedAt: string): Promise<void>;
}

export interface VoteRepository {
  findByIdempotencyKey(key: string): Promise<RecordedVote | null>;
  record(submission: VoteSubmission): Promise<RecordedVote>;
}

export interface AuditEvent {
  eventId: string;
  eventType: AuditEventType;
  actorId?: string;
  subjectId?: string;
  requestId: string;
  occurredAt: string;
  outcome: "success" | "failure";
  metadata: Readonly<Record<string, string>>;
}

export interface AuditRepository {
  append(event: AuditEvent): Promise<void>;
}
