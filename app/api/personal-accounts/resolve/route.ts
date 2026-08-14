import { z } from "zod";
import { createApplication } from "@/src/infrastructure/composition-root";
import { assertSameOrigin, errorResponse, requestIdFrom } from "@/src/infrastructure/http/responses";
import { requireCurrentSession } from "@/src/infrastructure/session/current-session";

export const runtime = "nodejs";

const inputSchema = z.object({
  accountReference: z.string().trim().regex(/^\d{1,32}$/),
}).strict();

export async function POST(request: Request) {
  const requestId = requestIdFrom(request);
  const app = createApplication();
  try {
    assertSameOrigin(request);
    const input = inputSchema.parse(await request.json());
    const session = await requireCurrentSession(app.sessions, app.config.sessionCookieName);
    const account = await app.properties.resolveForIdentity(session.subjectId, input.accountReference, { requestId });
    await app.audit.append({
      eventId: crypto.randomUUID(), eventType: "PERSONAL_ACCOUNT_LOOKUP", actorId: session.subjectId,
      subjectId: account.localPropertyId, requestId, occurredAt: new Date().toISOString(), outcome: "success",
      metadata: { subjectType: "property", source: account.source ?? "unknown" },
    });
    await app.audit.append({
      eventId: crypto.randomUUID(), eventType: "PROPERTY_RESOLVED", actorId: session.subjectId,
      subjectId: account.localPropertyId, requestId, occurredAt: new Date().toISOString(), outcome: "success",
      metadata: { subjectType: "property", source: account.source ?? "unknown" },
    });
    await app.audit.append({
      eventId: crypto.randomUUID(), eventType: "ELIGIBILITY_RESOLVED", actorId: session.subjectId,
      subjectId: account.localPropertyId, requestId, occurredAt: new Date().toISOString(), outcome: "success",
      metadata: { subjectType: "property", result: "eligible" },
    });
    return Response.json({
      account: { accountNumber: account.accountId, address: account.address, unit: account.unit, ownershipKind: account.ownershipKind, verified: true },
      requestId,
    });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
