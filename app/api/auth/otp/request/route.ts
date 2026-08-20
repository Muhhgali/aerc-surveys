import { z } from "zod";
import { createApplication } from "@/src/infrastructure/composition-root";
import { assertSameOrigin, errorResponse, requestIdFrom } from "@/src/infrastructure/http/responses";
import { residentAuthChannels } from "@/src/domain/resident-auth";

export const runtime = "nodejs";

const requestSchema = z.object({
  destination: z.string().trim().min(3).max(120),
  channel: z.enum(residentAuthChannels).default("whatsapp"),
});

export async function POST(request: Request) {
  const requestId = requestIdFrom(request);
  const app = createApplication();
  try {
    assertSameOrigin(request);
    const body = requestSchema.parse(await request.json());
    const channel = body.channel === "whatsapp" && app.config.enableMockAuth ? "mock" : body.channel;
    const challenge = await app.residentAuth.requestCode({ destination: body.destination, channel }, { requestId });
    return Response.json({ ...challenge, requestId });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
