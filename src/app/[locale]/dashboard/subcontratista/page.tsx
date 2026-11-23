import type {Metadata} from 'next';
import {notFound, redirect} from 'next/navigation';
import {createClient} from '@/lib/supabase/server';
import {safeGetUser} from '@/lib/supabase/get-user';
import {SubcontractorPortal} from '@/components/pro/subcontractor-portal';
import {prefijoDeIdioma} from '@/lib/prefijo-de-idioma';
import {getTranslations} from 'next-intl/server';
import {PRO_ENABLED} from '@/lib/pro/enabled';
export const dynamic='force-dynamic';
export async function generateMetadata({params}:{params:Promise<{locale:string}>}):Promise<Metadata>{const {locale}=await params;const t=await getTranslations({locale,namespace:'ProRouteCopy'});return{title:t('subcontractorTitle'),robots:{index:false,follow:false},referrer:'no-referrer'};}
// Round 8: subcontractor portal (any registered account). Development only; scope enforced in SQL.
export default async function SubcontractorPage({params}:{params:Promise<{locale:string}>}){
 if(!PRO_ENABLED)notFound();
 const {locale}=await params,prefix=prefijoDeIdioma(locale),user=await safeGetUser(await createClient());
 if(!user)redirect(prefix+'/login?redirect='+encodeURIComponent(prefix+'/dashboard/subcontratista'));
 return <SubcontractorPortal/>;
}
