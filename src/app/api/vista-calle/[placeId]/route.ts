import {z} from 'zod';
import {createAdminClient} from '@/lib/supabase/admin';
import {dirEnabledOnly} from '@/lib/directory/public-route';
import {isMapillaryThumbUrl,THUMB_TTL_MS} from '@/lib/directory/street-view';

// «Vista de la calle» (2026-11-27): the Mapillary image chosen for a place without photos (dir_place_street_view, 543).
// GET [?s=2048] → 302 to a fresh Mapillary CDN thumb. Image files are never copied into our storage; Mapillary thumb URLs
// expire, so the cached URL is re-fetched by image id once it is older than THUMB_TTL_MS (1 h). This route never searches
// for images (only the backfill script does), so visitors cannot spend the API quota. The token
// (MAPILLARY_CLIENT_TOKEN, a Cloudflare secret) stays on the server and goes in the Authorization header, never in a URL
// we log or answer. Short cache on purpose: the redirect target changes and an image removed upstream must stop showing.
const idSchema=z.string().uuid();
const headers=(maxAge:number)=>({'Cache-Control':`public, max-age=${maxAge}`,'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});
const notFound=()=>new Response(null,{status:404,headers:headers(300)});

export async function GET(req:Request,{params}:{params:Promise<{placeId:string}>}){
 const off=dirEnabledOnly();if(off)return off;
 const {placeId}=await params;if(!idSchema.safeParse(placeId).success)return notFound();
 const big=new URL(req.url).searchParams.get('s')==='2048';
 const db=createAdminClient();
 const r=await db.from('dir_place_street_view').select('image_id,thumb_1024_url,thumb_2048_url,thumb_fetched_at,place:dir_places!inner(status)')
  .eq('place_id',placeId).eq('status','found').maybeSingle();
 if(r.error)return new Response(null,{status:503,headers:headers(0)});
 const row=r.data as {image_id:string;thumb_1024_url:string|null;thumb_2048_url:string|null;thumb_fetched_at:string|null;place:{status:string}|{status:string}[]}|null;
 const place=Array.isArray(row?.place)?row.place[0]:row?.place;
 if(!row||!place||!['published','closed_permanently'].includes(place.status))return notFound();
 let url=big?row.thumb_2048_url??row.thumb_1024_url:row.thumb_1024_url??row.thumb_2048_url;
 const age=row.thumb_fetched_at?Date.now()-new Date(row.thumb_fetched_at).getTime():Infinity;
 const token=process.env.MAPILLARY_CLIENT_TOKEN;
 if((!url||age>THUMB_TTL_MS)&&token){
  try{
   const res=await fetch(`https://graph.mapillary.com/${encodeURIComponent(row.image_id)}?fields=thumb_1024_url,thumb_2048_url`,
    {headers:{Authorization:`OAuth ${token}`},signal:AbortSignal.timeout(8000),cache:'no-store'});
   // Only «does not exist» marks it gone (404, or 400 with Graph error 100); token/permission errors keep the cached URL.
   const gone=res.status===404||(res.status===400&&await res.clone().json().then((j:{error?:{code?:number;message?:string}})=>j?.error?.code===100||/does not exist/i.test(j?.error?.message??'')).catch(()=>false));
   if(gone){
    // Removed upstream: stop showing it (the script looks the place up again later).
    await db.from('dir_place_street_view').update({status:'none',image_id:null,creator:null,thumb_1024_url:null,thumb_2048_url:null,thumb_fetched_at:null}).eq('place_id',placeId);
    return notFound();
   }
   if(res.ok){
    const j=await res.json() as {thumb_1024_url?:unknown;thumb_2048_url?:unknown};
    const t1=isMapillaryThumbUrl(j.thumb_1024_url)?j.thumb_1024_url:null,t2=isMapillaryThumbUrl(j.thumb_2048_url)?j.thumb_2048_url:null;
    if(t1||t2){
     await db.from('dir_place_street_view').update({thumb_1024_url:t1,thumb_2048_url:t2,thumb_fetched_at:new Date().toISOString()}).eq('place_id',placeId);
     url=big?t2??t1:t1??t2;
    }
   }
  }catch{/* keep the cached URL */}
 }
 if(!isMapillaryThumbUrl(url))return notFound();
 return new Response(null,{status:302,headers:{...headers(300),Location:url}});
}
