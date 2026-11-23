import {enforceRateLimit} from '@/lib/rate-limit';
import {proActor,proBoundedJson,proFail,proQuery,proRouteHeaders as headers,proSameOrigin} from '@/lib/pro/route-common';
import {accountingMutationSchema,mappingGaps,type Sources} from '@/lib/pro/integrations/accounting/model';
import {quickbooksFor,resolveQuickbooks,simulateRemoteEdit,syncQuickbooks,type AccountingRead} from '@/lib/pro/integrations/accounting/sync';
import {connectionMode,OAuthError} from '@/lib/pro/integrations/oauth/service';
import {PRO_ENABLED} from '@/lib/pro/enabled';

// Round 6B: Company › Contabilidad. GET: mode, mapping (accounts and IVA codes), QuickBooks options (when
// connected), links/conflicts, what would be synced. POST: save_mapping (CAS + idempotent), sync, resolve
// a conflict, and in mock mode simulate_remote_edit (an accountant edits the record in QuickBooks).
const messages:Record<string,string>={missing_keys:'Faltan variables de entorno de QuickBooks en el servidor.',production_refused:'Producción no está permitida en este servidor.',disabled:'La integración está desactivada.',
 not_connected:'Conecte QuickBooks primero.',no_conflict:'Ese conflicto ya se resolvió.',mock_only:'Solo disponible en simulación.',not_synced:'Sincronice primero ese registro.',remote_deleted:'El registro ya no existe en QuickBooks: conserve la versión de ContrataCR.'};
const fail=(error:unknown)=>error instanceof OAuthError?Response.json({error:messages[error.reason]??(error.status===409?'Los datos cambiaron. Actualice y reintente.':'No se pudo completar la operación.'),reason:error.reason},{status:error.status,headers}):proFail(503,'No se pudo comprobar la operación. Reintente la misma acción.');
export async function GET(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 try{
  const a=await proActor(req);if(a.error)return a.error;const raw=proQuery(req);if(!raw||Object.keys(raw).length)return proFail(400,'Consulta inválida.');
  const resolved=await connectionMode(a.db,a.user.id,'quickbooks');
  const read=await a.db.rpc('pro_accounting_read',{p_actor:a.user.id,p_mode:resolved.mode});if(read.error)return proFail(read.error.code==='42501'?403:503,'No se pudo cargar la contabilidad.');
  const sources=await a.db.rpc('pro_accounting_sources',{p_actor:a.user.id,p_scope:null});if(sources.error)return proFail(503,'No se pudo cargar la contabilidad.');
  const data=read.data as AccountingRead,src=sources.data as Sources;
  let options:{accounts:unknown[];taxCodes:unknown[]}|null=null,connected=false;
  try{const q=await quickbooksFor(a.db,a.user.id);options=await q.adapter.options();connected=true;}catch(error){if(!(error instanceof OAuthError))throw error;}
  return Response.json({...data,mode:resolved.mode,modeStatus:resolved.status,connected,options,gaps:mappingGaps(data.mapping,src),
   counts:{customers:src.customers.length,invoices:src.invoices.length,emitted:src.invoices.filter(i=>i.emitted).length,payments:src.payments.length},
   pending:{customers:src.customers.slice(0,50).map(c=>({localId:c.localId,label:c.name})),invoices:src.invoices.slice(0,50).map(i=>({localId:i.localId,label:i.number+' · '+i.customer,emitted:i.emitted}))}},{headers});
 }catch(error){return fail(error);}
}
export async function POST(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 if(!proSameOrigin(req))return proFail(403,'Origen no autorizado.');
 try{
  const a=await proActor(req);if(a.error)return a.error;
  const limited=await enforceRateLimit(req,'accounting-'+a.user.id,30,60000);if(limited)return limited;
  let raw:unknown;try{raw=await proBoundedJson(req,16384);}catch(cause){return proFail(cause instanceof RangeError?413:400,'Revise los datos.');}
  const input=accountingMutationSchema.safeParse(raw);if(!input.success)return proFail(400,'Revise los datos.');
  const body=input.data;
  if(body.action==='save_mapping'){
   const result=await a.db.rpc('pro_accounting_mapping_save',{p_actor:a.user.id,p_input:body});
   if(result.error)return proFail(result.error.code==='40001'?409:result.error.code==='22023'?400:503,result.error.code==='40001'?'El mapeo cambió en otra pestaña. Actualice y reintente.':'No se pudo guardar el mapeo.');
   return Response.json(result.data,{headers});
  }
  if(body.action==='sync')return Response.json(await syncQuickbooks(a.db,a.user.id,body.actionId),{headers});
  if(body.action==='resolve')return Response.json(await resolveQuickbooks(a.db,a.user.id,body,body.actionId),{headers});
  return Response.json(await simulateRemoteEdit(a.db,a.user.id,body),{headers});
 }catch(error){return fail(error);}
}
