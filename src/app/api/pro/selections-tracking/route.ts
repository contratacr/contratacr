import {z} from 'zod';
import {proAccountRateLimit,proActor,proBoundedJson,proDbError,proFail,proInternalFinanceAllowed,proQuery,proRouteHeaders as headers,proSameOrigin} from '@/lib/pro/route-common';
import {selectionTrackingInputSchema,selectionTrackingSchema} from '@/lib/pro/round10';

/**
 * Round 10 (row 62): order/delivery tracking per selection, internal cost and margin per option (owner),
 * bulk tracking, and the CUSTOMER's bulk approval (approve_many runs as the signed-in customer through
 * the existing customer writer; an owner or member is not the customer and gets 403).
 * Role gate: writes = sales.write (selections).
 */
const query=z.object({workId:z.string().trim().min(1).max(160)}).strict();
export async function GET(req:Request){
 if(process.env.NODE_ENV!=='development')return new Response(null,{status:404,headers});
 try{
  const a=await proActor(req);if(a.error)return a.error;const raw=proQuery(req),parsed=raw?query.safeParse(raw):null;if(!parsed?.success)return proFail(400,'Consulta inválida.');
  const r=await a.db.rpc('pro_work_selection_tracking_read',{p_owner:a.user.id,p_work:parsed.data.workId});if(r.error)return proDbError(r.error,'Las selecciones cambiaron.');
  if(!r.data)return proFail(404,'Trabajo no disponible.');
  const data=selectionTrackingSchema.parse(r.data);
  // Fix 13: internal cost and margin are for the owner, Administrator and Manager only.
  if(!await proInternalFinanceAllowed())return Response.json({...data,costsHidden:true,items:data.items.map(i=>({...i,options:i.options.map(o=>({...o,unitCostCents:null,costCents:null,marginCents:null,marginBps:null}))})),totals:{...data.totals,approvedCostCents:0,marginCents:0,approvedWithoutCost:data.totals.approved}},{headers});
  return Response.json(data,{headers});
 }catch{return proFail(503,'No se pudo cargar el seguimiento.');}
}
export async function POST(req:Request){
 if(process.env.NODE_ENV!=='development')return new Response(null,{status:404,headers});
 if(!proSameOrigin(req))return proFail(403,'Origen no autorizado.');
 try{
  const a=await proActor(req);if(a.error)return a.error;const limited=await proAccountRateLimit('selections-tracking',a.user.id,60,60000);if(limited)return limited;
  let input;try{input=selectionTrackingInputSchema.parse(await proBoundedJson(req,32768));}catch{return proFail(400,'Revise los datos de las selecciones.');}
  const r=input.action==='approve_many'?await a.db.rpc('pro_work_selections_client_bulk',{p_actor:a.user.id,p_input:input}):await a.db.rpc('pro_work_selection_tracking_mutate',{p_owner:a.user.id,p_input:input});
  if(r.error)return proDbError(r.error,'Las selecciones cambiaron en otra pestaña. Recargue.');
  return Response.json(r.data,{headers});
 }catch{return proFail(503,'No se pudo guardar. Reintente: no se duplicará.');}
}
