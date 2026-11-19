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
import {BIZ,HeroTile,RatingLine,ring} from '@/components/directory/biz-ui';
import {BranchCard} from '@/components/directory/place-branches';
import {ShareButton} from '@/components/directory/share-button';
import {BadgeCheck,ChevronRight,ExternalLink} from 'lucide-react';

// LOCAL PRO ONLY (place features round, development only like /lugar): /marca/<slug> — every public branch of a chain
// (brands built from OpenStreetMap brand/brand:wikidata and normalized names; staff merge/split them). Branches ordered
// by province then name, aggregate rating weighted by review count, a map of every branch (MapLibre + OpenFreeMap,
// loaded on scroll; each marker links to its branch) and a list with links. A merged brand redirects to the brand it was merged into. Claiming a brand is
// staff-reviewed with documents.
// 2026-11-19 (Yelp brand overview model): brand header (tile, name, sections, branch count, rating across branches,
// share), province filter (?provincia=, server-side, no JS), numbered branch cards (same family as the result cards)
// next to a sticky map with the same numbers; the explanation of the grouping is a short footer line.
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
export default async function BrandRoute({params,searchParams}:{params:Promise<{locale:string;slug:string}>;searchParams:Promise<Record<string,string|string[]|undefined>>}){
 if(!DIR_ENABLED)notFound();
 const {locale,slug}=await params,en=locale==='en',prefix=en?'/en':'',t=(es:string,english:string)=>en?english:es;
 const b=await load(slug);if(!b)notFound();
 if('mergedInto' in b)redirect(`${prefix}/marca/${b.mergedInto}`);
 const sp=await searchParams,wanted=typeof sp.provincia==='string'?sp.provincia:null;
 const user=await safeGetUser(await createClient());
 const loginHref=user?null:`${prefix}/login?redirect=${encodeURIComponent(`${prefix}/marca/${slug}`)}`;
 const provinces=[...new Set(b.branches.map(x=>x.province).filter((p):p is string=>!!p))];
 const province=wanted&&provinces.includes(wanted)?wanted:null;
 const shown=province?b.branches.filter(x=>x.province===province):b.branches;
 const pts=shown.flatMap((x,n)=>x.lat!=null&&x.lng!=null?[{id:x.slug,lat:x.lat,lng:x.lng,label:`${n+1}. ${x.name}${x.area?` · ${x.area}`:''}`,href:`${prefix}/lugar/${x.slug}`,rank:n+1}]:[]);
 const sections=[...new Set(b.branches.map(x=>x.vertical))].map(v=>placeSectionById(v)).filter(Boolean).map(s=>en?s!.nameEn:s!.nameEs);
 const desc=en?b.descriptionEn:b.descriptionEs,base=`${prefix}/marca/${b.slug}`;
 const firstVertical=b.branches[0]?.vertical??'grocery';
 const pill=(active:boolean)=>`inline-flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-full border px-4 text-sm font-semibold transition-colors ${ring} ${active?'border-[#162543] bg-[#162543] text-white':'border-[#cfd9e3] bg-white text-[#162543] hover:border-[#162543]'}`;
 return <DirectoryShell><main id="contenido" data-brand-page={b.slug} className="mx-auto max-w-6xl px-4 pb-14 pt-5 text-[#162543] sm:pt-8">
  <nav aria-label={t('Ruta de navegación','Breadcrumb')} className="mb-5 text-sm text-[#526277]"><ol className="flex flex-wrap items-center gap-1">
   <li><a className={`hover:underline ${ring}`} href={en?'/en':'/'}>{t('Inicio','Home')}</a></li><li aria-hidden="true"><ChevronRight className="h-3.5 w-3.5"/></li><li>{t('Marcas','Brands')}</li><li aria-hidden="true"><ChevronRight className="h-3.5 w-3.5"/></li><li aria-current="page" className="text-[#162543]">{b.name}</li></ol></nav>
  <header className="flex items-start gap-4 border-b border-[#e8edf2] pb-7 sm:gap-5">
   <HeroTile verticalId={firstVertical} className="h-16 w-16 shrink-0 rounded-2xl sm:h-28 sm:w-28" iconClass="h-8 w-8 sm:h-12 sm:w-12"/>
   <div className="min-w-0 flex-1 space-y-3">
    <h1 className="break-words text-[30px] font-extrabold leading-[1.1] tracking-[-0.02em] sm:text-[40px]">{b.name}</h1>
    <RatingLine average={b.rating.average} count={b.rating.count} en={en}/>
    {b.rating.count>0&&b.rating.average!=null&&<p data-brand-rating className="-mt-2 text-sm text-[#526277]">{t('Promedio de las reseñas de sus sucursales','Average of the reviews of its branches')}</p>}
    <ul className="flex flex-wrap items-center gap-2">
     <li data-brand-branches={b.branchCount} className="rounded-full bg-[#162543] px-3 py-1 text-[13px] font-bold text-white">{b.branchCount} {t(b.branchCount===1?'sucursal':'sucursales',b.branchCount===1?'branch':'branches')}</li>
     {sections.map(s=><li key={s} className={BIZ.chip}>{s}</li>)}
     {b.claimed&&<li data-brand-claimed className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-[13px] font-semibold text-emerald-900"><BadgeCheck aria-hidden="true" className="h-4 w-4"/>{t('Información administrada por la marca','Information managed by the brand')}</li>}
    </ul>
    {desc&&<p className="max-w-2xl text-[15px] leading-7 text-[#334155]">{desc}</p>}
    <div className="flex flex-wrap gap-2.5 pt-1">
     {b.website&&<a data-brand-website className={BIZ.secondary} href={b.website} rel="nofollow noopener noreferrer" target="_blank"><ExternalLink aria-hidden="true" className="h-4 w-4"/>{t('Sitio web de la marca','Brand website')}</a>}
     <ShareButton title={b.name} locale={locale} className={BIZ.secondary}/>
    </div>
   </div>
  </header>

  {provinces.length>1&&<nav aria-label={t('Filtrar por provincia','Filter by province')} className="-mx-4 mt-6 overflow-x-auto px-4" data-brand-provinces>
   <ul className="flex gap-2 pb-1">
    <li><a href={`${base}#sucursales`} aria-current={!province?'page':undefined} className={pill(!province)}>{t('Todo el país','Whole country')} <span className="ml-1 opacity-70">{b.branches.length}</span></a></li>
    {provinces.map(p=>{const n=b.branches.filter(x=>x.province===p).length;return <li key={p}><a href={`${base}?provincia=${encodeURIComponent(p)}#sucursales`} aria-current={province===p?'page':undefined} data-brand-province={p} className={pill(province===p)}>{p} <span className="ml-1 opacity-70">{n}</span></a></li>;})}
   </ul></nav>}

  <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_440px]">
   <section id="sucursales" aria-labelledby="brand-list" className="min-w-0 scroll-mt-24 space-y-4">
    <h2 id="brand-list" className={BIZ.h2}>{province?t(`Sucursales en ${province}`,`Branches in ${province}`):t('Sucursales','Branches')} <span className="text-base font-semibold text-[#526277]">({shown.length})</span></h2>
    <ol className="grid gap-3">{shown.map((x,n)=><li key={x.slug}><BranchCard branch={x} locale={locale} rank={n+1}/></li>)}</ol>
   </section>
   {pts.length>0&&<section aria-labelledby="brand-map" className="order-first lg:order-none">
    <h2 id="brand-map" className="sr-only">{t('Mapa de sucursales','Branch map')}</h2>
    <div data-brand-map={pts.length} className="overflow-hidden rounded-2xl border border-[#e3e9ef] lg:sticky lg:top-24">
     <PlacesMap cluster locale={locale} className="h-64 sm:h-80 lg:h-[calc(100vh-8rem)] lg:max-h-[720px]"
      label={t(`Mapa de ${pts.length} sucursales de ${b.name}`,`Map of ${pts.length} ${b.name} branches`)} points={pts}/>
    </div>
   </section>}
  </div>

  {!b.claimed&&<div className="mt-10"><BrandClaim slug={b.slug} locale={locale} loginHref={loginHref} pending={b.claimPending}/></div>}
  <p className="mt-10 border-t border-[#e8edf2] pt-6 text-sm text-slate-600">{t('Sucursales agrupadas con datos de OpenStreetMap (marca y Wikidata), ordenadas por provincia y nombre. ¿Ve un error? Use "Sugerir un cambio" en la sucursal.','Branches grouped with OpenStreetMap data (brand and Wikidata), ordered by province and name. See a mistake? Use "Suggest an edit" on the branch.')}</p>
 </main></DirectoryShell>;
}
