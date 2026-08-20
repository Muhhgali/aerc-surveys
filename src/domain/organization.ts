import { toE164Kz } from "@/src/domain/demo-fixtures";

export const organizationTypes = ["osi", "ksk", "management_company", "other"] as const;
export type OrganizationType = (typeof organizationTypes)[number];

export const organizationTypeNames: Record<OrganizationType, string> = {
  osi: "ОСИ",
  ksk: "КСК",
  management_company: "Управляющая компания",
  other: "Иное",
};

export const organizationStatuses = ["active", "inactive"] as const;
export type OrganizationStatus = (typeof organizationStatuses)[number];

export interface OrganizationContacts {
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
}

export interface OrganizationCreateInput extends OrganizationContacts {
  bin: string;
  legalName: string;
  displayName: string;
  type: OrganizationType;
}

export interface OrganizationUpdateInput extends OrganizationContacts {
  legalName: string;
  displayName: string;
  type: OrganizationType;
  status: OrganizationStatus;
}

export class OrganizationValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrganizationValidationError";
  }
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function optionalText(value: string | null | undefined, max: number, label: string): string | null {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return null;
  if (trimmed.length > max) throw new OrganizationValidationError(`${label}: не более ${max} символов`);
  return trimmed;
}

function contacts(input: Partial<OrganizationContacts>): OrganizationContacts {
  const contactName = optionalText(input.contactName, 200, "Контактное лицо");
  const rawPhone = optionalText(input.contactPhone, 32, "Телефон");
  const contactEmail = optionalText(input.contactEmail, 200, "Email");
  if (contactEmail && !emailPattern.test(contactEmail)) throw new OrganizationValidationError("Укажите корректный email организации");
  const contactPhone = rawPhone ? toE164Kz(rawPhone) : null;
  if (rawPhone && !contactPhone) throw new OrganizationValidationError("Укажите телефон организации полностью");
  return { contactName, contactPhone, contactEmail };
}

function names(input: { legalName: string; displayName: string; type: string }) {
  const legalName = input.legalName.trim();
  const displayName = input.displayName.trim();
  if (legalName.length < 2 || legalName.length > 300) throw new OrganizationValidationError("Юридическое наименование: 2–300 символов");
  if (displayName.length < 2 || displayName.length > 200) throw new OrganizationValidationError("Краткое название: 2–200 символов");
  if (!organizationTypes.includes(input.type as OrganizationType)) throw new OrganizationValidationError("Выберите тип организации");
  return { legalName, displayName, type: input.type as OrganizationType };
}

export function parseOrganizationCreate(input: {
  bin: string;
  legalName: string;
  displayName: string;
  type: string;
} & Partial<OrganizationContacts>): OrganizationCreateInput {
  const bin = input.bin.replace(/\D/g, "");
  if (!/^\d{12}$/.test(bin)) throw new OrganizationValidationError("БИН должен содержать 12 цифр");
  return { bin, ...names(input), ...contacts(input) };
}

export function parseOrganizationUpdate(input: {
  legalName: string;
  displayName: string;
  type: string;
  status: string;
} & Partial<OrganizationContacts>): OrganizationUpdateInput {
  if (!organizationStatuses.includes(input.status as OrganizationStatus)) throw new OrganizationValidationError("Некорректный статус организации");
  return { ...names(input), status: input.status as OrganizationStatus, ...contacts(input) };
}
