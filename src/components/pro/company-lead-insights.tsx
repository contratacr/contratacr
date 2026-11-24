'use client';
import {useCallback,useEffect,useState} from 'react';
import {useLocale} from 'next-intl';
import {useAuth} from '@/hooks/use-auth';
import {Button} from '@/components/ui/button';
import {leadOriginMetricsSchema} from '@/lib/pro/lead-origins';
import {leadCenterPageSchema} from '@/lib/pro/lead-center';
import {crToday} from '@/lib/pro/payables';
import {funnelRows,insightPeriods,insightRanges,pctChange,sourceRows,type ChannelCount,type InsightRange} from '@/lib/pro/lead-insights';
import {leadOriginChannelName} from './lead-origin-editor';
import {leadStageName} from './lead-stages-editor';

/**
 * Area E row 19: "Lead insights" (Solicitudes) with period toggles, comparison with the previous period, top sources,
 * leads won and the funnel by stage. Everything comes from the lead data ContrataCR already keeps (channel, stage, won).
 * First-response time, estimated revenue and profit per lead are not recorded, so the page says so instead of inventing them.
 */
const card='min-w-0 space-y-3 rounded-2xl border border-[#d7e1ea] bg-white p-4 sm:p-5';
type Metrics=ReturnType<typeof leadOriginMetricsSchema.parse>;
async function metrics(actor:string,from:string,to:string):Promise<Metrics>{
 let after:string|null=null,fingerprint='',all:Metrics|null=null;
 for(let page=0;page<6;page++){
  const r:Response=await fetch('/api/pro/lead-commercial-progress?'+new URLSearchParams({view:'metrics',status:'active',from,to,...(after&&fingerprint?{after,atSnapshot:fingerprint}:{})}),{cache:'no-store',headers:{'X-Pro-Expected-Actor':actor}});
  if(!r.ok)throw Error();const data=leadOriginMetricsSchema.parse(await r.json());
  all=all?{...data,items:[...all.items,...data.items]}:data;fingerprint=data.fingerprint;after=data.nextCursor;if(!after)break;
 }
 return all!;
}
function InsightRequest({en}:{en:boolean}){
 const t=(es:string,english:string)=>en?english:es,[text,setText]=useState(''),[busy,setBusy]=useState(false),[state,setState]=useState<'idle'|'sent'|'error'>('idle');
 async function send(){
  if(text.trim().length<5||busy)return;setBusy(true);setState('idle');
  try{const r=await fetch('/api/pro/company-support',{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({subject:t('Resultados que necesito','Insights I need'),message:text.trim(),priority:'normal'})});
   if(!r.ok)throw Error();setState('sent');setText('');}catch{setState('error');}finally{setBusy(false);}
 }
 return <section data-lead-insights-request className="min-w-0 space-y-2 rounded-2xl border border-[#d7e1ea] bg-[#f3f8fb] p-4"><h3 className="font-bold">{t('¿Qué resultados necesita?','What insights do you need?')}</h3>
  <label className="block text-sm font-semibold">{t('Cuéntenos qué le gustaría medir','Tell us what you would like to measure')}<textarea data-lead-insights-request-text maxLength={1000} rows={3} value={text} onChange={e=>setText(e.target.value)} className="mt-1 block w-full min-w-0 rounded-xl border border-[#d7e1ea] bg-white p-3 text-base font-normal"/></label>
  <Button type="button" data-lead-insights-request-send className="min-h-11" disabled={busy||text.trim().length<5} onClick={()=>void send()}>{busy?t('Enviando…','Sending…'):t('Enviar','Submit')}</Button>
  {state==='sent'&&<p role="status" data-lead-insights-request-sent className="text-sm text-[#18573a]">{t('Gracias. Lo recibimos como un caso de soporte.','Thank you. We received it as a support case.')}</p>}
  {state==='error'&&<p role="alert" className="text-sm text-[#8a2a1b]">{t('No se pudo enviar. Reintente.','Could not send. Retry.')}</p>}</section>;
}
export function CompanyLeadInsights(){const {user}=useAuth();return user?<Insights key={user.id} actor={user.id}/>:null;}
function Insights({actor}:{actor:string}){
 const en=useLocale()==='en',t=(es:string,english:string)=>en?english:es;
 const [range,setRange]=useState<InsightRange>('6m'),[data,setData]=useState<{key:string;cur:Metrics;prev:Metrics;funnel:ReturnType<typeof leadCenterPageSchema.parse>}|null>(null),[failed,setFailed]=useState(false);
 const periods=insightPeriods(range,crToday());
 const load=useCallback(async()=>{
  setFailed(false);
  try{
   const p=insightPeriods(range,crToday());
   const [cur,prev,list]=await Promise.all([metrics(actor,p.current.from,p.current.to),metrics(actor,p.previous.from,p.previous.to),
    fetch('/api/pro/lead-commercial-progress?'+new URLSearchParams({view:'list',status:'active'}),{cache:'no-store',headers:{'X-Pro-Expected-Actor':actor}}).then(r=>{if(!r.ok)throw Error();return r.json();})]);
   setData({key:range,cur,prev,funnel:leadCenterPageSchema.parse((list as {page:unknown}).page)});
  }catch{setFailed(true);}
 },[actor,range]);
 useEffect(()=>{const timer=setTimeout(()=>void load(),0);return()=>clearTimeout(timer);},[load]);
 const label={'1m':t('1 mes','1 month'),'3m':t('3 meses','3 months'),'6m':t('6 meses','6 months'),'1y':t('1 año','1 year')};
 const fmt=new Intl.DateTimeFormat(en?'en-US':'es-CR',{dateStyle:'medium',timeZone:'UTC'}),day=(s:string)=>fmt.format(new Date(s+'T00:00:00Z'));
 const pct=(v:number|null)=>v===null?t('Nuevo','New'):(v>0?'+':'')+v.toLocaleString(en?'en-US':'es-CR')+'%';
 const toggles=<div role="group" aria-label={t('Período','Period')} className="flex max-w-full gap-1 overflow-x-auto rounded-xl bg-[#e9eff5] p-1">{insightRanges.map(r=><button key={r} type="button" data-lead-insights-range={r} aria-pressed={range===r} onClick={()=>setRange(r)} className={`min-h-11 shrink-0 rounded-lg px-3 text-sm font-semibold ${range===r?'bg-white text-[#008bb5] shadow-sm':'text-[#52627a]'}`}>{label[r]}</button>)}</div>;
 let body:React.ReactNode;
 if(failed)body=<div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-red-700"><span>{t('No se pudo cargar.','Could not load.')}</span><Button type="button" variant="secondary" onClick={()=>void load()}>{t('Reintentar','Retry')}</Button></div>;
 else if(!data||data.key!==range)body=<p role="status" className="text-sm text-[#52627a]">{t('Cargando…','Loading…')}</p>;
 else{
  const name=(c:Metrics['items'][number])=>leadOriginChannelName(c.channel,en),toRows=(m:Metrics):ChannelCount[]=>m.items.map(c=>({id:c.channel?.id??null,name:name(c),total:c.total,won:c.won}));
  const rows=sourceRows(toRows(data.cur),toRows(data.prev)),wonRows=toRows(data.cur).filter(r=>r.won>0).sort((a,b)=>b.won-a.won||a.name.localeCompare(b.name,'es')),total=data.cur.totals.total,won=data.cur.totals.won,pTotal=data.prev.totals.total,pWon=data.prev.totals.won;
  const stages=data.funnel.catalog.stages,funnel=funnelRows(stages,data.funnel.counts,id=>{const s=stages.find(x=>x.id===id);return s?leadStageName(s,en):id;});
  const kpi=(key:string,title:string,value:number,prev:number)=><li data-lead-insights-kpi={key} className="rounded-xl bg-[#f7f9fc] p-3 text-sm"><span className="text-[#52627a]">{title}</span><span className="block text-2xl font-bold tabular-nums">{value}</span><span data-lead-insights-change className="text-xs text-[#52627a]">{t('Período anterior','Previous period')}: {prev} · {pct(pctChange(value,prev))}</span></li>;
  body=<>
   <p data-lead-insights-period className="text-sm text-[#52627a]">{day(periods.current.from)} - {day(periods.current.to)} · {t('Comparado con el período anterior','Compared to the previous period')}: {day(periods.previous.from)} - {day(periods.previous.to)}</p>
   {!total&&!pTotal?<div data-lead-insights-empty className="space-y-2 rounded-2xl border border-dashed border-[#d7e1ea] bg-[#f7f9fc] p-4 text-sm"><p className="font-semibold">{t('Aún no hay solicitudes en estos períodos.','There are no leads in these periods yet.')}</p><p className="text-[#52627a]">{t('Cuando reciba solicitudes verá aquí de dónde vienen, cuántas gana y en qué etapa están.','When you receive leads you will see here where they come from, how many you win and which stage they are in.')}</p></div>:null}
   <ul className="grid gap-2 sm:grid-cols-2">{kpi('total',t('Solicitudes totales','Total leads'),total,pTotal)}{kpi('won',t('Solicitudes ganadas','Leads won'),won,pWon)}</ul>
   <section className={card} data-lead-insights-sources aria-labelledby="li-src"><h3 id="li-src" className="font-bold">{t('Principales canales','Top lead sources')}</h3>
    {rows.length?<div className="overflow-x-auto"><table className="w-full min-w-[30rem] text-left text-sm"><thead><tr className="text-[#52627a]"><th className="py-1 pr-2">{t('Canal','Source')}</th><th className="px-2">{t('Solicitudes','Leads')}</th><th className="px-2">{t('Período anterior','Previous period')}</th><th className="px-2">{t('Cambio','% change')}</th><th className="px-2">{t('Ganadas','Won')}</th></tr></thead>
     <tbody>{rows.map(r=><tr key={r.id??'unspecified'} data-lead-insights-source={r.id??'unspecified'} className="border-t border-[#e3eaf0]"><td className="py-2 pr-2 font-semibold">{r.name}</td><td className="px-2 tabular-nums">{r.total}</td><td className="px-2 tabular-nums">{r.previous}</td><td className="px-2 tabular-nums">{pct(r.change)}</td><td className="px-2 tabular-nums">{r.won}</td></tr>)}</tbody></table></div>:<p className="text-sm text-[#52627a]">{t('Sin solicitudes en este período.','No leads in this period.')}</p>}</section>
   <section className={card} data-lead-insights-won aria-labelledby="li-won"><h3 id="li-won" className="font-bold">{t('Ganadas por canal','Leads won by source')}</h3>
    {wonRows.length?<ul className="space-y-1 text-sm">{wonRows.map(r=><li key={r.id??'unspecified'} className="flex justify-between gap-2 rounded-xl bg-[#f7f9fc] p-2"><span className="min-w-0 break-words">{r.name}</span><strong className="tabular-nums">{r.won}</strong></li>)}</ul>:<p className="text-sm text-[#52627a]">{t('Aún no hay solicitudes ganadas en este período.','No leads won in this period yet.')}</p>}</section>
   <section className={card} data-lead-insights-funnel aria-labelledby="li-fun"><h3 id="li-fun" className="font-bold">{t('Embudo por etapa','Conversion funnel by stage')}</h3>
    <p className="text-xs text-[#52627a]">{t('Según la etapa en que está hoy cada solicitud activa. Una solicitud cuenta en su etapa y en las anteriores.','Based on the stage each active lead is in today. A lead counts in its stage and the earlier ones.')}</p>
    <div className="overflow-x-auto"><table className="w-full min-w-[26rem] text-left text-sm"><thead><tr className="text-[#52627a]"><th className="py-1 pr-2">{t('Etapa','Lead stage')}</th><th className="px-2">{t('En la etapa','In stage')}</th><th className="px-2">{t('Llegaron','Reached')}</th><th className="px-2">{t('Conversión','Conversion rate')}</th></tr></thead>
     <tbody>{funnel.map(r=><tr key={r.stageId} data-lead-insights-stage={r.stageId} className="border-t border-[#e3eaf0]"><td className="py-2 pr-2 font-semibold">{r.name}</td><td className="px-2 tabular-nums">{r.leads}</td><td className="px-2 tabular-nums">{r.reached}</td><td className="px-2"><span className="tabular-nums">{r.rate.toLocaleString(en?'en-US':'es-CR')}%</span><span aria-hidden="true" className="mt-1 block h-1.5 rounded-full bg-[#e9eff5]"><span className="block h-full rounded-full bg-[#0089bb]" style={{width:Math.min(100,r.rate)+'%'}}/></span></td></tr>)}</tbody></table></div></section>
   <p data-lead-insights-note className="text-xs text-[#52627a]">{t('ContrataCR no registra el tiempo de primera respuesta, los ingresos estimados ni la utilidad por solicitud, por eso no se muestran.','ContrataCR does not record time to first response, estimated revenue or profit per lead, so they are not shown.')}</p>
  </>;
 }
 return <section data-lead-insights className="min-w-0 space-y-4"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-lg font-bold">{t('Resultados de solicitudes','Lead insights')}</h3>{toggles}</div>{body}<InsightRequest en={en}/></section>;
}
