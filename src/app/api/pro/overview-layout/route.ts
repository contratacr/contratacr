import {enforceRateLimit} from '@/lib/rate-limit';
import {proActor,proBoundedJson,proDbError,proFail,proQuery,proRouteHeaders as headers,proSameOrigin} from '@/lib/pro/route-common';
import {proWorkspaceMember} from '@/lib/pro/workspace-user';
import {overviewLayoutInputSchema,overviewLayoutPageSchema} from '@/lib/pro/round8';
import {PRO_ENABLED} from '@/lib/pro/enabled';

/**
 * Round 8: arrangement of the job overview widgets (order, hidden), saved per person: the owner, or
 * each company member separately (the member id comes only from the signed gate headers).
 * Saving one's own arrangement is a personal preference ('read' capability in the role gate).
 */
async function person(){const member=await proWorkspaceMember();return member?.memberId??null;}
export async function GET(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 try{
  const a=await proActor(req);if(a.error)return a.error;const raw=proQuery(req);if(!raw||Object.keys(raw).length)return proFail(400,'Consulta inválida.');
  const r=await a.db.rpc('pro_overview_layout_read',{p_actor:a.user.id,p_person:(await person())??a.user.id});if(r.error)return proDbError(r.error,'La disposición cambió.');
  return Response.json(overviewLayoutPageSchema.parse(r.data),{headers});
 }catch{return proFail(503,'No se pudo cargar la disposición del resumen.');}
}
export async function POST(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 if(!proSameOrigin(req))return proFail(403,'Origen no autorizado.');
 try{
  const a=await proActor(req);if(a.error)return a.error;const limited=await enforceRateLimit(req,'overview-layout-'+a.user.id,60,60000);if(limited)return limited;
  let input;try{input=overviewLayoutInputSchema.parse(await proBoundedJson(req,4096));}catch{return proFail(400,'Disposición inválida.');}
  const r=await a.db.rpc('pro_overview_layout_save',{p_actor:a.user.id,p_person:(await person())??a.user.id,p_input:input});if(r.error)return proDbError(r.error,'La disposición cambió en otra pestaña. Recargue.');
  return Response.json(overviewLayoutPageSchema.parse(r.data),{headers});
 }catch{return proFail(503,'No se pudo comprobar el guardado. Reintente: no se duplicará.');}
}
