import {enforceRateLimit} from '@/lib/rate-limit';
import {proActor,proBoundedJson,proDbError,proFail,proQuery,proRouteHeaders as headers,proSameOrigin} from '@/lib/pro/route-common';
import {companyFileTagsInputSchema,companyFileTagsQuerySchema,companyFileTagsReadSchema,companyFileTagsResultSchema} from '@/lib/pro/company-file-tags';
import {PRO_ENABLED} from '@/lib/pro/enabled';
import {libraryMemberGuard} from '@/lib/pro/company-folder-access';

/**
 * Ronda F2-D (row 31): tags of the company library (templates, manuals, permits and custom ones).
 * Owner only, development only, like /api/pro/company-files. Only metadata: bytes never pass here.
 */
export async function GET(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 try{
  const a=await proActor(req);if(a.error)return a.error;{const denied=await libraryMemberGuard(a.db,a.user.id,{ownerOnly:true});if(denied)return denied;}const raw=proQuery(req);const parsed=raw&&companyFileTagsQuerySchema.safeParse(raw);if(!parsed||!parsed.success)return proFail(400,'Consulta inválida.');
  const r=await a.db.rpc('pro_company_file_tags_read',{p_actor:a.user.id,p_tag:parsed.data.tag??null});if(r.error)return proDbError(r.error,'Las etiquetas cambiaron.');
  return Response.json(companyFileTagsReadSchema.parse(r.data),{headers});
 }catch{return proFail(503,'No se pudieron cargar las etiquetas.');}
}
export async function POST(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 if(!proSameOrigin(req))return proFail(403,'Origen no autorizado.');
 try{
  const a=await proActor(req);if(a.error)return a.error;{const denied=await libraryMemberGuard(a.db,a.user.id,{ownerOnly:true});if(denied)return denied;}const limited=await enforceRateLimit(req,'company-file-tags-'+a.user.id,60,60000);if(limited)return limited;
  let input;try{input=companyFileTagsInputSchema.parse(await proBoundedJson(req,4096));}catch{return proFail(400,'Revise las etiquetas.');}
  const r=await a.db.rpc('pro_company_file_tags_mutate',{p_actor:a.user.id,p_input:input});if(r.error)return proDbError(r.error,'El archivo cambió. Recargue.');
  return Response.json(companyFileTagsResultSchema.parse(r.data),{headers});
 }catch{return proFail(503,'No se pudo comprobar el cambio. Reintente: no se duplicará.');}
}
