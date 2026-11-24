import type {Metadata} from 'next';
import {notFound,redirect} from 'next/navigation';
import {headers} from 'next/headers';
import {getTranslations} from 'next-intl/server';
import {createAdminClient} from '@/lib/supabase/admin';
import {createClient} from '@/lib/supabase/server';
import {safeGetUser} from '@/lib/supabase/get-user';
import {DirectoryShell} from '@/components/directory/directory-shell';
import {MyListsTabs,type ListSuggestion} from '@/components/directory/my-lists-tabs';
import type {SavedList} from '@/lib/directory/place-features';
import type {DirectorySearchResult} from '@/lib/directory/search-schemas';
import {DIR_ENABLED,withoutDisabledVerticals} from '@/lib/directory/feature-flags';

// «Mis listas» of the signed-in person (private by default; optional share link without any user id): tabs He estado |
// Quiero ir | Listas. Writes go through /api/listas.
export const dynamic='force-dynamic';
export async function generateMetadata({params}:{params:Promise<{locale:string}>}):Promise<Metadata>{
 const {locale}=await params;return {title:(await getTranslations({locale,namespace:'directoryRoutes'}))('listsTitle'),robots:{index:false,follow:false}};
}
async function suggestions(en:boolean):Promise<ListSuggestion[]>{
 try{
  const r=await createAdminClient().rpc('dir_search',{p_vertical:'lugares',p_q:null,p_filters:{},p_lat:null,p_lng:null,p_radius_km:null,p_sort:'best_rated',p_cursor:null,p_limit:14});
  if(r.error||!r.data)return [];
  return withoutDisabledVerticals((r.data as DirectorySearchResult).items).flatMap(i=>i.kind==='place'?[{slug:i.slug,name:i.name,area:i.address.locality??i.address.adminArea2??'',kinds:en?i.vertical.nameEn:i.vertical.nameEs}]:[]);
 }catch{return [];}
}
export default async function ListsRoute({params}:{params:Promise<{locale:string}>}){
 if(!DIR_ENABLED)notFound();
 const {locale}=await params,en=locale==='en',prefix=en?'/en':'';
 const user=await safeGetUser(await createClient());
 if(!user)redirect(`${prefix}/login?redirect=${encodeURIComponent(prefix+'/listas')}`);
 const [r,sugg]=await Promise.all([createAdminClient().rpc('dir_saved_lists_mine',{p_actor:user.id,p_slug:null}),suggestions(en)]);
 const h=await headers(),host=h.get('host')??'localhost',proto=h.get('x-forwarded-proto')??'http';
 return <DirectoryShell><main id="contenido" data-lists-page className="mx-auto max-w-3xl space-y-6 px-4 py-6 text-[#162543] sm:py-12">
  {r.error?<p role="alert">{en?'Could not load your lists. Please reload.':'No se pudieron cargar sus listas. Recargue la página.'}</p>
   :<MyListsTabs locale={locale} initial={(r.data??[]) as SavedList[]} origin={`${proto}://${host}`} suggestions={sugg}/>}
 </main></DirectoryShell>;
}
