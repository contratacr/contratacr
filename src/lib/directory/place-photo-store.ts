import {PLACE_PHOTO_BUCKET} from './place-photos';

/**
 * Where uploaded place photos live (owner decision 2026-11-26: stay on free tiers). Server only.
 *  - 'r2': Cloudflare R2 binding PLACE_PHOTOS of the Worker (10 GB free, free egress). Object key
 *    "<supabase project host>/<path>" because test and production Workers deploy the same wrangler.jsonc and therefore
 *    share the bucket (same separation as the public catalogue snapshot, approved-catalog-cache.ts).
 *  - 'supabase': private Storage bucket dir-place-photos — every photo uploaded before migration 538, and every upload where
 *    there is no R2 binding (next dev, Node tests, a Worker deployed without the binding).
 * The store of each photo is recorded in dir_place_media.photo_store, so reads and deletes always go to the right place.
 * One-time setup (owner, before the next deploy — wrangler refuses to deploy a binding whose bucket is missing):
 *   npx wrangler r2 bucket create contratacr-place-photos
 */
export type PlacePhotoStoreName='supabase'|'r2';
export type PutResult='created'|'exists';
export type StoredPhoto={bytes:Uint8Array;contentType:string};
export interface PlacePhotoStore{
 readonly name:PlacePhotoStoreName;
 /** Writes only when the key is free (like Storage upsert:false); 'exists' when an object is already there. Throws on failure. */
 put(path:string,bytes:Uint8Array,contentType:string):Promise<PutResult>;
 /** null when the object does not exist (Supabase: or cannot be read). Throws on an R2 failure. */
 get(path:string):Promise<StoredPhoto|null>;
 /** Deletes the objects (missing ones are fine). Throws on failure. */
 remove(paths:string[]):Promise<void>;
}

/** Structural subset of the Workers R2Bucket binding (keeps @cloudflare/workers-types out of the app tsconfig). */
export type R2BucketLike={
 put(key:string,value:Uint8Array,options:{onlyIf:{etagDoesNotMatch:string};httpMetadata:{contentType:string;cacheControl?:string}}):Promise<unknown|null>;
 get(key:string):Promise<{arrayBuffer():Promise<ArrayBuffer>;httpMetadata?:{contentType?:string}}|null>;
 delete(keys:string|string[]):Promise<void>;
};
/** Structural subset of supabase.storage.from(bucket). */
export type SupabaseBucketLike={
 upload(path:string,body:Uint8Array,options:{contentType:string;upsert:boolean;cacheControl:string}):Promise<{error:unknown}>;
 download(path:string):Promise<{data:Blob|null;error:unknown}>;
 remove(paths:string[]):Promise<{error:unknown}>;
};
type StorageClient={storage:{from(bucket:string):unknown}};

const typeOf=(path:string)=>path.endsWith('.jpg')?'image/jpeg':'image/webp';

export function createR2PlacePhotoStore(bucket:R2BucketLike,projectHost:string):PlacePhotoStore{
 if(!/^[a-z0-9.-]+(?::\d+)?$/i.test(projectHost))throw Error('invalid project host');
 const key=(path:string)=>`${projectHost}/${path}`;
 return{
  name:'r2',
  async put(path,bytes,contentType){
   const written=await bucket.put(key(path),bytes,{onlyIf:{etagDoesNotMatch:'*'},httpMetadata:{contentType,cacheControl:'public, max-age=31536000, immutable'}});
   return written===null?'exists':'created';
  },
  async get(path){
   const o=await bucket.get(key(path));if(!o)return null;
   return{bytes:new Uint8Array(await o.arrayBuffer()),contentType:o.httpMetadata?.contentType||typeOf(path)};
  },
  async remove(paths){if(paths.length)await bucket.delete(paths.map(key));},
 };
}

export function createSupabasePlacePhotoStore(bucket:SupabaseBucketLike):PlacePhotoStore{
 return{
  name:'supabase',
  async put(path,bytes,contentType){
   const up=await bucket.upload(path,bytes,{contentType,upsert:false,cacheControl:'31536000'});
   if(!up.error)return 'created';
   if(String((up.error as {statusCode?:string|number}).statusCode)==='409')return 'exists';
   throw Error('storage upload failed');
  },
  async get(path){
   // Same as before the adapter: any download failure reads as «not there» (the route answers 404).
   const file=await bucket.download(path);
   if(file.error||!file.data)return null;
   return{bytes:new Uint8Array(await file.data.arrayBuffer()),contentType:typeOf(path)};
  },
  async remove(paths){if(!paths.length)return;const r=await bucket.remove(paths);if(r.error)throw Error('storage remove failed');},
 };
}

/** The PLACE_PHOTOS binding inside the Worker, null elsewhere. Synchronous getCloudflareContext() on purpose (see pickPhotoCodec). */
export async function placePhotosR2Binding():Promise<R2BucketLike|null>{
 try{const {getCloudflareContext}=await import('@opennextjs/cloudflare');return (getCloudflareContext().env as {PLACE_PHOTOS?:R2BucketLike}).PLACE_PHOTOS??null;}
 catch{return null;}
}
const projectHost=()=>new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname;
const supabaseStore=(db:StorageClient)=>createSupabasePlacePhotoStore(db.storage.from(PLACE_PHOTO_BUCKET) as SupabaseBucketLike);

/** Store for NEW uploads: R2 when the Worker has the binding, Supabase Storage otherwise. */
export async function uploadPlacePhotoStore(db:StorageClient,r2?:R2BucketLike|null):Promise<PlacePhotoStore>{
 const bucket=r2===undefined?await placePhotosR2Binding():r2;
 return bucket?createR2PlacePhotoStore(bucket,projectHost()):supabaseStore(db);
}
/** Store an existing photo lives in (dir_place_media.photo_store). null when it is in R2 but this runtime has no binding. */
export async function placePhotoStoreOf(db:StorageClient,name:unknown,r2?:R2BucketLike|null):Promise<PlacePhotoStore|null>{
 if(name!=='r2')return supabaseStore(db);
 const bucket=r2===undefined?await placePhotosR2Binding():r2;
 return bucket?createR2PlacePhotoStore(bucket,projectHost()):null;
}
