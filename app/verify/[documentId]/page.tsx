import { ShieldCheck, ShieldX } from "lucide-react";
import { PostgresVotingRepository } from "@/src/infrastructure/database/postgres-repositories";
import { getDatabaseClient } from "@/src/infrastructure/database/client";

export const dynamic = "force-dynamic";

export default async function VerifyDocumentPage({ params }: { params: Promise<{ documentId: string }> }) {
  const { documentId } = await params;
  const validId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(documentId);
  const verification = validId ? await new PostgresVotingRepository(getDatabaseClient()).getPublicVerification(documentId) : null;
  return <main style={{ minHeight: "100vh", background: "#f3f7fb", padding: "48px 20px", color: "#102a43" }}>
    <section style={{ maxWidth: 660, margin: "0 auto", background: "white", borderRadius: 24, padding: 32, boxShadow: "0 18px 50px rgba(16,42,67,.12)" }}>
      <div style={{ width: 58, height: 58, borderRadius: 18, display: "grid", placeItems: "center", background: verification ? "#e5f8f0" : "#feeceb", color: verification ? "#13795b" : "#c9372c" }}>{verification ? <ShieldCheck size={31} /> : <ShieldX size={31} />}</div>
      <p style={{ marginTop: 24, color: "#627d98", fontSize: 13, fontWeight: 700, letterSpacing: ".08em" }}>АСТАНА-ЕРЦ · ПРОВЕРКА ДОКУМЕНТА</p>
      <h1 style={{ fontSize: 30, margin: "8px 0 12px" }}>{verification ? "Документ найден" : "Документ не найден"}</h1>
      {!verification ? <p style={{ color: "#52667a" }}>Проверьте Document ID или QR-код. Персональные данные публично не раскрываются.</p> : <>
        <p style={{ color: "#52667a" }}>Проверка подтверждает наличие неизменяемого PDF snapshot и совпадение SHA-256. QR-код не является подписью.</p>
        <dl style={{ display: "grid", gridTemplateColumns: "minmax(150px, 1fr) 2fr", gap: "14px 24px", marginTop: 28, paddingTop: 24, borderTop: "1px solid #d9e2ec" }}>
          <dt>Протокол</dt><dd style={{ margin: 0, fontWeight: 700 }}>№{verification.protocolNumber}</dd>
          <dt>Дата документа</dt><dd style={{ margin: 0 }}>{new Date(verification.createdAt).toLocaleString("ru-RU", { timeZone: "Asia/Almaty" })}</dd>
          <dt>Статус документа</dt><dd style={{ margin: 0, fontWeight: 700 }}>{verification.documentStatus}</dd>
          <dt>Статус подписи</dt><dd style={{ margin: 0, color: "#13795b", fontWeight: 700 }}>{verification.signingStatus}</dd>
          <dt>Целостность</dt><dd style={{ margin: 0, color: verification.integrityValid ? "#13795b" : "#c9372c", fontWeight: 700 }}>{verification.integrityValid ? "Подтверждена" : "Нарушена"}</dd>
          <dt>Document ID</dt><dd style={{ margin: 0, fontFamily: "monospace", overflowWrap: "anywhere" }}>{verification.publicId}</dd>
          <dt>SHA-256</dt><dd style={{ margin: 0, fontFamily: "monospace", fontSize: 12, overflowWrap: "anywhere" }}>{verification.sha256}</dd>
        </dl>
      </>}
    </section>
  </main>;
}
