import { getAdminUser } from "@/lib/auth/admin";
import { AdminShell } from "@/components/admin/admin-shell";
import { AdminQueue } from "@/components/admin/admin-queue";
import { AdminLogin } from "@/components/admin/admin-login";

export const dynamic = "force-dynamic";

// /admin is both the login and the panel: non-admins see the login form inline
// (no separate /admin/login URL), admins see the review queue.
export default async function AdminHomePage() {
  const admin = await getAdminUser();
  if (!admin) return <AdminLogin />;
  return (
    <AdminShell adminName={admin.fullName}>
      <AdminQueue />
    </AdminShell>
  );
}
