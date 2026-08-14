export interface PropertyAccount {
  propertyId: string;
  accountId: string;
  externalAccountId?: string;
  source?: string;
  address: string;
  unit: string;
  ownershipKind: "residential" | "non_residential";
}

export interface VotingEligibility {
  eligible: boolean;
  verified: boolean;
  verificationSource: string;
  property: PropertyAccount;
  reasonCode?: string;
}
