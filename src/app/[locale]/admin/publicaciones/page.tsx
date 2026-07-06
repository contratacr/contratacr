import { requireAdmin } from "@/lib/auth/admin";
import { AdminShell } from "@/components/admin/admin-shell";
import { AdminProjects } from "@/components/admin/admin-projects";

export const dynamic = "force-dynamic";

export default async function AdminPublicacionesPage() {
  const admin = await requireAdmin();
  return (
    <AdminShell adminName={admin.fullName} active="publicaciones">
      <AdminProjects />
    </AdminShell>
  );
}
