'use client';
import {useCallback,useEffect,useRef,useState,type FormEvent} from 'react';
import {useLocale} from 'next-intl';
import {Button} from '@/components/ui/button';
import {useAppDialog} from '@/hooks/use-app-dialog';

/**
 * Row 72: Company › Automation (outgoing signed webhooks) and Company › Meetings (video link). Both run in
 * sandbox/mock mode here: webhook deliveries are only recorded as "simulated" and meeting links are fictitious.
 * The signing secret is shown once, when the connection is created.
 */
type Endpoint={id:string;name:string;url:string;events:string[];status:'active'|'paused'|'revoked';secretHint:string;revision:number;createdAt:string};
type Delivery={id:string;endpointId:string;event:string;mode:'sandbox'|'live';status:'simulated'|'delivered'|'failed';attempts:number;httpStatus:number|null;error:string|null;createdAt:string};
type Meeting={id:string;workId:string|null;title:string;provider:'meet'|'teams'|'zoom';joinUrl:string;startsAt:string;durationMinutes:number;status:'scheduled'|'cancelled';calendarProvider:string|null;revision:number};
const card='min-w-0 space-y-3 rounded-2xl border border-[#d7e1ea] bg-white p-4 sm:p-5',field='mt-1 block min-h-11 w-full min-w-0 rounded-xl border border-[#d7e1ea] bg-white px-3 text-base font-normal';
const events=['lead.created','quote.accepted','invoice.paid'] as const;

function useLoad<T>(url:string){
 const [data,setData]=useState<T|null>(null),[failed,setFailed]=useState(false),seq=useRef(0);
 const load=useCallback(async()=>{const n=++seq.current;setFailed(false);try{const r=await fetch(url,{cache:'no-store'});if(!r.ok)throw Error();const body=await r.json() as T;if(n===seq.current)setData(body);}catch{if(n===seq.current)setFailed(true);}},[url]);
 useEffect(()=>{const counter=seq,timer=setTimeout(()=>void load(),0);return()=>{clearTimeout(timer);counter.current++;};},[load]);
 return{data,failed,load};
}
async function send(url:string,payload:Record<string,unknown>){
 try{const r=await fetch(url,{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const json=await r.json().catch(()=>({})) as Record<string,unknown>;return{ok:r.ok,json};}
 catch{return{ok:false,json:{} as Record<string,unknown>};}
}

export function CompanyAutomation(){
 const en=useLocale()==='en',t=(es:string,english:string)=>en?english:es,{confirm,dialogNode}=useAppDialog();
 const {data,failed,load}=useLoad<{endpoints:Endpoint[];deliveries:Delivery[];mode:'sandbox'|'live'}>('/api/pro/company-automation');
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[secret,setSecret]=useState<string|null>(null);
 const [name,setName]=useState(''),[url,setUrl]=useState(''),[picked,setPicked]=useState<string[]>([...events]);
 const eventName=(e:string)=>({'lead.created':t('Solicitud nueva','New request'),'quote.accepted':t('Cotización aceptada','Quote accepted'),'invoice.paid':t('Factura pagada','Invoice paid'),'test.ping':t('Prueba','Test')} as Record<string,string>)[e]??e;
 const statusName=(s:string)=>({simulated:t('Simulado','Simulated'),delivered:t('Entregado','Delivered'),failed:t('Falló','Failed'),active:t('Activa','Active'),paused:t('En pausa','Paused'),revoked:t('Revocada','Revoked')} as Record<string,string>)[s]??s;
 async function act(payload:Record<string,unknown>,done?:string){
  setBusy(true);setError('');setNotice('');
  const r=await send('/api/pro/company-automation',payload);
  if(!r.ok)setError(String(r.json.error??t('No se pudo completar la operación. Reintente.','Could not complete the operation. Retry.')));
  else if(done)setNotice(done);
  setBusy(false);return r;
 }
 async function create(event:FormEvent){
  event.preventDefault();
  const r=await act({action:'create',name,url,events:picked});
  if(r.ok){setSecret(String(r.json.secret??''));setName('');setUrl('');await load();}
 }
 async function revoke(e:Endpoint){
  if(!(await confirm({cancelLabel:t('Cancelar','Cancel'),title:t('Revocar conexión','Revoke connection'),description:t(`Dejará de recibir eventos y no podrá reactivarse: "${e.name}".`,`It will stop receiving events and cannot be reactivated: "${e.name}".`),confirmLabel:t('Revocar','Revoke'),tone:'danger'})).confirmed)return;
  await act({action:'revoke',id:e.id,revision:e.revision});await load();
 }
 if(failed)return <div role="alert" className="flex flex-wrap items-center gap-2 rounded-2xl border border-[#d7e1ea] p-3 text-sm"><span>{t('No se pudo cargar la automatización.','Could not load automation.')}</span><Button type="button" variant="secondary" onClick={()=>void load()}>{t('Reintentar','Retry')}</Button></div>;
 if(!data)return <p role="status" aria-busy="true" className="text-sm text-[#52627a]">{t('Cargando…','Loading…')}</p>;
 return <div data-company-automation className="grid min-w-0 gap-4 lg:grid-cols-2">
  {dialogNode}
  <section className={card+' lg:col-span-2'} aria-labelledby="automation-intro"><div className="flex flex-wrap items-center gap-2"><h3 id="automation-intro" className="font-bold">{t('Eventos hacia otras herramientas','Events to other tools')}</h3>
   <span data-automation-mode={data.mode} className="rounded-lg bg-[#fff6e5] px-2 py-0.5 text-xs font-semibold text-[#8a5a00]">{data.mode==='live'?t('Envío real','Live delivery'):t('Pruebas: no se envía nada','Sandbox: nothing is sent')}</span></div>
   <p className="text-sm text-[#52627a]">{t('Conecte Zapier, Make, n8n o su propio sistema. Cada evento se firma con su clave secreta (cabecera X-CCR-Signature, HMAC-SHA256) y solo se envía a direcciones https públicas. En modo de pruebas la entrega se registra como simulada.','Connect Zapier, Make, n8n or your own system. Each event is signed with your secret (X-CCR-Signature header, HMAC-SHA256) and only sent to public https addresses. In sandbox mode the delivery is recorded as simulated.')}</p>
   <p className="text-sm text-[#52627a]">{t('Los eventos no incluyen datos personales de sus clientes.','Events do not include your customers\' personal data.')}</p></section>
  <section className={card} aria-labelledby="automation-new"><h3 id="automation-new" className="font-bold">{t('Nueva conexión','New connection')}</h3>
   <form onSubmit={create} className="space-y-3">
    <label className="block text-sm font-semibold">{t('Nombre','Name')}<input required maxLength={80} value={name} onChange={e=>setName(e.target.value)} className={field} data-automation-name/></label>
    <label className="block text-sm font-semibold">{t('Dirección que recibe los eventos (https)','Address that receives the events (https)')}<input required type="url" inputMode="url" maxLength={600} placeholder="https://" value={url} onChange={e=>setUrl(e.target.value)} className={field} data-automation-url/></label>
    <fieldset className="space-y-1"><legend className="text-sm font-semibold">{t('Eventos','Events')}</legend>
     {events.map(e=><label key={e} className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={picked.includes(e)} onChange={x=>setPicked(p=>x.target.checked?[...p,e]:p.filter(i=>i!==e))}/>{eventName(e)}</label>)}</fieldset>
    <Button type="submit" disabled={busy||!picked.length}>{t('Crear conexión','Create connection')}</Button>
   </form>
   {secret&&<div data-automation-secret role="status" className="space-y-1 rounded-xl border border-[#c8dff0] bg-[#f3f8fb] p-3 text-sm"><p className="font-semibold">{t('Clave secreta (se muestra una sola vez)','Secret (shown only once)')}</p><code className="block break-all rounded bg-white p-2 text-xs">{secret}</code>
    <Button type="button" variant="secondary" onClick={()=>setSecret(null)}>{t('Ya la guardé','I saved it')}</Button></div>}
   {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}{notice&&<p role="status" className="text-sm text-[#18794e]">{notice}</p>}
  </section>
  <section className={card} aria-labelledby="automation-list"><h3 id="automation-list" className="font-bold">{t('Conexiones','Connections')}</h3>
   {!data.endpoints.length?<p className="text-sm text-[#52627a]">{t('Todavía no tiene conexiones.','You have no connections yet.')}</p>:
   <ul className="space-y-3">{data.endpoints.map(e=><li key={e.id} data-automation-endpoint={e.id} data-endpoint-status={e.status} className="space-y-1 rounded-xl border border-[#e6edf3] p-3 text-sm">
    <div className="flex flex-wrap items-center justify-between gap-2"><span className="min-w-0 break-words font-semibold">{e.name}</span><span className="rounded-lg bg-[#eef4f8] px-2 py-0.5 text-xs font-semibold">{statusName(e.status)}</span></div>
    <p className="break-all text-[#52627a]">{e.url}</p><p className="text-[#52627a]">{e.events.map(eventName).join(', ')} · {t('clave termina en','secret ends in')} {e.secretHint}</p>
    {e.status!=='revoked'&&<div className="flex flex-wrap gap-2">
     {e.status==='active'&&<Button type="button" variant="secondary" disabled={busy} data-automation-test onClick={async()=>{const r=await act({action:'test',id:e.id});if(r.ok)setNotice(t('Evento de prueba registrado.','Test event recorded.'));await load();}}>{t('Enviar evento de prueba','Send test event')}</Button>}
     <Button type="button" variant="secondary" disabled={busy} onClick={async()=>{await act({action:e.status==='active'?'pause':'resume',id:e.id,revision:e.revision});await load();}}>{e.status==='active'?t('Pausar','Pause'):t('Reanudar','Resume')}</Button>
     <Button type="button" variant="ghost" disabled={busy} data-automation-revoke onClick={()=>void revoke(e)}>{t('Revocar','Revoke')}</Button></div>}
   </li>)}</ul>}
  </section>
  <section className={card+' lg:col-span-2'} aria-labelledby="automation-log"><h3 id="automation-log" className="font-bold">{t('Registro de entregas','Delivery log')}</h3>
   {!data.deliveries.length?<p className="text-sm text-[#52627a]">{t('Aún no hay entregas.','No deliveries yet.')}</p>:
   <ul className="divide-y divide-[#e6edf3] text-sm">{data.deliveries.map(d=><li key={d.id} data-automation-delivery={d.status} className="flex flex-wrap justify-between gap-2 py-2"><span>{eventName(d.event)}</span><span className="text-[#52627a]">{statusName(d.status)}{d.httpStatus?` (${d.httpStatus})`:''}{d.error?` · ${d.error}`:''} · {new Date(d.createdAt).toLocaleString(en?'en-US':'es-CR')}</span></li>)}</ul>}
  </section>
 </div>;
}

export function CompanyMeetings(){
 const en=useLocale()==='en',t=(es:string,english:string)=>en?english:es,{confirm,dialogNode}=useAppDialog();
 const {data,failed,load}=useLoad<{meetings:Meeting[];works:{id:string;label:string}[];mode:string}>('/api/pro/company-meetings');
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const [title,setTitle]=useState(''),[provider,setProvider]=useState<'meet'|'teams'|'zoom'>('meet'),[work,setWork]=useState(''),[start,setStart]=useState(''),[duration,setDuration]=useState(60);
 const providerName={meet:'Google Meet',teams:'Microsoft Teams',zoom:'Zoom'};
 async function create(event:FormEvent){
  event.preventDefault();setBusy(true);setError('');
  const r=await send('/api/pro/company-meetings',{action:'create',id:crypto.randomUUID(),title,provider,workId:work||null,startsAt:new Date(start).toISOString(),durationMinutes:duration});
  if(r.ok){setTitle('');setStart('');await load();}else setError(String(r.json.error??t('No se pudo crear la reunión.','Could not create the meeting.')));
  setBusy(false);
 }
 async function cancel(m:Meeting){
  if(!(await confirm({cancelLabel:t('Volver','Back'),title:t('Cancelar reunión','Cancel meeting'),description:t(`Se cancelará "${m.title}".`,`"${m.title}" will be cancelled.`),confirmLabel:t('Cancelar reunión','Cancel meeting'),tone:'danger'})).confirmed)return;
  setBusy(true);setError('');const r=await send('/api/pro/company-meetings',{action:'cancel',id:m.id,revision:m.revision});if(!r.ok)setError(String(r.json.error??t('No se pudo cancelar.','Could not cancel.')));await load();setBusy(false);
 }
 if(failed)return <div role="alert" className="flex flex-wrap items-center gap-2 rounded-2xl border border-[#d7e1ea] p-3 text-sm"><span>{t('No se pudieron cargar las reuniones.','Could not load meetings.')}</span><Button type="button" variant="secondary" onClick={()=>void load()}>{t('Reintentar','Retry')}</Button></div>;
 if(!data)return <p role="status" aria-busy="true" className="text-sm text-[#52627a]">{t('Cargando…','Loading…')}</p>;
 return <div data-company-meetings className="grid min-w-0 gap-4 lg:grid-cols-2">
  {dialogNode}
  <section className={card} aria-labelledby="meetings-new"><div className="flex flex-wrap items-center gap-2"><h3 id="meetings-new" className="font-bold">{t('Nueva reunión','New meeting')}</h3><span className="rounded-lg bg-[#fff6e5] px-2 py-0.5 text-xs font-semibold text-[#8a5a00]">{t('Simulada: el enlace es de prueba','Simulated: the link is a test link')}</span></div>
   <p className="text-sm text-[#52627a]">{t('Prepare una videollamada con su cliente y vincúlela a un proyecto. Si conectó Google o Microsoft, el evento se agrega a su calendario de prueba.','Set up a video call with your customer and link it to a project. If you connected Google or Microsoft, the event is added to your test calendar.')}</p>
   <form onSubmit={create} className="space-y-3">
    <label className="block text-sm font-semibold">{t('Asunto','Subject')}<input required maxLength={120} value={title} onChange={e=>setTitle(e.target.value)} className={field} data-meeting-title/></label>
    <label className="block text-sm font-semibold">{t('Plataforma','Platform')}<select value={provider} onChange={e=>setProvider(e.target.value as typeof provider)} className={field}>{(Object.keys(providerName) as (keyof typeof providerName)[]).map(k=><option key={k} value={k}>{providerName[k]}</option>)}</select></label>
    <label className="block text-sm font-semibold">{t('Proyecto (opcional)','Project (optional)')}<select value={work} onChange={e=>setWork(e.target.value)} className={field}><option value="">{t('Sin proyecto','No project')}</option>{data.works.map(w=><option key={w.id} value={w.id}>{w.label}</option>)}</select></label>
    <div className="grid gap-3 sm:grid-cols-2"><label className="block text-sm font-semibold">{t('Inicio','Start')}<input required type="datetime-local" value={start} onChange={e=>setStart(e.target.value)} className={field} data-meeting-start/></label>
     <label className="block text-sm font-semibold">{t('Duración (minutos)','Duration (minutes)')}<input required type="number" min={15} max={480} step={5} value={duration} onChange={e=>setDuration(Number(e.target.value))} className={field}/></label></div>
    <Button type="submit" disabled={busy}>{t('Crear reunión','Create meeting')}</Button>
   </form>
   {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
  </section>
  <section className={card} aria-labelledby="meetings-list"><h3 id="meetings-list" className="font-bold">{t('Reuniones','Meetings')}</h3>
   {!data.meetings.length?<p className="text-sm text-[#52627a]">{t('Todavía no tiene reuniones.','You have no meetings yet.')}</p>:
   <ul className="space-y-3">{data.meetings.map(m=><li key={m.id} data-meeting={m.id} data-meeting-status={m.status} className="space-y-1 rounded-xl border border-[#e6edf3] p-3 text-sm">
    <div className="flex flex-wrap items-center justify-between gap-2"><span className="min-w-0 break-words font-semibold">{m.title}</span><span className="rounded-lg bg-[#eef4f8] px-2 py-0.5 text-xs font-semibold">{m.status==='scheduled'?t('Programada','Scheduled'):t('Cancelada','Cancelled')}</span></div>
    <p className="text-[#52627a]">{providerName[m.provider]} · {new Date(m.startsAt).toLocaleString(en?'en-US':'es-CR')} · {m.durationMinutes} min{m.calendarProvider?' · '+t('en calendario','on calendar'):''}</p>
    {m.status==='scheduled'&&<p className="break-all text-[#52627a]" data-meeting-link>{m.joinUrl}</p>}
    {m.status==='scheduled'&&<Button type="button" variant="ghost" disabled={busy} data-meeting-cancel onClick={()=>void cancel(m)}>{t('Cancelar reunión','Cancel meeting')}</Button>}
   </li>)}</ul>}
  </section>
 </div>;
}
