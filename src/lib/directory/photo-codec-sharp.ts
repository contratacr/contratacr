import type {PhotoCodec,PhotoVariantSize} from './photo-pipeline';

/**
 * Local/Node codec for photo-pipeline.ts — same approach as the Pro image routes (work-files, catalog,
 * delivery): sharp with limitInputPixels 24 MP, single frame, `.rotate()` (EXIF orientation applied before the
 * metadata is dropped) and a fresh encode. sharp writes NO metadata unless `keepMetadata/withMetadata` is
 * called, which is never done here. Output: WebP q82.
 *
 * sharp is imported lazily: a module-level native import breaks the OpenNext Worker at evaluation time
 * (docs/security-review.md). In production use photo-codec-cf-images.ts instead.
 */
export const PHOTO_WEBP_QUALITY=82;
type SharpFactory=typeof import('sharp').default;
export async function createSharpPhotoCodec():Promise<PhotoCodec>{
 const sharp:SharpFactory=(await import('sharp')).default;
 return{
  name:'sharp',
  async resize(input:Uint8Array,box:PhotoVariantSize){
   const image=sharp(input,{limitInputPixels:24_000_000,animated:false,failOn:'error'}),meta=await image.metadata();
   if(!['jpeg','png','webp'].includes(meta.format||'')||(meta.pages??1)>1)throw Error('Unsupported image');
   const out=await image.rotate().resize({width:box,height:box,fit:'inside',withoutEnlargement:true}).webp({quality:PHOTO_WEBP_QUALITY,effort:4}).toBuffer();
   return new Uint8Array(out.buffer,out.byteOffset,out.byteLength);
  },
 };
}
