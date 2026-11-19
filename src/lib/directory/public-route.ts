import 'server-only';
import {cookies} from 'next/headers';
import {requiredServerSecret} from '@/lib/security/local-dev-secrets';
import {DIR_ENABLED} from '@/lib/directory/feature-flags';

// LOCAL PRO ONLY (multivertical F3/F5): shared pieces of the public directory routes (claims, contacts, reviews).
// Every answer is {error, reason}; the browser shows the ES/EN text for `reason` (DIRECTORY_REASON_TEXT).
export const dirHeaders={'Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow','Referrer-Policy':'no-referrer'};
export const dirFail=(status:number,reason:string,error='No se pudo completar la operación.')=>Response.json({error,reason},{status,headers:dirHeaders});
export const dirOk=(body:unknown)=>Response.json(body,{headers:dirHeaders});
/** Development-only pieces (the claim test mailbox): 404 outside `next dev`, whatever the launch flags say. */
export const dirDevOnly=()=>process.env.NODE_ENV!=='development'?new Response(null,{status:404,headers:dirHeaders}):null;
/** Every public directory route: 404 while the directory launch flag DIR_ENABLED is off (feature-flags.ts). */
export const dirEnabledOnly=()=>!DIR_ENABLED?new Response(null,{status:404,headers:dirHeaders}):null;

/** Server-only pepper (≥ 32 characters). Required in production: missing, short or the public local-dev value → null,
 *  a server error is logged and the route answers 503 (never a random replacement). In development a deterministic,
 *  clearly marked local value is used (src/lib/security/local-dev-secrets.ts). */
export function dirPepper(name:'DIR_CLAIM_OTP_PEPPER'|'DIR_VISITOR_PEPPER'):string|null{
 return requiredServerSecret(name,32);
}

export async function hmacHex(key:string,text:string){
 const enc=new TextEncoder(),k=await crypto.subtle.importKey('raw',enc.encode(key),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',k,enc.encode(text))),b=>b.toString(16).padStart(2,'0')).join('');
}

const DEVICE_COOKIE='ccr_dir_device';
const uuidRe=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/** Random device id in an httpOnly cookie (never sent to the database: only its HMAC is). */
export async function dirDeviceId(create:boolean){
 const jar=await cookies(),current=jar.get(DEVICE_COOKIE)?.value;
 if(current&&uuidRe.test(current))return current;
 if(!create)return null;
 const id=crypto.randomUUID();
 jar.set(DEVICE_COOKIE,id,{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',path:'/',maxAge:60*60*24*365});
 return id;
}
const contactCookie=(slug:string)=>'ccr_dir_contact_'+slug.replace(/-/g,'_').slice(0,60);
export async function dirContactId(slug:string){const v=(await cookies()).get(contactCookie(slug))?.value;return v&&uuidRe.test(v)?v:null;}
export async function dirSetContactId(slug:string,id:string){
 (await cookies()).set(contactCookie(slug),id,{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',path:'/',maxAge:60*60*24*90});
}

type DbError={code?:string;hint?:string}|null|undefined;
const HINT_STATUS:Record<string,number>={
 dir_claim_phone_unavailable:400,dir_claim_domain_mismatch:400,dir_claim_email_unavailable:400,dir_claim_sms_disabled:400,dir_claim_evidence:400,dir_claim_dispute_method:400,dir_claim_requires_code:400,
 dir_claim_no_code:400,dir_claim_no_code_sent:400,dir_claim_closed:409,dir_claim_conflict:409,dir_claim_no_dispute:400,dir_claim_already_manager:409,
 dir_place_already_claimed:409,dir_claim_pending:409,dir_place_possible_duplicate:409,
 dir_claim_cap:429,dir_claim_send_cap:429,dir_claim_code_cooldown:429,dir_signup_cap:429,
 dir_review_contact_required:403,dir_review_own_place:403,dir_review_cap:429,dir_contact_cap:429,
 // Moderation round M1: flags, owner replies, staff queue, claim documents, user price reports.
 dir_flag_own_review:403,dir_flag_cap:429,dir_reply_not_manager:403,dir_reply_role:403,dir_review_reply_final:409,dir_report_closed:409,dir_permit_vertical:400,
 dir_claim_upload_foreign:403,dir_claim_upload_cap:429,dir_review_self_moderation:403,dir_claim_self_review:403,
 price_rx_not_public:400,price_report_cap:429,price_stale:400,price_fuel_national:400,
 // Place features round (2026-11-17): reservations/waitlist, Q&A, saved lists, events, «Pedir», brands.
 dir_tool_not_manager:403,dir_tool_role:403,dir_reservations_off:404,dir_reservations_section:400,dir_reservations_no_slots:400,dir_reservation_party:400,
 dir_reservation_slot:400,dir_reservation_full:409,dir_reservation_cap:429,dir_reservation_transition:409,dir_reservation_cancel_closed:409,dir_waitlist_off:404,dir_waitlist_exists:409,
 dir_qa_login:401,dir_qa_own_place:403,dir_qa_own_question:403,dir_qa_cap:429,dir_list_login:401,dir_list_item_exists:409,dir_list_cap:429,
 dir_order_section_off:400,dir_order_value:400,dir_event_fields:400,dir_event_date:400,dir_event_cap:429,dir_event_cancelled:409,dir_event_section_off:400,
 dir_brand_claimed:409,dir_brand_not_branch:400,
};
/** Database error → {status, reason}. Stable SQL hints win; otherwise the SQLSTATE family. */
export function dirDbError(error:DbError){
 const hint=error?.hint;
 if(hint&&hint in HINT_STATUS)return dirFail(HINT_STATUS[hint]!,hint.replace(/^dir_/,'').replace(/^price_/,''));
 switch(error?.code){
  case '22023':case '23514':case '22P02':return dirFail(400,'invalid','Revise los datos.');
  case '23505':return dirFail(409,'conflict');
  case '40001':return dirFail(409,'reload','Los datos cambiaron. Recargue la página.');
  case '42501':return dirFail(403,'forbidden','Sin acceso.');
  case '54000':return dirFail(429,'limit','Se alcanzó el límite. Intente más tarde.');
  case 'P0002':return dirFail(404,'not_found','No está disponible.');
  default:return dirFail(503,'unavailable','No disponible en este momento.');
 }
}
