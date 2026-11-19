import {proApiAccess,proDbFailure} from '@/lib/pro/api-access';
import {decodeCursor,encodeCursor} from '@/lib/pro/panel-queries';
import {invoicePaymentsQuery,invoicePaymentCursor,invoicePaymentMutation} from '@/lib/pro/invoice-payments';
const headers={'Cache-Control':'private, no-store'};
export async function GET(req:Request){
 const access=await proApiAccess(req);if(access.error)return access.error;
 try{const input=invoicePaymentsQuery.parse(Object.fromEntries(new URL(req.url).searchParams)),after=decodeCursor(input.after,invoicePaymentCursor),candidatesAfter=decodeCursor(input.candidatesAfter,invoicePaymentCursor);
  const result=await access.db.rpc('pro_invoice_payments_read',{p_user:access.user.id,p_id:input.id,p_after:after,p_candidates_after:candidatesAfter});
  if(result.error)return proDbFailure(result.error);if(!result.data)return Response.json({error:'Borrador no encontrado.'},{status:404,headers});
  return Response.json({...result.data,nextCursor:encodeCursor(result.data.nextCursor),nextCandidateCursor:encodeCursor(result.data.nextCandidateCursor)},{headers});
 }catch{return Response.json({error:'Consulta inválida.'},{status:400,headers});}
}
export async function POST(req:Request){
 const access=await proApiAccess(req);if(access.error)return access.error;
 const parsed=invoicePaymentMutation.safeParse(await req.json().catch(()=>null));
 if(!parsed.success)return Response.json({error:'Revise el importe, la fecha, el medio y la referencia del pago.'},{status:400,headers});
 const result=await access.db.rpc('pro_invoice_payment_mutate',{p_user:access.user.id,p_input:parsed.data});
 if(result.error){
  const reason=result.error.hint==='pro_credit_notes_balance'?'credit_notes':result.error.hint==='pro_invoice_balance'?'invoice_balance':result.error.hint==='pro_credit_refunded'?'credit_refunded':null;
  if(reason)return Response.json({error:reason==='credit_notes'?'El importe supera el saldo que queda después de las notas de crédito aplicadas. No se guardaron cambios.':reason==='invoice_balance'?'El importe supera el saldo pendiente del borrador. No se guardaron cambios.':'Ese abono ya se devolvió mediante un crédito; no puede aplicarse.',reason},{status:400,headers});
  if(['22023','23503','23505','23514'].includes(result.error.code))return Response.json({error:'Revise el saldo disponible y el abono. No se guardaron cambios.'},{status:400,headers});return proDbFailure(result.error);}
 return result.data?Response.json(result.data,{headers}):Response.json({error:'Borrador no encontrado.'},{status:404,headers});
}
