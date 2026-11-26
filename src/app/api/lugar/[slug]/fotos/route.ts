import {cookies} from 'next/headers';
import {createAdminClient} from '@/lib/supabase/admin';
import {createClient} from '@/lib/supabase/server';
import {safeGetUser} from '@/lib/supabase/get-user';
import {enforceRateLimitKey} from '@/lib/rate-limit';
import {ProBodyError,proBoundedForm,proBoundedJson,proSameOrigin} from '@/lib/pro/route-common';
import {PRO_WS_COOKIE} from '@/lib/pro/workspace-gate';
import {placeSlugSchema} from '@/lib/directory/schemas';
import {dirEnabledOnly,dirFail,dirOk} from '@/lib/directory/public-route';
import {photoDbError} from '@/lib/directory/place-photos-server';
import {PHOTO_MAX_BYTES,PHOTO_VARIANTS,createClientVariantsCodec,derivedUuid,photoRejectText,processListingPhoto,sha256Hex,type PhotoVariant} from '@/lib/directory/photo-pipeline';
import {NoServerCodecError,pickPhotoCodec} from '@/lib/directory/photo-codec-cf-images';
import {clientVariantsOf} from '@/lib/directory/client-variants';
import {placePhotoStoreOf,uploadPlacePhotoStore} from '@/lib/directory/place-photo-store';
import {PLACE_PHOTO_BUCKET,PLACE_PHOTO_DAILY_LIMIT,PLACE_PHOTO_PREFIX,cleanCaption,placePhotoFieldsSchema,placePhotoRemoveSchema,placePhotoUrl} from '@/lib/directory/place-photos';

// LOCAL (launch round 2026-11-18): photos of a directory place.
//  POST multipart {file, uploadId, caption?, review?=1} → photo-pipeline (magic bytes JPEG/PNG/WebP — HEIC arrives as JPEG
//       from the browser —, 20 MiB, 24 MP, re-encode 1600/800/320 WebP without EXIF/GPS, sha256) → photo store (Worker:
//       R2 binding PLACE_PHOTOS; elsewhere the private bucket dir-place-photos — place-photo-store.ts) at
//       dir-places/<photo id>/<size>.webp → dir_place_photo_add (records the store). Manager of the claimed place (or a
//       Pro team member whose role allows listing.publish): published at once; anyone else signed in: pending moderation.
//       Idempotent by uploadId (photo id and actionId derived from account + place + uploadId). 20 photos per person a day.
//  POST JSON {action:'remove', actionId, mediaId} → dir_place_photo_remove (uploader, or manager for owner photos), then the
//       three objects are deleted from the store the photo lives in (removal is final; a staff «hide» keeps them).
// Local runs use the loopback Supabase Storage only (sandbox); nothing is sent to production.
// v800/v320: the browser-made smaller variants (storage plan 2026-11-26); `file` is then the 1600 variant.
const FIELDS=['file','v800','v320','uploadId','caption','review'] as const;
type Db=ReturnType<typeof createAdminClient>;
/** p_actor/p_member: the person, or (owner, member) when a Pro team member with listing.publish works in the owner's company. */
async function effectiveActor(db:Db,userId:string,placeId:string){
 const own=await db.from('dir_place_managers').select('place_id').eq('place_id',placeId).eq('user_id',userId).eq('status','active').maybeSingle();
 if(own.data)return{actor:userId,member:null as string|null};
 const owner=(await cookies()).get(PRO_WS_COOKIE)?.value;
 if(!owner||!/^[0-9a-f-]{36}$/i.test(owner)||owner===userId)return{actor:userId,member:null};
 const managed=await db.from('dir_place_managers').select('place_id').eq('place_id',placeId).eq('user_id',owner).eq('status','active').maybeSingle();
 if(!managed.data)return{actor:userId,member:null};
 const role=await db.rpc('pro_role_of',{p_actor:userId,p_owner:owner});if(role.error||!role.data)return{actor:userId,member:null};
 const allowed=await db.rpc('pro_role_allows',{p_role:role.data,p_capability:'listing.publish'});
 return allowed.data===true?{actor:owner,member:userId}:{actor:userId,member:null};
}

export async function POST(req:Request,{params}:{params:Promise<{slug:string}>}){
 const off=dirEnabledOnly();if(off)return off;
 if(!proSameOrigin(req))return dirFail(403,'origin','Origen no autorizado.');
 const {slug}=await params;if(!placeSlugSchema.safeParse(slug).success)return dirFail(404,'not_found');
 const locale=req.headers.get('accept-language')?.toLowerCase().startsWith('en')?'en':'es';
 const user=await safeGetUser(await createClient());if(!user)return dirFail(401,'login');
 const db=createAdminClient();
 const place=await db.from('dir_places').select('id').eq('slug',slug).maybeSingle();
 if(place.error)return dirFail(503,'unavailable');if(!place.data)return dirFail(404,'not_found');
 const {actor,member}=await effectiveActor(db,user.id,place.data.id as string);

 if(req.headers.get('content-type')?.toLowerCase().startsWith('application/json')){
  let raw:unknown;try{raw=await proBoundedJson(req,1024);}catch{return dirFail(400,'invalid');}
  const body=placePhotoRemoveSchema.safeParse(raw);if(!body.success)return dirFail(400,'invalid');
  const r=await db.rpc('dir_place_photo_remove',{p_actor:actor,p_member:member,p_input:{actionId:body.data.actionId,mediaId:body.data.mediaId}});
  if(r.error)return photoDbError(r.error);
  // Best effort: the row is already final (removed, never served again); a failed delete only leaves an orphan.
  const gone=await db.from('dir_place_media').select('status,photo_store,path_1600,path_800,path_320').eq('id',body.data.mediaId).maybeSingle();
  if(!gone.error&&gone.data?.status==='removed'){
   const paths=[gone.data.path_1600,gone.data.path_800,gone.data.path_320].filter((p):p is string=>typeof p==='string');
   try{const store=await placePhotoStoreOf(db.storage.from(PLACE_PHOTO_BUCKET),gone.data.photo_store);if(!store)throw Error('no R2 binding');await store.remove(paths);}
   catch{console.error('[place-photos] objects left after removal',body.data.mediaId);}
  }
  return dirOk(r.data);
 }

 let form:FormData;
 try{form=await proBoundedForm(req,{maxBytes:PHOTO_MAX_BYTES+4*1024*1024+65_536,maxFiles:3,fields:FIELDS,maxFileBytes:PHOTO_MAX_BYTES});}
 catch(e){const status=e instanceof ProBodyError?e.status:400;return dirFail(status,status===413?'too_large':'invalid',status===413?photoRejectText('too_large',locale):'Revise la foto.');}
 const file=form.get('file'),fields=placePhotoFieldsSchema.safeParse(Object.fromEntries([...form.entries()].filter(([k])=>k!=='file'&&k!=='v800'&&k!=='v320')));
 if(!(file instanceof Blob)||!fields.success)return dirFail(400,'invalid','Revise la foto.');
 const mediaId=await derivedUuid('dir-place-photo',user.id,place.data.id as string,fields.data.uploadId);
 const actionId=await derivedUuid('dir-place-photo-add',user.id,place.data.id as string,fields.data.uploadId);
 // Retry of a finished upload: answer from the row without re-encoding.
 const done=await db.from('dir_place_media').select('id,place_id,status').eq('id',mediaId).maybeSingle();
 if(done.error)return dirFail(503,'unavailable');
 if(done.data)return done.data.place_id===place.data.id?dirOk({ok:true,replayed:true,photo:{id:mediaId,status:done.data.status==='active'?'approved':done.data.status}}):dirFail(409,'duplicate');
 // Per person and day (Postgres-backed buckets of src/lib/rate-limit.ts); the SQL enforces the same cap under its lock.
 const limited=await enforceRateLimitKey(`dir-place-photo:${user.id}`,PLACE_PHOTO_DAILY_LIMIT,86_400_000);if(limited)return limited;

 // Client variants → validated as-is (no server transformation); otherwise a server codec (sharp locally; in the
 // Worker none is bound since 2026-11-26 → clear 'browser_prep' refusal).
 const upload=new Uint8Array(await file.arrayBuffer()),clientVariants=await clientVariantsOf(form,upload);
 let codec;
 if(clientVariants)codec=createClientVariantsCodec(clientVariants);
 else{try{codec=await pickPhotoCodec();}catch(e){return e instanceof NoServerCodecError?dirFail(422,'photo_browser_prep',photoRejectText('browser_prep',locale)):dirFail(503,'unavailable','El procesamiento de fotos no está disponible.');}}
 const processed=await processListingPhoto(clientVariants?.[1600]??upload,{photoId:mediaId,codec});
 if(!processed.ok)return dirFail(processed.reason==='too_large'?413:processed.reason==='codec'||processed.reason==='metadata'?422:400,'photo_'+processed.reason,photoRejectText(processed.reason,locale));
 const photo=processed.photo;
 // Dedupe before storing anything (the SQL unique index is the real guard).
 const same=await db.from('dir_place_media').select('id').eq('place_id',place.data.id).eq('sha256',photo.sha256).in('status',['pending','active']).limit(1);
 if(same.error)return dirFail(503,'unavailable');if(same.data?.length)return dirFail(409,'duplicate');

 const path=(v:PhotoVariant)=>v.path.replace(/^dir-listings\//,PLACE_PHOTO_PREFIX+'/');
 const store=await uploadPlacePhotoStore(db.storage.from(PLACE_PHOTO_BUCKET)),created:string[]=[];
 const cleanup=async()=>{if(created.length){try{await store.remove(created);}catch{console.error('[place-photos] orphan objects',store.name,created);}}};
 for(const size of PHOTO_VARIANTS){
  const v=photo.variants[size],key=path(v);
  let put:'created'|'exists'|'failed';try{put=await store.put(key,v.bytes,v.contentType);}catch{put='failed';}
  if(put==='exists'){
   // A retry after a crash between storing and recording: keep the object only if it is the same image.
   let stored=null;try{stored=await store.get(key);}catch{}
   if(!stored||await sha256Hex(stored.bytes)!==await sha256Hex(v.bytes))put='failed';
  }else if(put==='created')created.push(key);
  if(put==='failed'){await cleanup();return dirFail(503,'unavailable','No se pudo guardar la foto. Reintente.');}
 }
 const caption=cleanCaption(fields.data.caption);
 const input={actionId,mediaId,slug,review:fields.data.review==='1',...(caption?{caption}:{}),sha256:photo.sha256,width:photo.width,height:photo.height,
  path1600:path(photo.variants[1600]),path800:path(photo.variants[800]),path320:path(photo.variants[320]),url:placePhotoUrl(mediaId),
  ...(store.name==='r2'?{store:'r2'}:{})};
 const r=await db.rpc('dir_place_photo_add',{p_actor:actor,p_member:member,p_input:input});
 if(r.error){
  const row=await db.from('dir_place_media').select('id').eq('id',mediaId).maybeSingle();
  if(!row.error&&!row.data)await cleanup();
  return photoDbError(r.error);
 }
 return dirOk(r.data);
}
