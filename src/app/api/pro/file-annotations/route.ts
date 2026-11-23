import {enforceRateLimit} from '@/lib/rate-limit';
import {proActor,proBoundedJson,proDbError,proFail,proQuery,proRouteHeaders as headers,proSameOrigin} from '@/lib/pro/route-common';
import {proWorkspaceMember} from '@/lib/pro/workspace-user';
import {annotationInputSchema,annotationQuerySchema,annotationCreateResultSchema,annotationsReadSchema} from '@/lib/pro/file-annotations';
import {PRO_ENABLED} from '@/lib/pro/enabled';
import {libraryMemberGuard} from '@/lib/pro/company-folder-access';

/**
 * Row 30 (Ronda F2-E): annotations (pin or note) on the files of a job and of the company library. They are private
 * comments of the team: customers never get a route that reads them. Append only (no edit, no delete), idempotent by
 * actionId. For the company library a team member needs "edit" on the folder (row 31, migration 416): without it, 403.
 */
export async function GET(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 try{
  const a=await proActor(req);if(a.error)return a.error;
  const raw=proQuery(req),parsed=raw?annotationQuerySchema.safeParse(raw):null;if(!parsed||!parsed.success)return proFail(400,'Consulta inválida.');const q=parsed.data;
  if(q.scope==='company'){const denied=await libraryMemberGuard(a.db,a.user.id,{files:[q.fileId],level:'view'});if(denied)return denied;}
  const r=await a.db.rpc('pro_file_annotations_read',{p_actor:a.user.id,p_scope:q.scope,p_file:q.fileId,p_work:q.scope==='work'?q.workId:null});
  if(r.error)return proDbError(r.error,'Las anotaciones cambiaron. Recargue.');if(!r.data)return proFail(404,'Archivo no disponible.');
  return Response.json(annotationsReadSchema.parse(r.data),{headers});
 }catch{return proFail(503,'No se pudieron cargar las anotaciones.');}
}
export async function POST(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 if(!proSameOrigin(req))return proFail(403,'Origen no autorizado.');
 try{
  const a=await proActor(req);if(a.error)return a.error;
  const limited=await enforceRateLimit(req,'file-annotations-'+a.user.id,60,60000);if(limited)return limited;
  let input;try{input=annotationInputSchema.parse(await proBoundedJson(req,4096));}catch{return proFail(400,'Revise la anotación (1 a 1000 caracteres, posición dentro de la página).');}
  if(input.scope==='company'){const denied=await libraryMemberGuard(a.db,a.user.id,{files:[input.fileId],level:'edit'});if(denied)return denied;}
  const member=await proWorkspaceMember();
  const r=await a.db.rpc('pro_file_annotation_create',{p_actor:a.user.id,p_member:member?.memberId??null,p_input:input});
  if(r.error)return proDbError(r.error,'No se pudo guardar la anotación. Revise el archivo.');
  return Response.json(annotationCreateResultSchema.parse(r.data),{headers});
 }catch{return proFail(503,'No se pudo comprobar el guardado. Reintente: no se duplicará.');}
}
