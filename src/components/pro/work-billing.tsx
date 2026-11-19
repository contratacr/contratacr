'use client';
import {useEffect,useRef,useState} from 'react';
import {useLocale} from 'next-intl';
import {Button} from '@/components/ui/button';
import {ProModal as Modal} from '@/components/pro/modal';
import {pushProParams} from '@/lib/pro/navigation';
import {proMoney} from '@/lib/pro/money';
import {proCount} from '@/lib/pro/plural';
import {formatMinutes} from '@/lib/pro/time-tracking';
import {bpsLabel,percentToBps,shareCents,workBillingCreateSchema,workBillingSourcesSchema,type WorkBillingSources} from '@/lib/pro/work-billing';
/** Round 7A: quantity ⇄ percentage of a quote line (the server still records the percentage). */
const decimalText=(value:number,en:boolean)=>new Intl.NumberFormat(en?'en-US':'es-CR',{maximumFractionDigits:2,useGrouping:false}).format(Math.round(value*100)/100);

/**
 * Round 4B. «Facturar desde el trabajo»: one internal invoice DRAFT built from (a) lines of the accepted
 * quote, full or a % per line, (b) a progress % of the agreed amount and (c) unbilled billable hours and
 * expenses. Every source used is marked as invoiced while the draft is active; archiving the draft in
 * «Facturas» releases it. Nothing is issued, sent or charged.
 */
const field='block min-h-11 w-full min-w-0 rounded-xl border border-[#d7e1ea] bg-white px-3 py-2 text-base font-normal';
const check='h-5 w-5 shrink-0 accent-[#0f5f8c]';
function day(value:string,en:boolean){return new Intl.DateTimeFormat(en?'en-US':'es-CR',{dateStyle:'medium',timeZone:'UTC'}).format(new Date(value+'T12:00:00Z'));}
type LinePick={on:boolean;percent:string;qty?:string};

export function WorkBillingAction({accountId,workId,disabled=false}:{accountId:string;workId:string;disabled?:boolean}){
 const en=useLocale()==='en',[open,setOpen]=useState(false);
 return <>
  <Button variant="secondary" data-work-billing-open disabled={disabled} onClick={()=>setOpen(true)}>{en?'Bill from job':'Facturar desde el trabajo'}</Button>
  {open&&<WorkBillingDialog accountId={accountId} workId={workId} onClose={()=>setOpen(false)}/>}
 </>;
}

function WorkBillingDialog({accountId,workId,onClose}:{accountId:string;workId:string;onClose:()=>void}){
 const en=useLocale()==='en',t=(es:string,english:string)=>en?english:es,money=(cents:number)=>proMoney(cents/100,en);
 const [data,setData]=useState<WorkBillingSources|null>(null),[loading,setLoading]=useState(true),[loadError,setLoadError]=useState(false),[error,setError]=useState(''),[saving,setSaving]=useState(false);
 const [lines,setLines]=useState<Record<string,LinePick>>({}),[allPercent,setAllPercent]=useState(''),[progress,setProgress]=useState(''),[times,setTimes]=useState<Set<string>>(new Set()),[expenses,setExpenses]=useState<Set<string>>(new Set());
 const [title,setTitle]=useState(''),[notes,setNotes]=useState(''),request=useRef<{id:string;body:string}|null>(null),sequence=useRef(0);
 async function load(keepSelection=false){
  const n=++sequence.current;setLoading(true);setLoadError(false);
  try{
   const response=await fetch('/api/pro/work-billing?'+new URLSearchParams({workId}),{cache:'no-store',headers:{'X-Pro-Expected-Actor':accountId}});
   if(!response.ok)throw Error();const next=workBillingSourcesSchema.parse(await response.json());if(n!==sequence.current)return;
   setData(next);setTitle(old=>old||(en?'Invoice — ':'Factura — ')+next.title);
   setLines(old=>Object.fromEntries(next.lines.map(line=>{const left=10000-line.billedBps,prior=keepSelection?old[line.key]:undefined;return[line.key,{on:left>0&&(prior?.on??false),percent:prior?.percent??String(left/100).replace('.',en?'.':',')}];})));
   if(!keepSelection){setTimes(new Set());setExpenses(new Set());setProgress('');}
   else{setTimes(old=>new Set([...old].filter(id=>next.time.some(row=>row.id===id&&!row.invoicedDraftId))));setExpenses(old=>new Set([...old].filter(id=>next.expenses.some(row=>row.id===id&&!row.invoicedDraftId))));}
  }catch{if(n===sequence.current)setLoadError(true);}finally{if(n===sequence.current)setLoading(false);}
 }
 const loadRef=useRef(load);useEffect(()=>{loadRef.current=load;});
 useEffect(()=>{const timer=setTimeout(()=>void loadRef.current(),0);return()=>clearTimeout(timer);},[accountId,workId]);

 const openTime=data?.time.filter(row=>!row.invoicedDraftId)??[],openExpenses=data?.expenses.filter(row=>!row.invoicedDraftId)??[];
 const billedTime=(data?.time.length??0)-openTime.length,billedExpenses=(data?.expenses.length??0)-openExpenses.length;
 const picks=(()=>{
  if(!data)return null;let invalid='';
  const chosen=data.lines.flatMap(line=>{const pick=lines[line.key];if(!pick?.on)return[];const share=percentToBps(pick.percent);if(share===null||share>10000-line.billedBps){invalid=t('Revise el porcentaje de «','Check the percentage of “')+line.description+t('». Puede facturar hasta ','”. You can bill up to ')+bpsLabel(10000-line.billedBps,en)+'.';return[];}return[{key:line.key,bps:share,cents:shareCents(line.totalCents,share)}];});
  let agreementBps:number|null=null;
  if(data.agreement&&progress.trim()){const share=percentToBps(progress);if(share===null||share>10000-data.agreement.billedBps)invalid=t('El avance debe ser mayor que 0 y no superar lo pendiente (','Progress must be above 0 and not exceed what is left (')+bpsLabel(10000-data.agreement.billedBps,en)+').';else agreementBps=share;}
  const contract=chosen.reduce((sum,row)=>sum+row.cents,0)+(agreementBps&&data.agreement?shareCents(data.agreement.totalCents,agreementBps):0);
  const time=openTime.filter(row=>times.has(row.id)).reduce((sum,row)=>sum+row.amountCents,0),spent=openExpenses.filter(row=>expenses.has(row.id)).reduce((sum,row)=>sum+row.amountCents,0);
  return{invalid,chosen,agreementBps,contract,time,spent,total:contract+time+spent,count:chosen.length+(agreementBps?1:0)+[...times].length+[...expenses].length};
 })();

 function applyAll(){if(!data)return;const share=percentToBps(allPercent);if(share===null){setError(t('Escriba un porcentaje entre 0,01 y 100.','Enter a percentage between 0.01 and 100.'));return;}setError('');setLines(Object.fromEntries(data.lines.map(line=>{const left=10000-line.billedBps;return[line.key,{on:left>0,percent:String(Math.min(share,left)/100).replace('.',en?'.':',')}];})));}
 async function create(){
  if(!data||!picks||saving)return;if(picks.invalid){setError(picks.invalid);return;}if(!picks.count){setError(t('Elija al menos una línea, un avance, horas o gastos.','Choose at least one line, a progress share, hours or expenses.'));return;}
  const candidate={action:'create_billing' as const,workId,fingerprint:data.fingerprint,title:title.trim(),notes,lines:picks.chosen.map(({key,bps})=>({key,bps})),agreementBps:picks.agreementBps,timeIds:[...times],expenseIds:[...expenses]};
  const body=JSON.stringify(candidate);if(request.current?.body!==body)request.current={id:crypto.randomUUID(),body};
  const parsed=workBillingCreateSchema.safeParse({...candidate,requestId:request.current.id});if(!parsed.success){setError(parsed.error.issues[0]?.message||t('Revise la selección.','Check the selection.'));return;}
  setSaving(true);setError('');
  try{
   const response=await fetch('/api/pro/work-billing',{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json','X-Pro-Expected-Actor':accountId},body:JSON.stringify(parsed.data)});
   const answer=await response.json().catch(()=>({}));
   if(response.status===409){request.current=null;setError(t('Lo que se puede facturar cambió (otro borrador o un cambio reciente). Se actualizó la lista; revise la selección.','What can be billed changed (another draft or a recent change). The list was refreshed; check your selection.'));await load(true);return;}
   if(!response.ok||typeof answer.id!=='string'){setError(response.status===400?t('El trabajo está cancelado, su cliente archivado o la selección no es válida. No se creó ningún borrador.','The job is cancelled, its customer archived or the selection is not valid. No draft was created.'):t('No se pudo comprobar el borrador. Reintente: no se duplicará.','Could not confirm the draft. Retry: it will not be duplicated.'));return;}
   request.current=null;onClose();pushProParams({factura:answer.id});
  }catch{setError(t('No se pudo comprobar el borrador. Reintente: no se duplicará.','Could not confirm the draft. Retry: it will not be duplicated.'));}finally{setSaving(false);}
 }

 const footer=<><Button type="button" variant="secondary" disabled={saving} onClick={onClose}>{t('Cancelar','Cancel')}</Button><Button type="button" data-work-billing-create disabled={saving||loading||!data||!picks?.count} onClick={()=>void create()}>{saving?t('Creando…','Creating…'):t('Crear borrador de factura','Create invoice draft')}</Button></>;
 return <Modal title={t('Facturar desde el trabajo','Bill from job')} onClose={onClose} size="lg" mobilePresentation="fullscreen" footer={footer}>
  <div data-work-billing className="min-w-0 space-y-5">
   <p className="text-sm text-[#52627a]">{t('Prepara un borrador interno de factura. No se emite, no se envía ni se cobra nada. Lo que incluya queda marcado como facturado mientras el borrador esté activo; si lo archiva, vuelve a quedar disponible.','Prepares an internal invoice draft. Nothing is issued, sent or charged. What you include is marked as billed while the draft is active; archiving it makes it available again.')}</p>
   {loadError?<div role="alert" className="space-y-2"><p>{t('No se pudo cargar lo que se puede facturar.','Could not load what can be billed.')}</p><Button variant="outline" onClick={()=>void load(true)}>{t('Reintentar','Retry')}</Button></div>
   :!data?<p role="status">{t('Cargando…','Loading…')}</p>:<>
    <dl data-work-billing-summary className="grid min-w-0 gap-2 rounded-2xl bg-[#f3f8fb] p-4 text-sm sm:grid-cols-2">
     <div><dt className="text-[#52627a]">{t('Importe acordado','Agreed amount')}</dt><dd className="font-bold" data-work-billing-agreed>{data.agreedCents===null?t('Sin definir','Not set'):money(data.agreedCents)}</dd></div>
     <div><dt className="text-[#52627a]">{t('Ya facturado del contrato (borradores activos)','Contract already billed (active drafts)')}</dt><dd className="font-bold" data-work-billing-billed>{money(data.billedContractCents)}</dd></div>
     <div><dt className="text-[#52627a]">{t('Por facturar del contrato','Contract left to bill')}</dt><dd className="font-bold" data-work-billing-left>{data.agreedCents===null?'—':money(Math.max(data.agreedCents-data.billedContractCents,0))}</dd></div>
     <div><dt className="text-[#52627a]">{t('Saldo del cliente en este trabajo','Customer balance on this job')}</dt><dd className="font-bold" data-work-billing-balance>{data.customerBalanceCents===null?'—':money(data.customerBalanceCents)}</dd></div>
    </dl>
    {(data.cancelled||data.clientArchived)&&<p role="alert" className="text-sm text-red-700">{t('El trabajo está cancelado o su cliente está archivado: no se puede facturar.','The job is cancelled or its customer is archived: it cannot be billed.')}</p>}

    {data.lines.length>0&&<section data-work-billing-lines className="min-w-0 space-y-3">
     <h4 className="font-bold">{t('Líneas de la cotización aceptada','Accepted quote lines')}</h4>
     <p className="text-xs text-[#52627a]">{t('Marque líneas completas o indique la cantidad o el porcentaje por línea. El IVA de cada línea se conserva. Lo facturado por líneas no se puede facturar también como avance del importe acordado.','Pick whole lines or enter the quantity or percentage per line. Each line keeps its VAT. What is billed by lines cannot also be billed as progress of the agreed amount.')}</p>
     <div className="flex min-w-0 flex-wrap items-end gap-2"><label className="block min-w-0 flex-1 text-sm font-semibold">{t('Avance: mismo % para todas las líneas','Progress: same % for every line')}<input aria-label={t('Avance: mismo % para todas las líneas','Progress: same % for every line')} inputMode="decimal" className={field} value={allPercent} onChange={event=>setAllPercent(event.target.value)} placeholder={en?'e.g. 30':'p. ej. 30'}/></label><Button type="button" variant="outline" onClick={applyAll}>{t('Aplicar a todas','Apply to all')}</Button></div>
     <ul className="divide-y divide-[#eef2f6] rounded-2xl border border-[#d7e1ea]">{data.lines.map(line=>{const pick=lines[line.key]??{on:false,percent:''},left=10000-line.billedBps,share=percentToBps(pick.percent);return <li key={line.key} data-work-billing-line={line.key} className="min-w-0 space-y-2 p-3 text-sm">
      <label className="flex min-h-11 min-w-0 items-start gap-3"><input type="checkbox" className={check+' mt-1'} disabled={left<=0} checked={pick.on} onChange={event=>setLines(old=>({...old,[line.key]:{...pick,on:event.target.checked}}))} aria-label={line.description}/><span className="min-w-0 flex-1"><span className="block break-words font-semibold">{line.description}</span><span className="block text-[#52627a]">{t('Total de la línea: ','Line total: ')}{money(line.totalCents)}{line.taxBps>0?' · '+t('IVA ','VAT ')+bpsLabel(line.taxBps,en):''}{line.billedBps>0?' · '+t('Facturado: ','Billed: ')+bpsLabel(line.billedBps,en):''}</span></span></label>
      {left<=0?<p className="pl-8 text-xs text-[#52627a]">{t('Línea facturada por completo.','Line fully billed.')}</p>:pick.on&&<div className="flex min-w-0 flex-wrap items-end gap-3 pl-8"><label className="block w-32 text-sm font-semibold">{t('% a facturar','% to bill')}<input aria-label={t('% a facturar: ','% to bill: ')+line.description} inputMode="decimal" className={field} value={pick.percent} onChange={event=>setLines(old=>({...old,[line.key]:{...pick,percent:event.target.value,qty:undefined}}))}/></label>{line.qtyMilli>1000&&<label className="block w-40 text-sm font-semibold">{t('Cantidad a facturar','Quantity to bill')}<input aria-label={t('Cantidad a facturar: ','Quantity to bill: ')+line.description} data-work-billing-qty inputMode="decimal" className={field} value={pick.qty??(share===null?'':decimalText(line.qtyMilli*share/10000000,en))} onChange={event=>{const text=event.target.value,qty=Number(text.trim().replace(en?/,/g:/\./g,'').replace(',','.'));setLines(old=>({...old,[line.key]:{...pick,qty:text,percent:Number.isFinite(qty)&&qty>0?decimalText(Math.min(100,qty*100000/line.qtyMilli),en):pick.percent}}));}}/><span className="mt-1 block text-xs font-normal text-[#52627a]">{t('de ','of ')}{decimalText(line.qtyMilli/1000,en)}{line.unit?' '+line.unit:''}</span></label>}<span className="pb-3 text-[#52627a]">{share!==null&&share<=left?'= '+money(shareCents(line.totalCents,share)):t('Hasta ','Up to ')+bpsLabel(left,en)}</span></div>}
     </li>;})}</ul>
    </section>}

    {data.agreement&&<section data-work-billing-progress className="min-w-0 space-y-2">
     <h4 className="font-bold">{t('Avance del importe acordado','Progress of the agreed amount')}</h4>
     <p className="text-xs text-[#52627a]">{t('Facturado hasta ahora: ','Billed so far: ')}{bpsLabel(data.agreement.billedBps,en)}{' · '}{t('Pendiente: ','Left: ')}{bpsLabel(10000-data.agreement.billedBps,en)}{'. '}{t('El monto acordado se factura tal como se acordó; revise el IVA en el detalle del borrador.','The agreed amount is billed as agreed; check the VAT in the draft details.')}</p>
     {data.agreement.billedBps<10000&&<label className="block max-w-xs text-sm font-semibold">{t('% de avance a facturar','Progress % to bill')}<input aria-label={t('% de avance a facturar','Progress % to bill')} inputMode="decimal" className={field} value={progress} onChange={event=>setProgress(event.target.value)} placeholder={en?'e.g. 40':'p. ej. 40'}/></label>}
     {picks?.agreementBps&&<p className="text-sm" data-work-billing-progress-amount>= {money(shareCents(data.agreement.totalCents,picks.agreementBps))}</p>}
    </section>}
    {!data.lines.length&&!data.agreement&&<p className="text-sm text-[#52627a]">{t('Este trabajo no tiene importe acordado ni cotización aceptada: solo puede facturar horas y gastos.','This job has no agreed amount or accepted quote: you can only bill hours and expenses.')}</p>}

    <section data-work-billing-time className="min-w-0 space-y-2">
     <h4 className="font-bold">{t('Horas facturables sin facturar','Unbilled billable hours')}</h4>
     {billedTime>0&&<p className="text-xs text-[#52627a]">{proCount(billedTime,en,['registro ya está','registros ya están'],['entry is','entries are'])} {t('en otro borrador activo.','in another active draft.')}</p>}
     {!openTime.length?<p className="text-sm text-[#52627a]">{t('No hay horas facturables pendientes.','No pending billable hours.')}</p>:<ul className="divide-y divide-[#eef2f6] rounded-2xl border border-[#d7e1ea]">{openTime.map(row=><li key={row.id} className="p-3 text-sm"><label className="flex min-h-11 min-w-0 items-start gap-3" data-work-billing-time-row={row.id}><input type="checkbox" className={check+' mt-1'} checked={times.has(row.id)} onChange={event=>setTimes(old=>{const next=new Set(old);if(event.target.checked)next.add(row.id);else next.delete(row.id);return next;})}/><span className="min-w-0 flex-1 break-words"><span className="font-semibold">{row.activityName??t('Horas','Hours')}</span>{row.personName?' · '+row.personName:''} · {day(row.date,en)} · {formatMinutes(row.minutes)}<span className="block text-[#52627a]">{money(row.amountCents)} ({money(row.rateCents)}/h){row.note?' · '+row.note:''}</span></span></label></li>)}</ul>}
    </section>

    <section data-work-billing-expenses className="min-w-0 space-y-2">
     <h4 className="font-bold">{t('Gastos facturables sin facturar','Unbilled billable expenses')}</h4>
     {billedExpenses>0&&<p className="text-xs text-[#52627a]">{proCount(billedExpenses,en,['gasto ya está','gastos ya están'],['expense is','expenses are'])} {t('en otro borrador activo.','in another active draft.')}</p>}
     {!openExpenses.length?<p className="text-sm text-[#52627a]">{t('No hay gastos facturables pendientes. Marque un gasto como facturable en Gastos y vincúlelo a este trabajo.','No pending billable expenses. Mark an expense as billable in Expenses and link it to this job.')}</p>:<ul className="divide-y divide-[#eef2f6] rounded-2xl border border-[#d7e1ea]">{openExpenses.map(row=><li key={row.id} className="p-3 text-sm"><label className="flex min-h-11 min-w-0 items-start gap-3" data-work-billing-expense-row={row.id}><input type="checkbox" className={check+' mt-1'} checked={expenses.has(row.id)} onChange={event=>setExpenses(old=>{const next=new Set(old);if(event.target.checked)next.add(row.id);else next.delete(row.id);return next;})}/><span className="min-w-0 flex-1 break-words"><span className="font-semibold">{row.concept}</span> · {row.supplierName} · {day(row.date,en)}<span className="block text-[#52627a]">{money(row.amountCents)}{row.vatRateBps!==null&&row.netCents!==null?' ('+t('incluye IVA ','includes VAT ')+bpsLabel(row.vatRateBps,en)+': '+money(row.netCents)+' + '+money(row.amountCents-row.netCents)+')':''}</span></span></label></li>)}</ul>}
    </section>

    <section className="min-w-0 space-y-3">
     <label className="block text-sm font-semibold">{t('Título del borrador','Draft title')}<input aria-label={t('Título del borrador','Draft title')} className={field} maxLength={160} value={title} onChange={event=>setTitle(event.target.value)}/></label>
     <label className="block text-sm font-semibold">{t('Notas (opcional)','Notes (optional)')}<textarea aria-label={t('Notas (opcional)','Notes (optional)')} className={field} maxLength={2000} value={notes} onChange={event=>setNotes(event.target.value)}/></label>
    </section>
    {picks&&<dl data-work-billing-preview className="space-y-1 rounded-2xl border border-[#d7e1ea] p-4 text-sm">
     <div className="flex justify-between gap-3"><dt>{t('Contrato (líneas y avance)','Contract (lines and progress)')}</dt><dd>{money(picks.contract)}</dd></div>
     <div className="flex justify-between gap-3"><dt>{t('Horas','Hours')}</dt><dd>{money(picks.time)}</dd></div>
     <div className="flex justify-between gap-3"><dt>{t('Gastos','Expenses')}</dt><dd>{money(picks.spent)}</dd></div>
     <div className="flex justify-between gap-3 border-t border-[#e5e7eb] pt-2 font-bold"><dt>{t('Estimado del borrador','Draft estimate')}</dt><dd data-work-billing-estimate>{money(picks.total)}</dd></div>
     <p className="text-xs text-[#52627a]">{t('El borrador calcula el total y el IVA con la tarifa de cada línea; las horas usan el IVA predeterminado del proyecto si existe.','The draft computes the total and VAT with each line’s rate; hours use the project’s default VAT when set.')}</p>
    </dl>}
    {data.drafts.length>0&&<section data-work-billing-drafts className="min-w-0 space-y-2"><h4 className="font-bold">{t('Borradores creados desde este trabajo','Drafts created from this job')}</h4><ul className="divide-y divide-[#eef2f6] rounded-2xl border border-[#d7e1ea]">{data.drafts.map(draft=><li key={draft.id} className="flex min-w-0 flex-wrap items-center justify-between gap-2 p-3 text-sm" data-work-billing-draft={draft.id}><span className="min-w-0 break-words">{draft.title} · {money(draft.totalCents)}{draft.archived?' · '+t('Archivado (no cuenta)','Archived (not counted)'):''}</span><Button type="button" variant="outline" onClick={()=>{onClose();pushProParams({factura:draft.id});}}>{t('Abrir','Open')}</Button></li>)}</ul></section>}
    {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
   </>}
  </div>
 </Modal>;
}
