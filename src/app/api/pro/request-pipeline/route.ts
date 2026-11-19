import {z} from 'zod';
import {createClient} from '@/lib/supabase/server';
import {safeGetUser} from '@/lib/pro/workspace-user';
import {createAdminClient} from '@/lib/supabase/admin';
import {getApiAdmin} from '@/lib/auth/admin';
import {enforceRateLimit} from '@/lib/rate-limit';
import {requestPipelineMutationSchema,requestPipelineResultSchema,requestPipelineReceiptSchema,requestPipelineCatalogSchema,requestPipelinePageSchema,requestPipelineDetailSchema,requestPipelineHistoryPageSchema,requestPipelineStageIdSchema} from '@/lib/pro/request-pipeline';
const headers={'Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff'};
const fail=(status:number,error:string)=>Response.json({error},{status,headers});
const dbError=(error:{code?:string})=>fail(['40001','54000','23505'].includes(error.code||'')?409:error.code==='42501'?403:error.code==='P0002'?404:['22023','22007','22008','22021','23514','22P02'].includes(error.code||'')?400:503,error.code==='40001'?'Las solicitudes o etapas cambiaron. Actualice antes de continuar.':'No se pudo completar el cambio de etapa.');
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
 try{while(true){const part=await reader.read();if(part.done)break;length+=part.value.length;if(length>16*1024){await reader.cancel();throw new RangeError();}chunks.push(part.value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return JSON.parse(new TextDecoder().decode(bytes));
}
const id=z.string().uuid();
const querySchema=z.discriminatedUnion('view',[
 z.object({view:z.literal('catalog')}).strict(),
 z.object({view:z.literal('action'),actionId:id}).strict(),
 z.object({view:z.literal('detail'),requestId:id}).strict(),
 z.object({view:z.literal('history'),requestId:id,after:id.optional()}).strict(),
 z.object({view:z.literal('list'),stageId:requestPipelineStageIdSchema.optional(),q:z.string().max(100).optional(),after:id.optional(),atSnapshot:z.string().regex(/^[a-f0-9]{32}$/).optional()}).strict().refine(v=>!v.after||!!v.atSnapshot),
]);
export async function GET(req:Request){
 if(process.env.NODE_ENV!=='development')return new Response(null,{status:404,headers});
 try{const a=await actor(req);if(a.error)return a.error;const raw:Record<string,string>={};for(const[k,v]of new URL(req.url).searchParams){if(k in raw)return fail(400,'Consulta inválida.');raw[k]=v;}if(!raw.view)raw.view='list';const p=querySchema.safeParse(raw);if(!p.success)return fail(400,'Consulta inválida.');const q=p.data;
  if(q.view==='catalog'){const r=await a.db.rpc('pro_request_pipeline_catalog',{p_actor:a.user.id});if(r.error)return dbError(r.error);return Response.json(requestPipelineCatalogSchema.parse(r.data),{headers});}
  if(q.view==='action'){const r=await a.db.rpc('pro_lead_center_catalog_read_action',{p_actor:a.user.id,p_action:q.actionId});if(r.error)return dbError(r.error);return Response.json(requestPipelineReceiptSchema.parse(r.data),{headers});}
  if(q.view==='detail'){const r=await a.db.rpc('pro_request_pipeline_detail',{p_actor:a.user.id,p_request:q.requestId});if(r.error)return dbError(r.error);return Response.json(requestPipelineDetailSchema.parse(r.data),{headers});}
  if(q.view==='history'){const r=await a.db.rpc('pro_request_pipeline_history_read',{p_actor:a.user.id,p_request:q.requestId,p_after:q.after??null});if(r.error)return dbError(r.error);return Response.json(requestPipelineHistoryPageSchema.parse(r.data),{headers});}
  const r=await a.db.rpc('pro_request_pipeline_read',{p_actor:a.user.id,p_stage:q.stageId??null,p_query:q.q??'',p_after:q.after??null,p_snapshot:q.atSnapshot??null});if(r.error)return dbError(r.error);return Response.json(requestPipelinePageSchema.parse(r.data),{headers});
 }catch{return fail(503,'No se pudieron cargar las solicitudes.');}
}
export async function POST(req:Request){
 if(process.env.NODE_ENV!=='development')return new Response(null,{status:404,headers});
 if(req.headers.get('origin')!==`${new URL(req.url).protocol}//${req.headers.get('host')||new URL(req.url).host}`)return fail(403,'Origen no autorizado.');
 try{const a=await actor(req);if(a.error)return a.error;const limited=await enforceRateLimit(req,'request-pipeline-'+a.user.id,30,60000);if(limited)return limited;
  let input;try{input=requestPipelineMutationSchema.parse(await bounded(req));}catch(cause){return fail(cause instanceof RangeError?413:400,'Revise la etapa seleccionada.');}
  const r=await a.db.rpc(input.action.startsWith('stage_')?'pro_lead_center_catalog_mutate':'pro_request_pipeline_mutate',{p_actor:a.user.id,p_input:input});if(r.error)return dbError(r.error);return Response.json(requestPipelineResultSchema.parse(r.data),{headers});
 }catch{return fail(503,'No se pudo comprobar el cambio. Reintente la misma operación.');}
}
