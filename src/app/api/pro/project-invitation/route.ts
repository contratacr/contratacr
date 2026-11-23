import {z} from 'zod';
import {enforceRateLimit,enforceRateLimitKey} from '@/lib/rate-limit';
import {WORK_INVITE_BODY_MAX,workInviteClientMutationSchema} from '@/lib/pro/work-client-invitations';
import {workInviteHash} from '@/lib/pro/work-client-invitations-server';
import {proActor,proBoundedJson,proFail,proQuery,proRouteHeaders,proSameOrigin} from '@/lib/pro/route-common';
import {PRO_ENABLED} from '@/lib/pro/enabled';

// Round 1: customer side (development only, signed-in account). Preview and accept a job
// invitation; consent to join the job of an estimate accepted by code; list linked jobs.
// The token is sent in the JSON body (never in a URL) and limited per account and per IP.
const hints:Record<string,[number,string,string]>={
 pro_invite_unknown:[404,'unknown','El código no es válido. Revise que lo copió completo.'],
 pro_invite_used:[410,'used','Esta invitación ya se usó. Pida una nueva al profesional.'],
 pro_invite_revoked:[410,'revoked','Esta invitación fue anulada. Pida una nueva al profesional.'],
 pro_invite_expired:[410,'expired','Esta invitación venció. Pida una nueva al profesional.'],
 pro_invite_own:[403,'own','No puede unirse a un trabajo propio.'],
 pro_invite_linked:[409,'unavailable','Este trabajo ya tiene otro cliente vinculado.'],
 pro_invite_work:[409,'unavailable','Este trabajo ya no está disponible.'],
 pro_invite_profile:[409,'unavailable','Este trabajo ya no está disponible.'],
 pro_consent_not_accepted:[409,'not_accepted','Primero acepte la cotización.'],
};
function dbError(error:{code?:string;hint?:string}){
 const known=error.hint?hints[error.hint]:undefined;if(known)return Response.json({error:known[2],reason:known[1]},{status:known[0],headers:proRouteHeaders});
 const code=error.code||'';
 return proFail(code==='40001'||code==='23505'?409:code==='42501'?403:['22023','23514','22P02','P0002'].includes(code)?400:503,code==='40001'?'La invitación cambió. Reintente.':'No se pudo completar la operación.');
}
export async function GET(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers:proRouteHeaders});
 try{
  const a=await proActor(req);if(a.error)return a.error;
  const raw=proQuery(req);if(!raw)return proFail(400,'Consulta inválida.');
  const keys=Object.keys(raw);
  if(keys.length===0){const result=await a.db.rpc('pro_work_client_links_client',{p_actor:a.user.id});if(result.error)return dbError(result.error);return Response.json(result.data,{headers:proRouteHeaders});}
  const parsed=z.object({publicationId:z.string().uuid()}).strict().safeParse(raw);if(!parsed.success)return proFail(400,'Consulta inválida.');
  const result=await a.db.rpc('pro_work_client_link_consent_read',{p_actor:a.user.id,p_publication:parsed.data.publicationId});
  if(result.error)return dbError(result.error);
  return result.data?Response.json(result.data,{headers:proRouteHeaders}):proFail(404,'Cotización no disponible.');
 }catch{return proFail(503,'No se pudieron cargar sus proyectos. Reintente.');}
}
export async function POST(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers:proRouteHeaders});
 if(!proSameOrigin(req))return proFail(403,'Origen no autorizado.');
 try{
  const a=await proActor(req);if(a.error)return a.error;
  const limitedIp=await enforceRateLimit(req,'project-invitation-ip',60,60000);if(limitedIp)return limitedIp;
  const limited=await enforceRateLimitKey('project-invitation-'+a.user.id,20,60000);if(limited)return limited;
  let input;try{input=workInviteClientMutationSchema.parse(await proBoundedJson(req,WORK_INVITE_BODY_MAX));}catch(cause){return proFail(cause instanceof RangeError?413:400,'El código no es válido. Revise que lo copió completo.');}
  const result=input.action==='preview'?await a.db.rpc('pro_work_client_invitation_preview',{p_actor:a.user.id,p_token_hash:workInviteHash(input.token)})
   :input.action==='accept'?await a.db.rpc('pro_work_client_invitation_accept',{p_actor:a.user.id,p_input:{action:'accept',actionId:input.actionId,tokenHash:workInviteHash(input.token)}})
   :await a.db.rpc('pro_work_client_link_consent',{p_actor:a.user.id,p_input:input});
  if(result.error)return dbError(result.error);
  return Response.json(result.data,{headers:proRouteHeaders});
 }catch{return proFail(503,'No se pudo comprobar la invitación. Reintente la misma operación.');}
}
