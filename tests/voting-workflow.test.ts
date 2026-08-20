import { describe, expect, it } from "vitest";
import { canInviteWithPermissions, principalCan, type AdminPrincipal } from "@/src/domain/admin-rbac";
import { deriveSigningState, signaturePolicyFulfilled } from "@/src/domain/signature-policy";
import { decorateChoiceCounts, evaluateQuestionDecision } from "@/src/domain/voting-rules";

const superAdmin: AdminPrincipal = {
  userId: "sa", displayName: "SA", roles: ["super_admin"], permissions: ["admin.access", "user.invite", "role.manage"],
  platformPermissions: ["admin.access", "user.invite", "role.manage"], organizationGrants: [], platformWide: true,
};

const chairman: AdminPrincipal = {
  userId: "ch", displayName: "Chairman", roles: [], permissions: ["admin.access", "user.invite", "survey.create"],
  platformPermissions: [],
  organizationGrants: [{ organizationId: "org-1", role: "chairman", permissions: ["admin.access", "user.invite", "survey.create"] }],
  platformWide: false,
};

describe("voting rule engine", () => {
  it("accepts 51 of 100 eligible even when turnout is low", () => {
    const decision = evaluateQuestionDecision({ type: "percentage_of_all_eligible", thresholdPercent: 51 }, { for: 51, against: 10, abstain: 5, eligible: 100, participated: 66 });
    expect(decision.accepted).toBe(true);
    expect(decision.requiredFor).toBe(51);
  });

  it("rejects 50 of 100 eligible regardless of participants", () => {
    const decision = evaluateQuestionDecision({ type: "percentage_of_all_eligible", thresholdPercent: 51 }, { for: 50, against: 0, abstain: 0, eligible: 100, participated: 50 });
    expect(decision.accepted).toBe(false);
    expect(decision.explanationRu).toMatch(/НЕ ПРИНЯТО/);
  });

  it("computes percentages from submitted choices without inventing a legal threshold", () => {
    expect(decorateChoiceCounts({ for: 2, against: 1, abstain: 1 })).toMatchObject({ total: 4, percentFor: 50, percentAgainst: 25, percentAbstain: 25 });
  });
});

describe("signature policy", () => {
  const policy = [
    { roleKey: "meeting_chairman" as const, minRequired: 1, assignedCount: 1 },
    { roleKey: "secretary" as const, minRequired: 1, assignedCount: 1 },
    { roleKey: "council_member" as const, minRequired: 1, assignedCount: 3 },
  ];

  it("is fulfilled after chairman, secretary and one council member", () => {
    expect(signaturePolicyFulfilled(policy, [
      { roleKey: "meeting_chairman" }, { roleKey: "secretary" }, { roleKey: "council_member" },
    ])).toBe(true);
  });

  it("treats an empty policy as already fulfilled so protocol can be generated", () => {
    expect(signaturePolicyFulfilled([], [])).toBe(true);
  });

  it("stays open without the secretary", () => {
    expect(signaturePolicyFulfilled(policy, [{ roleKey: "meeting_chairman" }, { roleKey: "council_member" }])).toBe(false);
    expect(deriveSigningState({ surveyStatus: "closed", policy, signatures: [{ roleKey: "meeting_chairman" }], protocolReady: false })).toBe("partially_signed");
  });
});

describe("scoped RBAC", () => {
  it("lets super_admin invite any organization role except self-elevation is still actor-checked", () => {
    expect(principalCan(superAdmin, "user.invite")).toBe(true);
    expect(canInviteWithPermissions(chairman, ["survey.create"], "org-1")).toBe(true);
    expect(canInviteWithPermissions(chairman, ["survey.create"], "org-2")).toBe(false);
  });

  it("does not grant chairman platform-wide survey access", () => {
    expect(principalCan(chairman, "survey.create", { organizationId: "org-2" })).toBe(false);
    expect(principalCan(chairman, "survey.create", { organizationId: "org-1" })).toBe(true);
  });

  it("blocks inviting with permissions the chairman does not hold", () => {
    expect(canInviteWithPermissions(chairman, ["role.manage"], "org-1")).toBe(false);
    expect(canInviteWithPermissions(chairman, ["survey.results.read_live"], "org-1")).toBe(false);
  });
});
