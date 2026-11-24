import 'server-only';
import {randomBytes} from 'node:crypto';
import type {createAdminClient} from '@/lib/supabase/admin';
import {timedFetch} from '../server';

/**
 * Round 6B: Google Workspace / Microsoft 365 adapters (mail, calendar, files).
 * · Mock: mail is NEVER sent (the outbox row is the only result); the calendar is pro_mock_calendar_events;
 *   the file picker lists fixed sample files. No network.
 * · Real (Gmail API / Google Calendar / Drive, Microsoft Graph): written from the public references in the
 *   registry and only constructed with a real access token (sandbox/production with env keys) — not run here.
 */
type Db=ReturnType<typeof createAdminClient>;
export type WorkspaceProvider='google'|'microsoft';
export type CalendarEvent={title:string;startsAt:string;endsAt:string;allDay:boolean;localKey:string};
export type RemoteEvent={id:string;title:string;startsAt:string;endsAt:string;allDay:boolean;etag:string;origin:'ccr'|'external';deleted:boolean};
export interface CalendarAdapter{list():Promise<RemoteEvent[]>;create(event:CalendarEvent):Promise<{id:string;etag:string}>;update(id:string,event:CalendarEvent):Promise<{etag:string}>;remove(id:string):Promise<void>;calls:{operation:string;url:string;status:number;durationMs:number}[]}
export type MailMessage={from:string;to:string[];cc?:string[];subject:string;body:string;attachments:PickedFile[]};
export type PickedFile={provider:WorkspaceProvider;fileId:string;name:string;mimeType:string;size:number;link:string};

// ---------- files (picker) ----------
const sampleFiles=[['planos-cocina','Planos cocina.pdf','application/pdf',482113],['presupuesto-materiales','Presupuesto materiales.xlsx','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',38211],['fotos-avance','Fotos de avance.zip','application/zip',2210331],['permiso-municipal','Permiso municipal.pdf','application/pdf',150442]] as const;
export function mockDriveFiles(provider:WorkspaceProvider):PickedFile[]{
 return sampleFiles.map(([id,name,mimeType,size])=>({provider,fileId:`mock-${provider}-${id}`,name,mimeType,size,link:`https://${provider==='google'?'drive':'onedrive'}.mock.local/file/mock-${provider}-${id}`}));
}
/** Only files the mock picker offered can be attached in mock mode (the server re-validates every pick). */
export const mockFileById=(provider:WorkspaceProvider,id:string)=>mockDriveFiles(provider).find(file=>file.fileId===id)??null;
/** Real pick validation: metadata of one file the owner picked in the provider's own picker. */
export async function realFileMetadata(provider:WorkspaceProvider,token:string,fileId:string):Promise<PickedFile|null>{
 if(!/^[A-Za-z0-9!_.-]{6,200}$/.test(fileId))return null;
 if(provider==='google'){
  const call=await timedFetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,size,webViewLink`,{headers:{Authorization:'Bearer '+token}});
  const json=call.status===200?await call.response!.json() as {id:string;name:string;mimeType:string;size?:string;webViewLink:string}:null;
  return json?{provider,fileId:json.id,name:json.name.slice(0,200),mimeType:json.mimeType.slice(0,120),size:Number(json.size??0),link:json.webViewLink}:null;
 }
 const call=await timedFetch(`https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(fileId)}?$select=id,name,size,webUrl,file`,{headers:{Authorization:'Bearer '+token}});
 const json=call.status===200?await call.response!.json() as {id:string;name:string;size:number;webUrl:string;file?:{mimeType?:string}}:null;
 return json?{provider,fileId:json.id,name:json.name.slice(0,200),mimeType:(json.file?.mimeType??'application/octet-stream').slice(0,120),size:json.size,link:json.webUrl}:null;
}

// ---------- mail ----------
const rfc2047=(text:string)=>/^[\x20-\x7e]*$/.test(text)?text:`=?UTF-8?B?${Buffer.from(text,'utf8').toString('base64')}?=`;
export function rfc2822(message:MailMessage){
 const links=message.attachments.length?'\r\n\r\n'+message.attachments.map(file=>`· ${file.name}: ${file.link}`).join('\r\n'):'';
 return [`From: ${message.from}`,`To: ${message.to.join(', ')}`,...(message.cc?.length?[`Cc: ${message.cc.join(', ')}`]:[]),`Subject: ${rfc2047(message.subject)}`,'MIME-Version: 1.0','Content-Type: text/plain; charset=UTF-8','Content-Transfer-Encoding: base64','',Buffer.from(message.body+links,'utf8').toString('base64')].join('\r\n');
}
/** Real send from the owner's mailbox. Never called in mock mode. */
export async function sendRealMail(provider:WorkspaceProvider,token:string,message:MailMessage){
 if(provider==='google'){
  const call=await timedFetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({raw:Buffer.from(rfc2822(message),'utf8').toString('base64url')})});
  const json=call.status===200?await call.response!.json().catch(()=>null) as {id?:string}|null:null;
  return {ok:call.status===200,messageId:json?.id??null,status:call.status,url:'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',durationMs:call.durationMs};
 }
 const links=message.attachments.length?'\n\n'+message.attachments.map(file=>`· ${file.name}: ${file.link}`).join('\n'):'';
 const call=await timedFetch('https://graph.microsoft.com/v1.0/me/sendMail',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({message:{subject:message.subject,body:{contentType:'Text',content:message.body+links},toRecipients:message.to.map(address=>({emailAddress:{address}})),...(message.cc?.length?{ccRecipients:message.cc.map(address=>({emailAddress:{address}}))}:{})},saveToSentItems:true})});
 return {ok:call.status===202,messageId:null,status:call.status,url:'https://graph.microsoft.com/v1.0/me/sendMail',durationMs:call.durationMs};
}

// ---------- calendar ----------
export class MockCalendar implements CalendarAdapter{
 calls:CalendarAdapter['calls']=[];
 constructor(private db:Db,private owner:string,private provider:WorkspaceProvider){}
 private note(operation:string){this.calls.push({operation,url:`https://calendar.mock.local/${this.provider}/${operation}`,status:200,durationMs:0});}
 async list(){
  this.note('list');
  const rows=await this.db.from('pro_mock_calendar_events').select('id,title,starts_at,ends_at,all_day,etag,origin,deleted').eq('owner_id',this.owner).eq('provider',this.provider).limit(500);
  if(rows.error)throw Error('mock calendar');
  return (rows.data??[]).map(row=>({id:row.id as string,title:row.title as string,startsAt:new Date(row.starts_at as string).toISOString(),endsAt:new Date(row.ends_at as string).toISOString(),allDay:row.all_day as boolean,etag:String(row.etag),origin:row.origin as 'ccr'|'external',deleted:row.deleted as boolean}));
 }
 async create(event:CalendarEvent){
  this.note('create');const id='evt-'+randomBytes(8).toString('hex');
  const insert=await this.db.from('pro_mock_calendar_events').insert({owner_id:this.owner,provider:this.provider,id,title:event.title,starts_at:event.startsAt,ends_at:event.endsAt,all_day:event.allDay,etag:1,origin:'ccr'});
  if(insert.error)throw Error('mock calendar');return {id,etag:'1'};
 }
 async update(id:string,event:CalendarEvent){
  this.note('update');
  const current=await this.db.from('pro_mock_calendar_events').select('etag').eq('owner_id',this.owner).eq('provider',this.provider).eq('id',id).maybeSingle();
  const etag=Number(current.data?.etag??0)+1;
  const result=await this.db.from('pro_mock_calendar_events').update({title:event.title,starts_at:event.startsAt,ends_at:event.endsAt,all_day:event.allDay,etag,deleted:false,updated_at:new Date().toISOString()}).eq('owner_id',this.owner).eq('provider',this.provider).eq('id',id);
  if(result.error)throw Error('mock calendar');return {etag:String(etag)};
 }
 async remove(id:string){
  this.note('delete');
  await this.db.from('pro_mock_calendar_events').update({deleted:true,updated_at:new Date().toISOString()}).eq('owner_id',this.owner).eq('provider',this.provider).eq('id',id);
 }
}
const crDate=(iso:string)=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Costa_Rica'}).format(new Date(iso));
/** Google Calendar (primary). Our events carry extendedProperties.private.ccr = local key. */
export class GoogleCalendar implements CalendarAdapter{
 calls:CalendarAdapter['calls']=[];
 constructor(private token:string){}
 private async call(operation:string,url:string,init:RequestInit={}){const result=await timedFetch(url,{...init,headers:{Authorization:'Bearer '+this.token,'Content-Type':'application/json'}});this.calls.push({operation,url,status:result.status,durationMs:result.durationMs});if(result.status>=400||result.status===0)throw Error('google calendar '+result.status);return result.response!;}
 private body(event:CalendarEvent){return JSON.stringify({summary:event.title,start:event.allDay?{date:crDate(event.startsAt)}:{dateTime:event.startsAt,timeZone:'America/Costa_Rica'},end:event.allDay?{date:crDate(event.endsAt)}:{dateTime:event.endsAt,timeZone:'America/Costa_Rica'},extendedProperties:{private:{ccr:event.localKey}}});}
 async list(){
  const base='https://www.googleapis.com/calendar/v3/calendars/primary/events',items:RemoteEvent[]=[];
  const response=await this.call('list',base+'?'+new URLSearchParams({showDeleted:'true',singleEvents:'true',maxResults:'250',timeMin:new Date(Date.now()-30*86400000).toISOString()}));
  const json=await response.json() as {items?:{id:string;etag:string;status:string;summary?:string;start:{date?:string;dateTime?:string};end:{date?:string;dateTime?:string};extendedProperties?:{private?:{ccr?:string}}}[]};
  for(const item of json.items??[])items.push({id:item.id,title:(item.summary??'(sin título)').slice(0,300),startsAt:new Date(item.start.dateTime??item.start.date+'T00:00:00-06:00').toISOString(),endsAt:new Date(item.end.dateTime??item.end.date+'T00:00:00-06:00').toISOString(),allDay:!!item.start.date,etag:item.etag,origin:item.extendedProperties?.private?.ccr?'ccr':'external',deleted:item.status==='cancelled'});
  return items;
 }
 async create(event:CalendarEvent){const json=await (await this.call('create','https://www.googleapis.com/calendar/v3/calendars/primary/events',{method:'POST',body:this.body(event)})).json() as {id:string;etag:string};return {id:json.id,etag:json.etag};}
 async update(id:string,event:CalendarEvent){const json=await (await this.call('update',`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(id)}`,{method:'PUT',body:this.body(event)})).json() as {etag:string};return {etag:json.etag};}
 async remove(id:string){await this.call('delete',`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(id)}`,{method:'DELETE'});}
}
/** Microsoft Graph calendar. Our events are tagged with the category «ContrataCR» and transactionId = local key. */
export class GraphCalendar implements CalendarAdapter{
 calls:CalendarAdapter['calls']=[];
 constructor(private token:string){}
 private async call(operation:string,url:string,init:RequestInit={}){const result=await timedFetch(url,{...init,headers:{Authorization:'Bearer '+this.token,'Content-Type':'application/json',Prefer:'outlook.timezone="Central America Standard Time"'}});this.calls.push({operation,url,status:result.status,durationMs:result.durationMs});if(result.status>=400||result.status===0)throw Error('graph calendar '+result.status);return result.response!;}
 private body(event:CalendarEvent){return JSON.stringify({subject:event.title,isAllDay:event.allDay,start:{dateTime:event.startsAt.slice(0,19),timeZone:'UTC'},end:{dateTime:event.endsAt.slice(0,19),timeZone:'UTC'},categories:['ContrataCR'],transactionId:event.localKey});}
 async list(){
  const response=await this.call('list','https://graph.microsoft.com/v1.0/me/events?$top=250&$select=id,subject,start,end,isAllDay,categories,changeKey,isCancelled');
  const json=await response.json() as {value?:{id:string;subject?:string;start:{dateTime:string};end:{dateTime:string};isAllDay:boolean;categories?:string[];changeKey:string;isCancelled?:boolean}[]};
  return (json.value??[]).map(item=>({id:item.id,title:(item.subject??'(sin título)').slice(0,300),startsAt:new Date(item.start.dateTime+'Z').toISOString(),endsAt:new Date(item.end.dateTime+'Z').toISOString(),allDay:item.isAllDay,etag:item.changeKey,origin:item.categories?.includes('ContrataCR')?'ccr' as const:'external' as const,deleted:!!item.isCancelled}));
 }
 async create(event:CalendarEvent){const json=await (await this.call('create','https://graph.microsoft.com/v1.0/me/events',{method:'POST',body:this.body(event)})).json() as {id:string;changeKey:string};return {id:json.id,etag:json.changeKey};}
 async update(id:string,event:CalendarEvent){const json=await (await this.call('update',`https://graph.microsoft.com/v1.0/me/events/${encodeURIComponent(id)}`,{method:'PATCH',body:this.body(event)})).json() as {changeKey:string};return {etag:json.changeKey};}
 async remove(id:string){await this.call('delete',`https://graph.microsoft.com/v1.0/me/events/${encodeURIComponent(id)}`,{method:'DELETE'});}
}
