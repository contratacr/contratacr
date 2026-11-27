import {z} from 'zod';
import {buildPlaceCreateInput} from './admin-place-create';

// «Empresa o local» at sign-up (owner 2026-11-27, directory on): a business that is not in the directory asks to be added.
// POST /api/negocio/solicitud → dir_place_mutate create with source `owner` and the person as actor: the place stays a
// DRAFT (not public) and appears in /admin/directorio «Lugares nuevos»; staff publish or reject it with the status action.
// Once published, the person claims it from its page (/lugar/<slug>/reclamar). No new tables: the requester is the actor
// of the create action (dir_place_actions / dir_place_history).

export const placeRequestSchema=z.object({
 actionId:z.string().uuid(),
 place:z.object({
  vertical:z.string().max(40),name:z.string().max(160),kind:z.string().max(30).optional(),
  adminArea1:z.string().max(80).optional(),adminArea2:z.string().max(80).optional(),adminArea3:z.string().max(80).optional(),
  addressLine:z.string().max(300).optional(),phone:z.string().max(30).optional(),whatsapp:z.string().max(30).optional(),website:z.string().max(500).optional(),
 }).strict(),
}).strict();

/** Same checks as the team's form (placeMutationSchema via buildPlaceCreateInput); no pin and no hours from the requester. */
export function buildPlaceRequest(raw:unknown):{ok:true;actionId:string;place:Record<string,unknown>}|{ok:false;field:string}{
 const req=placeRequestSchema.safeParse(raw);
 if(!req.success)return {ok:false,field:String(req.error.issues[0]?.path.slice(-1)[0]??'invalid')};
 if(req.data.place.name.trim().length<2)return {ok:false,field:'name'};
 const built=buildPlaceCreateInput({kind:'place_create',actionId:req.data.actionId,place:req.data.place,hours:[]});
 return built.ok?{ok:true,actionId:built.input.actionId,place:built.input.place}:built;
}

/** Stable place id for one request (a retry with the same actionId never creates a second place). */
export async function requestPlaceId(actor:string,actionId:string){
 const h=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`place-request:${actor}:${actionId}`))).slice(0,16);
 h[6]=(h[6]&0x0f)|0x50;h[8]=(h[8]&0x3f)|0x80;
 const x=Array.from(h,b=>b.toString(16).padStart(2,'0')).join('');
 return `${x.slice(0,8)}-${x.slice(8,12)}-${x.slice(12,16)}-${x.slice(16,20)}-${x.slice(20)}`;
}

/** Same slug shape as dir_admin_place_create: the name in lower case with dashes + 6 characters of the id. */
export function requestPlaceSlug(name:string,placeId:string){
 let base=name.normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,60).replace(/-+$/,'');
 if(base.length<2)base='lugar';
 return `${base}-${placeId.replace(/-/g,'').slice(0,6)}`;
}

type AdminDb=ReturnType<typeof import('@/lib/supabase/admin').createAdminClient>;

/** Staff queue «Lugares nuevos»: draft places created by people (source `owner`), newest first, with who asked. */
export async function placeRequestQueue(db:AdminDb){
 const acts=await db.from('dir_place_actions').select('actor_id,input,created_at').eq('input->>action','create').eq('input->source->>id','owner')
  .order('created_at',{ascending:false}).limit(200);
 if(acts.error)return {error:acts.error};
 const byPlace=new Map((acts.data??[]).map(a=>[(a.input as {placeId?:string}).placeId??'',a]));
 const ids=[...byPlace.keys()].filter(Boolean);
 if(!ids.length)return {items:[]};
 const places=await db.from('dir_places').select('id,slug,name,vertical_id,admin_area_1,admin_area_2,admin_area_3,address_line,phone,website,attributes,revision,created_at')
  .in('id',ids).eq('status','draft').order('created_at',{ascending:false}).limit(100);
 if(places.error)return {error:places.error};
 const actors=[...new Set((places.data??[]).map(p=>byPlace.get(p.id)?.actor_id).filter((x):x is string=>!!x))];
 const people=actors.length?await db.from('profiles').select('id,full_name,email').in('id',actors):{data:[] as {id:string;full_name:string|null;email:string|null}[]};
 const who=new Map((people.data??[]).map(p=>[p.id,p]));
 return {items:(places.data??[]).map(p=>{const by=who.get(byPlace.get(p.id)?.actor_id??'');return {
  placeId:p.id,slug:p.slug,name:p.name,vertical:p.vertical_id,area:[p.admin_area_3,p.admin_area_2,p.admin_area_1].filter(Boolean).join(', '),address:p.address_line,
  phone:p.phone,whatsapp:(p.attributes as {whatsapp?:string}|null)?.whatsapp??null,website:p.website,revision:p.revision,at:p.created_at,
  requesterName:by?.full_name??null,requesterEmail:by?.email??null};})};
}

export const placeRequestDecisionSchema=z.object({
 kind:z.literal('place_request'),actionId:z.string().uuid(),placeId:z.string().uuid(),revision:z.number().int().min(0),
 decision:z.enum(['publish','reject']),
}).strict();
