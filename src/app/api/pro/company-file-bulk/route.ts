import {z} from 'zod';
import {enforceRateLimit} from '@/lib/rate-limit';
import {proActor,proBoundedJson,proDbError,proFail,proRouteHeaders as headers,proSameOrigin} from '@/lib/pro/route-common';
import {proWorkspaceMember} from '@/lib/pro/workspace-user';
import {companyBulkInputSchema,bulkResultSchema} from '@/lib/pro/file-bulk';
import {PRO_DOC_PATH} from '@/lib/pro/file-formats';
import {PRO_ENABLED} from '@/lib/pro/enabled';

/**
 * Ronda F2-E (row 29): bulk operations on the company library (move, favorites, archive, restore, add or remove tags and
 * permanent delete), 1 to 50 files per call. Owner only: a team member working in the company gets 403 (the
 * library is private to the owner; folder grants of /api/pro/company-folder-access give members view or edit of one folder, never bulk or permanent delete).
 * Permanent delete takes only archived files that were never used (copied into a job, used in a daily log or a proposal,
 * several versions, annotations); the others are kept and reported. One immutable receipt per batch.
 */
export async function POST(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 if(!proSameOrigin(req))return proFail(403,'Origen no autorizado.');
 try{
  const a=await proActor(req);if(a.error)return a.error;
  if(await proWorkspaceMember())return proFail(403,'Las operaciones masivas de la biblioteca son solo de la cuenta principal.');
  const limited=await enforceRateLimit(req,'company-file-bulk-'+a.user.id,30,60000);if(limited)return limited;
  let input;try{input=companyBulkInputSchema.parse(await proBoundedJson(req,8192));}catch{return proFail(400,'Revise la selección de archivos.');}
  const r=await a.db.rpc('pro_company_files_bulk',{p_actor:a.user.id,p_input:input});
  if(r.error)return proDbError(r.error,'Los archivos cambiaron. Recargue.');
  const paths=z.object({objectPaths:z.array(z.string().regex(PRO_DOC_PATH)).max(100).optional()}).passthrough().parse(r.data).objectPaths??[];
  const own=paths.filter(path=>path.startsWith(a.user.id+'/'));
  if(own.length)await a.db.storage.from('pro-company-files').remove(own).catch(()=>null);
  return Response.json(bulkResultSchema.parse(r.data),{headers});
 }catch{return proFail(503,'No se pudo comprobar el cambio. Reintente: no se duplicará.');}
}
