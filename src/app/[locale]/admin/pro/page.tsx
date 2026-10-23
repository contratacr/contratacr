import { MembershipAdmin } from '@/components/pro/membership-admin';
import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/auth/admin';
import { AdminShell } from '@/components/admin/admin-shell';
import { SocialPanel } from '@/components/pro/social-panel';
export const dynamic = 'force-dynamic';
export default async function AdminProPage() {
 if (process.env.NODE_ENV !== 'development') notFound();
 const admin = await requireAdmin();
 return <AdminShell adminName={admin.fullName} active="pro"><div className="min-w-0 space-y-6"><MembershipAdmin/><SocialPanel admin server/></div></AdminShell>;
}
