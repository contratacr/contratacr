import {proApiAccess,proDbFailure} from '@/lib/pro/api-access';
import {decodeCursor,encodeCursor} from '@/lib/pro/panel-queries';
import {clientStatementQuery,clientStatementCursor} from '@/lib/pro/client-statement';
const headers={'Cache-Control':'private, no-store'};
export async function GET(req:Request){
 const access=await proApiAccess(req);if(access.error)return access.error;
 try{
  const input=clientStatementQuery.parse(Object.fromEntries(new URL(req.url).searchParams));
  const result=await access.db.rpc('pro_client_statement_page',{p_user:access.user.id,p_client:input.clientId,p_after:decodeCursor(input.after,clientStatementCursor)});
  if(result.error)return result.error.code==='22023'?Response.json({error:'Consulta inválida.'},{status:400,headers}):proDbFailure(result.error);
  if(!result.data)return Response.json({error:'Cliente no encontrado.'},{status:404,headers});
  return Response.json({...result.data,nextCursor:encodeCursor(result.data.nextCursor)},{headers});
 }catch{return Response.json({error:'Consulta inválida.'},{status:400,headers});}
}
