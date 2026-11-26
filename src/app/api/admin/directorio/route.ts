import {z} from 'zod';
import {getApiAdmin} from '@/lib/auth/admin';
import {createAdminClient} from '@/lib/supabase/admin';
import {proBoundedJson,proSameOrigin} from '@/lib/pro/route-common';
import {STAFF_DECISION_RPC,STAFF_QUEUES,staffDecisionSchema} from '@/lib/directory/moderation-schemas';
import {dirDbError,dirFail,dirOk} from '@/lib/directory/public-route';
import {photoStaffDecisionSchema} from '@/lib/directory/place-photos';
import {photoDbError} from '@/lib/directory/place-photos-server';
import {FEATURE_STAFF_QUEUES,FEATURE_STAFF_RPC,featureStaffDecisionSchema} from '@/lib/directory/place-features';
import {DIR_ENABLED,DIR_HEALTH_ENABLED} from '@/lib/directory/feature-flags';
import {buildPlaceCreateInput} from '@/lib/directory/admin-place-create';

// LOCAL PRO ONLY (multivertical M1, development only): staff queue of the public directory. Administrators with a
// verified MFA session only (getApiAdmin, checked on EVERY request; never trusted from the browser).
//  GET ?queue=claims|reviews[&filter=flagged|hidden|recent]|prices[&status=pending|published]|reports|pharmacies[&q=&offset=]|log
//  POST staffDecisionSchema → dir_admin_* (idempotent actionId; expected state/revision CAS → 409 reason reload;
//       every decision lands in the immutable dir_moderation_log with its reason).
// Place features round (2026-11-17): GET ?queue=questions[&filter=flagged|hidden|recent]|events[&filter=new|hidden|recent]|brands[&q=]|brand_claims;
//  POST featureStaffDecisionSchema (qa, event, brand_merge, brand_split, brand_claim) → dir_admin_* (same guarantees).
// 2026-11-26: POST {kind:'place_create'} → dir_admin_place_create (a place added by hand by the team; admin-place-create.ts).
export async function GET(req:Request){
 if(!DIR_ENABLED)return new Response(null,{status:404});
 const admin=await getApiAdmin();if(!admin)return dirFail(403,'forbidden','Se requiere acceso administrativo verificado.');
 const sp=new URL(req.url).searchParams;
 // Launch round (2026-11-18): place photos (pending approval / reported / recent) → dir_admin_photo_queue.
 if(sp.get('queue')==='photos'){
  const filter=z.enum(['pending','flagged','recent']).catch('pending').parse(sp.get('filter')??'pending');
  const r=await createAdminClient().rpc('dir_admin_photo_queue',{p_filter:filter,p_limit:100});return r.error?photoDbError(r.error):dirOk({items:r.data});
 }
 const queue=z.enum([...STAFF_QUEUES,...FEATURE_STAFF_QUEUES]).safeParse(sp.get('queue'));
 if(!queue.success)return dirFail(400,'invalid');
 const db=createAdminClient();
 switch(queue.data){
  case 'claims':{
   const r=await db.rpc('dir_claim_queue',{p_limit:100});if(r.error)return dirDbError(r.error);
   const rows=(r.data??[]) as {claimantId:string}[];
   const ids=[...new Set(rows.map(c=>c.claimantId))];
   const people=ids.length?await db.from('profiles').select('id,full_name,email').in('id',ids):{data:[],error:null};
   if(people.error)return dirFail(503,'unavailable');
   const byId=new Map((people.data??[]).map(p=>[p.id as string,p]));
   return dirOk({items:rows.map(c=>{const p=byId.get(c.claimantId);return {...c,claimantName:p?.full_name??null,claimantEmail:p?.email??null};})});
  }
  case 'reviews':{
   const filter=z.enum(['flagged','hidden','recent']).catch('flagged').parse(sp.get('filter')??'flagged');
   const r=await db.rpc('dir_admin_review_queue',{p_filter:filter,p_limit:100});return r.error?dirDbError(r.error):dirOk({items:r.data});
  }
  case 'prices':{
   const status=z.enum(['pending','published']).catch('pending').parse(sp.get('status')??'pending');
   const r=await db.rpc('dir_admin_price_queue',{p_status:status,p_limit:100});return r.error?dirDbError(r.error):dirOk({items:r.data});
  }
  case 'reports':{const r=await db.rpc('dir_admin_report_queue',{p_limit:100});return r.error?dirDbError(r.error):dirOk({items:r.data});}
  case 'pharmacies':{
   const q=(sp.get('q')??'').replace(/[^\p{L}\p{N} .'-]/gu,'').trim().slice(0,80),offset=Math.max(0,Math.min(100000,Number(sp.get('offset'))||0));
   const r=await db.rpc('dir_admin_pharmacy_queue',{p_query:q||null,p_limit:20,p_offset:offset});return r.error?dirDbError(r.error):dirOk(r.data);
  }
  case 'log':{const r=await db.rpc('dir_admin_moderation_log',{p_limit:30});return r.error?dirDbError(r.error):dirOk({items:r.data});}
  case 'questions':{
   const filter=z.enum(['flagged','hidden','recent']).catch('flagged').parse(sp.get('filter')??'flagged');
   const r=await db.rpc('dir_admin_qa_queue',{p_filter:filter,p_limit:100});return r.error?dirDbError(r.error):dirOk({items:r.data});
  }
  case 'events':{
   const filter=z.enum(['new','hidden','recent']).catch('new').parse(sp.get('filter')??'new');
   const r=await db.rpc('dir_admin_event_queue',{p_filter:filter,p_limit:100});return r.error?dirDbError(r.error):dirOk({items:r.data});
  }
  case 'brands':{
   const q=(sp.get('q')??'').replace(/[^\p{L}\p{N} .'-]/gu,'').trim().slice(0,80);
   const r=await db.rpc('dir_admin_brand_queue',{p_query:q||null,p_limit:60});return r.error?dirDbError(r.error):dirOk({items:r.data});
  }
  case 'brand_claims':{const r=await db.rpc('dir_admin_brand_claim_queue',{p_limit:100});return r.error?dirDbError(r.error):dirOk({items:r.data});}
 }
}
export async function POST(req:Request){
 if(!DIR_ENABLED)return new Response(null,{status:404});
 if(!proSameOrigin(req))return dirFail(403,'origin','Origen no autorizado.');
 const admin=await getApiAdmin();if(!admin)return dirFail(403,'forbidden','Se requiere acceso administrativo verificado.');
 let raw:unknown;try{raw=await proBoundedJson(req,8192);}catch{return dirFail(400,'invalid');}
 const rawKind=(raw as {kind?:unknown})?.kind;
 // 2026-11-26 (owner, «los agregamos nosotros»): the team creates a published place by hand → dir_admin_place_create
 // (create + hours + publish in one transaction, source `equipo`, logged in dir_moderation_log kind 'place').
 if(rawKind==='place_create'){
  const built=buildPlaceCreateInput(raw);
  if(!built.ok)return dirFail(400,'invalid_'+built.field.replace(/[^a-zA-Z0-9]/g,'').slice(0,30),'Revise los datos.');
  if(!DIR_HEALTH_ENABLED&&built.input.place.vertical==='health')return dirFail(400,'invalid_vertical','Revise los datos.');
  const r=await createAdminClient().rpc('dir_admin_place_create',{p_actor:admin.id,p_input:JSON.parse(JSON.stringify(built.input))});
  return r.error?dirDbError(r.error):dirOk(r.data);
 }
 if(rawKind==='photo'){
  const f=photoStaffDecisionSchema.safeParse(raw);
  if(!f.success)return dirFail(400,f.error.issues[0]?.path[0]==='reason'?'reason_required':'invalid','Revise los datos.');
  const {kind:_k,...input}=f.data;void _k;
  const r=await createAdminClient().rpc('dir_admin_photo_moderate',{p_actor:admin.id,p_input:JSON.parse(JSON.stringify(input))});
  return r.error?photoDbError(r.error):dirOk(r.data);
 }
 if(typeof rawKind==='string'&&rawKind in FEATURE_STAFF_RPC){
  const f=featureStaffDecisionSchema.safeParse(raw);
  if(!f.success)return dirFail(400,f.error.issues[0]?.path[0]==='reason'?'reason_required':'invalid','Revise los datos.');
  const {kind:k,...input}=f.data;
  const r=await createAdminClient().rpc(FEATURE_STAFF_RPC[k],{p_actor:admin.id,p_input:JSON.parse(JSON.stringify(input))});
  return r.error?dirDbError(r.error):dirOk(r.data);
 }
 const body=staffDecisionSchema.safeParse(raw);
 if(!body.success)return Response.json({error:body.error.issues[0]?.message??'Revise los datos.',reason:body.error.issues[0]?.path[0]==='reason'?'reason_required':'invalid'},{status:400,headers:{'Cache-Control':'no-store, private'}});
 const {kind,...input}=body.data;
 const result=await createAdminClient().rpc(STAFF_DECISION_RPC[kind],{p_actor:admin.id,p_input:JSON.parse(JSON.stringify(input))});
 return result.error?dirDbError(result.error):dirOk(result.data);
}
