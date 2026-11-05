import { getAdminUser } from "@/lib/auth/admin";
import { AdminShell } from "@/components/admin/admin-shell";
import { AdminAccess } from "@/components/admin/admin-access";
import { AdminConversations } from "@/components/admin/admin-conversations";

export const dynamic = "force-dynamic";
export default async function AdminConversationsPage() {
  const admin = await getAdminUser();
  if (!admin) return <AdminAccess />;
  return <AdminShell adminName={admin.fullName} active="conversaciones"><AdminConversations /></AdminShell>;
}
