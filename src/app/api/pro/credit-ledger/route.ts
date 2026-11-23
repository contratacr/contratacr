import {creditLedgerQuerySchema,creditLedgerSchema} from '@/lib/pro/credits-retainers';
import {proActor,proDbError,proFail,proQuery,proRouteHeaders,proInternalFinanceDenied} from '@/lib/pro/route-common';
import {PRO_ENABLED} from '@/lib/pro/enabled';

// Row 50: read-only ledger of retainers, credit notes, overpayments and refunds per project or per customer. Signed, append-only
// entries with a running balance; reversals appear as inverse entries. Internal, non-fiscal: nothing is charged or sent.
export async function GET(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers:proRouteHeaders});
 try{
  const a=await proActor(req);if(a.error)return a.error;
  const denied=await proInternalFinanceDenied();if(denied)return denied;
  const raw=proQuery(req);if(!raw)return proFail(400,'Consulta inválida.');
  const parsed=creditLedgerQuerySchema.safeParse(raw);if(!parsed.success)return proFail(400,'Consulta inválida.');
  const result=await a.db.rpc('pro_credit_ledger_read',{p_actor:a.user.id,p_query:parsed.data});
  if(result.error)return proDbError(result.error,'El libro cambió. Actualice.');
  if(!result.data)return proFail(404,'Trabajo o cliente no disponible.');
  return Response.json(creditLedgerSchema.parse(result.data),{headers:proRouteHeaders});
 }catch{return proFail(503,'No se pudo cargar el libro. Reintente.');}
}
