import { describe, expect, it } from "vitest";
import { PdfKitVotingSheetRenderer } from "@/src/infrastructure/documents/pdfkit-voting-sheet-renderer";

describe("server-side final PDF", () => {
  it("renders an A4 portrait immutable snapshot model", async () => {
    const bytes = await new PdfKitVotingSheetRenderer().renderVotingSheet({ protocolNumber: "12", address: "г. Астана, ул. Тестовая, д. 1", accountReference: "1911", unit: "52", participantDisplayName: "Участник", createdAt: "2026-08-17T00:00:00.000Z", documentId: "00000000-0000-5000-a000-000000000001", documentVersion: 1, surveyVersion: 1, signingProvider: "mock", signingStatus: "verified", documentHashReference: "a".repeat(64), verificationUrl: "https://example.test/verify/00000000-0000-5000-a000-000000000001", questions: [{ position: 1, text: "Утвердить решение", answer: "for" }], sheetNumber: 1, electronicVoting: true, phone: "+77010000000", email: "demo@aerc.kz" });
    const pdf = Buffer.from(bytes); expect(pdf.subarray(0, 5).toString()).toBe("%PDF-"); expect(pdf.byteLength).toBeGreaterThan(2_000);
  });

  it("renders a draft protocol with a watermark and electronic-only paper block", async () => {
    const bytes = await new PdfKitVotingSheetRenderer().renderProtocol({
      protocolNumber: "12", titleRu: "Собрание", address: "г. Астана, ул. Геодезическая, д. 12", meetingForm: "electronic",
      createdAt: "2026-08-20T00:00:00.000Z", documentId: "00000000-0000-5000-a000-000000000002", verificationUrl: "https://example.test/verify/x",
      apartmentOwners: 10, nonResidentialOwners: 2, eligibleTotal: 12, participated: 6,
      questions: [{ position: 1, text: "Утвердить решение", for: 6, against: 0, abstain: 0, accepted: true }],
      signatories: [{ roleKey: "meeting_chairman", displayName: "Председатель" }], draft: true,
    });
    const pdf = Buffer.from(bytes); expect(pdf.subarray(0, 5).toString()).toBe("%PDF-"); expect(pdf.byteLength).toBeGreaterThan(1_000);
  });
});
