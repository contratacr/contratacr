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
const SHOWN=4;
export function matchedBusinessSections(q:string|undefined,sections:readonly string[],locale:string){
 const text=(q??'').trim();
 if(!sections.length||text.length<3)return [];
 return suggestDirectorySections(text,sections,locale,1);
}

async function loadBlock(q:string|undefined,sections:readonly string[],locale:string,location:DirectoryLocation){
 try{
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
  return {match,href,items,total,extras};
 }catch{return null;}
}

export async function BusinessesBlock({q,sections,locale,location,hasProfessionals=true}:{q:string|undefined;sections:readonly string[];locale:string;location:DirectoryLocation;hasProfessionals?:boolean}){
 const en=locale==='en',t=(es:string,english:string)=>en?english:es;
 const data=await loadBlock(q,sections,locale,location);
 if(!data)return null;
 const {match,href,items,total,extras}=data;
 return <section data-businesses-block={match.section} aria-labelledby="ccr-businesses-title" className="mb-3 min-w-0">
  <div className="flex items-baseline justify-between gap-3 px-4 pb-1.5 pt-3 lg:px-0 lg:pt-0">
   <h2 id="ccr-businesses-title" className="text-[15px] font-extrabold text-[#162543]">{t('Negocios','Businesses')} <span className="font-semibold text-[#68778d]">· {match.label}</span></h2>
   {total>items.length&&<Link href={href} className="inline-flex min-h-8 items-center gap-0.5 text-[13px] font-bold text-[#007fae] hover:underline">{t(`Ver los ${total.toLocaleString('es-CR')}`,`See all ${total.toLocaleString('en-US')}`)}<ChevronRight className="h-4 w-4" aria-hidden="true"/></Link>}
  </div>
  <div className="ccr-search-results-list flex min-w-0 flex-col gap-1.5 bg-white lg:gap-3 lg:bg-transparent">
   {items.map((item,i)=><div key={item.key} className="ccr-search-card-slot relative w-full min-w-0 lg:rounded-2xl"><PlaceCard item={item} locale={locale} rank={i+1} extra={extras[item.slug]??null}/></div>)}
  </div>
  {hasProfessionals&&<h2 className="px-4 pb-0 pt-4 text-[15px] font-extrabold text-[#162543] lg:px-0 lg:pt-5">{t('Profesionales','Professionals')}</h2>}
 </section>;
}
