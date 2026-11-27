import {z} from 'zod';
import {getApiAdmin} from '@/lib/auth/admin';
import {createAdminClient} from '@/lib/supabase/admin';
import {createClient} from '@/lib/supabase/server';
import {safeGetUser} from '@/lib/supabase/get-user';
import {enforceRateLimit} from '@/lib/rate-limit';
import {proBoundedJson,proSameOrigin} from '@/lib/pro/route-common';
import {dirDeviceId,dirEnabledOnly,dirFail,dirOk,dirPepper,hmacHex} from '@/lib/directory/public-route';
import {PLACE_PHOTO_BUCKET,placePhotoFlagSchema} from '@/lib/directory/place-photos';
import {photoDbError} from '@/lib/directory/place-photos-server';
import {placePhotoStoreOf} from '@/lib/directory/place-photo-store';

// LOCAL (launch round 2026-11-18): one uploaded place photo.
//  GET ?s=320|800|1600 → the stored variant from its store (R2 or the private Supabase bucket, place-photo-store.ts),
//      only while approved on a public place (an administrator with MFA also sees pending/hidden ones for the queue
//      preview, never cached). Short public cache on purpose: a photo hidden by moderation or removed must stop being
//      served soon, so the URL is never «immutable».
//  GET ?meta=1 → {attribution} (author, licence, licence URL, source page) of a Commons photo, else null.
//  POST {flagId, reason, message?} → «Reportar foto» (dir_place_photo_flag_create; device HMAC without an account).
const idSchema=z.string().uuid();
export async function GET(req:Request,{params}:{params:Promise<{id:string}>}){
 const off=dirEnabledOnly();if(off)return off;
 const {id}=await params;if(!idSchema.safeParse(id).success)return new Response(null,{status:404});
 const s=new URL(req.url).searchParams.get('s'),size=s==='320'||s==='1600'?s:'800';
 const db=createAdminClient();
 let staff=false,o=await db.rpc('dir_place_photo_object',{p_id:id,p_staff:false});
 if(!o.error&&!o.data&&await getApiAdmin()){staff=true;o=await db.rpc('dir_place_photo_object',{p_id:id,p_staff:true});}
 if(o.error)return new Response(null,{status:503});if(!o.data)return new Response(null,{status:404});
 const row=o.data as Record<string,string>,path=row['path'+size]!;
 // ?meta=1 → credit of a freely licensed photo (Wikimedia Commons): {attribution} or {attribution:null}; the gallery shows it under the full-size photo.
 if(new URL(req.url).searchParams.get('meta')==='1'){
  const a=(o.data as {attribution?:Record<string,unknown>|null}).attribution,ok=!!a&&typeof a==='object';
  return Response.json({attribution:ok?{author:a.author??null,license:a.license??null,licenseUrl:a.licenseUrl??null,sourceUrl:a.sourceUrl??null,provider:a.provider??null}:null},{headers:{'Cache-Control':'public, max-age=300, stale-while-revalidate=86400'}});
 }
 const store=await placePhotoStoreOf(db.storage.from(PLACE_PHOTO_BUCKET),row.store);if(!store)return new Response(null,{status:503});
 let file;try{file=await store.get(path);}catch{return new Response(null,{status:503});}
 if(!file)return new Response(null,{status:404});
 return new Response(file.bytes as Uint8Array<ArrayBuffer>,{headers:{'Content-Type':path.endsWith('.jpg')?'image/jpeg':'image/webp','X-Content-Type-Options':'nosniff',
  'Cache-Control':staff?'no-store, private':'public, max-age=300, stale-while-revalidate=86400','Content-Security-Policy':"default-src 'none'"}});
}
export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){
 const off=dirEnabledOnly();if(off)return off;
 if(!proSameOrigin(req))return dirFail(403,'origin','Origen no autorizado.');
 const limited=await enforceRateLimit(req,'dir-photo-flag',10,60_000);if(limited)return limited;
 const {id}=await params;if(!idSchema.safeParse(id).success)return dirFail(404,'not_found');
 let raw:unknown;try{raw=await proBoundedJson(req,2048);}catch{return dirFail(400,'invalid');}
 const body=placePhotoFlagSchema.safeParse(raw);if(!body.success)return dirFail(400,body.error.issues[0]?.path[0]==='message'?'message_required':'invalid');
 const user=await safeGetUser(await createClient());
 let visitorHash:string|undefined;
 if(!user){const pepper=dirPepper('DIR_VISITOR_PEPPER');if(!pepper)return dirFail(503,'unavailable');visitorHash=await hmacHex(pepper,'device:'+await dirDeviceId(true));}
 const input={flagId:body.data.flagId,mediaId:id,reason:body.data.reason,...(body.data.message?{message:body.data.message}:{}),...(visitorHash?{visitorHash}:{})};
 const r=await createAdminClient().rpc('dir_place_photo_flag_create',{p_actor:user?.id??null,p_input:input});
 return r.error?photoDbError(r.error):dirOk({ok:true});
}
