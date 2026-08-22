import { requireAdmin } from "@/lib/auth/admin";
import { AdminShell } from "@/components/admin/admin-shell";
import { AdminMarketplace } from "@/components/admin/admin-marketplace";

export const dynamic = "force-dynamic";

export default async function AdminOfertasPage() {
  const admin = await requireAdmin();
  return (
    <AdminShell adminName={admin.fullName} active="ofertas">
      <AdminMarketplace kind="offers" />
    </AdminShell>
  );
}
