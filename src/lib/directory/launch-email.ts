// LOCAL PRO ONLY (directory launch e-mail, 2026-11-18): ES/EN templates (HTML + text) for the directory e-mails and
// the bridge to the provider adapter (src/lib/email/provider.ts). Every message here is TRANSACTIONAL (the person
// started the action): each one says why it was received. `marketing` kinds would add the unsubscribe footer and
// List-Unsubscribe header (kept for future use; nothing sent today is marketing).
import {escaparHtml} from '@/lib/email/escape';
import {dispatchEmail,resolveEmailMode,type DispatchDeps,type ProviderResult} from '@/lib/email/provider';

export type LaunchEmailKind='claim_code'|'reservation_received'|'reservation_confirmed'|'reservation_changed'|'reservation_declined'|'reservation_cancelled_business'|'waitlist_ready'|'waitlist_left_business';
export type LaunchLocale='es'|'en';
export type LaunchEmailData={placeName?:string;code?:string;reference?:string;day?:string;time?:string|null;partySize?:number;name?:string;link?:string};

const clip=(v:unknown,max=160)=>{const s=String(v??'').replace(/\s+/g,' ').trim();return s.length>max?s.slice(0,max-1)+'…':s;};
const okLink=(l?:string)=>{if(!l)return null;try{const u=new URL(l);return u.protocol==='https:'||u.protocol==='http:'?u.toString():null;}catch{return null;}};
const MARKETING=new Set<LaunchEmailKind>();
const APP=()=>(process.env.NEXT_PUBLIC_APP_URL||'https://contratacr.com').replace(/\/$/,'');

export function renderLaunchEmail(kind:LaunchEmailKind,locale:LaunchLocale,d:LaunchEmailData){
 const en=locale==='en',place=clip(d.placeName)||(en?'the business':'el negocio'),ref=clip(d.reference,40),when=clip([d.day,d.time].filter(Boolean).join(' '),60);
 const party=d.partySize??0,name=clip(d.name)||(en?'A customer':'Una persona'),link=okLink(d.link);
 type T={subject:string;title:string;lines:string[];why:string;button?:string};
 const t:T=(()=>{switch(kind){
  case 'claim_code':return en
   ?{subject:'Your ContrataCR verification code',title:'Your code',lines:['Use this code to confirm you manage the business on ContrataCR. It expires in 10 minutes.','Never share it: ContrataCR staff will never ask for it.'],why:'You received this e-mail because someone asked to claim a business listing with this address. If it was not you, ignore it and nothing will change.'}
   :{subject:'Su código de verificación de ContrataCR',title:'Su código',lines:['Use este código para confirmar que usted administra el negocio en ContrataCR. Vence en 10 minutos.','No lo comparta: el equipo de ContrataCR nunca se lo pedirá.'],why:'Recibe este correo porque se solicitó reclamar una ficha de negocio con esta dirección. Si no fue usted, ignórelo y no cambiará nada.'};
  case 'reservation_received':return en
   ?{subject:`Request sent to ${place}`,title:'We sent your request',lines:[`Your reservation request for ${party} on ${when} was sent to ${place}.`,`Reference: ${ref}. The business will confirm it shortly.`],why:'You received this e-mail because you requested a reservation on ContrataCR.',button:'See or cancel'}
   :{subject:`Solicitud enviada a ${place}`,title:'Enviamos su solicitud',lines:[`Su solicitud de reserva para ${party} el ${when} fue enviada a ${place}.`,`Referencia: ${ref}. El negocio la confirmará en breve.`],why:'Recibe este correo porque solicitó una reserva en ContrataCR.',button:'Ver o cancelar'};
  case 'reservation_confirmed':return en
   ?{subject:`Confirmed: ${place}, ${when}`,title:'Your table is confirmed',lines:[`${place} confirmed your table for ${party} on ${when}.`,`Reference: ${ref}.`],why:'You received this e-mail because you made a reservation on ContrataCR.',button:'See reservation'}
   :{subject:`Confirmada: ${place}, ${when}`,title:'Su mesa está confirmada',lines:[`${place} confirmó su mesa para ${party} el ${when}.`,`Referencia: ${ref}.`],why:'Recibe este correo porque hizo una reserva en ContrataCR.',button:'Ver reserva'};
  case 'reservation_changed':return en
   ?{subject:`Change to your reservation at ${place}`,title:'Your reservation changed',lines:[`Your reservation at ${place} is now for ${party} on ${when}.`,`Reference: ${ref}. If the new time does not work for you, you can cancel it.`],why:'You received this e-mail because you have a reservation on ContrataCR.',button:'See reservation'}
   :{subject:`Cambio en su reserva en ${place}`,title:'Su reserva cambió',lines:[`Su reserva en ${place} ahora es para ${party} el ${when}.`,`Referencia: ${ref}. Si el nuevo horario no le sirve, puede cancelarla.`],why:'Recibe este correo porque tiene una reserva en ContrataCR.',button:'Ver reserva'};
  case 'reservation_declined':return en
   ?{subject:`${place} could not take your reservation`,title:'Reservation not available',lines:[`${place} could not take your reservation for ${when}.`,`Reference: ${ref}. You can try another time or another place on ContrataCR.`],why:'You received this e-mail because you requested a reservation on ContrataCR.'}
   :{subject:`${place} no pudo aceptar su reserva`,title:'Reserva no disponible',lines:[`${place} no pudo aceptar su reserva del ${when}.`,`Referencia: ${ref}. Puede intentar otro horario u otro lugar en ContrataCR.`],why:'Recibe este correo porque solicitó una reserva en ContrataCR.'};
  case 'reservation_cancelled_business':return en
   ?{subject:`Reservation canceled: ${ref}`,title:'A customer canceled',lines:[`${name} canceled the reservation for ${party} on ${when} at ${place}.`,`Reference: ${ref}.`],why:'You received this e-mail because you manage reservations for this business on ContrataCR.'}
   :{subject:`Reserva cancelada: ${ref}`,title:'Un cliente canceló',lines:[`${name} canceló la reserva para ${party} del ${when} en ${place}.`,`Referencia: ${ref}.`],why:'Recibe este correo porque administra las reservas de este negocio en ContrataCR.'};
  case 'waitlist_ready':return en
   ?{subject:`Your table at ${place} is ready`,title:'Your table is ready',lines:[`Your table at ${place} is ready. Please come to the entrance.`,`Reference: ${ref}.`],why:'You received this e-mail because you joined the waitlist on ContrataCR.'}
   :{subject:`Su mesa en ${place} está lista`,title:'Su mesa está lista',lines:[`Su mesa en ${place} está lista. Por favor acérquese a la entrada.`,`Referencia: ${ref}.`],why:'Recibe este correo porque se anotó en la lista de espera en ContrataCR.'};
  case 'waitlist_left_business':return en
   ?{subject:`Left the waitlist: ${ref}`,title:'Someone left the waitlist',lines:[`${name} left today’s waitlist at ${place} (party of ${party}).`,`Reference: ${ref}.`],why:'You received this e-mail because you manage reservations for this business on ContrataCR.'}
   :{subject:`Salió de la lista de espera: ${ref}`,title:'Alguien salió de la lista de espera',lines:[`${name} salió de la lista de espera de hoy en ${place} (${party} personas).`,`Referencia: ${ref}.`],why:'Recibe este correo porque administra las reservas de este negocio en ContrataCR.'};
 }})();
 const code=kind==='claim_code'?clip(d.code,12):'';
 const marketing=MARKETING.has(kind);
 const unsubscribe=marketing?(en?`Unsubscribe: ${APP()}/baja`:`Darse de baja: ${APP()}/baja`):'';
 const footer=[t.why,en?'ContrataCR · Costa Rica · contratacr.com':'ContrataCR · Costa Rica · contratacr.com',unsubscribe].filter(Boolean);
 const p=(s:string,muted=false)=>`<p class="${muted?'ccr-email-muted':'ccr-email-body'}" style="margin:0 0 ${muted?8:16}px;line-height:1.5;${muted?'font-size:13px;color:#5b6b7f':''}">${escaparHtml(s)}</p>`;
 const html=`<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escaparHtml(t.subject)}</title></head>`
  +`<body style="margin:0;background:#ffffff;color:#162543;font-family:Arial,Helvetica,sans-serif"><div style="max-width:600px;margin:0 auto;padding:36px 24px">`
  +`<img src="${APP()}/brand/email-logo-light.png?v=2" width="167" height="39" alt="ContrataCR" style="display:block;border:0;margin:0 0 28px">`
  +`<h1 style="margin:0 0 16px;font-size:22px;color:#162543">${escaparHtml(t.title)}</h1>`
  +(code?`<div class="ccr-email-code" style="margin:0 0 16px;padding:14px 18px;border-radius:12px;background:#e8f7fc;font-size:28px;letter-spacing:6px;font-weight:700;color:#0b6e8a">${escaparHtml(code)}</div>`:'')
  +t.lines.map(l=>p(l)).join('')
  +(link&&t.button?`<p style="margin:24px 0"><a href="${escaparHtml(link)}" style="display:inline-block;padding:12px 20px;border-radius:12px;background:#162543;color:#ffffff;text-decoration:none;font-weight:700">${escaparHtml(t.button)}</a></p>`:'')
  +`<hr style="border:0;border-top:1px solid #e3e8ef;margin:24px 0 16px">`+footer.map(l=>p(l,true)).join('')+`</div></body></html>`;
 const text=[t.title,...(code?[code]:[]),...t.lines,...(link&&t.button?[`${t.button}: ${link}`]:[]),'—',...footer].join('\n\n');
 return {subject:clip(t.subject,200),html,text,marketing};
}

export function launchEmailMode(){return resolveEmailMode();}

/** Renders and dispatches one directory e-mail. Never throws. `eventId` must identify the business event. */
export async function sendLaunchEmail(input:{kind:LaunchEmailKind;locale:LaunchLocale;to:string;eventId:string;data:LaunchEmailData},deps:DispatchDeps={}):Promise<ProviderResult>{
 try{
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.to))return {ok:false,status:'failed'};
  const m=renderLaunchEmail(input.kind,input.locale,input.data);
  const headers=m.marketing?{'List-Unsubscribe':`<${APP()}/baja>, <mailto:soporte@contratacr.com?subject=BAJA>`,'List-Unsubscribe-Post':'List-Unsubscribe=One-Click'}:undefined;
  return await dispatchEmail({to:input.to,subject:m.subject,html:m.html,text:m.text,idempotencyKey:`dir:${input.kind}:${input.eventId}`,tags:{kind:input.kind},headers},deps);
 }catch{return {ok:false,status:'failed'};}
}
