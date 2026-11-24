'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {useLocale} from 'next-intl';
import {Button} from '@/components/ui/button';
import {proMoney} from '@/lib/pro/money';
import {closeForecastSchema,closeDateResultSchema,type CloseForecast,type StageSettings} from '@/lib/pro/sales-pipeline';
import {leadStageName} from './lead-stages-editor';

/**
 * Row 07: forecast by expected close date. Each open lead can carry an expected close date; the table groups the
 * estimated and probability-weighted value per Costa Rica month and currency, with overdue and undated leads apart.
 * A forecast is not a payment. SQL decides; each write keeps its actionId until confirmed (a retry never duplicates).
 */
const COPY={
 es:{title:'Previsión por fecha de cierre',intro:'Fecha en que espera cerrar cada solicitud abierta. Se suma el valor estimado, y el ponderado por la probabilidad de su etapa. No es un cobro ni una factura.',
  overdue:'Vencidas',none:'Sin fecha de cierre',count:(n:number)=>n===1?'1 solicitud':`${n} solicitudes`,estimated:'Estimado',weighted:'Ponderado',noValue:(n:number)=>n===1?'1 sin valor estimado':`${n} sin valor estimado`,
  date:'Fecha de cierre',save:'Guardar fecha',clear:'Quitar fecha',saved:'Fecha de cierre guardada.',cleared:'Fecha de cierre quitada.',changed:'La fecha cambió en otra pestaña. Se recargó.',failed:'No se pudo guardar. Reintente: no se duplicará.',
  loadFailed:'No se pudo cargar la previsión.',retry:'Reintentar',loading:'Cargando…',empty:'No hay solicitudes abiertas.',request:'Solicitud',manual:'Oportunidad',invalid:'Elija una fecha válida.',list:'Solicitudes abiertas'},
 en:{title:'Forecast by close date',intro:'The date you expect each open lead to close. The estimated value and the value weighted by its stage probability are added up. It is not a payment or an invoice.',
  overdue:'Overdue',none:'No close date',count:(n:number)=>n===1?'1 lead':`${n} leads`,estimated:'Estimated',weighted:'Weighted',noValue:(n:number)=>n===1?'1 without an estimated value':`${n} without an estimated value`,
  date:'Close date',save:'Save date',clear:'Remove date',saved:'Close date saved.',cleared:'Close date removed.',changed:'The date changed in another tab. It was reloaded.',failed:'Could not save. Retry: it will not be duplicated.',
  loadFailed:'Could not load the forecast.',retry:'Retry',loading:'Loading…',empty:'There are no open leads.',request:'Request',manual:'Opportunity',invalid:'Choose a valid date.',list:'Open leads'},
};
async function get(actor:string){const r=await fetch('/api/pro/lead-pipeline/close-dates',{cache:'no-store',headers:{'X-Pro-Expected-Actor':actor}});if(!r.ok)throw Error(String(r.status));return r.json();}
async function post(actor:string,body:unknown){const r=await fetch('/api/pro/lead-pipeline/close-dates',{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json','X-Pro-Expected-Actor':actor},body:JSON.stringify(body)});let data:unknown=null;try{data=await r.json();}catch{}return {status:r.status,ok:r.ok,data};}
function money(cents:number,currency:string,en:boolean){return currency==='USD'?new Intl.NumberFormat(en?'en-US':'es-CR',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(cents/100):proMoney(cents/100,en);}
export function CloseDateForecast({actor,settings,disabled}:{actor:string;settings:StageSettings|null;disabled:boolean}){
 const lang=useLocale()==='en'?'en':'es',c=COPY[lang],en=lang==='en';
 const [data,setData]=useState<CloseForecast|null>(null),[error,setError]=useState(false),[drafts,setDrafts]=useState<Record<string,string>>({}),[busy,setBusy]=useState(''),[msg,setMsg]=useState(''),[bad,setBad]=useState(''),seq=useRef(0),pending=useRef<Record<string,{key:string;actionId:string}>>({});
 const load=useCallback(async(settled?:string)=>{const n=++seq.current;try{setError(false);const r=closeForecastSchema.parse(await get(actor));if(n===seq.current){setData(r);setDrafts(d=>{if(!settled)return {};const rest={...d};delete rest[settled];return rest;});}}catch{if(n===seq.current)setError(true);}},[actor]);
 useEffect(()=>{const timer=setTimeout(()=>void load(),0);return()=>clearTimeout(timer);},[load]);
 const stageName=(id:string)=>{const s=settings?.stages.find(x=>x.id===id);return s?leadStageName({id:s.id,builtin:s.builtin,name:s.name,position:s.position,hidden:s.hidden,reassignToId:null},en):id;};
 const monthLabel=(g:string)=>g==='overdue'?c.overdue:g==='none'?c.none:new Intl.DateTimeFormat(en?'en-US':'es-CR',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(g+'-15T12:00:00Z'));
 async function save(kind:'manual'|'request',id:string,revision:number,clear:boolean){
  if(!data||busy)return;const key0=kind+id,raw=(drafts[key0]??'').trim();
  if(!clear&&!/^\d{4}-\d{2}-\d{2}$/.test(raw)){setBad(key0);setMsg('');return;}
  setBad('');const body={kind,id,revision,closeOn:clear?null:raw},key=JSON.stringify(body);
  if(pending.current[key0]?.key!==key)pending.current[key0]={key,actionId:crypto.randomUUID()};
  setBusy(key0);setMsg('');
  try{const r=await post(actor,{...body,actionId:pending.current[key0].actionId});
   if(r.status===409){delete pending.current[key0];await load(key0);setMsg(c.changed);return;}if(!r.ok)throw Error();
   closeDateResultSchema.parse(r.data);delete pending.current[key0];await load(key0);setMsg(clear?c.cleared:c.saved);}
  catch{setMsg(c.failed);}finally{setBusy('');}}
 return <section data-close-forecast aria-label={c.title} className="min-w-0 rounded-2xl border border-[#d7e1ea] bg-white p-4">
  <h3 className="text-base font-bold text-[#162543]">{c.title}</h3><p className="mt-0.5 max-w-prose text-xs text-[#52627a]">{c.intro}</p>
  {error&&<p role="alert" className="mt-3 text-sm">{c.loadFailed} <Button variant="outline" size="sm" onClick={()=>void load()}>{c.retry}</Button></p>}
  {!data&&!error&&<p role="status" className="mt-3 text-sm text-[#52627a]">{c.loading}</p>}
  {msg&&<p role="status" data-close-forecast-notice className="mt-2 text-sm text-[#1f6f43]">{msg}</p>}
  {data&&<>
   <ul className="mt-3 grid gap-2 sm:grid-cols-2">{data.groups.map(g=><li key={g.group} data-close-group={g.group} className={`min-w-0 rounded-xl px-3 py-2.5 ${g.group==='overdue'?'bg-[#fef1f1]':'bg-[#f7f9fc]'}`}>
    <p className="text-sm font-bold capitalize text-[#162543]">{monthLabel(g.group)} <span className="text-xs font-normal text-[#52627a]">· {c.count(g.count)}</span></p>
    {g.values.map(v=><p key={v.currency} data-close-group-value={v.currency} className="mt-0.5 break-words text-sm text-[#162543]">{c.estimated}: <strong>{money(v.totalCents,v.currency,en)}</strong> · {c.weighted}: <strong>{money(v.weightedCents,v.currency,en)}</strong></p>)}
    {g.withoutValue>0&&<p className="mt-0.5 text-xs text-[#52627a]">{c.noValue(g.withoutValue)}</p>}</li>)}</ul>
   <h4 className="mt-4 text-sm font-bold text-[#162543]">{c.list}</h4>
   {data.items.length===0?<p className="mt-1 text-sm text-[#52627a]">{c.empty}</p>
   :<ul className="mt-2 space-y-2">{data.items.map(it=>{const k=it.kind+it.id,cur=it.closeOn??'',draft=drafts[k]??cur;
    return <li key={k} data-close-item={it.id} className="min-w-0 rounded-xl border border-[#eef2f6] p-3 text-sm">
     <p className="break-words font-semibold text-[#162543]">{it.title||(it.kind==='request'?c.request:c.manual)}</p>
     <p className="text-xs text-[#52627a]">{stageName(it.stageId)} · {it.probability} %{it.revenueCents!==null&&it.currency?' · '+money(it.revenueCents,it.currency,en):''}</p>
     <div className="mt-2 flex flex-wrap items-end gap-2"><label className="block min-w-0 text-xs font-semibold text-[#52627a]">{c.date}
      <input type="date" data-close-date={it.id} aria-invalid={bad===k} value={draft} min="2000-01-01" max="2100-12-31" disabled={disabled||busy===k} onChange={e=>{setDrafts({...drafts,[k]:e.target.value});if(bad===k)setBad('');}}
       className={'mt-1 block min-h-11 rounded-xl border bg-white px-3 text-base text-[#162543] '+(bad===k?'border-red-500':'border-[#d7e1ea]')}/></label>
      <Button type="button" size="sm" data-pro-write="lead.write" data-close-save={it.id} disabled={disabled||!!busy||!draft||draft===cur} onClick={()=>void save(it.kind,it.id,it.revision,false)}>{c.save}</Button>
      {it.closeOn&&<Button type="button" size="sm" variant="outline" data-pro-write="lead.write" data-close-clear={it.id} disabled={disabled||!!busy} onClick={()=>void save(it.kind,it.id,it.revision,true)}>{c.clear}</Button>}</div>
     {bad===k&&<p role="alert" className="mt-1 text-xs text-red-700">{c.invalid}</p>}</li>;})}</ul>}
  </>}
 </section>;
}
