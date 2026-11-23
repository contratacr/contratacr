import {createHash} from 'node:crypto';

/**
 * Row 57: reminder channel adapter for installment reminders (e-mail and SMS). The in-app tray needs no adapter.
 * Mode is resolved like the other integrations: "live" only with NODE_ENV=production AND an explicit flag, and even then no real
 * provider is wired in this repository (it refuses). Everything else is the deterministic sandbox, which never touches the network.
 */
export type ReminderChannelName='email'|'sms';
export type ReminderMessage={channel:ReminderChannelName;to:string;subject:string|null;body:string;idempotencyKey:string};
export type ReminderResult={ok:true;providerRef:string}|{ok:false;error:string};
export interface ReminderChannel{readonly mode:'sandbox'|'live';send(message:ReminderMessage):Promise<ReminderResult>}

const emailShape=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phoneShape=/^\+?[0-9][0-9 -]{6,18}$/;
export function validReminderTarget(channel:ReminderChannelName,to:string|null|undefined){const v=(to??'').trim();return channel==='email'?emailShape.test(v)&&v.length<=254:phoneShape.test(v);}

export class SandboxReminderChannel implements ReminderChannel{
 readonly mode='sandbox' as const;
 /** Messages "sent" in this process, for specs. Nothing leaves the process. */
 readonly outbox:ReminderMessage[]=[];
 async send(message:ReminderMessage):Promise<ReminderResult>{
  if(!validReminderTarget(message.channel,message.to))return{ok:false,error:'invalid_target'};
  if(message.body.length===0||message.body.length>(message.channel==='sms'?480:4000))return{ok:false,error:'invalid_body'};
  this.outbox.push(message);
  return{ok:true,providerRef:'sandbox-'+createHash('sha256').update(message.idempotencyKey).digest('hex').slice(0,24)};
 }
}
export class RefusingLiveReminderChannel implements ReminderChannel{
 readonly mode='live' as const;
 async send():Promise<ReminderResult>{return{ok:false,error:'provider_not_configured'};}
}
export function resolveReminderChannel(env:Record<string,string|undefined>=process.env):ReminderChannel{
 return env.NODE_ENV==='production'&&env.PRO_REMINDERS_LIVE==='1'?new RefusingLiveReminderChannel():new SandboxReminderChannel();
}
