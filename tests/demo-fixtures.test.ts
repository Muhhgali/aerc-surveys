import { describe, expect, it } from "vitest";
import { DEMO_ADMIN_LOGIN, DEMO_OWNER_FULL_NAME, displayNameInitials, formatKzPhone, kzPhoneDigits, kzPhoneFromInput, toE164Kz } from "@/src/domain/demo-fixtures";
import { isDemoAdminPassword } from "@/src/infrastructure/auth/demo-admin-credentials";

describe("demo identity fixtures", () => {
  it("uses the agreed owner full name", () => {
    expect(DEMO_OWNER_FULL_NAME).toBe("Зубенко Михаил Петрович");
    expect(displayNameInitials(DEMO_OWNER_FULL_NAME)).toBe("ЗМ");
  });

  it("formats Kazakhstan demo phone as the owner types", () => {
    expect(kzPhoneDigits("87010000000")).toBe("77010000000");
    expect(formatKzPhone("+77010000000")).toBe("+7 701 000 00 00");
    expect(formatKzPhone("701")).toBe("+7 701");
    expect(formatKzPhone("+7 701")).toBe("+7 701");
  });

  it("accepts a full phone paste into the national field", () => {
    expect(kzPhoneFromInput("+77010000000")).toBe("+77010000000");
    expect(kzPhoneFromInput("87010000000")).toBe("+77010000000");
    expect(kzPhoneFromInput("701 000 00 00")).toBe("+77010000000");
    expect(toE164Kz("+7 701 000 00 00")).toBe("+77010000000");
  });

  it("accepts only the mock admin password pair", () => {
    expect(isDemoAdminPassword(DEMO_ADMIN_LOGIN, "DemoAdmin26")).toBe(true);
    expect(isDemoAdminPassword("  ADMIN@aerc.kz ", "DemoAdmin26")).toBe(true);
    expect(isDemoAdminPassword(DEMO_ADMIN_LOGIN, "wrong")).toBe(false);
    expect(isDemoAdminPassword("owner@aerc.kz", "DemoAdmin26")).toBe(false);
    expect(isDemoAdminPassword("chairman@geodez12.kz", "Chairman26")).toBe(false);
  });
});
