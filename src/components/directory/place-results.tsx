import {Plus} from 'lucide-react';
import {Link} from '@/i18n/navigation';
import {directorySectionHref,type DirectoryLocation} from '@/lib/search/directory-search';
import {loadDirectorySearch} from '@/lib/directory/search-server';
import {placeCardExtras,type CardExtra} from '@/lib/directory/card-extras';
import type {PlaceSearchItem,SearchVertical} from '@/lib/directory/search-schemas';
import {matchedBusinessSections} from '@/components/search/businesses-block';
import {PlaceResultRow} from './place-result-row';

/**
 * Place results of /buscar on phones (Yelp app list): which section the search names, the places (filtered and sorted by
 * the chips of result-chips.tsx) and the numbered "Mejores resultados" list. Filters the section search already has
 * (open now, order, area) go to dir_search; price level and takeout are attributes of the place, applied here over the
 * loaded page (honest: only the places loaded are filtered). Sponsored sections do not exist in the data, so none is drawn.
 */
export type PlaceFilters={abierto?:boolean;nivel?:number[];llevar?:boolean;orden?:'relevance'|'rating'|'distance'|'reviews'};
export type PlaceResults={section:string;label:string;sectionHref:string;items:PlaceSearchItem[];extras:Record<string,CardExtra>;total:number;failed:boolean};
const LIMIT=40;

export function placeIntent(q:string|undefined,sections:readonly string[],locale:string){return matchedBusinessSections(q,sections,locale)[0]??null;}

export async function loadPlaceResults(q:string|undefined,sections:readonly string[],locale:string,location:DirectoryLocation,f:PlaceFilters):Promise<PlaceResults|null>{
 const match=placeIntent(q,sections,locale);if(!match)return null;
 const text=(q??'').trim();
 const sectionHref=directorySectionHref(match.section,text,location);
 const params=Object.fromEntries(new URLSearchParams(sectionHref.split('?')[1]??'')) as Record<string,string>;
 params.limit=String(LIMIT);
 if(f.abierto)params.openNow='1';
 const hasPoint=!!params.lat&&!!params.lng;
 if(f.orden==='rating')params.sort='best_rated';
 else if(f.orden==='distance'&&hasPoint)params.sort='distance';
 const page=await loadDirectorySearch(match.section as SearchVertical,params).catch(()=>null);
 if(!page||!page.ok)return {section:match.section,label:match.label,sectionHref,items:[],extras:{},total:0,failed:true};
 let items=page.result.items.filter((i):i is PlaceSearchItem=>i.kind==='place');
 if(f.nivel?.length)items=items.filter(i=>f.nivel!.includes(Number(i.attributes.priceLevel)));
 if(f.llevar)items=items.filter(i=>i.attributes.takeaway===true);
 if(f.orden==='reviews')items=[...items].sort((a,b)=>b.rating.count-a.rating.count);
 const extras=await placeCardExtras(items.map(i=>i.slug));
 const total=typeof page.facets?.total==='number'?page.facets.total:items.length;
 return {section:match.section,label:match.label,sectionHref,items,extras,total,failed:false};
}

export function PlaceResultsMobile({results,locale,query,nearText}:{results:PlaceResults;locale:string;query:string;nearText:string|null}){
 const en=locale==='en',t=(es:string,english:string)=>en?english:es;
 const {items,extras}=results;
 if(items.length===0)return <div data-place-empty className="px-1 py-5">
  <p className="text-[16px] font-extrabold text-[#162543]">{t('Sin resultados para: ','No results for: ')}{query}</p>
  {nearText&&<p className="mt-0.5 text-[14px] font-semibold text-[#6b7280]">{t('Cerca de: ','Near: ')}{nearText}</p>}
  <p className="mt-2 text-[14px] leading-snug text-[#475569]">{results.failed?t('La búsqueda no está disponible en este momento. Intente de nuevo en unos minutos.','Search is not available right now. Please try again in a few minutes.'):t('Pruebe con otras palabras o mueva el mapa y repita la búsqueda aquí.','Try other words or move the map and search here again.')}</p>
  <div className="mt-5 rounded-3xl border border-[#d7e1ea] bg-[#f4f7fa] p-5 text-center" data-missing-card>
   <p className="text-[17px] font-extrabold text-[#162543]">{t('¿Nota que falta algo?','Notice something missing?')}</p>
   <Link href="/registro/profesional" data-add-business className="mt-3 inline-flex h-11 items-center justify-center gap-2 rounded-full border-2 border-[#162543] bg-white px-6 text-[14px] font-extrabold text-[#162543] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#009FD9]"><Plus className="h-4 w-4" aria-hidden="true"/>{t('Agregar negocio','Add business')}</Link>
  </div>
 </div>;
 return <section data-place-results={results.section} aria-labelledby="place-results-title" className="pb-6">
  <h2 id="place-results-title" className="pt-4 text-[20px] font-extrabold text-[#162543]">{t('Mejores resultados','Top results')}</h2>
  <div>{items.map((item,i)=><PlaceResultRow key={item.key} item={item} extra={extras[item.slug]??null} rank={i+1} locale={locale}/>)}</div>
  {results.total>items.length&&<p className="pt-4 text-center"><Link href={results.sectionHref} className="text-[14px] font-extrabold text-[#007fae]">{t(`Ver los ${results.total.toLocaleString('es-CR')} resultados`,`See all ${results.total.toLocaleString('en-US')} results`)}</Link></p>}
  <div className="mt-5 rounded-3xl border border-[#d7e1ea] bg-[#f4f7fa] p-5 text-center" data-missing-card>
   <p className="text-[16px] font-extrabold text-[#162543]">{t('¿Nota que falta algo?','Notice something missing?')}</p>
   <Link href="/registro/profesional" data-add-business className="mt-3 inline-flex h-11 items-center justify-center gap-2 rounded-full border-2 border-[#162543] bg-white px-6 text-[14px] font-extrabold text-[#162543]"><Plus className="h-4 w-4" aria-hidden="true"/>{t('Agregar negocio','Add business')}</Link>
  </div>
 </section>;
}
