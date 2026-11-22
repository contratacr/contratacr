import 'server-only';
import {createAdminClient} from '@/lib/supabase/admin';
import {parseSearchParams,type DirectoryFacets,type DirectorySearchResult,type SearchParseError,type SearchVertical} from './search-schemas';
import {DIR_HEALTH_ENABLED,isHealthSearchVertical,withoutDisabledFacetValues,withoutDisabledVerticals} from './feature-flags';

// LOCAL PRO ONLY (multivertical F6): server-side search for the section pages (/restaurantes, /vehiculos, …).
// Same reader as /api/directorio/search (dir_search + dir_facets through the service role); the section is fixed by
// the page, never taken from the URL. Public data only; order never depends on payment (see /como-ordenamos).
export type SearchPageParams=Record<string,string|string[]|undefined>;
export type DirectorySearchPage=
 |{ok:true;values:Record<string,string|undefined>;result:DirectorySearchResult;facets:DirectoryFacets|null}
 |{ok:false;values:Record<string,string|undefined>;reason:SearchParseError['reason']|'unavailable'};

/** URL values the form and the «Ver más» link keep (single values only; `vertical`/`locale` are set by the page). */
export function searchValues(sp:SearchPageParams):Record<string,string|undefined>{
 return Object.fromEntries(Object.entries(sp).flatMap(([k,v])=>typeof v==='string'&&v!==''&&k!=='vertical'&&k!=='locale'?[[k,v]]:[]));
}

export async function loadDirectorySearch(vertical:SearchVertical,sp:SearchPageParams):Promise<DirectorySearchPage>{
 const values=searchValues(sp),params=new URLSearchParams(values as Record<string,string>);
 params.set('vertical',vertical);
 const parsed=parseSearchParams(params);
 if(!parsed.ok)return {ok:false,values,reason:parsed.reason};
 // Launch flag: the health section is off (feature-flags.ts) → the page itself answers 404; never query it here.
 if(!DIR_HEALTH_ENABLED&&isHealthSearchVertical(parsed.vertical))return {ok:false,values,reason:'invalid'};
 const db=createAdminClient();
 const [search,facets]=await Promise.all([
  db.rpc('dir_search',{p_vertical:parsed.vertical,p_q:parsed.q,p_filters:parsed.filters,p_lat:parsed.lat,p_lng:parsed.lng,
   p_radius_km:parsed.radiusKm,p_sort:parsed.sort,p_cursor:parsed.cursor,p_limit:parsed.limit}),
  db.rpc('dir_facets',{p_vertical:parsed.vertical,p_q:parsed.q,p_filters:parsed.filters,p_lat:parsed.lat,p_lng:parsed.lng,p_radius_km:parsed.radiusKm}),
 ]);
 if(search.error){
  if((search.error as {code?:string}).code==='22023')return {ok:false,values,reason:'invalid'};
  console.error('[directorio] search failed',(search.error as {code?:string}).code);
  return {ok:false,values,reason:'unavailable'};
 }
 const result=search.data as DirectorySearchResult,rawFacets=facets.error?null:facets.data as DirectoryFacets;
 return {ok:true,values,result:{...result,items:withoutDisabledVerticals(result.items)},facets:rawFacets?{...rawFacets,facets:{...rawFacets.facets,vertical:withoutDisabledFacetValues(rawFacets.facets?.vertical)}}:null};
}

/** ES/EN text for a search that could not run (bad filters, stale cursor, database down). */
export function searchProblemText(reason:Extract<DirectorySearchPage,{ok:false}>['reason'],en:boolean){
 const t=(es:string,english:string)=>en?english:es;
 switch(reason){
  case 'location':return t('Revise la ubicación o la distancia.','Please check the location or the distance.');
  case 'cursor':return t('La página solicitada ya no es válida. Vuelva a buscar.','That page is no longer valid. Please search again.');
  case 'sort':return t('Ese orden no está disponible en esta sección.','That order is not available in this section.');
  case 'product':return t('Escriba un producto para filtrar u ordenar por precio.','Please type a product to filter or sort by price.');
  case 'unavailable':return t('La búsqueda no está disponible en este momento. Intente de nuevo en unos minutos.','Search is not available right now. Please try again in a few minutes.');
  default:return t('Revise los filtros e intente de nuevo.','Please check the filters and try again.');
 }
}

/** Cheap total of places for a section with the same parameters the section page reads (dir_facets only, no list). null on any problem. */
export async function countDirectoryPlaces(vertical:SearchVertical,sp:SearchPageParams):Promise<number|null>{
 try{
  const params=new URLSearchParams(searchValues(sp) as Record<string,string>);params.set('vertical',vertical);
  const parsed=parseSearchParams(params,{facets:true});
  if(!parsed.ok)return null;
  if(!DIR_HEALTH_ENABLED&&isHealthSearchVertical(parsed.vertical))return null;
  const {data,error}=await createAdminClient().rpc('dir_facets',{p_vertical:parsed.vertical,p_q:parsed.q,p_filters:parsed.filters,p_lat:parsed.lat,p_lng:parsed.lng,p_radius_km:parsed.radiusKm});
  if(error)return null;
  const total=(data as DirectoryFacets|null)?.total;
  return typeof total==='number'?total:null;
 }catch{return null;}
}
