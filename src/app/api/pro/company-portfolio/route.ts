import {z} from 'zod';
import {enforceRateLimit} from '@/lib/rate-limit';
import {proActor,proBoundedJson,proDbError,proFail,proQuery,proSameOrigin,proRouteHeaders as headers} from '@/lib/pro/route-common';
import {portfolioMutationSchema} from '@/lib/pro/portfolio';
import {PRO_ENABLED} from '@/lib/pro/enabled';

/**
 * Row 68: portfolio publication of finished jobs (with the customer's consent on record) and the profile's commercial
 * metrics. The path starts with "company-" so the role gate asks for company.write. Photos never travel here: the browser
 * sends them through the public upload pipeline first and this route only records the case and the consent.
 */
const day=z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export async function GET(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 try{
  const a=await proActor(req);if(a.error)return a.error;const q=proQuery(req);if(!q)return proFail(400,'Consulta inválida.');
  if(q.view==='metrics'){
   const from=day.safeParse(q.from),to=day.safeParse(q.to);if(!from.success||!to.success||Object.keys(q).length!==3)return proFail(400,'Consulta inválida.');
   const r=await a.db.rpc('pro_profile_metrics_read',{p_actor:a.user.id,p_from:from.data,p_to:to.data});
   if(r.error)return proDbError(r.error,'Los datos cambiaron.');return Response.json(r.data,{headers});
  }
  if(Object.keys(q).length)return proFail(400,'Consulta inválida.');
  const r=await a.db.rpc('pro_portfolio_read',{p_actor:a.user.id});
  if(r.error)return proDbError(r.error,'Los datos cambiaron.');return Response.json(r.data,{headers});
 }catch{return proFail(503,'No se pudieron cargar los casos de éxito.');}
}
const reasons:Record<string,string>={pro_portfolio_no_profile:'Cree primero su perfil público.',pro_portfolio_not_finished:'Solo puede publicar un trabajo terminado.',pro_portfolio_profession:'Elija una de las profesiones de su perfil.',pro_portfolio_consent:'Registre el consentimiento del cliente.',pro_portfolio_photos:'Elija entre 1 y 5 fotos.',pro_portfolio_limit:'Ya tiene 10 proyectos en esa profesión. Quite uno primero.'};
export async function POST(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 if(!proSameOrigin(req))return proFail(403,'Origen no autorizado.');
 const a=await proActor(req);if(a.error)return a.error;
 const limited=await enforceRateLimit(req,'company-portfolio-'+a.user.id,30,60000);if(limited)return limited;
 let input;try{input=portfolioMutationSchema.parse(await proBoundedJson(req,16384));}catch{return proFail(400,'Revise los datos.');}
 try{
  const r=await a.db.rpc('pro_portfolio_mutate',{p_actor:a.user.id,p_input:input});
  if(r.error){
   const hint=r.error.hint||'';if(reasons[hint])return Response.json({error:reasons[hint],reason:hint},{status:400,headers});
   if(r.error.code==='P0002')return proFail(404,'El trabajo o la publicación ya no está disponible.');
   return proDbError(r.error,'Este trabajo ya está publicado. Actualice.');
  }
  return Response.json(r.data,{headers});
 }catch{return proFail(503,'No se pudo guardar. Reintente.');}
}
