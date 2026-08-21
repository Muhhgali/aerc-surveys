/** Demo identity shown in the owner app, PDFs and admin reports. Not a production identity source. */
export const DEMO_OWNER_FULL_NAME = "Зубенко Михаил Петрович";
export const DEMO_OWNER_PHONE = "+77010000000";
export const DEMO_OWNER_OTP = "000000";

export function kzPhoneDigits(value: string): string {
  let digits = value.replace(/\D/g, "");
  if (!digits) return "";
  const international = value.includes("+") || digits.length === 11;
  if (international) {
    if (digits.startsWith("8")) digits = `7${digits.slice(1)}`;
    if (!digits.startsWith("7")) digits = `7${digits}`;
    return digits.slice(0, 11);
  }
  if (digits.startsWith("8")) digits = digits.slice(1);
  return `7${digits}`.slice(0, 11);
}

export function formatKzPhone(value: string): string {
  const digits = kzPhoneDigits(value);
  if (!digits) return "";
  const national = digits.startsWith("7") ? digits.slice(1) : digits;
  const parts = [national.slice(0, 3), national.slice(3, 6), national.slice(6, 8), national.slice(8, 10)].filter(Boolean);
  return `+7${parts.length ? ` ${parts.join(" ")}` : ""}`;
}

export function formatKzNational(value: string): string {
  const digits = kzPhoneDigits(value);
  const national = digits.startsWith("7") ? digits.slice(1) : digits;
  return [national.slice(0, 3), national.slice(3, 6), national.slice(6, 8), national.slice(8, 10)].filter(Boolean).join(" ");
}

export function toE164Kz(value: string): string {
  const digits = kzPhoneDigits(value);
  return digits.length === 11 ? `+${digits}` : "";
}

/** Map a tel input or paste (national, 8…, or +7…) to a stored +7XXXXXXXXXX value. */
export function kzPhoneFromInput(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length >= 11) return toE164Kz(value);
  const national = digits.startsWith("8") ? digits.slice(1) : digits;
  return `+7${national.slice(0, 10)}`;
}

/** Mock admin console credentials. Accepted only when ENABLE_MOCK_AUTH and identity=mock. */
export const DEMO_ADMIN_LOGIN = "admin@aerc.kz";
export const DEMO_ADMIN_PASSWORD = "DemoAdmin26";

/** Organization chairman: org-scoped console account, not a platform super_admin. */
export const DEMO_CHAIRMAN_LOGIN = "chairman@geodez12.kz";
export const DEMO_CHAIRMAN_PASSWORD = "Chairman26";

export function displayNameInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}`.toUpperCase() || "—";
}
