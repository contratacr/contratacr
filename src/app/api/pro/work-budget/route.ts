import {z} from 'zod';
import {createClient} from '@/lib/supabase/server';
import {safeGetUser} from '@/lib/pro/workspace-user';
import {createAdminClient} from '@/lib/supabase/admin';
import {getApiAdmin} from '@/lib/auth/admin';
import {enforceRateLimit} from '@/lib/rate-limit';
import {proInternalFinanceDenied} from '@/lib/pro/route-common';
import {
  workBudgetMutationSchema,workBudgetResultSchema,workBudgetReceiptSchema,
  workBudgetOverviewSchema,workBudgetCodesPageSchema,workBudgetCodeDetailSchema,
  workBudgetCostsPageSchema,workBudgetCostDetailSchema,workBudgetHistoryPageSchema,workBudgetCostCursorSchema,
  type WorkBudgetMutation,type WorkBudgetResult,
} from '@/lib/pro/work-budget';

const headers={'Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
const local=()=>process.env.NODE_ENV==='development'&&['http://127.0.0.1:54321','http://127.0.0.1:54321/'].includes(process.env.NEXT_PUBLIC_SUPABASE_URL??'');
const fail=(status:number,code:string,error:string)=>Response.json({code,error},{status,headers});
const id=z.string().uuid();
const workId=z.string().min(1).max(160);
const snapshot={after:z.string().optional(),atRevision:z.coerce.number().int().nonnegative().max(2147483647).optional(),atSnapshot:z.string().regex(/^[a-f0-9]{32}$/).optional()};
const query=z.union([
  z.object({view:z.literal('overview'),workId}).strict(),
  z.object({view:z.literal('code'),workId,id}).strict(),
  z.object({view:z.literal('cost'),workId,kind:z.enum(['material','time','expense']),id}).strict(),
  z.object({view:z.literal('codes'),workId,status:z.enum(['all','active','archived']).default('all'),kind:z.enum(['group','item']).optional(),q:z.string().max(160).default(''),...snapshot,after:id.optional()}).strict(),
  z.object({view:z.literal('costs'),workId,codeId:z.union([id,z.literal('unassigned')]).optional(),kind:z.enum(['material','time','expense']).optional(),q:z.string().max(160).default(''),...snapshot,after:workBudgetCostCursorSchema.optional()}).strict(),
  z.object({view:z.literal('history'),workId,after:id.optional()}).strict(),
  z.object({view:z.literal('action'),actionId:id}).strict(),
]).refine(value=>(value.view!=='codes'&&value.view!=='costs')||((value.after===undefined)===(value.atRevision===undefined&&value.atSnapshot===undefined))&&(value.after===undefined||value.atRevision!==undefined&&value.atSnapshot!==undefined));
function dbError(error:{code?:string}){
  if(['40001','23505','23503'].includes(error.code??''))return fail(409,'conflict','El presupuesto o los costos cambiaron. Actualice antes de continuar.');
  if(error.code==='42501')return fail(403,'forbidden','No tiene acceso a esta operación.');
  if(error.code==='P0002')return fail(404,'not_found','No disponible.');
  if(error.code==='54000')return fail(429,'limit','Se alcanzó el límite de esta operación.');
  if(['22023','22007','22008','22021','23514','22P02'].includes(error.code??''))return fail(400,'invalid_input','Revise los datos.');
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
function validResult(input:WorkBudgetMutation,result:WorkBudgetResult){
  return workBudgetReceiptSchema.safeParse({receipt:{input,result}}).success;
}
async function bounded(req:Request){
  if(!req.headers.get('content-type')?.toLowerCase().startsWith('application/json'))throw Error();
  const reader=req.body?.getReader();if(!reader)throw Error();let length=0;const chunks:Uint8Array[]=[];
  try{for(;;){const part=await reader.read();if(part.done)break;length+=part.value.length;if(length>16384){await reader.cancel();throw new RangeError();}chunks.push(part.value);}}finally{reader.releaseLock();}
  const bytes=new Uint8Array(length);let offset=0;for(const part of chunks){bytes.set(part,offset);offset+=part.length;}
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
}
export async function GET(req:Request){
  if(!local())return new Response(null,{status:404,headers});
  try{
    const a=await actor(req);if(a.error)return a.error;
    // Closing round (security review M2): budget, committed and actual costs are internal.
    const denied=await proInternalFinanceDenied();if(denied)return denied;
    const raw:Record<string,string>={};
    for(const [key,value]of new URL(req.url).searchParams){
      if(key in raw)return fail(400,'invalid_input','Consulta inválida.');raw[key]=value;
    }
    const parsed=query.safeParse(raw);if(!parsed.success)return fail(400,'invalid_input','Consulta inválida.');
    const q=parsed.data;
    if(q.view==='action'){
      const r=await a.db.rpc('pro_work_budget_action_read',{p_actor:a.user.id,p_action:q.actionId});
      if(r.error)return dbError(r.error);
      const data=workBudgetReceiptSchema.parse(r.data);
      if(data.receipt&&data.receipt.input.actionId!==q.actionId)return fail(503,'unavailable','Recibo inválido.');
      return Response.json(data,{headers});
    }
    const r=await a.db.rpc('pro_work_budget_read',{
      p_actor:a.user.id,p_work:q.workId,p_view:q.view,
      p_status:'status'in q?q.status:'all',p_query:'q'in q?q.q:'',
      p_code:q.view==='code'||q.view==='cost'?q.id:'codeId'in q?q.codeId??null:null,
      p_kind:'kind'in q?q.kind??null:null,p_after:'after'in q?q.after??null:null,
      p_revision:'atRevision'in q?q.atRevision??null:null,
      p_fingerprint:'atSnapshot'in q?q.atSnapshot??null:null,
    });
    if(r.error)return dbError(r.error);
    const schema=q.view==='overview'?workBudgetOverviewSchema:q.view==='codes'?workBudgetCodesPageSchema
      :q.view==='code'?workBudgetCodeDetailSchema:q.view==='costs'?workBudgetCostsPageSchema:q.view==='cost'?workBudgetCostDetailSchema:workBudgetHistoryPageSchema;
    const data=schema.parse(r.data);
    if(('work'in data?data.work.id:data.workId)!==q.workId||q.view==='code'&&'code'in data&&data.code.id!==q.id)
      return fail(503,'unavailable','No se pudo comprobar el trabajo.');
    if(q.view==='cost'&&'item'in data&&data.item&&(data.item.id!==q.id||data.item.kind!==q.kind))
      return fail(503,'unavailable','No se pudo comprobar el costo.');
    return Response.json(data,{headers});
  }catch{return fail(503,'unavailable','No se pudo consultar el presupuesto.');}
}

export async function POST(req:Request){
  if(!local())return new Response(null,{status:404,headers});
  const url=new URL(req.url);
  if(req.headers.get('origin')!==`${url.protocol}//${req.headers.get('host')||url.host}`)
    return fail(403,'forbidden','Origen no autorizado.');
  try{
    const a=await actor(req,true);if(a.error)return a.error;
    const limit=await enforceRateLimit(req,'work-budget-'+a.user.id,120,60000);
    if(limit)return limit;
    let input:WorkBudgetMutation;
    try{input=workBudgetMutationSchema.parse(await bounded(req));}
    catch(error){return fail(error instanceof RangeError?413:400,'invalid_input','Revise el presupuesto.');}
    const result=await a.db.rpc('pro_work_budget_mutate',{
      p_actor:a.user.id,p_input:input,
    });
    if(result.error)return dbError(result.error);
    const data=workBudgetResultSchema.parse(result.data);
    if(!validResult(input,data))
      return fail(503,'unavailable','No se pudo comprobar el resultado.');
    return Response.json(data,{headers});
  }catch{
    return fail(503,'unavailable','No se pudo comprobar el guardado. Consulte el resultado antes de reintentar.');
  }
}
