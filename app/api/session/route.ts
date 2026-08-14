import { cookies } from "next/headers";
import { createApplication } from "@/src/infrastructure/composition-root";
import { assertSameOrigin, errorResponse, requestIdFrom } from "@/src/infrastructure/http/responses";
import { requireCurrentSession } from "@/src/infrastructure/session/current-session";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const requestId = requestIdFrom(request);
  const app = createApplication();
  try {
    const session = await requireCurrentSession(app.sessions, app.config.sessionCookieName);
    const user = await app.authentication.currentUser(session.subjectId);
    return Response.json({ authenticated: true, user, expiresAt: session.expiresAt, requestId });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}

export async function DELETE(request: Request) {
  const requestId = requestIdFrom(request);
  const app = createApplication();
  try {
    assertSameOrigin(request);
    const cookieStore = await cookies();
    const token = cookieStore.get(app.config.sessionCookieName)?.value;
    if (token) await app.sessions.revoke(token);
    cookieStore.delete(app.config.sessionCookieName);
    await app.audit.append({
      eventId: crypto.randomUUID(), eventType: "SESSION_REVOKED",
      requestId, occurredAt: new Date().toISOString(), outcome: "success", metadata: {},
    });
    return new Response(null, { status: 204 });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
