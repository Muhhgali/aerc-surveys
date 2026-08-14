import { cookies } from "next/headers";
import { createApplication } from "@/src/infrastructure/composition-root";
import { assertSameOrigin, errorResponse, requestIdFrom } from "@/src/infrastructure/http/responses";
import { requireCurrentSession } from "@/src/infrastructure/session/current-session";

export const runtime = "nodejs";

export async function DELETE(request: Request) {
  const requestId = requestIdFrom(request);
  const app = createApplication();
  try {
    assertSameOrigin(request);
    const session = await requireCurrentSession(app.sessions, app.config.sessionCookieName);
    await app.sessions.revoke(session.sessionId);
    (await cookies()).delete(app.config.sessionCookieName);
    await app.audit.append({
      eventId: crypto.randomUUID(), eventType: "logout", actorId: session.subjectId,
      requestId, occurredAt: new Date().toISOString(), outcome: "success", metadata: {},
    });
    return new Response(null, { status: 204 });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
