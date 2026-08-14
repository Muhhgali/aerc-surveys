import type { IsoDateTime } from "./shared";

export type IdentityMethod = "mock" | "egov" | "digital_id";
export type AssuranceLevel = "demo" | "verified" | "strong";

export interface IdentityChallenge {
  challengeId: string;
  expiresAt: IsoDateTime;
  verificationUri?: string;
}

export interface VerifiedIdentity {
  subjectId: string;
  displayName: string;
  assuranceLevel: AssuranceLevel;
  verifiedAt: IsoDateTime;
  attributes: Readonly<Record<string, string>>;
}
