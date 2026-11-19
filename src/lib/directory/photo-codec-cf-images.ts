import type {PhotoCodec,PhotoVariantSize} from './photo-pipeline';

/**
 * Production (Cloudflare Worker) codec for photo-pipeline.ts: the Cloudflare Images binding `env.IMAGES`,
 * the same API that OpenNext's image optimizer already calls (node_modules/@opennextjs/cloudflare/dist/cli/
 * templates/images.js: `IMAGES.input(stream).transform({width,fit:'scale-down'}).output({format,quality})`).
 * No npm dependency and no WASM in the bundle; it needs an `images` binding in wrangler.jsonc.
 *
 * The pipeline re-reads the output headers and re-scans the metadata, so this adapter does not need to be
 * trusted: if the binding ever kept EXIF, fell back to another format or ignored orientation, the photo is
 * refused instead of being stored with `exifStripped=true`.
 */
type ImagesTransform={width?:number;height?:number;fit?:'scale-down'|'contain'|'cover'|'crop'|'pad'};
type ImagesOutput={format:'image/webp'|'image/jpeg';quality?:number;metadata?:'none'|'copyright'|'keep'};
type ImagesResult={image():ReadableStream<Uint8Array>;contentType():string};
type ImagesSource={transform(t:ImagesTransform):ImagesSource;output(o:ImagesOutput):Promise<ImagesResult>};
/** Structural type of the binding (keeps @cloudflare/workers-types out of the app tsconfig). */
export type CloudflareImagesBinding={input(stream:ReadableStream<Uint8Array>):ImagesSource};

export function createCloudflareImagesPhotoCodec(images:CloudflareImagesBinding,quality=82):PhotoCodec{
 return{
  name:'cloudflare-images',
  async resize(input:Uint8Array,box:PhotoVariantSize){
   const stream=new Blob([input as Uint8Array<ArrayBuffer>]).stream();
   // metadata:'none' is requested explicitly; WebP output carries no EXIF either way. Verified by the pipeline.
   const result=await images.input(stream).transform({width:box,height:box,fit:'scale-down'}).output({format:'image/webp',quality,metadata:'none'});
   return new Uint8Array(await new Response(result.image()).arrayBuffer());
  },
 };
}

/**
 * Picks the codec for the current runtime: the Images binding inside the Worker, sharp under `next dev`.
 * Synchronous getCloudflareContext() on purpose (same reason as ai-assistant/route.ts: the async variant boots a
 * wrangler proxy under next dev/start).
 */
export async function pickPhotoCodec():Promise<PhotoCodec>{
 let env:{IMAGES?:CloudflareImagesBinding}|null=null;
 try{const {getCloudflareContext}=await import('@opennextjs/cloudflare');env=getCloudflareContext().env as {IMAGES?:CloudflareImagesBinding};}
 catch{/* Not inside the Worker: local sharp below. */}
 if(env){
  // Inside the Worker sharp cannot load: without the binding, fail closed (the route answers 503).
  if(!env.IMAGES)throw Error('IMAGES binding missing');
  return createCloudflareImagesPhotoCodec(env.IMAGES);
 }
 const {createSharpPhotoCodec}=await import('./photo-codec-sharp');
 return createSharpPhotoCodec();
}
