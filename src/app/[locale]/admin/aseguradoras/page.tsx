import { getAdminUser } from "@/lib/auth/admin";
import { AdminShell } from "@/components/admin/admin-shell";
import { AdminInsurers } from "@/components/admin/admin-insurers";
import { AdminAccess } from "@/components/admin/admin-access";

export const dynamic = "force-dynamic";

export default async function AdminInsurersPage() {
  const admin = await getAdminUser();
  if (!admin) return <AdminAccess />;
  return (
    <AdminShell adminName={admin.fullName} active="aseguradoras">
      <AdminInsurers />
    </AdminShell>
  );
}
