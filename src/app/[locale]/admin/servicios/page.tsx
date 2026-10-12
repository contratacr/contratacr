import { getAdminUser } from "@/lib/auth/admin";
import { AdminShell } from "@/components/admin/admin-shell";
import { AdminCategories } from "@/components/admin/admin-categories";
import { AdminAccess } from "@/components/admin/admin-access";

export const dynamic = "force-dynamic";

export default async function AdminServicesPage() {
  const admin = await getAdminUser();
  if (!admin) return <AdminAccess />;
  return (
    <AdminShell adminName={admin.fullName} active="categorias">
      <AdminCategories />
    </AdminShell>
  );
}
