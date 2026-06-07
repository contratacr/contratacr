import { requireAdmin } from "@/lib/auth/admin";
import { AdminShell } from "@/components/admin/admin-shell";
import { AdminQueue } from "@/components/admin/admin-queue";

export const dynamic = "force-dynamic";

export default async function AdminHomePage() {
  const admin = await requireAdmin();
  return (
    <AdminShell adminName={admin.fullName}>
      <AdminQueue />
    </AdminShell>
  );
}
