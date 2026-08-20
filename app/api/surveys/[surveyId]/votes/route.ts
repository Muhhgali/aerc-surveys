import { z } from "zod";
import { createApplication } from "@/src/infrastructure/composition-root";
import { assertSameOrigin, errorResponse, requestIdFrom } from "@/src/infrastructure/http/responses";
import { requireCurrentSession } from "@/src/infrastructure/session/current-session";

export const runtime = "nodejs";

const startSchema = z.object({
  accountReference: z.string().trim().regex(/^\d{4,32}$/),
  idempotencyKey: z.uuid(),
}).strict();

export async function GET(request: Request, context: { params: Promise<{ surveyId: string }> }) {
  const requestId = requestIdFrom(request);
  const app = createApplication();
  try {
    const surveyId = z.uuid().parse((await context.params).surveyId);
    const session = await requireCurrentSession(app.sessions, app.config.sessionCookieName);
    const vote = await app.voting.resume(surveyId, session.subjectId);
    await app.audit.append({
      eventId: crypto.randomUUID(), eventType: "SURVEY_OPENED", actorId: session.subjectId,
      subjectId: surveyId, requestId, occurredAt: new Date().toISOString(), outcome: "success",
      metadata: { subjectType: "survey", source: "resume" },
    });
    return Response.json({ vote: voteDto(vote), requestId });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}

export async function POST(request: Request, context: { params: Promise<{ surveyId: string }> }) {
  const requestId = requestIdFrom(request);
  const app = createApplication();
  try {
    assertSameOrigin(request);
    const surveyId = z.uuid().parse((await context.params).surveyId);
    const input = startSchema.parse(await request.json());
    const session = await requireCurrentSession(app.sessions, app.config.sessionCookieName);
    const account = await app.properties.resolveForIdentity(session.subjectId, input.accountReference, { requestId });
    await app.audit.append({
      eventId: crypto.randomUUID(), eventType: "SURVEY_OPENED", actorId: session.subjectId,
      subjectId: surveyId, requestId, occurredAt: new Date().toISOString(), outcome: "success",
      metadata: { subjectType: "survey", source: "start_or_resume" },
    });
    const result = await app.voting.startOrResume({
      authSessionId: session.sessionId,
      userId: session.subjectId,
      surveyId,
      propertyId: account.localPropertyId,
      idempotencyKey: input.idempotencyKey,
      requestId,
    });
    return Response.json({ vote: voteDto(result.vote), disposition: result.disposition, requestId }, { status: result.disposition === "started" ? 201 : 200 });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}

function voteDto(vote: Awaited<ReturnType<ReturnType<typeof createApplication>["voting"]["resume"]>>) {
  return {
    id: vote.id,
    surveyId: vote.surveyId,
    status: vote.status,
    stateVersion: vote.stateVersion,
    submittedAt: vote.submittedAt,
    answers: vote.answers,
    account: { accountNumber: vote.accountNumber, address: vote.address, unit: vote.unit },
  };
}
