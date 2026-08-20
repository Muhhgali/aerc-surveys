import { describe, expect, it } from "vitest";
import { fillProtocolTemplate, fillVotingSheetTemplate, formatBuildingAddress, protocolDocumentTimestamp } from "@/src/domain/official-document-template";
import { parseOrganizationCreate, parseOrganizationUpdate } from "@/src/domain/organization";

describe("organization create", () => {
  it("accepts a 12-digit BIN and known type", () => {
    expect(parseOrganizationCreate({ bin: "123 456 789 012", legalName: "ТОО «Сервис»", displayName: "Сервис", type: "management_company" })).toEqual({
      bin: "123456789012", legalName: "ТОО «Сервис»", displayName: "Сервис", type: "management_company",
      contactName: null, contactPhone: null, contactEmail: null,
    });
  });
  it("normalizes contact details", () => {
    expect(parseOrganizationCreate({
      bin: "123456789012", legalName: "ТОО «Сервис»", displayName: "Сервис", type: "osi",
      contactName: "  Иванов И. И. ", contactPhone: "8 (701) 000-00-00", contactEmail: " office@osi.kz ",
    })).toMatchObject({ contactName: "Иванов И. И.", contactPhone: "+77010000000", contactEmail: "office@osi.kz" });
  });
  it("rejects a short BIN, unknown type and malformed contacts", () => {
    expect(() => parseOrganizationCreate({ bin: "123", legalName: "ТОО", displayName: "Орг", type: "osi" })).toThrow(/БИН/);
    expect(() => parseOrganizationCreate({ bin: "123456789012", legalName: "ТОО", displayName: "Орг", type: "llc" })).toThrow(/тип/);
    expect(() => parseOrganizationCreate({ bin: "123456789012", legalName: "ТОО", displayName: "Орг", type: "osi", contactEmail: "office" })).toThrow(/email/);
    expect(() => parseOrganizationCreate({ bin: "123456789012", legalName: "ТОО", displayName: "Орг", type: "osi", contactPhone: "123" })).toThrow(/телефон/);
  });
  it("requires a valid status on update", () => {
    expect(parseOrganizationUpdate({ legalName: "ТОО «Сервис»", displayName: "Сервис", type: "osi", status: "inactive" })).toMatchObject({ status: "inactive" });
    expect(() => parseOrganizationUpdate({ legalName: "ТОО «Сервис»", displayName: "Сервис", type: "osi", status: "deleted" })).toThrow(/статус/);
  });
});

describe("official document templates", () => {
  it("fills the voting sheet labels from the Word sample", () => {
    const filled = fillVotingSheetTemplate({
      protocolNumber: "12", sheetNumber: 7, address: "г. Астана, ул. Геодезическая, д. 12", unit: "52",
      participantDisplayName: "Зубенко Михаил Петрович", phone: "+77010000000", email: "demo@aerc.kz",
      createdAt: "2026-08-20T10:00:00.000Z", submittedAt: "2026-08-20T10:05:00.000Z", electronicVoting: true, hasVisualSignature: true,
    });
    expect(filled.title).toContain("Лист № 7 голосования при проведении письменного опроса");
    expect(filled.responsiblePersons).toBe("—");
    expect(filled.responsibleSignatureLines[0]).toBe("не требуется");
    expect(filled.ownerFullName).toBe("Зубенко Михаил Петрович");
    expect(filled.ownerContacts).toContain("+77010000000");
    expect(filled.footnote).toContain("объектов информатизации");
    expect(filled.tableHeaders[2]).toContain("За");
  });

  it("fills appointed responsible persons and later official signature captions", () => {
    const filled = fillVotingSheetTemplate({
      protocolNumber: "41", sheetNumber: 1, address: "г. Астана, ул. Геодезическая, д. 12", unit: "52",
      participantDisplayName: "Зубенко Михаил Петрович", createdAt: "2026-08-20T10:00:00.000Z",
      electronicVoting: true, hasVisualSignature: true,
      signatories: [
        { roleKey: "responsible_person", displayName: "Жумабаев Арман Кайратович", signed: true },
        { roleKey: "council_member", displayName: "Сатпаев Нурлан Темирович", signed: true },
        { roleKey: "council_member", displayName: "Ибраева Дина Маратовна", signed: false },
        { roleKey: "council_member", displayName: "Оспанов Бауыржан Серикович" },
      ],
    });
    expect(filled.responsiblePersons).toBe("Жумабаев Арман Кайратович");
    expect(filled.responsibleSignatureLines[0]).toContain("приложена");
    expect(filled.councilSignatureLines).toHaveLength(3);
    expect(filled.councilSignatureLines[0]).toContain("Сатпаев");
  });

  it("fills the protocol numbered fields, paper/electronic totals and official roles", () => {
    const filled = fillProtocolTemplate({
      protocolNumber: "12", address: "г. Астана, ул. Геодезическая, д. 12", meetingForm: "electronic",
      createdAt: "2026-08-20T12:00:00.000Z", apartmentOwners: 40, nonResidentialOwners: 2, eligibleTotal: 42, participated: 21,
      questions: [{ position: 1, text: "Утвердить подрядчика", for: 18, against: 2, abstain: 1, accepted: true }],
      signatories: [
        { roleKey: "meeting_chairman", displayName: "Иванов И.И." },
        { roleKey: "secretary", displayName: "Петрова А.А." },
        { roleKey: "council_member", displayName: "Сидоров С.С." },
      ],
    });
    expect(filled.title).toContain("Протокол № 12 собрания собственников квартир, нежилых помещений");
    expect(filled.apartmentOwners).toBe("40");
    expect(filled.paperResults).toContain("0");
    expect(filled.electronicResults).toContain("21");
    expect(filled.decisions[0]).toContain("ПРИНЯТО");
    expect(filled.chairman).toBe("Иванов И.И.");
    expect(filled.secretary).toBe("Петрова А.А.");
    expect(filled.councilMembers[0]).toBe("Сидоров С.С.");
    expect(filled.councilMembers).toHaveLength(3);
    expect(filled.participated).toBe("21");
    expect(filled.results[0].tallies).toContain("За 18");
    expect(filled.meetingForm).toBe("Электронное");
  });

  it("renders every assigned council member instead of slicing to three", () => {
    const filled = fillProtocolTemplate({
      protocolNumber: "41", address: "г. Астана, ул. Геодезическая, д. 12", meetingForm: "electronic",
      createdAt: "2026-08-20T12:00:00.000Z", apartmentOwners: 1, nonResidentialOwners: 0, eligibleTotal: 1, participated: 1,
      questions: [{ position: 1, text: "Камеры", for: 1, against: 0, abstain: 0, accepted: true }],
      signatories: [
        { roleKey: "council_member", displayName: "Первый" },
        { roleKey: "council_member", displayName: "Второй" },
        { roleKey: "council_member", displayName: "Третий" },
        { roleKey: "council_member", displayName: "Четвёртый" },
      ],
    });
    expect(filled.councilMembers).toEqual(["Первый", "Второй", "Третий", "Четвёртый"]);
  });

  it("formats a building address without inventing missing parts", () => {
    expect(formatBuildingAddress({ city: "Астана", street: "Геодезическая", building: "12" })).toBe("г. Астана, ул. Геодезическая, д. 12");
    expect(formatBuildingAddress({ city: null, street: null, building: null })).toBe("");
  });

  it("uses the actual close time when the planned deadline is still in the future", () => {
    const now = new Date("2026-08-20T16:33:00.000Z");
    expect(protocolDocumentTimestamp("2026-09-19T16:33:00.000Z", now)).toBe(now.toISOString());
    expect(protocolDocumentTimestamp("2026-08-19T16:33:00.000Z", now)).toBe("2026-08-19T16:33:00.000Z");
  });
});
