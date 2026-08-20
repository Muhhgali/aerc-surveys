import { z } from "zod";
import { createApplication } from "@/src/infrastructure/composition-root";
import { assertSameOrigin, errorResponse, requestIdFrom } from "@/src/infrastructure/http/responses";
import { requireCurrentSession } from "@/src/infrastructure/session/current-session";

export const runtime = "nodejs";
export const maxDuration = 15;

const bodySchema = z.object({ currentPassword: z.string().min(1).max(128), newPassword: z.string().min(1).max(128) });

/** Self-service password change; also how a temporary password issued by an administrator is retired. */
export async function POST(request: Request) {
  const requestId = requestIdFrom(request);
  const app = createApplication();
  try {
    assertSameOrigin(request);
    const body = bodySchema.parse(await request.json());
    const session = await requireCurrentSession(app.sessions, app.config.sessionCookieName);
    await app.credentials.changePassword(session.subjectId, body.currentPassword, body.newPassword);
    await app.audit.append({
      eventId: crypto.randomUUID(), eventType: "PASSWORD_CHANGED", actorId: session.subjectId,
      requestId, occurredAt: new Date().toISOString(), outcome: "success", metadata: {},
    });
    return Response.json({ changed: true, requestId });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
