import {enforceRateLimit} from '@/lib/rate-limit';
import {proActor,proBoundedJson,proDbError,proFail,proInternalFinanceDenied,proQuery,proRouteHeaders,proSameOrigin} from '@/lib/pro/route-common';
import {purchaseOrderToolsMutationSchema,purchaseOrderToolsQuerySchema} from '@/lib/pro/purchase-orders';
import {PRO_ENABLED} from '@/lib/pro/enabled';

// Families 51/52: terms (delivery address, payment terms), selection sync read, flat export, merge of drafts, receipt reversal and returns.
// Same owner gate as the purchase orders route; every write carries an actionId (idempotent in the database).
const conflict='La orden de compra cambió. Actualice antes de continuar.';
export async function GET(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers:proRouteHeaders});
 try{
  const a=await proActor(req);if(a.error)return a.error;
  const denied=await proInternalFinanceDenied();if(denied)return denied;
  const raw=proQuery(req);const parsed=raw?purchaseOrderToolsQuerySchema.safeParse(raw):null;if(!parsed?.success)return proFail(400,'Consulta inválida.');
  const q=parsed.data;
  const result=q.view==='terms'?await a.db.rpc('pro_purchase_order_terms_read',{p_actor:a.user.id,p_work:q.workId,p_order:q.id})
   :q.view==='sync'?await a.db.rpc('pro_purchase_order_selection_sync',{p_actor:a.user.id,p_work:q.workId,p_order:q.id})
   :await a.db.rpc('pro_purchase_order_export',{p_actor:a.user.id,p_work:q.workId});
  if(result.error)return proDbError(result.error,conflict);
  return result.data?Response.json(result.data,{headers:proRouteHeaders}):proFail(404,'Orden no disponible.');
 }catch{return proFail(503,'No se pudo cargar la información. Reintente.');}
}
export async function POST(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers:proRouteHeaders});
 if(!proSameOrigin(req))return proFail(403,'Origen no autorizado.');
 try{
  const a=await proActor(req);if(a.error)return a.error;
  const denied=await proInternalFinanceDenied();if(denied)return denied;
  const limited=await enforceRateLimit(req,'purchase-order-tools-'+a.user.id,60,60000);if(limited)return limited;
  let input;try{input=purchaseOrderToolsMutationSchema.parse(await proBoundedJson(req,32768));}catch(cause){return proFail(cause instanceof RangeError?413:400,'Revise los datos enviados.');}
  let result;
  if(input.action==='terms'){const {action:_action,...terms}=input;void _action;result=await a.db.rpc('pro_purchase_order_terms_set',{p_actor:a.user.id,p_input:terms});}
  else if(input.action==='merge')result=await a.db.rpc('pro_purchase_orders_merge',{p_actor:a.user.id,p_input:input});
  else result=await a.db.rpc('pro_purchase_order_receipt_adjust',{p_actor:a.user.id,p_input:input});
  if(result.error)return proDbError(result.error,conflict);
  return Response.json(result.data,{headers:proRouteHeaders});
 }catch{return proFail(503,'No se pudo comprobar el guardado. Reintente la misma operación.');}
}
