import {z} from 'zod';

/**
 * Row 24: delivery adapters and the quiet-hours/digest rules. ContrataCR sends nothing by default: every channel
 * resolves to the sandbox adapter, which only records what it would have sent. A real provider is a separate
 * adapter selected by PRO_NOTIFY_<CHANNEL>_PROVIDER plus its secret in the environment; until an authorised
 * provider is wired, requesting live mode returns "not_configured" and nothing leaves the server.
 */
export type NotifyChannel='email'|'whatsapp'|'push';
export const notifyChannels:NotifyChannel[]=['email','whatsapp','push'];
export type NotifyMessage={channel:NotifyChannel;subject:string;body:string};
export type NotifyResult={channel:NotifyChannel;mode:'sandbox'|'live';status:'simulated'|'sent'|'not_configured'|'quiet_hours';detail:string};
export interface NotifyAdapter{channel:NotifyChannel;send(message:NotifyMessage):Promise<NotifyResult>;}

export const sandboxAdapter=(channel:NotifyChannel):NotifyAdapter=>({channel,async send(){return{channel,mode:'sandbox',status:'simulated',detail:'sandbox'};}});
/** Live adapters are declared but intentionally unimplemented: the secret is read from the environment, never stored. */
export function liveAdapter(channel:NotifyChannel,env:Record<string,string|undefined>=process.env):NotifyAdapter{
 const key=`PRO_NOTIFY_${channel.toUpperCase()}_PROVIDER`,secret=`PRO_NOTIFY_${channel.toUpperCase()}_SECRET`;
 return{channel,async send(){return{channel,mode:'live',status:'not_configured',detail:env[key]&&env[secret]?'provider_not_implemented':'missing_env'};}};
}
export const adapterFor=(channel:NotifyChannel,live=false,env?:Record<string,string|undefined>)=>live?liveAdapter(channel,env):sandboxAdapter(channel);

const hhmm=/^([01][0-9]|2[0-3]):[0-5][0-9]$/;
export const scheduleSchema=z.object({revision:z.number().int().min(0),delivery:z.literal('sandbox'),quietEnabled:z.boolean(),quietStart:z.string().regex(hhmm),quietEnd:z.string().regex(hhmm),quietWeekends:z.boolean(),
 digestFrequency:z.enum(['off','daily','weekly']),digestHour:z.number().int().min(0).max(23),digestWeekday:z.number().int().min(1).max(7),
 outbox:z.array(z.object({id:z.string().uuid(),channel:z.enum(['email','whatsapp','push']),status:z.literal('simulated'),subject:z.string(),body:z.string(),unreadCount:z.number().int().min(0),at:z.string()}).strict()).max(10),
 simulated:z.number().int().optional(),replayed:z.boolean().optional()}).strict();
export type NotifySchedule=z.infer<typeof scheduleSchema>;
export const scheduleSaveSchema=z.object({actionId:z.string().uuid(),revision:z.number().int().min(0),quietEnabled:z.boolean(),quietStart:z.string().regex(hhmm),quietEnd:z.string().regex(hhmm),quietWeekends:z.boolean(),
 digestFrequency:z.enum(['off','daily','weekly']),digestHour:z.number().int().min(0).max(23),digestWeekday:z.number().int().min(1).max(7)}).strict()
 .refine(v=>!v.quietEnabled||v.quietStart!==v.quietEnd,'Quiet hours need different start and end.');
export const digestRequestSchema=z.object({actionId:z.string().uuid(),channels:z.array(z.enum(['email','whatsapp','push'])).min(1).max(3).refine(c=>new Set(c).size===c.length)}).strict();

const minutes=(value:string)=>Number(value.slice(0,2))*60+Number(value.slice(3));
/** Civil date/time in Costa Rica (UTC-6, no daylight saving). */
export function costaRicaParts(now:Date){const local=new Date(now.getTime()-6*3600000);return{minutes:local.getUTCHours()*60+local.getUTCMinutes(),weekday:local.getUTCDay()===0?7:local.getUTCDay()};}
/** True when a non-urgent notice must wait: inside the daily window (it may cross midnight) or on weekends when chosen. */
export function inQuietHours(schedule:Pick<NotifySchedule,'quietEnabled'|'quietStart'|'quietEnd'|'quietWeekends'>,now:Date):boolean{
 if(!schedule.quietEnabled)return false;
 const{minutes:m,weekday}=costaRicaParts(now);if(schedule.quietWeekends&&weekday>=6)return true;
 const start=minutes(schedule.quietStart),end=minutes(schedule.quietEnd);
 return start<end?m>=start&&m<end:m>=start||m<end;
}
/** True when the digest is due in the hour of `now` (daily every day; weekly on the chosen ISO weekday). */
export function digestDue(schedule:Pick<NotifySchedule,'digestFrequency'|'digestHour'|'digestWeekday'>,now:Date):boolean{
 if(schedule.digestFrequency==='off')return false;const{minutes:m,weekday}=costaRicaParts(now);
 return Math.floor(m/60)===schedule.digestHour&&(schedule.digestFrequency==='daily'||weekday===schedule.digestWeekday);
}
/** Delivers through the adapter unless the person is in quiet hours (urgent notices ignore quiet hours only if asked). */
export async function deliver(adapter:NotifyAdapter,message:NotifyMessage,schedule:Pick<NotifySchedule,'quietEnabled'|'quietStart'|'quietEnd'|'quietWeekends'>,now:Date,urgent=false):Promise<NotifyResult>{
 if(!urgent&&inQuietHours(schedule,now))return{channel:adapter.channel,mode:'sandbox',status:'quiet_hours',detail:'deferred'};
 return adapter.send(message);
}
