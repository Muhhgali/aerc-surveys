import { ApplicationError } from "@/src/application/errors";
import type { PersonalAccountRepository, LocalPersonalAccount } from "@/src/application/ports/data-repositories";
import type { PropertyProvider } from "@/src/application/ports/providers";
import type { RequestContext } from "@/src/domain/shared";

export class PropertyService {
  constructor(
    private readonly provider: PropertyProvider,
    private readonly accounts: PersonalAccountRepository,
  ) {}

  async resolveForIdentity(subjectId: string, accountReference: string, context: RequestContext): Promise<LocalPersonalAccount> {
    const resolved = await this.provider.resolveAccount({ subjectId, accountReference }, context);
    if (!resolved.ok) {
      if (resolved.error.code === "unauthorized") {
        throw new ApplicationError("unauthorized_property", "Identity is not verified for this personal account");
      }
      throw new ApplicationError("invalid_personal_account", "Personal account was not found");
    }

    const eligibility = await this.provider.checkVotingEligibility({
      subjectId,
      propertyId: resolved.value.propertyId,
      surveyId: "account-resolution",
    }, context);
    if (!eligibility.ok || !eligibility.value.eligible || !eligibility.value.verified) {
      throw new ApplicationError("unauthorized_property", "Identity is not verified for this property");
    }

    const local = await this.accounts.findActiveByReference(resolved.value.source ?? this.provider.name, resolved.value.accountId);
    if (!local) throw new ApplicationError("invalid_personal_account", "Personal account is absent from the local read model");
    return local;
  }
}
