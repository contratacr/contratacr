import type {Metadata} from 'next';
import {notFound} from 'next/navigation';
import {getTranslations} from 'next-intl/server';
import {createClient} from '@/lib/supabase/server';
import {safeGetUser} from '@/lib/supabase/get-user';
import {DIR_ENABLED} from '@/lib/directory/feature-flags';
import {rutaInternaSegura} from '@/lib/navigation/ruta-interna';
import {BusinessSignup} from '@/components/directory/business-signup';

// /registro/empresa (owner 2026-11-27): «Empresa o local» at sign-up → «Agregar o reclamar mi empresa». Directory only:
// with DIR_ENABLED off (production) the page does not exist. Never indexed.
export const dynamic='force-dynamic';
export async function generateMetadata({params}:{params:Promise<{locale:string}>}):Promise<Metadata>{
 const {locale}=await params;
 const t=await getTranslations({locale,namespace:'registerChoice'});
 return {title:t('businessPageTitle'),robots:{index:false,follow:false}};
}
export default async function BusinessSignupPage({params,searchParams}:{params:Promise<{locale:string}>;searchParams:Promise<{redirect?:string}>}){
 if(!DIR_ENABLED)notFound();
 const [{locale},sp,user]=await Promise.all([params,searchParams,createClient().then(safeGetUser)]);
 return <BusinessSignup locale={locale} signedIn={!!user} redirect={rutaInternaSegura(typeof sp.redirect==='string'?sp.redirect:null)}/>;
}
