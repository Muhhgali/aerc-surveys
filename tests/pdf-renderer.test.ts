import { describe, expect, it } from "vitest";
import { PdfKitVotingSheetRenderer } from "@/src/infrastructure/documents/pdfkit-voting-sheet-renderer";

describe("server-side final PDF", () => {
  it("renders an A4 portrait immutable snapshot model", async () => {
    const bytes = await new PdfKitVotingSheetRenderer().renderVotingSheet({ protocolNumber: "12", address: "г. Астана, ул. Тестовая, д. 1", accountReference: "1911", unit: "52", participantDisplayName: "Участник", createdAt: "2026-08-17T00:00:00.000Z", documentId: "00000000-0000-5000-a000-000000000001", documentVersion: 1, surveyVersion: 1, signingProvider: "mock", signingStatus: "verified", documentHashReference: "a".repeat(64), verificationUrl: "https://example.test/verify/00000000-0000-5000-a000-000000000001", questions: [{ position: 1, text: "Утвердить решение", answer: "for" }] });
    const pdf = Buffer.from(bytes); expect(pdf.subarray(0, 5).toString()).toBe("%PDF-"); expect(pdf.byteLength).toBeGreaterThan(2_000);
  });
});
