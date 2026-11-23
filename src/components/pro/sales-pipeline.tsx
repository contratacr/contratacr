'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {useLocale} from 'next-intl';
import {Button} from '@/components/ui/button';
import {Modal} from '@/components/ui/modal';
import {crTodayISO} from '@/lib/time-cr';
import {proMoney} from '@/lib/pro/money';
import {durationLabel,leadStageHistorySchema,pipelineForecastSchema,stageColorTokens,stageColors,stageFunnelSchema,stageSettingsResultSchema,stageSettingsSchema,
 type LeadStageHistory,type PipelineForecast,type StageColor,type StageFunnel,type StageSetting,type StageSettings} from '@/lib/pro/sales-pipeline';
import type {BoardCard} from '@/lib/pro/round10';
import {LeadBoardView} from './round10-sales';
import {StageRules} from './stage-rules';
import {CloseDateForecast} from './close-forecast';
import {leadStageName} from './lead-stages-editor';
import {LeadOriginFilter} from './lead-origin-filter';
import {downloadFile} from './exports';

/**
 * Ronda F2-B (rows 07, 08): stage colours and win probability, weighted forecast over the board, time in
 * stage per lead and the funnel by stage reached. SQL decides; each write keeps its actionId until confirmed.
 */
const COPY={
 es:{forecastTitle:'Previsión del embudo',open:'Abierto en el embudo',weighted:'Previsión ponderada',won:'Ganado',wonCount:'Ganadas',noValue:(n:number)=>n===1?'1 solicitud sin valor estimado':`${n} solicitudes sin valor estimado`,
  weightedHelp:'Valor estimado de cada oportunidad abierta por la probabilidad de su etapa. No es un cobro ni una factura.',styleOpen:'Colores y probabilidad',funnelOpen:'Embudo por etapa',
  styleTitle:'Colores y probabilidad',styleIntro:'El color identifica la etapa en el tablero. La probabilidad (0 a 100 %) calcula la previsión ponderada.',manage:'Agregar, renombrar, ordenar o archivar etapas',
  color:'Color',probability:'Probabilidad de ganar',save:'Guardar',saved:(n:string)=>`Se guardó "${n}".`,reset:'Usar valores sugeridos',changed:'Las etapas cambiaron en otra pestaña. Se recargaron.',failed:'No se pudo guardar. Reintente: no se duplicará.',
  loading:'Cargando…',loadFailed:'No se pudo cargar.',retry:'Reintentar',close:'Cerrar',hidden:'Oculta',custom:'Personalizado',suggested:'Sugerido',
  historyBtn:'Etapas',historyTitle:(t:string)=>`Historial de etapas de "${t}"`,historyIntro:'Cuándo entró y salió de cada etapa y cuánto tiempo estuvo.',now:'Hasta ahora',entered:'Entró',left:'Salió',time:'Tiempo en la etapa',
  source:{created:'Al crearse',moved:'Movida',observed:'Cambio automático',backfill:'Registro anterior'},backfillNote:'Las solicitudes anteriores a este registro empiezan con su etapa actual.',
  funnelTitle:'Embudo por etapa',funnelIntro:'Solicitudes recibidas en el período (fecha de Costa Rica): cuántas llegaron a cada etapa, la conversión y el tiempo que pasan en ella.',from:'Desde',to:'Hasta',channel:'Canal',
  received:'Recibidas',reached:'Llegaron',fromStart:'Desde el inicio',fromPrevious:'De la etapa anterior',current:'Ahora',avg:'Tiempo promedio',median:'Mediana',lost:'Perdidas',jobs:'Trabajos',csv:'Descargar CSV para Excel',
  funnelNote:'"Llegaron" cuenta la etapa más avanzada registrada, la actual y las conversiones explícitas a trabajo.',stage:'Etapa',perStage:(n:number)=>n===1?'1 solicitud':`${n} solicitudes`,prob:(p:number)=>`${p} %`},
 en:{forecastTitle:'Pipeline forecast',open:'Open in the pipeline',weighted:'Weighted forecast',won:'Won',wonCount:'Won',noValue:(n:number)=>n===1?'1 lead without an estimated value':`${n} leads without an estimated value`,
  weightedHelp:'Estimated value of each open opportunity times the probability of its stage. It is not a payment or an invoice.',styleOpen:'Colours and probability',funnelOpen:'Funnel by stage',
  styleTitle:'Colours and probability',styleIntro:'The colour identifies the stage on the board. The probability (0 to 100%) drives the weighted forecast.',manage:'Add, rename, reorder or archive stages',
  color:'Colour',probability:'Win probability',save:'Save',saved:(n:string)=>`"${n}" was saved.`,reset:'Use suggested values',changed:'The stages changed in another tab. They were reloaded.',failed:'Could not save. Retry: it will not be duplicated.',
  loading:'Loading…',loadFailed:'Could not load.',retry:'Retry',close:'Close',hidden:'Hidden',custom:'Custom',suggested:'Suggested',
  historyBtn:'Stages',historyTitle:(t:string)=>`Stage history of "${t}"`,historyIntro:'When it entered and left each stage and how long it stayed.',now:'Until now',entered:'Entered',left:'Left',time:'Time in stage',
  source:{created:'When created',moved:'Moved',observed:'Automatic change',backfill:'Earlier record'},backfillNote:'Leads older than this record start with their current stage.',
  funnelTitle:'Funnel by stage',funnelIntro:'Leads received in the period (Costa Rica date): how many reached each stage, the conversion and the time they spend in it.',from:'From',to:'To',channel:'Channel',
  received:'Received',reached:'Reached',fromStart:'From start',fromPrevious:'From previous stage',current:'Now',avg:'Average time',median:'Median',lost:'Lost',jobs:'Jobs',csv:'Download CSV for Excel',
  funnelNote:'"Reached" counts the furthest recorded stage, the current one and explicit conversions to a job.',stage:'Stage',perStage:(n:number)=>n===1?'1 lead':`${n} leads`,prob:(p:number)=>`${p}%`},
};
const colorNames:Record<'es'|'en',Record<StageColor,string>>={
 es:{slate:'Gris',blue:'Azul',cyan:'Celeste',teal:'Turquesa',green:'Verde',lime:'Lima',amber:'Ámbar',orange:'Naranja',red:'Rojo',pink:'Rosado',violet:'Violeta',indigo:'Índigo'},
 en:{slate:'Grey',blue:'Blue',cyan:'Sky',teal:'Teal',green:'Green',lime:'Lime',amber:'Amber',orange:'Orange',red:'Red',pink:'Pink',violet:'Violet',indigo:'Indigo'},
};
export function salesPipelineCopy(locale:string){return locale in COPY?COPY[locale as 'es'|'en']:COPY.es;}
const field='mt-1 min-h-11 w-full rounded-xl border border-[#d7e1ea] bg-white px-3 text-base text-[#162543]';
async function get(url:string,actor:string){const r=await fetch(url,{cache:'no-store',headers:{'X-Pro-Expected-Actor':actor}});if(!r.ok)throw Error(String(r.status));return r.json();}
async function post(url:string,actor:string,body:unknown){const r=await fetch(url,{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json','X-Pro-Expected-Actor':actor},body:JSON.stringify(body)});let data:unknown=null;try{data=await r.json();}catch{}return {status:r.status,ok:r.ok,data};}
function useLang(){const l=useLocale()==='en'?'en':'es';return {lang:l as 'es'|'en',c:COPY[l],en:l==='en'};}
export function stageLabel(s:StageSetting,en:boolean){return leadStageName({id:s.id,builtin:s.builtin,name:s.name,position:s.position,hidden:s.hidden,reassignToId:null},en);}
function money(cents:number,currency:string,en:boolean){return currency==='USD'?new Intl.NumberFormat(en?'en-US':'es-CR',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(cents/100):proMoney(cents/100,en);}
function pct(v:number|null,en:boolean){return v===null?'—':new Intl.NumberFormat(en?'en-US':'es-CR',{maximumFractionDigits:1}).format(v)+(en?'%':' %');}
function Dot({color,size=10}:{color:StageColor;size?:number}){return <span aria-hidden className="inline-block shrink-0 rounded-full" style={{width:size,height:size,background:stageColorTokens[color].bar}}/>;}

// ===================== Board with forecast =====================
export function SalesPipelineBoard({actor,disabled,onOpen,onChanged,onManageStages}:{actor:string;disabled:boolean;onOpen:(card:BoardCard)=>void;onChanged?:()=>void;onManageStages:()=>void}){
 const {c,en}=useLang();
 const [settings,setSettings]=useState<StageSettings|null>(null),[forecast,setForecast]=useState<PipelineForecast|null>(null),[error,setError]=useState(false),[styleOpen,setStyleOpen]=useState(false),[history,setHistory]=useState<BoardCard|null>(null),seq=useRef(0);
 const load=useCallback(async()=>{const n=++seq.current;try{setError(false);const [s,f]=await Promise.all([get('/api/pro/lead-pipeline?view=settings',actor),get('/api/pro/lead-pipeline?view=forecast',actor)]);
  if(n===seq.current){setSettings(stageSettingsSchema.parse(s));setForecast(pipelineForecastSchema.parse(f));}}catch{if(n===seq.current)setError(true);}},[actor]);
 useEffect(()=>{const timer=setTimeout(()=>void load(),0);return()=>clearTimeout(timer);},[load]);
 const meta=settings&&forecast?Object.fromEntries(settings.stages.map(s=>{const f=forecast.stages.find(x=>x.stageId===s.id);return [s.id,{color:s.color,probability:s.probability,
  weighted:f&&f.values.length?f.values.map(v=>money(v.weightedCents,v.currency,en)).join(' + '):null,avg:f?.avgHours??null}];})):undefined;
 return <div data-sales-pipeline className="min-w-0 space-y-3">
  <section data-pipeline-forecast aria-label={c.forecastTitle} className="min-w-0 rounded-2xl border border-[#d7e1ea] bg-white p-4">
   <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h3 className="text-base font-bold text-[#162543]">{c.forecastTitle}</h3><p className="mt-0.5 max-w-prose text-xs text-[#52627a]">{c.weightedHelp}</p></div>
    <Button type="button" variant="outline" size="sm" data-pipeline-style-open disabled={!settings} onClick={()=>setStyleOpen(true)}>{c.styleOpen}</Button></div>
   {error&&<p role="alert" className="mt-3 text-sm">{c.loadFailed} <Button variant="outline" size="sm" onClick={()=>void load()}>{c.retry}</Button></p>}
   {!forecast&&!error&&<p role="status" className="mt-3 text-sm text-[#52627a]">{c.loading}</p>}
   {forecast&&<div className="mt-3 grid gap-2 sm:grid-cols-3">
    {[{k:'open',label:c.open,v:(t:PipelineForecast['totals'][number])=>t.openCents},{k:'weighted',label:c.weighted,v:(t:PipelineForecast['totals'][number])=>t.weightedCents},{k:'won',label:c.won,v:(t:PipelineForecast['totals'][number])=>t.wonCents}].map(x=>
     <div key={x.k} data-pipeline-total={x.k} className={`min-w-0 rounded-xl px-3 py-2.5 ${x.k==='weighted'?'bg-[#eaf7fb]':'bg-[#f7f9fc]'}`}><p className="text-xs font-semibold text-[#52627a]">{x.label}</p>
      <p className="mt-0.5 break-words text-lg font-bold text-[#162543]">{forecast.totals.length?forecast.totals.map(t=>money(x.v(t),t.currency,en)).join(' · '):money(0,'CRC',en)}</p></div>)}
   </div>}
   {forecast&&forecast.withoutValue>0&&<p className="mt-2 text-xs text-[#52627a]" data-pipeline-without-value>{c.noValue(forecast.withoutValue)}</p>}
  </section>
  <CloseDateForecast actor={actor} settings={settings} disabled={disabled}/>
  <StageRules actor={actor} settings={settings} disabled={disabled}/>
  <LeadBoardView actor={actor} disabled={disabled} onOpen={onOpen} stageMeta={meta} onHistory={setHistory} onChanged={()=>{void load();onChanged?.();}}/>
  {styleOpen&&settings&&<StageStyleDialog actor={actor} initial={settings} onClose={()=>setStyleOpen(false)} onSaved={()=>void load()} onManageStages={()=>{setStyleOpen(false);onManageStages();}}/>}
  {history&&settings&&<LeadStageHistoryDialog actor={actor} card={history} settings={settings} onClose={()=>setHistory(null)}/>}
 </div>;
}

// ===================== Stage colour and probability =====================
function StageStyleDialog({actor,initial,onClose,onSaved,onManageStages}:{actor:string;initial:StageSettings;onClose:()=>void;onSaved:()=>void;onManageStages:()=>void}){
 const {c,lang,en}=useLang();
 const [settings,setSettings]=useState(initial),[drafts,setDrafts]=useState<Record<string,{color:StageColor;probability:string}>>({}),[busy,setBusy]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState(''),pending=useRef<Record<string,{key:string;actionId:string}>>({});
 const draft=(s:StageSetting)=>drafts[s.id]??{color:s.color,probability:String(s.probability)};
 async function reload(){try{setSettings(stageSettingsSchema.parse(await get('/api/pro/lead-pipeline?view=settings',actor)));setDrafts({});}catch{setError(c.loadFailed);}}
 async function save(s:StageSetting,reset=false){const d=draft(s),p=Number(d.probability);if(!reset&&(!/^\d{1,3}$/.test(d.probability)||p>100))return;
  const body=reset?{action:'reset',revision:settings.revision,stageId:s.id}:{action:'style',revision:settings.revision,stageId:s.id,color:d.color,probability:p},key=JSON.stringify(body);
  if(pending.current[s.id]?.key!==key)pending.current[s.id]={key,actionId:crypto.randomUUID()};
  setBusy(s.id);setError('');setNotice('');
  try{const r=await post('/api/pro/lead-pipeline',actor,{...body,actionId:pending.current[s.id].actionId});
   if(r.status===409){delete pending.current[s.id];setError(c.changed);await reload();return;}if(!r.ok)throw Error();
   const res=stageSettingsResultSchema.parse(r.data);delete pending.current[s.id];
   setSettings(v=>({...v,revision:res.revision,stages:v.stages.map(x=>x.id===s.id?res.stage:x)}));setDrafts(v=>{const n={...v};delete n[s.id];return n;});setNotice(c.saved(stageLabel(s,en)));onSaved();
  }catch{setError(c.failed);}finally{setBusy('');}}
 return <Modal manageFocus open size="lg" title={c.styleTitle} ariaLabel={c.styleTitle} closeLabel={c.close} onClose={onClose}>
  <section data-pipeline-style className="min-w-0 space-y-4"><p className="text-sm text-[#52627a]">{c.styleIntro}</p>
   <Button type="button" variant="outline" data-pipeline-manage-stages onClick={onManageStages}>{c.manage}</Button>
   {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}{notice&&<p role="status" data-pipeline-style-notice className="text-sm text-[#1f6f43]">{notice}</p>}
   <ul className="space-y-3">{settings.stages.map(s=>{const d=draft(s),dirty=d.color!==s.color||d.probability!==String(s.probability),invalid=!/^\d{1,3}$/.test(d.probability)||Number(d.probability)>100,name=stageLabel(s,en);
    return <li key={s.id} data-pipeline-style-stage={s.id} className="min-w-0 rounded-2xl border border-[#d7e1ea] bg-white p-3" style={{borderLeft:`6px solid ${stageColorTokens[d.color].bar}`}}>
     <div className="flex flex-wrap items-center justify-between gap-2"><p className="flex min-w-0 items-center gap-2 font-semibold"><Dot color={d.color}/><span className="truncate">{name}</span>{s.hidden&&<span className="rounded-full bg-[#eef2f6] px-2 text-xs font-normal">{c.hidden}</span>}</p>
      <span className="text-xs text-[#52627a]">{s.customized?c.custom:c.suggested}</span></div>
     <fieldset className="mt-2 min-w-0"><legend className="text-xs font-semibold text-[#52627a]">{c.color}</legend>
      <div className="mt-1 flex flex-wrap gap-1.5" role="radiogroup" aria-label={`${c.color}: ${name}`}>{stageColors.map(k=><button key={k} type="button" role="radio" aria-checked={d.color===k} aria-label={colorNames[lang][k]} title={colorNames[lang][k]} data-pipeline-color={k}
       className={`flex h-9 w-9 items-center justify-center rounded-full border-2 ${d.color===k?'border-[#162543]':'border-transparent'}`} onClick={()=>setDrafts(v=>({...v,[s.id]:{...d,color:k}}))}><span className="block h-6 w-6 rounded-full" style={{background:stageColorTokens[k].bar}}/></button>)}</div></fieldset>
     <div className="mt-2 flex flex-wrap items-end gap-2"><label className="block min-w-0 text-xs font-semibold text-[#52627a]">{c.probability}<span className="mt-1 flex items-center gap-1"><input data-pipeline-probability={s.id} inputMode="numeric" className="min-h-11 w-20 rounded-xl border border-[#d7e1ea] bg-white px-3 text-base text-[#162543]" value={d.probability} aria-invalid={invalid}
       onChange={e=>setDrafts(v=>({...v,[s.id]:{...d,probability:e.target.value.replace(/[^0-9]/g,'').slice(0,3)}}))}/><span className="text-sm text-[#162543]">%</span></span></label>
      <Button type="button" size="sm" data-pro-write="lead.write" data-pipeline-style-save={s.id} disabled={!dirty||invalid||!!busy} onClick={()=>void save(s)}>{c.save}</Button>
      {s.customized&&<Button type="button" size="sm" variant="outline" data-pro-write="lead.write" data-pipeline-style-reset={s.id} disabled={!!busy} onClick={()=>void save(s,true)}>{c.reset}</Button>}</div>
    </li>;})}</ul>
  </section>
 </Modal>;
}

// ===================== Time in stage per lead =====================
function LeadStageHistoryDialog({actor,card,settings,onClose}:{actor:string;card:BoardCard;settings:StageSettings;onClose:()=>void}){
 const {c,lang,en}=useLang();const [data,setData]=useState<LeadStageHistory|null>(null),[error,setError]=useState(false);
 const load=useCallback(async()=>{try{setError(false);setData(leadStageHistorySchema.parse(await get('/api/pro/lead-pipeline?'+new URLSearchParams({view:'lead',kind:card.kind,id:card.id}),actor)));}catch{setError(true);}},[actor,card]);
 useEffect(()=>{const timer=setTimeout(()=>void load(),0);return()=>clearTimeout(timer);},[load]);
 const when=(iso:string)=>new Intl.DateTimeFormat(en?'en-US':'es-CR',{dateStyle:'medium',timeStyle:'short',timeZone:'America/Costa_Rica'}).format(new Date(iso));
 const stage=(id:string)=>settings.stages.find(s=>s.id===id);
 const title=c.historyTitle(card.title||'—');
 return <Modal manageFocus open size="md" title={title} ariaLabel={title} closeLabel={c.close} onClose={onClose}>
  <section data-lead-stage-history className="min-w-0 space-y-3"><p className="text-sm text-[#52627a]">{c.historyIntro}</p>
   {error&&<p role="alert" className="text-sm">{c.loadFailed} <Button variant="outline" size="sm" onClick={()=>void load()}>{c.retry}</Button></p>}
   {!data&&!error&&<p role="status" className="text-sm text-[#52627a]">{c.loading}</p>}
   {data&&<ol className="relative space-y-0">{[...data.spans].reverse().map((s,i,all)=>{const st=stage(s.stageId),color=st?.color??'slate';return <li key={s.seq} data-lead-stage-span={s.stageId} className="relative flex gap-3 pb-4">
     <span className="flex w-4 shrink-0 flex-col items-center"><span className="mt-1.5 block h-3 w-3 rounded-full ring-4" style={{background:stageColorTokens[color].bar,['--tw-ring-color' as string]:stageColorTokens[color].soft}}/>{i<all.length-1&&<span className="mt-1 block w-px flex-1 bg-[#d7e1ea]"/>}</span>
     <div className="min-w-0 flex-1 rounded-xl px-3 py-2" style={{background:stageColorTokens[color].soft}}>
      <p className="flex flex-wrap items-baseline justify-between gap-x-3 font-semibold" style={{color:stageColorTokens[color].text}}><span>{st?stageLabel(st,en):s.stageId}</span><span data-lead-stage-duration className="text-sm text-[#162543]">{durationLabel(s.hours,lang)}</span></p>
      <p className="mt-0.5 text-xs text-[#52627a]">{c.entered}: {when(s.enteredAt)} · {s.leftAt?`${c.left}: ${when(s.leftAt)}`:c.now} · {c.source[s.source]}</p></div></li>;})}</ol>}
   {data?.spans.some(s=>s.source==='backfill')&&<p className="text-xs text-[#52627a]">{c.backfillNote}</p>}
  </section>
 </Modal>;
}

// ===================== Funnel by stage reached =====================
export function StageFunnelDialog({actor,onClose}:{actor:string;onClose:()=>void}){
 const {c,lang,en}=useLang(),today=crTodayISO();
 const [from,setFrom]=useState(today.slice(0,8)+'01'),[to,setTo]=useState(today),[channel,setChannel]=useState(''),[report,setReport]=useState<StageFunnel|null>(null),[settings,setSettings]=useState<StageSettings|null>(null),[error,setError]=useState(false),[busy,setBusy]=useState(false),seq=useRef(0);
 const params=useCallback(()=>{const p=new URLSearchParams({view:'funnel',from,to});if(channel)p.set('channel',channel);return p;},[from,to,channel]);
 const load=useCallback(async()=>{const n=++seq.current;setError(false);if(!from||!to||from>to)return;try{const [r,s]=await Promise.all([get('/api/pro/lead-pipeline?'+params(),actor),get('/api/pro/lead-pipeline?view=settings',actor)]);
  if(n===seq.current){setReport(stageFunnelSchema.parse(r));setSettings(stageSettingsSchema.parse(s));}}catch{if(n===seq.current){setReport(null);setError(true);}}},[actor,from,to,params]);
 useEffect(()=>{const timer=setTimeout(()=>void load(),0);return()=>clearTimeout(timer);},[load]);
 const stage=(id:string)=>settings?.stages.find(s=>s.id===id);
 async function csv(){if(!settings)return;setBusy(true);try{const p=params();p.set('format','csv');p.set('lang',lang);p.set('names',JSON.stringify(Object.fromEntries(settings.stages.map(s=>[s.id,stageLabel(s,en)]))));
  const r=await fetch('/api/pro/lead-pipeline?'+p,{cache:'no-store',headers:{'X-Pro-Expected-Actor':actor}});if(!r.ok)throw Error();await downloadFile(await r.text(),`${en?'funnel':'embudo'}-${from}-${to}.csv`,'text/csv;charset=utf-8');}catch{setError(true);}finally{setBusy(false);}}
 const max=Math.max(1,report?.received??1);
 return <Modal manageFocus open size="lg" title={c.funnelTitle} ariaLabel={c.funnelTitle} closeLabel={c.close} onClose={onClose}>
  <section data-stage-funnel className="min-w-0 space-y-4"><p className="text-sm text-[#52627a]">{c.funnelIntro}</p>
   <div className="grid gap-3 sm:grid-cols-3"><label className="block text-sm font-semibold">{c.from}<input type="date" data-stage-funnel-from className={field} value={from} max={to} onChange={e=>setFrom(e.target.value)}/></label>
    <label className="block text-sm font-semibold">{c.to}<input type="date" data-stage-funnel-to className={field} value={to} min={from} onChange={e=>setTo(e.target.value)}/></label>
    <div className="min-w-0 text-sm" data-stage-funnel-channel><span className="block font-semibold">{c.channel}</span><div className="mt-1 min-w-0">{<LeadOriginFilter actor={actor} value={channel} blocked={false} onChange={setChannel}/>}</div></div></div>
   {error&&<p role="alert" className="text-sm">{c.loadFailed} <Button variant="outline" size="sm" onClick={()=>void load()}>{c.retry}</Button></p>}
   {!report&&!error&&<p role="status" className="text-sm text-[#52627a]">{c.loading}</p>}
   {report&&<>
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{[['received',c.received,report.received],['won',c.wonCount,report.won],['lost',c.lost,report.lost],['converted',c.jobs,report.converted]].map(([k,l,v])=>
     <div key={k as string} data-stage-funnel-total={k as string} className="rounded-xl bg-[#f7f9fc] px-3 py-2"><p className="text-xs font-semibold text-[#52627a]">{l}</p><p className="text-xl font-bold text-[#162543]">{v}</p></div>)}</div>
    <ol className="space-y-2" aria-label={c.funnelTitle}>{report.stages.map(s=>{const st=stage(s.stageId),color=st?.color??'slate',w=Math.max(s.reached?6:0,s.reached*100/max);
     return <li key={s.stageId} data-stage-funnel-row={s.stageId} className="min-w-0 rounded-xl border border-[#eef2f6] p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1"><p className="flex min-w-0 items-center gap-2 font-semibold"><Dot color={color}/><span className="truncate">{st?stageLabel(st,en):s.stageId}</span></p>
       <p className="text-sm"><span data-stage-funnel-reached className="font-bold">{s.reached}</span> <span className="text-[#52627a]">{c.reached.toLowerCase()} · {pct(s.fromStart,en)}</span></p></div>
      <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-[#eef2f6]"><div className="h-full rounded-full" style={{width:`${w}%`,background:stageColorTokens[color].bar}}/></div>
      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-[#52627a] sm:grid-cols-4"><div><dt>{c.fromPrevious}</dt><dd data-stage-funnel-previous className="font-semibold text-[#162543]">{pct(s.fromPrevious,en)}</dd></div>
       <div><dt>{c.current}</dt><dd className="font-semibold text-[#162543]">{c.perStage(s.current)}</dd></div><div><dt>{c.avg}</dt><dd data-stage-funnel-avg className="font-semibold text-[#162543]">{durationLabel(s.avgHours,lang)}</dd></div>
       <div><dt>{c.median}</dt><dd className="font-semibold text-[#162543]">{durationLabel(s.medianHours,lang)}</dd></div></dl></li>;})}</ol>
    <p className="text-xs text-[#52627a]">{c.funnelNote}{report.backfilled>0?' '+c.backfillNote:''}</p>
    <Button type="button" variant="outline" data-stage-funnel-csv disabled={busy} onClick={()=>void csv()}>{c.csv}</Button></>}
  </section>
 </Modal>;
}
