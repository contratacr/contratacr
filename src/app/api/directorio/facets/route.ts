import {createAdminClient} from '@/lib/supabase/admin';
import {DIRECTORY_LISTINGS_ENABLED,DIR_HEALTH_ENABLED,isHealthSearchVertical,isListingSearchVertical,withoutDisabledFacetValues,DIR_ENABLED} from '@/lib/directory/feature-flags';
import {enforceRateLimit,enforceRateLimitKey} from '@/lib/rate-limit';
import {parseSearchParams,type DirectoryFacets} from '@/lib/directory/search-schemas';

// Multivertical F6 (LOCAL development only): GET /api/directorio/facets → dir_facets (disjunctive counts).
// Same parameters as /api/directorio/search (sort/cursor/limit are ignored). Facets cost several scans, so the
// limit is tighter and the cache a little longer than search. In-memory limits are per instance (not valid on Workers).
export const dynamic='force-dynamic';
const base={'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
const fail=(status:number,reason:string,error:string)=>Response.json({error,reason},{status,headers:{...base,'Cache-Control':'no-store'}});

export async function GET(req:Request){
 if(!DIR_ENABLED)return new Response(null,{status:404,headers:base});
 const limited=await enforceRateLimit(req,'dir-facets',30,60_000);if(limited)return limited;
 const parsed=parseSearchParams(new URL(req.url).searchParams,{facets:true});
 if(!parsed.ok)return fail(400,parsed.reason,parsed.reason==='vertical'?'Elija una sección.':'Revise los filtros.');
 // Classified listings (vehiculos/inmuebles) are OFF by owner decision: the section does not exist publicly.
 if(!DIRECTORY_LISTINGS_ENABLED&&isListingSearchVertical(parsed.vertical))return fail(404,'vertical','Esta sección no está disponible.');
 if(!DIR_HEALTH_ENABLED&&isHealthSearchVertical(parsed.vertical))return fail(404,'vertical','Esta sección no está disponible.');
 const global=await enforceRateLimitKey('dir-facets:'+parsed.vertical,600,60_000);if(global)return global;
 const {data,error}=await createAdminClient().rpc('dir_facets',{p_vertical:parsed.vertical,p_q:parsed.q,p_filters:parsed.filters,p_lat:parsed.lat,p_lng:parsed.lng,p_radius_km:parsed.radiusKm});
 if(error){
  const code=(error as {code?:string}).code;
  if(code==='22023')return fail(400,'invalid','Revise los filtros.');
  console.error('[directorio/facets] failed',code);
  return fail(503,'unavailable','Los filtros no están disponibles en este momento.');
 }
 const raw=data as DirectoryFacets,facets={...raw,facets:{...raw.facets,vertical:withoutDisabledFacetValues(raw.facets?.vertical)}};
 return Response.json(facets,{headers:{...base,'Cache-Control':'public, max-age=60, s-maxage=120, stale-while-revalidate=120'}});
}
