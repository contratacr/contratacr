import {enforceRateLimit} from '@/lib/rate-limit';
import {proActor,proBoundedJson,proDbError,proFail,proQuery,proRouteHeaders as headers,proSameOrigin} from '@/lib/pro/route-common';
import {companyTrashInputSchema,companyTrashPageSchema} from '@/lib/pro/round9';
import {PRO_ENABLED} from '@/lib/pro/enabled';

/**
 * Round 9: recursive trash/restore of company library folders (pro_company_trash_*). A folder goes to
 * the trash with all its contents; restoring brings back exactly what that step took. Nothing is deleted.
 * Through the role gate: GET read, POST company.write (company-*).
 */
export async function GET(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 try{
  const a=await proActor(req);if(a.error)return a.error;const raw=proQuery(req);if(!raw||Object.keys(raw).length)return proFail(400,'Consulta inválida.');
  const r=await a.db.rpc('pro_company_trash_read',{p_actor:a.user.id});if(r.error)return proDbError(r.error,'La papelera cambió.');
  return Response.json(companyTrashPageSchema.parse(r.data),{headers});
 }catch{return proFail(503,'No se pudo cargar la papelera.');}
}
export async function POST(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 if(!proSameOrigin(req))return proFail(403,'Origen no autorizado.');
 try{
  const a=await proActor(req);if(a.error)return a.error;const limited=await enforceRateLimit(req,'company-file-trash-'+a.user.id,30,60000);if(limited)return limited;
  let input;try{input=companyTrashInputSchema.parse(await proBoundedJson(req,2048));}catch{return proFail(400,'Revise la carpeta.');}
  const r=await a.db.rpc('pro_company_trash_mutate',{p_actor:a.user.id,p_input:input});
  if(r.error)return proDbError(r.error,'La carpeta cambió en otra pestaña. Actualice la lista.');
  return Response.json(r.data,{headers});
 }catch{return proFail(503,'No se pudo comprobar el cambio. Reintente: no se duplicará.');}
}
