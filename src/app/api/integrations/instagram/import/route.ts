import {createClient} from '@/lib/supabase/server';
import {safeGetUser} from '@/lib/supabase/get-user';
import {createAdminClient} from '@/lib/supabase/admin';
import {enforceRateLimitKey} from '@/lib/rate-limit';
import {ProBodyError,proBoundedForm,proSameOrigin} from '@/lib/pro/route-common';
import {PHOTO_MAX_BYTES} from '@/lib/directory/photo-pipeline';
import {clientVariantsOf} from '@/lib/directory/client-variants';
import {addPlacePhoto} from '@/lib/directory/place-photo-add';
import {getConnection,igFail,igHeaders,instagramAdapterOrNull,liveImportedMediaIds,recordImport} from '@/lib/integrations/instagram/server';
import {resolveImportTarget} from '@/lib/integrations/instagram/target';
import {storeImportedCasePhoto} from '@/lib/integrations/instagram/case-photo-store';
import {instagramErrorCode,planImport} from '@/lib/integrations/instagram/types';

// POST multipart {target:'place'|'portfolio', slug? (place), mediaId, rights:'1', file?/v800?/v320?} → imports ONE photo of
// the connected Instagram account (the client sends at most 10, one request each, so every photo reports its own result).
//  - The media id is looked up again in the account's own list (server side); a media id already imported to the same target
//    whose photo still exists answers {status:'skipped'} without storing anything.
//  - place (manager only, published at once like owner photos): the same pipeline as «Agregar fotos» (place-photo-add.ts). The
//    browser sends the 1600/800/320 variants it made from /media/<id> (storage plan: no server transformation in the Worker);
//    without them the server fetches the photo and uses its own codec (sharp in `next dev`).
//  - portfolio: the server fetches the photo and stores it with the gates of /api/upload/photo (case-photo-store.ts); the
//    answer carries the URL, which the success-case form adds to the case being edited.
// Provenance {source instagram, permalink, media id} → instagram_media_imports.
const FIELDS=['target','slug','mediaId','rights','file','v800','v320'] as const;
export async function POST(req:Request){
 const adapter=instagramAdapterOrNull();if(!adapter)return new Response(null,{status:404,headers:igHeaders});
 if(!proSameOrigin(req))return igFail(403,'origin','Origen no autorizado.');
 const locale=req.headers.get('accept-language')?.toLowerCase().startsWith('en')?'en':'es';
 const user=await safeGetUser(await createClient());if(!user)return igFail(401,'login');
 const limited=await enforceRateLimitKey(`ig-import:${user.id}`,40,600_000);if(limited)return limited;
 let form:FormData;
 try{form=await proBoundedForm(req,{maxBytes:PHOTO_MAX_BYTES+4*1024*1024+65_536,maxFiles:3,fields:FIELDS,maxFileBytes:PHOTO_MAX_BYTES});}
 catch(e){return igFail(e instanceof ProBodyError?e.status:400,'invalid');}
 const mediaId=String(form.get('mediaId')??'');
 if(form.get('rights')!=='1')return igFail(400,'rights','Confirme que las fotos son suyas o que tiene permiso para publicarlas.');
 const db=createAdminClient();
 try{
  const resolved=await resolveImportTarget(db,user.id,form.get('target'),form.get('slug'));
  if('error' in resolved)return igFail(resolved.error,resolved.reason);
  const c=await getConnection(db,user.id,adapter);if(!c)return igFail(409,'not_connected','Conecte su cuenta de Instagram.');
  const [list,done]=await Promise.all([adapter.listMedia(c.accessToken),liveImportedMediaIds(db,user.id,resolved.target)]);
  const plan=planImport([mediaId],list,done,1);
  if(plan.skipped.length)return Response.json({status:'skipped',mediaId},{headers:igHeaders});
  const media=plan.toImport[0];if(!media)return igFail(404,'not_found','Esa foto ya no está en su cuenta de Instagram.');

  if(resolved.kind==='place'){
   const file=form.get('file');
   let upload:Uint8Array,clientVariants=null;
   if(file instanceof Blob){upload=new Uint8Array(await file.arrayBuffer());clientVariants=await clientVariantsOf(form,upload);}
   else upload=(await adapter.fetchMedia(c.accessToken,media)).bytes;
   const added=await addPlacePhoto({db,userId:user.id,actor:resolved.actor,member:resolved.member,place:{id:resolved.target.placeId,slug:resolved.slug},
    uploadId:crypto.randomUUID(),upload,clientVariants,review:false,locale});
   if(added.response.status===409){const j=await added.response.clone().json().catch(()=>({})) as {reason?:string};if(j.reason==='duplicate')return Response.json({status:'skipped',mediaId,reason:'same_photo'},{headers:igHeaders});}
   if(!added.response.ok)return added.response;
   await recordImport(db,user.id,resolved.target,{mediaId,permalink:media.permalink,resultRef:added.mediaId});
   return Response.json({status:'imported',mediaId,photoId:added.mediaId},{headers:igHeaders});
  }
  const f=await adapter.fetchMedia(c.accessToken,media);
  const stored=await storeImportedCasePhoto(user.id,f.bytes);
  if(!stored.ok)return igFail(stored.status,stored.reason,stored.error);
  await recordImport(db,user.id,resolved.target,{mediaId,permalink:media.permalink,resultRef:stored.url});
  return Response.json({status:'imported',mediaId,url:stored.url},{headers:igHeaders});
 }catch(e){
  const code=instagramErrorCode(e);
  return code==='token'?igFail(409,'not_connected','Vuelva a conectar su cuenta de Instagram.'):code==='too_large'?igFail(413,'too_large','La foto es demasiado grande.'):igFail(503,'unavailable');
 }
}
