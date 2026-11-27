import {createAdminClient} from '@/lib/supabase/admin';
import {createClient} from '@/lib/supabase/server';
import {safeGetUser} from '@/lib/supabase/get-user';
import {ProBodyError,proBoundedForm,proBoundedJson,proSameOrigin} from '@/lib/pro/route-common';
import {placeSlugSchema} from '@/lib/directory/schemas';
import {dirEnabledOnly,dirFail,dirOk} from '@/lib/directory/public-route';
import {photoDbError} from '@/lib/directory/place-photos-server';
import {PHOTO_MAX_BYTES,photoRejectText} from '@/lib/directory/photo-pipeline';
import {clientVariantsOf} from '@/lib/directory/client-variants';
import {placePhotoStoreOf} from '@/lib/directory/place-photo-store';
import {PLACE_PHOTO_BUCKET,placePhotoFieldsSchema,placePhotoRemoveSchema} from '@/lib/directory/place-photos';
import {addPlacePhoto,placePhotoActor} from '@/lib/directory/place-photo-add';

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
// The pipeline itself (2026-11-27) lives in src/lib/directory/place-photo-add.ts, shared with the Instagram import.
const FIELDS=['file','v800','v320','uploadId','caption','review'] as const;
export async function POST(req:Request,{params}:{params:Promise<{slug:string}>}){
 const off=dirEnabledOnly();if(off)return off;
 if(!proSameOrigin(req))return dirFail(403,'origin','Origen no autorizado.');
 const {slug}=await params;if(!placeSlugSchema.safeParse(slug).success)return dirFail(404,'not_found');
 const locale=req.headers.get('accept-language')?.toLowerCase().startsWith('en')?'en':'es';
 const user=await safeGetUser(await createClient());if(!user)return dirFail(401,'login');
 const db=createAdminClient();
 const place=await db.from('dir_places').select('id').eq('slug',slug).maybeSingle();
 if(place.error)return dirFail(503,'unavailable');if(!place.data)return dirFail(404,'not_found');
 const {actor,member}=await placePhotoActor(db,user.id,place.data.id as string);

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
 const upload=new Uint8Array(await file.arrayBuffer()),clientVariants=await clientVariantsOf(form,upload);
 const added=await addPlacePhoto({db,userId:user.id,actor,member,place:{id:place.data.id as string,slug},uploadId:fields.data.uploadId,upload,clientVariants,
  caption:fields.data.caption,review:fields.data.review==='1',locale});
 return added.response;
}
