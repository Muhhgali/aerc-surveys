export interface PropertyAccount {
  propertyId: string;
  accountId: string;
  address: string;
  unit: string;
  ownershipKind: "residential" | "non_residential";
}

export interface VotingEligibility {
  eligible: boolean;
  property: PropertyAccount;
  reasonCode?: string;
}
