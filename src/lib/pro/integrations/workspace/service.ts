import 'server-only';
import {createHash,randomBytes} from 'node:crypto';
import type {createAdminClient} from '@/lib/supabase/admin';
import {logOutbound} from '../server';
import {redact} from '../redact';
import {derivedId} from '../ids';
import {accessToken,connectionMode,OAuthError} from '../oauth/service';
import {GoogleCalendar,GraphCalendar,MockCalendar,mockFileById,realFileMetadata,sendRealMail,type CalendarAdapter,type CalendarEvent,type PickedFile,type RemoteEvent,type WorkspaceProvider} from './adapters';

/**
 * Round 6B: project email (owner-confirmed, mock = outbox only), two-way calendar sync and file picks.
 * Calendar rules: ContrataCR → calendar for new/changed items; calendar → ContrataCR only for TASK dates
 * (CAS on the task revision); a moved APPOINTMENT, a deleted event or a change on both sides becomes a
 * conflict with both versions and nothing is overwritten until the owner chooses.
 */
type Db=ReturnType<typeof createAdminClient>;
type Source={kind:'appointment'|'task';localId:string;title:string;startsAt:string;endsAt:string;allDay:boolean;revision:number|null};
type Link={provider:string;mode:string;local_kind:'appointment'|'task';local_id:string;remote_id:string;local_fingerprint:string;remote_etag:string;status:string;conflict:unknown;title:string};
async function rpc<T>(db:Db,name:string,args:Record<string,unknown>):Promise<T>{
 const result=await db.rpc(name,args);
 if(result.error){const e=result.error as {code?:string;hint?:string};throw new OAuthError(e.code==='40001'||e.code==='23505'?409:e.code==='42501'?403:e.code==='22023'||e.code==='23514'?400:503,e.hint||e.code||'db','db');}
 return result.data as T;
}
const iso=(value:string)=>new Date(value).toISOString();
export const fingerprint=(s:{title:string;startsAt:string;endsAt:string;allDay:boolean})=>createHash('md5').update(JSON.stringify([s.title,iso(s.startsAt),iso(s.endsAt),s.allDay])).digest('hex');
const event=(s:Source):CalendarEvent=>({title:s.title,startsAt:iso(s.startsAt),endsAt:iso(s.endsAt),allDay:s.allDay,localKey:`${s.kind}:${s.localId}`});
const crDate=(value:string)=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Costa_Rica'}).format(new Date(value));

async function ready(db:Db,owner:string,provider:WorkspaceProvider|'quickbooks'){
 const resolved=await connectionMode(db,owner,provider);
 if(resolved.status!=='ready')throw new OAuthError(409,resolved.status,'Integración no disponible en este modo.');
 const token=await accessToken(db,owner,provider);
 if(!token||token.mode!==resolved.mode)throw new OAuthError(409,'not_connected','Conecte la cuenta primero.');
 return {mode:resolved.mode,token};
}
export async function calendarFor(db:Db,owner:string,provider:WorkspaceProvider):Promise<{adapter:CalendarAdapter;mode:'mock'|'sandbox'|'production'}>{
 const {mode,token}=await ready(db,owner,provider);
 return {mode,adapter:mode==='mock'?new MockCalendar(db,owner,provider):provider==='google'?new GoogleCalendar(token.token):new GraphCalendar(token.token)};
}
async function flush(db:Db,owner:string,provider:WorkspaceProvider,mode:'mock'|'sandbox'|'production',adapter:CalendarAdapter,correlation:string){
 for(const call of adapter.calls.splice(0))await logOutbound(db,owner,{provider,mode,operation:'calendar_'+call.operation,url:call.url,statusCode:call.status,outcome:call.status>=200&&call.status<300?'ok':'error',durationMs:call.durationMs,correlation});
}

// ---------- email ----------
export async function sendProjectEmail(db:Db,owner:string,input:{actionId:string;provider:WorkspaceProvider;to:string[];cc?:string[];subject:string;body:string;workId:string|null;attachments:string[];confirmed:true}){
 const {mode,token}=await ready(db,owner,input.provider);
 const files:PickedFile[]=[];
 for(const id of input.attachments){
  const file=mode==='mock'?mockFileById(input.provider,id):await realFileMetadata(input.provider,token.token,id);
  if(!file)throw new OAuthError(400,'attachment','Uno de los archivos adjuntos ya no está disponible.');files.push(file);
 }
 const record=await rpc<{id:string;status:string;mode:string;duplicate?:boolean}>(db,'pro_email_record',{p_actor:owner,p_mode:mode,p_from:token.accountEmail,p_input:{action:'send_email',actionId:input.actionId,provider:input.provider,confirmed:input.confirmed,to:input.to,...(input.cc?.length?{cc:input.cc}:{}),subject:input.subject,body:input.body,workId:input.workId,attachments:files}});
 if(mode==='mock'){
  if(!record.duplicate)await logOutbound(db,owner,{provider:input.provider,mode,operation:'mail_simulated',url:'https://mail.mock.local/outbox',statusCode:200,outcome:'ok',durationMs:0,correlation:record.id,summary:{to:input.to.length,attachments:files.length,sent:false}});
  return record;
 }
 if(record.duplicate||record.status!=='queued')return record;
 const sent=await sendRealMail(input.provider,token.token,{from:token.accountEmail??'',to:input.to,cc:input.cc,subject:input.subject,body:input.body,attachments:files});
 await logOutbound(db,owner,{provider:input.provider,mode,operation:'mail_send',url:sent.url,statusCode:sent.status,outcome:sent.ok?'ok':'error',durationMs:sent.durationMs,correlation:record.id,summary:redact({to:input.to.length,attachments:files.length})});
 await rpc(db,'pro_email_result',{p_actor:owner,p_id:record.id,p_ok:sent.ok,p_message_id:sent.messageId,p_error:sent.ok?null:'HTTP '+sent.status});
 return {...record,status:sent.ok?'sent':'failed'};
}

// ---------- calendar ----------
export type SyncSummary={created:number;updated:number;pulled:number;removed:number;conflicts:number;external:number;unchanged:number};
async function links(db:Db,owner:string,provider:WorkspaceProvider){
 const result=await db.from('pro_calendar_links').select('provider,mode,local_kind,local_id,remote_id,local_fingerprint,remote_etag,status,conflict,title').eq('owner_id',owner).eq('provider',provider);
 if(result.error)throw new OAuthError(503,'db','db');return (result.data??[]) as Link[];
}
const put=(db:Db,owner:string,link:Record<string,unknown>)=>rpc(db,'pro_calendar_link_put',{p_actor:owner,p_link:link});
export async function syncCalendar(db:Db,owner:string,provider:WorkspaceProvider,correlation:string):Promise<SyncSummary>{
 const {adapter,mode}=await calendarFor(db,owner,provider);
 const summary:SyncSummary={created:0,updated:0,pulled:0,removed:0,conflicts:0,external:0,unchanged:0};
 try{
  const sources=await rpc<Source[]>(db,'pro_calendar_sources',{p_actor:owner}),known=await links(db,owner,provider),remote=await adapter.list();
  const byRemote=new Map(remote.map(row=>[row.id,row])),byLocal=new Map(known.map(row=>[row.local_kind+':'+row.local_id,row])),seen=new Set<string>();
  for(const source of sources){
   const key=source.kind+':'+source.localId,link=byLocal.get(key),fp=fingerprint(source);seen.add(key);
   const base={provider,mode,kind:source.kind,localId:source.localId,title:source.title};
   if(!link||link.status==='removed'||link.mode!==mode){const made=await adapter.create(event(source));await put(db,owner,{...base,remoteId:made.id,fingerprint:fp,etag:made.etag});summary.created++;continue;}
   if(link.status==='conflict'){summary.conflicts++;continue;}
   const r=byRemote.get(link.remote_id),localChanged=fp!==link.local_fingerprint,remoteChanged=!r||r.deleted||r.etag!==link.remote_etag;
   const conflict=(reason:string)=>put(db,owner,{...base,remoteId:link.remote_id,fingerprint:link.local_fingerprint,etag:link.remote_etag,status:'conflict',
    conflict:{reason,local:{title:source.title,startsAt:iso(source.startsAt),endsAt:iso(source.endsAt)},remote:r&&!r.deleted?{title:r.title,startsAt:r.startsAt,endsAt:r.endsAt,etag:r.etag}:null}}).then(()=>{summary.conflicts++;});
   if(!localChanged&&!remoteChanged){summary.unchanged++;continue;}
   if(!r||r.deleted){await conflict('remote_deleted');continue;}
   if(localChanged&&remoteChanged){await conflict('both_changed');continue;}
   if(localChanged){const updated=await adapter.update(link.remote_id,event(source));await put(db,owner,{...base,remoteId:link.remote_id,fingerprint:fp,etag:updated.etag});summary.updated++;continue;}
   // Remote-only change.
   if(source.kind==='appointment'){await conflict('appointment_moved');continue;}
   const date=crDate(r.startsAt);
   if(date===crDate(source.startsAt)){await put(db,owner,{...base,remoteId:link.remote_id,fingerprint:fp,etag:r.etag});summary.unchanged++;continue;}
   const applied=await rpc<{ok:boolean}>(db,'pro_calendar_apply_task_date',{p_actor:owner,p_task:source.localId,p_revision:source.revision,p_date:date});
   if(!applied.ok){await conflict('both_changed');continue;}
   const start=new Date(date+'T00:00:00-06:00').toISOString(),end=new Date(new Date(start).getTime()+86400000).toISOString();
   await put(db,owner,{...base,remoteId:link.remote_id,fingerprint:fingerprint({title:source.title,startsAt:start,endsAt:end,allDay:true}),etag:r.etag});summary.pulled++;
  }
  // Items that left the agenda (completed task, cancelled or finished job): remove their event.
  for(const link of known)if(link.status!=='removed'&&link.mode===mode&&!seen.has(link.local_kind+':'+link.local_id)){
   const r=byRemote.get(link.remote_id);if(r&&!r.deleted)await adapter.remove(link.remote_id);
   await put(db,owner,{provider,mode,kind:link.local_kind,localId:link.local_id,title:link.title,remoteId:link.remote_id,fingerprint:link.local_fingerprint,etag:link.remote_etag,status:'removed'});summary.removed++;
  }
  const external=remote.filter((row:RemoteEvent)=>row.origin==='external'&&!row.deleted).slice(0,200);
  await rpc(db,'pro_calendar_external_put',{p_actor:owner,p_provider:provider,p_rows:external.map(row=>({remoteId:row.id,title:row.title,startsAt:row.startsAt,endsAt:row.endsAt,allDay:row.allDay}))});
  summary.external=external.length;
  return summary;
 }finally{await flush(db,owner,provider,mode,adapter,correlation);}
}
export async function resolveCalendar(db:Db,owner:string,input:{provider:WorkspaceProvider;kind:'appointment'|'task';localId:string;choice:'keep_local'|'keep_remote'},correlation:string){
 const {adapter,mode}=await calendarFor(db,owner,input.provider);
 try{
  const link=(await links(db,owner,input.provider)).find(row=>row.local_kind===input.kind&&row.local_id===input.localId&&row.status==='conflict');
  if(!link)throw new OAuthError(409,'no_conflict','Ese conflicto ya se resolvió.');
  const source=(await rpc<Source[]>(db,'pro_calendar_sources',{p_actor:owner})).find(row=>row.kind===input.kind&&row.localId===input.localId);
  const base={provider:input.provider,mode,kind:input.kind,localId:input.localId,title:source?.title??link.title};
  if(input.choice==='keep_local'){
   if(!source){await put(db,owner,{...base,remoteId:link.remote_id,fingerprint:link.local_fingerprint,etag:link.remote_etag,status:'removed'});return {status:'removed'};}
   const remote=(await adapter.list()).find(row=>row.id===link.remote_id);
   const result=remote&&!remote.deleted?{id:link.remote_id,...await adapter.update(link.remote_id,event(source))}:await adapter.create(event(source));
   await put(db,owner,{...base,remoteId:result.id,fingerprint:fingerprint(source),etag:result.etag});return {status:'synced'};
  }
  if(input.kind!=='task'||!source)throw new OAuthError(400,'keep_remote_task_only','Las citas con clientes se cambian desde Citas (reprogramar); aquí solo puede conservar la versión de ContrataCR.');
  const remote=(await adapter.list()).find(row=>row.id===link.remote_id&&!row.deleted);
  if(!remote)throw new OAuthError(400,'remote_deleted','El evento ya no existe en el calendario.');
  const applied=await rpc<{ok:boolean}>(db,'pro_calendar_apply_task_date',{p_actor:owner,p_task:input.localId,p_revision:source.revision,p_date:crDate(remote.startsAt)});
  if(!applied.ok)throw new OAuthError(409,'changed','La tarea cambió. Sincronice de nuevo.');
  const start=new Date(crDate(remote.startsAt)+'T00:00:00-06:00').toISOString(),end=new Date(new Date(start).getTime()+86400000).toISOString();
  await put(db,owner,{...base,remoteId:link.remote_id,fingerprint:fingerprint({title:source.title,startsAt:start,endsAt:end,allDay:true}),etag:remote.etag});return {status:'synced'};
 }finally{await flush(db,owner,input.provider,mode,adapter,correlation);}
}
/** Mock only: edit the stand-in calendar as if the owner had done it in Google/Outlook. */
export async function simulateCalendarChange(db:Db,owner:string,input:{provider:WorkspaceProvider;change:'move'|'external'|'delete';remoteId?:string}){
 const {mode}=await calendarFor(db,owner,input.provider);
 if(mode!=='mock')throw new OAuthError(400,'mock_only','Solo disponible en simulación.');
 if(input.change==='external'){
  const start=new Date(Date.now()+2*86400000);start.setUTCHours(15,0,0,0);
  const id='ext-'+randomBytes(6).toString('hex');
  await db.from('pro_mock_calendar_events').insert({owner_id:owner,provider:input.provider,id,title:'Dentista (personal)',starts_at:start.toISOString(),ends_at:new Date(start.getTime()+3600000).toISOString(),origin:'external'}).throwOnError();
  return {remoteId:id};
 }
 const row=await db.from('pro_mock_calendar_events').select('id,starts_at,ends_at,all_day,etag').eq('owner_id',owner).eq('provider',input.provider).eq('id',input.remoteId??'').eq('origin','ccr').maybeSingle();
 if(!row.data)throw new OAuthError(400,'remote_missing','Evento no encontrado en el calendario simulado.');
 if(input.change==='delete'){await db.from('pro_mock_calendar_events').update({deleted:true,etag:Number(row.data.etag)+1}).eq('owner_id',owner).eq('provider',input.provider).eq('id',row.data.id).throwOnError();return {remoteId:row.data.id};}
 const shift=row.data.all_day?86400000:3600000;
 await db.from('pro_mock_calendar_events').update({starts_at:new Date(new Date(row.data.starts_at as string).getTime()+shift).toISOString(),ends_at:new Date(new Date(row.data.ends_at as string).getTime()+shift).toISOString(),etag:Number(row.data.etag)+1,updated_at:new Date().toISOString()}).eq('owner_id',owner).eq('provider',input.provider).eq('id',row.data.id).throwOnError();
 return {remoteId:row.data.id};
}

/**
 * Round 6C: one tick of the in-app scheduler. For each connected calendar whose window is due, the SQL claim
 * (row lock + next_run_at) lets exactly one caller run it; the run is recorded with its counts.
 */
export async function autoSyncTick(db:Db,owner:string,actionId:string){
 const read=await db.rpc('pro_connectors_read',{p_actor:owner});if(read.error)throw Error('connectors');
 const connections=(read.data as {connections:{provider:string;status:string}[]}).connections;
 const ran:{provider:WorkspaceProvider;status:'ok'|'error';summary?:SyncSummary}[]=[];
 for(const provider of ['google','microsoft'] as const){
  if(!connections.some(c=>c.provider===provider&&c.status==='connected'))continue;
  const run=derivedId(actionId,'autosync:'+provider),claim=await db.rpc('pro_calendar_autosync_claim',{p_actor:owner,p_provider:provider,p_run:run});
  if(claim.error||claim.data!==true)continue;
  try{const summary=await syncCalendar(db,owner,provider,run);await db.rpc('pro_calendar_autosync_finish',{p_actor:owner,p_run:run,p_ok:true,p_summary:summary});ran.push({provider,status:'ok',summary});}
  catch{await db.rpc('pro_calendar_autosync_finish',{p_actor:owner,p_run:run,p_ok:false,p_summary:null});ran.push({provider,status:'error'});}
 }
 return {ran};
}
