import { getAdminUser } from "@/lib/auth/admin";
import { AdminShell } from "@/components/admin/admin-shell";
import { AdminCampaigns } from "@/components/admin/admin-campaigns";
import { AdminAccess } from "@/components/admin/admin-access";

export const dynamic = "force-dynamic";

// Correos de temporada a clientes registrados. Solo admin.
export default async function AdminCampanasPage() {
  const admin = await getAdminUser();
  if (!admin) return <AdminAccess />;
  return (
    <AdminShell adminName={admin.fullName} active="campanas">
      <AdminCampaigns />
    </AdminShell>
  );
}
