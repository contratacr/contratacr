import { requireAdmin } from "@/lib/auth/admin";
import { AdminShell } from "@/components/admin/admin-shell";
import { AdminCase } from "@/components/admin/admin-case";

export const dynamic = "force-dynamic";

export default async function AdminProviderPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  const { id } = await params;
  return (
    <AdminShell adminName={admin.fullName}>
      <AdminCase providerId={id} />
    </AdminShell>
  );
}
