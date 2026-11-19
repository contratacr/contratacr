'use client';
import {useCallback,useEffect,useRef,useState,type FormEvent} from 'react';
import {useLocale} from 'next-intl';
import {Button} from '@/components/ui/button';
import {useAppDialog} from '@/hooks/use-app-dialog';
import {ProModal as Modal} from './modal';
import {proCount} from '@/lib/pro/plural';
import {useProSearchParams} from './use-pro-search-params';

/**
 * Round 6B: Company › Correo, calendario y archivos. Google / Microsoft OAuth connections (PKCE; tokens only
 * encrypted on the server; disconnect revokes and wipes them), project email from the owner's mailbox with an
 * explicit confirmation of EACH message (mock = outbox only, never sent), two-way calendar sync of agenda
 * jobs and dated tasks with conflict handling, and attachments picked from Drive / OneDrive.
 */
type Provider='google'|'microsoft';
type File={provider:Provider;fileId:string;name:string;mimeType:string;size:number;link:string};
type Conn={provider:string;mode:string;status:string;accountEmail:string|null;scopes:string[];connectedAt:string|null;revision:number;encrypted:boolean};
type Mail={id:string;provider:string;mode:string;from:string;to:string[];subject:string;body:string;workId:string|null;attachments:File[];status:string;createdAt:string};
type Link={provider:Provider;kind:'appointment'|'task';localId:string;remoteId:string;title:string;status:string;conflict:{reason:string;local:{title:string;startsAt:string};remote:{title:string;startsAt:string}|null}|null};
type Read={connections:Conn[];history:{provider:string;action:string;at:string}[];outbox:Mail[];calendar:{links:Link[];external:{provider:string;remoteId:string;title:string;startsAt:string;allDay:boolean}[]};works:{id:string;label:string}[];
 providers:{id:'google'|'microsoft'|'quickbooks';resolved:{mode:string;status:string};connected:boolean;files:File[]}[];
 autosync?:AutoSync};
type AutoSync={settings:{provider:Provider;intervalMinutes:number;nextRunAt:string|null;lastRunAt:string|null;revision:number}[];runs:{runId:string;provider:Provider;status:string;summary:Record<string,number>|null;startedAt:string}[]};
const api='/api/pro/connectors',card='min-w-0 space-y-3 rounded-2xl border border-[#d7e1ea] bg-white p-4 sm:p-5',field='mt-1 block min-h-11 w-full min-w-0 rounded-xl border border-[#d7e1ea] bg-white px-3 text-base font-normal';
const names:Record<Provider,string>={google:'Google (Gmail, Calendar, Drive)',microsoft:'Microsoft (Outlook, OneDrive)'};
export function CompanyConnectors(){
 const en=useLocale()==='en',t=useCallback((es:string,english:string)=>en?english:es,[en]),{confirm,dialogNode}=useAppDialog(),params=useProSearchParams();
 const [data,setData]=useState<Read|null>(null),[failed,setFailed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const seq=useRef(0);
 const load=useCallback(async()=>{const n=++seq.current;setFailed(false);try{const response=await fetch(api,{cache:'no-store'});if(!response.ok)throw Error();const body=await response.json() as Read;if(n===seq.current)setData(body);}catch{if(n===seq.current)setFailed(true);}},[]);
 useEffect(()=>{const counter=seq,timer=setTimeout(()=>void load(),0);return()=>{clearTimeout(timer);counter.current++;};},[load]);
 const oauth=params.get('oauth'),oauthProvider=params.get('proveedor');
 async function post(payload:Record<string,unknown>){
  setBusy(true);setError('');setNotice('');
  try{const response=await fetch(api,{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const json=await response.json().catch(()=>({}));
   if(!response.ok){setError(en?({missing_keys:'Server keys for this provider are missing.',not_connected:'Connect the account first.',pro_oauth_not_connected:'Connect the account first.',production_refused:'Production is not allowed on this server.',keep_remote_task_only:'Customer appointments are changed from Appointments; keep the ContrataCR version.',no_conflict:'That conflict was already resolved.'} as Record<string,string>)[json.reason]??'Could not complete it.':json.error??'No se pudo completar.');return null;}
   return json as Record<string,unknown>;
  }catch{setError(t('No se pudo comprobar la operación. Reintente.','Could not confirm the operation. Retry.'));return null;}
  finally{setBusy(false);await load();}
 }
 async function connect(provider:Provider){const body=await post({action:'connect',provider,locale:en?'en':'es',view:'conectores'});if(body?.authorizeUrl)window.location.assign(String(body.authorizeUrl));}
 async function disconnect(conn:Conn){
  const answer=await confirm({cancelLabel:t('Cancelar','Cancel'),title:t('¿Desconectar la cuenta?','Disconnect the account?'),description:t('Se revoca el acceso y se borran los tokens cifrados. Los correos y la sincronización guardados se conservan.','Access is revoked and the encrypted tokens are deleted. Saved emails and sync records are kept.'),confirmLabel:t('Desconectar','Disconnect'),tone:'danger'});
  if(answer.confirmed&&await post({action:'disconnect',actionId:crypto.randomUUID(),provider:conn.provider,revision:conn.revision}))setNotice(t('Cuenta desconectada.','Account disconnected.'));
 }
 if(failed&&!data)return <div role="alert" className="space-y-2 text-sm"><p>{t('No se pudieron cargar las conexiones.','Could not load the connections.')}</p><Button type="button" variant="secondary" onClick={()=>void load()}>{t('Reintentar','Retry')}</Button></div>;
 if(!data)return <p role="status" aria-busy="true" className="text-sm text-[#52627a]">{t('Cargando…','Loading…')}</p>;
 const connected=data.providers.filter(p=>p.id!=='quickbooks'&&p.connected).map(p=>p.id as Provider);
 const modeLabel=(mode:string)=>mode==='mock'?t('Simulación local','Local simulation'):mode==='sandbox'?t('Pruebas del proveedor','Provider test environment'):t('Producción','Production');
 const when=(value:string)=>new Date(value).toLocaleString(en?'en-US':'es-CR',{timeZone:'America/Costa_Rica',dateStyle:'medium',timeStyle:'short'});
 return <div data-company-connectors className="min-w-0 space-y-4">
  <CalendarAutoSyncTicker/>
  <p className="rounded-xl bg-[#f3f8fb] p-3 text-sm text-[#52627a]">{t('En simulación local nada sale de su computadora: los correos quedan en la bandeja de salida sin enviarse y el calendario es una copia local. Cada envío real necesitará su confirmación.','In local simulation nothing leaves your computer: emails stay in the outbox unsent and the calendar is a local copy. Every real send will need your confirmation.')}</p>
  {oauth&&<p role="status" data-oauth-result={oauth} className={'text-sm '+(oauth==='connected'?'text-emerald-800':'text-amber-900')}>{oauth==='connected'?t('Cuenta conectada.','Account connected.'):oauth==='denied'?t('Conexión cancelada: no se dio permiso.','Connection cancelled: permission was not granted.'):t('No se pudo conectar la cuenta. Reintente.','Could not connect the account. Retry.')}{oauthProvider?` (${oauthProvider})`:''}</p>}
  {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}{notice&&<p role="status" className="text-sm text-emerald-800">{notice}</p>}
  <div className="grid min-w-0 gap-4 md:grid-cols-2">{(['google','microsoft'] as const).map(id=>{const state=data.providers.find(p=>p.id===id)!,conn=data.connections.find(c=>c.provider===id&&c.status==='connected'&&state.connected);
   return <section key={id} data-connector={id} data-connector-state={conn?'connected':'disconnected'} className={card} aria-labelledby={'connector-'+id}>
    <div className="flex min-w-0 flex-wrap items-start justify-between gap-2"><h3 id={'connector-'+id} className="font-bold">{names[id]}</h3><span className="rounded-lg bg-[#f3f8fb] px-2 py-0.5 text-xs font-bold">{modeLabel(state.resolved.mode)}</span></div>
    {conn?<><p className="text-sm">{t('Conectada como ','Connected as ')}<strong className="break-all">{conn.accountEmail}</strong></p><p data-connector-encrypted={conn.encrypted} className="text-xs text-[#52627a]">{t('Token guardado solo cifrado (AES-256-GCM). Permisos: ','Token stored only encrypted (AES-256-GCM). Permissions: ')}{conn.scopes.join(', ')}</p>
     <Button type="button" variant="secondary" className="text-red-700" disabled={busy} data-connector-disconnect onClick={()=>void disconnect(conn)}>{t('Desconectar','Disconnect')}</Button></>
    :state.resolved.status==='ready'?<Button type="button" disabled={busy} data-connector-connect onClick={()=>void connect(id)}>{t('Conectar cuenta','Connect account')}</Button>
    :<p className="text-sm text-amber-900">{t('No disponible en este modo: faltan claves en el servidor o producción está bloqueada. Vea Integraciones.','Unavailable in this mode: server keys missing or production blocked. See Integrations.')}</p>}
   </section>;})}</div>
  {connected.length>0&&<Composer key={connected.join()} providers={connected} data={data} busy={busy} post={post} confirm={confirm} onSent={()=>setNotice(t('Correo registrado.','Email recorded.'))}/>}
  <section className={card} aria-labelledby="outbox-title" data-outbox><h3 id="outbox-title" className="font-bold">{t('Bandeja de salida','Outbox')}</h3>
   {data.outbox.length===0?<p className="text-sm text-[#52627a]">{t('Todavía no hay correos.','No emails yet.')}</p>:<ul className="space-y-2">{data.outbox.map(mail=><li key={mail.id} data-outbox-item={mail.status} className="min-w-0 space-y-1 rounded-xl border border-[#e5e7eb] p-3 text-sm">
    <div className="flex min-w-0 flex-wrap justify-between gap-2"><strong className="min-w-0 break-words">{mail.subject}</strong><span className={'rounded-full px-2 py-0.5 text-xs font-bold '+(mail.status==='sent'?'bg-emerald-50 text-emerald-800':mail.status==='failed'?'bg-red-50 text-red-800':'bg-[#fff6e0] text-[#7a4b00]')}>{mail.status==='simulated'?t('Simulado · no enviado','Simulated · not sent'):mail.status==='sent'?t('Enviado','Sent'):mail.status==='queued'?t('En cola','Queued'):t('Falló','Failed')}</span></div>
    <p className="break-all text-xs text-[#52627a]">{t('De ','From ')}{mail.from} {t('para ','to ')}{mail.to.join(', ')} · {when(mail.createdAt)}</p>
    <p className="whitespace-pre-wrap break-words">{mail.body}</p>
    {mail.attachments.length>0&&<ul className="text-xs">{mail.attachments.map(file=><li key={file.fileId} className="break-all">📎 {file.name}</li>)}</ul>}
   </li>)}</ul>}
  </section>
  {connected.length>0&&<CalendarPanel providers={connected} data={data} busy={busy} post={post} modeOf={id=>data.providers.find(p=>p.id===id)!.resolved.mode}/>}
  {data.history.length>0&&<details className="rounded-xl border border-[#e5e7eb] bg-white p-3 text-xs"><summary className="cursor-pointer text-sm font-semibold">{t('Historial de conexiones','Connection history')}</summary><ul className="mt-2 space-y-0.5">{data.history.map((row,i)=><li key={i}>{when(row.at)} · {row.provider} · {row.action}</li>)}</ul></details>}
  {dialogNode}
 </div>;
}
type Post=(payload:Record<string,unknown>)=>Promise<Record<string,unknown>|null>;
type Confirm=ReturnType<typeof useAppDialog>['confirm'];
export function Composer({providers,data,busy,post,confirm,onSent,fixedWork}:{providers:Provider[];data:Read;busy:boolean;post:Post;confirm:Confirm;onSent:()=>void;fixedWork?:string}){
 const en=useLocale()==='en',t=(es:string,english:string)=>en?english:es;
 const [provider,setProvider]=useState<Provider>(providers[0]!),[to,setTo]=useState(''),[subject,setSubject]=useState(''),[body,setBody]=useState(''),[work,setWork]=useState(fixedWork??''),[files,setFiles]=useState<string[]>([]),[picker,setPicker]=useState(false),[error,setError]=useState('');
 const offered=data.providers.find(p=>p.id===provider)?.files??[],from=data.connections.find(c=>c.provider===provider&&c.status==='connected')?.accountEmail??'';
 const pending=useRef<{key:string;id:string}|null>(null);
 async function submit(event:FormEvent){
  event.preventDefault();setError('');
  const recipients=to.split(/[,;\s]+/).map(v=>v.trim()).filter(Boolean);
  if(!recipients.length||recipients.some(v=>!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v))){setError(t('Revise los destinatarios.','Check the recipients.'));return;}
  const mock=data.providers.find(p=>p.id===provider)?.resolved.mode==='mock';
  const answer=await confirm({cancelLabel:t('Cancelar','Cancel'),title:t('¿Enviar este correo?','Send this email?'),description:t(`De ${from} para ${recipients.join(', ')}: "${subject}". ${files.length} adjunto(s).`,`From ${from} to ${recipients.join(', ')}: "${subject}". ${files.length} attachment(s).`),
   detail:mock?t('Simulación: el correo NO se envía; queda en la bandeja de salida.','Simulation: the email is NOT sent; it stays in the outbox.'):t('Se enviará de verdad desde su buzón.','It will really be sent from your mailbox.'),confirmLabel:mock?t('Confirmar (simulado)','Confirm (simulated)'):t('Enviar correo','Send email')});
  if(!answer.confirmed)return;
  // Same message retried after an uncertain result reuses its actionId (never recorded twice).
  const content={provider,confirmed:true,to:recipients,subject:subject.trim(),body:body.trim(),workId:work||null,attachments:files},key=JSON.stringify(content);
  if(pending.current?.key!==key)pending.current={key,id:crypto.randomUUID()};
  const result=await post({action:'send_email',actionId:pending.current.id,...content});
  if(result){pending.current=null;setTo('');setSubject('');setBody('');setFiles([]);if(!fixedWork)setWork('');onSent();}
 }
 return <section className={card} aria-labelledby="composer-title" data-email-composer><h3 id="composer-title" className="font-bold">{t('Correo de proyecto','Project email')}</h3>
  <form onSubmit={submit} className="grid min-w-0 gap-3 sm:grid-cols-2">
   <label className="block min-w-0 text-sm font-bold">{t('Enviar desde','Send from')}<select data-email-field="provider" className={field} value={provider} onChange={e=>{setProvider(e.target.value as Provider);setFiles([]);}}>{providers.map(p=><option key={p} value={p}>{names[p]}</option>)}</select></label>
   {fixedWork?<p className="min-w-0 self-end text-sm"><span className="font-bold">{t('Proyecto: ','Project: ')}</span><span data-email-fixed-work={fixedWork} className="break-words">{data.works.find(w=>w.id===fixedWork)?.label??t('este trabajo','this job')}</span></p>
   :<label className="block min-w-0 text-sm font-bold">{t('Proyecto (opcional)','Project (optional)')}<select data-email-field="work" className={field} value={work} onChange={e=>setWork(e.target.value)}><option value="">{t('Sin proyecto','No project')}</option>{data.works.map(w=><option key={w.id} value={w.id}>{w.label}</option>)}</select></label>}
   <label className="block min-w-0 text-sm font-bold sm:col-span-2">{t('Para (separe con comas)','To (comma separated)')}<input data-email-field="to" className={field} required value={to} onChange={e=>setTo(e.target.value)} inputMode="email"/></label>
   <label className="block min-w-0 text-sm font-bold sm:col-span-2">{t('Asunto','Subject')}<input data-email-field="subject" className={field} required maxLength={200} value={subject} onChange={e=>setSubject(e.target.value)}/></label>
   <label className="block min-w-0 text-sm font-bold sm:col-span-2">{t('Mensaje','Message')}<textarea data-email-field="body" className={field+' min-h-32 py-2'} required maxLength={20000} value={body} onChange={e=>setBody(e.target.value)}/></label>
   <div className="space-y-2 sm:col-span-2"><Button type="button" variant="secondary" data-email-attach onClick={()=>setPicker(true)}>{provider==='google'?t('Adjuntar desde Drive','Attach from Drive'):t('Adjuntar desde OneDrive','Attach from OneDrive')}</Button>
    {files.length>0&&<ul data-email-attachments className="text-sm">{files.map(id=><li key={id} className="break-all">📎 {offered.find(f=>f.fileId===id)?.name??id}</li>)}</ul>}</div>
   {error&&<p role="alert" className="text-sm text-red-700 sm:col-span-2">{error}</p>}
   <div className="sm:col-span-2"><Button type="submit" data-email-send disabled={busy}>{t('Revisar y enviar','Review and send')}</Button></div>
  </form>
  {picker&&<Modal title={provider==='google'?t('Archivos de Drive','Drive files'):t('Archivos de OneDrive','OneDrive files')} onClose={()=>setPicker(false)} footer={<Button type="button" data-picker-done onClick={()=>setPicker(false)}>{t('Listo','Done')}</Button>}>
   <div data-file-picker className="space-y-2"><p className="text-xs text-[#52627a]">{t('Simulación: archivos de ejemplo. Con una cuenta real se abre el selector del proveedor y solo se comparte el archivo elegido.','Simulation: sample files. With a real account the provider picker opens and only the chosen file is shared.')}</p>
    {offered.map(file=><label key={file.fileId} className="flex min-h-11 items-center gap-3 rounded-xl border border-[#e5e7eb] px-3 text-sm"><input type="checkbox" data-picker-file={file.fileId} checked={files.includes(file.fileId)} onChange={e=>setFiles(old=>e.target.checked?[...old,file.fileId].slice(0,10):old.filter(v=>v!==file.fileId))}/><span className="min-w-0 break-words">{file.name} · {Math.max(1,Math.round(file.size/1024))} KB</span></label>)}</div>
  </Modal>}
 </section>;
}
function CalendarPanel({providers,data,busy,post,modeOf}:{providers:Provider[];data:Read;busy:boolean;post:Post;modeOf:(id:Provider)=>string}){
 const en=useLocale()==='en',t=(es:string,english:string)=>en?english:es,[summary,setSummary]=useState<string>('');
 const when=(value:string,allDay:boolean)=>new Date(value).toLocaleString(en?'en-US':'es-CR',{timeZone:'America/Costa_Rica',dateStyle:'medium',...(allDay?{}:{timeStyle:'short'})});
 const reason=(value:string)=>({both_changed:t('Cambió en ContrataCR y en el calendario','Changed in ContrataCR and in the calendar'),appointment_moved:t('La cita se movió en el calendario','The appointment was moved in the calendar'),remote_deleted:t('Se borró en el calendario','Deleted in the calendar')} as Record<string,string>)[value]??value;
 async function sync(provider:Provider){const body=await post({action:'calendar_sync',actionId:crypto.randomUUID(),provider});if(!body)return;const n=(key:string)=>Number(body[key]??0);
  setSummary((en?'Synced: ':'Sincronizado: ')+[proCount(n('created'),en,['creado','creados'],['created','created']),proCount(n('updated'),en,['actualizado','actualizados'],['updated','updated']),proCount(n('pulled'),en,['traído del calendario','traídos del calendario'],['pulled from the calendar','pulled from the calendar']),proCount(n('removed'),en,['quitado','quitados'],['removed','removed']),proCount(n('conflicts'),en,['conflicto','conflictos'],['conflict','conflicts']),proCount(n('external'),en,['evento externo','eventos externos'],['external event','external events'])].join(', ')+'.');}
 return <section className={card} aria-labelledby="calendar-title" data-calendar-sync><h3 id="calendar-title" className="font-bold">{t('Calendario (dos sentidos)','Calendar (two-way)')}</h3>
  <p className="text-sm text-[#52627a]">{t('Se envían los trabajos programados de la Agenda y las tareas con fecha. Desde el calendario se traen las fechas de las tareas; una cita movida o un cambio en ambos lados queda como conflicto para que usted decida.','Scheduled jobs from the Agenda and dated tasks are sent. Task dates are pulled back from the calendar; a moved appointment or a change on both sides becomes a conflict for you to decide.')}</p>
  <div className="flex flex-wrap gap-2">{providers.map(p=><Button key={p} type="button" data-calendar-sync-now={p} disabled={busy} onClick={()=>void sync(p)}>{t('Sincronizar ','Sync ')}{p==='google'?'Google Calendar':'Outlook'}</Button>)}
   {providers.filter(p=>modeOf(p)==='mock').map(p=><Button key={p+'x'} type="button" variant="secondary" data-calendar-simulate-external={p} disabled={busy} onClick={()=>void post({action:'calendar_simulate',actionId:crypto.randomUUID(),provider:p,change:'external'})}>{t('Simular: evento personal en el calendario','Simulate: personal event in the calendar')}</Button>)}</div>
  {summary&&<p role="status" data-calendar-summary className="text-sm text-emerald-800">{summary}</p>}
  <AutoSyncControls providers={providers} autosync={data.autosync} busy={busy} post={post}/>
  {data.calendar.links.length>0&&<ul data-calendar-links className="space-y-2">{data.calendar.links.map(link=><li key={link.provider+link.kind+link.localId} data-calendar-link={link.kind} data-calendar-link-status={link.status} className="min-w-0 space-y-2 rounded-xl border border-[#e5e7eb] p-3 text-sm">
   <div className="flex min-w-0 flex-wrap justify-between gap-2"><span className="min-w-0 break-words font-semibold">{link.kind==='task'?t('Tarea · ','Task · '):t('Cita · ','Appointment · ')}{link.title}</span><span className={'rounded-full px-2 py-0.5 text-xs font-bold '+(link.status==='conflict'?'bg-amber-50 text-amber-900':'bg-emerald-50 text-emerald-800')}>{link.status==='conflict'?t('Conflicto','Conflict'):t('Sincronizado','Synced')}</span></div>
   {link.conflict&&<div data-calendar-conflict={link.conflict.reason} className="space-y-1 rounded-lg bg-amber-50 p-2"><p className="font-semibold">{reason(link.conflict.reason)}</p>
    <p>ContrataCR: {when(link.conflict.local.startsAt,link.kind==='task')}</p>{link.conflict.remote&&<p>{t('Calendario: ','Calendar: ')}{when(link.conflict.remote.startsAt,link.kind==='task')}</p>}
    <div className="flex flex-wrap gap-2"><Button type="button" variant="secondary" data-calendar-keep="local" disabled={busy} onClick={()=>void post({action:'calendar_resolve',actionId:crypto.randomUUID(),provider:link.provider,kind:link.kind,localId:link.localId,choice:'keep_local'})}>{t('Conservar ContrataCR','Keep ContrataCR')}</Button>
     {link.kind==='task'&&link.conflict.remote&&<Button type="button" variant="secondary" data-calendar-keep="remote" disabled={busy} onClick={()=>void post({action:'calendar_resolve',actionId:crypto.randomUUID(),provider:link.provider,kind:link.kind,localId:link.localId,choice:'keep_remote'})}>{t('Conservar calendario','Keep calendar')}</Button>}</div></div>}
   {link.status==='synced'&&modeOf(link.provider)==='mock'&&<div className="flex flex-wrap gap-2"><Button type="button" variant="secondary" data-calendar-simulate-move={link.localId} disabled={busy} onClick={()=>void post({action:'calendar_simulate',actionId:crypto.randomUUID(),provider:link.provider,change:'move',remoteId:link.remoteId})}>{t('Simular: mover en el calendario','Simulate: move in the calendar')}</Button><Button type="button" variant="secondary" data-calendar-simulate-delete={link.localId} disabled={busy} onClick={()=>void post({action:'calendar_simulate',actionId:crypto.randomUUID(),provider:link.provider,change:'delete',remoteId:link.remoteId})}>{t('Simular: borrar en el calendario','Simulate: delete in the calendar')}</Button></div>}
  </li>)}</ul>}
  {data.calendar.external.length>0&&<div><h4 className="text-sm font-bold">{t('Ocupado según su calendario','Busy according to your calendar')}</h4><ul data-calendar-external className="text-sm">{data.calendar.external.map(row=><li key={row.provider+row.remoteId}>{when(row.startsAt,row.allDay)} · {row.title}</li>)}</ul></div>}
 </section>;
}

/** Round 6C: automatic sync interval per calendar (off by default) and the latest automatic runs. */
function AutoSyncControls({providers,autosync,busy,post}:{providers:Provider[];autosync?:AutoSync;busy:boolean;post:Post}){
 const en=useLocale()==='en',t=(es:string,english:string)=>en?english:es;
 if(!autosync)return null;
 const when=(value:string)=>new Date(value).toLocaleString(en?'en-US':'es-CR',{timeZone:'America/Costa_Rica',dateStyle:'short',timeStyle:'short'});
 return <div data-calendar-autosync className="space-y-2 rounded-xl border border-[#e5e7eb] p-3">
  <h4 className="text-sm font-bold">{t('Sincronización automática','Automatic sync')}</h4>
  <p className="text-xs text-[#52627a]">{t('Mientras ContrataCR Pro esté abierto, el calendario se sincroniza solo cada cierto tiempo. Dos pestañas abiertas nunca sincronizan la misma ventana dos veces.','While ContrataCR Pro is open, the calendar syncs by itself at the chosen interval. Two open tabs never sync the same window twice.')}</p>
  {providers.map(p=>{const row=autosync.settings.find(s=>s.provider===p);return <label key={p} className="flex min-w-0 flex-wrap items-center gap-2 text-sm font-semibold">{p==='google'?'Google Calendar':'Outlook'}
   <select data-calendar-autosync-interval={p} className="min-h-11 rounded-xl border border-[#d7e1ea] bg-white px-3 text-base font-normal" value={row?.intervalMinutes??0} disabled={busy}
    onChange={event=>void post({action:'calendar_autosync_set',actionId:crypto.randomUUID(),provider:p,revision:row?.revision??0,intervalMinutes:Number(event.target.value)})}>
    <option value={0}>{t('Desactivada','Off')}</option>{[15,30,60,120].map(m=><option key={m} value={m}>{t(`Cada ${m} min`,`Every ${m} min`)}</option>)}</select>
   {row?.nextRunAt&&<span className="text-xs font-normal text-[#52627a]">{t('Próxima: ','Next: ')}{when(row.nextRunAt)}</span>}</label>;})}
  {autosync.runs.length>0&&<ul data-calendar-autosync-runs className="space-y-0.5 text-xs text-[#52627a]">{autosync.runs.slice(0,5).map(run=><li key={run.runId} data-calendar-autosync-run={run.status}>{when(run.startedAt)} · {run.provider} · {run.status==='ok'?t('correcta','ok'):run.status==='error'?t('falló','failed'):t('en curso','running')}{run.summary?` · ${t('creados','created')} ${run.summary.created??0}, ${t('actualizados','updated')} ${run.summary.updated??0}, ${t('conflictos','conflicts')} ${run.summary.conflicts??0}`:''}</li>)}</ul>}
 </div>;
}
let tickerActive=false;
/**
 * Round 6C: in-app scheduler. One per tab (module flag). Reads the auto-sync settings once; only when some
 * calendar has an interval does it ask the server every minute to run what is due (the server claims each
 * window atomically, so this is safe with several tabs or devices).
 */
export function CalendarAutoSyncTicker(){
 useEffect(()=>{
  if(tickerActive)return;tickerActive=true;let timer:ReturnType<typeof setInterval>|null=null,alive=true;
  // Round 7B: leaving the page (in-app or a document load) cancelled the settings
  // read mid-flight, which WebKit reports as a console error. Abort it ourselves.
  const reads=new AbortController(),leave=()=>reads.abort();window.addEventListener('pagehide',leave);window.addEventListener('beforeunload',leave);
  const tick=()=>void fetch(api,{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'calendar_autosync_tick',actionId:crypto.randomUUID()})}).catch(()=>undefined);
  const start=setTimeout(async()=>{
   try{const response=await fetch(api+'?autosync=1',{cache:'no-store',signal:reads.signal});if(!response.ok||!alive)return;const body=await response.json() as AutoSync;
    if(body.settings.some(row=>row.intervalMinutes>0)){tick();timer=setInterval(tick,60000);}}catch{/* not a Pro account or offline */}
  },4000);
  return()=>{alive=false;tickerActive=false;reads.abort();window.removeEventListener('pagehide',leave);window.removeEventListener('beforeunload',leave);clearTimeout(start);if(timer)clearInterval(timer);};
 },[]);
 return null;
}
