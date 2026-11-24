import {Buffer} from 'node:buffer';
import {createHash} from 'node:crypto';
import {enforceRateLimit} from '@/lib/rate-limit';
import {ProBodyError,proActor,proBoundedForm,proBoundedJson,proFail,proQuery,proRouteHeaders as responseHeaders,proSameOrigin} from '@/lib/pro/route-common';
import {leadFileDownloadQuerySchema,leadFileRemoveSchema,leadFilesQuerySchema,leadFilesSchema,leadFilePurposes,LEAD_FILE_LIMIT} from '@/lib/pro/lead-work';
import {leadAnchorExists} from '@/lib/pro/lead-work-server';
import {ProDocRejected,proDocRejectedMessage,sniffProDocument} from '@/lib/pro/file-sniff';
import {PRO_FILE_MAX_BYTES} from '@/lib/pro/file-limit';
import {PRO_ENABLED} from '@/lib/pro/enabled';
import {z} from 'zod';

/**
 * Leads area: files and photos, plans (takeoff uploads) and uploaded estimates of a lead. Private bucket
 * pro-lead-files; bytes are sniffed on the server and only served back by this route as an attachment (never a public or
 * signed URL). Upload is idempotent by the client id. Nothing is sent to the customer.
 */
const bucket='pro-lead-files',headers={...responseHeaders,'Referrer-Policy':'no-referrer'};
const cols='id,purpose,name,mime_type,size_bytes,created_at,object_path';
type Row={id:string;purpose:'file'|'plan'|'estimate';name:string;mime_type:string;size_bytes:number;created_at:string;object_path:string};
const view=(kind:'manual'|'request',leadId:string,rows:Row[])=>leadFilesSchema.parse({kind,leadId,items:rows.map(r=>({id:r.id,purpose:r.purpose,name:r.name,mimeType:r.mime_type,sizeBytes:r.size_bytes,createdAt:r.created_at}))});
const digest=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const uploadFields=z.object({kind:z.enum(['manual','request']),leadId:z.string().uuid(),id:z.string().uuid(),purpose:z.enum(leadFilePurposes)}).strict();
async function list(db:Awaited<ReturnType<typeof proActor>> extends infer T?T extends {db:infer D}?D:never:never,owner:string,leadId:string){
 const r=await db.from('pro_lead_files').select(cols).eq('owner_id',owner).eq('lead_id',leadId).order('created_at',{ascending:false}).order('id',{ascending:false}).limit(LEAD_FILE_LIMIT);if(r.error)throw Error();return r.data as Row[];
}
export async function GET(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 try{
  const a=await proActor(req);if(a.error)return a.error;const raw=proQuery(req);if(!raw)return proFail(400,'Consulta inválida.');
  if(raw.fileId!==undefined){
   const q=leadFileDownloadQuerySchema.safeParse(raw);if(!q.success)return proFail(400,'Archivo inválido.');
   const access=await a.db.rpc('pro_request_pipeline_owner',{p_actor:a.user.id});if(access.error)return proFail(403,'Sin acceso.');
   const row=await a.db.from('pro_lead_files').select(cols+',sha256').eq('owner_id',a.user.id).eq('id',q.data.fileId).maybeSingle();if(row.error)throw Error();if(!row.data)return proFail(404,'Archivo no disponible.');
   const m=row.data as unknown as Row&{sha256:string},file=await a.db.storage.from(bucket).download(m.object_path);
   if(file.error||!file.data)return proFail(503,'No se pudo abrir el archivo.');
   const bytes=new Uint8Array(await file.data.arrayBuffer());if(bytes.length!==m.size_bytes||digest(bytes)!==m.sha256)return proFail(503,'No se pudo comprobar el archivo.');
   const encoded=encodeURIComponent(m.name).replace(/[!'()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase());
   return new Response(bytes,{headers:{...headers,'Content-Type':m.mime_type,'Content-Length':String(bytes.length),'Content-Disposition':`attachment; filename="file"; filename*=UTF-8''${encoded}`,'Content-Security-Policy':"sandbox; default-src 'none'; frame-ancestors 'none'",'Cross-Origin-Resource-Policy':'same-origin','X-Frame-Options':'DENY'}});
  }
  const q=leadFilesQuerySchema.safeParse(raw);if(!q.success)return proFail(400,'Consulta inválida.');
  const access=await leadAnchorExists(a.db,a.user.id,q.data.kind,q.data.leadId);if(access==='forbidden')return proFail(403,'Sin acceso.');if(access==='missing')return proFail(404,'Solicitud no disponible.');
  return Response.json(view(q.data.kind,q.data.leadId,await list(a.db,a.user.id,q.data.leadId)),{headers});
 }catch{return proFail(503,'No se pudieron cargar los archivos.');}
}
export async function POST(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 if(!proSameOrigin(req))return proFail(403,'Origen no autorizado.');
 try{
  const a=await proActor(req);if(a.error)return a.error;const limited=await enforceRateLimit(req,'lead-files-'+a.user.id,30,60000);if(limited)return limited;
  const owner=a.user.id;
  if(req.headers.get('content-type')?.toLowerCase().startsWith('application/json')){
   let input;try{input=leadFileRemoveSchema.parse(await proBoundedJson(req,1024));}catch{return proFail(400,'Archivo inválido.');}
   const access=await leadAnchorExists(a.db,owner,input.kind,input.leadId);if(access==='forbidden')return proFail(403,'Sin acceso.');if(access==='missing')return proFail(404,'Solicitud no disponible.');
   const row=await a.db.from('pro_lead_files').select('object_path').eq('owner_id',owner).eq('lead_id',input.leadId).eq('id',input.id).maybeSingle();if(row.error)throw Error();
   if(row.data){
    const del=await a.db.from('pro_lead_files').delete().eq('owner_id',owner).eq('id',input.id);if(del.error)throw Error();
    await a.db.storage.from(bucket).remove([row.data.object_path]);
   }
   return Response.json(view(input.kind,input.leadId,await list(a.db,owner,input.leadId)),{headers});
  }
  let form:FormData;try{form=await proBoundedForm(req,{maxBytes:PRO_FILE_MAX_BYTES+65536,maxFiles:1,maxFileBytes:PRO_FILE_MAX_BYTES,fields:['kind','leadId','id','purpose','file']});}catch(error){return proFail(error instanceof ProBodyError?error.status:400,error instanceof ProBodyError&&error.reason==='too_large'?'El archivo pesa más de 20 MB.':'Archivo inválido.');}
  const file=form.get('file');if(!(file instanceof File))return proFail(400,'Elija un archivo.');
  let meta;try{meta=uploadFields.parse({kind:form.get('kind'),leadId:form.get('leadId'),id:form.get('id'),purpose:form.get('purpose')});}catch{return proFail(400,'Archivo inválido.');}
  const access=await leadAnchorExists(a.db,owner,meta.kind,meta.leadId);if(access==='forbidden')return proFail(403,'Sin acceso.');if(access==='missing')return proFail(404,'Solicitud no disponible.');
  const exists=await a.db.from('pro_lead_files').select('id').eq('owner_id',owner).eq('id',meta.id).maybeSingle();if(exists.error)throw Error();
  if(!exists.data){
   const count=await a.db.from('pro_lead_files').select('id',{count:'exact',head:true}).eq('owner_id',owner).eq('lead_id',meta.leadId);if(count.error)throw Error();if((count.count??0)>=LEAD_FILE_LIMIT)return proFail(429,'Esta solicitud ya tiene el máximo de archivos.');
   let sniffed;try{sniffed=await sniffProDocument(Buffer.from(await file.arrayBuffer()),file.name);}catch(error){return proFail(400,error instanceof ProDocRejected?proDocRejectedMessage(error):'Formato de archivo no admitido.');}
   const name=file.name.replace(/[\u0000-\u001f\u007f/\\]/g,'').trim().slice(0,160)||'archivo',path=`${owner}/${meta.leadId}/${meta.id}`;
   const stored=await a.db.storage.from(bucket).upload(path,sniffed.bytes,{contentType:sniffed.mimeType,upsert:true});if(stored.error)return proFail(503,'No se pudo guardar el archivo. Reintente: no se duplicará.');
   const ins=await a.db.from('pro_lead_files').insert({owner_id:owner,id:meta.id,kind:meta.kind,lead_id:meta.leadId,manual_id:meta.kind==='manual'?meta.leadId:null,request_id:meta.kind==='request'?meta.leadId:null,purpose:meta.purpose,name,mime_type:sniffed.mimeType,size_bytes:sniffed.bytes.length,sha256:digest(sniffed.bytes),object_path:path});
   if(ins.error&&ins.error.code!=='23505')return proFail(503,'No se pudo guardar el archivo. Reintente: no se duplicará.');
  }
  return Response.json(view(meta.kind,meta.leadId,await list(a.db,owner,meta.leadId)),{headers});
 }catch{return proFail(503,'No se pudo comprobar el guardado. Reintente: no se duplicará.');}
}
