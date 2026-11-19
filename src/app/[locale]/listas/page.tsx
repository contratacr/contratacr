import type {Metadata} from 'next';
import {notFound,redirect} from 'next/navigation';
import {headers} from 'next/headers';
import {getTranslations} from 'next-intl/server';
import {createAdminClient} from '@/lib/supabase/admin';
import {createClient} from '@/lib/supabase/server';
import {safeGetUser} from '@/lib/supabase/get-user';
import {DirectoryShell} from '@/components/directory/directory-shell';
import {SavedListsManager} from '@/components/directory/saved-lists-manager';
import type {SavedList} from '@/lib/directory/place-features';
import {DIR_ENABLED} from '@/lib/directory/feature-flags';

// LOCAL PRO ONLY (place features round, development only like /lugar): «Mis listas» of the signed-in person (private by
// default; optional share link without any user id). Writes go through /api/listas.
export const dynamic='force-dynamic';
export async function generateMetadata({params}:{params:Promise<{locale:string}>}):Promise<Metadata>{
 const {locale}=await params;return {title:(await getTranslations({locale,namespace:'directoryRoutes'}))('listsTitle'),robots:{index:false,follow:false}};
}
export default async function ListsRoute({params}:{params:Promise<{locale:string}>}){
 if(!DIR_ENABLED)notFound();
 const {locale}=await params,en=locale==='en',prefix=en?'/en':'';
 const user=await safeGetUser(await createClient());
 if(!user)redirect(`${prefix}/login?redirect=${encodeURIComponent(prefix+'/listas')}`);
 const r=await createAdminClient().rpc('dir_saved_lists_mine',{p_actor:user.id,p_slug:null});
 const h=await headers(),host=h.get('host')??'localhost',proto=h.get('x-forwarded-proto')??'http';
 return <DirectoryShell><main id="contenido" data-lists-page className="mx-auto max-w-3xl space-y-6 px-4 py-8 text-[#162543] sm:py-12">
  <header className="space-y-2"><h1 className="text-3xl font-extrabold">{en?'My lists':'Mis listas'}</h1>
   <p className="text-slate-700">{en?'Places you saved. Lists are private unless you create a share link.':'Lugares que guardó. Las listas son privadas salvo que cree un enlace para compartir.'}</p></header>
  {r.error?<p role="alert">{en?'Could not load your lists. Please reload.':'No se pudieron cargar sus listas. Recargue la página.'}</p>
   :<SavedListsManager locale={locale} initial={(r.data??[]) as SavedList[]} origin={`${proto}://${host}`}/>}
 </main></DirectoryShell>;
}
