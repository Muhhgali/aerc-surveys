import { ZodError } from "zod";
import { ApplicationError } from "@/src/application/errors";

const statusByCode: Record<ApplicationError["code"], number> = {
  unauthenticated: 401,
  invalid_personal_account: 404,
  invalid_survey: 404,
  closed_survey: 409,
  unauthorized_property: 403,
  invalid_answers: 422,
  duplicate_vote: 409,
  not_found: 404,
};

export function requestIdFrom(request: Request): string {
  const candidate = request.headers.get("x-request-id");
  return candidate && /^[a-zA-Z0-9._:-]{8,128}$/.test(candidate) ? candidate : crypto.randomUUID();
}

export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  if ((origin && origin !== new URL(request.url).origin) || (fetchSite && !["same-origin", "none"].includes(fetchSite))) {
    throw new ApplicationError("unauthenticated", "Cross-origin mutation is not allowed");
  }
}

export function errorResponse(error: unknown, requestId: string): Response {
  if (error instanceof ZodError) {
    return Response.json({ error: { code: "invalid_request", requestId, issues: error.issues.map((issue) => ({ path: issue.path, message: issue.message })) } }, { status: 400 });
  }
  if (error instanceof ApplicationError) {
    return Response.json({ error: { code: error.code, message: error.message, requestId } }, { status: statusByCode[error.code] });
  }
  console.error(JSON.stringify({ level: "error", event: "http.unhandled_error", requestId }));
  return Response.json({ error: { code: "internal_error", message: "Unexpected server error", requestId } }, { status: 500 });
}
