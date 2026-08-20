import { getDatabaseClient } from "@/src/infrastructure/database/client";
import { inspectDatabaseUrl, normalizeDatabaseUrl } from "@/src/infrastructure/database/database-url";
import { requestIdFrom } from "@/src/infrastructure/http/responses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function redact(text: string): string {
  return text.replace(/postgresql:\/\/[^@\s]+@/gi, "postgresql://***@");
}

export async function GET(request: Request) {
  const requestId = requestIdFrom(request);
  try {
    await getDatabaseClient()`select 1 as healthy`;
    return Response.json({ status: "ok", database: "healthy", requestId });
  } catch (error) {
    const err = error as { message?: string; code?: string };
    let target: { host?: string; port?: string; sslmode?: string } = {};
    try {
      if (process.env.DATABASE_URL) target = inspectDatabaseUrl(normalizeDatabaseUrl(process.env.DATABASE_URL).url);
    } catch (parseError) {
      console.error(JSON.stringify({
        level: "error",
        event: "database.url.invalid",
        requestId,
        message: (parseError as Error).message,
      }));
    }
    console.error(JSON.stringify({
      level: "error",
      event: "database.readiness.failed",
      requestId,
      code: err.code ?? "unknown",
      message: redact(err.message ?? "connection failed"),
      host: target.host,
      port: target.port,
      sslmode: target.sslmode,
    }));
    return Response.json({ status: "unavailable", database: "unhealthy", requestId }, { status: 503 });
  }
}
