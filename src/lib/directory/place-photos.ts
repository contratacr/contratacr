import {z} from 'zod';

/**
 * Launch round (2026-11-18): photo uploads of directory places (owner/team → published at once; signed-in people →
 * pending until staff approves). Client-safe: schemas, limits, ES/EN texts and URL helpers. The server pipeline is
 * photo-pipeline.ts (magic bytes, 20 MiB, 24 MP, re-encode without EXIF/GPS, sha256) — HEIC is converted to JPEG in the
 * browser first (client-image-upload.ts), like every other image of the app.
 */
export const PLACE_PHOTO_BUCKET='dir-place-photos';
export const PLACE_PHOTO_PREFIX='dir-places';
/** Per person and day (rate limiter bucket; the SQL caps it again: 20 in 24 h). */
export const PLACE_PHOTO_DAILY_LIMIT=20;
/** Photos per upload batch in the UI. */
export const PLACE_PHOTO_BATCH=5;
/** Bytes accepted from the browser (after its own compression); the pipeline accepts up to 20 MiB. */
export const PLACE_PHOTO_MAX_BYTES=8*1024*1024;
export const PLACE_PHOTO_TYPES=['image/jpeg','image/png','image/webp','image/heic','image/heif'] as const;
export const PLACE_PHOTO_ACCEPT='image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif';
/** Canonical (stored) URL of an uploaded photo; the page serves it from the same path on its own origin. */
export const PLACE_PHOTO_ORIGIN='https://contratacr.com';
export const placePhotoUrl=(id:string)=>`${PLACE_PHOTO_ORIGIN}/api/fotos-lugar/${id}`;
const OWN=/^https:\/\/[a-z0-9.-]+(?::\d+)?\/api\/fotos-lugar\/([0-9a-f-]{36})$/;
/** Id of an uploaded photo from its stored URL (null for imported/seed URLs). */
export const placePhotoId=(url:string)=>OWN.exec(url)?.[1]??null;
/** Same-origin src for a stored URL at a size; seed URLs pass through. */
export const placePhotoSrc=(url:string,size:320|800|1600=800)=>{const id=placePhotoId(url);return id?`/api/fotos-lugar/${id}?s=${size}`:url;};

export const placePhotoFieldsSchema=z.object({
 uploadId:z.string().uuid(),
 caption:z.string().max(200).optional(),
 review:z.enum(['0','1']).optional(),
}).strict();
export const placePhotoRemoveSchema=z.object({action:z.literal('remove'),actionId:z.string().uuid(),mediaId:z.string().uuid()}).strict();
export const PHOTO_FLAG_REASONS=['not_this_place','offensive','private_info','copyright','spam','other'] as const;
export const placePhotoFlagSchema=z.object({flagId:z.string().uuid(),reason:z.enum(PHOTO_FLAG_REASONS),message:z.string().trim().max(500).optional()}).strict()
 .refine(v=>v.reason!=='other'||(v.message?.length??0)>=5,{path:['message'],message:'message_required'});
export const photoStaffDecisionSchema=z.object({kind:z.literal('photo'),actionId:z.string().uuid(),mediaId:z.string().uuid(),
 decision:z.enum(['approve','reject','remove','restore','dismiss']),reason:z.string().trim().max(1000).optional(),expectedStatus:z.enum(['pending','approved','hidden'])}).strict()
 .refine(v=>v.decision==='approve'||v.decision==='dismiss'||(v.reason?.length??0)>=3,{path:['reason'],message:'reason_required'});

/** Browser-side check before anything is sent (the server checks everything again). */
export type PhotoPick={ok:true}|{ok:false;reason:'format'|'too_large'|'empty'};
export function checkPhotoPick(file:{type:string;size:number;name:string}):PhotoPick{
 if(file.size===0)return{ok:false,reason:'empty'};
 const type=file.type.toLowerCase(),ext=file.name.toLowerCase().split('.').pop()??'';
 const known=(PLACE_PHOTO_TYPES as readonly string[]).includes(type)||(!type&&['jpg','jpeg','png','webp','heic','heif'].includes(ext));
 if(!known)return{ok:false,reason:'format'};
 if(file.size>20*1024*1024)return{ok:false,reason:'too_large'};
 return{ok:true};
}
/** Clean caption: collapsed spaces, ≤ 200 characters, never a link. Empty → undefined. */
export function cleanCaption(v:unknown):string|undefined{
 if(typeof v!=='string')return undefined;
 const t=v.replace(/\s+/g,' ').trim().slice(0,200);
 if(!t||/(https?:\/\/|www\.)/i.test(t))return undefined;
 return t;
}
/** Alt text: caption, otherwise «Foto N de <lugar>». */
export const photoAlt=(caption:string|null|undefined,placeName:string,n:number,en:boolean)=>caption?.trim()||(en?`Photo ${n} of ${placeName}`:`Foto ${n} de ${placeName}`);

export const PHOTO_REASON_TEXT:Record<string,[string,string]>={
 login:['Inicie sesión para agregar fotos.','Please sign in to add photos.'],
 invalid:['Revise la foto.','Please check the photo.'],
 format:['Formato no permitido. Use JPG, PNG, WebP o HEIC.','Format not allowed. Use JPG, PNG, WebP or HEIC.'],
 too_large:['La foto es demasiado grande.','The photo is too large.'],
 empty:['El archivo está vacío.','The file is empty.'],
 duplicate:['Esa foto ya está en este lugar.','That photo is already on this place.'],
 cap:['Alcanzó el máximo de fotos por hoy. Intente mañana.','You reached today’s photo limit. Please try tomorrow.'],
 place_cap:['Este lugar alcanzó el máximo de fotos.','This place reached its photo limit.'],
 review_missing:['Publique su reseña antes de agregarle fotos.','Post your review before adding photos to it.'],
 review_cap:['Una reseña admite hasta 5 fotos.','A review takes up to 5 photos.'],
 own_place:['El negocio agrega fotos al lugar, no a las reseñas.','The business adds photos to the place, not to reviews.'],
 not_owner:['Solo quien subió la foto puede quitarla.','Only whoever uploaded the photo can remove it.'],
 own_flag:['No puede reportar su propia foto.','You cannot report your own photo.'],
 limit:['Demasiados intentos. Intente más tarde.','Too many attempts. Please try later.'],
 unavailable:['No se pudo subir la foto. Intente de nuevo.','The photo could not be uploaded. Please try again.'],
};
export const photoReasonText=(reason:string|undefined,en:boolean)=>(PHOTO_REASON_TEXT[reason??'']??PHOTO_REASON_TEXT.unavailable!)[en?1:0];
