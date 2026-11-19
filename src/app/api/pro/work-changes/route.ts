import {proCustomerReader} from '@/lib/pro/route-common';
import {z} from 'zod';
import {safeGetUser} from '@/lib/pro/workspace-user';
import {createClient} from '@/lib/supabase/server';
import {createAdminClient} from '@/lib/supabase/admin';
import {getApiAdmin} from '@/lib/auth/admin';
import {workChangeMutation} from '@/lib/pro/work-changes';
const headers={'Cache-Control':'no-store, private'};
const fail=(status:number,error:string)=>Response.json({error},{status,headers});
async function access(){const user=await safeGetUser(await createClient());if(!user)return{error:fail(401,'Inicie sesión.')};const db=createAdminClient();const p=await db.from('profiles').select('role,is_disabled').eq('id',user.id).maybeSingle();if(p.error)return{error:fail(503,'No se pudo verificar su cuenta.')};if(!p.data||p.data.is_disabled||p.data.role==='admin'&&!await getApiAdmin())return{error:fail(403,'Sin acceso.')};return{user,db};}
function expectedActor(req:Request,actorId:string){
 const expected=req.headers.get('x-pro-expected-actor');if(expected===null)return null;
 if(!/^http:\/\/127\.0\.0\.1:54321\/?$/.test(process.env.NEXT_PUBLIC_SUPABASE_URL??''))return fail(404,'No disponible.');
 if(!z.string().uuid().safeParse(expected).success)return fail(400,'Cuenta inválida.');
 return expected===actorId?null:fail(403,'La cuenta cambió. Vuelva a la cuenta del intento guardado.');
}
const failure=(e:{code?:string})=>fail(e.code==='42501'?403:e.code==='40001'||e.code==='23505'?409:e.code==='22023'||e.code==='23514'?400:e.code==='54000'?429:503,e.code==='40001'?'El acuerdo o los pagos cambiaron. Actualice antes de continuar.':'No se pudo completar el cambio. Revise los datos y el estado del trabajo.');
export async function GET(req:Request){if(process.env.NODE_ENV!=='development')return fail(404,'No disponible');try{const a=await access();if(a.error)return a.error;const scopeError=expectedActor(req,a.user.id);if(scopeError)return scopeError;const q=new URL(req.url).searchParams;const input=z.object({workId:z.string().trim().max(160).default(''),requestId:z.string().uuid().optional(),after:z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional()}).refine(v=>Boolean(v.workId)!==Boolean(v.requestId)).parse(Object.fromEntries(q));const r=await a.db.rpc('pro_work_changes_page',{p_actor:await proCustomerReader(a.db,a.user.id,input.requestId),p_work:input.workId,p_request:input.requestId??null,p_after:input.after??null});if(r.error)return failure(r.error);if(!r.data)return fail(404,'Trabajo no disponible.');
 // Round 7B: schedule impact (days) and whether it was applied, read with the same actor.
 const page=r.data as {items?:Array<{id:string}&Record<string,unknown>>};const ids=(page.items??[]).map(item=>item.id);
 if(ids.length){const reader=await proCustomerReader(a.db,a.user.id,input.requestId);const s=await a.db.rpc('pro_work_change_schedule_read',{p_actor:reader,p_ids:ids});if(s.error)return failure(s.error);const map=(s.data??{}) as Record<string,{scheduleDays:number;scheduleApplied:boolean;shiftedTasks:number}>;page.items=(page.items??[]).map(item=>({...item,scheduleDays:map[item.id]?.scheduleDays??0,scheduleApplied:map[item.id]?.scheduleApplied??false}));}
 return Response.json(page,{headers});}catch{return fail(400,'Consulta inválida.');}}
async function bounded(req:Request){if(!req.headers.get('content-type')?.startsWith('application/json'))throw Error();const reader=req.body?.getReader();if(!reader)throw Error();const chunks:Uint8Array[]=[];let size=0;try{while(true){const n=await reader.read();if(n.done)break;size+=n.value.length;if(size>16384){await reader.cancel();throw Error();}chunks.push(n.value);}}finally{reader.releaseLock();}const bytes=new Uint8Array(size);let i=0;for(const c of chunks){bytes.set(c,i);i+=c.length;}return JSON.parse(new TextDecoder().decode(bytes));}
export async function POST(req:Request){if(process.env.NODE_ENV!=='development')return fail(404,'No disponible');if(req.headers.get('origin')!==`${new URL(req.url).protocol}//${req.headers.get('host')||new URL(req.url).host}`)return fail(403,'Origen no autorizado.');try{const a=await access();if(a.error)return a.error;const scopeError=expectedActor(req,a.user.id);if(scopeError)return scopeError;let input;try{input=workChangeMutation.parse(await bounded(req));}catch{return fail(400,'Revise el motivo, las líneas y el importe del cambio.');}const r=await a.db.rpc('pro_work_changes_mutate',{p_actor:a.user.id,p_input:input});return r.error?failure(r.error):Response.json(r.data,{headers});}catch{return fail(503,'No se pudo comprobar el guardado. Reintente la misma acción.');}}
