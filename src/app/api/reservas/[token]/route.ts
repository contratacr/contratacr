import {createAdminClient} from '@/lib/supabase/admin';
import {enforceRateLimit} from '@/lib/rate-limit';
import {proBoundedJson,proSameOrigin} from '@/lib/pro/route-common';
import {reservationCancelSchema,type CustomerReservation} from '@/lib/directory/place-features';
import {reservationAccessHash} from '@/lib/directory/reservation-access';
import {sendReservationNoticeMock} from '@/lib/directory/reservation-notify';
import {dirDbError,dirEnabledOnly,dirFail,dirOk} from '@/lib/directory/public-route';

// LOCAL PRO ONLY (pending fixes round, 2026-11-17; development only like /lugar): the customer's private reservation link.
//  GET               → status, waitlist position and timeline (dir_reservation_by_access); unknown token → 404.
//  POST {actionId, revision} → cancel until the start time (dir_reservation_customer_cancel: CAS 409, idempotent
//                       actionId, immutable 'customer_cancel' event). The business is told through the MOCK sender only
//                       (account e-mail of the place's active managers; never shown to the customer).
// The token is the only key: no ids in the URL or in the answer. Rate limited per IP (read 60/min, cancel 10/min).
type CancelResult=CustomerReservation&{ownerNotice:{kind:'customer_cancelled';channel:'email';placeId:string;reference:string;name:string;day:string;time:string|null;partySize:number;waitlist:boolean}};
export async function GET(req:Request,{params}:{params:Promise<{token:string}>}){
 const off=dirEnabledOnly();if(off)return off;
 const limited=await enforceRateLimit(req,'dir-reservation-status',60,60_000);if(limited)return limited;
 const hash=reservationAccessHash((await params).token);if(!hash)return dirFail(404,'not_found');
 const r=await createAdminClient().rpc('dir_reservation_by_access',{p_access_hash:hash});
 if(r.error)return dirDbError(r.error);
 return r.data?dirOk(r.data):dirFail(404,'not_found');
}
export async function POST(req:Request,{params}:{params:Promise<{token:string}>}){
 const off=dirEnabledOnly();if(off)return off;
 if(!proSameOrigin(req))return dirFail(403,'origin','Origen no autorizado.');
 const limited=await enforceRateLimit(req,'dir-reservation-cancel',10,60_000);if(limited)return limited;
 const hash=reservationAccessHash((await params).token);if(!hash)return dirFail(404,'not_found');
 const en=req.headers.get('accept-language')?.toLowerCase().startsWith('en')??false;
 let raw:unknown;try{raw=await proBoundedJson(req,1024);}catch{return dirFail(400,'invalid');}
 const body=reservationCancelSchema.safeParse(raw);if(!body.success)return dirFail(400,'invalid');
 const db=createAdminClient();
 const r=await db.rpc('dir_reservation_customer_cancel',{p_input:{...body.data,accessHash:hash}});
 if(r.error)return dirDbError(r.error);
 const {ownerNotice,...view}=r.data as CancelResult;
 const managers=await db.from('dir_place_managers').select('user_id').eq('place_id',ownerNotice.placeId).eq('status','active').limit(5);
 const place=await db.from('dir_places').select('name').eq('id',ownerNotice.placeId).maybeSingle();
 for(const m of managers.data??[]){
  const u=await db.auth.admin.getUserById(m.user_id as string);const to=u.data.user?.email;if(!to)continue;
  sendReservationNoticeMock({kind:'customer_cancelled',channel:'email',to,name:ownerNotice.name,reference:ownerNotice.reference,day:ownerNotice.day,time:ownerNotice.time,
   partySize:ownerNotice.partySize,placeName:place.data?.name as string|undefined,waitlist:ownerNotice.waitlist},en);
 }
 return dirOk(view);
}
