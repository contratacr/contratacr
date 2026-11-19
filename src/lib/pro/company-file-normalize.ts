import {Buffer} from 'node:buffer';
import sharp from 'sharp';
import {WORK_FILE_MAX_BYTES} from './work-files';
import {PRO_FILE_MAX_BYTES} from './file-limit';
/** Server-only normalization. PDF boundary checks are not a structural sanitizer. */
export async function normalizeCompanyFile(raw:Buffer){
 if(raw.length===0||raw.length>WORK_FILE_MAX_BYTES)throw Error('Invalid company file size');
 if(/^%PDF-[12]\.[0-9]/.test(raw.subarray(0,8).toString('latin1'))){
  if(!/%%EOF[\t\r\n ]*$/.test(raw.subarray(Math.max(0,raw.length-1024)).toString('latin1')))throw Error('PDF EOF missing');
  return{bytes:Buffer.from(raw),mimeType:'application/pdf' as const};
 }
 const image=sharp(raw,{limitInputPixels:24_000_000,animated:false}),meta=await image.metadata();
 if(!['jpeg','png','webp'].includes(meta.format||'')||(meta.pages??1)>1)throw Error('Unsupported image');
 const bytes=await image.rotate().resize({width:1600,height:1600,fit:'inside',withoutEnlargement:true}).flatten({background:'#ffffff'}).jpeg({quality:80}).toBuffer();
 if(bytes.length>PRO_FILE_MAX_BYTES)throw Error('Normalized image too large');
 return{bytes,mimeType:'image/jpeg' as const};
}
