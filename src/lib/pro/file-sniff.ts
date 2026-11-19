import {Buffer} from 'node:buffer';
import sharp from 'sharp';
import {PRO_FILE_MAX_BYTES} from './file-limit';
import {proSourceExtension,type ProDocMime} from './file-formats';
/**
 * Ronda F2-D (row 28): server-side type detection for job files and the company library. The
 * decision comes from the bytes; the source extension only picks between formats that share a
 * container (CSV vs TXT, MP4 vs MOV is read from the ftyp brand). Nothing here executes or renders
 * the file: it is a boundary check, not a sanitizer. Downloads stay attachments with nosniff and a
 * sandbox CSP. Photos are re-encoded (EXIF/GPS removed, orientation applied).
 */
export class ProDocRejected extends Error{constructor(readonly reason:'type'|'macro'|'size'|'mismatch'){super(reason);}}
const latin=(raw:Buffer,start:number,end:number)=>raw.subarray(start,Math.min(end,raw.length)).toString('latin1');
async function photo(raw:Buffer){
 const image=sharp(raw,{limitInputPixels:24_000_000,animated:false}),meta=await image.metadata();
 if(!['jpeg','png','webp','heif'].includes(meta.format||'')||(meta.pages??1)>1)throw new ProDocRejected('type');
 const bytes=await image.rotate().resize({width:1600,height:1600,fit:'inside',withoutEnlargement:true}).flatten({background:'#ffffff'}).jpeg({quality:80}).toBuffer();
 if(bytes.length>PRO_FILE_MAX_BYTES)throw new ProDocRejected('size');
 return{bytes,mimeType:'image/jpeg' as const};
}
function ooxml(raw:Buffer,ext:string):ProDocMime{
 if(latin(raw,0,4)!=='PK\u0003\u0004'||!latin(raw,Math.max(0,raw.length-65_557),raw.length).includes('PK\u0005\u0006'))throw new ProDocRejected('type');
 const names=raw.toString('latin1');
 if(!names.includes('[Content_Types].xml'))throw new ProDocRejected('type');
 // Macro projects are refused even when renamed to .docx/.xlsx/.pptx.
 if(/vbaProject\.bin|vbaData\.xml/i.test(names))throw new ProDocRejected('macro');
 const kind=names.includes('word/document.xml')?'docx':names.includes('xl/workbook.xml')?'xlsx':names.includes('ppt/presentation.xml')?'pptx':null;
 if(!kind)throw new ProDocRejected('type');
 if(kind!==ext)throw new ProDocRejected('mismatch');
 return kind==='docx'?'application/vnd.openxmlformats-officedocument.wordprocessingml.document':kind==='xlsx'?'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':'application/vnd.openxmlformats-officedocument.presentationml.presentation';
}
function plainText(raw:Buffer){
 let text:string;try{text=new TextDecoder('utf-8',{fatal:true}).decode(raw);}catch{throw new ProDocRejected('type');}
 // Only tab, line feed and carriage return among the control characters.
 if(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(text))throw new ProDocRejected('type');
 return text;
}
function isoBrand(raw:Buffer){return latin(raw,4,8)==='ftyp'?latin(raw,8,12):null;}
export async function sniffProDocument(raw:Buffer,sourceName:string):Promise<{bytes:Buffer;mimeType:ProDocMime}>{
 if(raw.length<1||raw.length>PRO_FILE_MAX_BYTES)throw new ProDocRejected('size');
 const ext=proSourceExtension(sourceName),head=latin(raw,0,16);
 if(/^%PDF-[12]\.[0-9]/.test(head)){
  if(!/%%EOF[\t\r\n ]*$/.test(latin(raw,Math.max(0,raw.length-1024),raw.length)))throw new ProDocRejected('type');
  return{bytes:raw,mimeType:'application/pdf'};
 }
 if(raw[0]===0xff&&raw[1]===0xd8&&raw[2]===0xff||head.startsWith('\u0089PNG')||head.startsWith('RIFF')&&latin(raw,8,12)==='WEBP')return photo(raw);
 const brand=isoBrand(raw);
 if(brand&&/^(heic|heix|hevc|heim|heis|hevm|hevs|mif1|msf1)$/.test(brand)){
  // HEIC: converted to JPG when the image library decodes it; otherwise kept as HEIC (download only).
  try{return await photo(raw);}catch(error){if(error instanceof ProDocRejected&&error.reason==='size')throw error;return{bytes:raw,mimeType:'image/heic'};}
 }
 if(brand||['moov','mdat','wide','free','skip'].includes(latin(raw,4,8))&&['mov','mp4','m4v'].includes(ext)){
  if(brand==='qt  '||!brand)return{bytes:raw,mimeType:'video/quicktime'};
  if(/^(isom|iso2|iso4|iso5|iso6|mp41|mp42|avc1|M4V |M4VH|M4VP|dash|3gp4|3gp5|3gp6|MSNV|XAVC)$/.test(brand))return{bytes:raw,mimeType:ext==='mov'?'video/quicktime':'video/mp4'};
  throw new ProDocRejected('type');
 }
 if(head.startsWith('PK\u0003\u0004'))return{bytes:raw,mimeType:ooxml(raw,ext)};
 if(/^AC10[0-3][0-9]/.test(head)){if(ext!=='dwg')throw new ProDocRejected('mismatch');return{bytes:raw,mimeType:'image/vnd.dwg'};}
 if(head.startsWith('AutoCAD Binary DXF')){if(ext!=='dxf')throw new ProDocRejected('mismatch');return{bytes:raw,mimeType:'image/vnd.dxf'};}
 if(['csv','txt','dxf'].includes(ext)){
  const text=plainText(raw);
  if(ext==='dxf'){if(!/^\s*0\s*\r?\n\s*SECTION\b/.test(text.slice(0,4096))&&!/^\s*999\s*\r?\n/.test(text.slice(0,64)))throw new ProDocRejected('type');return{bytes:raw,mimeType:'image/vnd.dxf'};}
  return{bytes:raw,mimeType:ext==='csv'?'text/csv':'text/plain'};
 }
 throw new ProDocRejected('type');
}
export function proDocRejectedMessage(error:unknown){
 const reason=error instanceof ProDocRejected?error.reason:'type';
 return reason==='macro'?'No se aceptan archivos de Office con macros.':reason==='size'?'El archivo pesa más de 20 MB.':reason==='mismatch'?'La extensión no coincide con el contenido del archivo.':'Formato no aceptado o archivo dañado.';
}
