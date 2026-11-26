import {z} from 'zod';
import {DIRECTORY_LISTINGS_ENABLED} from '@/lib/directory/feature-flags';
import {enforceRateLimitKey} from '@/lib/rate-limit';
import {ProBodyError,proActor,proBoundedForm,proBoundedJson,proRouteHeaders,proSameOrigin} from '@/lib/pro/route-common';
import {LISTING_ERROR_HINTS} from '@/lib/directory/listing-schemas';
import {listingMediaMutationSchema,listingMediaSchema} from '@/lib/directory/listing-inventory';
import {PHOTO_BUCKET,PHOTO_MAX_BYTES,PHOTO_VARIANTS,createClientVariantsCodec,photoIdentity,photoRejectText,processListingPhoto,sha256Hex,toListingMediaInput,type PhotoVariant} from '@/lib/directory/photo-pipeline';
import {NoServerCodecError,pickPhotoCodec} from '@/lib/directory/photo-codec-cf-images';
import {clientVariantsOf} from '@/lib/directory/client-variants';

// LOCAL PRO ONLY (V3, development only): photos of directory listings (bucket dir-listing-photos-bucket-local.sql).
//  POST multipart {file, listingId, uploadId, altEs?, altEn?} → validate (magic bytes, 20 MiB, 24 MP), re-encode without
//       metadata (1600/800/320 WebP), sha256, store in the private bucket at dir-listings/<photo id>/<size>.webp and call
//       dir_listing_media_mutate {action:'add'}. Idempotent by the client `uploadId`: the photo id and actionId are derived
//       from (account, listing, uploadId), so a retry hits the same objects and the same receipt.
//  POST JSON {action:'remove'|'reorder',…} → dir_listing_media_mutate. 'add' is NEVER accepted as JSON: exifStripped
//       is asserted by this server after its own scan, never by the client.
// Errors answer {error, reason}; the UI translates `reason` with inventoryErrorText() / the `error` text.
const fail=(status:number,reason:string,error:string)=>Response.json({error,reason},{status,headers:proRouteHeaders});
const FORM_FIELDS=['file','v800','v320','listingId','uploadId','altEs','altEn'] as const;
const formSchema=z.object({listingId:z.string().uuid(),uploadId:z.string().uuid(),altEs:z.string().max(200).optional(),altEn:z.string().max(200).optional()}).strict();
const jsonActionSchema=listingMediaMutationSchema.refine(input=>input.action!=='add',{message:'Use the upload'});

function dbError(error:{code?:string;hint?:string}){
 const hint=error.hint as keyof typeof LISTING_ERROR_HINTS|undefined;
 if(hint&&hint in LISTING_ERROR_HINTS){const m=LISTING_ERROR_HINTS[hint];return fail(m.status,m.code,'No se pudo completar la operación.');}
 switch(error.code){
  case 'P0002':return fail(404,'not_found','El anuncio o la foto no están disponibles.');
  case '23505':return fail(409,'conflict','Esa foto ya se registró. Recargue el anuncio.');
  case '54000':return fail(409,'listing_media_cap','Alcanzó el máximo de fotos.');
  case '22023':case '23514':case '22P02':return fail(400,'invalid','Revise la foto.');
  case '42501':return fail(403,'module_unavailable','Sin acceso.');
  default:return fail(503,'unavailable','No se pudo completar la operación.');
 }
}

type Db=Extract<Awaited<ReturnType<typeof proActor>>,{error:null}>['db'];
/** Seller of the listing; when it is linked to a place, the seller must still be an active manager of that place. */
async function ownListing(db:Db,actor:string,listingId:string){
 const own=await db.from('dir_listings').select('id,seller_profile_id,status,place_id').eq('id',listingId).maybeSingle();
 if(own.error)return{error:dbError(own.error)} as const;
 if(!own.data||own.data.seller_profile_id!==actor)return{error:fail(404,'not_found','El anuncio no está disponible.')} as const;
 if(['sold','rented','suspended'].includes(own.data.status))return{error:fail(409,'listing_locked','El anuncio no se puede editar.')} as const;
 if(own.data.place_id){
  const managed=await db.from('dir_place_managers').select('place_id').eq('place_id',own.data.place_id).eq('user_id',actor).eq('status','active').maybeSingle();
  if(managed.error)return{error:dbError(managed.error)} as const;
  if(!managed.data)return{error:fail(403,'listing_place_not_managed','Ese negocio ya no está vinculado a su cuenta.')} as const;
 }
 return{error:null} as const;
}

export async function POST(req:Request){
 if(process.env.NODE_ENV!=='development'||!DIRECTORY_LISTINGS_ENABLED)return new Response(null,{status:404,headers:proRouteHeaders});
 if(!proSameOrigin(req))return fail(403,'origin','Origen no autorizado.');
 const locale=req.headers.get('accept-language')?.toLowerCase().startsWith('en')?'en':'es';
 try{
  const a=await proActor(req);if(a.error)return a.error;
  // Per ACCOUNT (never per client IP header). In-memory per isolate, like every limiter of the app.
  const limited=await enforceRateLimitKey(`dir-listing-photos:${a.user.id}`,40,60_000);if(limited)return limited;

  // ── remove / reorder (JSON) ──
  if(req.headers.get('content-type')?.toLowerCase().startsWith('application/json')){
   let raw:unknown;try{raw=await proBoundedJson(req,8192);}catch{return fail(400,'invalid','Revise la foto.');}
   const parsed=jsonActionSchema.safeParse(raw);if(!parsed.success)return fail(400,'invalid','Revise la foto.');
   const own=await ownListing(a.db,a.user.id,parsed.data.listingId);if(own.error)return own.error;
   const result=await a.db.rpc('dir_listing_media_mutate',{p_actor:a.user.id,p_input:parsed.data});
   return result.error?dbError(result.error):Response.json(result.data,{headers:proRouteHeaders});
  }

  // ── add (multipart upload) ──
  let form:FormData;
  try{form=await proBoundedForm(req,{maxBytes:PHOTO_MAX_BYTES+4*1024*1024+65_536,maxFiles:3,fields:FORM_FIELDS,maxFileBytes:PHOTO_MAX_BYTES});}
  catch(e){const status=e instanceof ProBodyError?e.status:400;return fail(status,status===413?'too_large':'invalid',status===413?photoRejectText('too_large',locale):'Revise la foto.');}
  const file=form.get('file'),fields=formSchema.safeParse(Object.fromEntries([...form.entries()].filter(([k])=>k!=='file'&&k!=='v800'&&k!=='v320')));
  if(!(file instanceof Blob)||!fields.success)return fail(400,'invalid','Revise la foto.');
  const {listingId,uploadId,altEs,altEn}=fields.data;
  const own=await ownListing(a.db,a.user.id,listingId);if(own.error)return own.error;
  const {photoId,actionId}=await photoIdentity(a.user.id,listingId,uploadId);

  // Retry of an upload that already finished: answer from the row, without re-encoding.
  const done=await a.db.from('dir_listing_media').select('id,listing_id,sha256,width,height,path_1600,path_800,path_320,status').eq('id',photoId).maybeSingle();
  if(done.error)return dbError(done.error);
  if(done.data){
   if(done.data.listing_id!==listingId)return fail(409,'conflict','Esa foto ya se registró.');
   return Response.json({action:'add',listingId,photo:{id:done.data.id,sha256:done.data.sha256,width:done.data.width,height:done.data.height,
    path1600:done.data.path_1600,path800:done.data.path_800,path320:done.data.path_320,status:done.data.status},replayed:true},{headers:proRouteHeaders});
  }
  // Cheap cap check before the (expensive) re-encode; the SQL enforces it again under its lock.
  const count=await a.db.from('dir_listing_media').select('id',{count:'exact',head:true}).eq('listing_id',listingId).eq('status','active');
  if(count.error)return dbError(count.error);if((count.count??0)>=30)return fail(409,'listing_media_cap','Alcanzó el máximo de fotos.');

  // Browser-made variants (storage plan 2026-11-26) are validated as-is; otherwise a server codec, none in the Worker.
  const input=new Uint8Array(await file.arrayBuffer()),clientVariants=await clientVariantsOf(form,input);
  let codec;
  if(clientVariants)codec=createClientVariantsCodec(clientVariants);
  else{try{codec=await pickPhotoCodec();}catch(e){return e instanceof NoServerCodecError?fail(422,'photo_browser_prep',photoRejectText('browser_prep',locale)):fail(503,'unavailable','El procesamiento de fotos no está disponible.');}}
  const processed=await processListingPhoto(clientVariants?.[1600]??input,{photoId,codec});
  if(!processed.ok)return fail(processed.reason==='too_large'?413:processed.reason==='codec'||processed.reason==='metadata'?422:400,
   processed.reason==='metadata'?'listing_media_exif':'photo_'+processed.reason,photoRejectText(processed.reason,locale));
  const media=listingMediaSchema.parse(toListingMediaInput(processed.photo,{altEs,altEn}));

  // Store the three variants. Never overwrite: an existing object (earlier attempt) must hold the same bytes.
  const bucket=a.db.storage.from(PHOTO_BUCKET),created:string[]=[];
  const cleanup=async()=>{if(created.length){const removed=await bucket.remove(created);if(removed.error)console.error('[dir-listing-photos] orphan objects',created);}};
  const put=async(v:PhotoVariant)=>{
   const up=await bucket.upload(v.path,v.bytes,{contentType:v.contentType,upsert:false,cacheControl:'31536000'});
   if(!up.error){created.push(v.path);return true;}
   if(String((up.error as {statusCode?:string|number}).statusCode)!=='409')return false;
   const stored=await bucket.download(v.path);if(stored.error||!stored.data)return false;
   return await sha256Hex(new Uint8Array(await stored.data.arrayBuffer()))===await sha256Hex(v.bytes);
  };
  for(const size of PHOTO_VARIANTS){
   if(!await put(processed.photo.variants[size])){await cleanup();return fail(503,'unavailable','No se pudo guardar la foto. Reintente la misma subida.');}
  }

  const result=await a.db.rpc('dir_listing_media_mutate',{p_actor:a.user.id,p_input:{action:'add',actionId,listingId,media}});
  if(result.error){
   // Remove what THIS request stored, unless the row exists after all (a parallel retry won): then the objects are in use.
   const row=await a.db.from('dir_listing_media').select('id').eq('id',photoId).maybeSingle();
   if(!row.error&&!row.data)await cleanup();
   return dbError(result.error);
  }
  return Response.json({...result.data as object,photo:{...media,status:'active'}},{headers:proRouteHeaders});
 }catch{return fail(503,'unavailable','No se pudo comprobar la subida. Reintente la misma foto.');}
}
