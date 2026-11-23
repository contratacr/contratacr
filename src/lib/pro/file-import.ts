import {createHash} from 'node:crypto';
import {z} from 'zod';
import {PRO_FILE_MAX_BYTES} from './file-limit';
/**
 * Ronda F2-E (row 31): import of files from an external drive into the company library, behind an adapter interface.
 *  - "sandbox" (the default): deterministic example files, no network, no account. It is what the specs and the local app use.
 *  - "live": Google Drive REST v3 with the credentials in environment variables (GOOGLE_DRIVE_CLIENT_ID, GOOGLE_DRIVE_CLIENT_SECRET,
 *    GOOGLE_DRIVE_REFRESH_TOKEN) and PRO_DRIVE_IMPORT_MODE=live. It is written against the public API but NOT exercised against a real
 *    Drive account yet (needs the owner's Google project); a per-company OAuth connection screen does not exist either.
 * The adapter only lists and fetches bytes; the route sends them through the normal library writer (format sniffing, quota, idempotency).
 */
export type ImportMode='sandbox'|'live';
export const importCandidateSchema=z.object({id:z.string().min(1).max(200),name:z.string().min(1).max(200),mimeType:z.string().max(120),sizeBytes:z.number().int().nonnegative(),modifiedAt:z.string()}).strict();
export type ImportCandidate=z.infer<typeof importCandidateSchema>;
export type ImportErrorCode='not_found'|'not_configured'|'unavailable'|'size';
export class ImportAdapterError extends Error{constructor(readonly code:ImportErrorCode){super(code);this.name='ImportAdapterError';}}
export interface FileImportAdapter{readonly provider:'drive';readonly mode:ImportMode;list():Promise<ImportCandidate[]>;fetch(id:string):Promise<{name:string;bytes:Buffer}>}
export const IMPORT_BATCH_MAX=10;

// ---------------------------------------------------------------- sandbox
const PDF_TEXT='%PDF-1.4\n% Plano de ejemplo (sandbox)\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n';
const JPEG_1PX=Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/yQALCAABAAEBAREA/8wABgAQEAX/2gAIAQEAAD8A0s8g/9k=','base64');
const SANDBOX:Array<{id:string;name:string;mimeType:string;bytes:Buffer}>=[
 {id:'sandbox-plano',name:'Plano de ejemplo.pdf',mimeType:'application/pdf',bytes:Buffer.from(PDF_TEXT,'latin1')},
 {id:'sandbox-foto',name:'Foto de ejemplo.jpg',mimeType:'image/jpeg',bytes:JPEG_1PX},
 {id:'sandbox-notas',name:'Notas de ejemplo.txt',mimeType:'text/plain',bytes:Buffer.from('Notas de obra de ejemplo\nSegunda linea\n','utf8')},
 // A file the library must refuse: shows the per-file error path without touching anything.
 {id:'sandbox-instalador',name:'instalador.exe',mimeType:'application/x-msdownload',bytes:Buffer.from('MZ\u0090\u0000\u0003\u0000\u0000\u0000','latin1')},
];
export function sandboxDriveAdapter():FileImportAdapter{
 return{provider:'drive',mode:'sandbox',
  async list(){return SANDBOX.map(f=>({id:f.id,name:f.name,mimeType:f.mimeType,sizeBytes:f.bytes.length,modifiedAt:'2026-01-15T12:00:00.000Z'}));},
  async fetch(id){const f=SANDBOX.find(x=>x.id===id);if(!f)throw new ImportAdapterError('not_found');return{name:f.name,bytes:Buffer.from(f.bytes)};}};
}

// ---------------------------------------------------------------- live (Google Drive v3)
type Env=Record<string,string|undefined>;
const GOOGLE_FOLDER='application/vnd.google-apps.folder';
export function liveDriveAdapter(env:Env,fetchImpl:typeof fetch=fetch):FileImportAdapter{
 const id=env.GOOGLE_DRIVE_CLIENT_ID,secret=env.GOOGLE_DRIVE_CLIENT_SECRET,refresh=env.GOOGLE_DRIVE_REFRESH_TOKEN;
 if(!id||!secret||!refresh)throw new ImportAdapterError('not_configured');
 async function token(){
  const r=await fetchImpl('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:id!,client_secret:secret!,refresh_token:refresh!,grant_type:'refresh_token'}),signal:AbortSignal.timeout(15000)}).catch(()=>null);
  if(!r||!r.ok)throw new ImportAdapterError('unavailable');
  const data=z.object({access_token:z.string().min(1)}).safeParse(await r.json().catch(()=>null));if(!data.success)throw new ImportAdapterError('unavailable');return data.data.access_token;
 }
 return{provider:'drive',mode:'live',
  async list(){
   const t=await token(),url='https://www.googleapis.com/drive/v3/files?'+new URLSearchParams({pageSize:'50',orderBy:'modifiedTime desc',fields:'files(id,name,mimeType,size,modifiedTime)',q:`trashed=false and mimeType!='${GOOGLE_FOLDER}'`});
   const r=await fetchImpl(url,{headers:{Authorization:'Bearer '+t},signal:AbortSignal.timeout(15000)}).catch(()=>null);if(!r||!r.ok)throw new ImportAdapterError('unavailable');
   const data=z.object({files:z.array(z.object({id:z.string(),name:z.string(),mimeType:z.string(),size:z.string().optional(),modifiedTime:z.string()}).passthrough()).max(200)}).safeParse(await r.json().catch(()=>null));if(!data.success)throw new ImportAdapterError('unavailable');
   // Native Google Docs have no size (they must be exported): not importable here.
   return data.data.files.filter(f=>f.size!==undefined&&/^\d+$/.test(f.size)).map(f=>({id:f.id.slice(0,200),name:f.name.slice(0,200),mimeType:f.mimeType.slice(0,120),sizeBytes:Number(f.size),modifiedAt:f.modifiedTime}));
  },
  async fetch(fileId){
   if(!/^[A-Za-z0-9_-]{5,200}$/.test(fileId))throw new ImportAdapterError('not_found');
   const t=await token(),headers={Authorization:'Bearer '+t};
   const meta=await fetchImpl(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=name,size`,{headers,signal:AbortSignal.timeout(15000)}).catch(()=>null);
   if(!meta||meta.status===404)throw new ImportAdapterError('not_found');if(!meta.ok)throw new ImportAdapterError('unavailable');
   const info=z.object({name:z.string().min(1),size:z.string().regex(/^\d+$/).optional()}).safeParse(await meta.json().catch(()=>null));if(!info.success||info.data.size===undefined)throw new ImportAdapterError('not_found');
   if(Number(info.data.size)>PRO_FILE_MAX_BYTES)throw new ImportAdapterError('size');
   const r=await fetchImpl(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,{headers,signal:AbortSignal.timeout(60000)}).catch(()=>null);if(!r||!r.ok)throw new ImportAdapterError('unavailable');
   const bytes=Buffer.from(await r.arrayBuffer());if(bytes.length>PRO_FILE_MAX_BYTES)throw new ImportAdapterError('size');
   return{name:info.data.name.slice(0,160),bytes};
  }};
}
/** Sandbox unless PRO_DRIVE_IMPORT_MODE=live. Live without credentials throws not_configured (the route reports it, never falls back silently). */
export function driveImportAdapter(env:Env=process.env,fetchImpl?:typeof fetch):FileImportAdapter{
 return env.PRO_DRIVE_IMPORT_MODE==='live'?liveDriveAdapter(env,fetchImpl):sandboxDriveAdapter();
}
/** Deterministic ids for one item of one batch, so a retry of the same batch hits the same upload (idempotent) and never duplicates. */
export function importItemIds(batchId:string,externalId:string){
 const make=(label:string)=>{const h=createHash('sha256').update(`pro-import:${batchId}:${externalId}:${label}`).digest('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20,32)}`;};
 return{fileId:make('file'),actionId:make('action')};
}

// ---------------------------------------------------------------- API contracts
const id=z.string().uuid();
export const importInputSchema=z.object({action:z.literal('import'),source:z.literal('drive'),actionId:id,folderId:id.nullable(),items:z.array(z.object({externalId:z.string().min(1).max(200)}).strict()).min(1).max(IMPORT_BATCH_MAX)}).strict()
 .refine(v=>new Set(v.items.map(i=>i.externalId)).size===v.items.length);
export const importReasonSchema=z.enum(['type','size','empty','macro','not_found','not_configured','unavailable','invalid']);
export type ImportReason=z.infer<typeof importReasonSchema>;
export const importResultSchema=z.object({mode:z.enum(['sandbox','live']),results:z.array(z.object({externalId:z.string(),name:z.string(),ok:z.boolean(),fileId:z.string().nullable(),reason:importReasonSchema.nullable(),replayed:z.boolean()}).strict())}).strict();
export const importStateSchema=z.object({mode:z.enum(['sandbox','live']),configured:z.boolean(),candidates:z.array(importCandidateSchema).max(200),recent:z.array(z.object({itemKey:z.string(),name:z.string(),status:z.enum(['done','failed']),reason:importReasonSchema.nullable(),mode:z.string(),at:z.string()}).passthrough()).max(50)}).strict();
export function importReasonText(reason:ImportReason|null|undefined,en:boolean){
 switch(reason){
  case 'type':return en?'Format not accepted.':'Formato no aceptado.';
  case 'size':return en?'Larger than the allowed size or no space left.':'Pesa más de lo permitido o no hay espacio.';
  case 'not_found':return en?'It is no longer in the drive.':'Ya no está en la unidad.';
  case 'not_configured':return en?'The drive connection is not configured.':'La conexión con la unidad no está configurada.';
  case 'unavailable':return en?'The drive did not answer. Retry.':'La unidad no respondió. Reintente.';
  default:return en?'Could not import it.':'No se pudo importar.';
 }
}
