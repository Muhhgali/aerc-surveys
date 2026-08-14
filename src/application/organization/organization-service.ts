import { ApplicationError } from "@/src/application/errors";
import type { OrganizationMembershipRepository } from "@/src/application/ports/data-repositories";

export class OrganizationService {
  constructor(private readonly memberships: OrganizationMembershipRepository) {}

  async requireMembership(userId: string, organizationId: string): Promise<void> {
    if (!(await this.memberships.hasActiveMembership(userId, organizationId))) {
      throw new ApplicationError("unauthorized_property", "Organization membership is not verified");
    }
  }
}
