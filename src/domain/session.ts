import type { IsoDateTime } from "./shared";
import type { AssuranceLevel } from "./identity";

export interface TrustedSession {
  sessionId: string;
  subjectId: string;
  assuranceLevel: AssuranceLevel;
  createdAt: IsoDateTime;
  expiresAt: IsoDateTime;
  revokedAt?: IsoDateTime;
}
