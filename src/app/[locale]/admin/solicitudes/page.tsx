import { requireAdmin } from "@/lib/auth/admin";
import { AdminShell } from "@/components/admin/admin-shell";
import { AdminBookings } from "@/components/admin/admin-bookings";

export const dynamic = "force-dynamic";

export default async function AdminSolicitudesPage() {
  const admin = await requireAdmin();
  return (
    <AdminShell adminName={admin.fullName} active="solicitudes">
      <AdminBookings />
    </AdminShell>
  );
}
