import {z} from 'zod';
import {proApiAccess,proDbFailure} from '@/lib/pro/api-access';
import {proInternalFinanceDenied} from '@/lib/pro/route-common';
import {decodeCursor,encodeCursor} from '@/lib/pro/panel-queries';
import {workCostMutationSchema,workCostCursor,workExpenseCursor} from '@/lib/pro/work-costs';
const headers={'Cache-Control':'private, no-store'};
function expectedActor(req:Request,actorId:string){
 const expected=req.headers.get('x-pro-expected-actor');if(expected===null)return null;
 if(!/^http:\/\/127\.0\.0\.1:54321\/?$/.test(process.env.NEXT_PUBLIC_SUPABASE_URL??''))return Response.json({error:'No disponible.'},{status:404,headers});
 if(!z.string().uuid().safeParse(expected).success)return Response.json({error:'Cuenta inválida.'},{status:400,headers});
 return expected===actorId?null:Response.json({error:'La cuenta cambió. Vuelva a la cuenta del intento guardado.'},{status:403,headers});
}
const query=z.object({clientId:z.string().min(1).max(160),workId:z.string().min(1).max(160),kind:z.enum(['entries','candidates']).default('entries'),q:z.string().max(160).default(''),after:z.string().max(1000).default('')});
export async function GET(req:Request){
 const access=await proApiAccess(req);if(access.error)return access.error;const scopeError=expectedActor(req,access.user.id);if(scopeError)return scopeError;
 // Closing round (security review M2): job costs are internal (owner, Administrator, Manager).
 const denied=await proInternalFinanceDenied();if(denied)return denied;
 try{
  const input=query.parse(Object.fromEntries(new URL(req.url).searchParams));
  const cursor=input.kind==='candidates'?decodeCursor(input.after,workExpenseCursor):decodeCursor(input.after,workCostCursor);
  const result=await access.db.rpc('pro_work_costs_read',{p_user:access.user.id,p_client:input.clientId,p_work:input.workId,p_kind:input.kind,p_search:input.q,p_after:cursor});
  if(result.error)return proDbFailure(result.error);
  if(!result.data)return Response.json({error:'Trabajo no encontrado.'},{status:404,headers});
  return Response.json({...result.data,nextCursor:encodeCursor(result.data.nextCursor)},{headers});
 }catch{return Response.json({error:'Consulta inválida.'},{status:400,headers});}
}
export async function POST(req:Request){
 const access=await proApiAccess(req);if(access.error)return access.error;const scopeError=expectedActor(req,access.user.id);if(scopeError)return scopeError;
 let input;try{input=workCostMutationSchema.parse(await req.json());}catch{return Response.json({error:'Revise las horas, la fecha y el costo registrado.'},{status:400,headers});}
 // Round 7C: a job expense with cost metadata (category, VAT, billable, payment method) goes through the wrapper (same transaction).
 const withMeta=input.action==='create_expense'&&['billable','paymentMethod','vatRateBps','category'].some(key=>key in input);
 const result=await access.db.rpc(withMeta?'pro_work_cost_expense_create':'pro_work_costs_mutate',{p_user:access.user.id,p_input:input});
 if(result.error){if(result.error.hint==='pro_billing_invoiced')return Response.json({error:'Este registro está en un borrador de factura activo. Archive ese borrador en Facturas para corregirlo o desvincularlo.',reason:'invoiced'},{status:400,headers});if(['22023','23503','23505','23514','P0002','22P02','22007','22008'].includes(result.error.code??''))return Response.json({error:'Revise el trabajo, el registro y el gasto. Un gasto solo puede estar asociado a un trabajo.'},{status:400,headers});return proDbFailure(result.error);}
 return Response.json(result.data,{headers});
}
