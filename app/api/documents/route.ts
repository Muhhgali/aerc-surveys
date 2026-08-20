import { createApplication } from "@/src/infrastructure/composition-root";
import { errorResponse, requestIdFrom } from "@/src/infrastructure/http/responses";
import { requireCurrentSession } from "@/src/infrastructure/session/current-session";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const requestId = requestIdFrom(request);
  const app = createApplication();
  try {
    const session = await requireCurrentSession(app.sessions, app.config.sessionCookieName);
    return Response.json({ documents: await app.adminRepository.ownerDocuments(session.subjectId), requestId });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
