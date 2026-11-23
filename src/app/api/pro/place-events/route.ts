import {z} from 'zod';
import {enforceRateLimit} from '@/lib/rate-limit';
import {proBoundedJson,proSameOrigin} from '@/lib/pro/route-common';
import {eventMutationSchema,orderLinkSchema} from '@/lib/directory/place-features';
import {managedPlaces,proPlaceContext} from '@/lib/directory/pro-place-route';
import {dirDbError,dirFail,dirOk} from '@/lib/directory/public-route';
import {PRO_ENABLED} from '@/lib/pro/enabled';

// LOCAL PRO ONLY (place features round, development only): events and the «Pedir» button of a claimed place,
// /api/pro/place-events. Public-facing, so the SQL requires listing.publish for company members (admin/manager);
// members and read_only only read.
//  GET  (no placeId)        → {places}: claimed places the account manages (every section except banks).
//  GET  ?placeId=<uuid>     → {events: dir_events_owner_list, order: dir_order_link_read}.
//  POST {op:'event',input}  → dir_event_mutate (create/update/cancel; CAS → 409; idempotent actionId; staff queue).
//  POST {op:'order',input}  → dir_order_link_mutate (own WhatsApp / https order page / phone only; link-out, no orders).
const postSchema=z.discriminatedUnion('op',[z.object({op:z.literal('event'),input:eventMutationSchema}).strict(),z.object({op:z.literal('order'),input:orderLinkSchema}).strict()]);
export async function GET(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404});
 const c=await proPlaceContext(req);if(c.error)return c.error;const {db,actor,member}=c.ctx;
 const placeId=new URL(req.url).searchParams.get('placeId');
 if(!placeId)return dirOk({places:(await managedPlaces(db,actor)).filter(p=>p.vertical!=='banking')});
 if(!z.string().uuid().safeParse(placeId).success)return dirFail(400,'invalid');
 const [events,order]=await Promise.all([db.rpc('dir_events_owner_list',{p_actor:actor,p_member:member,p_place:placeId}),db.rpc('dir_order_link_read',{p_actor:actor,p_member:member,p_place:placeId})]);
 if(events.error)return dirDbError(events.error);if(order.error)return dirDbError(order.error);
 return dirOk({events:events.data,order:order.data});
}
export async function POST(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404});
 if(!proSameOrigin(req))return dirFail(403,'origin','Origen no autorizado.');
 const c=await proPlaceContext(req);if(c.error)return c.error;const {db,actor,member}=c.ctx;
 const limited=await enforceRateLimit(req,'dir-place-events-'+actor,60,60_000);if(limited)return limited;
 let raw:unknown;try{raw=await proBoundedJson(req,8192);}catch{return dirFail(400,'invalid');}
 const body=postSchema.safeParse(raw);
 if(!body.success)return dirFail(400,body.error.issues.some(i=>i.message==='value_required')?'order_value':body.data===undefined&&(raw as {op?:string})?.op==='event'?'event_fields':'invalid');
 const input=body.data.op==='order'?{...body.data.input,value:body.data.input.channel?body.data.input.value:null}:body.data.input;
 const r=await db.rpc(body.data.op==='event'?'dir_event_mutate':'dir_order_link_mutate',{p_actor:actor,p_member:member,p_input:JSON.parse(JSON.stringify(input))});
 return r.error?dirDbError(r.error):dirOk(r.data);
}
