import { ZodError } from "zod";
import { ApplicationError } from "@/src/application/errors";

const statusByCode: Record<ApplicationError["code"], number> = {
  unauthenticated: 401,
  invalid_personal_account: 404,
  invalid_survey: 404,
  closed_survey: 409,
  unauthorized_property: 403,
  invalid_answers: 422,
  invalid_vote_state: 409,
  idempotency_conflict: 409,
  duplicate_vote: 409,
  invalid_request: 400,
  signing_failed: 502,
  document_failed: 500,
  not_found: 404,
};

export function requestIdFrom(request: Request): string {
  const candidate = request.headers.get("x-request-id");
  return candidate && /^[a-zA-Z0-9._:-]{8,128}$/.test(candidate) ? candidate : crypto.randomUUID();
}

export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  const requestUrl = new URL(request.url);
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",", 1)[0]?.trim();
  const forwardedProtocol = request.headers.get("x-forwarded-proto")?.split(",", 1)[0]?.trim();
  const expectedHost = forwardedHost || request.headers.get("host") || requestUrl.host;
  const expectedProtocol = forwardedProtocol ? `${forwardedProtocol}:` : requestUrl.protocol;
  let originMatches = true;

  if (origin) {
    try {
      const originUrl = new URL(origin);
      originMatches = originUrl.host === expectedHost && originUrl.protocol === expectedProtocol;
    } catch {
      originMatches = false;
    }
  }

  if (!originMatches || (fetchSite && !["same-origin", "none"].includes(fetchSite))) {
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
  const detail = error instanceof Error ? { errorName: error.name, errorMessage: error.message } : {};
  console.error(JSON.stringify({ level: "error", event: "http.unhandled_error", requestId, ...detail }));
  return Response.json({ error: { code: "internal_error", message: "Unexpected server error", requestId } }, { status: 500 });
}
