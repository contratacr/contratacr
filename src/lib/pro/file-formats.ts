import {PRO_FILE_MAX_BYTES,PRO_FILE_MAX_MB} from './file-limit';
/**
 * Ronda F2-D (rows 28/31): the formats accepted by the job files and the company library, in one
 * place for the browser, the routes and the SQL checks (docs/pro/sql/file-formats-library-local.sql
 * keeps the same list in pro_file_doc_ext()). Every file stays private (bucket without public
 * access, bytes served only by the reauthorized API as an attachment). The server sniffs the bytes
 * (src/lib/pro/file-sniff.ts): the browser type and extension only choose the family.
 * Photos JPG/PNG/WebP are re-encoded as JPG (EXIF/GPS removed); HEIC is converted to JPG when the
 * image library can decode it and otherwise kept as HEIC (download only). Office/CAD/text files are
 * download only; PDF, photos, short videos (with duration and poster) and CSV/TXT (first 64 KB as plain text, CSV as a small grid) have an in-app preview.
 */
export const PRO_DOC_FORMATS={
 'image/jpeg':{ext:'jpg',kind:'image',preview:'image'},
 'application/pdf':{ext:'pdf',kind:'pdf',preview:'pdf'},
 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':{ext:'docx',kind:'word',preview:null},
 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':{ext:'xlsx',kind:'sheet',preview:null},
 'application/vnd.openxmlformats-officedocument.presentationml.presentation':{ext:'pptx',kind:'slides',preview:null},
 'text/csv':{ext:'csv',kind:'sheet',preview:'text'},
 'text/plain':{ext:'txt',kind:'text',preview:'text'},
 'image/vnd.dwg':{ext:'dwg',kind:'cad',preview:null},
 'image/vnd.dxf':{ext:'dxf',kind:'cad',preview:null},
 'image/heic':{ext:'heic',kind:'image',preview:null},
 'video/mp4':{ext:'mp4',kind:'video',preview:'video'},
 'video/quicktime':{ext:'mov',kind:'video',preview:'video'},
} as const;
export type ProDocMime=keyof typeof PRO_DOC_FORMATS;
export const PRO_DOC_MIMES=Object.keys(PRO_DOC_FORMATS) as [ProDocMime,...ProDocMime[]];
export type ProDocKind=(typeof PRO_DOC_FORMATS)[ProDocMime]['kind'];
export const PRO_DOC_EXTENSIONS=PRO_DOC_MIMES.map(mime=>PRO_DOC_FORMATS[mime].ext);
/** Storage object path: owner/uuid.ext, for every accepted format. */
export const PRO_DOC_PATH=new RegExp('^[a-f0-9-]{36}/[a-f0-9-]{36}\\.('+PRO_DOC_EXTENSIONS.join('|')+')$');
export function proDocExtension(mime:ProDocMime){return '.'+PRO_DOC_FORMATS[mime].ext;}
export function isProDocMime(value:string):value is ProDocMime{return Object.prototype.hasOwnProperty.call(PRO_DOC_FORMATS,value);}
/** Extensions the picker and the drop zone accept (source extensions, before normalization). */
const SOURCE_EXTENSIONS=['jpg','jpeg','png','webp','heic','heif','pdf','docx','xlsx','pptx','csv','txt','dwg','dxf','mp4','m4v','mov'];
export const PRO_DOC_ACCEPT=SOURCE_EXTENSIONS.map(ext=>'.'+ext).join(',')+',image/jpeg,image/png,image/webp,image/heic,application/pdf,video/mp4,video/quicktime,text/csv,text/plain';
export const PRO_DOC_BATCH_MAX=20;
export function proSourceExtension(name:string){const match=/\.([^.]+)$/u.exec(name.trim());return match?match[1].toLowerCase():'';}
export type ProDocCheck={ok:true}|{ok:false;reason:'type'|'size'|'empty'|'macro'};
/** Browser pre-check (the server decides). Macro-enabled Office files (.docm/.xlsm/.pptm) are refused. */
export function checkProDocSource(file:{name:string;size:number}):ProDocCheck{
 const ext=proSourceExtension(file.name);
 if(['docm','xlsm','pptm','dotm','xltm','potm'].includes(ext))return{ok:false,reason:'macro'};
 if(!SOURCE_EXTENSIONS.includes(ext))return{ok:false,reason:'type'};
 if(file.size<1)return{ok:false,reason:'empty'};
 if(file.size>PRO_FILE_MAX_BYTES)return{ok:false,reason:'size'};
 return{ok:true};
}
export function proDocCheckMessage(reason:Exclude<ProDocCheck,{ok:true}>['reason'],en:boolean){
 switch(reason){
  case 'macro':return en?'Office files with macros are not accepted. Save it as .docx, .xlsx or .pptx.':'No se aceptan archivos de Office con macros. Guárdelo como .docx, .xlsx o .pptx.';
  case 'type':return en?'Format not accepted.':'Formato no aceptado.';
  case 'empty':return en?'The file is empty.':'El archivo está vacío.';
  default:return en?`It is larger than ${PRO_FILE_MAX_MB} MB.`:`Pesa más de ${PRO_FILE_MAX_MB} MB.`;
 }
}
/** One wording everywhere for the accepted formats. */
export function proDocLimitText(en:boolean){
 return en?`Photos (JPG, PNG, WebP, HEIC), PDF, Word, Excel, PowerPoint, CSV, TXT, AutoCAD (DWG/DXF, download only) and short videos (MP4/MOV), up to ${PRO_FILE_MAX_MB} MB each. PNG, WebP and HEIC photos are saved as JPG when possible.`
  :`Fotos (JPG, PNG, WebP, HEIC), PDF, Word, Excel, PowerPoint, CSV, TXT, AutoCAD (DWG/DXF, solo descarga) y videos cortos (MP4/MOV), de hasta ${PRO_FILE_MAX_MB} MB cada uno. Las fotos PNG, WebP y HEIC se guardan como JPG cuando es posible.`;
}
const KIND_LABEL:{[K in ProDocKind]:[string,string]}={image:['Foto','Photo'],pdf:['PDF','PDF'],word:['Word','Word'],sheet:['Hoja de cálculo','Spreadsheet'],slides:['Presentación','Presentation'],text:['Texto','Text'],cad:['Plano AutoCAD','AutoCAD drawing'],video:['Video','Video']};
export function proDocKindLabel(mime:string,en:boolean){
 if(!isProDocMime(mime))return en?'File':'Archivo';
 if(mime==='text/csv')return 'CSV';
 if(mime==='image/heic')return 'HEIC';
 return KIND_LABEL[PRO_DOC_FORMATS[mime].kind][en?1:0];
}
export function proDocBadge(mime:string){return isProDocMime(mime)?PRO_DOC_FORMATS[mime].ext.toUpperCase():'FILE';}
export function proDocPreview(mime:string){return isProDocMime(mime)?PRO_DOC_FORMATS[mime].preview:null;}
