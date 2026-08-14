import type { IdentityMethod, VerifiedIdentity } from "@/src/domain/identity";

export interface CurrentUser {
  id: string;
  displayName: string;
}

export interface AuthenticationRepository {
  resolveVerifiedIdentity(provider: IdentityMethod, identity: VerifiedIdentity): Promise<CurrentUser | null>;
  findActiveUser(userId: string): Promise<CurrentUser | null>;
}
