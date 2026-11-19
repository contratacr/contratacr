import {enforceRateLimit} from '@/lib/rate-limit';
import {proActor,proBoundedJson,proDbError,proFail,proQuery,proRouteHeaders as headers,proSameOrigin} from '@/lib/pro/route-common';
import {adMutationSchema} from '@/lib/pro/ads-tracking';

// Round 6D (row 70): tracking campaigns (UTM + code), cost entries (append-only, void to correct), lead
// attribution and the cost-per-lead / ROI report from real leads and jobs. No ad platform is called.
const day=/^\d{4}-\d{2}-\d{2}$/;
const crToday=()=>new Date(Date.now()-6*3600000).toISOString().slice(0,10);
export async function GET(req:Request){
 if(process.env.NODE_ENV!=='development')return new Response(null,{status:404,headers});
 try{
  const a=await proActor(req);if(a.error)return a.error;const q=proQuery(req);if(!q)return proFail(400,'Consulta inválida.');
  const to=q.to??crToday(),from=q.from??new Date(Date.parse(to+'T12:00:00Z')-89*86400000).toISOString().slice(0,10);
  if(!day.test(from)||!day.test(to)||from>to)return proFail(400,'Periodo inválido.');
  const result=await a.db.rpc('pro_ad_read',{p_actor:a.user.id,p_from:from,p_to:to});if(result.error)return proDbError(result.error,'Los datos cambiaron.');
  return Response.json(result.data,{headers});
 }catch{return proFail(503,'No se pudo cargar el seguimiento. Reintente.');}
}
export async function POST(req:Request){
 if(process.env.NODE_ENV!=='development')return new Response(null,{status:404,headers});
 if(!proSameOrigin(req))return proFail(403,'Origen no autorizado.');
 try{
  const a=await proActor(req);if(a.error)return a.error;
  const limited=await enforceRateLimit(req,'ads-tracking-'+a.user.id,60,60000);if(limited)return limited;
  let input;try{input=adMutationSchema.parse(await proBoundedJson(req,8192));}catch(cause){return proFail(cause instanceof RangeError?413:400,'Revise los datos.');}
  const result=await a.db.rpc('pro_ad_mutate',{p_actor:a.user.id,p_input:input});
  if(result.error)return proDbError(result.error,'Los datos cambiaron. Actualice antes de continuar.');
  return Response.json(result.data,{headers});
 }catch{return proFail(503,'No se pudo comprobar el cambio. Reintente la misma operación.');}
}
