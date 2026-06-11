import { requireAdmin } from "@/lib/auth/admin";
import { AdminShell } from "@/components/admin/admin-shell";
import { AdminUserProfile } from "@/components/admin/admin-user-profile";

export const dynamic = "force-dynamic";

export default async function AdminUserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  const { id } = await params;
  return (
    <AdminShell adminName={admin.fullName} active="usuarios">
      <AdminUserProfile userId={id} />
    </AdminShell>
  );
}
