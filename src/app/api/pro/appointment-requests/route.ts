import {z} from 'zod';
import {safeGetUser} from '@/lib/pro/workspace-user';
import {createClient} from '@/lib/supabase/server';
import {createAdminClient} from '@/lib/supabase/admin';
import {getApiAdmin} from '@/lib/auth/admin';
import {hasProAccess} from '@/lib/pro/access';
import {appointmentMutationSchema,appointmentStatuses} from '@/lib/pro/appointment-requests';
import {enforceRateLimit} from '@/lib/rate-limit';
import {PRO_ENABLED} from '@/lib/pro/enabled';

const headers={'Cache-Control':'no-store, private'};
const uuid=z.string().uuid();
const cursor=z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const calendarDay=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value=>{const at=Date.parse(value+'T12:00:00-06:00');return Number.isFinite(at)&&new Date(at).toISOString().slice(0,10)===value;});
function failure(status:number,error:string){return Response.json({error},{status,headers});}
function dbFailure(error:{code?:string;message?:string}){
 if(error.code==='23514'&&error.message==='Complete required preparation answers before confirming')return failure(409,'Faltan respuestas necesarias para preparar la visita. El cliente debe completarlas antes de confirmar.');
 if(error.code==='40001')return failure(409,'La solicitud o la agenda cambió. Actualice antes de continuar.');
 if(error.code==='42501')return failure(403,'No puede realizar esta acción.');
 if(error.code==='P0002')return failure(404,'La solicitud no está disponible.');
 if(['22023','23514','23503','23505','P0001'].includes(error.code||''))return failure(409,'Revise el estado y el horario. La solicitud no se pudo completar.');
 if(error.code==='54000')return failure(429,'Tiene demasiadas solicitudes. Revise las pendientes antes de continuar.');
 return failure(503,'No se pudo consultar o guardar la cita. Intente nuevamente.');
}
async function actor(){
 const user=await safeGetUser(await createClient());if(!user)return {error:failure(401,'Inicie sesión con su cuenta gratuita para solicitar una cita.')};
 const db=createAdminClient();
 const profile=await db.from('profiles').select('is_disabled,role').eq('id',user.id).maybeSingle();
 if(profile.error)return {error:failure(503,'No se pudo verificar su cuenta.')};
 if(!profile.data||profile.data.is_disabled)return {error:failure(403,'Su cuenta no tiene acceso.')};
 if(profile.data.role==='admin'&&!await getApiAdmin())return {error:failure(403,'Complete la verificación administrativa.')};
 return {db,user};
}
async function provider(id:string){
 const db=createAdminClient(),professional=await db.from('professionals').select('profile_id,is_banned').eq('id',id).maybeSingle();
 if(professional.error)return {error:failure(503,'No se pudo consultar la disponibilidad.')};
 if(!professional.data||professional.data.is_banned)return {enabled:false as const};
 const owner=professional.data.profile_id;
 const [profile,grant]=await Promise.all([db.from('profiles').select('role,is_disabled,is_provider').eq('id',owner).maybeSingle(),db.from('pro_memberships').select('status,expires_at').eq('user_id',owner).maybeSingle()]);
 if(profile.error||grant.error)return {error:failure(503,'No se pudo consultar la disponibilidad.')};
 if(!hasProAccess(profile.data,grant.data,Boolean(professional.data.is_banned)))return {enabled:false as const};
 const preference=await db.from('pro_appointment_preferences').select('enabled').eq('owner_id',owner).maybeSingle();if(preference.error)return {error:failure(503,'No se pudo consultar la disponibilidad.')};
 return preference.data?.enabled?{enabled:true as const,db,owner}:{enabled:false as const};
}
async function body(req:Request){
 if(!req.headers.get('content-type')?.toLowerCase().startsWith('application/json'))throw Error('body');
 const reader=req.body?.getReader();if(!reader)throw Error('body');
 const chunks:Uint8Array[]=[];let size=0;
 try{while(true){const next=await reader.read();if(next.done)break;size+=next.value.byteLength;if(size>4096){await reader.cancel();throw Error('size');}chunks.push(next.value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 return JSON.parse(new TextDecoder().decode(bytes));
}
export async function GET(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 try{
  const params=new URL(req.url).searchParams,view=params.get('view')||'client';
  if(view==='slots'||view==='calendar'){
   const limited=await enforceRateLimit(req,'appointment-slots',120,60000);if(limited)return limited;
   const professional=uuid.parse(params.get('professional')),day=calendarDay.parse(view==='calendar'?params.get('month')+'-01':params.get('day'));
   let duration=z.coerce.number().int().min(15).max(480).multipleOf(15).parse(params.get('duration')||'60');
   const access=await provider(professional);if(access.error)return access.error;
   if(!access.enabled)return Response.json({enabled:false,slots:[],truncated:false},{headers});
   const schedule=await access.db.from('pro_appointment_schedules').select('duration_minutes').eq('owner_id',access.owner).maybeSingle();
   if(schedule.error)return dbFailure(schedule.error);
   if(schedule.data)duration=schedule.data.duration_minutes;
   const result=view==='calendar'?await access.db.rpc('pro_appointment_calendar',{p_owner:access.owner,p_month:day,p_duration:duration}):await access.db.rpc('pro_appointment_slots',{p_owner:access.owner,p_day:day,p_duration:duration});
   if(result.error)return dbFailure(result.error);
   return Response.json({enabled:true,durationMinutes:duration,directBooking:!!schedule.data,...(view==='calendar'?{days:result.data}:result.data)},{headers});
  }
  if(!['client','provider','detail'].includes(view))return failure(400,'Consulta inválida.');
  const access=await actor();if(access.error)return access.error;
  const after=params.get('after')?cursor.parse(params.get('after')):null;
  if(view==='detail'){
   const id=uuid.parse(params.get('id')),result=await access.db.rpc('pro_appointment_detail',{p_actor:access.user.id,p_id:id,p_after:after});
   if(result.error)return dbFailure(result.error);
   return result.data?Response.json(result.data,{headers}):failure(404,'La solicitud no está disponible.');
  }
  const status=params.get('status')?z.enum(appointmentStatuses).parse(params.get('status')):null;
  const result=await access.db.rpc('pro_appointment_page',{p_actor:access.user.id,p_side:view,p_after:after,p_status:status});
  if(result.error)return dbFailure(result.error);
  return Response.json(result.data,{headers});
 }catch{return failure(400,'Revise los datos de la consulta.');}
}
export async function POST(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 const origin=`${new URL(req.url).protocol}//${req.headers.get('host')||new URL(req.url).host}`;
 if(req.headers.get('origin')!==origin)return failure(403,'Origen no autorizado.');
 const access=await actor();if(access.error)return access.error;
 let input:z.infer<typeof appointmentMutationSchema>;
 try{input=appointmentMutationSchema.parse(await body(req));}catch{return failure(400,'Revise el servicio, la duración, el lugar y el horario.');}
 try{
  const result=await access.db.rpc('pro_appointment_mutate',{p_actor:access.user.id,p_input:input});
  if(result.error)return dbFailure(result.error);
  return Response.json(result.data,{headers});
 }catch{return failure(503,'No se pudo guardar. Puede reintentar sin duplicar la solicitud.');}
}
