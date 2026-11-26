import type {PhotoCodec,PhotoVariantSize} from './photo-pipeline';

/**
 * Production (Cloudflare Worker) codec for photo-pipeline.ts: the Cloudflare Images binding `env.IMAGES`,
 * the same API that OpenNext's image optimizer already calls (node_modules/@opennextjs/cloudflare/dist/cli/
 * templates/images.js: `IMAGES.input(stream).transform({width,fit:'scale-down'}).output({format,quality})`).
 * No npm dependency and no WASM in the bundle; it needs an `images` binding in wrangler.jsonc (removed 2026-11-26:
 * only used if that binding is added back).
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

/** Thrown inside the Worker when an upload needs a server-side resize and no image service is bound. */
export class NoServerCodecError extends Error{constructor(){super('no server photo codec');}}

/**
 * Codec for an upload the browser did NOT already resize (storage plan 2026-11-26, docs/storage-plan.md):
 *  - Worker: the Cloudflare Images binding if one is configured; since 2026-11-26 wrangler.jsonc binds none (goal:
 *    zero Cloudflare Images transformations), so the upload is refused with reason 'browser_prep' (clear message,
 *    the browser path makes the variants itself). A WASM codec could be added here later if that ever matters.
 *  - next dev / Node: sharp, loaded lazily.
 * Uploads that carry client variants never get here (createClientVariantsCodec).
 * Synchronous getCloudflareContext() on purpose (same reason as ai-assistant/route.ts: the async variant boots a
 * wrangler proxy under next dev/start).
 */
export async function pickPhotoCodec():Promise<PhotoCodec>{
 let env:{IMAGES?:CloudflareImagesBinding}|null=null;
 try{const {getCloudflareContext}=await import('@opennextjs/cloudflare');env=getCloudflareContext().env as {IMAGES?:CloudflareImagesBinding};}
 catch{/* Not inside the Worker: local sharp below. */}
 if(env){
  // Inside the Worker sharp cannot load: without a binding, refuse (the route answers 422 browser_prep).
  if(!env.IMAGES)throw new NoServerCodecError();
  return createCloudflareImagesPhotoCodec(env.IMAGES);
 }
 const {createSharpPhotoCodec}=await import('./photo-codec-sharp');
 return createSharpPhotoCodec();
}
