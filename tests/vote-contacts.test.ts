import { describe, expect, it } from "vitest";
import { voteContactsSchema } from "@/src/domain/vote-contacts";

describe("vote contact details", () => {
  it("treats empty email as omitted and normalizes a formatted phone", () => {
    expect(voteContactsSchema.parse({ phone: "+7 701 000 00 00", email: "" })).toEqual({
      phone: "+77010000000",
      email: undefined,
    });
  });

  it("accepts email only", () => {
    expect(voteContactsSchema.parse({ email: "owner@example.kz" })).toEqual({
      phone: undefined,
      email: "owner@example.kz",
    });
  });

  it("rejects an autofilled invalid email even when phone is present", () => {
    expect(() => voteContactsSchema.parse({ phone: "+77010000000", email: "not-an-email" })).toThrow();
  });
});
