import {createAdminClient} from '@/lib/supabase/admin';
import {createClient} from '@/lib/supabase/server';
import {safeGetUser} from '@/lib/supabase/get-user';
import {enforceRateLimit} from '@/lib/rate-limit';
import {proBoundedJson,proSameOrigin} from '@/lib/pro/route-common';
import {placeSlugSchema} from '@/lib/directory/schemas';
import {reservationRequestSchema} from '@/lib/directory/place-features';
import {sendReservationNoticeMock} from '@/lib/directory/reservation-notify';
import {reservationAccessHash,reservationAccessToken,reservationLink} from '@/lib/directory/reservation-access';
import {dirDbError,dirDeviceId,dirEnabledOnly,dirFail,dirOk,dirPepper,hmacHex} from '@/lib/directory/public-route';

// LOCAL PRO ONLY (place features round, development only): table reservations and the same-day waitlist of a claimed
// restaurant/café that turned them on.
//  GET  ?day=YYYY-MM-DD → {config, times:[{time,left}]} (dir_reservation_public_config / dir_reservation_availability).
//  POST {kind:'booking'|'waitlist', actionId, reservationId, …} → dir_reservation_request / dir_waitlist_join. Signed
//       in: the person; otherwise the device (httpOnly cookie, only its server HMAC reaches the database). No payment
//       or deposit data exists here. The «received» notice goes to the MOCK sender only.
//       Pending fixes round (2026-11-17): the answer also carries `accessToken` — the private link /reserva/<token>
//       (status + cancel), shown once on screen and included in the mock «received» notice. Only SHA-256(token) is stored.
export async function GET(req:Request,{params}:{params:Promise<{slug:string}>}){
 const off=dirEnabledOnly();if(off)return off;
 const limited=await enforceRateLimit(req,'dir-reservation-read',60,60_000);if(limited)return limited;
 const {slug}=await params;if(!placeSlugSchema.safeParse(slug).success)return dirFail(404,'not_found');
 const day=new URL(req.url).searchParams.get('day');
 const db=createAdminClient(),config=await db.rpc('dir_reservation_public_config',{p_slug:slug});
 if(config.error)return dirDbError(config.error);if(!config.data)return dirFail(404,'reservations_off');
 if(!day)return dirOk({config:config.data,times:[]});
 if(!/^\d{4}-\d{2}-\d{2}$/.test(day))return dirFail(400,'invalid');
 const times=await db.rpc('dir_reservation_availability',{p_slug:slug,p_day:day});
 return times.error?dirDbError(times.error):dirOk({config:config.data,times:times.data??[]});
}
export async function POST(req:Request,{params}:{params:Promise<{slug:string}>}){
 const off=dirEnabledOnly();if(off)return off;
 if(!proSameOrigin(req))return dirFail(403,'origin','Origen no autorizado.');
 const limited=await enforceRateLimit(req,'dir-reservation',10,60_000);if(limited)return limited;
 const {slug}=await params;if(!placeSlugSchema.safeParse(slug).success)return dirFail(404,'not_found');
 const en=req.headers.get('accept-language')?.toLowerCase().startsWith('en')??false;
 let raw:unknown;try{raw=await proBoundedJson(req,4096);}catch{return dirFail(400,'invalid');}
 const body=reservationRequestSchema.safeParse(raw);
 if(!body.success)return dirFail(400,body.error.issues.some(i=>i.message==='contact_required')?'contact_required':'invalid');
 const user=await safeGetUser(await createClient());
 let visitorHash:string|undefined;
 if(!user){const pepper=dirPepper('DIR_VISITOR_PEPPER');if(!pepper)return dirFail(503,'unavailable');visitorHash=await hmacHex(pepper,'device:'+await dirDeviceId(true));}
 const {kind,...rest}=body.data;
 const accessToken=await reservationAccessToken(rest.reservationId),accessHash=accessToken&&reservationAccessHash(accessToken);
 if(!accessToken||!accessHash)return dirFail(503,'unavailable');
 const input=JSON.parse(JSON.stringify({...rest,slug,...(visitorHash?{visitorHash}:{}),accessHash}));
 const db=createAdminClient();
 const result=await db.rpc(kind==='booking'?'dir_reservation_request':'dir_waitlist_join',{p_actor:user?.id??null,p_input:input});
 if(result.error)return dirDbError(result.error);
 const data=result.data as {reservationId:string;reference:string;status:string;day?:string;time?:string;partySize?:number;position?:number;notice?:{kind:'received';channel:'email'|'sms'}};
 const link=new URL(reservationLink(accessToken,en?'en':'es'),req.url).toString();
 let notice=null;
 if(data.notice){
  const place=await db.from('dir_places').select('name').eq('slug',slug).maybeSingle();
  notice=sendReservationNoticeMock({kind:'received',channel:data.notice.channel,to:body.data.email??body.data.phone??'',reference:data.reference,day:data.day,time:data.time,partySize:data.partySize,placeName:place.data?.name as string|undefined,link},en);
 }
 return dirOk({reference:data.reference,status:data.status,position:data.position??null,notice,accessToken});
}
