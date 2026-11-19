import {createAdminClient} from '@/lib/supabase/admin';
import {createClient} from '@/lib/supabase/server';
import {safeGetUser} from '@/lib/supabase/get-user';
import {enforceRateLimit,enforceRateLimitKey} from '@/lib/rate-limit';
import {proBoundedJson,proSameOrigin} from '@/lib/pro/route-common';
import {PRICE_REPORT_KINDS,priceReportSchema} from '@/lib/directory/moderation-schemas';
import {placeSlugSchema} from '@/lib/directory/schemas';
import {crTodayISO} from '@/lib/time-cr';
import {dirDbError,dirEnabledOnly,dirFail,dirOk} from '@/lib/directory/public-route';

// LOCAL PRO ONLY (multivertical M1, development only): «Reportar un precio» on a public place.
//  GET  → products a person may report here: active catalogue items of the kinds allowed for the vertical, NEVER
//         prescription medicines (Decreto 36868-S) and never fuel (national ARESEP price).
//  POST {actionId, itemSlug, price (CRC), observedOn (YYYY-MM-DD, not in the future, ≤ 30 days)} → price_observation_record
//       as a user_report: it starts PENDING (low confidence, not public) until a second independent report matches or
//       staff publish it in the admin queue; then it shows as «Reportado por usuarios» with its date. Signed in only.
//       Limits: 10/min per IP and 10/h per person here (memory), 30 a day per person in SQL (price_report_cap).
const MAX_AGE_DAYS=30;
async function placeOf(slug:string){
 const pub=await createAdminClient().rpc('dir_place_public',{p_slug:slug});
 if(pub.error)return {error:dirFail(503,'unavailable')} as const;
 const place=pub.data as {vertical:{id:string};status:string;currency:string}|null;
 if(!place||place.status!=='published')return {error:dirFail(404,'not_found')} as const;
 const kinds=PRICE_REPORT_KINDS[place.vertical.id];
 if(!kinds)return {error:dirFail(400,'prices_unavailable')} as const;
 return {place,kinds,error:null} as const;
}
export async function GET(_req:Request,{params}:{params:Promise<{slug:string}>}){
 const off=dirEnabledOnly();if(off)return off;
 const {slug}=await params;if(!placeSlugSchema.safeParse(slug).success)return dirFail(404,'not_found');
 const p=await placeOf(slug);if(p.error)return p.error;
 const items=await createAdminClient().from('price_items').select('slug,name,presentation,kind').eq('active',true).eq('rx_required',false).in('kind',[...p.kinds]).order('name').order('slug').limit(200);
 if(items.error)return dirFail(503,'unavailable');
 return dirOk({currency:p.place.currency,items:items.data});
}
export async function POST(req:Request,{params}:{params:Promise<{slug:string}>}){
 const off=dirEnabledOnly();if(off)return off;
 if(!proSameOrigin(req))return dirFail(403,'origin','Origen no autorizado.');
 const limited=await enforceRateLimit(req,'dir-price-report',10,60_000);if(limited)return limited;
 const {slug}=await params;if(!placeSlugSchema.safeParse(slug).success)return dirFail(404,'not_found');
 const user=await safeGetUser(await createClient());if(!user)return dirFail(401,'login','Inicie sesión para reportar un precio.');
 const perUser=await enforceRateLimitKey('dir-price-report:'+user.id,10,3_600_000);if(perUser)return perUser;
 let raw:unknown;try{raw=await proBoundedJson(req,2048);}catch{return dirFail(400,'invalid');}
 const body=priceReportSchema.safeParse(raw);if(!body.success)return dirFail(400,body.error.issues[0]?.path[0]==='price'?'price_invalid':'invalid');
 const today=crTodayISO(),day=body.data.observedOn;
 if(Number.isNaN(Date.parse(day+'T12:00:00-06:00')))return dirFail(400,'invalid');
 if(day>today)return dirFail(400,'date_future');
 if(Date.parse(today+'T12:00:00-06:00')-Date.parse(day+'T12:00:00-06:00')>MAX_AGE_DAYS*86_400_000)return dirFail(400,'stale');
 const p=await placeOf(slug);if(p.error)return p.error;
 const db=createAdminClient();
 const item=await db.from('price_items').select('kind,rx_required,active').eq('slug',body.data.itemSlug).maybeSingle();
 if(item.error)return dirFail(503,'unavailable');
 if(!item.data||!item.data.active)return dirFail(404,'item_unavailable');
 // Decreto 36868-S: prescription medicine prices are never collected (the SQL refuses them too).
 if(item.data.rx_required)return dirFail(400,'rx_not_public');
 if(!(p.kinds as readonly string[]).includes(item.data.kind))return dirFail(400,'item_unavailable');
 // Start of that day in Costa Rica: deterministic, so a retry with the same actionId is the same input (idempotent).
 const observedAt=new Date(day+'T00:00:00-06:00').toISOString();
 const result=await db.rpc('price_observation_record',{p_actor:user.id,p_input:{actionId:body.data.actionId,itemSlug:body.data.itemSlug,placeSlug:slug,price:body.data.price,
  currency:p.place.currency,sourceKind:'user_report',observedAt}});
 if(result.error)return dirDbError(result.error);
 const r=result.data as {moderationStatus:string;confidence:string};
 return dirOk({status:r.moderationStatus,confidence:r.confidence});
}
