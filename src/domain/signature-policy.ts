export const surveySignatoryRoleKeys = ["meeting_chairman", "secretary", "responsible_person", "council_member"] as const;
export type SurveySignatoryRoleKey = (typeof surveySignatoryRoleKeys)[number];

export interface SignaturePolicyRequirement {
  roleKey: SurveySignatoryRoleKey;
  minRequired: number;
  assignedCount: number;
}

export interface OfficialSignatureRecord {
  roleKey: SurveySignatoryRoleKey;
}

export type SigningState = "none" | "awaiting_signatures" | "partially_signed" | "signed" | "protocol_ready";

export function parseSignaturePolicy(value: unknown): SignaturePolicyRequirement[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    if (!surveySignatoryRoleKeys.includes(record.roleKey as SurveySignatoryRoleKey)) return [];
    const minRequired = Math.max(0, Math.floor(Number(record.minRequired) || 0));
    const assignedCount = Math.max(0, Math.floor(Number(record.assignedCount) || 0));
    return [{ roleKey: record.roleKey as SurveySignatoryRoleKey, minRequired, assignedCount }];
  });
}

export function signaturePolicyFulfilled(policy: readonly SignaturePolicyRequirement[], signatures: readonly OfficialSignatureRecord[]): boolean {
  if (!policy.length) return true;
  const counts = new Map<SurveySignatoryRoleKey, number>();
  for (const signature of signatures) counts.set(signature.roleKey, (counts.get(signature.roleKey) ?? 0) + 1);
  return policy.every((requirement) => (counts.get(requirement.roleKey) ?? 0) >= requirement.minRequired);
}

export function deriveSigningState(input: {
  surveyStatus: string;
  policy: readonly SignaturePolicyRequirement[];
  signatures: readonly OfficialSignatureRecord[];
  protocolReady: boolean;
}): SigningState {
  if (input.surveyStatus !== "closed" && input.surveyStatus !== "archived") return "none";
  if (input.protocolReady && signaturePolicyFulfilled(input.policy, input.signatures)) return "protocol_ready";
  if (!input.policy.some((requirement) => requirement.minRequired > 0)) return input.protocolReady ? "protocol_ready" : "signed";
  if (signaturePolicyFulfilled(input.policy, input.signatures)) return "signed";
  if (input.signatures.length > 0) return "partially_signed";
  return "awaiting_signatures";
}

export const responsiblePersonRequiredForElectronicVoting = false;
