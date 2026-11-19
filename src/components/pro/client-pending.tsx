'use client';
import {WorkPhaseText} from './work-header';
import {useCallback,useEffect,useRef,useState} from 'react';
import {useLocale} from 'next-intl';
import {Button} from '@/components/ui/button';
import type {ClientPendingPage,ClientPendingRow} from '@/lib/pro/client-pending';

export function ClientPending({clientId,onWork,onQuote,onRequest}:{clientId:string;onWork:(id:string)=>void;onQuote:(id:string,legacy:boolean)=>void;onRequest:(id:string)=>void}){
 const en=useLocale()==='en';
 const [data,setData]=useState<ClientPendingPage|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(false),[changed,setChanged]=useState(false);
 const sequence=useRef(0),busy=useRef(false),fingerprint=useRef('');
 const load=useCallback(async(after='')=>{
  if(after&&busy.current)return;
  const request=++sequence.current;busy.current=true;setLoading(true);setError(false);
  try{
   const response=await fetch('/api/pro/client-pending?'+new URLSearchParams({clientId,after}),{cache:'no-store'}),body:ClientPendingPage=await response.json();
   if(!response.ok)throw Error();if(request!==sequence.current)return;
   if(after&&fingerprint.current!==body.fingerprint){setChanged(true);return;}
   fingerprint.current=body.fingerprint;setChanged(false);
   setData(old=>({...body,items:after&&old?[...old.items,...body.items.filter(row=>!old.items.some(item=>item.key===row.key))]:body.items}));
  }catch{if(request===sequence.current)setError(true);}
  finally{if(request===sequence.current){busy.current=false;setLoading(false);}}
 },[clientId]);
 const invalidate=useCallback(()=>{sequence.current++;busy.current=false;},[]);
 useEffect(()=>{const timer=setTimeout(()=>void load(),0);return()=>{clearTimeout(timer);invalidate();};},[load,invalidate]);
 const labels:Record<ClientPendingRow['reason'],string>=en?{plan:'Jobs to arrange',request:'Requests to review',confirmation:'Awaiting customer confirmation',expired:'Expired quotes',review:'Appointments to review',upcoming:'Upcoming appointments',prepare:'Quotes to prepare',response:'Awaiting a reply',schedule:'Accepted without an appointment'}:{plan:'Trabajos por coordinar',request:'Solicitudes por revisar',confirmation:'Esperando confirmación del cliente',expired:'Cotizaciones vencidas',review:'Citas por revisar',upcoming:'Próximas citas',prepare:'Cotizaciones por preparar',response:'Esperando respuesta',schedule:'Aceptadas sin cita'};
 const actions:Record<ClientPendingRow['reason'],string>=en?{plan:'Open job',request:'Review request',confirmation:'View proposed time',expired:'Review expired quote',review:'Review appointment',upcoming:'View appointment',prepare:'Continue quote',response:'View quote',schedule:'Review and schedule'}:{plan:'Abrir trabajo',request:'Revisar solicitud',confirmation:'Ver horario propuesto',expired:'Revisar cotización vencida',review:'Revisar cita',upcoming:'Ver cita',prepare:'Continuar cotización',response:'Ver cotización',schedule:'Revisar y agendar'};
 const total=data?Object.values(data.summary).reduce((sum,value)=>sum+value,0):0;
 return <section aria-label={en?'Client pending tasks':'Pendientes del cliente'} className="space-y-3" data-client-pending="">
  <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold">{en?'What’s next':'Qué sigue con este cliente'}</h3><Button variant="secondary" disabled={loading} onClick={()=>void load()}>{en?'Refresh pending tasks':'Actualizar pendientes'}</Button></div>
  {data&&data.summary.review>0&&<p className="text-xs text-[#68778d]">{en?'Review appointments that have ended before marking them complete.':'Revise las citas cuya hora ya pasó antes de finalizarlas.'}</p>}
  {data&&total>0&&<details><summary className="min-h-11 cursor-pointer text-sm font-semibold">{en?'View task summary':'Ver resumen de pendientes'}</summary><ul className="flex flex-wrap gap-2 text-xs text-[#52627a]" aria-label={en?'Pending task totals':'Resumen de pendientes'}>{(Object.keys(labels) as ClientPendingRow['reason'][]).filter(key=>data.summary[key]>0).map(key=><li key={key} className="rounded-lg bg-[#f3f8fb] px-3 py-2">{labels[key]}: <strong>{data.summary[key]}</strong></li>)}</ul></details>}
  {loading&&!data&&<p role="status">{en?'Loading pending tasks…':'Cargando pendientes…'}</p>}
  {data&&!total&&!error&&<p className="text-sm text-[#52627a]">{en?'No pending requests, jobs or quotes.':'No hay solicitudes, trabajos ni cotizaciones pendientes.'}</p>}
  {data?.items.map(row=><button key={row.key} type="button" disabled={loading||changed||error} onClick={()=>row.kind==='request'?onRequest(row.id):row.kind==='work'?onWork(row.id):onQuote(row.id,row.legacy)} className="block min-h-11 w-full rounded-2xl border border-[#e5e7eb] p-4 text-left text-sm disabled:opacity-60">
   <span className="block font-semibold break-words">{row.title|| (en?'Quote':'Cotización')}</span>
   <span className="block text-[#52627a]">{labels[row.reason]}{row.kind==='work'&&<WorkPhaseText workId={row.id} fallback="" prefix=" · "/>}</span>
   {row.at&&Number.isFinite(Date.parse(row.at))&&<span className="block text-xs text-[#68778d]">{row.kind==='quote'?(en?'Created: ':'Creada: '):''}{new Date(row.at).toLocaleString(en?'en-US':'es-CR',{timeZone:'America/Costa_Rica',dateStyle:'medium',...(row.kind!=='quote'?{timeStyle:'short' as const}:{})})}</span>}
   <span className="mt-1 block font-semibold text-[#008bb5]">{actions[row.reason]}</span>
  </button>)}
  {error&&<p role="alert" className="text-sm text-red-700">{en?'Could not load pending tasks. Refresh to try again.':'No se pudieron cargar los pendientes. Actualice para reintentar.'}</p>}
  {changed&&<p role="status" className="text-sm text-[#52627a]">{en?'Pending tasks changed. Refresh before continuing.':'Los pendientes cambiaron. Actualice antes de continuar.'}</p>}
  {data?.nextCursor&&!error&&!changed&&<Button variant="secondary" disabled={loading} onClick={()=>void load(data.nextCursor!)}>{en?'Show more pending tasks':'Ver más pendientes'}</Button>}
 </section>;
}
