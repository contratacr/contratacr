import {proApiAccess,proDbFailure} from '@/lib/pro/api-access';
import {decodeCursor,encodeCursor} from '@/lib/pro/panel-queries';
import {paymentOverviewQuery,paymentOverviewCursor} from '@/lib/pro/payment-overview';
const headers={'Cache-Control':'private, no-store'};
export async function GET(req:Request){
 const access=await proApiAccess(req);if(access.error)return access.error;
 try{
  const input=paymentOverviewQuery.parse(Object.fromEntries(new URL(req.url).searchParams));
  const cursor=decodeCursor(input.after,paymentOverviewCursor);
  const result=input.id?await access.db.rpc('pro_payment_overview_read',{p_user:access.user.id,p_id:input.id,p_client:input.clientId,p_after:cursor}):await access.db.rpc('pro_payment_overview_page',{p_user:access.user.id,p_query:input.q,p_status:input.status,p_client:input.clientId,p_after:cursor,p_from:input.from||null,p_through:input.through||null});
  if(result.error)return result.error.code==='22023'?Response.json({error:'Consulta inválida.'},{status:400,headers}):proDbFailure(result.error);
  if(!result.data)return Response.json({error:'Pago no encontrado.'},{status:404,headers});
  if(input.id)return Response.json({...result.data,nextCursor:encodeCursor(result.data.nextCursor)},{headers});
  // Applied credit notes are a separate total: they reduce what customers owe but are not received money.
  const notes=await access.db.rpc('pro_payment_overview_credit_notes',{p_user:access.user.id,p_query:input.q,p_client:input.clientId,p_from:input.from||null,p_through:input.through||null});
  if(notes.error)return notes.error.code==='22023'?Response.json({error:'Consulta inválida.'},{status:400,headers}):proDbFailure(notes.error);
  return Response.json({...result.data,summary:{...result.data.summary,...notes.data},nextCursor:encodeCursor(result.data.nextCursor)},{headers});
 }catch{return Response.json({error:'Consulta inválida.'},{status:400,headers});}
}
