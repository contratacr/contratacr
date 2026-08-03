import { requireAdmin } from "@/lib/auth/admin";
import { AdminShell } from "@/components/admin/admin-shell";
import { AdminReviews } from "@/components/admin/admin-reviews";

export const dynamic = "force-dynamic";

export default async function AdminReviewsPage() {
  const admin = await requireAdmin();
  return (
    <AdminShell adminName={admin.fullName} active="resenas">
      <AdminReviews />
    </AdminShell>
  );
}

