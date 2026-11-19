import {z} from 'zod';
import {createClient} from '@/lib/supabase/server';
import {safeGetUser} from '@/lib/pro/workspace-user';
import {createAdminClient} from '@/lib/supabase/admin';
import {getApiAdmin} from '@/lib/auth/admin';
import {manualLeadQuoteReceiptSchema,manualLeadQuoteContextSchema,manualLeadQuotePageSchema} from '@/lib/pro/manual-lead-quotes';
import {manualLeadQuoteCapabilitySchema} from '@/lib/pro/manual-lead-quote-capability';
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
const id=z.string().uuid();
const query=z.discriminatedUnion('view',[
 z.object({view:z.literal('capability')}).strict(),
 z.object({view:z.literal('context'),leadId:id}).strict(),
 z.object({view:z.literal('action'),actionId:id}).strict(),
 z.object({view:z.literal('list'),leadId:id,after:id.optional()}).strict(),
]);
const local=()=>process.env.NODE_ENV==='development'&&['http://127.0.0.1:54321','http://127.0.0.1:54321/'].includes(process.env.NEXT_PUBLIC_SUPABASE_URL??'');
export async function GET(req:Request){
 if(!local())return new Response(null,{status:404,headers});
 try{const a=await actor(req);if(a.error)return a.error;const raw:Record<string,string>={};for(const[k,v]of new URL(req.url).searchParams){if(k in raw)return fail(400,'Consulta inválida.');raw[k]=v;}const parsed=query.safeParse(raw);if(!parsed.success)return fail(400,'Consulta inválida.');const q=parsed.data;
  if(q.view==='capability'){const r=await a.db.rpc('pro_private_lead_quote_capability',{p_actor:a.user.id});if(r.error)return dbError(r.error);return Response.json(manualLeadQuoteCapabilitySchema.parse(r.data),{headers});}
  if(q.view==='action'){const r=await a.db.rpc('pro_private_lead_quote_action_read',{p_actor:a.user.id,p_action:q.actionId});if(r.error)return dbError(r.error);const data=manualLeadQuoteReceiptSchema.parse(r.data);if(data.receipt&&data.receipt.input.clientActionId!==q.actionId)return fail(503,'No se pudo comprobar el recibo.');return Response.json(data,{headers});}
  if(q.view==='context'){const r=await a.db.rpc('pro_private_lead_quote_context',{p_actor:a.user.id,p_lead:q.leadId});if(r.error)return dbError(r.error);const context=manualLeadQuoteContextSchema.parse(r.data);if(context.source.leadId!==q.leadId)return fail(503,'No se pudo comprobar el origen.');return Response.json(context,{headers});}
  const r=await a.db.rpc('pro_private_lead_quote_list',{p_actor:a.user.id,p_lead:q.leadId,p_after:q.after??null});if(r.error)return dbError(r.error);const page=manualLeadQuotePageSchema.parse(r.data);if(page.items.some(item=>item.link.leadId!==q.leadId))return fail(503,'No se pudo comprobar el origen.');return Response.json(page,{headers});
 }catch{return fail(503,'No se pudieron cargar las cotizaciones.');}
}
