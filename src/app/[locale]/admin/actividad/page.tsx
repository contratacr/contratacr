import { getAdminUser } from "@/lib/auth/admin";
import { AdminShell } from "@/components/admin/admin-shell";
import { AdminActivity } from "@/components/admin/admin-activity";
import { AdminLogin } from "@/components/admin/admin-login";
import { getAdminActivity } from "@/lib/admin/activity";

export const dynamic = "force-dynamic";

// Recent cross-platform activity feed. Admin-only.
export default async function AdminActividadPage() {
  const admin = await getAdminUser();
  if (!admin) return <AdminLogin />;
  const events = await getAdminActivity(40, "es");
  return (
    <AdminShell adminName={admin.fullName} active="actividad">
      <AdminActivity events={events} />
    </AdminShell>
  );
}
