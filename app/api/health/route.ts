import { getDatabaseClient } from "@/src/infrastructure/database/client";
import { requestIdFrom } from "@/src/infrastructure/http/responses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestId = requestIdFrom(request);
  try {
    await getDatabaseClient()`select 1 as healthy`;
    return Response.json({ status: "ok", database: "healthy", requestId });
  } catch {
    console.error(JSON.stringify({ level: "error", event: "database.readiness.failed", requestId }));
    return Response.json({ status: "unavailable", database: "unhealthy", requestId }, { status: 503 });
  }
}
