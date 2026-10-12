import { getAdminUser } from "@/lib/auth/admin";
import { AdminShell } from "@/components/admin/admin-shell";
import { AdminAnalytics } from "@/components/admin/admin-analytics";
import { AdminAccess } from "@/components/admin/admin-access";
import { getAdminReports } from "@/lib/admin/reports";

export const dynamic = "force-dynamic";

// Comprehensive admin analytics — users, professionals, marketplace activity,
// interactions and support. Admin-only.
export default async function AdminAnaliticaPage() {
  const admin = await getAdminUser();
  if (!admin) return <AdminAccess />;
  const data = await getAdminReports("es");
  return (
    <AdminShell adminName={admin.fullName} active="analitica">
      <AdminAnalytics data={data} />
    </AdminShell>
  );
}
