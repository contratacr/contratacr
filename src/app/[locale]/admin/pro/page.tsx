import { MembershipAdmin } from '@/components/pro/membership-admin';
import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/auth/admin';
import { AdminShell } from '@/components/admin/admin-shell';
import { PromotionAdmin } from '@/components/pro/promotion-admin';
import {PRO_ENABLED} from '@/lib/pro/enabled';
export const dynamic = 'force-dynamic';
export default async function AdminProPage() {
 if (!PRO_ENABLED) notFound();
 const admin = await requireAdmin();
 return <AdminShell adminName={admin.fullName} active="pro"><div className="min-w-0 space-y-6"><MembershipAdmin/><PromotionAdmin/></div></AdminShell>;
}
