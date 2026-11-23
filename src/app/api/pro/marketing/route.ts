import {enforceRateLimit} from '@/lib/rate-limit';
import {proActor,proBoundedJson,proDbError,proFail,proRequestOrigin,proRouteHeaders as headers,proSameOrigin} from '@/lib/pro/route-common';
import {marketingMutationSchema} from '@/lib/pro/marketing';
import {resolveMode,storedMode} from '@/lib/pro/integrations/server';
import {PRO_ENABLED} from '@/lib/pro/enabled';

// Round 6D (row 71): email campaigns and automations to consenting contacts. Mode comes from the marketing_email
// provider (mock by default → every message is «simulado» in the outbox; nothing leaves the machine). In a real
// mode the queued messages would be delivered by BrevoCampaignSender (inactive: no keys exist).
async function mode(db:Parameters<typeof storedMode>[0],owner:string){const resolved=resolveMode('marketing_email',await storedMode(db,owner,'marketing_email'));return resolved.status==='ready'?resolved.mode:null;}
export async function GET(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 try{
  const a=await proActor(req);if(a.error)return a.error;
  const result=await a.db.rpc('pro_mkt_read',{p_actor:a.user.id});if(result.error)return proDbError(result.error,'Los datos cambiaron.');
  return Response.json({...(result.data as object),mode:await mode(a.db,a.user.id)??'disabled'},{headers});
 }catch{return proFail(503,'No se pudo cargar el correo masivo. Reintente.');}
}
export async function POST(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 if(!proSameOrigin(req))return proFail(403,'Origen no autorizado.');
 try{
  const a=await proActor(req);if(a.error)return a.error;
  const limited=await enforceRateLimit(req,'marketing-'+a.user.id,60,60000);if(limited)return limited;
  let input;try{input=marketingMutationSchema.parse(await proBoundedJson(req,32*1024));}catch(cause){return proFail(cause instanceof RangeError?413:400,'Revise los datos.');}
  const current=await mode(a.db,a.user.id);
  const sends=['test_send','campaign_send_now','draft_decide','run_due'].includes(input.action);
  if(sends&&!current)return Response.json({error:'El correo de campañas está desactivado o le faltan claves en el servidor.',reason:'provider_unavailable'},{status:409,headers});
  const base=proRequestOrigin(req);
  const result=input.action==='run_due'?await a.db.rpc('pro_mkt_run_due',{p_actor:a.user.id,p_mode:current,p_base:base})
   :input.action==='scan_automations'?await a.db.rpc('pro_mkt_automation_scan',{p_actor:a.user.id,p_base:base})
   :await a.db.rpc('pro_mkt_mutate',{p_actor:a.user.id,p_input:input,p_mode:current??'mock',p_base:base});
  if(result.error){
   if(result.error.hint==='pro_mkt_suppressed')return Response.json({error:'Esa dirección se dio de baja: no se puede volver a agregar desde aquí.',reason:'suppressed'},{status:409,headers});
   if(result.error.hint==='pro_mkt_no_consent')return Response.json({error:'El destinatario no tiene consentimiento vigente.',reason:'no_consent'},{status:409,headers});
   return proDbError(result.error,'Los datos cambiaron. Actualice antes de continuar.');
  }
  return Response.json(result.data,{headers});
 }catch{return proFail(503,'No se pudo comprobar el cambio. Reintente la misma operación.');}
}
