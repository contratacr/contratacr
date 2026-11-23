import {enforceRateLimit} from '@/lib/rate-limit';
import {proActor,proBoundedJson,proDbError,proFail,proQuery,proRouteHeaders as headers,proSameOrigin} from '@/lib/pro/route-common';
import {integrationMutationSchema,integrationProviders,providerConfig,providerRegistry,type IntegrationConnection} from '@/lib/pro/integrations/registry';
import {envPresence,productionAllowed,resolveMode} from '@/lib/pro/integrations/server';
import {testHacienda} from '@/lib/pro/integrations/hacienda/service';
import {MockProcessor,MOCK_CARDS} from '@/lib/pro/integrations/payments/mock';
import {logOutbound} from '@/lib/pro/integrations/server';
import {testRound6bProvider,testRound6cProvider,testRound6dProvider} from '@/lib/pro/integrations/self-test';
import {PRO_ENABLED} from '@/lib/pro/enabled';

// Round 6A: Company › Integraciones. GET: providers, stored mode, resolved status (env names + present flag
// only, never values), recent redacted request log and webhook inbox. POST: set_mode (production refused
// without PRO_INTEGRATIONS_ALLOW_PRODUCTION=1 and the typed confirmation), save_config (non-secret keys of
// the provider only), enable/disable, test («Probar conexión» against the resolved adapter).
const conflict='La integración cambió. Actualice y vuelva a intentarlo.';
function integrationError(error:{code?:string;hint?:string}){
 if(error.hint==='pro_integration_production_refused')return Response.json({error:'Producción no está habilitada para esta cuenta. Requiere habilitación del administrador y su autorización expresa.',reason:'production_refused'},{status:403,headers});
 if(error.hint==='pro_integration_production_confirm')return Response.json({error:'Escriba exactamente ACTIVAR PRODUCCION para confirmar.',reason:'production_confirm'},{status:400,headers});
 if(error.hint==='pro_integration_secret_config')return Response.json({error:'La configuración no puede contener claves ni secretos: van en variables de entorno del servidor.',reason:'secret_config'},{status:400,headers});
 return proDbError(error,conflict);
}
export async function GET(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 try{
  const a=await proActor(req);if(a.error)return a.error;const raw=proQuery(req);if(!raw||Object.keys(raw).length)return proFail(400,'Consulta inválida.');
  const result=await a.db.rpc('pro_integration_read',{p_actor:a.user.id});if(result.error)return integrationError(result.error);
  const data=result.data as {connections:IntegrationConnection[];history:unknown[];requests:unknown[];webhooks:unknown[]};
  const providers=integrationProviders.map(id=>{
   const connection=data.connections.find(row=>row.provider===id)!,descriptor=providerRegistry[id];
   const resolved=resolveMode(id,connection.enabled?connection.mode:'disabled');
   return {id,kind:descriptor.kind,name:descriptor.name,purpose:descriptor.purpose,docs:descriptor.docs,connection:{...connection,config:providerConfig(id,connection.config)},resolved,env:envPresence(id)};
  });
  return Response.json({providers,productionAllowed:productionAllowed(),history:data.history,requests:data.requests,webhooks:data.webhooks},{headers});
 }catch{return proFail(503,'No se pudieron cargar las integraciones. Reintente.');}
}
export async function POST(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 if(!proSameOrigin(req))return proFail(403,'Origen no autorizado.');
 try{
  const a=await proActor(req);if(a.error)return a.error;
  const limited=await enforceRateLimit(req,'integrations-'+a.user.id,40,60000);if(limited)return limited;
  let raw:unknown;try{raw=await proBoundedJson(req,8192);}catch(cause){return proFail(cause instanceof RangeError?413:400,'Revise la integración.');}
  const input=integrationMutationSchema.safeParse(raw);if(!input.success)return proFail(400,'Revise la integración.');
  const body=input.data;
  if(body.action==='save_config'){
   const schema=providerRegistry[body.provider].config,parsed=schema.safeParse(body.config);
   if(!parsed.success)return Response.json({error:'Configuración no válida: solo se guardan opciones sin secretos de este proveedor.',reason:'invalid_config'},{status:400,headers});
   const result=await a.db.rpc('pro_integration_mutate',{p_actor:a.user.id,p_input:{...body,config:parsed.data},p_production_allowed:productionAllowed()});
   return result.error?integrationError(result.error):Response.json(result.data,{headers});
  }
  if(body.action==='test'){
   const read=await a.db.rpc('pro_integration_read',{p_actor:a.user.id});if(read.error)return integrationError(read.error);
   const connection=(read.data as {connections:IntegrationConnection[]}).connections.find(row=>row.provider===body.provider)!;
   const resolved=resolveMode(body.provider,connection.enabled?connection.mode:'disabled');
   // Round 6C: every outcome carries its English text too («Probar conexión» in the EN interface).
   let outcome:{ok:boolean;message:string;en:string};
   if(resolved.status!=='ready')outcome=resolved.status==='missing_keys'?{ok:false,message:'Faltan variables de entorno para este modo en el servidor.',en:'Environment variables for this mode are missing on the server.'}:resolved.status==='production_refused'?{ok:false,message:'Producción no habilitada en este servidor.',en:'Production is not enabled on this server.'}:{ok:false,message:'Integración desactivada.',en:'Integration disabled.'};
   else if(body.provider==='hacienda')outcome=await testHacienda(a.db,a.user.id,resolved.mode);
   else if(body.provider==='ai'||body.provider==='transcription')outcome=await testRound6cProvider(a.db,a.user.id,body.provider,resolved.mode);
   else if(body.provider==='marketing_email'||body.provider==='meta_ads'||body.provider==='google_ads'||body.provider==='product_clipper'||body.provider==='site_domain')outcome=await testRound6dProvider(a.db,a.user.id,body.provider,resolved.mode);
   else if(body.provider!=='tilopay')outcome=await testRound6bProvider(a.db,a.user.id,body.provider,resolved.mode);
   else if(resolved.mode==='mock'){
    const started=Date.now(),processor=new MockProcessor(),charge=await processor.chargeCard({attemptId:body.actionId,amountCents:100,card:{number:MOCK_CARDS.approved,expMonth:12,expYear:new Date().getUTCFullYear()+1,cvc:'123',name:'Prueba'},description:'Prueba'});
    const events=processor.drainEvents();
    await logOutbound(a.db,a.user.id,{provider:'tilopay',mode:'mock',operation:'prueba',url:'https://processor.mock.local/charge',statusCode:200,outcome:charge.status==='pending'&&events.length===1?'ok':'error',durationMs:Date.now()-started,summary:{charge:charge.status,events:events.length}});
    outcome={ok:charge.status==='pending'&&events.length===1,message:'Simulación correcta: cobro de prueba aprobado y evento firmado generado. No se cobró nada ni se registró ningún pago.',en:'Simulation passed: test charge approved and signed event generated. Nothing was charged and no payment was recorded.'};
   }else outcome={ok:false,message:'La prueba real del procesador se habilita al activar el modo de pruebas con sus claves.',en:'The real processor test is enabled when test mode is turned on with its keys.'};
   const result=await a.db.rpc('pro_integration_mutate',{p_actor:a.user.id,p_input:{action:'test',actionId:body.actionId,provider:body.provider,ok:outcome.ok,testMode:resolved.mode,message:outcome.message.slice(0,300)},p_production_allowed:productionAllowed()});
   if(result.error)return integrationError(result.error);
   return Response.json({ok:outcome.ok,message:outcome.message,messageEn:outcome.en,mode:resolved.mode,status:resolved.status},{headers});
  }
  const result=await a.db.rpc('pro_integration_mutate',{p_actor:a.user.id,p_input:body,p_production_allowed:productionAllowed()});
  return result.error?integrationError(result.error):Response.json(result.data,{headers});
 }catch{return proFail(503,'No se pudo comprobar el cambio. Reintente la misma operación.');}
}
