import {z} from 'zod';
import {createClient} from '@/lib/supabase/server';
import {safeGetUser} from '@/lib/pro/workspace-user';
import {createAdminClient} from '@/lib/supabase/admin';
import {getApiAdmin} from '@/lib/auth/admin';
import {enforceRateLimit} from '@/lib/rate-limit';
import {leadOriginChannelIdSchema} from '@/lib/pro/lead-origins';
import {requestPipelineStageIdSchema} from '@/lib/pro/request-pipeline';
import {taskDueDate} from '@/lib/pro/work-tasks';
import {LeadImportFileError,leadImportPreviewSchema,leadImportRequestSchema,leadImportResultSchema,leadImportsPageSchema,leadInboxFunnelSchema,leadInboxPageSchema,leadInboxReceiptSchema,leadSnoozeMutationSchema,leadSnoozeReadSchema,leadSnoozeResultSchema,parseLeadImportCsv} from '@/lib/pro/lead-inboxes';

const headers={'Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff'};
const fail=(status:number,error:string,extra:Record<string,unknown>={})=>Response.json({error,...extra},{status,headers});
const dbError=(error:{code?:string})=>fail(['40001','54000','23505'].includes(error.code||'')?409:error.code==='42501'?403:error.code==='P0002'?404:['22023','22007','22008','22021','23514','22P02'].includes(error.code||'')?400:503,error.code==='40001'?'Las solicitudes cambiaron. Actualice antes de continuar.':'No se pudo completar el cambio.');
async function actor(req:Request){
 const user=await safeGetUser(await createClient());if(!user)return{error:fail(401,'Inicie sesión.')};
 const expected=req.headers.get('x-pro-expected-actor');if(expected!==null&&(!z.string().uuid().safeParse(expected).success||expected!==user.id))return{error:fail(403,'La cuenta cambió.')};
 const db=createAdminClient(),profile=await db.from('profiles').select('is_disabled,role').eq('id',user.id).maybeSingle();
 if(profile.error)return{error:fail(503,'No se pudo comprobar el acceso.')};
 if(!profile.data||profile.data.is_disabled||profile.data.role==='admin'&&!await getApiAdmin())return{error:fail(403,'Sin acceso.')};
 return{user,db};
}
async function bounded(req:Request,limit:number){
 if(!req.headers.get('content-type')?.toLowerCase().startsWith('application/json'))throw Error();
 const reader=req.body?.getReader();if(!reader)throw Error();let length=0;const chunks:Uint8Array[]=[];
 try{while(true){const part=await reader.read();if(part.done)break;length+=part.value.length;if(length>limit){await reader.cancel();throw new RangeError();}chunks.push(part.value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return{value:JSON.parse(new TextDecoder().decode(bytes)) as unknown,length};
}
const id=z.string().uuid(),kind=z.enum(['manual','request']),token=z.string().regex(/^[a-f0-9]{32}$/),cursor=z.string().regex(/^(manual|request):[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/),date=taskDueDate.unwrap();
const query=z.discriminatedUnion('view',[
 z.object({view:z.literal('list'),box:z.enum(['active','snoozed','archived']).optional(),stageId:requestPipelineStageIdSchema.optional(),q:z.string().max(100).optional(),service:z.string().trim().min(1).max(160).optional(),channelId:z.union([z.literal('unspecified'),leadOriginChannelIdSchema]).optional(),from:date.optional(),to:date.optional(),after:cursor.optional(),atSnapshot:token.optional(),assignee:z.union([z.literal('unassigned'),id]).optional()}).strict(),
 z.object({view:z.literal('funnel'),from:date,to:date}).strict(),
 z.object({view:z.literal('imports'),after:id.optional()}).strict(),
 z.object({view:z.literal('snooze'),kind,id}).strict(),
 z.object({view:z.literal('action'),actionId:id}).strict(),
]);
const local=()=>process.env.NODE_ENV==='development'&&['http://127.0.0.1:54321','http://127.0.0.1:54321/'].includes(process.env.NEXT_PUBLIC_SUPABASE_URL??'');
export async function GET(req:Request){
 if(!local())return new Response(null,{status:404,headers});
 try{const a=await actor(req);if(a.error)return a.error;const raw:Record<string,string>={};for(const[k,v]of new URL(req.url).searchParams){if(k in raw)return fail(400,'Consulta inválida.');raw[k]=v;}const parsed=query.safeParse(raw);if(!parsed.success)return fail(400,'Consulta inválida.');const q=parsed.data;
  if(q.view==='action'){const r=await a.db.rpc('pro_lead_inbox_action_read',{p_actor:a.user.id,p_action:q.actionId});if(r.error)return dbError(r.error);return Response.json(leadInboxReceiptSchema.parse(r.data),{headers});}
  if(q.view==='snooze'){const r=await a.db.rpc('pro_lead_snooze_read',{p_actor:a.user.id,p_kind:q.kind,p_id:q.id});if(r.error)return dbError(r.error);const value=leadSnoozeReadSchema.parse(r.data);if(value.snooze.kind!==q.kind||value.snooze.id!==q.id)return fail(503,'No se pudo comprobar la solicitud.');return Response.json(value,{headers});}
  if(q.view==='imports'){const r=await a.db.rpc('pro_lead_imports_read',{p_actor:a.user.id,p_after:q.after??null});if(r.error)return dbError(r.error);return Response.json(leadImportsPageSchema.parse(r.data),{headers});}
  if(q.from&&q.to&&q.from>q.to)return fail(400,'Período inválido.');
  if(q.view==='funnel'){const r=await a.db.rpc('pro_lead_inbox_funnel',{p_actor:a.user.id,p_from:q.from,p_to:q.to});if(r.error)return dbError(r.error);return Response.json(leadInboxFunnelSchema.parse(r.data),{headers});}
  if(!!q.after!==!!q.atSnapshot)return fail(400,'Consulta inválida.');
  const box=q.box??'active',r=await a.db.rpc('pro_lead_inbox_read_assigned',{p_actor:a.user.id,p_box:box,p_stage:q.stageId??null,p_query:q.q??'',p_service:q.service??null,p_channel:q.channelId??null,p_from:q.from??null,p_to:q.to??null,p_after:q.after??null,p_snapshot:q.atSnapshot??null,p_assignee:q.assignee??null});if(r.error)return dbError(r.error);
  // Round 7C: «Asignado a» filter (before paging) and each listed lead's assignment.
  const value=leadInboxPageSchema.parse(r.data);
  if(q.stageId&&value.stages.some(stage=>stage.effectiveStageId!==q.stageId)||q.channelId&&value.context.some(origin=>q.channelId==='unspecified'?origin.channel!==null:origin.channel?.id!==q.channelId)||value.snoozes.some(s=>s.snoozed!==(box==='snoozed')&&box!=='archived'))return fail(503,'No se pudo comprobar el filtro.');
  return Response.json(value,{headers});
 }catch{return fail(503,'No se pudieron cargar las solicitudes.');}
}
export async function POST(req:Request){
 if(!local())return new Response(null,{status:404,headers});
 if(req.headers.get('origin')!==`${new URL(req.url).protocol}//${req.headers.get('host')||new URL(req.url).host}`)return fail(403,'Origen no autorizado.');
 try{const a=await actor(req);if(a.error)return a.error;const limited=await enforceRateLimit(req,'lead-inboxes-'+a.user.id,30,60000);if(limited)return limited;
  // CSV preview/import may carry a 300 KB file; every other action keeps the shared 16 KiB limit.
  let body:unknown;try{const read=await bounded(req,1024*1024);body=read.value;const action=typeof body==='object'&&body!==null?(body as {action?:unknown}).action:undefined;if(read.length>16384&&action!=='preview'&&action!=='import')throw new RangeError();}catch(cause){return fail(cause instanceof RangeError?413:400,'Revise la solicitud.');}
  const snooze=leadSnoozeMutationSchema.safeParse(body);
  if(snooze.success){const r=await a.db.rpc('pro_lead_inbox_mutate',{p_actor:a.user.id,p_input:snooze.data});if(r.error)return dbError(r.error);const value=leadSnoozeResultSchema.parse(r.data);if(value.snooze.kind!==snooze.data.kind||value.snooze.id!==snooze.data.id)return fail(503,'No se pudo comprobar el cambio.');return Response.json(value,{headers});}
  const parsed=leadImportRequestSchema.safeParse(body);if(!parsed.success)return fail(400,'Revise la solicitud.');const input=parsed.data;
  if(input.action==='undo_import'){const r=await a.db.rpc('pro_lead_import_mutate',{p_actor:a.user.id,p_input:input});if(r.error)return dbError(r.error);const value=leadImportResultSchema.parse(r.data);if(value.import.id!==input.importId)return fail(503,'No se pudo comprobar el cambio.');return Response.json(value,{headers});}
  let rows;try{rows=parseLeadImportCsv(input.csv);}catch(cause){return fail(400,'Revise el archivo.',{fileError:cause instanceof LeadImportFileError?cause.code:'format',column:cause instanceof LeadImportFileError?cause.column:''});}
  if(input.action==='preview'){const r=await a.db.rpc('pro_lead_import_preview',{p_actor:a.user.id,p_rows:rows});if(r.error)return dbError(r.error);return Response.json(leadImportPreviewSchema.parse(r.data),{headers});}
  const r=await a.db.rpc('pro_lead_import_mutate',{p_actor:a.user.id,p_input:{action:'import',actionId:input.actionId,fileName:input.fileName,rows}});if(r.error)return dbError(r.error);
  const value=leadImportResultSchema.parse(r.data);if(value.import.id!==input.actionId)return fail(503,'No se pudo comprobar el cambio.');return Response.json(value,{headers});
 }catch{return fail(503,'No se pudo comprobar el cambio. Reintente la misma operación.');}
}
