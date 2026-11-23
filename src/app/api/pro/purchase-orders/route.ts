import {z} from 'zod';
import {createClient} from '@/lib/supabase/server';
import {safeGetUser} from '@/lib/pro/workspace-user';
import {createAdminClient} from '@/lib/supabase/admin';
import {getApiAdmin} from '@/lib/auth/admin';
import {enforceRateLimit} from '@/lib/rate-limit';
import {proInternalFinanceDenied} from '@/lib/pro/route-common';
import {purchaseOrderListQuerySchema,purchaseOrderMutationSchema} from '@/lib/pro/purchase-orders';
import {PRO_ENABLED} from '@/lib/pro/enabled';
// Families 51/52/54: owner purchase orders per job, receipts, manual payments and budget commitments.
const headers={'Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff'};
const fail=(status:number,error:string)=>Response.json({error},{status,headers});
const dbError=(error:{code?:string})=>fail(error.code==='40001'||error.code==='23505'?409:error.code==='42501'?403:error.code==='54000'?429:['22023','22008','22007','23514','22P02','22003','23503'].includes(error.code||'')?400:503,error.code==='40001'?'La orden de compra cambió. Actualice antes de guardar.':error.code==='23505'?'Esa orden de compra ya existe.':'No se pudo completar la operación.');
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
 try{while(true){const part=await reader.read();if(part.done)break;length+=part.value.byteLength;if(length>65536){await reader.cancel();throw new RangeError();}chunks.push(part.value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return JSON.parse(new TextDecoder().decode(bytes));
}
const single=z.object({workId:z.string().trim().min(1).max(160)});
export async function GET(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 try{
  const a=await actor(req);if(a.error)return a.error;
  // Closing round (security review M2): purchase-order lines carry the internal cost.
  const denied=await proInternalFinanceDenied();if(denied)return denied;
  const q=new URL(req.url).searchParams,keys=[...q.keys()];
  if(new Set(keys).size!==keys.length||!q.has('workId'))return fail(400,'Consulta inválida.');
  const raw=Object.fromEntries(q.entries());let query:Record<string,string>;
  if(raw.view==='detail'){const parsed=single.extend({view:z.literal('detail'),id:z.string().uuid()}).strict().safeParse(raw);if(!parsed.success)return fail(400,'Consulta inválida.');query=parsed.data;}
  else if(raw.view==='budget'){const parsed=single.extend({view:z.literal('budget')}).strict().safeParse(raw);if(!parsed.success)return fail(400,'Consulta inválida.');query=parsed.data;}
  else{const parsed=purchaseOrderListQuerySchema.safeParse(raw);if(!parsed.success)return fail(400,'Consulta inválida.');query=Object.fromEntries(Object.entries(parsed.data).filter(([,value])=>value!==undefined)) as Record<string,string>;}
  const result=await a.db.rpc('pro_purchase_orders_read',{p_actor:a.user.id,p_query:query});
  if(result.error)return dbError(result.error);return result.data?Response.json(result.data,{headers}):fail(404,'Trabajo no disponible.');
 }catch{return fail(503,'No se pudieron cargar las órdenes de compra. Reintente.');}
}
export async function POST(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 if(req.headers.get('origin')!==`${new URL(req.url).protocol}//${req.headers.get('host')||new URL(req.url).host}`)return fail(403,'Origen no autorizado.');
 try{
  const a=await actor(req);if(a.error)return a.error;
  const limited=await enforceRateLimit(req,'purchase-orders-'+a.user.id,120,60000);if(limited)return limited;
  let input;try{input=purchaseOrderMutationSchema.parse(await bounded(req));}catch(cause){return fail(cause instanceof RangeError?413:400,'Revise los datos de la orden de compra.');}
  const result=await a.db.rpc('pro_purchase_orders_mutate',{p_actor:a.user.id,p_input:input});
  if(result.error)return dbError(result.error);return Response.json(result.data,{headers});
 }catch{return fail(503,'No se pudo comprobar el guardado. Reintente la misma operación.');}
}
