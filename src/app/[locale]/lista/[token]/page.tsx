import type {Metadata} from 'next';
import {notFound} from 'next/navigation';
import {createAdminClient} from '@/lib/supabase/admin';
import {DirectoryShell} from '@/components/directory/directory-shell';
import {SHARE_TOKEN_RE} from '@/lib/directory/place-features';
import {DIR_ENABLED} from '@/lib/directory/feature-flags';

// LOCAL PRO ONLY (place features round, development only like /negocios): shared saved list, /lista/<token>. The token is
// random (no user id inside); the page shows only the list name and its places that are still public — never who made
// it. Turning sharing off (or deleting the list) makes the link answer 404. Not indexed.
export const dynamic='force-dynamic';
type Shared={name:string;places:{slug:string;name:string;vertical:string;verticalNameEs:string;verticalNameEn:string;area:string;rating:number|null;ratingCount:number}[]};
async function load(token:string){
 if(!SHARE_TOKEN_RE.test(token))return null;
 const r=await createAdminClient().rpc('dir_saved_list_public',{p_token:token});
 return r.error||!r.data?null:r.data as Shared;
}
export async function generateMetadata({params}:{params:Promise<{locale:string;token:string}>}):Promise<Metadata>{
 if(!DIR_ENABLED)return {};
 const {locale,token}=await params,l=await load(token),en=locale==='en';
 return {title:l?l.name:(en?'List not available':'Lista no disponible'),robots:{index:false,follow:false},referrer:'no-referrer'};
}
export default async function SharedListRoute({params}:{params:Promise<{locale:string;token:string}>}){
 if(!DIR_ENABLED)notFound();
 const {locale,token}=await params,l=await load(token);if(!l)notFound();
 const en=locale==='en',t=(es:string,english:string)=>en?english:es,prefix=en?'/en':'';
 const nf=new Intl.NumberFormat(en?'en-US':'es-CR',{minimumFractionDigits:1,maximumFractionDigits:1});
 const ring='focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#009FD9]';
 return <DirectoryShell><main id="contenido" data-shared-list className="mx-auto max-w-3xl space-y-6 px-4 py-8 text-[#162543] sm:py-12">
  <header className="space-y-2"><p className="text-sm font-semibold text-[#0b4f6c]">{t('Lista compartida','Shared list')}</p>
   <h1 className="break-words text-3xl font-extrabold">{l.name}</h1>
   <p className="text-slate-700">{l.places.length} {t(l.places.length===1?'lugar':'lugares',l.places.length===1?'place':'places')}</p></header>
  {l.places.length===0?<p className="rounded-2xl bg-slate-50 p-5">{t('Esta lista todavía no tiene lugares públicos.','This list has no public places yet.')}</p>
   :<ul className="divide-y divide-[#d7e1ea] rounded-2xl border border-[#d7e1ea]">{l.places.map(p=><li key={p.slug} data-shared-place={p.slug} className="p-4">
    <a className={`font-semibold underline underline-offset-2 ${ring}`} href={`${prefix}/negocios/${p.slug}`}>{p.name}</a>
    <p className="text-sm text-slate-700">{en?p.verticalNameEn:p.verticalNameEs}{p.area?` · ${p.area}`:''}{p.ratingCount>0&&p.rating!=null?` · ${nf.format(p.rating)} / 5 (${p.ratingCount})`:''}</p></li>)}</ul>}
  <p className="text-sm text-slate-700">{t('Cualquier persona con este enlace puede ver la lista. ContrataCR no muestra quién la creó.','Anyone with this link can see the list. ContrataCR does not show who made it.')}</p>
 </main></DirectoryShell>;
}
