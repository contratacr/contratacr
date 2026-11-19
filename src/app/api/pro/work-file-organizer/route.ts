import {z} from 'zod';
import {enforceRateLimit} from '@/lib/rate-limit';
import {proActor,proBoundedJson,proDbError,proFail,proQuery,proRouteHeaders as headers,proSameOrigin} from '@/lib/pro/route-common';
import {organizerInputSchema,organizerPageSchema} from '@/lib/pro/round8';

/**
 * Round 8: organizer of a job's files (folders, move, rename, favorites, trash/restore, search).
 * The uploaded files and their bytes stay in `work-files` (upload, versions and customer sharing
 * unchanged); this route only reads and writes the organizer metadata.
 */
const query=z.object({workId:z.string().trim().min(1).max(160),view:z.enum(['folder','favorites','trash','search']).default('folder'),folderId:z.string().uuid().optional(),q:z.string().max(80).optional()}).strict();
export async function GET(req:Request){
 if(process.env.NODE_ENV!=='development')return new Response(null,{status:404,headers});
 try{
  const a=await proActor(req);if(a.error)return a.error;const raw=proQuery(req);const parsed=raw&&query.safeParse(raw);if(!parsed||!parsed.success)return proFail(400,'Consulta inválida.');
  const q=parsed.data;const r=await a.db.rpc('pro_work_file_organizer_read',{p_actor:a.user.id,p_work:q.workId,p_view:q.view,p_folder:q.folderId??null,p_q:q.q??null});
  if(r.error)return proDbError(r.error,'Los archivos cambiaron.');
  return r.data?Response.json(organizerPageSchema.parse(r.data),{headers}):proFail(404,'Carpeta no disponible.');
 }catch{return proFail(503,'No se pudieron cargar los archivos.');}
}
export async function POST(req:Request){
 if(process.env.NODE_ENV!=='development')return new Response(null,{status:404,headers});
 if(!proSameOrigin(req))return proFail(403,'Origen no autorizado.');
 try{
  const a=await proActor(req);if(a.error)return a.error;const limited=await enforceRateLimit(req,'work-file-organizer-'+a.user.id,120,60000);if(limited)return limited;
  let input;try{input=organizerInputSchema.parse(await proBoundedJson(req,4096));}catch{return proFail(400,'Revise el nombre y la ubicación.');}
  const r=await a.db.rpc('pro_work_file_organizer_mutate',{p_actor:a.user.id,p_input:input});if(r.error)return proDbError(r.error,'El archivo o la carpeta cambió. Recargue.');
  return Response.json(r.data,{headers});
 }catch{return proFail(503,'No se pudo comprobar el cambio. Reintente: no se duplicará.');}
}
