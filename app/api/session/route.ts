import { cookies } from "next/headers";
import { createApplication } from "@/src/infrastructure/composition-root";
import { assertSameOrigin, errorResponse, requestIdFrom } from "@/src/infrastructure/http/responses";
import { requireCurrentSession } from "@/src/infrastructure/session/current-session";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const requestId = requestIdFrom(request);
  const app = createApplication();
  try {
    const session = await requireCurrentSession(app.sessions, app.config.sessionCookieName);
    const user = await app.authentication.currentUser(session.subjectId);
    const holdings = await app.database<{ propertyId: string; accountNumber: string; city: string; street: string; building: string; unit: string }[]>`
      select p.id as "propertyId", pa.account_number as "accountNumber", p.city, p.street, p.building, p.premise as unit
      from property_holdings ph join properties p on p.id = ph.property_id
      left join personal_accounts pa on pa.id = ph.personal_account_id
      where ph.user_id = ${session.subjectId} and ph.status = 'active'
      order by p.street, p.building, p.premise
    `;
    return Response.json({ authenticated: true, user, holdings, expiresAt: session.expiresAt, requestId });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}

export async function DELETE(request: Request) {
  const requestId = requestIdFrom(request);
  const app = createApplication();
  try {
    assertSameOrigin(request);
    const cookieStore = await cookies();
    const token = cookieStore.get(app.config.sessionCookieName)?.value;
    if (token) await app.sessions.revoke(token);
    cookieStore.delete(app.config.sessionCookieName);
    await app.audit.append({
      eventId: crypto.randomUUID(), eventType: "SESSION_REVOKED",
      requestId, occurredAt: new Date().toISOString(), outcome: "success", metadata: {},
    });
    return new Response(null, { status: 204 });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
