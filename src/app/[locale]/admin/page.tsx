import { getAdminUser } from "@/lib/auth/admin";
import { AdminShell } from "@/components/admin/admin-shell";
import { AdminOverview } from "@/components/admin/admin-overview";
import { AdminAccess } from "@/components/admin/admin-access";
import { getAdminOverview } from "@/lib/admin/overview";
import { getAdminActivity } from "@/lib/admin/activity";

export const dynamic = "force-dynamic";

// Anonymous visitors see the login; authenticated non-admins see access denied.
// Administrators land on the overview dashboard.
export default async function AdminHomePage() {
  const admin = await getAdminUser();
  if (!admin) return <AdminAccess />;
  const [data, activity] = await Promise.all([getAdminOverview("es"), getAdminActivity(12, "es")]);
  return (
    <AdminShell adminName={admin.fullName} active="resumen">
      <AdminOverview adminName={admin.fullName} data={data} activity={activity} />
    </AdminShell>
  );
}
