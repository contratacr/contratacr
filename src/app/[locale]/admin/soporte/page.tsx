import { getAdminUser } from "@/lib/auth/admin";
import { AdminShell } from "@/components/admin/admin-shell";
import { AdminSupport } from "@/components/admin/admin-support";
import { AdminAccess } from "@/components/admin/admin-access";

export const dynamic = "force-dynamic";

export default async function AdminSupportPage() {
  const admin = await getAdminUser();
  if (!admin) return <AdminAccess />;
  return (
    <AdminShell adminName={admin.fullName} active="soporte">
      <AdminSupport />
    </AdminShell>
  );
}
