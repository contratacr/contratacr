import {enforceRateLimit} from '@/lib/rate-limit';
import {proActor,proBoundedJson,proDbError,proFail,proQuery,proRouteHeaders as headers,proSameOrigin} from '@/lib/pro/route-common';
import {adBuildMutationSchema,simulateMetrics,type AdBuild} from '@/lib/pro/ad-builder';
import {adPublisherFor} from '@/lib/pro/integrations/ads/publisher';
import {resolveMode,storedMode} from '@/lib/pro/integrations/server';
import {PRO_ENABLED} from '@/lib/pro/enabled';

// Pro 29 (row 70): campaign builder. Sandbox publishing through the mock adapter only (no platform call, no spend);
// simulated metrics are stored apart from the real tracking report. The «company-» prefix asks for company.write.
const crToday=()=>new Date(Date.now()-6*3600000).toISOString().slice(0,10);
const providerOf=(platform:'meta'|'google')=>platform==='meta'?'meta_ads' as const:'google_ads' as const;
export async function GET(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 try{
  const a=await proActor(req);if(a.error)return a.error;const q=proQuery(req);if(!q||Object.keys(q).length)return proFail(400,'Consulta inválida.');
  const result=await a.db.rpc('pro_adb_read',{p_actor:a.user.id});if(result.error)return proDbError(result.error,'Los datos cambiaron.');
  return Response.json({...(result.data as object),mode:'mock'},{headers});
 }catch{return proFail(503,'No se pudo cargar el constructor de campañas. Reintente.');}
}
export async function POST(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 if(!proSameOrigin(req))return proFail(403,'Origen no autorizado.');
 try{
  const a=await proActor(req);if(a.error)return a.error;
  const limited=await enforceRateLimit(req,'company-ad-builder-'+a.user.id,60,60000);if(limited)return limited;
  let input;try{input=adBuildMutationSchema.parse(await proBoundedJson(req,8192));}catch{return proFail(400,'Revise los datos.');}
  let payload:Record<string,unknown>=input;
  if(input.action==='publish_sandbox'||input.action==='simulate'){
   const read=await a.db.rpc('pro_adb_read',{p_actor:a.user.id});if(read.error)return proDbError(read.error,'Los datos cambiaron.');
   const build=(read.data as {builds:AdBuild[]}).builds.find(b=>b.id===input.id);if(!build)return proFail(404,'La campaña ya no está disponible.');
   if(input.action==='publish_sandbox'){
    const resolved=resolveMode(providerOf(build.platform),await storedMode(a.db,a.user.id,providerOf(build.platform)));
    // Only the mock publishes; a stored sandbox/production mode is refused (documented adapters, not active).
    if(resolved.mode!=='mock'||resolved.status!=='ready')return Response.json({error:'La publicación real de anuncios no está activa. Solo se permite el modo de prueba.',reason:'not_active'},{status:409,headers});
    payload={...input,platformRef:(await adPublisherFor(build.platform,'mock').publish(build)).platformRef};
   }else payload={...input,rows:simulateMetrics(build,crToday())};
   if(input.action==='simulate'&&!(payload.rows as unknown[]).length)return Response.json({error:'Todavía no hay días del plan que simular.',reason:'no_days'},{status:400,headers});
  }
  const result=await a.db.rpc('pro_adb_mutate',{p_actor:a.user.id,p_input:payload});
  if(result.error)return proDbError(result.error,'La campaña cambió. Actualice antes de continuar.');
  return Response.json(result.data,{headers});
 }catch{return proFail(503,'No se pudo comprobar el cambio. Reintente la misma operación.');}
}
