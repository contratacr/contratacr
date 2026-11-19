import {z} from 'zod';
import {createClient} from '@/lib/supabase/server';
import {safeGetUser} from '@/lib/pro/workspace-user';
import {createAdminClient} from '@/lib/supabase/admin';
import {getApiAdmin} from '@/lib/auth/admin';
import {enforceRateLimit} from '@/lib/rate-limit';
import {manualLeadQuoteInputSchema,manualLeadQuoteResultSchema,manualLeadQuoteReceiptSchema,manualLeadQuoteContextSchema,manualLeadQuotePageSchema} from '@/lib/pro/manual-lead-quotes';
import {randomBytes} from 'node:crypto';
import {directProjectPublicCode} from '@/lib/pro/direct-project-quotes';
import {writeSourceColumns} from '@/lib/security/write-guard';
const headers={'Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff'};
const fail=(status:number,error:string)=>Response.json({error},{status,headers});
const dbError=(error:{code?:string})=>fail(['40001','54000','23505'].includes(error.code||'')?409:error.code==='42501'?403:error.code==='P0002'?404:['22023','22007','22008','22021','23514','22P02'].includes(error.code||'')?400:503,error.code==='40001'?'Las solicitudes o etapas cambiaron. Actualice antes de continuar.':'No se pudo completar el cambio.');
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
 try{while(true){const part=await reader.read();if(part.done)break;length+=part.value.length;if(length>64*1024){await reader.cancel();throw new RangeError();}chunks.push(part.value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return JSON.parse(new TextDecoder().decode(bytes));
}
const id=z.string().uuid();
const query=z.discriminatedUnion('view',[
 z.object({view:z.literal('context'),leadId:id}).strict(),
 z.object({view:z.literal('action'),actionId:id}).strict(),
 z.object({view:z.literal('list'),leadId:id,after:id.optional()}).strict(),
]);
const local=()=>process.env.NODE_ENV==='development'&&['http://127.0.0.1:54321','http://127.0.0.1:54321/'].includes(process.env.NEXT_PUBLIC_SUPABASE_URL??'');
export async function GET(req:Request){
 if(!local())return new Response(null,{status:404,headers});
 try{const a=await actor(req);if(a.error)return a.error;const raw:Record<string,string>={};for(const[k,v]of new URL(req.url).searchParams){if(k in raw)return fail(400,'Consulta inválida.');raw[k]=v;}const parsed=query.safeParse(raw);if(!parsed.success)return fail(400,'Consulta inválida.');const q=parsed.data;
  if(q.view==='action'){const r=await a.db.rpc('pro_manual_lead_quote_action_read',{p_actor:a.user.id,p_action:q.actionId});if(r.error)return dbError(r.error);return Response.json(manualLeadQuoteReceiptSchema.parse(r.data),{headers});}
  if(q.view==='context'){const r=await a.db.rpc('pro_manual_lead_quote_context',{p_actor:a.user.id,p_lead:q.leadId});if(r.error)return dbError(r.error);const context=manualLeadQuoteContextSchema.parse(r.data);if(context.source.leadId!==q.leadId)return fail(503,'No se pudo comprobar el origen.');return Response.json(context,{headers});}
  const r=await a.db.rpc('pro_manual_lead_quote_list',{p_actor:a.user.id,p_lead:q.leadId,p_after:q.after??null});if(r.error)return dbError(r.error);const page=manualLeadQuotePageSchema.parse(r.data);if(page.items.some(item=>item.link.leadId!==q.leadId))return fail(503,'No se pudo comprobar el origen.');return Response.json(page,{headers});
 }catch{return fail(503,'No se pudieron cargar las cotizaciones.');}
}
export async function POST(req:Request){
 if(!local())return new Response(null,{status:404,headers});
 if(req.headers.get('origin')!==`${new URL(req.url).protocol}//${req.headers.get('host')||new URL(req.url).host}`)return fail(403,'Origen no autorizado.');
 try{const a=await actor(req);if(a.error)return a.error;const limit=await enforceRateLimit(req,'manual-lead-quote-'+a.user.id,30,60000);if(limit)return limit;
  let input;try{input=manualLeadQuoteInputSchema.parse(await bounded(req));}catch(error){return fail(error instanceof RangeError?413:400,'Revise la cotización.');}
  const r=await a.db.rpc('pro_manual_lead_quote_create',{p_actor:a.user.id,p_input:input,p_source:{...writeSourceColumns(req),public_code:directProjectPublicCode(randomBytes(12))}});if(r.error)return dbError(r.error);return Response.json(manualLeadQuoteResultSchema.parse(r.data),{headers});
 }catch{return fail(503,'No se pudo comprobar la cotización. Reintente la misma operación.');}
}
