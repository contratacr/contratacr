import {z} from 'zod';
import {createClient} from '@/lib/supabase/server';
import {safeGetUser} from '@/lib/pro/workspace-user';
import {createAdminClient} from '@/lib/supabase/admin';
import {getApiAdmin} from '@/lib/auth/admin';
import {enforceRateLimit} from '@/lib/rate-limit';
import {
  privateEstimateWorkInputSchema, privateEstimateWorkContextSchema,
  privateEstimateWorkCandidatesSchema, privateEstimateWorkMappingSchema,
  privateEstimateWorkReceiptSchema, privateEstimateWorkResultSchema,
  type PrivateEstimateWorkInput, type PrivateEstimateWorkResult,
} from '@/lib/pro/private-estimate-work';

const headers={'Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
const local=()=>process.env.NODE_ENV==='development'&&['http://127.0.0.1:54321','http://127.0.0.1:54321/'].includes(process.env.NEXT_PUBLIC_SUPABASE_URL??'');
const fail=(status:number,code:string,error:string)=>Response.json({code,error},{status,headers});
const id=z.string().uuid(),workId=z.string().min(1).max(160);
const query=z.union([
  z.object({view:z.literal('context'),publicationId:id}).strict(),
  z.object({view:z.literal('candidates'),publicationId:id,q:z.string().max(100).optional(),after:workId.optional()}).strict(),
  z.object({view:z.literal('mapping'),publicationId:id}).strict(),
  z.object({view:z.literal('mapping'),workId}).strict(),
  z.object({view:z.literal('action'),actionId:id}).strict(),
]);
function dbError(error:{code?:string}){
  if(['40001','23505'].includes(error.code??''))return fail(409,'conflict','La cotización o el trabajo cambió. Revise antes de continuar.');
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
function validResult(input:PrivateEstimateWorkInput,result:PrivateEstimateWorkResult,owner:string){
  const a=result.agreement,w=result.work;
  return a.publicationId===input.publicationId&&a.contentHash===input.contentHash&&a.workId===input.target.workId
    &&a.acceptedActorId!==owner&&w.id===input.target.workId
    &&(input.target.kind!=='new'||w.stage==='new'&&w.start===''&&w.end===''&&!w.cancelled&&w.bookingClientId===null&&w.quoteId===null&&w.externalQuoteId===null);
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
    const raw:Record<string,string>={};for(const[k,v]of new URL(req.url).searchParams){if(k in raw)return fail(400,'invalid_input','Consulta inválida.');raw[k]=v;}
    const parsed=query.safeParse(raw);if(!parsed.success)return fail(400,'invalid_input','Consulta inválida.');const q=parsed.data;
    if(q.view==='context'){
      const r=await a.db.rpc('pro_private_estimate_work_context',{p_actor:a.user.id,p_publication:q.publicationId});if(r.error)return dbError(r.error);
      const data=privateEstimateWorkContextSchema.parse(r.data);
      if(data.publicationId!==q.publicationId||data.accepted.actorId===a.user.id||data.mapping&&data.mapping.publicationId!==q.publicationId)return fail(503,'unavailable','No se pudo comprobar el origen.');
      return Response.json(data,{headers});
    }
    if(q.view==='candidates'){
      const r=await a.db.rpc('pro_private_estimate_work_candidates',{p_actor:a.user.id,p_publication:q.publicationId,p_query:q.q??'',p_after:q.after??null});if(r.error)return dbError(r.error);
      return Response.json(privateEstimateWorkCandidatesSchema.parse(r.data),{headers});
    }
    if(q.view==='action'){
      const r=await a.db.rpc('pro_private_estimate_work_action_read',{p_actor:a.user.id,p_action:q.actionId});if(r.error)return dbError(r.error);
      const data=privateEstimateWorkReceiptSchema.parse(r.data);
      if(data.receipt&&(data.receipt.input.actionId!==q.actionId||!validResult(data.receipt.input,data.receipt.result,a.user.id)))return fail(503,'unavailable','No se pudo comprobar el recibo.');
      return Response.json(data,{headers});
    }
    const r=await a.db.rpc('pro_private_estimate_work_mapping',{p_actor:a.user.id,p_publication:'publicationId'in q?q.publicationId:null,p_work:'workId'in q?q.workId:null});if(r.error)return dbError(r.error);
    const data=privateEstimateWorkMappingSchema.parse(r.data);
    if(data.agreement&&(data.agreement.acceptedActorId===a.user.id||('publicationId'in q?data.agreement.publicationId!==q.publicationId:data.agreement.workId!==q.workId)))return fail(503,'unavailable','No se pudo comprobar el vínculo.');
    return Response.json(data,{headers});
  }catch{return fail(503,'unavailable','No se pudo cargar el acuerdo.');}
}
export async function POST(req:Request){
  if(!local())return new Response(null,{status:404,headers});
  if(req.headers.get('origin')!==`${new URL(req.url).protocol}//${req.headers.get('host')||new URL(req.url).host}`)return fail(403,'forbidden','Origen no autorizado.');
  try{
    const a=await actor(req,true);if(a.error)return a.error;
    const limit=await enforceRateLimit(req,'private-estimate-work-'+a.user.id,30,60000);if(limit)return limit;
    let input:PrivateEstimateWorkInput;try{input=privateEstimateWorkInputSchema.parse(await bounded(req));}catch(error){return fail(error instanceof RangeError?413:400,'invalid_input','Revise el acuerdo.');}
    const r=await a.db.rpc('pro_private_estimate_work_continue',{p_actor:a.user.id,p_input:input});if(r.error)return dbError(r.error);
    const data=privateEstimateWorkResultSchema.parse(r.data);if(!validResult(input,data,a.user.id))return fail(503,'unavailable','No se pudo comprobar el resultado.');
    return Response.json(data,{headers});
  }catch{return fail(503,'unavailable','No se pudo comprobar el guardado. Consulte el resultado antes de reintentar.');}
}
