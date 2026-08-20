import { meetingFormLabels, type MeetingForm } from "@/src/domain/meeting-form";
import type { SurveySignatoryRoleKey } from "@/src/domain/signature-policy";
import { formatChoiceTallyLine } from "@/src/domain/voting-rules";

const almatyDate = new Intl.DateTimeFormat("ru-RU", {
  timeZone: "Asia/Almaty",
  day: "numeric",
  month: "long",
  year: "numeric",
});
const almatyTime = new Intl.DateTimeFormat("ru-RU", {
  timeZone: "Asia/Almaty",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function protocolDocumentTimestamp(closesAt: string | null | undefined, now = new Date()): string {
  if (!closesAt) return now.toISOString();
  const planned = new Date(closesAt);
  if (Number.isNaN(planned.getTime())) return now.toISOString();
  return planned.getTime() <= now.getTime() ? planned.toISOString() : now.toISOString();
}

export function formatOfficialDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return `${almatyDate.format(date)} время ${almatyTime.format(date)}`;
}

export function meetingFormForProtocol(form: string | undefined): string {
  if (form && form in meetingFormLabels) return meetingFormLabels[form as MeetingForm].ru;
  return form || "—";
}

export function formatBuildingAddress(parts: { city?: string | null; street?: string | null; building?: string | null }): string {
  const city = parts.city?.trim();
  const street = parts.street?.trim();
  const building = parts.building?.trim();
  if (!city && !street && !building) return "";
  return [city ? `г. ${city}` : "", street ? `ул. ${street}` : "", building ? `д. ${building}` : ""].filter(Boolean).join(", ");
}

export interface NamedSignatory {
  roleKey: string;
  displayName: string;
  signed?: boolean;
}

function namesForRole(signatories: readonly NamedSignatory[], role: SurveySignatoryRoleKey): NamedSignatory[] {
  return signatories.filter((row) => row.roleKey === role && row.displayName.trim());
}

function firstOrDash(values: readonly NamedSignatory[]): string {
  return values[0]?.displayName.trim() || "—";
}

function signatureCaption(row: NamedSignatory | undefined, unsigned: string): string {
  if (!row?.displayName.trim()) return unsigned;
  return row.signed ? `${row.displayName.trim()} / приложена` : row.displayName.trim();
}

function padSignatories(rows: readonly NamedSignatory[], minimum: number): NamedSignatory[] {
  const next = [...rows];
  while (next.length < minimum) next.push({ roleKey: "council_member", displayName: "" });
  return next;
}

export interface VotingSheetTemplateSource {
  protocolNumber: string;
  sheetNumber?: number;
  address: string;
  unit: string;
  participantDisplayName: string;
  phone?: string | null;
  email?: string | null;
  submittedAt?: string;
  createdAt: string;
  electronicVoting?: boolean;
  signatories?: readonly NamedSignatory[];
  hasVisualSignature?: boolean;
}

export function fillVotingSheetTemplate(source: VotingSheetTemplateSource) {
  const electronic = source.electronicVoting !== false;
  const signatories = source.signatories ?? [];
  const responsible = namesForRole(signatories, "responsible_person");
  const council = namesForRole(signatories, "council_member");
  const contacts = [source.phone, source.email].filter((value): value is string => Boolean(value && value.trim()));
  const responsibleNames = responsible.map((row) => row.displayName.trim()).filter(Boolean);
  return {
    title: `Лист № ${source.sheetNumber ?? "—"} голосования при проведении письменного опроса собственников квартир, нежилых помещений`,
    dateTime: formatOfficialDateTime(source.submittedAt ?? source.createdAt),
    buildingAddress: source.address.trim() || "—",
    responsiblePersons: responsibleNames.length ? responsibleNames.join(", ") : "—",
    ownerFullName: source.participantDisplayName.trim() || "—",
    ownerAddress: [source.address.trim(), source.unit ? `кв./пом. ${source.unit}` : ""].filter(Boolean).join(", ") || "—",
    ownerContacts: contacts.length ? contacts.join(" · ") : "не указаны (на усмотрение собственника)",
    ownerSignature: source.hasVisualSignature ? "приложена" : "—",
    responsibleSignatureLines: (responsible.length ? responsible : [{ roleKey: "responsible_person", displayName: "" }]).map((row) => (
      electronic && !row.signed ? "не требуется" : signatureCaption(row, "—")
    )),
    councilSignatureLines: padSignatories(council, 2).map((row) => signatureCaption(row, "—")),
    footnote: "* при голосовании посредством объектов информатизации в сфере жилищных отношений и жилищно-коммунального хозяйства не требуется и исключается.",
    tableHeaders: ["№", "Вопросы, внесенные для обсуждения", "Голосую «За» (подпись)", "«Против» (подпись)", "«Воздержусь» (подпись)"] as const,
  };
}

export interface ProtocolTemplateQuestion {
  position: number;
  text: string;
  for: number;
  against: number;
  abstain: number;
  accepted: boolean;
}

export interface ProtocolTemplateSource {
  protocolNumber: string;
  address: string;
  meetingForm: string;
  createdAt: string;
  apartmentOwners: number;
  nonResidentialOwners: number;
  eligibleTotal: number;
  participated: number;
  questions: readonly ProtocolTemplateQuestion[];
  signatories: readonly NamedSignatory[];
}

export function fillProtocolTemplate(source: ProtocolTemplateSource) {
  const chairman = namesForRole(source.signatories, "meeting_chairman");
  const secretary = namesForRole(source.signatories, "secretary");
  const council = namesForRole(source.signatories, "council_member");
  return {
    title: `Протокол № ${source.protocolNumber} собрания собственников квартир, нежилых помещений многоквартирного жилого дома (проводимый путем письменного опроса)`,
    dateTime: formatOfficialDateTime(source.createdAt),
    buildingAddress: source.address.trim() || "—",
    apartmentOwners: String(source.apartmentOwners),
    nonResidentialOwners: String(source.nonResidentialOwners),
    participated: String(source.participated),
    meetingForm: meetingFormForProtocol(source.meetingForm),
    agenda: source.questions.map((question) => `${question.position}. ${question.text}`),
    results: source.questions.map((question) => ({
      heading: `${question.position}. ${question.text}`,
      tallies: formatChoiceTallyLine(question),
    })),
    paperResults: "0 (электронное голосование; бумажные листы не применялись)",
    electronicResults: `${source.participated} электронных листов опросников`,
    decisions: source.questions.map((question) => `${question.position}. ${question.accepted ? "ПРИНЯТО" : "НЕ ПРИНЯТО"} — ${question.text}`),
    chairman: firstOrDash(chairman),
    secretary: firstOrDash(secretary),
    chairmanSigned: Boolean(chairman[0]?.signed),
    secretarySigned: Boolean(secretary[0]?.signed),
    councilMembers: padSignatories(council, 3).map((row) => row.displayName.trim() || "—"),
    councilSigned: padSignatories(council, 3).map((row) => Boolean(row.signed && row.displayName.trim())),
  };
}
