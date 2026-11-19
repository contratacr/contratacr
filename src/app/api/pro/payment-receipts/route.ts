import {proApiAccess,proDbFailure} from '@/lib/pro/api-access';
import {decodeCursor,encodeCursor} from '@/lib/pro/panel-queries';
import {paymentReceiptCursorSchema,paymentReceiptPrepareSchema,paymentReceiptQuerySchema} from '@/lib/pro/payment-receipts';
const headers={'Cache-Control':'private, no-store'};
export async function GET(req:Request){
 const access=await proApiAccess(req);if(access.error)return access.error;
 try{
  const input=paymentReceiptQuerySchema.parse(Object.fromEntries(new URL(req.url).searchParams));
  if(input.id){const result=await access.db.rpc('pro_payment_receipt_read',{p_user:access.user.id,p_id:input.id});if(result.error)return proDbFailure(result.error);return result.data?Response.json({receipt:result.data},{headers}):Response.json({error:'Recibo no encontrado.'},{status:404,headers});}
  const cursor=decodeCursor(input.after,paymentReceiptCursorSchema),result=await access.db.rpc('pro_payment_receipts_page',{p_user:access.user.id,p_query:input.q,p_status:input.status,p_client:input.clientId,p_after:cursor});
  return result.error?proDbFailure(result.error):Response.json({...result.data,nextCursor:encodeCursor(result.data.nextCursor)},{headers});
 }catch{return Response.json({error:'Consulta inválida.'},{status:400,headers});}
}
export async function POST(req:Request){
 const access=await proApiAccess(req);if(access.error)return access.error;
 try{const input=paymentReceiptPrepareSchema.parse(await req.json()),result=await access.db.rpc('pro_payment_receipt_prepare',{p_user:access.user.id,p_entry:input.entryId});if(result.error)return result.error.code==='22023'?Response.json({error:'Revise el abono registrado.'},{status:400,headers}):proDbFailure(result.error);return result.data?Response.json({receipt:result.data},{headers}):Response.json({error:'Abono no encontrado.'},{status:404,headers});}
 catch{return Response.json({error:'Seleccione un abono válido.'},{status:400,headers});}
}
