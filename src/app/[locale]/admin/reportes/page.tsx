import { getAdminUser } from "@/lib/auth/admin";
import { AdminShell } from "@/components/admin/admin-shell";
import { AdminReports } from "@/components/admin/admin-reports";
import { AdminAccess } from "@/components/admin/admin-access";

export const dynamic = "force-dynamic";

export default async function AdminReportsPage() {
  const admin = await getAdminUser();
  if (!admin) return <AdminAccess />;
  return (
    <AdminShell adminName={admin.fullName} active="reportes">
      <AdminReports />
    </AdminShell>
  );
}
