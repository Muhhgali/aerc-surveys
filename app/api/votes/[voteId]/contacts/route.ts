import { z } from "zod";
import { voteContactsSchema } from "@/src/domain/vote-contacts";
import { ApplicationError } from "@/src/application/errors";
import { createApplication } from "@/src/infrastructure/composition-root";
import { assertSameOrigin, errorResponse, requestIdFrom } from "@/src/infrastructure/http/responses";
import { requireCurrentSession } from "@/src/infrastructure/session/current-session";

export const runtime = "nodejs";

export async function PUT(request: Request, context: { params: Promise<{ voteId: string }> }) {
  const requestId = requestIdFrom(request);
  const app = createApplication();
  try {
    assertSameOrigin(request);
    const voteId = z.uuid().parse((await context.params).voteId);
    const body = voteContactsSchema.parse(await request.json());
    const session = await requireCurrentSession(app.sessions, app.config.sessionCookieName);
    const result = await app.database`
      insert into vote_contact_details (vote_id, phone, email, full_name)
      select ${voteId}, ${body.phone ?? null}, ${body.email ?? null}, ${body.fullName ?? null}
      from votes where id=${voteId} and user_id=${session.subjectId} and status='draft'
      on conflict (vote_id) do update set phone=excluded.phone, email=excluded.email,
        full_name=coalesce(excluded.full_name, vote_contact_details.full_name)
    `;
    if (!result.count) throw new ApplicationError("invalid_vote_state", "Contact details can be saved only for a draft vote");
    return Response.json({ saved: true, requestId });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
