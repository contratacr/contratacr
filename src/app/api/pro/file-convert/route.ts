import {createHash} from 'node:crypto';
import {enforceRateLimit} from '@/lib/rate-limit';
import {proActor,proBoundedJson,proFail,proRequestOrigin,proRouteHeaders as headers,proSameOrigin} from '@/lib/pro/route-common';
import {libraryMemberGuard} from '@/lib/pro/company-folder-access';
import {ConvertError,convertInputSchema,convertResultSchema,isOfficeMime,officeConverter} from '@/lib/pro/file-convert';
import {POST as libraryWrite} from '@/app/api/pro/company-files/route';
import {POST as workWrite} from '@/app/api/pro/work-files/route';
import {PRO_ENABLED} from '@/lib/pro/enabled';

/**
 * Ronda F2-E (row 28): "Convert to PDF" for Word, Excel and PowerPoint files of a job or of the company library. The converter is an
 * adapter: simulated by default (a labelled placeholder PDF, NOT a real conversion) or an external service in "service" mode
 * (environment secrets). The result is a NEW file next to the original (the original is never changed), saved through the normal
 * writer (sniffing, quota, privacy), with one immutable receipt that records which mode produced it. Idempotent by actionId.
 */
const digest=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
export async function POST(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 if(!proSameOrigin(req))return proFail(403,'Origen no autorizado.');
 try{
  const a=await proActor(req);if(a.error)return a.error;
  const limited=await enforceRateLimit(req,'file-convert-'+a.user.id,20,60000);if(limited)return limited;
  let input;try{input=convertInputSchema.parse(await proBoundedJson(req,2048));}catch{return proFail(400,'Revise la conversión.');}
  if(input.scope==='company'){const denied=await libraryMemberGuard(a.db,a.user.id,{files:[input.fileId],level:'edit'});if(denied)return denied;}
  // Source row (owner scoped) and its bytes, checked against the stored hash and size.
  const source=input.scope==='company'
   ?await a.db.from('pro_company_files').select('name,mime_type,object_path,sha256,size_bytes,folder_id,ready').eq('owner_id',a.user.id).eq('id',input.fileId).maybeSingle()
   :await a.db.from('pro_work_files').select('name,mime_type,object_path,sha256,size_bytes,ready').eq('owner_id',a.user.id).eq('work_id',input.workId).eq('id',input.fileId).maybeSingle();
  if(source.error)return proFail(503,'No se pudo leer el archivo.');const row=source.data as {name:string;mime_type:string;object_path:string;sha256:string;size_bytes:number;folder_id?:string|null;ready:boolean}|null;
  if(!row||!row.ready)return proFail(404,'Archivo no disponible.');
  if(!isOfficeMime(row.mime_type))return proFail(400,'Solo se convierten archivos de Word, Excel o PowerPoint.');
  const done=await a.db.rpc('pro_file_transfers_read',{p_actor:a.user.id,p_kind:'convert',p_limit:50});if(done.error)return proFail(503,'No se pudo comprobar el historial.');
  const prior=(done.data as {items:Array<{actionId:string;itemKey:string;status:string;targetFileId:string|null;name:string;mode:'simulated'|'service'}>}).items.find(r=>r.actionId===input.actionId&&r.itemKey===input.fileId);
  if(prior?.status==='done'&&prior.targetFileId)return Response.json(convertResultSchema.parse({mode:prior.mode,fileId:prior.targetFileId,name:prior.name,simulated:prior.mode==='simulated',replayed:true}),{headers});
  const object=await a.db.storage.from(input.scope==='company'?'pro-company-files':'pro-work-files').download(row.object_path);
  if(object.error||!object.data)return proFail(503,'No se pudo leer el archivo.');const bytes=Buffer.from(await object.data.arrayBuffer());
  if(bytes.length!==row.size_bytes||digest(bytes)!==row.sha256)return proFail(503,'El archivo almacenado no coincide.');
  let converter;try{converter=officeConverter(process.env,undefined,req.headers.get('accept-language')?.toLowerCase().startsWith('en')??false);}catch(error){return Response.json({error:'El servicio de conversión no está configurado.',reason:error instanceof ConvertError?error.code:'not_configured'},{status:409,headers});}
  let pdf:Buffer;try{pdf=await converter.convert({name:row.name,mimeType:row.mime_type,bytes});}catch(error){return Response.json({error:'No se pudo convertir el archivo.',reason:error instanceof ConvertError?error.code:'unavailable'},{status:error instanceof ConvertError&&error.code==='invalid'?400:502,headers});}
  const base=row.name.replace(/\.[^.]+$/,'').slice(0,120),name=(converter.mode==='simulated'?`${base} (vista simulada).pdf`:`${base}.pdf`).slice(0,160);
  const common={'content-type':'application/json',cookie:req.headers.get('cookie')??'',host:req.headers.get('host')??new URL(req.url).host,origin:proRequestOrigin(req),'x-pro-expected-actor':a.user.id};
  const written=input.scope==='company'
   ?await libraryWrite(new Request(new URL('/api/pro/company-files',req.url),{method:'POST',headers:common,body:JSON.stringify({action:'upload',actionId:input.actionId,fileId:input.targetFileId,folderId:row.folder_id??null,name,data:pdf.toString('base64')})}))
   :await workWrite(new Request(new URL('/api/pro/work-files',req.url),{method:'POST',headers:common,body:JSON.stringify({action:'upload',workId:input.workId,fileId:input.targetFileId,name,data:pdf.toString('base64')})}));
  if(written.status!==200){const body=await written.json().catch(()=>({})) as {reason?:string};return Response.json({error:'No se pudo guardar el PDF.',reason:body.reason==='quota'?'size':'invalid'},{status:written.status===429?429:400,headers});}
  const file=(await written.json() as {file?:{sizeBytes:number;sha256:string}}).file;
  const receipt=await a.db.rpc('pro_file_transfer_record',{p_actor:a.user.id,p_input:{actionId:input.actionId,itemKey:input.fileId,kind:'convert',provider:'office',mode:converter.mode,scope:input.scope,workId:input.scope==='work'?input.workId:null,sourceFileId:input.fileId,targetFileId:input.targetFileId,name,sizeBytes:file?.sizeBytes??pdf.length,sha256:(file?.sha256??digest(pdf)).slice(0,12),status:'done',reason:null}});
  if(receipt.error)return proFail(503,'El PDF se guardó, pero no se pudo registrar. Reintente: no se duplicará.');
  return Response.json(convertResultSchema.parse({mode:converter.mode,fileId:input.targetFileId,name,simulated:converter.mode==='simulated',replayed:(receipt.data as {replayed:boolean}).replayed}),{headers});
 }catch{return proFail(503,'No se pudo comprobar la conversión. Reintente: no se duplicará.');}
}
