import {z} from 'zod';
import {enforceRateLimit} from '@/lib/rate-limit';
import {proActor,proBoundedJson,proDbError,proFail,proRouteHeaders as headers,proSameOrigin} from '@/lib/pro/route-common';
import {proWorkspaceMember} from '@/lib/pro/workspace-user';
import {workBulkInputSchema,bulkResultSchema} from '@/lib/pro/file-bulk';
import {PRO_DOC_PATH} from '@/lib/pro/file-formats';
import {PRO_ENABLED} from '@/lib/pro/enabled';

/**
 * Ronda F2-E (row 29): bulk operations on the files of a job (move, favorites, trash, restore and permanent delete),
 * 1 to 50 files per call. Wraps the existing organizer writer item by item; each item has its own result and a replay
 * of the same batch returns the stored receipts. Permanent delete is for the account owner only (a team member
 * working in the company gets 403) and follows the strict rule of the single delete: never shared, no versions,
 * comments or other uses. The bytes are removed after the rows are gone.
 */
export async function POST(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 if(!proSameOrigin(req))return proFail(403,'Origen no autorizado.');
 try{
  const a=await proActor(req);if(a.error)return a.error;const limited=await enforceRateLimit(req,'work-file-bulk-'+a.user.id,30,60000);if(limited)return limited;
  let input;try{input=workBulkInputSchema.parse(await proBoundedJson(req,8192));}catch{return proFail(400,'Revise la selección de archivos.');}
  if(input.action==='purge'&&await proWorkspaceMember())return proFail(403,'Solo la cuenta principal puede eliminar archivos definitivamente.');
  const r=await a.db.rpc('pro_work_files_bulk',{p_actor:a.user.id,p_input:input});
  if(r.error)return proDbError(r.error,'Los archivos cambiaron. Recargue.');
  const paths=z.object({objectPaths:z.array(z.string().regex(PRO_DOC_PATH)).max(100).optional()}).passthrough().parse(r.data).objectPaths??[];
  const own=paths.filter(path=>path.startsWith(a.user.id+'/'));
  if(own.length)await a.db.storage.from('pro-work-files').remove(own).catch(()=>null);
  return Response.json(bulkResultSchema.parse(r.data),{headers});
 }catch{return proFail(503,'No se pudo comprobar el cambio. Reintente: no se duplicará.');}
}
