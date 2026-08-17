import { z } from "zod";
import { createApplication } from "@/src/infrastructure/composition-root";
import { assertSameOrigin, errorResponse, requestIdFrom } from "@/src/infrastructure/http/responses";
import { requireCurrentSession } from "@/src/infrastructure/session/current-session";

export const runtime = "nodejs";

const schema = z.object({ idempotencyKey: z.uuid() }).strict();

export async function POST(request: Request, context: { params: Promise<{ voteId: string }> }) {
  const requestId = requestIdFrom(request);
  const app = createApplication();
  try {
    assertSameOrigin(request);
    const voteId = z.uuid().parse((await context.params).voteId);
    const input = schema.parse(await request.json());
    const session = await requireCurrentSession(app.sessions, app.config.sessionCookieName);
    await app.audit.append({
      eventId: crypto.randomUUID(), eventType: "VOTE_SUBMIT_ATTEMPT", actorId: session.subjectId,
      subjectId: voteId, requestId, occurredAt: new Date().toISOString(), outcome: "success",
      metadata: { subjectType: "vote" },
    });
    const document = await app.documents.signGenerateAndSubmit({ voteId, userId: session.subjectId, authSessionId: session.sessionId, idempotencyKey: input.idempotencyKey, verificationBaseUrl: new URL(request.url).origin }, { requestId });
    return Response.json({ vote: { id: voteId, status: "submitted" }, document: { id: document.publicId, version: document.version, sha256: document.sha256, verificationUrl: `/verify/${document.publicId}` }, requestId });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
