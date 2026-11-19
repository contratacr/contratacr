import {z} from 'zod';
import {proApiAccess,proDbFailure} from '@/lib/pro/api-access';
import {decodeCursor,encodeCursor} from '@/lib/pro/panel-queries';
import {clientPendingCursor} from '@/lib/pro/client-pending';
const headers={'Cache-Control':'no-store'};
export async function GET(req:Request){
 const access=await proApiAccess(req);if(access.error)return access.error;
 try{
  const query=z.object({clientId:z.string().min(1).max(160),after:z.string().max(1000).default('')}).parse(Object.fromEntries(new URL(req.url).searchParams));
  const result=await access.db.rpc('pro_client_pending_work_page',{p_user:access.user.id,p_client:query.clientId,p_after:decodeCursor(query.after,clientPendingCursor)});
  if(result.error)return result.error.code==='42501'?Response.json({error:'Sin acceso'},{status:403,headers}):proDbFailure(result.error);
  if(!result.data)return Response.json({error:'Cliente no encontrado'},{status:404,headers});
  return Response.json({...result.data,nextCursor:encodeCursor(result.data.nextCursor)},{headers});
 }catch{return Response.json({error:'Consulta inválida'},{status:400,headers});}
}
