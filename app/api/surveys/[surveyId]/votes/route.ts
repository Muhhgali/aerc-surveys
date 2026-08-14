import { z } from "zod";
import { createApplication } from "@/src/infrastructure/composition-root";
import { assertSameOrigin, errorResponse, requestIdFrom } from "@/src/infrastructure/http/responses";
import { requireCurrentSession } from "@/src/infrastructure/session/current-session";

export const runtime = "nodejs";

const inputSchema = z.object({
  accountReference: z.string().trim().regex(/^\d{1,32}$/),
  idempotencyKey: z.uuid(),
  answers: z.array(z.object({
    questionId: z.uuid(),
    choice: z.enum(["for", "against", "abstain"]),
  }).strict()).min(1).max(100),
}).strict();

export async function POST(request: Request, context: { params: Promise<{ surveyId: string }> }) {
  const requestId = requestIdFrom(request);
  const app = createApplication();
  try {
    assertSameOrigin(request);
    const { surveyId } = await context.params;
    const validatedSurveyId = z.uuid().parse(surveyId);
    const input = inputSchema.parse(await request.json());
    const session = await requireCurrentSession(app.sessions, app.config.sessionCookieName);
    const account = await app.properties.resolveForIdentity(session.subjectId, input.accountReference, { requestId });
    const vote = await app.voting.submit({
      authSessionId: session.sessionId,
      userId: session.subjectId,
      surveyId: validatedSurveyId,
      propertyId: account.localPropertyId,
      idempotencyKey: input.idempotencyKey,
      requestId,
      answers: input.answers,
    });
    return Response.json({ vote: { id: vote.id, surveyId: vote.surveyId }, requestId }, { status: 201 });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
