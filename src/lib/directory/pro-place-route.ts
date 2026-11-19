import 'server-only';
import {proActor} from '@/lib/pro/route-common';
import {proWorkspaceMember} from '@/lib/pro/workspace-user';
import {dirFail} from './public-route';
import type {createAdminClient} from '@/lib/supabase/admin';

// LOCAL PRO ONLY (place features round, 2026-11-17): shared context of the Pro routes that manage a CLAIMED place
// (table reservations, events, «Pedir», brand info). Same model as /api/pro/menu: the workspace gate already resolved
// the effective account (the owner's when a company member works in it) and checked the member's role for the route;
// `member` is the person behind it, and the SQL re-checks the role per action (dir_tool_authorize). Pro must be active
// (pro_entitled: banned/expired accounts are refused) — Pro is free during the launch.
export type ProPlaceContext={db:ReturnType<typeof createAdminClient>;actor:string;member:string|null};
export async function proPlaceContext(req:Request):Promise<{ctx:ProPlaceContext;error:null}|{ctx:null;error:Response}>{
 const a=await proActor(req);if(a.error)return {ctx:null,error:a.error};
 const m=await proWorkspaceMember();
 const entitled=await a.db.rpc('pro_entitled',{p_actor:a.user.id});
 if(entitled.error||entitled.data!==true)return {ctx:null,error:dirFail(403,'module_unavailable','Active ContrataCR Pro para usar esta herramienta.')};
 return {ctx:{db:a.db,actor:a.user.id,member:m&&m.ownerId===a.user.id?m.memberId:null},error:null};
}
export type ManagedPlace={id:string;slug:string;name:string;vertical:string};
/** Claimed places the effective account actively manages (optionally only some sections), by name. */
export async function managedPlaces(db:ProPlaceContext['db'],actor:string,verticals?:readonly string[]):Promise<ManagedPlace[]>{
 const m=await db.from('dir_place_managers').select('place_id').eq('user_id',actor).eq('status','active');
 const ids=(m.data??[]).map(r=>r.place_id as string);if(!ids.length)return [];
 const rows=(await db.from('dir_places').select('id,slug,name,vertical_id,claim_status').in('id',ids)).data??[];
 return (rows as {id:string;slug:string;name:string;vertical_id:string;claim_status:string}[])
  .filter(p=>p.claim_status==='claimed'&&(!verticals||verticals.includes(p.vertical_id)))
  .map(p=>({id:p.id,slug:p.slug,name:p.name,vertical:p.vertical_id})).sort((a,b)=>a.name.localeCompare(b.name,'es'));
}
