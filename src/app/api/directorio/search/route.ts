import {createAdminClient} from '@/lib/supabase/admin';
import {DIRECTORY_LISTINGS_ENABLED,DIR_HEALTH_ENABLED,isHealthSearchVertical,isListingSearchVertical,withoutDisabledVerticals,DIR_ENABLED} from '@/lib/directory/feature-flags';
import {enforceRateLimit,enforceRateLimitKey} from '@/lib/rate-limit';
import {encodeCursor,parseSearchParams,type DirectorySearchResult} from '@/lib/directory/search-schemas';

// Multivertical F6 (LOCAL development only): GET /api/directorio/search → dir_search (service role, server side).
// Query: vertical, q, lat, lng, radiusKm, sort, cursor, limit + vertical filters (see parseSearchParams).
// Public data only; anonymous and identical for every viewer, so a short shared cache is safe. "Open now" changes
// with the clock, hence 60 s. The in-memory limits are per instance (not valid on Workers): replace with a shared
// store before opening to the public (plan risk list).
export const dynamic='force-dynamic';
const base={'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
const fail=(status:number,reason:string,error:string)=>Response.json({error,reason},{status,headers:{...base,'Cache-Control':'no-store'}});

export async function GET(req:Request){
 if(!DIR_ENABLED)return new Response(null,{status:404,headers:base});
 const limited=await enforceRateLimit(req,'dir-search',60,60_000);if(limited)return limited;
 const parsed=parseSearchParams(new URL(req.url).searchParams);
 if(!parsed.ok){
  const msg={vertical:'Elija una sección.',location:'Revise la ubicación o la distancia.',cursor:'La página solicitada ya no es válida. Vuelva a buscar.',sort:'Ese orden no está disponible aquí.',product:'Escriba un producto para filtrar u ordenar por precio.',invalid:'Revise los filtros.'}[parsed.reason];
  return fail(400,parsed.reason,msg);
 }
 // Second key: the whole service per vertical, so a burst spread over many addresses still has a ceiling.
 // Classified listings (vehiculos/inmuebles) are OFF by owner decision: the section does not exist publicly.
 if(!DIRECTORY_LISTINGS_ENABLED&&isListingSearchVertical(parsed.vertical))return fail(404,'vertical','Esta sección no está disponible.');
 if(!DIR_HEALTH_ENABLED&&isHealthSearchVertical(parsed.vertical))return fail(404,'vertical','Esta sección no está disponible.');
 const global=await enforceRateLimitKey('dir-search:'+parsed.vertical,1200,60_000);if(global)return global;
 const {data,error}=await createAdminClient().rpc('dir_search',{p_vertical:parsed.vertical,p_q:parsed.q,p_filters:parsed.filters,p_lat:parsed.lat,p_lng:parsed.lng,
  p_radius_km:parsed.radiusKm,p_sort:parsed.sort,p_cursor:parsed.cursor,p_limit:parsed.limit});
 if(error){
  const code=(error as {code?:string}).code;
  if(code==='22023')return fail(400,'invalid','Revise los filtros.');
  console.error('[directorio/search] failed',code);
  return fail(503,'unavailable','La búsqueda no está disponible en este momento.');
 }
 const raw=data as DirectorySearchResult,result={...raw,items:withoutDisabledVerticals(raw.items)};
 return Response.json({...result,q:parsed.q,nextCursor:result.nextCursor?encodeCursor(result.nextCursor):null},
  {headers:{...base,'Cache-Control':'public, max-age=30, s-maxage=60, stale-while-revalidate=60'}});
}
