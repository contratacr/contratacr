import {z} from 'zod';
import {enforceRateLimit} from '@/lib/rate-limit';
import {proActor,proBoundedJson,proDbError,proFail,proQuery,proRouteHeaders as headers,proSameOrigin} from '@/lib/pro/route-common';
import {proWorkspaceMember} from '@/lib/pro/workspace-user';
import {purgeInputSchema,purgeQuerySchema,purgeResultSchema,purgeStateSchema} from '@/lib/pro/file-bulk';
import {PRO_DOC_PATH} from '@/lib/pro/file-formats';
import {PRO_ENABLED} from '@/lib/pro/enabled';

/**
 * Ronda F2-E (row 29): explicit purge of what expired (30 days in the trash or archive) for one job or for the
 * company library, plus permanent delete of one library trash entry. Nothing runs by itself: the owner reads the
 * preview (GET), confirms, and gets an immutable receipt (POST). Owner only. Never deletes a file that was
 * shared or used; those stay in the trash and are counted in the receipt.
 */
export async function GET(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 try{
  const a=await proActor(req);if(a.error)return a.error;if(await proWorkspaceMember())return proFail(403,'Solo la cuenta principal puede purgar la papelera.');
  const raw=proQuery(req);const parsed=raw&&purgeQuerySchema.safeParse(raw);if(!parsed||!parsed.success)return proFail(400,'Consulta inválida.');const q=parsed.data;
  const preview=await a.db.rpc('pro_file_purge_preview',{p_actor:a.user.id,p_scope:q.scope,p_work:q.workId??null});if(preview.error)return proDbError(preview.error,'La papelera cambió.');if(!preview.data)return proFail(404,'Trabajo no disponible.');
  const receipts=await a.db.rpc('pro_file_purge_receipts_read',{p_actor:a.user.id,p_scope:q.scope,p_work:q.workId??null});if(receipts.error)return proDbError(receipts.error,'La papelera cambió.');
  return Response.json(purgeStateSchema.parse({preview:preview.data,receipts:(receipts.data as {items:unknown[]}).items}),{headers});
 }catch{return proFail(503,'No se pudo cargar la papelera.');}
}
export async function POST(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 if(!proSameOrigin(req))return proFail(403,'Origen no autorizado.');
 try{
  const a=await proActor(req);if(a.error)return a.error;if(await proWorkspaceMember())return proFail(403,'Solo la cuenta principal puede purgar la papelera.');
  const limited=await enforceRateLimit(req,'file-purge-'+a.user.id,10,60000);if(limited)return limited;
  let input;try{input=purgeInputSchema.parse(await proBoundedJson(req,2048));}catch{return proFail(400,'Confirme la eliminación definitiva.');}
  const {scope,...rest}=input;
  const r=input.scope==='work'
   ?await a.db.rpc('pro_work_files_purge_expired',{p_actor:a.user.id,p_input:rest})
   :await a.db.rpc('pro_company_purge',{p_actor:a.user.id,p_input:rest});
  if(r.error)return proDbError(r.error,'La papelera cambió. Actualice y revise de nuevo.');
  const data=z.object({objectPaths:z.array(z.string().regex(PRO_DOC_PATH)).max(5000).default([])}).passthrough().parse(r.data);
  const own=data.objectPaths.filter(path=>path.startsWith(a.user.id+'/'));
  const bucket=a.db.storage.from(scope==='work'?'pro-work-files':'pro-company-files');
  // Storage removes in chunks; a failed chunk leaves an unreachable object (no row points to it), never a broken file.
  for(let at=0;at<own.length;at+=100)await bucket.remove(own.slice(at,at+100)).catch(()=>null);
  return Response.json(purgeResultSchema.parse({receipt:(r.data as {receipt:unknown}).receipt,replayed:(r.data as {replayed?:boolean}).replayed}),{headers});
 }catch{return proFail(503,'No se pudo comprobar el cambio. Reintente: no se duplicará.');}
}
