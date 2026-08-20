import "server-only";

import { join } from "node:path";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import type { PdfRenderer, ProtocolPdfModel, VotingSheetPdfModel } from "@/src/application/ports/pdf-renderer";
import { fillProtocolTemplate, fillVotingSheetTemplate } from "@/src/domain/official-document-template";

/** Merged Noto Sans Latin + Cyrillic (OFL) so digits, punctuation and Russian text share one face. */
const fontsDir = join(process.cwd(), "src", "infrastructure", "documents", "fonts");
const regularFont = join(fontsDir, "NotoSans-Regular.ttf");
const boldFont = join(fontsDir, "NotoSans-Bold.ttf");

export class PdfKitVotingSheetRenderer implements PdfRenderer {
  async renderVotingSheet(model: VotingSheetPdfModel): Promise<Uint8Array> {
    const document = new PDFDocument({ size: "A4", layout: "portrait", margin: 36, font: regularFont, info: { Title: `Лист № ${model.sheetNumber ?? "—"} голосования — протокол №${model.protocolNumber}`, CreationDate: new Date(model.createdAt) } });
    document.registerFont("Noto", regularFont); document.registerFont("NotoBold", boldFont);
    const chunks: Buffer[] = [];
    document.on("data", (chunk: Buffer) => chunks.push(chunk));
    const completed = new Promise<Uint8Array>((resolve, reject) => { document.on("end", () => resolve(new Uint8Array(Buffer.concat(chunks)))); document.on("error", reject); });
    const qr = await QRCode.toBuffer(model.verificationUrl, { type: "png", width: 180, margin: 1, errorCorrectionLevel: "M" });
    const filled = fillVotingSheetTemplate({ ...model, hasVisualSignature: Boolean(model.visualSignature), signatories: model.signatories });
    this.sheetHeader(document, filled, qr);
    this.table(document, model, filled.tableHeaders);
    this.sheetFooter(document, filled, model);
    document.end();
    return completed;
  }

  async renderProtocol(model: ProtocolPdfModel): Promise<Uint8Array> {
    const document = new PDFDocument({ size: "A4", layout: "portrait", margin: 48, font: regularFont, info: { Title: `Протокол № ${model.protocolNumber} собрания собственников` } });
    document.registerFont("Noto", regularFont); document.registerFont("NotoBold", boldFont);
    const chunks: Buffer[] = [];
    document.on("data", (chunk: Buffer) => chunks.push(chunk));
    const completed = new Promise<Uint8Array>((resolve, reject) => { document.on("end", () => resolve(new Uint8Array(Buffer.concat(chunks)))); document.on("error", reject); });
    const filled = fillProtocolTemplate(model);
    if (model.draft) {
      document.font("NotoBold").fontSize(28).fillColor("#c53030").opacity(0.12).text("ЧЕРНОВИК", 80, 280, { align: "center" });
      document.opacity(1);
    }
    document.font("NotoBold").fontSize(11).fillColor("#102a43").text(filled.title, { align: "center" });
    document.moveDown(0.45).font("Noto").fontSize(10).text(filled.dateTime, { align: "center" });
    document.moveDown().fontSize(10).fillColor("#243b53");
    this.labeled(document, "1. Местонахождение многоквартирного жилого дома:", filled.buildingAddress);
    this.labeled(document, "2. Общее количество собственников квартир:", filled.apartmentOwners);
    this.labeled(document, "3. Общее количество собственников нежилого помещения:", filled.nonResidentialOwners);
    this.labeled(document, "4. Количество принимавших участие в письменном опросе (по форме листа письменного опроса к протоколу):", filled.participated);
    this.labeled(document, "5. Форма собрания:", filled.meetingForm);
    document.moveDown(0.3).font("NotoBold").fillColor("#102a43").text("Повестка дня собрания:");
    document.font("Noto").fontSize(9).fillColor("#334e68");
    for (const item of filled.agenda) document.text(item);
    if (!filled.agenda.length) document.text("—");
    document.moveDown(0.4).font("NotoBold").fontSize(10).fillColor("#102a43").text("Результаты голосования:");
    document.font("Noto").fontSize(9).fillColor("#334e68").text("Вопросы, вынесенные на голосование:");
    for (const result of filled.results) {
      document.moveDown(0.25).font("NotoBold").fontSize(9).fillColor("#102a43").text(result.heading);
      document.font("Noto").fillColor("#334e68").text(result.tallies);
    }
    document.moveDown(0.45).font("NotoBold").fontSize(10).fillColor("#102a43").text("Итоги голосования, проводимые путем письменного опроса (на бумажном носителе):");
    document.font("Noto").fontSize(9).fillColor("#334e68").text(filled.paperResults);
    document.moveDown(0.3).font("NotoBold").fontSize(10).fillColor("#102a43").text("Итоги голосования, проводимые путем электронного листа опроса (в электронном формате через объекты информатизации в сфере жилищных отношений и жилищно-коммунального хозяйства):");
    document.font("Noto").fontSize(9).fillColor("#334e68").text(filled.electronicResults);
    document.moveDown(0.4).font("NotoBold").fontSize(10).fillColor("#102a43").text("Решение, принятое голосованием:");
    document.font("Noto").fontSize(9).fillColor("#334e68");
    for (const decision of filled.decisions) document.text(decision);
    if (!filled.decisions.length) document.text("—");
    document.moveDown().font("NotoBold").fontSize(10).fillColor("#102a43").text("Подписи");
    document.font("Noto").fontSize(9).fillColor("#334e68");
    this.signLine(document, "Председатель собрания:", filled.chairman, imageFor(model.signatories, "meeting_chairman"));
    this.signLine(document, "Секретарь собрания:", filled.secretary, imageFor(model.signatories, "secretary"));
    const council = model.signatories.filter((row) => row.roleKey === "council_member");
    filled.councilMembers.forEach((member, index) => {
      this.signLine(document, "Член совета дома:", member, council[index]?.image);
    });
    document.moveDown().fontSize(8).fillColor("#627d98").text(`Document ID: ${model.documentId}`);
    document.text(model.verificationUrl);
    document.end();
    return completed;
  }

  private labeled(doc: PDFKit.PDFDocument, label: string, value: string) {
    doc.font("NotoBold").fontSize(10).fillColor("#102a43").text(label);
    doc.font("Noto").fontSize(10).fillColor("#243b53").text(value);
    doc.moveDown(0.25);
  }

  private signLine(doc: PDFKit.PDFDocument, role: string, name: string, image?: Uint8Array) {
    const y = doc.y;
    doc.text(`${role} ${name}`);
    if (image) {
      try { doc.image(Buffer.from(image), 420, y - 2, { fit: [90, 28] }); }
      catch { doc.text("    ________________", 420, y); }
    } else {
      doc.text("    ________________", 420, y);
    }
    doc.fontSize(7.5).fillColor("#627d98").text("(фамилия, имя, отчество (при его наличии) / подпись)");
    doc.fontSize(9).fillColor("#334e68");
  }

  private sheetHeader(doc: PDFKit.PDFDocument, filled: ReturnType<typeof fillVotingSheetTemplate>, qr: Buffer) {
    doc.font("NotoBold").fontSize(12).fillColor("#102a43").text(filled.title, 36, 36, { width: 430 });
    doc.font("Noto").fontSize(9).fillColor("#334e68").text(filled.dateTime, 36, doc.y + 6, { width: 430 });
    doc.moveDown(0.4).font("NotoBold").fontSize(9).fillColor("#102a43").text("Местонахождение многоквартирного жилого дома:", 36, doc.y, { width: 430 });
    doc.font("Noto").fontSize(9).fillColor("#334e68").text(filled.buildingAddress, { width: 430 });
    doc.moveDown(0.25).font("NotoBold").fontSize(9).fillColor("#102a43").text("Ответственные лица:", { width: 430 });
    doc.font("Noto").fontSize(9).fillColor("#334e68").text(filled.responsiblePersons, { width: 430 });
    doc.fontSize(7.5).fillColor("#627d98").text("(назначаемые из числа собственников квартир, нежилого помещения)", { width: 430 });
    doc.image(qr, 485, 36, { fit: [70, 70] });
    doc.fontSize(6.5).text("QR ведёт на проверку документа\nи не является подписью", 470, 110, { width: 100, align: "center" });
  }

  private table(doc: PDFKit.PDFDocument, model: VotingSheetPdfModel, headers: readonly string[]) {
    const x = 36; let y = Math.max(doc.y + 14, 168); const widths = [28, 292, 64, 72, 80];
    this.row(doc, x, y, widths, 34, [...headers], true); y += 34;
    for (const question of model.questions) {
      const height = Math.max(58, doc.heightOfString(question.text, { width: widths[1] - 12 }) + 18);
      if (y + height > 720) { doc.addPage(); y = 45; }
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
      doc.font(heading ? "NotoBold" : "Noto").fontSize(heading ? 6.6 : 8).fillColor("#102a43").text(values[index], cellX + 4, y + (heading ? 6 : 8), { width: widths[index] - 8, height: height - 10, align: index === 1 ? "left" : "center" });
      cellX += widths[index];
    }
  }

  private sheetFooter(doc: PDFKit.PDFDocument, filled: ReturnType<typeof fillVotingSheetTemplate>, model: VotingSheetPdfModel) {
    let y = doc.y; if (y > 620) { doc.addPage(); y = 45; }
    doc.font("NotoBold").fontSize(8.5).fillColor("#102a43").text("(фамилия, имя, отчество (при его наличии) собственника квартиры, нежилого помещения)", 36, y, { width: 520 });
    doc.font("Noto").fontSize(10).fillColor("#243b53").text(filled.ownerFullName, 36, y + 18);
    doc.font("NotoBold").fontSize(8.5).fillColor("#102a43").text("Адрес собственника квартиры, нежилого помещения", 36, y + 40);
    doc.font("Noto").fontSize(9).fillColor("#334e68").text(filled.ownerAddress, 36, y + 54, { width: 520 });
    doc.font("NotoBold").fontSize(8.5).fillColor("#102a43").text("Номер сотовой связи и (или) электронный адрес собственника квартиры, нежилого помещения (на усмотрение собственника)", 36, y + 76, { width: 520 });
    doc.font("Noto").fontSize(9).fillColor("#334e68").text(filled.ownerContacts, 36, y + 100);
    doc.font("NotoBold").fontSize(8.5).fillColor("#102a43").text(`Подпись собственника квартиры, нежилого помещения: ${filled.ownerSignature}`, 36, y + 122);
    let lineY = y + 140;
    filled.responsibleSignatureLines.forEach((line, index) => {
      doc.text(`Подпись ответственного лица: ${line} *`, 36, lineY);
      const image = firstImage(model.signatories, "responsible_person", index);
      if (image) {
        try { doc.image(Buffer.from(image), 420, lineY - 6, { fit: [90, 22] }); } catch { /* visual signature is optional on the line */ }
      }
      lineY += 18;
    });
    const councilImages = (model.signatories ?? []).filter((row) => row.roleKey === "council_member");
    filled.councilSignatureLines.forEach((line, index) => {
      doc.text(`Подпись члена совета дома: ${line}`, 36, lineY);
      const image = councilImages[index]?.image;
      if (image) {
        try { doc.image(Buffer.from(image), 420, lineY - 6, { fit: [90, 22] }); } catch { /* keep the caption if the PNG is unreadable */ }
      }
      lineY += 18;
    });
    doc.font("Noto").fontSize(6.5).fillColor("#627d98").text(filled.footnote, 36, lineY + 8, { width: 520 });
    doc.text(`Document ID: ${model.documentId} · версия: ${model.documentVersion} · SHA-256: ${model.documentHashReference}`, 36, lineY + 36, { width: 520 });
    doc.text("Рукописное изображение является visual signature и само по себе не является ЭЦП.", 36, lineY + 54);
  }
}

function imageFor(signatories: ProtocolPdfModel["signatories"], role: string) {
  return signatories.find((row) => row.roleKey === role)?.image;
}

function firstImage(signatories: VotingSheetPdfModel["signatories"], role: string, index: number) {
  return (signatories ?? []).filter((row) => row.roleKey === role)[index]?.image;
}
