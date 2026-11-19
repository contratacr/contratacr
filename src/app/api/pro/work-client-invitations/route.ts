import {z} from 'zod';
import {enforceRateLimit} from '@/lib/rate-limit';
import {WORK_INVITE_BODY_MAX,workInviteLink,workInviteOwnerMutationSchema,workInviteOwnerQuerySchema} from '@/lib/pro/work-client-invitations';
import {workInviteHash,workInviteNewToken} from '@/lib/pro/work-client-invitations-server';
import {proActor,proBoundedJson,proFail,proQuery,proRequestOrigin,proRouteHeaders,proSameOrigin} from '@/lib/pro/route-common';
import {sendTransactionalEmail,settleTransactionalEmail,transactionalBusinessName,transactionalEmailLocaleOf,transactionalWorkClient} from '@/lib/pro/transactional-email';

// Round 1: owner side of "Invitar al cliente al proyecto" (development only). The token is returned
// once to the owner, who copies it (launch fix I5: also e-mailed to the job customer, mock/sandbox only). A replayed create returns no token.
const hints:Record<string,[number,string]>={
 pro_invite_linked:[409,'Este trabajo ya tiene un cliente con cuenta vinculado.'],
 pro_invite_work:[409,'El trabajo está cancelado o ya no está disponible.'],
 pro_invite_profile:[400,'Complete su perfil profesional antes de invitar clientes.'],
 pro_invite_used:[409,'Esa invitación ya se usó.'],
 pro_invite_booking:[409,'Este cliente se vinculó con una cita; gestiónelo desde la cita.'],
};
function dbError(error:{code?:string;hint?:string}){
 const known=error.hint?hints[error.hint]:undefined;if(known)return Response.json({error:known[1],reason:error.hint},{status:known[0],headers:proRouteHeaders});
 const code=error.code||'';
 return proFail(code==='40001'||code==='23505'?409:code==='42501'?403:code==='54000'?429:['22023','23514','22P02','P0002'].includes(code)?400:503,code==='40001'||code==='23505'?'La invitación cambió. Actualice antes de continuar.':'No se pudo completar la operación.');
}
export async function GET(req:Request){
 if(process.env.NODE_ENV!=='development')return new Response(null,{status:404,headers:proRouteHeaders});
 try{
  const a=await proActor(req);if(a.error)return a.error;
  const raw=proQuery(req);
  if(raw&&'clientId' in raw){
   const client=z.object({clientId:z.string().trim().min(1).max(160)}).strict().safeParse(raw);if(!client.success)return proFail(400,'Consulta inválida.');
   const jobs=await a.db.rpc('pro_work_client_invite_jobs',{p_actor:a.user.id,p_client:client.data.clientId});
   if(jobs.error)return dbError(jobs.error);
   return jobs.data?Response.json(jobs.data,{headers:proRouteHeaders}):proFail(404,'Cliente no disponible.');
  }
  const parsed=raw&&workInviteOwnerQuerySchema.safeParse(raw);if(!parsed||!parsed.success)return proFail(400,'Consulta inválida.');
  const result=await a.db.rpc('pro_work_client_invitations_read',{p_actor:a.user.id,p_work:parsed.data.workId});
  if(result.error)return dbError(result.error);
  return result.data?Response.json(result.data,{headers:proRouteHeaders}):proFail(404,'Trabajo no disponible.');
 }catch{return proFail(503,'No se pudo cargar el acceso del cliente. Reintente.');}
}
export async function POST(req:Request){
 if(process.env.NODE_ENV!=='development')return new Response(null,{status:404,headers:proRouteHeaders});
 if(!proSameOrigin(req))return proFail(403,'Origen no autorizado.');
 try{
  const a=await proActor(req);if(a.error)return a.error;
  const limited=await enforceRateLimit(req,'work-client-invitations-'+a.user.id,30,60000);if(limited)return limited;
  let input;try{input=workInviteOwnerMutationSchema.parse(await proBoundedJson(req,WORK_INVITE_BODY_MAX));}catch(cause){return proFail(cause instanceof RangeError?413:400,'Revise los datos de la invitación.');}
  const token=input.action==='create'?workInviteNewToken():null;
  const result=await a.db.rpc('pro_work_client_invitations_mutate',{p_actor:a.user.id,p_input:token?{...input,tokenHash:workInviteHash(token)}:input});
  if(result.error)return dbError(result.error);
  const data=result.data as {replayed?:boolean};
  if(!token||data?.replayed||input.action!=='create')return Response.json(result.data,{headers:proRouteHeaders});
  // Launch fix I5: e-mail the invitation to the customer stored on the job, when it has an address (mock outbox by
  // default). Never blocks or fails the creation; the token only travels in the link fragment.
  const workId=input.workId,invitationId=input.invitationId,locale=transactionalEmailLocaleOf(req);
  const email=await settleTransactionalEmail(async()=>{
   const [client,name]=await Promise.all([transactionalWorkClient(a.db,a.user.id,workId),transactionalBusinessName(a.db,a.user.id)]);
   return sendTransactionalEmail({kind:'project_invite',eventId:invitationId,to:client?.email,locale,actorId:a.user.id,revealRecipient:true,
    data:{actorName:name,subjectName:client?.service||'',link:workInviteLink(proRequestOrigin(req),locale,token)}});
  });
  return Response.json({...result.data,token,email},{headers:proRouteHeaders});
 }catch{return proFail(503,'No se pudo comprobar la invitación. Reintente la misma operación.');}
}
