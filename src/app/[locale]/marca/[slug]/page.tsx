import type {Metadata} from 'next';
import {notFound,redirect} from 'next/navigation';
import {createAdminClient} from '@/lib/supabase/admin';
import {createClient} from '@/lib/supabase/server';
import {safeGetUser} from '@/lib/supabase/get-user';
import {DirectoryShell} from '@/components/directory/directory-shell';
import {SectionHeaderTitle} from '@/components/mobile/section-header-title';
import {BrandClaim} from '@/components/directory/brand-claim';
import {placeSlugSchema} from '@/lib/directory/schemas';
import {placeSectionById} from '@/lib/directory/place-verticals';
import type {PublicBrand} from '@/lib/directory/place-features';
import {PlacesMap} from '@/components/maps/places-map';
import {DIR_ENABLED} from '@/lib/directory/feature-flags';
import {BIZ,HeroTile,RatingLine,ring} from '@/components/directory/biz-ui';
import {placeCardExtras} from '@/lib/directory/card-extras';
import {BranchCard} from '@/components/directory/place-branches';
import {ShareButton} from '@/components/directory/share-button';
import {BadgeCheck,ChevronRight,ExternalLink} from 'lucide-react';
import {cn} from '@/lib/utils';
import {PlaceTabs} from '@/components/directory/place-tabs';
import {ProfileIdentityName} from '@/components/professionals/profile-identity-name';
import {VerifiedSeal} from '@/components/ui/verified-seal';

// LOCAL PRO ONLY (place features round, development only like /negocios): /marca/<slug> — every public branch of a chain
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
 const extras=await placeCardExtras(shown.slice(0,40).map(x=>x.slug));
 const pts=shown.flatMap((x,n)=>x.lat!=null&&x.lng!=null?[{id:x.slug,lat:x.lat,lng:x.lng,label:`${n+1}. ${x.name}${x.area?` · ${x.area}`:''}`,href:`${prefix}/negocios/${x.slug}`,rank:n+1,name:x.name,sub:x.area||undefined,rating:x.rating,ratingCount:x.ratingCount}]:[]);
 const sections=[...new Set(b.branches.map(x=>x.vertical))].map(v=>placeSectionById(v)).filter(Boolean).map(s=>en?s!.nameEn:s!.nameEs);
 const desc=en?b.descriptionEn:b.descriptionEs,base=`${prefix}/marca/${b.slug}`;
 const firstVertical=b.branches[0]?.vertical??'grocery';
 const pill=(active:boolean)=>`inline-flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-full border px-4 text-sm font-semibold transition-colors ${ring} ${active?'border-[#162543] bg-[#162543] text-white':'border-[#cfd9e3] bg-white text-[#162543] hover:border-[#162543]'}`;
 // Phones (owner 2026-11-27): a detail screen, so the bar is «← Marca» (server-painted, no jump) instead of the logo, and
 // the breadcrumb (its way back) stays only from lg. No in-app screen behind → the arrow goes home.
 const barTitle=t('Marca','Brand');
 return <DirectoryShell section={{title:barTitle,centrado:true}}><SectionHeaderTitle title={barTitle} fallbackHref="/" tambienEnLaWeb centrado/><main id="contenido" data-brand-page={b.slug} className="mx-auto max-w-7xl px-4 pb-14 pt-4 text-[#162543] sm:px-6 lg:px-8 lg:pt-8">
  <nav aria-label={t('Ruta de navegación','Breadcrumb')} data-brand-breadcrumb className="mb-5 text-sm text-[#526277] max-lg:hidden"><ol className="flex flex-wrap items-center gap-1">
   <li><a className={`hover:underline ${ring}`} href={en?'/en':'/'}>{t('Inicio','Home')}</a></li><li aria-hidden="true"><ChevronRight className="h-3.5 w-3.5"/></li><li>{t('Marcas','Brands')}</li><li aria-hidden="true"><ChevronRight className="h-3.5 w-3.5"/></li><li aria-current="page" className="text-[#162543]">{b.name}</li></ol></nav>
  <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_440px]">
   <header className="min-w-0 rounded-2xl border border-[#e5e7eb] bg-white p-4 shadow-sm sm:p-6 lg:col-start-1 lg:row-start-1">
    <div className="flex min-w-0 items-center gap-3 sm:gap-5">
     <span className={cn(BIZ.avatar,'relative grid shrink-0 place-items-center overflow-hidden rounded-full')}><HeroTile verticalId={firstVertical} className="h-full w-full" iconClass="h-8 w-8 sm:h-10 sm:w-10"/></span>
     <div className="min-w-0 flex-1">
      <ProfileIdentityName testId="brand-name" name={b.name} badge={b.claimed?<VerifiedSeal className="h-4 w-4 text-[#009FD9]" label={t('Información administrada por la marca','Information managed by the brand')}/>:null}/>
      <div className="mt-1.5 sm:mt-2"><RatingLine average={b.rating.average} count={b.rating.count} en={en}/></div>
      {b.rating.count>0&&b.rating.average!=null&&<p data-brand-rating className="mt-1 text-[12.5px] text-[#68778d]">{t('Promedio de las reseñas de sus sucursales','Average of the reviews of its branches')}</p>}
      <ul className="mt-2 flex flex-wrap items-center gap-1.5">
       <li data-brand-branches={b.branchCount} className="rounded-full bg-[#162543] px-2.5 py-1 text-[12px] font-bold text-white">{b.branchCount} {t(b.branchCount===1?'sucursal':'sucursales',b.branchCount===1?'branch':'branches')}</li>
       {sections.map(s=><li key={s} className={BIZ.chip}>{s}</li>)}
       {b.claimed&&<li data-brand-claimed className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[12px] font-semibold text-emerald-900"><BadgeCheck aria-hidden="true" className="h-3.5 w-3.5"/>{t('Información administrada por la marca','Information managed by the brand')}</li>}
      </ul>
     </div>
    </div>
    {desc&&<p className="mt-4 max-w-2xl text-[15px] leading-7 text-[#334155]">{desc}</p>}
    <div className="mt-4 flex flex-wrap items-center gap-2.5 border-t border-[#eef2f6] pt-4">
     {b.website&&<a data-brand-website className={BIZ.secondary} href={b.website} rel="nofollow noopener noreferrer" target="_blank"><ExternalLink aria-hidden="true" className="h-4 w-4"/>{t('Sitio web de la marca','Brand website')}</a>}
     <ShareButton title={b.name} locale={locale} className={BIZ.secondary}/>
    </div>
   </header>

   {pts.length>0&&<aside aria-labelledby="brand-map" className="min-w-0 lg:col-start-2 lg:row-span-2 lg:row-start-1">
    <h2 id="brand-map" className="sr-only">{t('Mapa de sucursales','Branch map')}</h2>
    <div data-brand-map={pts.length} className="overflow-hidden rounded-2xl border border-[#e5e7eb] shadow-sm lg:sticky lg:top-20">
     <PlacesMap cluster locale={locale} className="h-64 sm:h-80 lg:h-[calc(100vh-8rem)] lg:max-h-[720px]" bare
      label={t(`Mapa de ${pts.length} sucursales de ${b.name}`,`Map of ${pts.length} ${b.name} branches`)} points={pts}/>
    </div>
   </aside>}

   <div className="min-w-0 lg:col-start-1 lg:row-start-2">
    <PlaceTabs label={t('Secciones de la marca','Brand sections')} tabs={[{id:'branches',label:`${t('Sucursales','Branches')} (${b.branches.length})`,anchors:['sucursales'],content:<>
     {provinces.length>1&&<nav aria-label={t('Filtrar por provincia','Filter by province')} className="-mx-4 overflow-x-auto px-4 sm:-mx-6 sm:px-6" data-brand-provinces>
      <ul className="flex gap-2 pb-1">
       <li><a href={`${base}#sucursales`} aria-current={!province?'page':undefined} className={pill(!province)}>{t('Todo el país','Whole country')} <span className="ml-1 opacity-70">{b.branches.length}</span></a></li>
       {provinces.map(p=>{const n=b.branches.filter(x=>x.province===p).length;return <li key={p}><a href={`${base}?provincia=${encodeURIComponent(p)}#sucursales`} aria-current={province===p?'page':undefined} data-brand-province={p} className={pill(province===p)}>{p} <span className="ml-1 opacity-70">{n}</span></a></li>;})}
      </ul></nav>}
     <section id="sucursales" aria-labelledby="brand-list" className="scroll-mt-24 space-y-4">
      <h2 id="brand-list" className={BIZ.h2}>{province?t(`Sucursales en ${province}`,`Branches in ${province}`):t('Sucursales','Branches')} <span className="text-base font-semibold text-[#526277]">({shown.length})</span></h2>
      <ol className="grid gap-3">{shown.map((x,n)=><li key={x.slug}><BranchCard branch={x} locale={locale} rank={n+1} extra={extras[x.slug]}/></li>)}</ol>
     </section></>}]}/>
   </div>
  </div>

  {!b.claimed&&<div className="mt-10"><BrandClaim slug={b.slug} locale={locale} loginHref={loginHref} pending={b.claimPending}/></div>}
  <p className="mt-10 border-t border-[#e8edf2] pt-6 text-sm text-slate-600">{t('Sucursales agrupadas con datos de OpenStreetMap (marca y Wikidata), ordenadas por provincia y nombre. ¿Ve un error? Use "Sugerir un cambio" en la sucursal.','Branches grouped with OpenStreetMap data (brand and Wikidata), ordered by province and name. See a mistake? Use "Suggest an edit" on the branch.')}</p>
 </main></DirectoryShell>;
}
