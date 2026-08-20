import { createHash, randomInt, randomUUID } from "node:crypto";
import { ApplicationError } from "@/src/application/errors";
import type { NotificationProvider } from "@/src/application/ports/providers";
import type { ResidentAuthProvider } from "@/src/application/ports/resident-auth";
import type { SessionService } from "@/src/application/session/session-service";
import { otpGenericError, otpLimits, type ResidentAuthChannel } from "@/src/domain/resident-auth";
import type { RequestContext } from "@/src/domain/shared";
import type { DatabaseClient } from "@/src/infrastructure/database/client";

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function normalizePhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("8")) return `7${digits.slice(1)}`;
  if (digits.length === 10) return `7${digits}`;
  return digits;
}

function maskPhone(value: string): string {
  const digits = normalizePhone(value);
  return digits.length >= 4 ? `+${digits.slice(0, 1)} ••• ••• ${digits.slice(-4, -2)} ${digits.slice(-2)}` : "+7 ••• ••• •• ••";
}

export class ResidentAuthService {
  constructor(
    private readonly sql: DatabaseClient,
    private readonly sessions: SessionService,
    private readonly providers: Record<ResidentAuthChannel, ResidentAuthProvider | undefined>,
    private readonly mockAllowed: boolean,
  ) {}

  async requestCode(input: { destination: string; channel: ResidentAuthChannel }, context: RequestContext) {
    const channel = input.channel;
    if (channel === "mock" && !this.mockAllowed) throw new ApplicationError("forbidden", otpGenericError);
    const destination = channel === "email" ? input.destination.trim().toLowerCase() : normalizePhone(input.destination);
    if (channel !== "email" && destination.length < 11) throw new ApplicationError("invalid_request", otpGenericError);
    if (channel === "email" && !destination.includes("@")) throw new ApplicationError("invalid_request", otpGenericError);
    const recipientHash = sha256(`${channel}:${destination}`);
    const recent = await this.sql<{ count: number; lastSentAt: Date }[]>`
      select count(*)::int as count, max(last_sent_at) as "lastSentAt" from otp_challenges
      where recipient_hash=${recipientHash} and created_at > now() - interval '1 hour'
    `;
    if ((recent[0]?.count ?? 0) >= otpLimits.hourlySendLimit) throw new ApplicationError("invalid_request", otpGenericError);
    if (recent[0]?.lastSentAt && Date.now() - recent[0].lastSentAt.getTime() < otpLimits.resendCooldownMs) {
      throw new ApplicationError("invalid_request", otpGenericError);
    }
    const code = channel === "mock" || this.mockAllowed ? "000000" : String(randomInt(100000, 999999));
    const challengeId = randomUUID();
    await this.sql`
      insert into otp_challenges (id, channel, recipient_hash, code_hash, expires_at, max_attempts)
      values (${challengeId}, ${channel}, ${recipientHash}, ${sha256(code)}, now() + interval '10 minutes', ${otpLimits.maxAttempts})
    `;
    const provider = this.providers[channel];
    if (!provider) throw new ApplicationError("invalid_request", otpGenericError);
    const sent = await provider.send({ destination, code }, context);
    if (!sent.ok) throw new ApplicationError("invalid_request", otpGenericError);
    await this.sql`insert into audit_logs(event_type,request_id,outcome,metadata) values('OTP_REQUESTED',${context.requestId},'success',${this.sql.json({ channel })})`;
    return { challengeId, channel, expiresAt: new Date(Date.now() + otpLimits.codeTtlMs).toISOString(), maskedDestination: channel === "email" ? destination.replace(/(.{2}).+(@.+)/, "$1•••$2") : maskPhone(destination) };
  }

  async verifyCode(input: { challengeId: string; code: string; destination: string; channel: ResidentAuthChannel }, context: RequestContext) {
    const channel = input.channel;
    const destination = channel === "email" ? input.destination.trim().toLowerCase() : normalizePhone(input.destination);
    const recipientHash = sha256(`${channel}:${destination}`);
    const rows = await this.sql<{ id: string; codeHash: string; expiresAt: Date; attemptCount: number; maxAttempts: number; consumedAt: Date | null }[]>`
      select id, code_hash as "codeHash", expires_at as "expiresAt", attempt_count as "attemptCount", max_attempts as "maxAttempts", consumed_at as "consumedAt"
      from otp_challenges where id=${input.challengeId} and recipient_hash=${recipientHash} limit 1
    `;
    const challenge = rows[0];
    if (!challenge || challenge.consumedAt || challenge.expiresAt <= new Date() || challenge.attemptCount >= challenge.maxAttempts) {
      throw new ApplicationError("unauthenticated", otpGenericError);
    }
    if (challenge.codeHash !== sha256(input.code.trim())) {
      await this.sql`update otp_challenges set attempt_count=attempt_count+1 where id=${challenge.id}`;
      throw new ApplicationError("unauthenticated", otpGenericError);
    }
    await this.sql`update otp_challenges set consumed_at=now(), attempt_count=attempt_count+1 where id=${challenge.id} and consumed_at is null`;
    const user = await this.resolveUser(channel, destination);
    const credential = await this.sessions.create(user.id, "demo");
    await this.sql`insert into audit_logs(event_type,actor_user_id,request_id,outcome,metadata) values('AUTH_SUCCESS',${user.id},${context.requestId},'success',${this.sql.json({ channel, method: "otp" })})`;
    return { credential, user };
  }

  private async resolveUser(channel: ResidentAuthChannel, destination: string) {
    if (channel === "email") {
      const existing = await this.sql<{ id: string; displayName: string; email: string | null }[]>`select id, display_name as "displayName", email from users where lower(email)=${destination} and status='active' limit 1`;
      if (existing[0]) return { id: existing[0].id, displayName: existing[0].displayName, email: existing[0].email };
      const created = await this.sql<{ id: string; displayName: string; email: string | null }[]>`
        insert into users (display_name, email, type, status) values (${destination.split("@")[0]}, ${destination}, 'individual', 'active') returning id, display_name as "displayName", email
      `;
      return created[0];
    }
    const phone = `+${destination}`;
    const existing = await this.sql<{ id: string; displayName: string; email: string | null }[]>`select id, display_name as "displayName", email from users where phone=${phone} and status='active' limit 1`;
    if (existing[0]) return { id: existing[0].id, displayName: existing[0].displayName, email: existing[0].email };
    const created = await this.sql<{ id: string; displayName: string; email: string | null }[]>`
      insert into users (display_name, phone, type, status) values (${phone}, ${phone}, 'individual', 'active') returning id, display_name as "displayName", email
    `;
    return created[0];
  }
}

export class MockOtpProvider implements ResidentAuthProvider {
  readonly name = "mock" as const;
  async send() { return { ok: true as const, value: { messageId: "mock-otp" } }; }
}

export class EmailOtpProvider implements ResidentAuthProvider {
  readonly name = "email" as const;
  constructor(private readonly notifications: NotificationProvider) {}
  async send(input: { destination: string; code: string }, context: RequestContext) {
    return this.notifications.send({ recipientReference: input.destination, templateId: "resident_otp", variables: { code: input.code } }, context);
  }
}

export class WhatsAppOtpProvider implements ResidentAuthProvider {
  readonly name = "whatsapp" as const;
  constructor(private readonly mockFallback: boolean, private readonly notifications: NotificationProvider) {}
  async send(input: { destination: string; code: string }, context: RequestContext) {
    if (this.mockFallback) return { ok: true as const, value: { messageId: "whatsapp-stub" } };
    return this.notifications.send({ recipientReference: input.destination, templateId: "resident_otp_whatsapp", variables: { code: input.code } }, context);
  }
}
