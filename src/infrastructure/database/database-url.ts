/**
 * Shared DATABASE_URL normalisation for scripts and runtime.
 * Never log the returned URL: it may contain credentials.
 */
export type DatabaseTarget = {
  url: string;
  host: string;
  port: string;
  database: string;
  sslmode: string;
  remote: boolean;
};

export function isLoopbackHost(hostname: string): boolean {
  return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1";
}

export function inspectDatabaseUrl(url: string): Omit<DatabaseTarget, "url"> {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parsed.port || "5432",
    database: decodeURIComponent(parsed.pathname.replace(/^\//, "")),
    sslmode: parsed.searchParams.get("sslmode") || "disable",
    remote: !isLoopbackHost(parsed.hostname),
  };
}

/**
 * Makes a connection string usable with postgres.js and Supabase:
 * - remote hosts get sslmode=require when it was omitted;
 * - square-bracket passwords are treated as a copied Supabase placeholder, not as the password.
 */
export function normalizeDatabaseUrl(url: string): DatabaseTarget {
  if (/[<>]/.test(url) || url.includes("project-ref") || url.includes("YOUR_PASSWORD")) {
    throw new Error("DATABASE_URL still contains a documentation placeholder. Copy the Session pooler URI from Supabase Dashboard → Project Settings → Database, replace only the password, and do not wrap the password in <> or [].");
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("DATABASE_URL is not a valid URL. Quote the PowerShell assignment, percent-encode reserved password characters (# @ : / ?), and do not keep Supabase [YOUR-PASSWORD] brackets.");
  }

  const password = decodeURIComponent(parsed.password);
  if ((password.startsWith("[") && password.endsWith("]")) || (password.startsWith("<") && password.endsWith(">"))) {
    if (password.length > 2) {
      console.warn("DATABASE_URL password was wrapped in placeholder brackets; those are not part of the password.");
      parsed.password = password.slice(1, -1);
    }
  }

  const remote = !isLoopbackHost(parsed.hostname);
  if (remote && !parsed.searchParams.get("sslmode")) {
    parsed.searchParams.set("sslmode", "require");
  }

  const normalized = parsed.toString();
  return { url: normalized, ...inspectDatabaseUrl(normalized) };
}

/**
 * Vercel/serverless must use Supabase transaction pooler (6543). Session mode (5432) caps at
 * ~15 clients and returns EMAXCONNSESSION once Preview + Production lambdas fill the pool.
 */
export function runtimeDatabaseUrl(url: string): DatabaseTarget {
  const target = normalizeDatabaseUrl(url);
  const parsed = new URL(target.url);
  if (parsed.hostname.endsWith(".pooler.supabase.com") && (parsed.port === "5432" || parsed.port === "")) {
    parsed.port = "6543";
  }
  const normalized = parsed.toString();
  return { url: normalized, ...inspectDatabaseUrl(normalized) };
}

export function runtimePoolMax(remote: boolean, configured = process.env.DATABASE_POOL_MAX): number {
  const parsed = Number(configured);
  const fallback = remote ? 5 : 10;
  const value = Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  return remote ? Math.min(value, 5) : value;
}

export function postgresClientOptions(target: Pick<DatabaseTarget, "remote">, extra: { max?: number; connect_timeout?: number } = {}) {
  return {
    max: extra.max ?? 1,
    prepare: false as const,
    connect_timeout: extra.connect_timeout ?? (target.remote ? 20 : 10),
    ssl: target.remote ? "require" as const : false as const,
  };
}
