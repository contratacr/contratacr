import 'server-only';
import {despuesDeResponder} from '@/lib/after-response';
import {resolveEmailMode} from '@/lib/email/provider';
import {sendLaunchEmail,type LaunchEmailKind} from './launch-email';

// LOCAL PRO ONLY (place features round, 2026-11-17): customer notices of table reservations — received, confirmed,
// declined and «your table is ready» (waitlist). MOCK ONLY: messages go to an in-memory outbox (bounded) and nothing is
// ever delivered by e-mail, SMS or WhatsApp in this build. The database already recorded each notice with sender 'mock'
// (dir_reservation_notices); the browser only learns the kind and the channel, never the destination.
// Pending fixes round (2026-11-17): 'received' carries the customer's private link (/reserva/<token>); the business is
// told when the customer cancels by that link ('customer_cancelled', to the managers' account e-mail, also MOCK only).
export type ReservationNoticeKind='received'|'confirmed'|'changed'|'declined'|'table_ready'|'customer_cancelled';
export type ReservationNotice={kind:ReservationNoticeKind;channel:'email'|'sms';to:string;name?:string;reference?:string;day?:string;time?:string|null;partySize?:number;placeName?:string;link?:string;waitlist?:boolean};
export type ReservationOutboxEntry={reference:string|null;kind:ReservationNoticeKind;channel:'email'|'sms';to:string;text:string;sentAt:string};
const KEY='__ccrDirReservationOutbox',MAX=200;
export function reservationMockOutbox():ReservationOutboxEntry[]{const g=globalThis as unknown as Record<string,ReservationOutboxEntry[]|undefined>;return g[KEY]??=[];}

export function reservationNoticeText(n:ReservationNotice,en:boolean){
 const who=n.placeName??(en?'the business':'el negocio'),when=[n.day,n.time].filter(Boolean).join(' ');
 switch(n.kind){
  case 'received':{const link=n.link?(en?` See or cancel it here: ${n.link}`:` Véala o cancélela aquí: ${n.link}`):'';
   return (en?`We sent your request to ${who}. Reference ${n.reference}.`:`Enviamos su solicitud a ${who}. Referencia ${n.reference}.`)+link;}
  case 'customer_cancelled':return n.waitlist
   ?(en?`${n.name} left today’s waitlist at ${who} (party of ${n.partySize}). Reference ${n.reference}.`:`${n.name} salió de la lista de espera de hoy en ${who} (${n.partySize} personas). Referencia ${n.reference}.`)
   :(en?`${n.name} canceled the reservation for ${n.partySize} on ${when} at ${who}. Reference ${n.reference}.`:`${n.name} canceló la reserva para ${n.partySize} del ${when} en ${who}. Referencia ${n.reference}.`);
  case 'confirmed':return en?`${who} confirmed your table for ${n.partySize} on ${when}. Reference ${n.reference}.`:`${who} confirmó su mesa para ${n.partySize} el ${when}. Referencia ${n.reference}.`;
  case 'changed':return en?`${who} changed your reservation: party of ${n.partySize} on ${when}. Reference ${n.reference}.`:`${who} cambió su reserva: ${n.partySize} personas el ${when}. Referencia ${n.reference}.`;
  case 'declined':return en?`${who} could not take your reservation for ${when}. Reference ${n.reference}.`:`${who} no pudo aceptar su reserva del ${when}. Referencia ${n.reference}.`;
  case 'table_ready':return en?`Your table at ${who} is ready. Please come to the entrance. Reference ${n.reference}.`:`Su mesa en ${who} está lista. Por favor acérquese a la entrada. Referencia ${n.reference}.`;
 }
}
// 2026-11-18: e-mail notices ALSO go through the provider adapter (src/lib/email/provider.ts) when it resolves to
// «sandbox» or «live» (never in mock/dev by default). Fired after the response; the outbox above stays as the record.
const LAUNCH_KIND:Record<ReservationNoticeKind,(n:ReservationNotice)=>LaunchEmailKind>={
 received:()=>'reservation_received',confirmed:()=>'reservation_confirmed',changed:()=>'reservation_changed',declined:()=>'reservation_declined',
 table_ready:()=>'waitlist_ready',customer_cancelled:n=>n.waitlist?'waitlist_left_business':'reservation_cancelled_business'};
function deliverByProvider(n:ReservationNotice,en:boolean){
 if(n.channel!=='email'||resolveEmailMode()==='mock'||!n.reference)return;
 const kind=LAUNCH_KIND[n.kind](n);
 despuesDeResponder(sendLaunchEmail({kind,locale:en?'en':'es',to:n.to,eventId:`${n.reference}:${n.kind}:${[n.day,n.time].filter(Boolean).join('_').replace(/[^0-9A-Za-z_-]/g,'')}`,
  data:{placeName:n.placeName,reference:n.reference,day:n.day,time:n.time,partySize:n.partySize,name:n.name,link:n.link}}),'dir-reservation-email');
}
/** Records the notice in the mock outbox. Returns only what the browser may see. */
export function sendReservationNoticeMock(n:ReservationNotice,en:boolean){
 const box=reservationMockOutbox();
 // A replayed cancellation (same idempotent answer) must not tell the business twice.
 if(n.kind==='customer_cancelled'&&n.reference&&box.some(e=>e.kind==='customer_cancelled'&&e.reference===n.reference&&e.to===n.to))return {kind:n.kind,channel:n.channel,sender:'mock' as const,accepted:true};
 deliverByProvider(n,en);
 box.push({reference:n.reference??null,kind:n.kind,channel:n.channel,to:n.to,text:reservationNoticeText(n,en),sentAt:new Date().toISOString()});
 if(box.length>MAX)box.splice(0,box.length-MAX);
 return {kind:n.kind,channel:n.channel,sender:'mock' as const,accepted:true};
}
