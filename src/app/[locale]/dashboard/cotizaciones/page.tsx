import type {Metadata} from 'next';
import {notFound,redirect} from 'next/navigation';
import {createClient} from '@/lib/supabase/server';
import {safeGetUser} from '@/lib/supabase/get-user';
import {PrivateEstimateClientInbox} from '@/components/pro/private-estimate-client-inbox';
import {prefijoDeIdioma} from '@/lib/prefijo-de-idioma';
import {getTranslations} from 'next-intl/server';
export const dynamic='force-dynamic';
export async function generateMetadata({params}:{params:Promise<{locale:string}>}):Promise<Metadata>{const {locale}=await params;const t=await getTranslations({locale,namespace:'ProRouteCopy'});return{title:t('estimatesTitle'),robots:{index:false,follow:false},alternates:{canonical:prefijoDeIdioma(locale)+'/dashboard/cotizaciones'}};}
export default async function CustomerEstimatesPage({params}:{params:Promise<{locale:string}>}){if(process.env.NODE_ENV!=='development')notFound();const {locale}=await params,prefix=prefijoDeIdioma(locale),user=await safeGetUser(await createClient());if(!user)redirect(prefix+'/login?redirect='+encodeURIComponent(prefix+'/dashboard/cotizaciones'));return <PrivateEstimateClientInbox/>;}
