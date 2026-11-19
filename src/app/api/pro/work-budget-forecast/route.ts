import {z} from 'zod';
import {createClient} from '@/lib/supabase/server';
import {safeGetUser} from '@/lib/pro/workspace-user';
import {createAdminClient} from '@/lib/supabase/admin';
import {getApiAdmin} from '@/lib/auth/admin';
import {enforceRateLimit} from '@/lib/rate-limit';
import {proCustomerReader,proInternalFinanceDenied} from '@/lib/pro/route-common';
import {budgetExtrasMutationSchema,budgetExtrasResultSchema,budgetForecastSchema,clientBudgetSummarySchema} from '@/lib/pro/cost-codes';

// Row 54 (Ronda F1-B): budget forecast with markup/VAT per line (owner, internal finance roles only), the owner's
// explicit share/revoke of a client summary and the linked customer's read of that summary (?requestId=), which
// only ever carries groups and sale totals.
const headers={'Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
const local=()=>process.env.NODE_ENV==='development'&&['http://127.0.0.1:54321','http://127.0.0.1:54321/'].includes(process.env.NEXT_PUBLIC_SUPABASE_URL??'');
const fail=(status:number,code:string,error:string)=>Response.json({code,error},{status,headers});
const id=z.string().uuid();
const query=z.union([z.object({workId:z.string().min(1).max(160)}).strict(),z.object({requestId:id}).strict()]);
function dbError(error:{code?:string}){
 if(['40001','23505','23503'].includes(error.code??''))return fail(409,'conflict','El presupuesto cambió. Actualice antes de continuar.');
 if(error.code==='42501')return fail(403,'forbidden','No tiene acceso a esta operación.');
 if(error.code==='P0002')return fail(404,'not_found','No disponible.');
 if(error.code==='54000')return fail(429,'limit','El presupuesto llegó a 500 códigos.');
 if(['22023','22007','22008','22021','23514','22P02','22003'].includes(error.code??''))return fail(400,'invalid_input','Revise los datos.');
 return fail(503,'unavailable','No se pudo completar la operación.');
}
async function actor(req:Request,writing=false){
 const user=await safeGetUser(await createClient());
 if(!user)return{error:fail(401,'unauthenticated','Inicie sesión.')};
 const expected=req.headers.get('x-pro-expected-actor');
 if((writing||expected!==null)&&(!id.safeParse(expected).success||expected!==user.id))return{error:fail(403,'forbidden','La cuenta cambió.')};
 const db=createAdminClient(),profile=await db.from('profiles').select('is_disabled,role').eq('id',user.id).maybeSingle();
 if(profile.error)return{error:fail(503,'unavailable','No se pudo comprobar el acceso.')};
 if(!profile.data||profile.data.is_disabled||profile.data.role==='admin'&&!await getApiAdmin())return{error:fail(403,'forbidden','Sin acceso.')};
 return{user,db};
}
async function bounded(req:Request){
 if(!req.headers.get('content-type')?.toLowerCase().startsWith('application/json'))throw Error();
 const reader=req.body?.getReader();if(!reader)throw Error();let length=0;const chunks:Uint8Array[]=[];
 try{for(;;){const part=await reader.read();if(part.done)break;length+=part.value.length;if(length>32768){await reader.cancel();throw new RangeError();}chunks.push(part.value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(length);let offset=0;for(const part of chunks){bytes.set(part,offset);offset+=part.length;}
 return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
}
export async function GET(req:Request){
 if(!local())return new Response(null,{status:404,headers});
 try{
  const a=await actor(req);if(a.error)return a.error;
  const raw:Record<string,string>={};
  for(const [key,value] of new URL(req.url).searchParams){if(key in raw)return fail(400,'invalid_input','Consulta inválida.');raw[key]=value;}
  const parsed=query.safeParse(raw);if(!parsed.success)return fail(400,'invalid_input','Consulta inválida.');
  if('requestId' in parsed.data){
   // Customer side (also the owner's «Customer view» preview through proCustomerReader): groups and sale totals only.
   const r=await a.db.rpc('pro_cost_code_client_read',{p_actor:await proCustomerReader(a.db,a.user.id,parsed.data.requestId),p_request:parsed.data.requestId});
   if(r.error)return dbError(r.error);
   if(!r.data)return fail(404,'not_found','Cita no disponible.');
   return Response.json(clientBudgetSummarySchema.parse(r.data),{headers});
  }
  const denied=await proInternalFinanceDenied();if(denied)return denied;
  const r=await a.db.rpc('pro_cost_code_forecast_read',{p_actor:a.user.id,p_work:parsed.data.workId});
  if(r.error)return dbError(r.error);
  const data=budgetForecastSchema.parse(r.data);
  if(data.work.id!==parsed.data.workId)return fail(503,'unavailable','No se pudo comprobar el trabajo.');
  return Response.json(data,{headers});
 }catch{return fail(503,'unavailable','No se pudo consultar el presupuesto.');}
}
export async function POST(req:Request){
 if(!local())return new Response(null,{status:404,headers});
 const url=new URL(req.url);
 if(req.headers.get('origin')!==`${url.protocol}//${req.headers.get('host')||url.host}`)return fail(403,'forbidden','Origen no autorizado.');
 try{
  const a=await actor(req,true);if(a.error)return a.error;
  const denied=await proInternalFinanceDenied();if(denied)return denied;
  const limit=await enforceRateLimit(req,'work-budget-forecast-'+a.user.id,120,60000);if(limit)return limit;
  let input;
  try{input=budgetExtrasMutationSchema.parse(await bounded(req));}
  catch(error){return fail(error instanceof RangeError?413:400,'invalid_input','Revise el presupuesto.');}
  const result=await a.db.rpc('pro_cost_code_extras_mutate',{p_actor:a.user.id,p_input:input});
  if(result.error)return dbError(result.error);
  const data=budgetExtrasResultSchema.parse(result.data);
  if(data.action!==input.action||data.workId!==input.workId||data.revision!==input.revision+1)return fail(503,'unavailable','No se pudo comprobar el resultado.');
  return Response.json(data,{headers});
 }catch{return fail(503,'unavailable','No se pudo comprobar el guardado. Actualice antes de reintentar.');}
}
