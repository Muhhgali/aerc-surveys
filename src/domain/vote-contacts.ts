import { z } from "zod";
import { toE164Kz } from "@/src/domain/demo-fixtures";

function blankToUndefined(value: unknown) {
  if (value == null) return undefined;
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

export const voteContactsSchema = z.object({
  phone: z.preprocess(blankToUndefined, z.string().max(32).optional()),
  email: z.preprocess(blankToUndefined, z.string().email("Укажите корректный email").max(200).optional()),
  fullName: z.preprocess(blankToUndefined, z.string().min(3, "Укажите ФИО полностью").max(200).optional()),
}).superRefine((value, ctx) => {
  const phone = typeof value.phone === "string" ? toE164Kz(value.phone) : "";
  const email = typeof value.email === "string" ? value.email : "";
  if (value.phone && !phone) {
    ctx.addIssue({ code: "custom", path: ["phone"], message: "Укажите номер телефона полностью" });
  }
  if (!phone && !email) {
    ctx.addIssue({ code: "custom", message: "Укажите телефон или email" });
  }
}).transform((value) => ({
  phone: typeof value.phone === "string" ? (toE164Kz(value.phone) || undefined) : undefined,
  email: typeof value.email === "string" ? value.email : undefined,
  fullName: typeof value.fullName === "string" ? value.fullName.replace(/\s+/g, " ").trim() : undefined,
}));
