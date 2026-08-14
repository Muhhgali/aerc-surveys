import type { IsoDateTime } from "./shared";
import type { AssuranceLevel } from "./identity";

export interface TrustedSession {
  /** Internal database identifier. It is never sent to the browser. */
  sessionId: string;
  subjectId: string;
  assuranceLevel: AssuranceLevel;
  createdAt: IsoDateTime;
  expiresAt: IsoDateTime;
  revokedAt?: IsoDateTime;
}

export interface SessionCredential {
  session: TrustedSession;
  /** High-entropy bearer token. Only the HttpOnly cookie may contain it. */
  token: string;
}
