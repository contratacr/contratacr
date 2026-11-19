import {proCustomerReader} from '@/lib/pro/route-common';
import {z} from 'zod';
import {createClient} from '@/lib/supabase/server';
import {safeGetUser} from '@/lib/pro/workspace-user';
import {createAdminClient} from '@/lib/supabase/admin';
import {getApiAdmin} from '@/lib/auth/admin';
import {enforceRateLimit} from '@/lib/rate-limit';
import {clientDashboardMutationSchema} from '@/lib/pro/client-dashboard';
const headers={'Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff'};
const fail=(status:number,error:string)=>Response.json({error},{status,headers});
const dbError=(error:{code?:string})=>fail(error.code==='40001'?409:error.code==='42501'?403:error.code==='54000'?429:['22023','22008','22007','23514','23505','22P02'].includes(error.code||'')?400:503,error.code==='40001'?'La vista del cliente cambió. Actualice antes de guardar.':'No se pudo completar la operación.');
async function actor(req:Request){
 const user=await safeGetUser(await createClient());if(!user)return{error:fail(401,'Inicie sesión.')};
 const expected=req.headers.get('x-pro-expected-actor');if(expected!==null&&(!z.string().uuid().safeParse(expected).success||expected!==user.id))return{error:fail(403,'La cuenta cambió.')};
 const db=createAdminClient(),profile=await db.from('profiles').select('is_disabled,role').eq('id',user.id).maybeSingle();
 if(profile.error)return{error:fail(503,'No se pudo comprobar el acceso.')};
 if(!profile.data||profile.data.is_disabled||profile.data.role==='admin'&&!await getApiAdmin())return{error:fail(403,'Sin acceso.')};
 return{user,db};
}
async function bounded(req:Request){
 if(!req.headers.get('content-type')?.toLowerCase().startsWith('application/json'))throw Error();
 const reader=req.body?.getReader();if(!reader)throw Error();const chunks:Uint8Array[]=[];let length=0;
 try{while(true){const part=await reader.read();if(part.done)break;length+=part.value.byteLength;if(length>16384){await reader.cancel();throw new RangeError();}chunks.push(part.value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return JSON.parse(new TextDecoder().decode(bytes));
}
export async function GET(req:Request){
 if(process.env.NODE_ENV!=='development')return new Response(null,{status:404,headers});
 try{
  const a=await actor(req);if(a.error)return a.error;const q=new URL(req.url).searchParams;
  if(q.has('requestId')){
   for(const key of q.keys())if(key!=='requestId')return fail(400,'Consulta inválida.');
   const request=z.string().uuid().safeParse(q.get('requestId'));if(!request.success)return fail(400,'Consulta inválida.');
   const result=await a.db.rpc('pro_client_dashboard_client_read',{p_actor:await proCustomerReader(a.db,a.user.id,request.data),p_request:request.data});
   if(result.error)return dbError(result.error);return result.data?Response.json(result.data,{headers}):fail(404,'Cita no disponible.');
  }
  for(const key of q.keys())if(key!=='workId')return fail(400,'Consulta inválida.');
  const work=z.string().trim().min(1).max(160).safeParse(q.get('workId'));if(!work.success)return fail(400,'Consulta inválida.');
  const result=await a.db.rpc('pro_client_dashboard_read',{p_actor:a.user.id,p_work:work.data});
  if(result.error)return dbError(result.error);return result.data?Response.json(result.data,{headers}):fail(404,'Trabajo no disponible.');
 }catch{return fail(503,'No se pudo cargar la vista del cliente. Reintente.');}
}
export async function POST(req:Request){
 if(process.env.NODE_ENV!=='development')return new Response(null,{status:404,headers});
 if(req.headers.get('origin')!==`${new URL(req.url).protocol}//${req.headers.get('host')||new URL(req.url).host}`)return fail(403,'Origen no autorizado.');
 try{
  const a=await actor(req);if(a.error)return a.error;
  const limited=await enforceRateLimit(req,'client-dashboard-'+a.user.id,60,60000);if(limited)return limited;
  let input;try{input=clientDashboardMutationSchema.parse(await bounded(req));}catch(cause){return fail(cause instanceof RangeError?413:400,'Revise la vista del cliente.');}
  const result=await a.db.rpc('pro_client_dashboard_mutate',{p_actor:a.user.id,p_input:input});
  if(result.error)return dbError(result.error);return Response.json(result.data,{headers});
 }catch{return fail(503,'No se pudo comprobar el guardado. Reintente la misma operación.');}
}
