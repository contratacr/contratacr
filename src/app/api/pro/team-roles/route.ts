import {createHash} from 'node:crypto';
import {cookies} from 'next/headers';
import {createClient} from '@/lib/supabase/server';
import {safeGetUser} from '@/lib/supabase/get-user';
import {createAdminClient} from '@/lib/supabase/admin';
import {enforceRateLimit} from '@/lib/rate-limit';
import {proBoundedJson,proDbError,proFail,proQuery,proRequestOrigin,proRouteHeaders as headers,proSameOrigin} from '@/lib/pro/route-common';
import {PRO_WS_COOKIE} from '@/lib/pro/workspace-gate';
import {companyTeamMutationSchema,companyTeamSchema,normalizeCompanyInviteCode} from '@/lib/pro/team-roles';
import {sendTransactionalEmail,settleTransactionalEmail,transactionalBusinessName} from '@/lib/pro/transactional-email';
import {prefijoDeIdioma} from '@/lib/prefijo-de-idioma';

/**
 * Round 7C: company team roles. Always runs as the signed-in account (never substituted by the
 * workspace gate): it is where a member enters or leaves a company. Team management is for the
 * owner, or an Administrator member of the company chosen in the cookie (checked with the same
 * SQL helper `pro_role_require`). Invitations are stored with a draft email that is never sent.
 */
async function session(req:Request){
 const user=await safeGetUser(await createClient());if(!user)return{error:proFail(401,'Inicie sesión.')} as const;
 const expected=req.headers.get('x-pro-expected-actor');if(expected!==null&&expected!==user.id)return{error:proFail(403,'La cuenta cambió.')} as const;
 const db=createAdminClient(),profile=await db.from('profiles').select('is_disabled').eq('id',user.id).maybeSingle();
 if(profile.error)return{error:proFail(503,'No se pudo comprobar el acceso.')} as const;
 if(!profile.data||profile.data.is_disabled)return{error:proFail(403,'Sin acceso.')} as const;
 return{user,db,error:null} as const;
}
async function workspaceOf(db:ReturnType<typeof createAdminClient>,member:string){
 const owner=(await cookies()).get(PRO_WS_COOKIE)?.value;if(!owner||owner===member)return null;
 const r=await db.rpc('pro_team_workspace_resolve',{p_member:member,p_owner:owner});
 return r.error||!r.data?null:r.data as {ownerId:string;ownerName:string;role:string;capabilities:string[]};
}
export async function GET(req:Request){
 if(process.env.NODE_ENV!=='development')return new Response(null,{status:404,headers});
 const q=proQuery(req);if(!q||Object.keys(q).some(k=>k!=='view')||(q.view??'me')!=='me')return proFail(400,'Consulta inválida.');
 const a=await session(req);if(a.error)return a.error;
 const workspace=await workspaceOf(a.db,a.user.id);
 // An Administrator member manages the company it is working in (read as that owner).
 const manageAs=workspace?.role==='admin'?workspace.ownerId:a.user.id;
 const team=await a.db.rpc('pro_company_team_read',{p_actor:manageAs});if(team.error)return proDbError(team.error,'El equipo cambió.');
 const own=manageAs===a.user.id?team.data:(await a.db.rpc('pro_company_team_read',{p_actor:a.user.id})).data;
 return Response.json(companyTeamSchema.parse({...team.data,memberships:own?.memberships??[],accountId:a.user.id,workspace}),{headers});
}
export async function POST(req:Request){
 if(process.env.NODE_ENV!=='development')return new Response(null,{status:404,headers});
 if(!proSameOrigin(req))return proFail(403,'Origen no autorizado.');
 const a=await session(req);if(a.error)return a.error;
 const limited=await enforceRateLimit(req,'team-roles-'+a.user.id,40,60000);if(limited)return limited;
 let input;try{input=companyTeamMutationSchema.parse(await proBoundedJson(req,8192));}catch{return proFail(400,'Revise los datos del equipo.');}
 const jar=await cookies();
 if(input.action==='enter'){
  const r=await a.db.rpc('pro_team_workspace_resolve',{p_member:a.user.id,p_owner:input.ownerId});
  if(r.error)return proDbError(r.error,'El equipo cambió.');if(!r.data)return proFail(403,'No pertenece a esa empresa o ya no tiene acceso.');
  jar.set(PRO_WS_COOKIE,input.ownerId,{httpOnly:true,sameSite:'lax',path:'/',secure:new URL(req.url).protocol==='https:',maxAge:60*60*12});
  return Response.json({workspace:r.data},{headers});
 }
 // Expire with the same attributes it was set with (some browsers ignore a bare delete).
 const expire=()=>jar.set(PRO_WS_COOKIE,'',{httpOnly:true,sameSite:'lax',path:'/',secure:new URL(req.url).protocol==='https:',maxAge:0});
 if(input.action==='exit'){expire();return Response.json({workspace:null},{headers});}
 let actor=a.user.id,payload:Record<string,unknown>;
 if(input.action==='accept'){
  if(!a.user.email||!a.user.email_confirmed_at)return proFail(403,'Confirme su correo antes de unirse.');
  payload={action:'accept',actionId:input.actionId,codeHash:createHash('sha256').update(normalizeCompanyInviteCode(input.code)).digest('hex')};
 }else if(input.action==='leave'){payload={...input};}
 else{
  const workspace=await workspaceOf(a.db,a.user.id);
  // An Administrator member manages the company through the same SQL gate as every /api/pro write,
  // so the change is recorded with the member's identity (final verification 2026-11-14; before,
  // only the owner appeared as the actor of the team event).
  if(workspace){
   const gate=await a.db.rpc('pro_team_route_authorize',{p_member:a.user.id,p_owner:workspace.ownerId,p_method:'POST',p_path:'/api/pro/team-roles'});
   if(gate.error)return proDbError(gate.error,'El equipo cambió.');
   const verdict=gate.data as {allowed?:boolean}|null;if(!verdict?.allowed)return Response.json({error:'Su rol en esta empresa no permite este cambio.',code:'pro_role'},{status:403,headers});
   actor=workspace.ownerId;
  }
  if(input.action==='invite'){const {code,...rest}=input;payload={...rest,codeHash:createHash('sha256').update(code).digest('hex')};}else payload={...input};
 }
 const r=await a.db.rpc('pro_company_team_mutate',{p_actor:actor,p_input:payload,p_verified_email:input.action==='accept'?a.user.email:null});
 if(r.error){if(r.error.code==='P0002')return proFail(404,'La invitación o la persona ya no está disponible.');return proDbError(r.error,'El equipo cambió. Actualice antes de guardar.');}
 if(input.action==='leave'&&jar.get(PRO_WS_COOKIE)?.value===input.ownerId)expire();
 if(input.action==='invite'&&!(r.data as {replayed?:boolean}|null)?.replayed){
  // Launch fix I5: the invitation e-mail (no code: the company gives it separately) goes to the typed address
  // through the Pro transactional module (mock outbox by default). Never blocks or fails the invitation.
  const owner=actor,target=input.email,locale=input.locale,eventId=input.actionId;
  const email=await settleTransactionalEmail(async()=>sendTransactionalEmail({kind:'team_invite',eventId,to:target,locale,actorId:a.user.id,revealRecipient:true,
   data:{actorName:'',subjectName:await transactionalBusinessName(a.db,owner),link:proRequestOrigin(req)+prefijoDeIdioma(locale)+'/dashboard/pro/equipo'}}));
  return Response.json({...(r.data as object),email},{headers});
 }
 return Response.json(r.data,{headers});
}
