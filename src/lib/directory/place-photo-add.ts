import 'server-only';
import {cookies} from 'next/headers';
import type {createAdminClient} from '@/lib/supabase/admin';
import {enforceRateLimitKey} from '@/lib/rate-limit';
import {PRO_WS_COOKIE} from '@/lib/pro/workspace-gate';
import {dirFail,dirOk} from '@/lib/directory/public-route';
import {photoDbError} from '@/lib/directory/place-photos-server';
import {PHOTO_VARIANTS,createClientVariantsCodec,derivedUuid,photoRejectText,processListingPhoto,sha256Hex,type PhotoVariant,type PhotoVariantSize} from '@/lib/directory/photo-pipeline';
import {NoServerCodecError,pickPhotoCodec} from '@/lib/directory/photo-codec-cf-images';
import {uploadPlacePhotoStore} from '@/lib/directory/place-photo-store';
import {PLACE_PHOTO_BUCKET,PLACE_PHOTO_DAILY_LIMIT,PLACE_PHOTO_PREFIX,cleanCaption,placePhotoUrl,type PhotoCategory} from '@/lib/directory/place-photos';

/**
 * The server half of a place photo upload, shared by /api/lugar/[slug]/fotos (the «Agregar fotos» panel) and the Instagram
 * import (/api/integrations/instagram/import), so both run exactly the same pipeline: idempotent ids derived from
 * (account, place, uploadId) → daily cap → photo-pipeline (magic bytes, 20 MiB, 24 MP, variants validated or made by the
 * server codec, metadata scan, sha256) → same-place sha256 dedupe → photo store → dir_place_photo_add.
 */
type Db=ReturnType<typeof createAdminClient>;

/** p_actor/p_member: the person, or (owner, member) when a Pro team member with listing.publish works in the owner's company. */
export async function placePhotoActor(db:Db,userId:string,placeId:string){
 const own=await db.from('dir_place_managers').select('place_id').eq('place_id',placeId).eq('user_id',userId).eq('status','active').maybeSingle();
 if(own.data)return{actor:userId,member:null as string|null,manager:true};
 const owner=(await cookies()).get(PRO_WS_COOKIE)?.value;
 if(!owner||!/^[0-9a-f-]{36}$/i.test(owner)||owner===userId)return{actor:userId,member:null,manager:false};
 const managed=await db.from('dir_place_managers').select('place_id').eq('place_id',placeId).eq('user_id',owner).eq('status','active').maybeSingle();
 if(!managed.data)return{actor:userId,member:null,manager:false};
 const role=await db.rpc('pro_role_of',{p_actor:userId,p_owner:owner});if(role.error||!role.data)return{actor:userId,member:null,manager:false};
 const allowed=await db.rpc('pro_role_allows',{p_role:role.data,p_capability:'listing.publish'});
 return allowed.data===true?{actor:owner,member:userId,manager:true}:{actor:userId,member:null,manager:false};
}

export type PlacePhotoAddInput={
 db:Db;userId:string;actor:string;member:string|null;place:{id:string;slug:string};uploadId:string;
 /** The uploaded file (the 1600 variant when `clientVariants` is set). */
 upload:Uint8Array;clientVariants:Record<PhotoVariantSize,Uint8Array>|null;
 caption?:string;review:boolean;locale:'es'|'en';
 /** 547: what the photo shows (optional: review photos and the Instagram import may carry none). */
 category?:PhotoCategory;
};
/** Returns the route Response (same bodies and statuses as before the extraction) plus the photo id it worked on. */
export async function addPlacePhoto(i:PlacePhotoAddInput):Promise<{response:Response;mediaId:string;created:boolean}>{
 const {db,place,locale}=i;
 const mediaId=await derivedUuid('dir-place-photo',i.userId,place.id,i.uploadId);
 const actionId=await derivedUuid('dir-place-photo-add',i.userId,place.id,i.uploadId);
 const out=(response:Response,created=false)=>({response,mediaId,created});
 // Retry of a finished upload: answer from the row without re-encoding.
 const done=await db.from('dir_place_media').select('id,place_id,status').eq('id',mediaId).maybeSingle();
 if(done.error)return out(dirFail(503,'unavailable'));
 if(done.data)return out(done.data.place_id===place.id?dirOk({ok:true,replayed:true,photo:{id:mediaId,status:done.data.status==='active'?'approved':done.data.status}}):dirFail(409,'duplicate'));
 // Per person and day (Postgres-backed buckets of src/lib/rate-limit.ts); the SQL enforces the same cap under its lock.
 const limited=await enforceRateLimitKey(`dir-place-photo:${i.userId}`,PLACE_PHOTO_DAILY_LIMIT,86_400_000);if(limited)return out(limited);

 // Client variants → validated as-is (no server transformation); otherwise a server codec (sharp locally; in the
 // Worker none is bound since 2026-11-26 → clear 'browser_prep' refusal).
 let codec;
 if(i.clientVariants)codec=createClientVariantsCodec(i.clientVariants);
 else{try{codec=await pickPhotoCodec();}catch(e){return out(e instanceof NoServerCodecError?dirFail(422,'photo_browser_prep',photoRejectText('browser_prep',locale)):dirFail(503,'unavailable','El procesamiento de fotos no está disponible.'));}}
 const processed=await processListingPhoto(i.clientVariants?.[1600]??i.upload,{photoId:mediaId,codec});
 if(!processed.ok)return out(dirFail(processed.reason==='too_large'?413:processed.reason==='codec'||processed.reason==='metadata'?422:400,'photo_'+processed.reason,photoRejectText(processed.reason,locale)));
 const photo=processed.photo;
 // Dedupe before storing anything (the SQL unique index is the real guard).
 const same=await db.from('dir_place_media').select('id').eq('place_id',place.id).eq('sha256',photo.sha256).in('status',['pending','active']).limit(1);
 if(same.error)return out(dirFail(503,'unavailable'));if(same.data?.length)return out(dirFail(409,'duplicate'));

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
  if(put==='failed'){await cleanup();return out(dirFail(503,'unavailable','No se pudo guardar la foto. Reintente.'));}
 }
 const caption=cleanCaption(i.caption);
 const input={actionId,mediaId,slug:place.slug,review:i.review,...(caption?{caption}:{}),sha256:photo.sha256,width:photo.width,height:photo.height,
  path1600:path(photo.variants[1600]),path800:path(photo.variants[800]),path320:path(photo.variants[320]),url:placePhotoUrl(mediaId),
  ...(store.name==='r2'?{store:'r2'}:{}),...(i.category?{category:i.category}:{})};
 const r=await db.rpc('dir_place_photo_add',{p_actor:i.actor,p_member:i.member,p_input:input});
 if(r.error){
  const row=await db.from('dir_place_media').select('id').eq('id',mediaId).maybeSingle();
  if(!row.error&&!row.data)await cleanup();
  return out(photoDbError(r.error));
 }
 return out(dirOk(r.data),true);
}
