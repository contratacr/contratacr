import { getAdminUser } from "@/lib/auth/admin";
import { AdminShell } from "@/components/admin/admin-shell";
import { AdminContactos } from "@/components/admin/admin-contactos";
import { AdminAccess } from "@/components/admin/admin-access";

export const dynamic = "force-dynamic";

export default async function AdminContactosPage() {
  const admin = await getAdminUser();
  if (!admin) return <AdminAccess />;
  return (
    <AdminShell adminName={admin.fullName} active="contactos">
      <AdminContactos />
    </AdminShell>
  );
}
