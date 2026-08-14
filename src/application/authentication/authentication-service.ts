import { ApplicationError } from "@/src/application/errors";
import type { AuthenticationRepository, CurrentUser } from "@/src/application/ports/authentication-repository";
import type { IdentityProvider } from "@/src/application/ports/providers";
import type { SessionService } from "@/src/application/session/session-service";
import type { RequestContext } from "@/src/domain/shared";
import type { SessionCredential } from "@/src/domain/session";

export class AuthenticationService {
  constructor(
    private readonly provider: IdentityProvider,
    private readonly identities: AuthenticationRepository,
    private readonly sessions: SessionService,
  ) {}

  async authenticateMock(callbackUri: string, context: RequestContext): Promise<{ credential: SessionCredential; user: CurrentUser }> {
    if (this.provider.name !== "mock") throw new ApplicationError("not_found", "Mock authentication is unavailable");
    const challenge = await this.provider.startAuthentication({ callbackUri }, context);
    if (!challenge.ok) throw new ApplicationError("unauthenticated", "Identity authentication could not be started");
    const verified = await this.provider.completeAuthentication({ challengeId: challenge.value.challengeId, response: "approved" }, context);
    if (!verified.ok) throw new ApplicationError("unauthenticated", "Identity verification failed");
    const user = await this.identities.resolveVerifiedIdentity(this.provider.name, verified.value);
    if (!user) throw new ApplicationError("unauthenticated", "Verified identity is not registered");
    const credential = await this.sessions.create(user.id, verified.value.assuranceLevel);
    return { credential, user };
  }

  async currentUser(userId: string): Promise<CurrentUser> {
    const user = await this.identities.findActiveUser(userId);
    if (!user) throw new ApplicationError("unauthenticated", "Session user is inactive");
    return user;
  }
}
