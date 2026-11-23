import {z} from 'zod';
import {createClient} from '@/lib/supabase/server';
import {safeGetUser} from '@/lib/pro/workspace-user';
import {createAdminClient} from '@/lib/supabase/admin';
import {getApiAdmin} from '@/lib/auth/admin';
import {enforceRateLimit} from '@/lib/rate-limit';
import {leadOriginMutationSchema,leadOriginResultSchema,leadOriginReceiptSchema,leadOriginChannelIdSchema,leadOriginChannelDetailSchema,leadOriginChannelsPageSchema,leadOriginContextSchema,leadOriginHistoryPageSchema,leadOriginBatchSchema,leadOriginPageSchema,leadOriginMetricsSchema} from '@/lib/pro/lead-origins';
import {requestPipelineStageIdSchema} from '@/lib/pro/request-pipeline';
import {taskDueDate} from '@/lib/pro/work-tasks';
import {PRO_ENABLED} from '@/lib/pro/enabled';
const headers={'Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff'};
const fail=(status:number,error:string)=>Response.json({error},{status,headers});
const dbError=(error:{code?:string})=>fail(['40001','54000','23505'].includes(error.code||'')?409:error.code==='42501'?403:error.code==='P0002'?404:['22023','22007','22008','22021','23514','22P02'].includes(error.code||'')?400:503,error.code==='40001'?'La atribución o el canal cambió. Actualice antes de continuar.':'No se pudo completar el cambio.');
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
 const reader=req.body?.getReader();if(!reader)throw Error();let length=0;const chunks:Uint8Array[]=[];
 try{while(true){const part=await reader.read();if(part.done)break;length+=part.value.length;if(length>8*1024){await reader.cancel();throw new RangeError();}chunks.push(part.value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return JSON.parse(new TextDecoder().decode(bytes));
}
const id=z.string().uuid(),kind=z.enum(['manual','request']),token=z.string().regex(/^[a-f0-9]{32}$/),cursor=z.string().regex(/^(manual|request):[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/),channel=leadOriginChannelIdSchema;
const filters={status:z.enum(['active','archived']).optional(),stageId:requestPipelineStageIdSchema.optional(),q:z.string().max(100).optional()};
const query=z.discriminatedUnion('view',[
 z.object({view:z.literal('channels'),status:filters.status,q:filters.q,after:channel.optional(),atSnapshot:token.optional()}).strict(),
 z.object({view:z.literal('channel'),channelId:channel}).strict(),
 z.object({view:z.literal('context'),kind,id}).strict(),
 z.object({view:z.literal('history'),kind,id,after:id.optional()}).strict(),
 z.object({view:z.literal('action'),actionId:id}).strict(),
 z.object({view:z.literal('batch'),refs:z.string().max(4000)}).strict(),
 z.object({view:z.literal('list'),...filters,channelId:z.union([z.literal('unspecified'),channel]).optional(),after:cursor.optional(),atSnapshot:token.optional()}).strict(),
 z.object({view:z.literal('metrics'),...filters,from:taskDueDate.unwrap().optional(),to:taskDueDate.unwrap().optional(),after:z.union([z.literal('unspecified'),channel]).optional(),atSnapshot:token.optional()}).strict(),
]);
const refsSchema=z.array(z.object({kind,id}).strict()).max(20).refine(v=>new Set(v.map(i=>i.kind+':'+i.id)).size===v.length);
const local=()=>PRO_ENABLED;
export async function GET(req:Request){
 if(!local())return new Response(null,{status:404,headers});
 try{const a=await actor(req);if(a.error)return a.error;const raw:Record<string,string>={};for(const[k,v]of new URL(req.url).searchParams){if(k in raw)return fail(400,'Consulta inválida.');raw[k]=v;}const parsed=query.safeParse(raw);if(!parsed.success)return fail(400,'Consulta inválida.');const q=parsed.data;
  if((q.view==='channels'||q.view==='list'||q.view==='metrics')&&!!q.after!==!!q.atSnapshot)return fail(400,'Consulta inválida.');
  if(q.view==='action'){const r=await a.db.rpc('pro_lead_origin_action_read',{p_actor:a.user.id,p_action:q.actionId});if(r.error)return dbError(r.error);const value=leadOriginReceiptSchema.parse(r.data);if(value.receipt&&value.receipt.input.actionId!==q.actionId)return fail(503,'No se pudo comprobar el recibo.');return Response.json(value,{headers});}
  if(q.view==='channel'){const r=await a.db.rpc('pro_lead_origin_channel_json',{p_actor:a.user.id,p_id:q.channelId});if(r.error)return dbError(r.error);if(!r.data)return fail(404,'Canal no disponible.');const value=leadOriginChannelDetailSchema.parse({channel:r.data});if(value.channel.id!==q.channelId)return fail(503,'No se pudo comprobar el canal.');return Response.json(value,{headers});}
  if(q.view==='channels'){const r=await a.db.rpc('pro_lead_origin_channels_read',{p_actor:a.user.id,p_status:q.status??'active',p_query:q.q??'',p_after:q.after??null,p_snapshot:q.atSnapshot??null});if(r.error)return dbError(r.error);return Response.json(leadOriginChannelsPageSchema.parse(r.data),{headers});}
  if(q.view==='context'){const r=await a.db.rpc('pro_lead_origin_context',{p_actor:a.user.id,p_kind:q.kind,p_id:q.id});if(r.error)return dbError(r.error);const value=leadOriginContextSchema.parse(r.data);if(value.origin.kind!==q.kind||value.origin.id!==q.id)return fail(503,'No se pudo comprobar el origen.');return Response.json(value,{headers});}
  if(q.view==='history'){const r=await a.db.rpc('pro_lead_origin_history_read',{p_actor:a.user.id,p_kind:q.kind,p_id:q.id,p_after:q.after??null});if(r.error)return dbError(r.error);const value=leadOriginHistoryPageSchema.parse(r.data);if(value.items.some(h=>h.after.kind!==q.kind||h.after.id!==q.id))return fail(503,'No se pudo comprobar el historial.');return Response.json(value,{headers});}
  if(q.view==='batch'){let refs;try{refs=refsSchema.parse(JSON.parse(q.refs));}catch{return fail(400,'Referencias inválidas.');}const r=await a.db.rpc('pro_lead_origin_batch',{p_actor:a.user.id,p_refs:refs});if(r.error)return dbError(r.error);const value=leadOriginBatchSchema.parse(r.data);if(value.items.length!==refs.length||value.items.some((i,n)=>i.kind!==refs[n].kind||i.id!==refs[n].id))return fail(503,'No se pudo comprobar el conjunto.');return Response.json(value,{headers});}
  if(q.view==='list'){const r=await a.db.rpc('pro_lead_origin_list',{p_actor:a.user.id,p_status:q.status??'active',p_stage:q.stageId??null,p_query:q.q??'',p_channel:q.channelId??null,p_after:q.after??null,p_snapshot:q.atSnapshot??null});if(r.error)return dbError(r.error);return Response.json(leadOriginPageSchema.parse(r.data),{headers});}
  if(q.from&&q.to&&q.from>q.to)return fail(400,'Período inválido.');const r=await a.db.rpc('pro_lead_origin_metrics',{p_actor:a.user.id,p_status:q.status??'active',p_stage:q.stageId??null,p_query:q.q??'',p_from:q.from??null,p_to:q.to??null,p_after:q.after??null,p_snapshot:q.atSnapshot??null});if(r.error)return dbError(r.error);return Response.json(leadOriginMetricsSchema.parse(r.data),{headers});
 }catch{return fail(503,'No se pudieron cargar los canales comerciales.');}
}
export async function POST(req:Request){
 if(!local())return new Response(null,{status:404,headers});
 if(req.headers.get('origin')!==`${new URL(req.url).protocol}//${req.headers.get('host')||new URL(req.url).host}`)return fail(403,'Origen no autorizado.');
 try{const a=await actor(req);if(a.error)return a.error;const limit=await enforceRateLimit(req,'lead-origins-'+a.user.id,60,60000);if(limit)return limit;
  let input;try{input=leadOriginMutationSchema.parse(await bounded(req));}catch(error){return fail(error instanceof RangeError?413:400,'Revise el canal comercial.');}
  const r=await a.db.rpc('pro_lead_origin_mutate',{p_actor:a.user.id,p_input:input});if(r.error)return dbError(r.error);const value=leadOriginResultSchema.parse(r.data);if(value.action!==input.action||value.type==='origin'&&(!('kind'in input)||value.origin.kind!==input.kind||value.origin.id!==input.id)||value.type==='channel'&&(!('channelId'in input)||value.channel.id!==input.channelId))return fail(503,'No se pudo comprobar el cambio.');return Response.json(value,{headers});
 }catch{return fail(503,'No se pudo comprobar el cambio. Reintente la misma operación.');}
}
