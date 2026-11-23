import {enforceRateLimit} from '@/lib/rate-limit';
import {proActor,proBoundedJson,proDbError,proFail,proRequestOrigin,proRouteHeaders as headers,proSameOrigin} from '@/lib/pro/route-common';
import {libraryMemberGuard} from '@/lib/pro/company-folder-access';
import {ImportAdapterError,driveImportAdapter,importInputSchema,importResultSchema,importStateSchema,type ImportReason} from '@/lib/pro/file-import';
import {importItemIds} from '@/lib/pro/file-import-ids';
import {POST as libraryWrite} from '@/app/api/pro/company-files/route';
import {PRO_ENABLED} from '@/lib/pro/enabled';

/**
 * Ronda F2-E (row 31): import from an external drive into the company library. The adapter (sandbox by default, Google Drive v3 in
 * live mode with environment secrets) only lists and fetches bytes; every file goes through the normal library writer, so format
 * sniffing, quota, privacy and idempotency are exactly those of an upload. One receipt per file; a retry of the same batch
 * (same actionId) reuses the same file ids and never imports twice. A team member needs "edit" on the destination folder (row 31).
 */
function adapterOr(reason:()=>ReturnType<typeof driveImportAdapter>){try{return{adapter:reason()};}catch(error){return{error:error instanceof ImportAdapterError?error.code:'unavailable' as const};}}
export async function GET(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 try{
  const a=await proActor(req);if(a.error)return a.error;
  const denied=await libraryMemberGuard(a.db,a.user.id,{ownerOnly:true});if(denied)return denied;
  const made=adapterOr(()=>driveImportAdapter());const mode=process.env.PRO_DRIVE_IMPORT_MODE==='live'?'live' as const:'sandbox' as const;
  const recent=await a.db.rpc('pro_file_transfers_read',{p_actor:a.user.id,p_kind:'import',p_limit:20});if(recent.error)return proDbError(recent.error,'El historial cambió.');
  let candidates:Awaited<ReturnType<ReturnType<typeof driveImportAdapter>['list']>>=[],configured=!made.error;
  if(made.adapter){try{candidates=await made.adapter.list();}catch(error){configured=!(error instanceof ImportAdapterError&&error.code==='not_configured');if(!(error instanceof ImportAdapterError))throw error;return Response.json({error:'La unidad no respondió.',reason:error.code},{status:error.code==='not_configured'?409:502,headers});}}
  return Response.json(importStateSchema.parse({mode,configured,candidates,recent:(recent.data as {items:unknown[]}).items.map(x=>{const r=x as Record<string,unknown>;return{itemKey:r.itemKey,name:r.name,status:r.status,reason:r.reason,mode:r.mode,at:r.at};})}),{headers});
 }catch{return proFail(503,'No se pudo consultar la unidad.');}
}
export async function POST(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 if(!proSameOrigin(req))return proFail(403,'Origen no autorizado.');
 try{
  const a=await proActor(req);if(a.error)return a.error;
  const limited=await enforceRateLimit(req,'file-import-'+a.user.id,10,60000);if(limited)return limited;
  let input;try{input=importInputSchema.parse(await proBoundedJson(req,4096));}catch{return proFail(400,'Revise la selección (1 a 10 archivos).');}
  const denied=await libraryMemberGuard(a.db,a.user.id,input.folderId?{folders:[input.folderId],level:'edit'}:{ownerOnly:true});if(denied)return denied;
  if(input.folderId){const f=await a.db.from('pro_company_folders').select('id').eq('owner_id',a.user.id).eq('id',input.folderId).eq('archived',false).maybeSingle();if(f.error)return proFail(503,'No se pudo comprobar la carpeta.');if(!f.data)return proFail(404,'Carpeta no disponible.');}
  const made=adapterOr(()=>driveImportAdapter());if(made.error||!made.adapter)return Response.json({error:'La conexión con la unidad no está configurada.',reason:made.error??'not_configured'},{status:409,headers});
  const adapter=made.adapter,results:Array<{externalId:string;name:string;ok:boolean;fileId:string|null;reason:ImportReason|null;replayed:boolean}>=[];
  const record=async(externalId:string,name:string,ids:{fileId:string},ok:boolean,reason:ImportReason|null,file?:{sizeBytes:number;sha256:string})=>{
   // Transient failures leave no receipt: the same batch can be retried and recorded as what it finally was.
   if(reason==='unavailable'||reason==='not_configured')return null;
   const r=await a.db.rpc('pro_file_transfer_record',{p_actor:a.user.id,p_input:{actionId:input.actionId,itemKey:externalId,kind:'import',provider:'drive',mode:adapter.mode,scope:'company',workId:null,sourceFileId:null,targetFileId:ok?ids.fileId:null,name:name.slice(0,160)||'archivo',sizeBytes:file?.sizeBytes??null,sha256:file?file.sha256.slice(0,12):null,status:ok?'done':'failed',reason}});
   return r.error?null:(r.data as {replayed:boolean}).replayed;
  };
  for(const item of input.items){
   const ids=importItemIds(input.actionId,item.externalId);let name=item.externalId;
   try{
    const fetched=await adapter.fetch(item.externalId);name=fetched.name;
    const internal=new Request(new URL('/api/pro/company-files',req.url),{method:'POST',headers:{'content-type':'application/json',cookie:req.headers.get('cookie')??'',host:req.headers.get('host')??new URL(req.url).host,origin:proRequestOrigin(req),'x-pro-expected-actor':a.user.id},body:JSON.stringify({action:'upload',actionId:ids.actionId,fileId:ids.fileId,folderId:input.folderId,name:fetched.name.slice(0,160),data:fetched.bytes.toString('base64')})});
    const written=await libraryWrite(internal);
    if(written.status!==200){const body=await written.json().catch(()=>({}));const reason:ImportReason=written.status===413||written.status===429||(body as {reason?:string}).reason==='quota'?'size':written.status===400?'type':'unavailable';
     const replayed=await record(item.externalId,name,ids,false,reason);results.push({externalId:item.externalId,name,ok:false,fileId:null,reason,replayed:replayed===true});continue;}
    const done=await written.json() as {file?:{sizeBytes:number;sha256:string}};
    const replayed=await record(item.externalId,name,ids,true,null,done.file);
    results.push({externalId:item.externalId,name,ok:true,fileId:ids.fileId,reason:null,replayed:replayed===true});
   }catch(error){
    const reason:ImportReason=error instanceof ImportAdapterError?error.code:'unavailable';
    const replayed=await record(item.externalId,name,ids,false,reason).catch(()=>null);results.push({externalId:item.externalId,name,ok:false,fileId:null,reason,replayed:replayed===true});
   }
  }
  return Response.json(importResultSchema.parse({mode:adapter.mode,results}),{headers});
 }catch{return proFail(503,'No se pudo comprobar la importación. Reintente: no se duplicará.');}
}
