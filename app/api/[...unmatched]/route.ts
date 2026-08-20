import { requestIdFrom } from "@/src/infrastructure/http/responses";

/**
 * Without this, an unknown /api path falls through to the owner app's catch-all page and answers
 * 200 with HTML, which hides missing or misspelled endpoints behind an apparently successful call.
 */
function notFound(request: Request) {
  return Response.json(
    { error: { code: "not_found", message: "Unknown API route", requestId: requestIdFrom(request) } },
    { status: 404 },
  );
}

export const GET = notFound;
export const POST = notFound;
export const PUT = notFound;
export const PATCH = notFound;
export const DELETE = notFound;
export const HEAD = notFound;
export const OPTIONS = notFound;
