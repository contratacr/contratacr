import type {Metadata} from 'next';
import {notFound,redirect} from 'next/navigation';
import {createAdminClient} from '@/lib/supabase/admin';
import {createClient} from '@/lib/supabase/server';
import {safeGetUser} from '@/lib/supabase/get-user';
import {DirectoryShell} from '@/components/directory/directory-shell';
import {BrandClaim} from '@/components/directory/brand-claim';
import {placeSlugSchema} from '@/lib/directory/schemas';
import {placeSectionById} from '@/lib/directory/place-verticals';
import type {PublicBrand} from '@/lib/directory/place-features';
import {PlacesMap} from '@/components/maps/places-map';
import {DIR_ENABLED} from '@/lib/directory/feature-flags';

// LOCAL PRO ONLY (place features round, development only like /lugar): /marca/<slug> — every public branch of a chain
// (brands built from OpenStreetMap brand/brand:wikidata and normalized names; staff merge/split them). Branches ordered
// by province then name, aggregate rating weighted by review count, a map of every branch (MapLibre + OpenFreeMap,
// loaded on scroll; each marker links to its branch) and a list with links. A merged brand redirects to the brand it was merged into. Claiming a brand is
// staff-reviewed with documents.
export const dynamic='force-dynamic';
async function load(slug:string){
 if(!placeSlugSchema.safeParse(slug).success)return null;
 const r=await createAdminClient().rpc('dir_brand_public',{p_slug:slug});
 return r.error||!r.data?null:r.data as PublicBrand|{mergedInto:string};
}
export async function generateMetadata({params}:{params:Promise<{locale:string;slug:string}>}):Promise<Metadata>{
 if(!DIR_ENABLED)return {};
 const {locale,slug}=await params,b=await load(slug),en=locale==='en';
 if(!b||'mergedInto' in b)return {title:en?'Brand not available':'Marca no disponible',robots:{index:false,follow:false}};
 const path='/marca/'+slug,description=en?`${b.branchCount} branches of ${b.name} in Costa Rica: locations, hours and reviews.`:`${b.branchCount} sucursales de ${b.name} en Costa Rica: ubicación, horario y reseñas.`;
 return {title:b.name,description,alternates:{canonical:(en?'/en':'')+path,languages:{es:path,en:'/en'+path}},robots:{index:false,follow:true},openGraph:{title:b.name,description,type:'website'}};
}
export default async function BrandRoute({params}:{params:Promise<{locale:string;slug:string}>}){
 if(!DIR_ENABLED)notFound();
 const {locale,slug}=await params,en=locale==='en',prefix=en?'/en':'',t=(es:string,english:string)=>en?english:es;
 const b=await load(slug);if(!b)notFound();
 if('mergedInto' in b)redirect(`${prefix}/marca/${b.mergedInto}`);
 const user=await safeGetUser(await createClient());
 const loginHref=user?null:`${prefix}/login?redirect=${encodeURIComponent(`${prefix}/marca/${slug}`)}`;
 const ring='focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#009FD9]';
 const nf=new Intl.NumberFormat(en?'en-US':'es-CR',{minimumFractionDigits:1,maximumFractionDigits:1});
 const pts=b.branches.filter(x=>x.lat!=null&&x.lng!=null) as (PublicBrand['branches'][number]&{lat:number;lng:number})[];
 const sections=[...new Set(b.branches.map(x=>x.vertical))].map(v=>placeSectionById(v)).filter(Boolean).map(s=>en?s!.nameEn:s!.nameEs);
 const desc=en?b.descriptionEn:b.descriptionEs;
 return <DirectoryShell><main id="contenido" data-brand-page={b.slug} className="mx-auto max-w-4xl space-y-8 px-4 py-8 text-[#162543] sm:py-12">
  <nav aria-label={t('Ruta de navegación','Breadcrumb')} className="text-sm"><ol className="flex flex-wrap gap-1">
   <li><a className={`underline underline-offset-2 ${ring}`} href={en?'/en':'/'}>{t('Inicio','Home')}</a> ›</li><li>{t('Marcas','Brands')} ›</li><li aria-current="page" className="text-slate-700">{b.name}</li></ol></nav>
  <header className="space-y-3">
   <h1 className="break-words text-3xl font-extrabold sm:text-4xl">{b.name}</h1>
   <p className="text-slate-700">{sections.join(' · ')}</p>
   <p className="flex flex-wrap gap-2 text-sm">
    <span data-brand-branches={b.branchCount} className="rounded-full border border-slate-300 px-3 py-1">{b.branchCount} {t(b.branchCount===1?'sucursal':'sucursales',b.branchCount===1?'branch':'branches')}</span>
    {b.rating.count>0&&b.rating.average!=null&&<span data-brand-rating className="rounded-full border border-slate-300 px-3 py-1">{nf.format(b.rating.average)} / 5 · {b.rating.count} {t(b.rating.count===1?'reseña en sus sucursales':'reseñas en sus sucursales',b.rating.count===1?'review across branches':'reviews across branches')}</span>}
    {b.claimed&&<span data-brand-claimed className="rounded-full bg-emerald-50 px-3 py-1 font-semibold text-emerald-900">{t('Información administrada por la marca','Information managed by the brand')}</span>}
   </p>
   {desc&&<p className="max-w-2xl">{desc}</p>}
   {b.website&&<p><a data-brand-website className={`inline-flex min-h-11 items-center rounded-full border border-[#162543] px-5 font-semibold ${ring}`} href={b.website} rel="nofollow noopener noreferrer" target="_blank">{t('Sitio web de la marca','Brand website')}</a></p>}
  </header>
  {pts.length>0&&<section aria-labelledby="brand-map" className="space-y-2">
   <h2 id="brand-map" className="text-lg font-bold">{t('Mapa de sucursales','Branch map')}</h2>
   <div data-brand-map={pts.length}>
    <PlacesMap cluster locale={locale} className="h-72 sm:h-96"
     label={t(`Mapa de ${pts.length} sucursales de ${b.name}`,`Map of ${pts.length} ${b.name} branches`)}
     points={pts.map(p=>({id:p.slug,lat:p.lat,lng:p.lng,label:`${p.name}${p.area?` · ${p.area}`:''}`,href:`${prefix}/lugar/${p.slug}`}))}/>
   </div>
   <p className="text-sm text-slate-700">{t('Cada marcador abre su sucursal; un círculo con número agrupa sucursales cercanas: púlselo para acercar. En cada sucursal encontrará «Cómo llegar» con OpenStreetMap, Google Maps o Waze.','Each marker opens its branch; a numbered circle groups nearby branches: select it to zoom in. Every branch page has “Directions” with OpenStreetMap, Google Maps or Waze.')}</p>
  </section>}
  <section aria-labelledby="brand-list" className="space-y-3">
   <h2 id="brand-list" className="text-lg font-bold">{t('Sucursales','Branches')}</h2>
   <p className="text-sm text-slate-700">{t('Ordenadas por provincia y nombre. El orden no depende de pagos.','Ordered by province and name. Order never depends on payment.')}</p>
   <ul className="divide-y divide-[#d7e1ea] rounded-2xl border border-[#d7e1ea]">{b.branches.map(x=><li key={x.slug} data-brand-branch={x.slug} className="flex flex-wrap items-center justify-between gap-2 p-4">
    <div className="min-w-0"><a className={`font-semibold underline underline-offset-2 ${ring}`} href={`${prefix}/lugar/${x.slug}`}>{x.name}</a>
     <p className="text-sm text-slate-700">{x.area}{x.ratingCount>0&&x.rating!=null?` · ${nf.format(x.rating)} / 5 (${x.ratingCount})`:''}</p></div>
    {x.lat!=null&&x.lng!=null&&<a className={`inline-flex min-h-11 items-center rounded-full border border-[#d7e1ea] px-4 text-sm font-semibold ${ring}`} href={`https://www.openstreetmap.org/?mlat=${x.lat}&mlon=${x.lng}#map=17/${x.lat}/${x.lng}`} rel="noopener noreferrer" target="_blank">{t('Cómo llegar','Directions')}<span className="sr-only"> (OpenStreetMap)</span></a>}
   </li>)}</ul>
  </section>
  {!b.claimed&&<BrandClaim slug={b.slug} locale={locale} loginHref={loginHref} pending={b.claimPending}/>}
  <p className="border-t border-[#d7e1ea] pt-6 text-sm text-slate-700">{t('Agrupamos las sucursales con datos de OpenStreetMap (marca y Wikidata) y nombres normalizados; el equipo de ContrataCR corrige uniones y separaciones. ¿Ve un error? Use «Reportar un problema o pedir el retiro» en la sucursal.','We group branches with OpenStreetMap data (brand and Wikidata) and normalized names; the ContrataCR team fixes merges and splits. See a mistake? Use «Report a problem or request removal» on the branch.')}</p>
 </main></DirectoryShell>;
}
