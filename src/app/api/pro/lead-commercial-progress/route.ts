import {z} from 'zod';
import {createClient} from '@/lib/supabase/server';
import {safeGetUser} from '@/lib/pro/workspace-user';
import {createAdminClient} from '@/lib/supabase/admin';
import {getApiAdmin} from '@/lib/auth/admin';
import {leadOriginChannelIdSchema,leadOriginMetricsSchema} from '@/lib/pro/lead-origins';
import {leadCommercialPageSchema,leadCommercialDetailSchema} from '@/lib/pro/lead-commercial-progress';
import {requestPipelineStageIdSchema} from '@/lib/pro/request-pipeline';
import {taskDueDate} from '@/lib/pro/work-tasks';
import {PRO_ENABLED} from '@/lib/pro/enabled';
const headers={'Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff'};
const fail=(status:number,error:string)=>Response.json({error},{status,headers});
const dbError=(error:{code?:string})=>fail(['40001','54000','23505'].includes(error.code||'')?409:error.code==='42501'?403:error.code==='P0002'?404:['22023','22007','22008','22021','23514','22P02'].includes(error.code||'')?400:503,error.code==='40001'?'Las solicitudes cambiaron. Actualice antes de continuar.':'No se pudo completar el cambio.');
async function actor(req:Request){
 const user=await safeGetUser(await createClient());if(!user)return{error:fail(401,'Inicie sesión.')};
 const expected=req.headers.get('x-pro-expected-actor');if(expected!==null&&(!z.string().uuid().safeParse(expected).success||expected!==user.id))return{error:fail(403,'La cuenta cambió.')};
 const db=createAdminClient(),profile=await db.from('profiles').select('is_disabled,role').eq('id',user.id).maybeSingle();
 if(profile.error)return{error:fail(503,'No se pudo comprobar el acceso.')};
 if(!profile.data||profile.data.is_disabled||profile.data.role==='admin'&&!await getApiAdmin())return{error:fail(403,'Sin acceso.')};
 return{user,db};
}
const id=z.string().uuid(),kind=z.enum(['manual','request']),token=z.string().regex(/^[a-f0-9]{32}$/),cursor=z.string().regex(/^(manual|request):[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/),channel=leadOriginChannelIdSchema;
const filters={status:z.enum(['active','archived']).optional(),stageId:requestPipelineStageIdSchema.optional(),q:z.string().max(100).optional()};
const query=z.discriminatedUnion('view',[
 z.object({view:z.literal('detail'),kind,id}).strict(),
 z.object({view:z.literal('list'),...filters,channelId:z.union([z.literal('unspecified'),channel]).optional(),after:cursor.optional(),atSnapshot:token.optional()}).strict(),
 z.object({view:z.literal('metrics'),...filters,from:taskDueDate.unwrap().optional(),to:taskDueDate.unwrap().optional(),after:z.union([z.literal('unspecified'),channel]).optional(),atSnapshot:token.optional()}).strict(),
]);
const local=()=>PRO_ENABLED;
export async function GET(req:Request){
 if(!local())return new Response(null,{status:404,headers});
 try{const a=await actor(req);if(a.error)return a.error;const raw:Record<string,string>={};for(const[k,v]of new URL(req.url).searchParams){if(k in raw)return fail(400,'Consulta inválida.');raw[k]=v;}const parsed=query.safeParse(raw);if(!parsed.success)return fail(400,'Consulta inválida.');const q=parsed.data;
  if(q.view==='detail'){const r=await a.db.rpc('pro_lead_commercial_detail',{p_actor:a.user.id,p_kind:q.kind,p_id:q.id});if(r.error)return dbError(r.error);const value=leadCommercialDetailSchema.parse(r.data);if(value.stage.kind!==q.kind||value.stage.id!==q.id)return fail(503,'No se pudo comprobar la solicitud.');return Response.json(value,{headers});}
  if(!!q.after!==!!q.atSnapshot)return fail(400,'Consulta inválida.');
  if(q.view==='list'){const r=await a.db.rpc('pro_lead_commercial_read',{p_actor:a.user.id,p_status:q.status??'active',p_stage:q.stageId??null,p_query:q.q??'',p_channel:q.channelId??null,p_after:q.after??null,p_snapshot:q.atSnapshot??null});if(r.error)return dbError(r.error);const value=leadCommercialPageSchema.parse(r.data);if(q.stageId&&value.stages.some(stage=>stage.effectiveStageId!==q.stageId)||q.channelId&&value.context.some(origin=>q.channelId==='unspecified'?origin.channel!==null:origin.channel?.id!==q.channelId))return fail(503,'No se pudo comprobar el filtro.');return Response.json(value,{headers});}
  if(q.from&&q.to&&q.from>q.to)return fail(400,'Período inválido.');const r=await a.db.rpc('pro_lead_commercial_metrics',{p_actor:a.user.id,p_status:q.status??'active',p_stage:q.stageId??null,p_query:q.q??'',p_from:q.from??null,p_to:q.to??null,p_after:q.after??null,p_snapshot:q.atSnapshot??null});if(r.error)return dbError(r.error);return Response.json(leadOriginMetricsSchema.parse(r.data),{headers});
 }catch{return fail(503,'No se pudieron cargar las solicitudes.');}
}
