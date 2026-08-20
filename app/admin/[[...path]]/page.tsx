import { AdminConsole } from "@/app/admin/admin-console";
import { AdminAccessError, AdminLogin } from "@/app/admin/admin-login";
import { ApplicationError } from "@/src/application/errors";
import { loadProviderConfig } from "@/src/infrastructure/config/provider-config";
import { requireAdminAccess } from "@/src/infrastructure/session/admin-authorization";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

function mockAuthEnabled() {
  try {
    const config = loadProviderConfig();
    return config.enableMockAuth && config.identity === "mock";
  } catch {
    return false;
  }
}

export default async function AdminPage({ params }: { params: Promise<{ path?: string[] }> }) {
  const { path = [] } = await params;
  if (path[0] === "login") return <AdminLogin mockAuthEnabled={mockAuthEnabled()} />;
  let authorized: Awaited<ReturnType<typeof requireAdminAccess>> | undefined;
  let accessError: unknown;
  try {
    authorized = await requireAdminAccess();
  } catch (error) {
    accessError = error;
  }
  if (authorized) return <AdminConsole initialPath={path} principal={authorized.principal} />;
  if (accessError instanceof ApplicationError && accessError.code === "unauthenticated") return <AdminLogin mockAuthEnabled={mockAuthEnabled()} />;
  if (accessError instanceof ApplicationError && accessError.code === "forbidden") return <AdminLogin unauthorized mockAuthEnabled={mockAuthEnabled()} />;
  const message = accessError instanceof Error ? accessError.message : "Не удалось проверить административный доступ.";
  return <AdminAccessError message={message} />;
}
