import { requireAdmin } from "@/lib/auth/admin";
import { AdminShell } from "@/components/admin/admin-shell";
import { AdminCoverage } from "@/components/admin/admin-coverage";

export const dynamic = "force-dynamic";

export default async function AdminCoberturaPage() {
  const admin = await requireAdmin();
  return (
    <AdminShell adminName={admin.fullName} active="cobertura">
      <AdminCoverage />
    </AdminShell>
  );
}
