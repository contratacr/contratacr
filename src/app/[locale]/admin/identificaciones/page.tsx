import { requireAdmin } from "@/lib/auth/admin";
import { AdminShell } from "@/components/admin/admin-shell";
import { AdminIdentifications } from "@/components/admin/admin-identifications";
export const dynamic = "force-dynamic";
export default async function AdminIdentificationsPage() {
  const admin = await requireAdmin();
  return <AdminShell adminName={admin.fullName} active="identificaciones"><AdminIdentifications /></AdminShell>;
}
