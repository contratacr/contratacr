import {Link} from '@/i18n/navigation';
import {ChevronRight} from 'lucide-react';
import {directorySectionHref,suggestDirectorySections,type DirectoryLocation} from '@/lib/search/directory-search';
import {loadDirectorySearch} from '@/lib/directory/search-server';
import {placeCardExtras} from '@/lib/directory/card-extras';
import type {PlaceSearchItem} from '@/lib/directory/search-schemas';
import {PlaceCard} from '@/components/directory/place-card';

/**
 * Yelp-style mixed results (owner 2026-11-22): a search that names a business section ("farmacias", "restaurantes en
 * Heredia") shows the matching businesses in the SAME list as the professionals, same cards and spacing, under a
 * "Negocios" heading, followed by the professionals. No tabs. Public data only; neutral order. Any failure renders nothing.
 */
const SHOWN=8;
export function matchedBusinessSections(q:string|undefined,sections:readonly string[],locale:string){
 const text=(q??'').trim();
 if(!sections.length||text.length<3)return [];
 return suggestDirectorySections(text,sections,locale,1);
}

export type BusinessMix={section:string;label:string;href:string;total:number;items:PlaceSearchItem[];extras:Awaited<ReturnType<typeof placeCardExtras>>};

/** Businesses matching the search text (null when none / on any failure or after 1.8 s: the list never waits for them). */
export async function loadBusinessMix(q:string|undefined,sections:readonly string[],locale:string,location:DirectoryLocation):Promise<BusinessMix|null>{
 const work=(async()=>{
  const text=(q??'').trim();
  const match=matchedBusinessSections(text,sections,locale)[0];
  if(!match)return null;
  const href=directorySectionHref(match.section,text,location);
  const params=Object.fromEntries(new URLSearchParams(href.split('?')[1]??'')) as Record<string,string>;
  params.limit=String(SHOWN);
  const page=await loadDirectorySearch(match.section as Parameters<typeof loadDirectorySearch>[0],params);
  if(!page.ok)return null;
  const items=page.result.items.filter((i):i is PlaceSearchItem=>i.kind==='place').slice(0,SHOWN);
  if(!items.length)return null;
  const total=typeof page.facets?.total==='number'?page.facets.total:items.length;
  const extras=await placeCardExtras(items.map(i=>i.slug));
  return {section:match.section,label:match.label,href,total,items,extras};
 })().catch(()=>null);
 return Promise.race([work,new Promise<null>(r=>setTimeout(()=>r(null),1800))]);
}

/** One slim line above the mixed list: which businesses are mixed in and the way to all of them. */
export function BusinessMixNote({mix,locale}:{mix:BusinessMix;locale:string}){
 const en=locale==='en',t=(es:string,english:string)=>en?english:es;
 return <p data-businesses-block={mix.section} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-4 pb-1.5 pt-3 text-[13px] text-[#526277] lg:px-0 lg:pt-0">
  <span>{t('Incluye empresas de ','Includes businesses in ')}<strong className="font-bold text-[#162543]">{mix.label}</strong></span>
  {mix.total>mix.items.length&&<Link href={mix.href} className="inline-flex min-h-8 items-center gap-0.5 font-bold text-[#007fae] hover:underline">{t(`Ver las ${mix.total.toLocaleString('es-CR')}`,`See all ${mix.total.toLocaleString('en-US')}`)}<ChevronRight aria-hidden="true" className="h-4 w-4"/></Link>}
 </p>;
}
