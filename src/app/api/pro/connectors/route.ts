import {enforceRateLimit} from '@/lib/rate-limit';
import {proActor,proBoundedJson,proFail,proQuery,proRequestOrigin,proRouteHeaders as headers,proSameOrigin} from '@/lib/pro/route-common';
import {connectorMutationSchema} from '@/lib/pro/integrations/workspace/api';
import {mockDriveFiles} from '@/lib/pro/integrations/workspace/adapters';
import {autoSyncTick,resolveCalendar,sendProjectEmail,simulateCalendarChange,syncCalendar} from '@/lib/pro/integrations/workspace/service';
import {connectionMode,OAuthError,revokeConnection,startConnection} from '@/lib/pro/integrations/oauth/service';
import {oauthProviders} from '@/lib/pro/integrations/oauth/providers';

// Round 6B: Company › Correo, calendario y archivos (Google / Microsoft) and the OAuth connect/disconnect of
// QuickBooks. GET never returns token envelopes (only «encrypted: true»). POST: connect (→ consent URL),
// disconnect (revoke + wipe), send_email (confirmed=true only from the confirmation dialog; mock = outbox
// only), calendar_sync, calendar_resolve and, in mock mode only, calendar_simulate. Round 6C: send_email also
// from the job workspace (same contract), calendar_autosync_set and calendar_autosync_tick (in-app scheduler).
const messages:Record<string,string>={missing_keys:'Faltan variables de entorno de este proveedor en el servidor.',production_refused:'Producción no está permitida en este servidor.',disabled:'La integración está desactivada.',
 not_connected:'Conecte la cuenta primero.',pro_oauth_not_connected:'Conecte la cuenta primero.',pro_email_confirm:'Confirme el envío de este correo.',pro_oauth_mode:'La conexión es de otro modo. Vuelva a conectar la cuenta.',
 attachment:'Uno de los archivos adjuntos ya no está disponible.',keep_remote_task_only:'Las citas con clientes se cambian desde Citas; conserve la versión de ContrataCR.',no_conflict:'Ese conflicto ya se resolvió.',mock_only:'Solo disponible en simulación.'};
const fail=(error:unknown)=>{
 if(error instanceof OAuthError)return Response.json({error:messages[error.reason]??(error.status===409?'La conexión cambió. Actualice y reintente.':'No se pudo completar la operación.'),reason:error.reason},{status:error.status,headers});
 return proFail(503,'No se pudo comprobar la operación. Reintente la misma acción.');
};
export async function GET(req:Request){
 if(process.env.NODE_ENV!=='development')return new Response(null,{status:404,headers});
 try{
  const a=await proActor(req);if(a.error)return a.error;const raw=proQuery(req);
  // Round 6C: «?autosync=1» = only the automatic-sync settings (used by the in-app scheduler).
  if(raw&&Object.keys(raw).length===1&&raw.autosync==='1'){const auto=await a.db.rpc('pro_calendar_autosync_read',{p_actor:a.user.id});return auto.error?proFail(auto.error.code==='42501'?403:503,'No se pudo cargar.'):Response.json(auto.data,{headers});}
  if(!raw||Object.keys(raw).length)return proFail(400,'Consulta inválida.');
  const read=await a.db.rpc('pro_connectors_read',{p_actor:a.user.id});if(read.error)return proFail(read.error.code==='42501'?403:503,'No se pudieron cargar las conexiones.');
  const data=read.data as {connections:{provider:string;mode:string;status:string}[]};
  const providers=await Promise.all(oauthProviders.map(async id=>{const resolved=await connectionMode(a.db,a.user.id,id),c=data.connections.find(row=>row.provider===id);
   return {id,resolved,connected:!!c&&c.status==='connected'&&c.mode===resolved.mode,files:id!=='quickbooks'&&c?.status==='connected'&&c.mode==='mock'&&resolved.mode==='mock'?mockDriveFiles(id):[]};}));
  const auto=await a.db.rpc('pro_calendar_autosync_read',{p_actor:a.user.id});
  return Response.json({...data,providers,autosync:auto.error?null:auto.data},{headers});
 }catch(error){return fail(error);}
}
export async function POST(req:Request){
 if(process.env.NODE_ENV!=='development')return new Response(null,{status:404,headers});
 if(!proSameOrigin(req))return proFail(403,'Origen no autorizado.');
 try{
  const a=await proActor(req);if(a.error)return a.error;
  const limited=await enforceRateLimit(req,'connectors-'+a.user.id,60,60000);if(limited)return limited;
  let raw:unknown;try{raw=await proBoundedJson(req,65536);}catch(cause){return proFail(cause instanceof RangeError?413:400,'Revise los datos.');}
  const input=connectorMutationSchema.safeParse(raw);if(!input.success)return proFail(400,'Revise los datos.');
  const body=input.data,owner=a.user.id;
  if(body.action==='connect')return Response.json(await startConnection(a.db,owner,body.provider,body.locale,body.view,proRequestOrigin(req)),{headers});
  if(body.action==='disconnect')return Response.json(await revokeConnection(a.db,owner,body),{headers});
  if(body.action==='send_email')return Response.json(await sendProjectEmail(a.db,owner,body),{headers});
  if(body.action==='calendar_sync')return Response.json(await syncCalendar(a.db,owner,body.provider,body.actionId),{headers});
  if(body.action==='calendar_resolve')return Response.json(await resolveCalendar(a.db,owner,body,body.actionId),{headers});
  if(body.action==='calendar_autosync_set'){const set=await a.db.rpc('pro_calendar_autosync_set',{p_actor:owner,p_input:body});return set.error?(set.error.code==='40001'?proFail(409,'La sincronización automática cambió. Actualice y reintente.'):proFail(set.error.code==='42501'?403:400,'Revise la sincronización automática.')):Response.json(set.data,{headers});}
  if(body.action==='calendar_autosync_tick')return Response.json(await autoSyncTick(a.db,owner,body.actionId),{headers});
  return Response.json(await simulateCalendarChange(a.db,owner,body),{headers});
 }catch(error){return fail(error);}
}
