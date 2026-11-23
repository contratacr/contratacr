import {z} from 'zod';
import {enforceRateLimit} from '@/lib/rate-limit';
import {COMPANY_FILE_VERSIONS_BODY_MAX,companyFileFamilySchema,companyFileVersionIndexSchema,companyFileVersionMutationSchema,companyFileVersionQuerySchema,companyFileVersionResultSchema} from '@/lib/pro/company-file-versions';
import {proActor,proBoundedJson,proDbError,proFail,proQuery,proRouteHeaders,proSameOrigin} from '@/lib/pro/route-common';
import {PRO_ENABLED} from '@/lib/pro/enabled';
import {libraryMemberGuard} from '@/lib/pro/company-folder-access';

// Row 30: versions of company library files (owner only, development only). Uploading the bytes
// uses /api/pro/company-files; this route attaches, lists and restores versions. Never shared.
const conflict='Las versiones cambiaron. Actualice antes de continuar.';
export async function GET(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers:proRouteHeaders});
 try{
  const a=await proActor(req);if(a.error)return a.error;{const denied=await libraryMemberGuard(a.db,a.user.id,{ownerOnly:true});if(denied)return denied;}
  const raw=proQuery(req);if(!raw)return proFail(400,'Consulta inválida.');
  const parsed=companyFileVersionQuerySchema.safeParse(raw);if(!parsed.success)return proFail(400,'Consulta inválida.');
  if('files' in parsed.data){
   const ids=parsed.data.files?parsed.data.files.split(','):[];if(ids.length>20||!ids.every(value=>z.string().uuid().safeParse(value).success)||new Set(ids).size!==ids.length)return proFail(400,'Consulta inválida.');
   const result=await a.db.rpc('pro_company_file_versions_index',{p_actor:a.user.id,p_files:ids});if(result.error)return proDbError(result.error,conflict);
   return Response.json(companyFileVersionIndexSchema.parse(result.data),{headers:proRouteHeaders});
  }
  const result=await a.db.rpc('pro_company_file_versions_read',{p_actor:a.user.id,p_file:parsed.data.fileId});if(result.error)return proDbError(result.error,conflict);
  return result.data?Response.json(companyFileFamilySchema.parse(result.data),{headers:proRouteHeaders}):proFail(404,'Archivo no disponible.');
 }catch{return proFail(503,'No se pudieron cargar las versiones. Reintente.');}
}
export async function POST(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers:proRouteHeaders});
 if(!proSameOrigin(req))return proFail(403,'Origen no autorizado.');
 try{
  const a=await proActor(req);if(a.error)return a.error;{const denied=await libraryMemberGuard(a.db,a.user.id,{ownerOnly:true});if(denied)return denied;}
  const limited=await enforceRateLimit(req,'company-file-versions-'+a.user.id,60,60000);if(limited)return limited;
  let input;try{input=companyFileVersionMutationSchema.parse(await proBoundedJson(req,COMPANY_FILE_VERSIONS_BODY_MAX));}catch(cause){return proFail(cause instanceof RangeError?413:400,'Revise los datos de la versión.');}
  const result=await a.db.rpc('pro_company_file_versions_mutate',{p_actor:a.user.id,p_input:input});
  if(result.error)return proDbError(result.error,conflict);
  return Response.json(companyFileVersionResultSchema.parse(result.data),{headers:proRouteHeaders});
 }catch{return proFail(503,'No se pudo comprobar la versión. Reintente la misma operación.');}
}
