import {z} from 'zod';
import {proApiAccess,proDbFailure} from '@/lib/pro/api-access';
const headers={'Cache-Control':'no-store, private'};
const cursor=z.object({at:z.string().datetime({offset:true}),source:z.enum(['request','manual']),id:z.string().min(1).max(160)}).strict();
export async function GET(req:Request){
 const access=await proApiAccess(req);if(access.error)return access.error;
 try{
  const query=new URL(req.url).searchParams,status=z.enum(['pending','confirmed','completed','cancelled','all']).parse(query.get('status')||'pending');
  const raw=query.get('after');if(raw&&raw.length>1000)throw Error();
  const after=raw?cursor.parse(JSON.parse(Buffer.from(raw,'base64url').toString('utf8'))):null;
  const result=await access.db.rpc('pro_appointment_inbox',{p_owner:access.user.id,p_status:status,p_after:after});
  if(result.error)return proDbFailure(result.error);
  return Response.json({...result.data,nextCursor:result.data.nextCursor?Buffer.from(JSON.stringify(result.data.nextCursor)).toString('base64url'):null},{headers});
 }catch{return Response.json({error:'Consulta inválida'},{status:400,headers});}
}
