import { getAdminUser } from "@/lib/auth/admin";
import { AdminShell } from "@/components/admin/admin-shell";
import { AdminOverview } from "@/components/admin/admin-overview";
import { AdminLogin } from "@/components/admin/admin-login";
import { getAdminOverview } from "@/lib/admin/overview";

export const dynamic = "force-dynamic";

// /admin is both the login and the panel home: non-admins see the login form inline;
// admins land on "Resumen" (the overview dashboard).
export default async function AdminHomePage() {
  const admin = await getAdminUser();
  if (!admin) return <AdminLogin />;
  const data = await getAdminOverview("es");
  return (
    <AdminShell adminName={admin.fullName} active="resumen">
      <AdminOverview adminName={admin.fullName} data={data} />
    </AdminShell>
  );
}
