import { cookies } from "next/headers";
import { createApplication } from "@/src/infrastructure/composition-root";
import { assertSameOrigin, errorResponse, requestIdFrom } from "@/src/infrastructure/http/responses";
import { sessionCookieOptions } from "@/src/infrastructure/session/cookie-policy";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const requestId = requestIdFrom(request);
  if (process.env.NODE_ENV === "production") return new Response(null, { status: 404 });
  const app = createApplication();
  try {
    assertSameOrigin(request);
    if (app.config.identity !== "mock") return new Response(null, { status: 404 });
    const users = await app.database<{ user_id: string }[]>`
      select user_id from external_identities where provider = 'mock' and provider_subject = 'mock-subject-1911' limit 1
    `;
    if (!users[0]) throw new Error("Development seed has not been applied");
    const session = await app.sessions.create(users[0].user_id, "demo");
    (await cookies()).set(app.config.sessionCookieName, session.sessionId, {
      ...sessionCookieOptions(false), maxAge: app.config.sessionTtlSeconds, priority: "high",
    });
    await app.audit.append({
      eventId: crypto.randomUUID(), eventType: "login", actorId: users[0].user_id,
      requestId, occurredAt: new Date().toISOString(), outcome: "success", metadata: { provider: "mock" },
    });
    return Response.json({ authenticated: true, requestId });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
