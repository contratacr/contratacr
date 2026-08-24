import { requireAdmin } from "@/lib/auth/admin";
import { AdminShell } from "@/components/admin/admin-shell";
import { AdminCosts } from "@/components/admin/admin-costs";

export const dynamic = "force-dynamic";

export default async function AdminCostosPage() {
  const admin = await requireAdmin();
  return (
    <AdminShell adminName={admin.fullName} active="costos">
      <AdminCosts />
    </AdminShell>
  );
}
