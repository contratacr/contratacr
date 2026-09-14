import { getAdminUser } from "@/lib/auth/admin";
import { AdminShell } from "@/components/admin/admin-shell";
import { AdminPendientes } from "@/components/admin/admin-pendientes";
import { AdminLogin } from "@/components/admin/admin-login";

export const dynamic = "force-dynamic";

export default async function AdminPendientesPage() {
  const admin = await getAdminUser();
  if (!admin) return <AdminLogin />;
  return (
    <AdminShell adminName={admin.fullName} active="pendientes">
      <AdminPendientes />
    </AdminShell>
  );
}
