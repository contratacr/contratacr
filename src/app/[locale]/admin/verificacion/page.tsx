import { getAdminUser } from "@/lib/auth/admin";
import { AdminShell } from "@/components/admin/admin-shell";
import { AdminQueue } from "@/components/admin/admin-queue";
import { AdminLogin } from "@/components/admin/admin-login";

export const dynamic = "force-dynamic";

// Verificación queue — moved off the /admin home (now "Resumen") to its own route.
export default async function AdminVerificacionPage() {
  const admin = await getAdminUser();
  if (!admin) return <AdminLogin />;
  return (
    <AdminShell adminName={admin.fullName} active="verificacion">
      <AdminQueue />
    </AdminShell>
  );
}
