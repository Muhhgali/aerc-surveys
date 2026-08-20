import { cookies } from "next/headers";
import { z } from "zod";
import { ApplicationError } from "@/src/application/errors";
import { createApplication } from "@/src/infrastructure/composition-root";
import { isDemoAdminPassword } from "@/src/infrastructure/auth/demo-admin-credentials";
import { assertSameOrigin, errorResponse, requestIdFrom } from "@/src/infrastructure/http/responses";
import { sessionCookieOptions } from "@/src/infrastructure/session/cookie-policy";

export const runtime = "nodejs";
export const maxDuration = 15;

const bodySchema = z.object({
  method: z.enum(["password", "egov", "digital_id"]),
  login: z.string().max(128).optional(),
  password: z.string().max(128).optional(),
});

export async function POST(request: Request) {
  const requestId = requestIdFrom(request);
  const app = createApplication();
  try {
    assertSameOrigin(request);
    if (!app.config.enableMockAuth || app.config.identity !== "mock") return new Response(null, { status: 404 });
    const body = bodySchema.parse(await request.json());
    if (body.method === "password" && (!body.login || !body.password || !isDemoAdminPassword(body.login, body.password))) {
      throw new ApplicationError("unauthenticated", "Неверный логин или пароль");
    }
    const authenticated = await app.authentication.authenticateMock(new URL("/admin", request.url).toString(), { requestId }, "admin");
    (await cookies()).set(app.config.sessionCookieName, authenticated.credential.token, {
      ...sessionCookieOptions(["staging", "production"].includes(app.config.environment)), maxAge: app.config.sessionTtlSeconds, priority: "high",
    });
    await app.audit.append({
      eventId: crypto.randomUUID(), eventType: "ADMIN_LOGIN", actorId: authenticated.user.id,
      requestId, occurredAt: new Date().toISOString(), outcome: "success", metadata: { provider: "mock", method: body.method },
    });
    return Response.json({ authenticated: true, user: authenticated.user, requestId });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
