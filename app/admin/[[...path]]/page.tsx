import { AdminConsole } from "@/app/admin/admin-console";
import { AdminLogin } from "@/app/admin/admin-login";
import { requireAdminPermission } from "@/src/infrastructure/session/admin-authorization";

export const dynamic = "force-dynamic";

export default async function AdminPage({ params }: { params: Promise<{ path?: string[] }> }) {
  const { path = [] } = await params;
  if (path[0] === "login") return <AdminLogin />;
  const authorized = await requireAdminPermission("admin.access").catch(() => null);
  if (!authorized) return <AdminLogin unauthorized />;
  return <AdminConsole initialPath={path} principal={authorized.principal} />;
}
