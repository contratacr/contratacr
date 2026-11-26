import {notFound} from 'next/navigation';
import {requireAdmin} from '@/lib/auth/admin';
import {AdminShell} from '@/components/admin/admin-shell';
import {AdminDirectoryQueue} from '@/components/directory/admin-directory-queue';
import {AdminPhoneReport} from '@/components/directory/admin-phone-report';
import {DIR_ENABLED} from '@/lib/directory/feature-flags';
import {AdminPlaceCreate} from '@/components/directory/admin-place-create';
import {sitemapSections} from '@/lib/directory/sitemap-sections';

// LOCAL PRO ONLY (multivertical M1, development only like /admin/pro): staff queue of the public directory —
// claims, reviews/replies, user price reports, place reports and pharmacy permits. requireAdmin = admin + MFA; the API
// checks it again on every request.
export const dynamic='force-dynamic';
export default async function AdminDirectoryPage({params}:{params:Promise<{locale:string}>}){
 if(!DIR_ENABLED)notFound();
 const admin=await requireAdmin();const {locale}=await params;
 return <AdminShell adminName={admin.fullName} active="directorio"><div className="mb-6"><AdminPlaceCreate locale={locale} sections={sitemapSections().map(x=>x.section)}/></div><AdminDirectoryQueue locale={locale}/><AdminPhoneReport locale={locale}/></AdminShell>;
}
