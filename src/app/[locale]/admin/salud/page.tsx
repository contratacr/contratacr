import { getAdminUser } from "@/lib/auth/admin";
import { AdminShell } from "@/components/admin/admin-shell";
import { AdminAccess } from "@/components/admin/admin-access";
import { AdminHealth } from "@/components/admin/admin-health";
export const dynamic="force-dynamic";
export default async function Page(){const admin=await getAdminUser();if(!admin)return <AdminAccess/>;return <AdminShell adminName={admin.fullName} active="salud"><AdminHealth/></AdminShell>;}
