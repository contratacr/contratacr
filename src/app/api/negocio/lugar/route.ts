import {z} from 'zod';
import {enforceRateLimit} from '@/lib/rate-limit';
import {proBoundedJson,proSameOrigin} from '@/lib/pro/route-common';
import {eventMutationSchema,orderLinkSchema} from '@/lib/directory/place-features';
import {businessContext,businessPlaces} from '@/lib/directory/business-access';
import {dirDbError,dirEnabledOnly,dirFail,dirOk} from '@/lib/directory/public-route';

// Launch without Pro (2026-11-18): events and the «Pedir» button of a claimed place for its owner/managers (acting as
// themselves; same SQL as /api/pro/place-events: dir_tool_authorize = active manager of the claimed place).
//  GET (no placeId) → {places} (every section except banks) · GET ?placeId= → {events, order}
//  POST {op:'event',input} → dir_event_mutate · POST {op:'order',input} → dir_order_link_mutate
const postSchema=z.discriminatedUnion('op',[z.object({op:z.literal('event'),input:eventMutationSchema}).strict(),z.object({op:z.literal('order'),input:orderLinkSchema}).strict()]);
export async function GET(req:Request){
 const off=dirEnabledOnly();if(off)return off;
 const limited=await enforceRateLimit(req,'dir-business-place-read',60,60_000);if(limited)return limited;
 const c=await businessContext(req);if(c.error)return c.error;const {db,actor}=c.ctx;
 const placeId=new URL(req.url).searchParams.get('placeId');
 if(!placeId)return dirOk({places:(await businessPlaces(db,actor)).filter(p=>p.vertical!=='banking')});
 if(!z.string().uuid().safeParse(placeId).success)return dirFail(400,'invalid');
 const [events,order]=await Promise.all([db.rpc('dir_events_owner_list',{p_actor:actor,p_member:null,p_place:placeId}),db.rpc('dir_order_link_read',{p_actor:actor,p_member:null,p_place:placeId})]);
 if(events.error)return dirDbError(events.error);if(order.error)return dirDbError(order.error);
 return dirOk({events:events.data,order:order.data});
}
export async function POST(req:Request){
 const off=dirEnabledOnly();if(off)return off;
 if(!proSameOrigin(req))return dirFail(403,'origin','Origen no autorizado.');
 const c=await businessContext(req);if(c.error)return c.error;const {db,actor}=c.ctx;
 const limited=await enforceRateLimit(req,'dir-place-events-'+actor,60,60_000);if(limited)return limited;
 let raw:unknown;try{raw=await proBoundedJson(req,8192);}catch{return dirFail(400,'invalid');}
 const body=postSchema.safeParse(raw);
 if(!body.success)return dirFail(400,body.error.issues.some(i=>i.message==='value_required')?'order_value':(raw as {op?:string})?.op==='event'?'event_fields':'invalid');
 const input=body.data.op==='order'?{...body.data.input,value:body.data.input.channel?body.data.input.value:null}:body.data.input;
 const r=await db.rpc(body.data.op==='event'?'dir_event_mutate':'dir_order_link_mutate',{p_actor:actor,p_member:null,p_input:JSON.parse(JSON.stringify(input))});
 return r.error?dirDbError(r.error):dirOk(r.data);
}
