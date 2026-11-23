import type {ReminderChannelName,ReminderMessage} from './channel';

/** Text of an installment reminder. Spanish uses "usted" and Costa Rican vocabulary; English carries the same content. */
export type ReminderFacts={id:string;channel:ReminderChannelName;kind:'upcoming'|'late_light'|'late_moderate'|'late_severe';dueDate:string;pendingCents:number;daysOverdue:number;
 workTitle:string;clientName:string|null;to:string};
const colones=(cents:number,en:boolean)=>{const v=Math.round(cents)/100;const s=v.toLocaleString(en?'en-US':'es-CR',{minimumFractionDigits:v%1===0?0:2,maximumFractionDigits:2});return en?`CRC ${s}`:`₡${s}`;};
const day=(iso:string,en:boolean)=>new Intl.DateTimeFormat(en?'en-US':'es-CR',{dateStyle:'long',timeZone:'UTC'}).format(new Date(iso.slice(0,10)+'T00:00:00Z'));
export function reminderMessage(f:ReminderFacts,locale:'es'|'en'='es'):ReminderMessage{
 const en=locale==='en',amount=colones(f.pendingCents,en),when=day(f.dueDate,en),who=(f.clientName??'').trim();
 const hello=en?(who?`Hello ${who},`:'Hello,'):(who?`Estimado(a) ${who}:`:'Estimado(a) cliente:');
 const days=f.daysOverdue===1?(en?'1 day':'1 día'):(en?`${f.daysOverdue} days`:`${f.daysOverdue} días`);
 const line=f.kind==='upcoming'
  ?(en?`Your installment of ${amount} for "${f.workTitle}" is due on ${when}.`:`Su cuota de ${amount} del trabajo "${f.workTitle}" vence el ${when}.`)
  :(en?`Your installment of ${amount} for "${f.workTitle}" was due on ${when} and is ${days} overdue.`:`Su cuota de ${amount} del trabajo "${f.workTitle}" venció el ${when} y tiene ${days} de atraso.`);
 const close=f.kind==='late_severe'?(en?'Please contact us to agree on how to settle it.':'Le pedimos comunicarse con nosotros para acordar cómo ponerla al día.')
  :(en?'Thank you for your payment.':'Gracias por su pago.');
 const subject=f.kind==='upcoming'?(en?'Installment due soon':'Cuota próxima a vencer'):(en?'Overdue installment':'Cuota vencida');
 return {channel:f.channel,to:f.to,subject:f.channel==='email'?subject:null,body:f.channel==='sms'?`${line} ${close}`:`${hello}\n\n${line}\n${close}`,idempotencyKey:'plan-reminder:'+f.id};
}
