import { getAdminUser } from "@/lib/auth/admin";
import { AdminShell } from "@/components/admin/admin-shell";
import { AdminAnalytics } from "@/components/admin/admin-analytics";
import { AdminAccess } from "@/components/admin/admin-access";
import { getAdminMeasurement } from "@/lib/admin/measurement";
import { getAdminReports } from "@/lib/admin/reports";

export const dynamic = "force-dynamic";

// Comprehensive admin analytics — users, professionals, marketplace activity,
// interactions and support. Admin-only.
export default async function AdminAnaliticaPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const admin = await getAdminUser();
  if (!admin) return <AdminAccess />;
  const { period } = await searchParams;
  const selectedPeriod = period === "week" ? "week" : "all";
  const [data, measurement] = await Promise.all([getAdminReports("es", selectedPeriod), getAdminMeasurement(selectedPeriod)]);
  return (
    <AdminShell adminName={admin.fullName} active="analitica">
      <AdminAnalytics data={data} measurement={measurement} />
    </AdminShell>
  );
}
