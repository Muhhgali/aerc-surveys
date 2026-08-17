import "server-only";

import { join } from "node:path";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import type { PdfRenderer, VotingSheetPdfModel } from "@/src/application/ports/pdf-renderer";

const regularFont = join(process.cwd(), "node_modules", "@fontsource", "noto-sans", "files", "noto-sans-cyrillic-400-normal.woff");
const boldFont = join(process.cwd(), "node_modules", "@fontsource", "noto-sans", "files", "noto-sans-cyrillic-700-normal.woff");

export class PdfKitVotingSheetRenderer implements PdfRenderer {
  async renderVotingSheet(model: VotingSheetPdfModel): Promise<Uint8Array> {
    const document = new PDFDocument({ size: "A4", layout: "portrait", margin: 40, font: regularFont, info: { Title: `Лист голосования — протокол №${model.protocolNumber}`, CreationDate: new Date(model.createdAt) } });
    document.registerFont("Noto", regularFont); document.registerFont("NotoBold", boldFont);
    const chunks: Buffer[] = [];
    document.on("data", (chunk: Buffer) => chunks.push(chunk));
    const completed = new Promise<Uint8Array>((resolve, reject) => { document.on("end", () => resolve(new Uint8Array(Buffer.concat(chunks)))); document.on("error", reject); });
    const qr = await QRCode.toBuffer(model.verificationUrl, { type: "png", width: 180, margin: 1, errorCorrectionLevel: "M" });
    this.header(document, model, qr); this.table(document, model); this.footer(document, model); document.end();
    return completed;
  }

  private header(doc: PDFKit.PDFDocument, model: VotingSheetPdfModel, qr: Buffer) {
    doc.font("NotoBold").fontSize(17).fillColor("#102a43").text("ЛИСТ ГОЛОСОВАНИЯ", 40, 38, { width: 400 });
    doc.fontSize(11).text(`Протокол №${model.protocolNumber}`, 40, 65);
    doc.font("Noto").fontSize(9).fillColor("#334e68").text(model.address, 40, 88, { width: 390 });
    doc.text(`Лицевой счёт: ${model.accountReference} · помещение: ${model.unit}`, 40, 104);
    doc.image(qr, 485, 35, { fit: [70, 70] });
    doc.fontSize(6.5).text("QR ведёт на проверку документа\nи не является подписью", 470, 108, { width: 100, align: "center" });
  }

  private table(doc: PDFKit.PDFDocument, model: VotingSheetPdfModel) {
    const x = 40; let y = 145; const widths = [25, 310, 60, 60, 60];
    this.row(doc, x, y, widths, 30, ["№", "Вопрос", "За", "Против", "Воздержусь"], true); y += 30;
    for (const question of model.questions) {
      const height = Math.max(58, doc.heightOfString(question.text, { width: widths[1] - 12 }) + 18);
      this.row(doc, x, y, widths, height, [String(question.position), question.text, "", "", ""], false);
      const selectedColumn = question.answer === "for" ? 2 : question.answer === "against" ? 3 : 4;
      const selectedX = x + widths.slice(0, selectedColumn).reduce((sum, width) => sum + width, 0);
      if (model.visualSignature) {
        try { doc.image(Buffer.from(model.visualSignature), selectedX + 7, y + 12, { fit: [46, height - 24], align: "center", valign: "center" }); }
        catch { doc.font("NotoBold").fontSize(13).fillColor("#13795b").text("✓", selectedX, y + height / 2 - 7, { width: widths[selectedColumn], align: "center" }); }
      } else doc.font("NotoBold").fontSize(13).fillColor("#13795b").text("✓", selectedX, y + height / 2 - 7, { width: widths[selectedColumn], align: "center" });
      y += height;
    }
    doc.y = y + 12;
  }

  private row(doc: PDFKit.PDFDocument, x: number, y: number, widths: number[], height: number, values: string[], heading: boolean) {
    let cellX = x;
    for (let index = 0; index < widths.length; index += 1) {
      doc.rect(cellX, y, widths[index], height).fillAndStroke(heading ? "#e9f2ff" : "#ffffff", "#9fb3c8");
      doc.font(heading ? "NotoBold" : "Noto").fontSize(heading ? 7.5 : 8).fillColor("#102a43").text(values[index], cellX + 5, y + (heading ? 9 : 8), { width: widths[index] - 10, height: height - 10, align: index === 1 ? "left" : "center" });
      cellX += widths[index];
    }
  }

  private footer(doc: PDFKit.PDFDocument, model: VotingSheetPdfModel) {
    let y = doc.y; if (y > 715) { doc.addPage(); y = 45; }
    doc.font("NotoBold").fontSize(8.5).fillColor("#102a43").text("Сведения об участнике", 40, y);
    doc.font("Noto").fontSize(8).fillColor("#334e68").text(`Участник: ${model.participantDisplayName}`, 40, y + 18)
      .text(`Дата и время: ${new Date(model.createdAt).toLocaleString("ru-RU", { timeZone: "Asia/Almaty" })}`, 40, y + 33)
      .text(`Document ID: ${model.documentId} · версия: ${model.documentVersion} · версия опроса: ${model.surveyVersion}`, 40, y + 48)
      .text(`Signing provider: ${model.signingProvider} · status: ${model.signingStatus}`, 40, y + 63)
      .fontSize(6.5).text(`SHA-256 / verification reference: ${model.documentHashReference}`, 40, y + 80, { width: 515 });
    doc.fontSize(6.5).fillColor("#627d98").text("Рукописное изображение является visual_signature и само по себе не является ЭЦП.", 40, y + 100);
  }
}
