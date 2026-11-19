import 'server-only';
import {createAdminClient} from '@/lib/supabase/admin';
import {createClient} from '@/lib/supabase/server';
import {safeGetUser} from '@/lib/supabase/get-user';
import {dirFail} from './public-route';

// Launch without Pro (2026-11-18): «Mi negocio» — the owner tools of a CLAIMED place, free, outside ContrataCR Pro
// (/dashboard/negocio/*, /api/negocio/*). The person acts as THEMSELVES (p_actor = their account, p_member = null):
// the SQL (dir_tool_authorize, pro_menu_authorize, dir_review_reply_write, dir_owner_place_update) requires an active
// owner/manager row of the claimed place in dir_place_managers. No edition, no Pro membership, no Pro workspace.
// Company members of a Pro team keep using the Pro routes (/dashboard/pro/*, /api/pro/*) while PRO_ENABLED is on.
export type BusinessDb=ReturnType<typeof createAdminClient>;
export type BusinessContext={db:BusinessDb;actor:string};

/** Signed-in, enabled account. Errors answer {error, reason} like the other directory routes. */
export async function businessContext(req:Request):Promise<{ctx:BusinessContext;error:null}|{ctx:null;error:Response}>{
 const user=await safeGetUser(await createClient());
 if(!user)return {ctx:null,error:dirFail(401,'login','Inicie sesión.')};
 const expected=req.headers.get('x-pro-expected-actor');
 if(expected!==null&&expected!==user.id)return {ctx:null,error:dirFail(403,'account_changed','La cuenta cambió. Recargue la página.')};
 const db=createAdminClient(),profile=await db.from('profiles').select('is_disabled').eq('id',user.id).maybeSingle();
 if(profile.error)return {ctx:null,error:dirFail(503,'unavailable')};
 if(!profile.data||profile.data.is_disabled)return {ctx:null,error:dirFail(403,'forbidden','Sin acceso.')};
 return {ctx:{db,actor:user.id},error:null};
}

export type BusinessPlace={id:string;slug:string;name:string;vertical:string;role:'owner'|'manager'};
/** Claimed places the account actively manages (optionally only some sections), by name. */
export async function businessPlaces(db:BusinessDb,actor:string,verticals?:readonly string[]):Promise<BusinessPlace[]>{
 const m=await db.from('dir_place_managers').select('place_id,role').eq('user_id',actor).eq('status','active');
 const roles=new Map((m.data??[]).map(r=>[r.place_id as string,r.role as 'owner'|'manager']));if(!roles.size)return [];
 const rows=(await db.from('dir_places').select('id,slug,name,vertical_id,claim_status,status').in('id',[...roles.keys()])).data??[];
 return (rows as {id:string;slug:string;name:string;vertical_id:string;claim_status:string;status:string}[])
  .filter(p=>p.claim_status==='claimed'&&p.status!=='removed'&&(!verticals||verticals.includes(p.vertical_id)))
  .map(p=>({id:p.id,slug:p.slug,name:p.name,vertical:p.vertical_id,role:roles.get(p.id)!})).sort((a,b)=>a.name.localeCompare(b.name,'es'));
}
export const DINING_VERTICALS=['restaurant','cafe_bar'] as const;
/** Which «Mi negocio» sections apply to these places (menu and table reservations: restaurants/cafés only). */
export function businessSections(places:BusinessPlace[]){
 const dining=places.some(p=>(DINING_VERTICALS as readonly string[]).includes(p.vertical));
 return {profile:places.length>0,menu:dining,reservations:dining,place:places.some(p=>p.vertical!=='banking')};
}
