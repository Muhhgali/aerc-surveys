import { z } from "zod";
import { createApplication } from "@/src/infrastructure/composition-root";
import { assertSameOrigin, errorResponse, requestIdFrom } from "@/src/infrastructure/http/responses";
import { requireCurrentSession } from "@/src/infrastructure/session/current-session";

export const runtime = "nodejs";

const schema = z.object({
  idempotencyKey: z.uuid(),
  questionId: z.uuid(),
  choice: z.enum(["for", "against", "abstain"]),
}).strict();

export async function PUT(request: Request, context: { params: Promise<{ voteId: string }> }) {
  const requestId = requestIdFrom(request);
  const app = createApplication();
  try {
    assertSameOrigin(request);
    const voteId = z.uuid().parse((await context.params).voteId);
    const input = schema.parse(await request.json());
    const session = await requireCurrentSession(app.sessions, app.config.sessionCookieName);
    const vote = await app.voting.autosave({ voteId, userId: session.subjectId, requestId, ...input });
    return Response.json({ saved: true, stateVersion: vote.stateVersion, answers: vote.answers, requestId });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
