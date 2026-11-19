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

// LOCAL (launch round 2026-11-18): one uploaded place photo.
//  GET ?s=320|800|1600 → the stored variant from the private bucket, only while approved on a public place
//      (an administrator with MFA also sees pending/hidden ones for the queue preview, never cached).
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
 const path=(o.data as Record<string,string>)['path'+size]!;
 const file=await db.storage.from(PLACE_PHOTO_BUCKET).download(path);
 if(file.error||!file.data)return new Response(null,{status:404});
 return new Response(file.data,{headers:{'Content-Type':path.endsWith('.jpg')?'image/jpeg':'image/webp','X-Content-Type-Options':'nosniff',
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
