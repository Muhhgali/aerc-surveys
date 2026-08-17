import { cookies } from "next/headers";
import { createApplication } from "@/src/infrastructure/composition-root";
import { assertSameOrigin, errorResponse, requestIdFrom } from "@/src/infrastructure/http/responses";
import { sessionCookieOptions } from "@/src/infrastructure/session/cookie-policy";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const requestId = requestIdFrom(request);
  const app = createApplication();
  try {
    assertSameOrigin(request);
    if (app.config.environment === "production" || !app.config.enableMockAuth || app.config.identity !== "mock") return new Response(null, { status: 404 });
    const authenticated = await app.authentication.authenticateMock(new URL("/admin", request.url).toString(), { requestId }, "admin");
    (await cookies()).set(app.config.sessionCookieName, authenticated.credential.token, {
      ...sessionCookieOptions(["staging", "production"].includes(app.config.environment)), maxAge: app.config.sessionTtlSeconds, priority: "high",
    });
    await app.audit.append({
      eventId: crypto.randomUUID(), eventType: "ADMIN_LOGIN", actorId: authenticated.user.id,
      requestId, occurredAt: new Date().toISOString(), outcome: "success", metadata: { provider: "mock" },
    });
    return Response.json({ authenticated: true, user: authenticated.user, requestId });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
