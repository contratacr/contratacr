/**
 * V3 listing photos — upload pipeline core (directory listings / places). LOCAL, not wired yet.
 *
 * Runtime-neutral on purpose: no Node-only or native imports at module level, so the same code runs in
 * `next dev` (Node), in the Cloudflare Worker (OpenNext/workerd) and under `node --test`. The only thing
 * that differs per runtime is the codec (decode → orient → resize → re-encode), injected as `PhotoCodec`:
 *  - local/Node: `photo-codec-sharp.ts` (sharp, loaded lazily — a module-level sharp import once broke the
 *    production Worker, see docs/security-review.md),
 *  - Worker: `photo-codec-cf-images.ts` (Cloudflare Images binding `env.IMAGES`, the same API OpenNext uses).
 *
 * What the pipeline guarantees, independently of the codec (it never trusts the codec's word):
 *  1. Type by MAGIC BYTES (JPEG, PNG, WebP). HEIC/HEIF/AVIF/GIF/SVG are refused: the existing Pro image
 *     pipeline (work files, catalog, delivery) accepts exactly JPEG/PNG/WebP and the prebuilt sharp has no
 *     HEVC decoder. Animated WebP/PNG are refused.
 *  2. Size cap = PRO_FILE_MAX_BYTES (20 MiB, inlined so this file loads standalone) and a pixel cap read from
 *     the encoded header BEFORE decoding (24 MP, same as `limitInputPixels` in the Pro routes).
 *  3. Three variants that fit inside 1600/800/320 px (long side, never enlarged). Their real sizes are read
 *     back from the encoded output headers.
 *  4. Output metadata scan: every variant is re-checked for EXIF/XMP/IPTC/text chunks; one hit → refused.
 *     Only then is `exifStripped: true` set (the database refuses false).
 *  5. sha256 of the normalized original (the 1600 variant bytes) — the value the anti-fraud duplicate check
 *     compares across sellers — plus the sha256 of the raw upload for the audit trail.
 *  6. Storage paths keyed by the PHOTO id: dir-listings/<photo id>/<1600|800|320>.<webp|jpg>; never the
 *     listing id. The photo id and the mutation actionId are derived from (actor, listing, client upload
 *     id), so a retry of the same upload lands on the same objects and the same receipt (idempotent), and a
 *     client cannot aim its upload at another person's photo paths.
 */

/** Same value as PRO_FILE_MAX_BYTES (src/lib/pro/file-limit.ts); inlined so the file loads standalone. */
export const PHOTO_MAX_BYTES=20*1024*1024;
/** Same as `limitInputPixels` of the Pro sharp routes. */
export const PHOTO_MAX_PIXELS=24_000_000;
export const PHOTO_VARIANTS=[1600,800,320] as const;
export type PhotoVariantSize=typeof PHOTO_VARIANTS[number];
/** Database contract (dir_listing_media): width/height 200–1600 and long side ≥ 640 for the 1600 variant. */
export const PHOTO_MIN_LONG_SIDE=640;
export const PHOTO_MIN_SHORT_SIDE=200;
export const PHOTO_PATH_PREFIX='dir-listings';
/** Private Supabase Storage bucket (convention of the Pro buckets: private, created by SQL, no signed URLs). */
export const PHOTO_BUCKET='dir-listing-photos';
export const PHOTO_ALLOWED_LABEL={es:'JPG, PNG o WebP',en:'JPG, PNG or WebP'} as const;

export type PhotoSourceType='image/jpeg'|'image/png'|'image/webp';
export type PhotoOutputType='image/webp'|'image/jpeg';
export type PhotoRejectReason='empty'|'too_large'|'format'|'heic_unsupported'|'animated'|'unreadable'|'too_many_pixels'|
 'too_small'|'aspect'|'metadata'|'codec'|'browser_prep';

/**
 * Re-encodes `input` so it fits inside box×box (never enlarged), applying the EXIF orientation first and
 * writing NO metadata. Implementations must not trust the input; the pipeline re-checks everything they return.
 */
export interface PhotoCodec{
 readonly name:string;
 resize(input:Uint8Array,box:PhotoVariantSize):Promise<Uint8Array>;
}

/**
 * Storage plan 2026-11-26: the browser already made the three variants (src/lib/client-image-variants.ts), so the
 * "codec" just hands back the client file for each box. processListingPhoto still checks every one of them exactly
 * like a server-made variant (type by magic bytes, fit-inside size of the 1600 file ±1 px, one orientation, no
 * metadata), so nothing the client sends is trusted; no server-side image transformation runs.
 * Known limit: the content is not compared, so the 800/320 files could show another picture than the 1600 one.
 */
export function createClientVariantsCodec(variants:Record<PhotoVariantSize,Uint8Array>):PhotoCodec{
 return{name:'client',async resize(_input,box){const v=variants[box];if(!v)throw Error('missing variant');return v;}};
}
export type PhotoVariant={size:PhotoVariantSize;path:string;bytes:Uint8Array;contentType:PhotoOutputType;width:number;height:number;sizeBytes:number};
export type ProcessedPhoto={
 id:string;sha256:string;sourceSha256:string;sourceType:PhotoSourceType;width:number;height:number;
 /** Metadata kinds present in the upload (e.g. ['exif','gps']); informational, all of it is gone from the variants. */
 sourceMetadata:MetadataKind[];
 variants:Record<PhotoVariantSize,PhotoVariant>;exifStripped:true;codec:string;
};
export type PhotoResult={ok:true;photo:ProcessedPhoto}|{ok:false;reason:PhotoRejectReason};

// ── Magic bytes ─────────────────────────────────────────────────────────────────────────────────────────
const at=(b:Uint8Array,i:number,s:string)=>b.length>=i+s.length&&[...s].every((c,k)=>b[i+k]===c.charCodeAt(0));
export type SniffedKind=PhotoSourceType|'heic'|'other';
export function sniffPhoto(b:Uint8Array):SniffedKind{
 if(b.length>=3&&b[0]===0xff&&b[1]===0xd8&&b[2]===0xff)return 'image/jpeg';
 if(b.length>=8&&[0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a].every((v,i)=>b[i]===v))return 'image/png';
 if(at(b,0,'RIFF')&&at(b,8,'WEBP'))return 'image/webp';
 if(at(b,4,'ftyp')&&b.length>=12){
  const brand=String.fromCharCode(b[8]!,b[9]!,b[10]!,b[11]!);
  if(['heic','heix','hevc','hevx','heim','heis','hevm','hevs','heif','mif1','msf1'].includes(brand))return 'heic';
 }
 return 'other';
}

// ── Header dimensions (no decoding) ──────────────────────────────────────────────────────────────────────
const u16be=(b:Uint8Array,i:number)=>(b[i]!<<8)|b[i+1]!;
const u32be=(b:Uint8Array,i:number)=>((b[i]!<<24)>>>0)+(b[i+1]!<<16)+(b[i+2]!<<8)+b[i+3]!;
const u24le=(b:Uint8Array,i:number)=>b[i]!|(b[i+1]!<<8)|(b[i+2]!<<16);
const u32le=(b:Uint8Array,i:number)=>(b[i]!|(b[i+1]!<<8)|(b[i+2]!<<16))+(b[i+3]!*0x1000000);
const ascii=(b:Uint8Array,i:number,n:number)=>String.fromCharCode(...b.subarray(i,i+n));

export type HeaderInfo={width:number;height:number;animated:boolean};
/** Width/height (and animation) from the encoded header. null when the header is malformed or truncated. */
export function readHeader(b:Uint8Array):HeaderInfo|null{
 const kind=sniffPhoto(b);
 if(kind==='image/png'){
  if(b.length<33||!at(b,12,'IHDR'))return null;
  let animated=false;
  for(let i=8;i+8<=b.length;){const len=u32be(b,i),type=ascii(b,i+4,4);if(type==='acTL'){animated=true;break;}if(type==='IDAT'||type==='IEND')break;i+=12+len;}
  return dims(u32be(b,16),u32be(b,20),animated);
 }
 if(kind==='image/jpeg'){
  for(let i=2;i+9<b.length;){
   if(b[i]!==0xff)return null;
   const m=b[i+1]!;if(m===0xff){i++;continue;}
   if(m===0xd8||m===0x01||(m>=0xd0&&m<=0xd7)){i+=2;continue;}
   if(m===0xd9||m===0xda)return null;
   const len=u16be(b,i+2);if(len<2)return null;
   if(m>=0xc0&&m<=0xcf&&m!==0xc4&&m!==0xc8&&m!==0xcc)return dims(u16be(b,i+7),u16be(b,i+5),false);
   i+=2+len;
  }
  return null;
 }
 if(kind==='image/webp'){
  if(b.length<30)return null;
  const chunk=ascii(b,12,4);
  if(chunk==='VP8 '){if(b[23]!==0x9d||b[24]!==0x01||b[25]!==0x2a)return null;return dims(u16le(b,26)&0x3fff,u16le(b,28)&0x3fff,false);}
  if(chunk==='VP8L'){if(b[20]!==0x2f)return null;const v=u32le(b,21);return dims((v&0x3fff)+1,((v>>>14)&0x3fff)+1,false);}
  if(chunk==='VP8X')return dims(u24le(b,24)+1,u24le(b,27)+1,(b[20]!&0x02)!==0);
  return null;
 }
 return null;
}
const u16le=(b:Uint8Array,i:number)=>b[i]!|(b[i+1]!<<8);
const dims=(width:number,height:number,animated:boolean)=>width>0&&height>0?{width,height,animated}:null;

// ── Metadata scan ────────────────────────────────────────────────────────────────────────────────────────
export type MetadataKind='exif'|'gps'|'xmp'|'iptc'|'comment'|'text'|'other_app';
/**
 * Lists the metadata blocks present in a JPEG/PNG/WebP. Used on the upload (informational) and, as the gate,
 * on every variant: any hit there refuses the photo. ICC colour profiles are allowed (no personal data).
 */
export function scanMetadata(b:Uint8Array):MetadataKind[]{
 const found=new Set<MetadataKind>();
 const exif=(start:number,end:number)=>{found.add('exif');if(hasGpsIfd(b,start,end))found.add('gps');};
 const kind=sniffPhoto(b);
 if(kind==='image/jpeg'){
  for(let i=2;i+4<=b.length;){
   if(b[i]!==0xff)break;
   const m=b[i+1]!;if(m===0xff){i++;continue;}
   if(m===0xd8||m===0x01||(m>=0xd0&&m<=0xd7)){i+=2;continue;}
   if(m===0xd9||m===0xda)break;
   const len=u16be(b,i+2),body=i+4,end=Math.min(b.length,i+2+len);
   if(m===0xe1){if(at(b,body,'Exif\0'))exif(body+6,end);else if(at(b,body,'http://ns.adobe.com/'))found.add('xmp');else found.add('other_app');}
   else if(m===0xed)found.add('iptc');
   else if(m===0xfe)found.add('comment');
   else if(m>=0xe0&&m<=0xef&&m!==0xe0&&m!==0xee&&!(m===0xe2&&at(b,body,'ICC_PROFILE\0')))found.add('other_app');
   if(len<2)break;i+=2+len;
  }
 }else if(kind==='image/png'){
  for(let i=8;i+8<=b.length;){
   const len=u32be(b,i),type=ascii(b,i+4,4);
   if(type==='eXIf')exif(i+8,Math.min(b.length,i+8+len));
   else if(type==='iTXt'){if(at(b,i+8,'XML:com.adobe.xmp'))found.add('xmp');else found.add('text');}
   else if(type==='tEXt'||type==='zTXt'||type==='tIME')found.add('text');
   if(type==='IEND')break;i+=12+len;
  }
 }else if(kind==='image/webp'){
  if(at(b,12,'VP8X')&&b.length>20){if(b[20]!&0x08)found.add('exif');if(b[20]!&0x04)found.add('xmp');}
  for(let i=12;i+8<=b.length;){
   const type=ascii(b,i,4),len=u32le(b,i+4);
   if(type==='EXIF'){const s=at(b,i+8,'Exif\0\0')?i+14:i+8;exif(s,Math.min(b.length,i+8+len));}
   else if(type==='XMP ')found.add('xmp');
   i+=8+len+(len&1);
  }
 }
 return [...found];
}
/** True when a TIFF/EXIF block's IFD0 carries the GPS IFD pointer (tag 0x8825). */
function hasGpsIfd(b:Uint8Array,start:number,end:number){
 if(end-start<8)return false;
 const le=b[start]===0x49&&b[start+1]===0x49;if(!le&&!(b[start]===0x4d&&b[start+1]===0x4d))return false;
 const r16=(i:number)=>le?u16le(b,i):u16be(b,i),r32=(i:number)=>le?u32le(b,i):u32be(b,i);
 const ifd=start+r32(start+4);if(ifd+2>end)return false;
 const n=r16(ifd);
 for(let k=0;k<n;k++){const e=ifd+2+k*12;if(e+12>end)return false;if(r16(e)===0x8825)return true;}
 return false;
}

// ── Hashing and ids ──────────────────────────────────────────────────────────────────────────────────────
/** sha256 hex via Web Crypto (global in Node ≥ 20 and in workerd). */
export async function sha256Hex(bytes:Uint8Array|string):Promise<string>{
 const data=typeof bytes==='string'?new TextEncoder().encode(bytes):bytes;
 const digest=await globalThis.crypto.subtle.digest('SHA-256',data as Uint8Array<ArrayBuffer>);
 return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** RFC 9562 version-8 (custom) uuid from a sha256 of `parts`. Stable: same parts → same id. */
export async function derivedUuid(...parts:string[]):Promise<string>{
 const h=await sha256Hex(parts.join('\u0000'));
 const v=h.slice(0,12)+'8'+h.slice(13,16)+((parseInt(h[16]!,16)&0x3)|0x8).toString(16)+h.slice(17,32);
 return `${v.slice(0,8)}-${v.slice(8,12)}-${v.slice(12,16)}-${v.slice(16,20)}-${v.slice(20,32)}`;
}
/**
 * Photo id and actionId for one client upload. The client only chooses `uploadId` (a uuid it reuses when it
 * retries); the server derives the rest, so the ids cannot collide with — or target — someone else's photo.
 */
export async function photoIdentity(actorId:string,listingId:string,uploadId:string){
 for(const v of [actorId,listingId,uploadId])if(!UUID.test(v))throw new TypeError('Invalid uuid');
 return{
  photoId:await derivedUuid('dir-listing-photo',actorId,listingId,uploadId),
  actionId:await derivedUuid('dir-listing-photo-add',actorId,listingId,uploadId),
 };
}
const EXT:Record<PhotoOutputType,'webp'|'jpg'>={'image/webp':'webp','image/jpeg':'jpg'};
export function photoPath(photoId:string,size:PhotoVariantSize,type:PhotoOutputType){
 if(!UUID.test(photoId))throw new TypeError('Invalid photo id');
 return `${PHOTO_PATH_PREFIX}/${photoId}/${size}.${EXT[type]}`;
}

// ── Pipeline ─────────────────────────────────────────────────────────────────────────────────────────────
/** Expected size of a fit-inside box resize without enlargement (±1 px rounding tolerated by the check). */
const fitInside=(w:number,h:number,box:number)=>{const s=Math.min(1,box/Math.max(w,h));return{width:Math.max(1,Math.round(w*s)),height:Math.max(1,Math.round(h*s))};};

export async function processListingPhoto(input:Uint8Array,opts:{photoId:string;codec:PhotoCodec;maxBytes?:number}):Promise<PhotoResult>{
 const fail=(reason:PhotoRejectReason):PhotoResult=>({ok:false,reason});
 if(!UUID.test(opts.photoId))throw new TypeError('Invalid photo id');
 if(input.length===0)return fail('empty');
 if(input.length>Math.min(opts.maxBytes??PHOTO_MAX_BYTES,PHOTO_MAX_BYTES))return fail('too_large');
 const kind=sniffPhoto(input);
 if(kind==='heic')return fail('heic_unsupported');
 if(kind==='other')return fail('format');
 const head=readHeader(input);if(!head)return fail('unreadable');
 if(head.animated)return fail('animated');
 if(head.width*head.height>PHOTO_MAX_PIXELS)return fail('too_many_pixels');
 // Orientation may swap width/height; long/short side checks do not depend on it.
 const fit=fitInside(head.width,head.height,1600);
 if(Math.max(fit.width,fit.height)<PHOTO_MIN_LONG_SIDE)return fail('too_small');
 if(Math.min(fit.width,fit.height)<PHOTO_MIN_SHORT_SIDE)return fail('aspect');

 const variants={} as Record<PhotoVariantSize,PhotoVariant>;
 let orientedSwap:boolean|null=null;
 for(const size of PHOTO_VARIANTS){
  let bytes:Uint8Array;
  try{bytes=await opts.codec.resize(input,size);}catch{return fail('codec');}
  const out=sniffPhoto(bytes);
  if(out!=='image/webp'&&out!=='image/jpeg')return fail('codec');
  const h=readHeader(bytes);if(!h||h.animated)return fail('codec');
  if(Math.max(h.width,h.height)>size)return fail('codec');
  // Each variant must be the fit-inside size of the source (as-is, or swapped by the EXIF orientation), ±1 px.
  const want=fitInside(head.width,head.height,size),near=(a:number,b:number)=>Math.abs(a-b)<=1;
  const swapped=near(h.width,want.height)&&near(h.height,want.width)&&!(near(h.width,want.width)&&near(h.height,want.height));
  if(!swapped&&!(near(h.width,want.width)&&near(h.height,want.height)))return fail('codec');
  // All variants share one orientation.
  if(orientedSwap===null)orientedSwap=swapped;else if(orientedSwap!==swapped)return fail('codec');
  if(scanMetadata(bytes).length)return fail('metadata');
  variants[size]={size,path:photoPath(opts.photoId,size,out),bytes,contentType:out,width:h.width,height:h.height,sizeBytes:bytes.length};
 }
 const main=variants[1600];
 if(Math.max(main.width,main.height)<PHOTO_MIN_LONG_SIDE)return fail('too_small');
 if(Math.min(main.width,main.height)<PHOTO_MIN_SHORT_SIDE)return fail('aspect');
 return{ok:true,photo:{
  id:opts.photoId,sha256:await sha256Hex(main.bytes),sourceSha256:await sha256Hex(input),sourceType:kind,
  width:main.width,height:main.height,sourceMetadata:scanMetadata(input),variants,exifStripped:true,codec:opts.codec.name,
 }};
}

/** The `media` object of dir_listing_media_mutate {action:'add'} (shape of listingMediaSchema). */
export function toListingMediaInput(photo:ProcessedPhoto,alt:{altEs?:string;altEn?:string}={}){
 const clean=(v?:string)=>{const t=v?.trim();return t?t.slice(0,200):undefined;};
 const altEs=clean(alt.altEs),altEn=clean(alt.altEn);
 return{id:photo.id,sha256:photo.sha256,width:photo.width,height:photo.height,
  path1600:photo.variants[1600].path,path800:photo.variants[800].path,path320:photo.variants[320].path,
  exifStripped:true as const,...(altEs?{altEs}:{}),...(altEn?{altEn}:{})};
}

/** User-facing text per rejection (ES/EN). */
export function photoRejectText(reason:PhotoRejectReason,locale:string):string{
 const en=locale==='en',t=(es:string,english:string)=>en?english:es,mb=PHOTO_MAX_BYTES/1024/1024;
 switch(reason){
  case 'empty':return t('El archivo está vacío.','The file is empty.');
  case 'too_large':return t(`La foto supera ${mb} MB.`,`The photo is larger than ${mb} MB.`);
  case 'heic_unsupported':return t('Las fotos HEIC del iPhone aún no se admiten. Elija "Más compatible" en Ajustes › Cámara › Formatos o comparta la foto como JPG.','iPhone HEIC photos are not supported yet. Choose "Most Compatible" in Settings › Camera › Formats or share the photo as JPG.');
  case 'format':return t(`Formato no permitido. Use ${PHOTO_ALLOWED_LABEL.es}.`,`Format not allowed. Use ${PHOTO_ALLOWED_LABEL.en}.`);
  case 'animated':return t('Las imágenes animadas no se admiten.','Animated images are not supported.');
  case 'too_many_pixels':return t('La foto tiene demasiados píxeles (máximo 24 megapíxeles).','The photo has too many pixels (24 megapixels at most).');
  case 'too_small':return t(`La foto es muy pequeña: el lado mayor debe medir al menos ${PHOTO_MIN_LONG_SIDE} px.`,`The photo is too small: its long side must be at least ${PHOTO_MIN_LONG_SIDE} px.`);
  case 'aspect':return t('La foto es demasiado alargada. Recórtela a una proporción más común.','The photo is too elongated. Crop it to a more common ratio.');
  case 'metadata':return t('No se pudo limpiar la información interna de la foto. Intente con otra imagen.','The photo metadata could not be removed. Try another image.');
  case 'browser_prep':return t('Su navegador no pudo preparar esta foto. Actualice el navegador o intente con otra foto (JPG, PNG o WebP).','Your browser could not prepare this photo. Update the browser or try another photo (JPG, PNG or WebP).');
  case 'unreadable':case 'codec':return t('No se pudo leer la foto. Intente con otra imagen.','The photo could not be read. Try another image.');
 }
}
