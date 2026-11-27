import 'server-only';
import {scanUpload} from '@/lib/moderation/files';
import {validateUpload,MIME_FOR,type FileKind} from '@/lib/upload-validation';
import {recordMediaAsset} from '@/lib/cloudinary-ownership';
import {isR2Configured,r2BaseKey,uploadR2Object} from '@/lib/r2-storage';
import {isLoopbackSupabase,uploadLocalObject} from '@/lib/media/local-upload-store';
import {stripImageMetadata,verifyStripped} from '@/lib/media/strip-image-metadata';
import {scanMetadata} from '@/lib/directory/photo-pipeline';

/**
 * A success-case photo imported from Instagram, stored with the same gates and storage as /api/upload/photo (type "portfolio"):
 * magic bytes (JPEG/PNG/WebP only here), 4 MB, malware scan, lossless metadata stripping verified by the independent scanner,
 * then R2 `contratacr/portfolio/<user>/<id>.<ext>` (or the loopback "local-uploads" bucket locally) and the ownership record.
 * No thumbnail pair (r2Thumb serves a URL without the `.lg.` mark as is) and no Cloudinary fallback: without R2 it refuses.
 */
const EXT:Partial<Record<FileKind,string>>={jpeg:'jpg',png:'png',webp:'webp'};
export type CasePhotoStoreResult={ok:true;url:string}|{ok:false;status:number;reason:string;error:string};
export async function storeImportedCasePhoto(userId:string,bytes:Uint8Array):Promise<CasePhotoStoreResult>{
 const buffer=Buffer.from(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 const check=validateUpload(buffer,{allow:['jpeg','png','webp'],maxBytes:4*1024*1024,allowLabel:'JPG, PNG o WEBP'});
 if(!check.ok)return{ok:false,status:400,reason:'photo_format',error:check.error};
 try{await scanUpload(buffer);}catch(e){return{ok:false,status:422,reason:'scan',error:e instanceof Error?e.message:'Análisis no disponible.'};}
 const stripped=stripImageMetadata(buffer);
 if(!stripped.ok||!verifyStripped(stripped,scanMetadata))return{ok:false,status:400,reason:'photo_metadata',error:'No se pudieron quitar los datos ocultos de la foto.'};
 const clean=Buffer.from(stripped.bytes.buffer,stripped.bytes.byteOffset,stripped.bytes.byteLength);
 const folder='contratacr/portfolio',ext=EXT[check.kind]!,contentType=MIME_FOR[check.kind];
 if(isR2Configured()){
  const result=await uploadR2Object({buffer:clean,contentType,folder,extension:ext,userId});
  await recordMediaAsset({userId,provider:'r2',publicId:result.key,resourceType:'image',secureUrl:result.url});
  return{ok:true,url:result.url};
 }
 if(isLoopbackSupabase()){const result=await uploadLocalObject(`${r2BaseKey(folder,userId)}.${ext}`,clean,contentType);return{ok:true,url:result.url};}
 return{ok:false,status:503,reason:'unavailable',error:'El almacenamiento de fotos no está disponible.'};
}
