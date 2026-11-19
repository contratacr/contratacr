import {z} from 'zod';
import {enforceRateLimit} from '@/lib/rate-limit';
import {proBoundedJson,proSameOrigin} from '@/lib/pro/route-common';
import {proReservationPostSchema} from '@/lib/directory/place-features';
import {DINING_VERTICALS,businessContext,businessPlaces} from '@/lib/directory/business-access';
import {sendReservationNoticeMock,type ReservationNotice} from '@/lib/directory/reservation-notify';
import {dirDbError,dirEnabledOnly,dirFail,dirOk} from '@/lib/directory/public-route';

// Launch without Pro (2026-11-18): table reservations + waitlist of a claimed restaurant/café for its owner/managers
// (acting as themselves). Same SQL as /api/pro/table-reservations; no edition/module gate: free with the claim.
//  GET (no placeId) → {places} · GET ?placeId=&day= → dir_reservation_owner_read
//  POST {op:'settings',input} → dir_reservation_settings_mutate · POST {op:'decide',input} → dir_reservation_decide
//  (customer notice through the current MOCK sender, as in the Pro route).
export async function GET(req:Request){
 const off=dirEnabledOnly();if(off)return off;
 const limited=await enforceRateLimit(req,'dir-business-res-read',120,60_000);if(limited)return limited;
 const c=await businessContext(req);if(c.error)return c.error;const {db,actor}=c.ctx;
 const q=new URL(req.url).searchParams,placeId=q.get('placeId'),day=q.get('day');
 if(!placeId)return dirOk({places:await businessPlaces(db,actor,DINING_VERTICALS)});
 if(!z.string().uuid().safeParse(placeId).success||(day&&!/^\d{4}-\d{2}-\d{2}$/.test(day)))return dirFail(400,'invalid');
 const r=await db.rpc('dir_reservation_owner_read',{p_actor:actor,p_member:null,p_place:placeId,p_day:day||null});
 return r.error?dirDbError(r.error):dirOk(r.data);
}
export async function POST(req:Request){
 const off=dirEnabledOnly();if(off)return off;
 if(!proSameOrigin(req))return dirFail(403,'origin','Origen no autorizado.');
 const c=await businessContext(req);if(c.error)return c.error;const {db,actor}=c.ctx;
 const limited=await enforceRateLimit(req,'dir-table-res-'+actor,120,60_000);if(limited)return limited;
 const en=req.headers.get('accept-language')?.toLowerCase().startsWith('en')??false;
 let raw:unknown;try{raw=await proBoundedJson(req,32768);}catch{return dirFail(400,'invalid');}
 const body=proReservationPostSchema.safeParse(raw);if(!body.success)return dirFail(400,'invalid');
 if(body.data.op==='settings'){
  const r=await db.rpc('dir_reservation_settings_mutate',{p_actor:actor,p_member:null,p_input:body.data.input});
  return r.error?dirDbError(r.error):dirOk(r.data);
 }
 const r=await db.rpc('dir_reservation_decide',{p_actor:actor,p_member:null,p_input:body.data.input});
 if(r.error)return dirDbError(r.error);
 const data=r.data as {reservationId:string;revision:number;status:string;notice:ReservationNotice|null};
 return dirOk({reservationId:data.reservationId,revision:data.revision,status:data.status,notice:data.notice?sendReservationNoticeMock(data.notice,en):null});
}
