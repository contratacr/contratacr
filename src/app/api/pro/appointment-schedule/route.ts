import {scheduleInput as input} from '@/lib/pro/appointment-schedule';
import {safeGetUser} from '@/lib/pro/workspace-user';
import {createClient} from '@/lib/supabase/server';
import {createAdminClient} from '@/lib/supabase/admin';
import {getApiAdmin} from '@/lib/auth/admin';
import {enforceRateLimit} from '@/lib/rate-limit';
import {PRO_ENABLED} from '@/lib/pro/enabled';
const headers={'Cache-Control':'no-store, private'};
const fail=(status:number)=>Response.json({error:status===409?'La configuración cambió. Actualice antes de guardar.':'No se pudo consultar o guardar la disponibilidad.'},{status,headers});
async function access(){const user=await safeGetUser(await createClient());if(!user)return {error:fail(401)};const db=createAdminClient(),profile=await db.from('profiles').select('role,is_disabled').eq('id',user.id).maybeSingle();if(profile.error)return {error:fail(503)};if(!profile.data||profile.data.is_disabled||profile.data.role==='admin'&&!await getApiAdmin())return {error:fail(403)};return {user,db};}
async function run(req:Request,write:boolean){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 if(write&&req.headers.get('origin')!==`${new URL(req.url).protocol}//${req.headers.get('host')||new URL(req.url).host}`)return fail(403);
 try{const actor=await access();if(actor.error)return actor.error;const limited=await enforceRateLimit(req,'appointment-schedule-'+actor.user.id,60,60000);if(limited)return limited;
 let value=null;if(write){if(!req.headers.get('content-type')?.startsWith('application/json'))return fail(400);const reader=req.body?.getReader();if(!reader)return fail(400);let text='',size=0;try{const decoder=new TextDecoder();while(true){const next=await reader.read();if(next.done)break;size+=next.value.byteLength;if(size>8192){await reader.cancel();return fail(413);}text+=decoder.decode(next.value,{stream:true});}text+=decoder.decode();value=input.parse(JSON.parse(text));}catch{return fail(400);}finally{reader.releaseLock();}}
 const result=await actor.db.rpc('pro_appointment_schedule_record',{p_actor:actor.user.id,p_input:value});if(result.error)return fail(result.error.code==='42501'?403:result.error.code==='40001'?409:503);return Response.json(result.data,{headers});
 }catch{return fail(503);}
}
export async function GET(req:Request){return run(req,false);}
export async function POST(req:Request){return run(req,true);}
