import type {Metadata} from 'next';
import {notFound,redirect,RedirectType} from 'next/navigation';
import {getTranslations} from 'next-intl/server';
import {createClient} from '@/lib/supabase/server';
import {safeGetUser} from '@/lib/supabase/get-user';
import {DIR_ENABLED} from '@/lib/directory/feature-flags';

// «Mis listas» of the signed-in person (private by default; optional share link without any user id): tabs He estado |
// Quiero ir | Listas. Writes go through /api/listas.
// Owner, 2026-11-27: it lives inside «Mi panel» (Guardados → Mis listas, ?tab=saved&vista=listas): signed in, this address
// redirects there (replace); signed out, to login, which brings the person back here and so to the panel.
export const dynamic='force-dynamic';
export async function generateMetadata({params}:{params:Promise<{locale:string}>}):Promise<Metadata>{
 const {locale}=await params;return {title:(await getTranslations({locale,namespace:'directoryRoutes'}))('listsTitle'),robots:{index:false,follow:false}};
}
export default async function ListsRoute({params}:{params:Promise<{locale:string}>}){
 if(!DIR_ENABLED)notFound();
 const {locale}=await params,en=locale==='en',prefix=en?'/en':'';
 const user=await safeGetUser(await createClient());
 if(!user)redirect(`${prefix}/login?redirect=${encodeURIComponent(prefix+'/listas')}`);
 redirect(`${prefix}/dashboard/profesional?tab=saved&vista=listas`,RedirectType.replace);
}
