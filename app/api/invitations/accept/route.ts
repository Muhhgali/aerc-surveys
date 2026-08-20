import { z } from "zod";
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
    const body = z.object({ token: z.string().min(16).max(200) }).parse(await request.json());
    const accepted = await app.admin.acceptInvitation(body.token, requestId);
    const credential = await app.sessions.create(accepted.userId, "demo");
    (await cookies()).set(app.config.sessionCookieName, credential.token, {
      ...sessionCookieOptions(["staging", "production"].includes(app.config.environment)), maxAge: app.config.sessionTtlSeconds, priority: "high",
    });
    return Response.json({ accepted: true, userId: accepted.userId, requestId });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
