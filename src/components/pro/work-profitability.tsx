'use client';

import {useCallback,useEffect,useRef,useState} from 'react';
import {useLocale} from 'next-intl';
import {Button} from '@/components/ui/button';
import {proMoney} from '@/lib/pro/money';
import {percentToBp,profitTargetMutationSchema,profitTargetResultSchema,workProfitabilitySchema,type WorkProfitability} from '@/lib/pro/work-profitability';

/**
 * Row 23: «Profitability» block of the job budget view. Agreed amount (before VAT when known) against real costs,
 * purchase-order commitments, approved changes and the budget estimate at completion; margin now, projected margin at close and
 * alerts. The minimum margin that raises the low-margin alert is the owner's setting (CAS + idempotent). Read only otherwise.
 */
const api='/api/pro/work-profitability',field='mt-1 block min-h-11 w-full min-w-0 rounded-xl border border-[#d7e1ea] bg-white px-3 text-base font-normal';
function copy(en:boolean){return en?{
 title:'Profitability',intro:'What you agreed to charge against what the job costs and is expected to cost until it closes.',
 agreed:'Agreed (before VAT)',agreedAsIs:'Agreed (VAT not itemized)',changes:'Approved changes included',pendingChanges:(n:number,v:string)=>`${n===1?'1 change':n+' changes'} awaiting approval (${v}) are not counted`,
 withProposed:'Projected margin if the changes awaiting approval are accepted',withProposedNote:'Adds only their price. Their extra cost counts once it is recorded as a cost or a purchase order.',
 estimatedCost:'Estimated cost (budget)',estimatedMargin:'Estimated margin',actual:'Real cost',committed:'Committed in purchase orders',allowances:'Allowances still to choose',
 projectedCost:'Projected cost at close',marginNow:'Margin today',marginProjected:'Projected margin at close',consumed:'Cost already spent',none:'Not set',
 basis:'Projected cost = the higher of (real + committed) and the budget estimate at completion, plus allowances still to choose.',
 target:'Minimum margin for the alert',save:'Save',saving:'Saving…',invalid:'Enter a percentage between 0 and 100.',saved:'Minimum margin saved.',
 conflict:'The setting changed. Reloaded: review and try again.',failed:'Could not confirm. Retry the same operation: it is never applied twice.',retry:'Retry the same operation',
 loadError:'Could not calculate the profitability.',reload:'Retry',loading:'Calculating…',
 alerts:{loss:'The projected cost is above what was agreed: the job is expected to lose money.',low_margin:(p:string)=>`The projected margin (${p}) is below your minimum.`,no_agreed:'There is no agreed amount yet, so the margin cannot be calculated. Accept a quote or set the amount in Costs & payments.',
  cost_over_estimate:'The projected cost is above the estimated cost of the budget.',over_lines:(n:number)=>n===1?'1 budget line is expected to exceed its planned cost.':`${n} budget lines are expected to exceed their planned cost.`,incomplete:'Some time has no hourly cost, so the real cost is incomplete.'},
}:{
 title:'Rentabilidad',intro:'Lo que acordó cobrar frente a lo que cuesta el trabajo y lo que se espera que cueste hasta cerrarlo.',
 agreed:'Acordado (sin IVA)',agreedAsIs:'Acordado (IVA no desglosado)',changes:'Cambios aprobados incluidos',pendingChanges:(n:number,v:string)=>`${n===1?'1 cambio':n+' cambios'} por aprobar (${v}) no se cuentan`,
 withProposed:'Margen proyectado si se aprueban los cambios por aprobar',withProposedNote:'Suma solo su precio. Su costo adicional cuenta cuando se registra como costo u orden de compra.',
 estimatedCost:'Costo estimado (presupuesto)',estimatedMargin:'Margen estimado',actual:'Costo real',committed:'Comprometido en órdenes de compra',allowances:'Montos previstos por elegir',
 projectedCost:'Costo proyectado al cierre',marginNow:'Margen hoy',marginProjected:'Margen proyectado al cierre',consumed:'Costo ya gastado',none:'Sin definir',
 basis:'Costo proyectado = el mayor entre (real + comprometido) y el estimado al terminar del presupuesto, más los montos previstos por elegir.',
 target:'Margen mínimo para la alerta',save:'Guardar',saving:'Guardando…',invalid:'Escriba un porcentaje entre 0 y 100.',saved:'Margen mínimo guardado.',
 conflict:'El ajuste cambió. Se recargó: revise e intente de nuevo.',failed:'No se pudo confirmar. Reintente la misma operación: nunca se aplica dos veces.',retry:'Reintentar la misma operación',
 loadError:'No se pudo calcular la rentabilidad.',reload:'Reintentar',loading:'Calculando…',
 alerts:{loss:'El costo proyectado supera lo acordado: se espera que el trabajo genere pérdida.',low_margin:(p:string)=>`El margen proyectado (${p}) está por debajo de su mínimo.`,no_agreed:'Todavía no hay un importe acordado, así que no se puede calcular el margen. Acepte una cotización o defina el importe en Costos y pagos.',
  cost_over_estimate:'El costo proyectado supera el costo estimado del presupuesto.',over_lines:(n:number)=>n===1?'1 partida del presupuesto va a superar su costo previsto.':`${n} partidas del presupuesto van a superar su costo previsto.`,incomplete:'Hay tiempo sin costo por hora, así que el costo real está incompleto.'},
}}
const pct=(bp:number|null,en:boolean)=>{if(bp===null)return '—';const v=(bp/100).toFixed(bp%100===0?0:1);return en?v+'%':v.replace('.',',')+' %';};
const toInput=(bp:number,en:boolean)=>{const v=(bp/100).toFixed(bp%100===0?0:2).replace(/0+$/,'').replace(/\.$/,'');return en?v:v.replace('.',',');};

export function WorkProfitability({accountId,workId}:{accountId:string;workId:string}){
 const en=useLocale()==='en',c=copy(en);
 const [data,setData]=useState<WorkProfitability|null>(null),[loadError,setLoadError]=useState(false),[target,setTarget]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[uncertain,setUncertain]=useState(false);
 const seq=useRef(0),active=useRef(true),pending=useRef<string|null>(null);
 const money=(v:number|null)=>v===null?c.none:v<0?'−'+proMoney(-v/100,en):proMoney(v/100,en);
 const load=useCallback(async()=>{const n=++seq.current;setLoadError(false);
  try{const r=await fetch(api+'?'+new URLSearchParams({workId}),{cache:'no-store',headers:{'X-Pro-Expected-Actor':accountId}});if(!r.ok)throw Error();
   const body=workProfitabilitySchema.parse(await r.json());if(body.workId!==workId)throw Error();if(active.current&&n===seq.current){setData(body);setTarget(toInput(body.minMarginBp,en));}}
  catch{if(active.current&&n===seq.current)setLoadError(true);}},[accountId,workId,en]);
 useEffect(()=>{active.current=true;const t=setTimeout(()=>void load(),0);return()=>{active.current=false;clearTimeout(t);};},[load]);
 async function save(resume=false){
  if(!data||busy)return;let body=resume?pending.current:null;
  if(!body){const bp=percentToBp(target);if(bp===null){setError(c.invalid);return;}body=JSON.stringify(profitTargetMutationSchema.parse({action:'set_target',actionId:crypto.randomUUID(),workId,revision:data.settingsRevision,minMarginBp:bp}));pending.current=body;}
  setBusy(true);setError('');setNotice('');
  try{const r=await fetch(api,{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json','X-Pro-Expected-Actor':accountId},body});
   if(r.status===409||r.status===400){pending.current=null;setUncertain(false);setError(c.conflict);await load();return;}
   if(!r.ok)throw Error();profitTargetResultSchema.parse(await r.json());pending.current=null;setUncertain(false);setNotice(c.saved);await load();}
  catch{setUncertain(true);setError(c.failed);}finally{if(active.current)setBusy(false);}
 }
 if(!data)return loadError?<div role="alert" data-profit-error className="space-y-2 rounded-2xl border border-[#d7e1ea] bg-white p-4 text-sm"><p>{c.loadError}</p><Button type="button" variant="secondary" onClick={()=>void load()}>{c.reload}</Button></div>
  :<p role="status" aria-busy="true" className="rounded-2xl border border-[#d7e1ea] bg-white p-4 text-sm text-[#52627a]">{c.loading}</p>;
 const neg=(data.projectedMarginCents??0)<0;
 const alertText=(a:WorkProfitability['alerts'][number])=>{const t=c.alerts;switch(a.code){case 'low_margin':return t.low_margin(pct(data.projectedMarginBp,en));case 'over_lines':return t.over_lines(a.count??1);case 'loss':return t.loss;case 'no_agreed':return t.no_agreed;case 'cost_over_estimate':return t.cost_over_estimate;default:return t.incomplete;}};
 const row=(id:string,label:string,value:string,strong=false,bad=false)=><div data-profit-figure={id} className="min-w-0 rounded-xl border border-[#d7e1ea] bg-[#f7f9fc] p-3"><dt className="text-xs font-semibold text-[#52627a]">{label}</dt><dd className={`mt-1 break-words text-base tabular-nums ${strong?'font-bold':'font-semibold'} ${bad?'text-[#a03c1f]':'text-[#162543]'}`}>{value}</dd></div>;
 return <section data-work-profitability className="min-w-0 space-y-3 rounded-2xl border border-[#d7e1ea] bg-white p-4">
  <div><h3 className="text-lg font-bold text-[#162543]">{c.title}</h3><p className="text-sm text-[#52627a]">{c.intro}</p></div>
  {data.alerts.length>0&&<ul data-profit-alerts className="space-y-2">{data.alerts.map(a=><li key={a.code} data-profit-alert={a.code} className={`rounded-xl border p-3 text-sm font-semibold ${a.severity==='high'?'border-[#f1c7b8] bg-[#fdf3ef] text-[#a03c1f]':a.severity==='medium'?'border-[#f2d9a0] bg-[#fff8e8] text-[#7a4b00]':'border-[#bfe3f2] bg-[#eef8fc] font-normal text-[#0b3a53]'}`}>{alertText(a)}</li>)}</ul>}
  <dl className="grid grid-cols-2 gap-2 lg:grid-cols-4">
   {row('agreed',data.basis==='as_agreed'?c.agreedAsIs:c.agreed,money(data.agreedCents),true)}
   {row('changes',c.changes,money(data.approvedChangesCents))}
   {row('estimated-cost',c.estimatedCost,data.estimatedCostCents>0?money(data.estimatedCostCents):c.none)}
   {row('estimated-margin',c.estimatedMargin,money(data.estimatedMarginCents),false,(data.estimatedMarginCents??0)<0)}
   {row('actual',c.actual,money(data.actualCostCents))}
   {row('committed',c.committed,money(data.committedCents))}
   {row('allowances',c.allowances,money(data.pendingAllowancesCents))}
   {row('projected-cost',c.projectedCost,money(data.projectedCostCents),true)}
   {row('margin-now',c.marginNow,money(data.currentMarginCents),false,(data.currentMarginCents??0)<0)}
   {row('margin-projected',c.marginProjected,data.projectedMarginCents===null?c.none:money(data.projectedMarginCents)+(data.projectedMarginBp!==null?' · '+pct(data.projectedMarginBp,en):''),true,neg)}
  </dl>
  {data.proposedChangesCount>0&&<p data-profit-pending-changes className="text-sm text-[#52627a]">{c.pendingChanges(data.proposedChangesCount,money(data.proposedChangesCents))}</p>}
  {data.proposedChangesCount>0&&data.projectedMarginCents!==null&&data.agreedCents!==null&&(()=>{const m=data.projectedMarginCents+data.proposedChangesCents,base=data.agreedCents+data.proposedChangesCents,bp=base>0?Math.round(m*10000/base):null;
   return <div data-profit-with-proposed className="min-w-0 space-y-1 rounded-xl border border-dashed border-[#d7e1ea] p-3"><dl>{row('margin-with-proposed',c.withProposed,money(m)+(bp!==null?' · '+pct(bp,en):''),false,m<0)}</dl><p className="text-xs text-[#52627a]">{c.withProposedNote}</p></div>;})()}
  <p className="text-xs text-[#52627a]">{c.basis}</p>
  <form onSubmit={e=>{e.preventDefault();void save();}} className="flex flex-wrap items-end gap-2">
   <label className="block min-w-0 flex-1 basis-48 text-sm font-semibold">{c.target}<input data-profit-target inputMode="decimal" value={target} disabled={busy} onChange={e=>setTarget(e.target.value)} className={field}/></label>
   <Button type="submit" variant="secondary" data-profit-save disabled={busy}>{busy?c.saving:c.save}</Button>
  </form>
  {notice&&<p role="status" data-profit-notice className="rounded-xl bg-[#eef8f4] p-3 text-sm font-semibold text-[#18573a]">{notice}</p>}
  {error&&<div role="alert" data-profit-form-error className="space-y-2 rounded-xl bg-[#fff4f2] p-3 text-sm text-[#8a2a1b]"><p>{error}</p>{uncertain&&<Button type="button" variant="secondary" disabled={busy} onClick={()=>void save(true)}>{c.retry}</Button>}</div>}
 </section>;
}
