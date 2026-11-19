import {createServerClient} from '@supabase/ssr';
import {NextResponse,type NextRequest} from 'next/server';

/** Round 7C: cookie with the company (owner id) a team member chose to work in. */
export const PRO_WS_COOKIE='ccr_pro_ws';
export const PRO_WS_HEADERS={owner:'x-pro-workspace-owner',member:'x-pro-workspace-member',role:'x-pro-workspace-role',signature:'x-pro-workspace-signature'} as const;
const hex=(bytes:ArrayBuffer)=>[...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('');
/**
 * Final verification 2026-11-14: HMAC-SHA256 (key derived from the server-only service key) over the
 * values only this gate may set. `workspace-user.ts` substitutes the account only when it verifies,
 * so a forged copy of these headers is inert even on a path the gate does not run on (it was not:
 * `/api/quotes` and `/api/admin/pro` share the Pro access helper and received client headers as-is).
 */
export async function proWorkspaceSignature(owner:string,member:string,role:string):Promise<string|null>{
 const service=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!service)return null;
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode('ccr-pro-workspace-v1:'+service),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 return hex(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(owner+'|'+member+'|'+role)));
}
/** Constant-time check of the gate signature for the given values. */
export async function proWorkspaceSignatureValid(owner:string,member:string,role:string,signature:string|null):Promise<boolean>{
 const expected=await proWorkspaceSignature(owner,member,role);if(!expected||!signature||signature.length!==expected.length)return false;
 let diff=0;for(let i=0;i<expected.length;i++)diff|=expected.charCodeAt(i)^signature.charCodeAt(i);return diff===0;
}
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const noStore={'Cache-Control':'private, no-store'};

/**
 * Single server-side enforcement point of company team roles for /api/pro/*.
 * 1. Always removes client-supplied workspace headers (only this gate may set them, and it signs them).
 * 2. With the workspace cookie, asks SQL `pro_team_route_authorize` (role of the member in that
 *    company → capability of this method/route → `pro_role_require`). Denied → 403 here, before
 *    any route runs. Allowed → headers for `workspace-user.ts` so the route acts on the owner's
 *    workspace; the expected-actor header of the member is mapped to the owner.
 * A stale cookie (no longer a member) is ignored: the account works in its own workspace.
 * `/api/pro/team-roles` resolves membership itself (it is how a member enters or leaves) and the
 * per-job collaborator routes (`team`, `team-task-*`) and the subcontractor portal (`sub-portal`,
 * Round 8) always keep the account's own identity.
 */
export async function proWorkspaceGate(request:NextRequest):Promise<NextResponse|null>{
 for(const name of Object.values(PRO_WS_HEADERS))request.headers.delete(name);
 const path=request.nextUrl.pathname;
 if(!path.startsWith('/api/pro/')||/^\/api\/pro\/(?:team|team-roles|team-task-discussion|team-task-mentions|sub-portal)(?:\/|$)/.test(path))return null;
 const owner=request.cookies.get(PRO_WS_COOKIE)?.value;
 if(!owner||!UUID.test(owner))return null;
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,anon=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,service=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!anon||!service)return null;
 try{
  const supabase=createServerClient(url,anon,{cookies:{getAll:()=>request.cookies.getAll(),setAll:()=>{}}});
  const {data,error}=await supabase.auth.getClaims();const member=data?.claims?.sub;
  if(error||typeof member!=='string'||!UUID.test(member)||member===owner)return null;
  const response=await fetch(url+'/rest/v1/rpc/pro_team_route_authorize',{method:'POST',cache:'no-store',headers:{apikey:service,Authorization:'Bearer '+service,'Content-Type':'application/json'},body:JSON.stringify({p_member:member,p_owner:owner,p_method:request.method,p_path:path.slice(0,200)})});
  if(!response.ok)return NextResponse.json({error:'No se pudo comprobar su rol en la empresa.'},{status:503,headers:noStore});
  const result=await response.json() as {allowed?:boolean;reason?:string;role?:string;capability?:string};
  if(!result.allowed){
   if(result.reason==='not_member')return null;
   // F4 team gate (pro-editions-team-gate-local.sql): the owner's edition does not include this route's module.
   if(result.reason==='module_disabled')return NextResponse.json({error:'Este módulo no está activo en la edición de esta empresa.',code:'module_disabled',module:(result as {module?:string}).module??null},{status:403,headers:noStore});
   return NextResponse.json({error:'Su rol en esta empresa no permite este cambio.',code:'pro_role',role:result.role??null,capability:result.capability??null},{status:403,headers:noStore});
  }
  const role=String(result.role),signature=await proWorkspaceSignature(owner,member,role);if(!signature)return null;
  request.headers.set(PRO_WS_HEADERS.owner,owner);request.headers.set(PRO_WS_HEADERS.member,member);request.headers.set(PRO_WS_HEADERS.role,role);request.headers.set(PRO_WS_HEADERS.signature,signature);
  if(request.headers.get('x-pro-expected-actor')===member)request.headers.set('x-pro-expected-actor',owner);
  return null;
 }catch{return NextResponse.json({error:'No se pudo comprobar su rol en la empresa.'},{status:503,headers:noStore});}
}
