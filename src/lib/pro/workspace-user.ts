import type {SupabaseClient,User} from '@supabase/supabase-js';
import {headers} from 'next/headers';
import {safeGetUser as baseSafeGetUser} from '@/lib/supabase/get-user';
import {PRO_WS_HEADERS,proWorkspaceSignatureValid} from './workspace-gate';

/**
 * Round 7C (company team roles). Same contract as the shared safeGetUser, used by every /api/pro
 * route. When the middleware gate (`proWorkspaceGate`) authorized this request for a company
 * member working in the owner's company — it already checked the member's role for this method
 * and route through the single SQL helper — the effective account is the owner's, so the route
 * reads and writes that workspace. The gate always deletes client-supplied copies of these
 * headers and signs the ones it sets; only a valid gate signature substitutes the account, so a
 * forged copy that reaches a route the gate did not run on is ignored (final verification
 * 2026-11-14). Without them (owners, customers) nothing changes.
 * The substituted account carries no email: email-bound flows (invitation or quote claims) belong
 * to the person, never to the company they are working in.
 */
async function gateHeaders(){
 try{
  const h=await headers();const owner=h.get(PRO_WS_HEADERS.owner),member=h.get(PRO_WS_HEADERS.member),role=h.get(PRO_WS_HEADERS.role);
  if(!owner||!member||!role||owner===member)return null;
  return await proWorkspaceSignatureValid(owner,member,role,h.get(PRO_WS_HEADERS.signature))?{owner,member,role}:null;
 }catch{return null;}
}
export async function safeGetUser(client:SupabaseClient):Promise<User|null>{
 const user=await baseSafeGetUser(client);if(!user)return null;
 const gate=await gateHeaders();
 if(gate&&gate.member===user.id)return{...user,id:gate.owner,email:undefined,email_confirmed_at:undefined,phone:undefined,phone_confirmed_at:undefined};
 return user;
}
/** The member identity behind an effective owner account (null for owners). */
export async function proWorkspaceMember():Promise<{memberId:string;ownerId:string;role:string}|null>{
 const gate=await gateHeaders();return gate?{memberId:gate.member,ownerId:gate.owner,role:gate.role}:null;
}
