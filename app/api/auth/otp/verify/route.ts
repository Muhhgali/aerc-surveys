import { z } from "zod";
import { cookies } from "next/headers";
import { createApplication } from "@/src/infrastructure/composition-root";
import { assertSameOrigin, errorResponse, requestIdFrom } from "@/src/infrastructure/http/responses";
import { sessionCookieOptions } from "@/src/infrastructure/session/cookie-policy";
import { residentAuthChannels } from "@/src/domain/resident-auth";

export const runtime = "nodejs";

const schema = z.object({
  challengeId: z.uuid(),
  code: z.string().trim().min(4).max(8),
  destination: z.string().trim().min(3).max(120),
  channel: z.enum(residentAuthChannels).default("whatsapp"),
});

export async function POST(request: Request) {
  const requestId = requestIdFrom(request);
  const app = createApplication();
  try {
    assertSameOrigin(request);
    const body = schema.parse(await request.json());
    const channel = body.channel === "whatsapp" && app.config.enableMockAuth ? "mock" : body.channel;
    const authenticated = await app.residentAuth.verifyCode({ ...body, channel }, { requestId });
    (await cookies()).set(app.config.sessionCookieName, authenticated.credential.token, {
      ...sessionCookieOptions(["staging", "production"].includes(app.config.environment)), maxAge: app.config.sessionTtlSeconds, priority: "high",
    });
    return Response.json({ authenticated: true, user: authenticated.user, requestId });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
