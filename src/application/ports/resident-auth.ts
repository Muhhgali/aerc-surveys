import type { RequestContext, Result } from "@/src/domain/shared";
import type { ResidentAuthChannel } from "@/src/domain/resident-auth";
import type { ProviderError, ProviderResult } from "@/src/application/ports/providers";

export interface OtpChallenge {
  challengeId: string;
  channel: ResidentAuthChannel;
  expiresAt: string;
  maskedDestination: string;
}

export interface ResidentAuthProvider {
  readonly name: ResidentAuthChannel;
  send(input: { destination: string; code: string }, context: RequestContext): Promise<ProviderResult<{ messageId: string }>>;
}

export type { ProviderError, ProviderResult, Result };
