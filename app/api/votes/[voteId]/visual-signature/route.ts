import { z } from "zod";
import { createApplication } from "@/src/infrastructure/composition-root";
import { assertSameOrigin, errorResponse, requestIdFrom } from "@/src/infrastructure/http/responses";
import { requireCurrentSession } from "@/src/infrastructure/session/current-session";

export const runtime = "nodejs";
const schema = z.object({ dataUrl: z.string().max(700_000).regex(/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/) }).strict();

export async function POST(request: Request, context: { params: Promise<{ voteId: string }> }) {
  const requestId = requestIdFrom(request); const app = createApplication();
  try {
    assertSameOrigin(request);
    const voteId = z.uuid().parse((await context.params).voteId);
    const { dataUrl } = schema.parse(await request.json());
    const session = await requireCurrentSession(app.sessions, app.config.sessionCookieName);
    const png = new Uint8Array(Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64"));
    const visualSignature = await app.visualSignatures.save({ voteId, userId: session.subjectId, png, metadata: { capturedBy: "canvas" } }, { requestId });
    return Response.json({ visualSignature: { id: visualSignature.id, sha256: visualSignature.sha256, createdAt: visualSignature.createdAt }, requestId }, { status: 201 });
  } catch (error) { return errorResponse(error, requestId); }
}
