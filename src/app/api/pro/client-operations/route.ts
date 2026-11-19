import {z} from 'zod';
import {proApiAccess,proDbFailure} from '@/lib/pro/api-access';
import {operationSchema} from '@/lib/pro/client-operations';
import {decodeCursor,encodeCursor} from '@/lib/pro/panel-queries';
const headers={'Cache-Control':'no-store'};
const query=z.object({clientId:z.string().min(1).max(160),workId:z.string().max(160).default(''),after:z.string().max(1000).default(''),entriesAfter:z.string().max(1000).default('')});
export async function GET(req:Request){
 const access=await proApiAccess(req);if(access.error)return access.error;
 try{
  const {clientId,workId,after,entriesAfter}=query.parse(Object.fromEntries(new URL(req.url).searchParams));
  const cursor=decodeCursor(after,z.object({at:z.string().max(40),id:z.string().min(1).max(160)}));
  const entryCursor=decodeCursor(entriesAfter,z.object({position:z.string().regex(/^\d{1,18}$/)}));
  const result=await access.db.rpc('pro_client_operations_page',{p_user:access.user.id,p_client:clientId,p_work:workId,p_after:cursor,p_entries_after:entryCursor});
  if(result.error)return proDbFailure(result.error);
  if(!result.data)return Response.json({error:'Registro no encontrado'},{status:404,headers});
  return Response.json({...result.data,nextCursor:encodeCursor(result.data.nextCursor),nextEntryCursor:encodeCursor(result.data.nextEntryCursor)},{headers});
 }catch{return Response.json({error:'Consulta inválida'},{status:400,headers});}
}
export async function POST(req:Request){
 const access=await proApiAccess(req);if(access.error)return access.error;
 try{
  const {revision,...input}=operationSchema.parse(await req.json());
  const result=await access.db.rpc('pro_record_client_operation',{p_user:access.user.id,p_input:input,p_revision:revision});
  if(result.error){
   if(result.error.code==='22023'||result.error.code==='23514'||result.error.code==='23503'||result.error.code==='23505')return Response.json({error:'Revise el trabajo, el saldo y las existencias. No se guardó ningún cambio.'},{status:400,headers});
   return proDbFailure(result.error);
  }
  return Response.json({revision:result.data},{headers});
 }catch{return Response.json({error:'Revise los datos del registro.'},{status:400,headers});}
}
