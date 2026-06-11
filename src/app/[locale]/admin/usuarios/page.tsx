import { requireAdmin } from "@/lib/auth/admin";
import { AdminShell } from "@/components/admin/admin-shell";
import { AdminUsers } from "@/components/admin/admin-users";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const admin = await requireAdmin();
  return (
    <AdminShell adminName={admin.fullName} active="usuarios">
      <AdminUsers />
    </AdminShell>
  );
}
