import { z } from "zod";
import { ApplicationError } from "@/src/application/errors";
import { createApplication } from "@/src/infrastructure/composition-root";
import { errorResponse, requestIdFrom } from "@/src/infrastructure/http/responses";
import { requireCurrentSession } from "@/src/infrastructure/session/current-session";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ documentId: string }> }) {
  const requestId = requestIdFrom(request); const app = createApplication();
  try {
    const documentId = z.uuid().parse((await context.params).documentId);
    const session = await requireCurrentSession(app.sessions, app.config.sessionCookieName);
    const asset = await app.documents.getOwnedDocumentAsset(documentId, session.subjectId);
    if (!asset) throw new ApplicationError("not_found", "Document was not found");
    const stored = await app.providers.documentStorage.get({ storageKey: asset.storageKey }, { requestId });
    if (!stored.ok || stored.value.sha256 !== asset.sha256) throw new ApplicationError("document_failed", "Document integrity check failed");
    return new Response(Buffer.from(stored.value.bytes), { headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="vote-${documentId}.pdf"`, "cache-control": "private, no-store", "x-content-type-options": "nosniff" } });
  } catch (error) { return errorResponse(error, requestId); }
}
