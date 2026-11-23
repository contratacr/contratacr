import {z} from 'zod';
import {enforceRateLimit} from '@/lib/rate-limit';
import {proActor,proBoundedJson,proDbError,proFail,proQuery,proRouteHeaders as headers,proSameOrigin} from '@/lib/pro/route-common';
import {organizerInputSchema,organizerPageSchema} from '@/lib/pro/round8';
import {PRO_DOC_PATH} from '@/lib/pro/file-formats';
import {PRO_ENABLED} from '@/lib/pro/enabled';

/**
 * Round 8: organizer of a job's files (folders, move, rename, favorites, trash/restore, search).
 * The uploaded files and their bytes stay in `work-files` (upload, versions and customer sharing
 * unchanged); this route only reads and writes the organizer metadata.
 */
const query=z.object({workId:z.string().trim().min(1).max(160),view:z.enum(['folder','favorites','trash','search']).default('folder'),folderId:z.string().uuid().optional(),q:z.string().max(80).optional()}).strict();
export async function GET(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 try{
  const a=await proActor(req);if(a.error)return a.error;const raw=proQuery(req);const parsed=raw&&query.safeParse(raw);if(!parsed||!parsed.success)return proFail(400,'Consulta inválida.');
  const q=parsed.data;const r=await a.db.rpc('pro_work_file_organizer_read',{p_actor:a.user.id,p_work:q.workId,p_view:q.view,p_folder:q.folderId??null,p_q:q.q??null});
  if(r.error)return proDbError(r.error,'Los archivos cambiaron.');
  if(!r.data)return proFail(404,'Carpeta no disponible.');
  // Ronda F2-D: storage used by the account (job files + library) next to the list.
  const quota=await a.db.rpc('pro_file_quota_read',{p_actor:a.user.id});
  return Response.json(organizerPageSchema.parse({...r.data,...quota.error||!quota.data?{}:{quota:quota.data}}),{headers});
 }catch{return proFail(503,'No se pudieron cargar los archivos.');}
}
export async function POST(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 if(!proSameOrigin(req))return proFail(403,'Origen no autorizado.');
 try{
  const a=await proActor(req);if(a.error)return a.error;const limited=await enforceRateLimit(req,'work-file-organizer-'+a.user.id,120,60000);if(limited)return limited;
  let input;try{input=organizerInputSchema.parse(await proBoundedJson(req,4096));}catch{return proFail(400,'Revise el nombre y la ubicación.');}
  const r=await a.db.rpc('pro_work_file_organizer_mutate',{p_actor:a.user.id,p_input:input});
  if(r.error){
   // Ronda F2-D: a file shared with the customer or with versions/comments/other uses is never deleted.
   if(r.error.hint==='pro_file_in_use')return Response.json({error:'Este archivo se usa en otra parte (compartido, versiones, comentarios u otro módulo). Se conserva en la papelera.',reason:'in_use'},{status:409,headers});
   return proDbError(r.error,'El archivo o la carpeta cambió. Recargue.');
  }
  // Permanent delete: the rows are gone; remove the stored bytes (private bucket). A failed removal
  // leaves an unreachable object (no row points to it), never a broken file in the list.
  const paths=z.object({objectPaths:z.array(z.string().regex(PRO_DOC_PATH)).max(500).optional()}).passthrough().parse(r.data).objectPaths??[];
  const own=paths.filter(path=>path.startsWith(a.user.id+'/'));
  if(own.length)await a.db.storage.from('pro-work-files').remove(own).catch(()=>null);
  return Response.json(r.data,{headers});
 }catch{return proFail(503,'No se pudo comprobar el cambio. Reintente: no se duplicará.');}
}
