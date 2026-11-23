import {z} from 'zod';
import {enforceRateLimit} from '@/lib/rate-limit';
import {proBoundedJson,proSameOrigin} from '@/lib/pro/route-common';
import {proHasModule} from '@/lib/pro/api-access-module';
import {proReservationPostSchema} from '@/lib/directory/place-features';
import {managedPlaces,proPlaceContext} from '@/lib/directory/pro-place-route';
import {sendReservationNoticeMock,type ReservationNotice} from '@/lib/directory/reservation-notify';
import {dirDbError,dirFail,dirOk} from '@/lib/directory/public-route';
import {PRO_ENABLED} from '@/lib/pro/enabled';

// LOCAL PRO ONLY (place features round, development only): owner side of table reservations, /api/pro/table-reservations.
// Module 'table_reservations' (edition restaurantes; already mapped by pro_route_module, so the team gate also checks it).
// The gate maps POST here to work.write: members manage bookings, read_only only reads (SQL re-checks per action).
//  GET  (no placeId)            → {places}: claimed restaurants/cafés the account manages.
//  GET  ?placeId=<uuid>[&day=]  → dir_reservation_owner_read (settings + that day's bookings and waitlist).
//  POST {op:'settings',input}   → dir_reservation_settings_mutate (opt-in, slots; CAS → 409; idempotent actionId).
//  POST {op:'decide',input}     → dir_reservation_decide; the customer notice (confirmed/declined/table ready) goes to
//                                  the MOCK sender only; the answer carries {kind, channel, sender:'mock'}, never the
//                                  destination.
const SECTIONS=['restaurant','cafe_bar'] as const;
export async function GET(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404});
 const c=await proPlaceContext(req);if(c.error)return c.error;const {db,actor,member}=c.ctx;
 if(!await proHasModule(db,actor,'table_reservations'))return dirFail(403,'module_unavailable');
 const q=new URL(req.url).searchParams,placeId=q.get('placeId'),day=q.get('day');
 if(!placeId)return dirOk({places:await managedPlaces(db,actor,SECTIONS)});
 if(!z.string().uuid().safeParse(placeId).success||(day&&!/^\d{4}-\d{2}-\d{2}$/.test(day)))return dirFail(400,'invalid');
 const r=await db.rpc('dir_reservation_owner_read',{p_actor:actor,p_member:member,p_place:placeId,p_day:day||null});
 return r.error?dirDbError(r.error):dirOk(r.data);
}
export async function POST(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404});
 if(!proSameOrigin(req))return dirFail(403,'origin','Origen no autorizado.');
 const c=await proPlaceContext(req);if(c.error)return c.error;const {db,actor,member}=c.ctx;
 const limited=await enforceRateLimit(req,'dir-table-res-'+actor,120,60_000);if(limited)return limited;
 if(!await proHasModule(db,actor,'table_reservations'))return dirFail(403,'module_unavailable');
 const en=req.headers.get('accept-language')?.toLowerCase().startsWith('en')??false;
 let raw:unknown;try{raw=await proBoundedJson(req,32768);}catch{return dirFail(400,'invalid');}
 const body=proReservationPostSchema.safeParse(raw);if(!body.success)return dirFail(400,'invalid');
 if(body.data.op==='settings'){
  const r=await db.rpc('dir_reservation_settings_mutate',{p_actor:actor,p_member:member,p_input:body.data.input});
  return r.error?dirDbError(r.error):dirOk(r.data);
 }
 const r=await db.rpc('dir_reservation_decide',{p_actor:actor,p_member:member,p_input:body.data.input});
 if(r.error)return dirDbError(r.error);
 const data=r.data as {reservationId:string;revision:number;status:string;notice:ReservationNotice|null};
 return dirOk({reservationId:data.reservationId,revision:data.revision,status:data.status,notice:data.notice?sendReservationNoticeMock(data.notice,en):null});
}
