import { cookies } from "next/headers";
import { z } from "zod";
import { createApplication } from "@/src/infrastructure/composition-root";
import { assertSameOrigin, errorResponse, requestIdFrom } from "@/src/infrastructure/http/responses";
import { sessionCookieOptions } from "@/src/infrastructure/session/cookie-policy";

export const runtime = "nodejs";
export const maxDuration = 15;

const bodySchema = z.object({ login: z.string().min(1).max(128), password: z.string().min(1).max(128) });

/** Login + password entry for console accounts (AERC staff and organization users). Available in every environment. */
export async function POST(request: Request) {
  const requestId = requestIdFrom(request);
  const app = createApplication();
  try {
    assertSameOrigin(request);
    const body = bodySchema.parse(await request.json());
    const result = await app.credentials.authenticate(body.login, body.password);
    (await cookies()).set(app.config.sessionCookieName, result.credential.token, {
      ...sessionCookieOptions(["staging", "production"].includes(app.config.environment)),
      maxAge: app.config.sessionTtlSeconds,
      priority: "high",
    });
    await app.audit.append({
      eventId: crypto.randomUUID(), eventType: "CONSOLE_LOGIN", actorId: result.userId,
      requestId, occurredAt: new Date().toISOString(), outcome: "success", metadata: { method: "password" },
    });
    return Response.json({ authenticated: true, mustChangePassword: result.mustChangePassword, requestId });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
