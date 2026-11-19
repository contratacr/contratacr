'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {useLocale} from 'next-intl';
import {Button} from '@/components/ui/button';
import {ProModal as Modal} from '@/components/pro/modal';
import {pushProParams} from '@/lib/pro/navigation';
import {proMoney} from '@/lib/pro/money';
import {proCount} from '@/lib/pro/plural';
import {PaymentLinkPanel} from './payment-link-panel';
import {centsToColones,colonesToCents,paymentPlanDue,paymentPlanLabels,paymentPlanReadSchema,paymentPlanSplit,type PaymentPlanFrequency,type PaymentPlanItem,type PaymentPlanRead,type PaymentPlanState} from '@/lib/pro/payment-plan';

/**
 * Round 5: «Plan de pagos» in the job's Costs & payments. The professional's OWN installment plan for
 * this customer: no interest, no lender, nothing sent or charged. Payments recorded in the job ledger
 * are applied oldest-first on every read; the balance formula never changes. Edit = new revision.
 */
const api='/api/pro/payment-plan';
const field='block min-h-11 w-full min-w-0 rounded-xl border border-[#d7e1ea] bg-white px-3 py-2 text-base font-normal';
const statusStyle:Record<PaymentPlanItem['status'],string>={paid:'bg-[#e7f5ec] text-[#1d5b33]',partial:'bg-[#fff6e0] text-[#7a4b00]',overdue:'bg-[#fdeceb] text-[#8a2a1b]',pending:'bg-[#eef2f6] text-[#38485f]'};
type Copy=(es:string,en:string)=>string;
const isoDay=(value:string,en:boolean)=>new Intl.DateTimeFormat(en?'en-US':'es-CR',{dateStyle:'medium',timeZone:'UTC'}).format(new Date(value+'T12:00:00Z'));
const stampDay=(value:string,en:boolean)=>new Intl.DateTimeFormat(en?'en-US':'es-CR',{dateStyle:'medium',timeStyle:'short',timeZone:'America/Costa_Rica'}).format(new Date(value));

export function WorkPaymentPlan({accountId,workId,disabled=false}:{accountId:string;workId:string;disabled?:boolean}){
 const en=useLocale()==='en',t:Copy=(es,english)=>en?english:es,money=(cents:number)=>proMoney(cents/100,en),labels=paymentPlanLabels(t);
 const [data,setData]=useState<PaymentPlanRead|null>(null),[failed,setFailed]=useState(false),[editing,setEditing]=useState(false),[cancelling,setCancelling]=useState(false);
 const [linkItem,setLinkItem]=useState<PaymentPlanItem|null>(null);
 const [notice,setNotice]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState<number|null>(null),sequence=useRef(0),invoiceRequest=useRef<{key:string;id:string}|null>(null);
 const load=useCallback(async()=>{const n=++sequence.current;setFailed(false);
  try{const response=await fetch(api+'?'+new URLSearchParams({workId}),{cache:'no-store',headers:{'X-Pro-Expected-Actor':accountId}});if(!response.ok)throw Error();const body=paymentPlanReadSchema.parse(await response.json());if(n===sequence.current)setData(body);}
  catch{if(n===sequence.current)setFailed(true);}},[accountId,workId]);
 const invalidate=useCallback(()=>{sequence.current++;},[]);
 useEffect(()=>{const timer=setTimeout(()=>void load(),0);const focus=()=>void load();window.addEventListener('focus',focus);return()=>{clearTimeout(timer);window.removeEventListener('focus',focus);invalidate();};},[load,invalidate]);

 async function invoice(plan:PaymentPlanState,item:PaymentPlanItem){
  const key=plan.planId+':'+plan.revision+':'+item.seq;if(invoiceRequest.current?.key!==key)invoiceRequest.current={key,id:crypto.randomUUID()};
  setBusy(item.seq);setError('');setNotice('');
  try{
   const response=await fetch(api,{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json','X-Pro-Expected-Actor':accountId},body:JSON.stringify({action:'invoice',actionId:invoiceRequest.current.id,workId,planId:plan.planId,revision:plan.revision,seq:item.seq,language:en?'en':'es'})});
   const answer=await response.json().catch(()=>({}));
   if(!response.ok||typeof answer.draftId!=='string'){invoiceRequest.current=null;setError(response.status===409?t('Esa cuota ya está en un borrador activo, o este trabajo ya se factura por líneas o por avance. Se actualizó el plan.','That installment is already in an active draft, or this job is already billed by lines or progress. The plan was refreshed.'):response.status===400?t('No se pudo crear el borrador: el trabajo está cancelado o su cliente archivado.','Could not create the draft: the job is cancelled or its customer archived.'):t('No se pudo comprobar el borrador. Reintente: no se duplicará.','Could not confirm the draft. Retry: it will not be duplicated.'));await load();return;}
   invoiceRequest.current=null;await load();pushProParams({factura:answer.draftId});
  }catch{setError(t('No se pudo comprobar el borrador. Reintente: no se duplicará.','Could not confirm the draft. Retry: it will not be duplicated.'));}finally{setBusy(null);}
 }

 const plan=data?.plan??null,inactive=!!data&&(data.cancelled||data.clientArchived);
 const count=plan?.items.filter(item=>item.kind==='installment').length??0;
 return <section data-work-payment-plan aria-labelledby={'payment-plan-'+workId} className="min-w-0 space-y-3 rounded-2xl border border-[#d7e1ea] p-4">
  <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
   <div className="min-w-0"><h4 id={'payment-plan-'+workId} className="font-bold">{t('Plan de pagos','Payment plan')}</h4><p className="text-xs text-[#52627a]">{t('Su propio calendario de pagos para este cliente, sin intereses ni terceros. ContrataCR no presta ni cobra: solo ordena el saldo del trabajo.','Your own payment schedule for this customer, with no interest and no third party. ContrataCR does not lend or collect: it only schedules the job balance.')}</p></div>
   {plan&&<a data-payment-plan-print className="inline-flex min-h-11 items-center rounded-xl border border-[#d7e1ea] px-4 text-sm font-semibold text-[#162543] hover:bg-[#f6f9fb]" target="_blank" rel="noopener" href={'/api/pro/payment-plan-print?'+new URLSearchParams({workId,lang:en?'en':'es'})}>{t('Imprimir plan','Print plan')}</a>}
  </div>
  {failed&&!data?<div role="alert" className="space-y-2 text-sm"><p>{t('No se pudo cargar el plan de pagos.','Could not load the payment plan.')}</p><Button type="button" variant="secondary" className="min-h-11" onClick={()=>void load()}>{t('Reintentar','Retry')}</Button></div>
  :!data?<p role="status" className="text-sm text-[#52627a]">{t('Cargando plan de pagos…','Loading payment plan…')}</p>
  :!plan?<div data-payment-plan-empty className="space-y-2 text-sm">
   <p className="text-[#52627a]">{data.account.customerBalanceCents?t('Saldo del cliente en este trabajo: ','Customer balance on this job: ')+money(data.account.customerBalanceCents)+t('. Puede dividirlo en una prima y cuotas.','. You can split it into a down payment and installments.'):t('Defina el importe acordado para partir del saldo, o escriba el total del plan.','Set the agreed amount to start from the balance, or type the plan total.')}</p>
   {data.cancelledPlans.length>0&&<p className="text-xs text-[#52627a]">{proCount(data.cancelledPlans.length,en,['plan cancelado','planes cancelados'],['cancelled plan','cancelled plans'])}{data.cancelledPlans[0].reason?' · '+data.cancelledPlans[0].reason:''}</p>}
   <Button type="button" data-payment-plan-create className="min-h-11" disabled={disabled||inactive} onClick={()=>{setNotice('');setEditing(true);}}>{t('Crear plan de pagos','Create payment plan')}</Button>
   {inactive&&<p className="text-xs text-[#52627a]">{t('El trabajo está cancelado o su cliente archivado.','The job is cancelled or its customer archived.')}</p>}
  </div>
  :<div className="min-w-0 space-y-3">
   <dl data-payment-plan-summary className="grid min-w-0 grid-cols-2 gap-2 rounded-2xl bg-[#f3f8fb] p-3 text-sm sm:grid-cols-4">
    <div><dt className="text-xs text-[#52627a]">{t('Total del plan','Plan total')}</dt><dd className="font-bold" data-payment-plan-total>{money(plan.totalCents)}</dd></div>
    <div><dt className="text-xs text-[#52627a]">{t('Abonado al plan','Paid toward plan')}</dt><dd className="font-bold" data-payment-plan-applied>{money(plan.appliedCents)}</dd></div>
    <div><dt className="text-xs text-[#52627a]">{t('Por pagar','Left to pay')}</dt><dd className="font-bold" data-payment-plan-remaining>{money(plan.remainingCents)}</dd></div>
    <div><dt className="text-xs text-[#52627a]">{t('Saldo del cliente','Customer balance')}</dt><dd className="font-bold" data-payment-plan-balance>{plan.customerBalanceCents===null?'—':money(plan.customerBalanceCents)}</dd></div>
   </dl>
   <p className="text-xs text-[#52627a]">{t('Versión ','Version ')}{plan.revision} · {labels.frequency[plan.frequency]}{plan.downPaymentCents?' · '+t('prima ','down payment ')+money(plan.downPaymentCents):''} · {proCount(count,en,['cuota','cuotas'],['installment','installments'])}{plan.feeCents?' · '+t('cargo fijo ','fixed fee ')+money(plan.feeCents):''}{plan.lateFeeCents?' · '+t('recargo por atraso ','late fee ')+money(plan.lateFeeCents):''}</p>
   <p data-payment-plan-acceptance className={'rounded-xl px-3 py-2 text-sm '+(plan.acceptance?'bg-[#e7f5ec] text-[#1d5b33]':'bg-[#fff6e0] text-[#7a4b00]')}>{plan.acceptance?t('Aceptado por el cliente el ','Accepted by the customer on ')+stampDay(plan.acceptance.acceptedAt,en)+'.'
    :!data.linkedClient?t('Sin cliente vinculado: cuando lo vincule y active «Plan de pagos» en la Vista del cliente, podrá aceptarlo.','No linked customer yet: once linked, with «Payment plan» turned on in the Customer view, they can accept it.')
    :!data.showInClientView?t('Active «Plan de pagos» en la Vista del cliente para que ','Turn on «Payment plan» in the Customer view so ')+data.linkedClient.name+t(' lo vea y lo acepte.',' can see and accept it.')
    :t('Esperando que ','Waiting for ')+data.linkedClient.name+t(' acepte esta versión.',' to accept this version.')}{!plan.acceptance&&plan.lastAcceptance?' '+t('Aceptó la versión ','They accepted version ')+plan.lastAcceptance.revision+'.':''}</p>
   {(plan.notices.overdueCount>0||plan.notices.upcomingCount>0)&&<p data-payment-plan-notice role="status" className="text-sm font-semibold text-[#8a2a1b]">{[plan.notices.overdueCount?proCount(plan.notices.overdueCount,en,['cuota vencida','cuotas vencidas'],['overdue installment','overdue installments'])+' · '+money(plan.notices.overdueCents):'',plan.notices.upcomingCount?proCount(plan.notices.upcomingCount,en,['cuota vence','cuotas vencen'],['installment due','installments due'])+t(' en los próximos 7 días',' in the next 7 days'):''].filter(Boolean).join(' · ')}</p>}
   <ol className="divide-y divide-[#eef2f6] rounded-2xl border border-[#d7e1ea]">{plan.items.map(item=><li key={item.seq} data-payment-plan-item={item.seq} data-status={item.status} className="flex min-w-0 flex-wrap items-center justify-between gap-2 p-3 text-sm">
    <div className="min-w-0 basis-full sm:basis-0 sm:flex-1"><p className="break-words font-semibold">{item.kind==='down'?t('Prima','Down payment'):t('Cuota ','Installment ')+item.seq+t(' de ',' of ')+count} · {money(item.amountCents)}</p>
     <p className="break-words text-xs text-[#52627a]">{item.dueDate?t('Vence ','Due ')+isoDay(item.dueDate,en):item.link?.kind==='task'?t('Al completar la tarea','When the task is done'):t('Sin fecha','No date')}{item.link?' · '+(item.link.kind==='milestone'?t('fecha clave: ','key date: '):t('tarea: ','task: '))+(item.link.title??'—')+(item.link.available?'':' ('+t('no disponible','not available')+')'):''}{item.appliedCents>0&&item.status!=='paid'?' · '+t('abonado ','paid ')+money(item.appliedCents):''}</p></div>
    <span data-payment-plan-status className={'rounded-full px-2.5 py-1 text-xs font-semibold '+statusStyle[item.status]}>{labels.status[item.status]}</span>
    {item.invoiceDraftId?<Button type="button" variant="outline" className="min-h-11" data-payment-plan-open-draft onClick={()=>pushProParams({factura:item.invoiceDraftId!})}>{t('Abrir borrador','Open draft')}</Button>
     :item.status!=='paid'&&<Button type="button" variant="outline" className="min-h-11" data-payment-plan-invoice={item.seq} disabled={disabled||inactive||busy!==null} onClick={()=>void invoice(plan,item)}>{busy===item.seq?t('Creando…','Creating…'):t('Crear borrador de factura','Create invoice draft')}</Button>}
    {item.status!=='paid'&&<Button type="button" variant="outline" className="min-h-11" data-payment-plan-link={item.seq} disabled={disabled||inactive} onClick={()=>setLinkItem(item)}>{t('Enlace de pago','Payment link')}</Button>}
   </li>)}</ol>
   {plan.terms&&<p className="whitespace-pre-wrap break-words text-sm"><span className="font-semibold">{t('Condiciones: ','Terms: ')}</span>{plan.terms}</p>}
   <div className="flex flex-wrap gap-2">
    <Button type="button" variant="secondary" className="min-h-11" data-payment-plan-edit disabled={disabled||inactive} onClick={()=>{setNotice('');setEditing(true);}}>{t('Editar plan','Edit plan')}</Button>
    <Button type="button" variant="secondary" className="min-h-11" data-payment-plan-cancel disabled={disabled} onClick={()=>{setNotice('');setCancelling(true);}}>{t('Cancelar plan','Cancel plan')}</Button>
   </div>
   {data.history.length>0&&<details className="text-sm"><summary className="min-h-11 cursor-pointer py-2 font-semibold">{t('Historial del plan','Plan history')}</summary><ul data-payment-plan-history className="space-y-1 text-xs text-[#52627a]">{data.history.map((entry,index)=><li key={index}>{stampDay(entry.at,en)} · {({create:t('Plan creado','Plan created'),edit:t('Nueva versión','New version'),cancel:t('Plan cancelado','Plan cancelled'),accept:t('Aceptado por el cliente','Accepted by the customer'),invoice:t('Borrador de factura de una cuota','Invoice draft for an installment')} as Record<string,string>)[entry.action]} · {t('versión ','version ')}{entry.revision}</li>)}</ul></details>}
  </div>}
  {notice&&<p role="status" className="text-sm text-green-800">{notice}</p>}
  {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
  {editing&&data&&<PlanEditor accountId={accountId} data={data} onClose={()=>setEditing(false)} onSaved={async message=>{setEditing(false);setNotice(message);await load();}} onConflict={load}/>}
  {linkItem&&plan&&<Modal title={t('Enlace de pago','Payment link')} ariaLabel={t('Enlace de pago','Payment link')} mobilePresentation="fullscreen" onClose={()=>{setLinkItem(null);void load();}}><PaymentLinkPanel scope={{target:'installment',planId:plan.planId,planRevision:plan.revision,seq:linkItem.seq,amountCents:Math.max(0,linkItem.amountCents-linkItem.appliedCents)}} disabled={disabled}/></Modal>}
  {cancelling&&plan&&<CancelPlan accountId={accountId} workId={workId} plan={plan} onClose={()=>setCancelling(false)} onDone={async message=>{setCancelling(false);setNotice(message);await load();}}/>}
 </section>;
}

type Row={amount:string;kind:'date'|'milestone'|'task';date:string;milestoneId:string;taskId:string};
function PlanEditor({accountId,data,onClose,onSaved,onConflict}:{accountId:string;data:PaymentPlanRead;onClose:()=>void;onSaved:(message:string)=>void|Promise<void>;onConflict:()=>Promise<void>}){
 const en=useLocale()==='en',t:Copy=(es,english)=>en?english:es,money=(cents:number)=>proMoney(cents/100,en),labels=paymentPlanLabels(t);
 const plan=data.plan,today=data.today;
 const initialRows=():Row[]=>plan?plan.items.filter(item=>item.kind==='installment').map(item=>({amount:centsToColones(item.amountCents,en),kind:item.link?item.link.kind:'date',date:item.link?'':item.dueDate??'',milestoneId:item.link?.kind==='milestone'?item.link.id:'',taskId:item.link?.kind==='task'?item.link.id:''})):[];
 const [total,setTotal]=useState(centsToColones(plan?.totalCents??data.account.customerBalanceCents??0,en));
 const [down,setDown]=useState(plan?centsToColones(plan.downPaymentCents,en):'0'),[downDate,setDownDate]=useState(plan?.items.find(item=>item.kind==='down')?.dueDate??today);
 const [mode,setMode]=useState<'auto'|'custom'>(plan&&plan.frequency==='custom'?'custom':'auto');
 const [frequency,setFrequency]=useState<PaymentPlanFrequency>(plan&&plan.frequency!=='custom'?plan.frequency:'monthly');
 const [count,setCount]=useState(String(plan?plan.items.filter(item=>item.kind==='installment').length:3));
 const [firstDue,setFirstDue]=useState(plan?.items.find(item=>item.kind==='installment')?.dueDate??paymentPlanDue(today,'monthly',1));
 const [rows,setRows]=useState<Row[]>(initialRows),[fee,setFee]=useState(plan?centsToColones(plan.feeCents,en):'0'),[late,setLate]=useState(plan?centsToColones(plan.lateFeeCents,en):'0'),[terms,setTerms]=useState(plan?.terms??'');
 const [error,setError]=useState(''),[saving,setSaving]=useState(false),request=useRef<{id:string;body:string}|null>(null);
 const totalCents=colonesToCents(total,en),downCents=colonesToCents(down||'0',en),feeCents=colonesToCents(fee||'0',en),lateCents=colonesToCents(late||'0',en),n=Number(count);
 const auto=mode==='auto'&&totalCents!==null&&downCents!==null&&/^\d{1,2}$/.test(count)?paymentPlanSplit(totalCents,downCents,n):null;
 const autoRows=auto?auto.map((amount,index)=>({amount,date:/^\d{4}-\d{2}-\d{2}$/.test(firstDue)?paymentPlanDue(firstDue,frequency,index):''})):[];
 const customSum=rows.reduce((sum,row)=>sum+(colonesToCents(row.amount,en)??0),0),customLeft=totalCents!==null&&downCents!==null?totalCents-downCents-customSum:null;
 function customize(){if(!autoRows.length)return;setRows(autoRows.map(row=>({amount:centsToColones(row.amount,en),kind:'date',date:row.date,milestoneId:'',taskId:''})));setMode('custom');}
 function absorb(){if(customLeft===null||!rows.length)return;const last=rows.at(-1)!,value=(colonesToCents(last.amount,en)??0)+customLeft;if(value<=0)return;setRows(old=>old.map((row,index)=>index===old.length-1?{...row,amount:centsToColones(value,en)}:row));}
 async function save(){
  if(saving)return;setError('');
  if(totalCents===null||totalCents<100){setError(t('Escriba el total del plan en colones.','Enter the plan total in colones.'));return;}
  if(downCents===null||downCents>=totalCents){setError(t('La prima debe ser menor que el total.','The down payment must be below the total.'));return;}
  if(feeCents===null||lateCents===null){setError(t('Revise el cargo fijo y el recargo por atraso.','Check the fixed fee and the late fee.'));return;}
  let schedule;
  if(mode==='auto'){if(!auto){setError(t('Revise la cantidad de cuotas (1 a 60, de al menos ₡1 cada una).','Check the number of installments (1 to 60, at least ₡1 each).'));return;}if(!/^\d{4}-\d{2}-\d{2}$/.test(firstDue)){setError(t('Elija la fecha de la primera cuota.','Choose the first installment date.'));return;}schedule={mode:'auto' as const,frequency,count:n,firstDue};}
  else{
   if(!rows.length){setError(t('Agregue al menos una cuota.','Add at least one installment.'));return;}
   const items=[];for(const [index,row] of rows.entries()){const amount=colonesToCents(row.amount,en);if(!amount){setError(t('Revise el monto de la cuota ','Check the amount of installment ')+(index+1)+'.');return;}
    if(row.kind==='date'&&!/^\d{4}-\d{2}-\d{2}$/.test(row.date)||row.kind==='milestone'&&!row.milestoneId||row.kind==='task'&&!row.taskId){setError(t('Indique cuándo vence la cuota ','Choose when installment ')+(index+1)+t('.',' is due.'));return;}
    items.push({amountCents:amount,dueDate:row.kind==='date'?row.date:null,milestoneId:row.kind==='milestone'?row.milestoneId:null,taskId:row.kind==='task'?row.taskId:null});}
   if(customLeft!==0){setError(t('La prima y las cuotas deben sumar exactamente el total. Diferencia: ','The down payment and installments must add up exactly to the total. Difference: ')+money(customLeft??0)+'.');return;}
   schedule={mode:'custom' as const,items};
  }
  const candidate={action:plan?'edit':'create',workId:data.workId,planId:plan?.planId??crypto.randomUUID(),...(plan?{revision:plan.revision}:{}),totalCents,downPaymentCents:downCents,downPaymentDate:downCents>0?downDate:null,schedule,feeCents,lateFeeCents:lateCents,terms:terms.trim()};
  const body=JSON.stringify(candidate);if(request.current?.body!==body)request.current={id:crypto.randomUUID(),body};
  setSaving(true);
  try{
   const response=await fetch(api,{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json','X-Pro-Expected-Actor':accountId},body:JSON.stringify({...candidate,actionId:request.current.id})});
   const answer=await response.json().catch(()=>({}));
   if(response.status===409){request.current=null;setError(t('El plan cambió en otra pestaña. Se actualizó; revise y vuelva a guardar.','The plan changed in another tab. It was refreshed; check and save again.'));await onConflict();return;}
   if(!response.ok){setError(answer.reason==='invoiced'?t('Una cuota tiene un borrador de factura activo. Archívelo en Facturas antes de cambiar el plan.','An installment has an active invoice draft. Archive it in Invoices before changing the plan.'):answer.reason==='sum'?t('La prima y las cuotas deben sumar exactamente el total.','The down payment and installments must add up exactly to the total.'):response.status===400?t('Revise el plan: montos, fechas, fechas clave o tareas no válidos, o no hubo cambios. No se guardó nada.','Check the plan: invalid amounts, dates, key dates or tasks, or nothing changed. Nothing was saved.'):t('No se pudo comprobar el guardado. Reintente: no se duplicará.','Could not confirm the save. Retry: it will not be duplicated.'));return;}
   request.current=null;await onSaved(plan?t('Plan actualizado: nueva versión guardada.','Plan updated: new version saved.'):t('Plan de pagos creado.','Payment plan created.'));
  }catch{setError(t('No se pudo comprobar el guardado. Reintente: no se duplicará.','Could not confirm the save. Retry: it will not be duplicated.'));}finally{setSaving(false);}
 }
 const footer=<><Button type="button" variant="secondary" className="min-h-11" disabled={saving} onClick={onClose}>{t('Cerrar','Close')}</Button><Button type="button" className="min-h-11" data-payment-plan-save disabled={saving} onClick={()=>void save()}>{saving?t('Guardando…','Saving…'):plan?t('Guardar nueva versión','Save new version'):t('Crear plan','Create plan')}</Button></>;
 return <Modal title={plan?t('Editar plan de pagos','Edit payment plan'):t('Nuevo plan de pagos','New payment plan')} onClose={onClose} size="lg" mobilePresentation="fullscreen" footer={footer}>
  <div data-payment-plan-editor className="min-w-0 space-y-4">
   <p className="text-sm text-[#52627a]">{t('Sin intereses. Las cuotas ordenan el saldo del trabajo; los abonos que registre se aplican a la cuota más antigua. ','No interest. Installments schedule the job balance; the payments you record go to the oldest installment first. ')}{plan?t('Guardar crea una nueva versión que el cliente debe aceptar de nuevo.','Saving creates a new version the customer must accept again.'):''}</p>
   <div className="grid min-w-0 gap-3 sm:grid-cols-2">
    <label className="block text-sm font-semibold">{t('Total del plan (₡)','Plan total (₡)')}<input aria-label={t('Total del plan (₡)','Plan total (₡)')} data-payment-plan-field="total" inputMode="decimal" className={field} value={total} onChange={event=>setTotal(event.target.value)}/>
     <span className="mt-1 block text-xs font-normal text-[#52627a]">{t('Saldo actual del cliente: ','Current customer balance: ')}{data.account.customerBalanceCents===null?t('sin definir','not set'):money(data.account.customerBalanceCents)}</span></label>
    <label className="block text-sm font-semibold">{t('Prima (₡, opcional)','Down payment (₡, optional)')}<input aria-label={t('Prima (₡, opcional)','Down payment (₡, optional)')} data-payment-plan-field="down" inputMode="decimal" className={field} value={down} onChange={event=>setDown(event.target.value)}/></label>
    {(downCents??0)>0&&<label className="block text-sm font-semibold">{t('Fecha de la prima','Down payment date')}<input type="date" aria-label={t('Fecha de la prima','Down payment date')} className={field} value={downDate} onChange={event=>setDownDate(event.target.value)}/></label>}
   </div>
   <fieldset className="min-w-0 space-y-2"><legend className="text-sm font-semibold">{t('Cuotas','Installments')}</legend>
    <div className="flex flex-wrap gap-2">{(['auto','custom'] as const).map(value=><label key={value} className="flex min-h-11 items-center gap-2 rounded-xl border border-[#d7e1ea] px-3 text-sm"><input type="radio" name="payment-plan-mode" checked={mode===value} onChange={()=>{if(value==='custom'&&!rows.length&&autoRows.length)customize();else setMode(value);}}/>{value==='auto'?t('Iguales, cada cierto tiempo','Equal, on a schedule'):t('A la medida (montos, fechas o hitos)','Custom (amounts, dates or milestones)')}</label>)}</div>
    {mode==='auto'?<div className="space-y-3">
     <div className="grid min-w-0 gap-3 sm:grid-cols-3">
      <label className="block text-sm font-semibold">{t('Frecuencia','Frequency')}<select aria-label={t('Frecuencia','Frequency')} className={field} value={frequency} onChange={event=>setFrequency(event.target.value as PaymentPlanFrequency)}>{(['weekly','biweekly','monthly'] as const).map(value=><option key={value} value={value}>{labels.frequency[value]}</option>)}</select></label>
      <label className="block text-sm font-semibold">{t('Cantidad de cuotas','Number of installments')}<input aria-label={t('Cantidad de cuotas','Number of installments')} data-payment-plan-field="count" inputMode="numeric" className={field} value={count} onChange={event=>setCount(event.target.value)}/></label>
      <label className="block text-sm font-semibold">{t('Primera cuota','First installment')}<input type="date" aria-label={t('Primera cuota','First installment')} data-payment-plan-field="first" className={field} value={firstDue} onChange={event=>setFirstDue(event.target.value)}/></label>
     </div>
     {autoRows.length>0?<ol data-payment-plan-preview className="space-y-1 rounded-2xl bg-[#f3f8fb] p-3 text-sm">{autoRows.map((row,index)=><li key={index} className="flex justify-between gap-3"><span>{t('Cuota ','Installment ')}{index+1} · {row.date?isoDay(row.date,en):'—'}</span><strong>{money(row.amount)}</strong></li>)}<li className="pt-1 text-xs text-[#52627a]">{t('Montos en colones enteros; la última cuota absorbe el redondeo.','Whole-colón amounts; the last installment absorbs the rounding.')}</li></ol>
      :<p className="text-sm text-[#8a2a1b]">{t('Revise el total, la prima y la cantidad de cuotas.','Check the total, the down payment and the number of installments.')}</p>}
     {autoRows.length>0&&<Button type="button" variant="outline" className="min-h-11" onClick={customize}>{t('Personalizar estas cuotas','Customize these installments')}</Button>}
    </div>:<div className="space-y-2">
     <ol className="space-y-2">{rows.map((row,index)=><li key={index} data-payment-plan-row={index} className="min-w-0 space-y-2 rounded-2xl border border-[#d7e1ea] p-3">
      <div className="grid min-w-0 gap-2 sm:grid-cols-3">
       <label className="block text-sm font-semibold">{t('Monto cuota ','Amount #')}{index+1}<input aria-label={t('Monto cuota ','Amount #')+(index+1)} inputMode="decimal" className={field} value={row.amount} onChange={event=>setRows(old=>old.map((item,i)=>i===index?{...item,amount:event.target.value}:item))}/></label>
       <label className="block text-sm font-semibold">{t('Vence','Due')}<select aria-label={t('Vence cuota ','Due #')+(index+1)} className={field} value={row.kind} onChange={event=>setRows(old=>old.map((item,i)=>i===index?{...item,kind:event.target.value as Row['kind']}:item))}><option value="date">{t('En una fecha','On a date')}</option><option value="milestone" disabled={!data.options.milestones.length}>{t('En una fecha clave','On a key date')}</option><option value="task" disabled={!data.options.tasks.length}>{t('Al completar una tarea','When a task is done')}</option></select></label>
       {row.kind==='date'?<label className="block text-sm font-semibold">{t('Fecha','Date')}<input type="date" aria-label={t('Fecha cuota ','Date #')+(index+1)} className={field} value={row.date} onChange={event=>setRows(old=>old.map((item,i)=>i===index?{...item,date:event.target.value}:item))}/></label>
        :row.kind==='milestone'?<label className="block text-sm font-semibold">{t('Fecha clave','Key date')}<select aria-label={t('Fecha clave cuota ','Key date #')+(index+1)} className={field} value={row.milestoneId} onChange={event=>setRows(old=>old.map((item,i)=>i===index?{...item,milestoneId:event.target.value}:item))}><option value="">{t('Elegir…','Choose…')}</option>{data.options.milestones.map(item=><option key={item.id} value={item.id}>{item.title} · {isoDay(item.date,en)}</option>)}</select></label>
        :<label className="block text-sm font-semibold">{t('Tarea','Task')}<select aria-label={t('Tarea cuota ','Task #')+(index+1)} className={field} value={row.taskId} onChange={event=>setRows(old=>old.map((item,i)=>i===index?{...item,taskId:event.target.value}:item))}><option value="">{t('Elegir…','Choose…')}</option>{data.options.tasks.map(item=><option key={item.id} value={item.id}>{item.title}{item.status==='done'?' · '+t('completada','done'):''}</option>)}</select></label>}
      </div>
      <Button type="button" variant="ghost" className="min-h-11" onClick={()=>setRows(old=>old.filter((_,i)=>i!==index))}>{t('Quitar cuota','Remove installment')}</Button>
     </li>)}</ol>
     <div className="flex flex-wrap items-center gap-2"><Button type="button" variant="outline" className="min-h-11" disabled={rows.length>=60} onClick={()=>setRows(old=>[...old,{amount:'',kind:'date',date:old.at(-1)?.date||today,milestoneId:'',taskId:''}])}>{t('Agregar cuota','Add installment')}</Button>
      {customLeft!==null&&customLeft!==0&&rows.length>0&&<Button type="button" variant="outline" className="min-h-11" data-payment-plan-absorb onClick={absorb}>{t('Ajustar la última cuota','Adjust the last installment')}</Button>}</div>
     <p data-payment-plan-difference className={'text-sm '+(customLeft===0?'text-[#1d5b33]':'text-[#8a2a1b]')}>{customLeft===null?'':customLeft===0?t('La prima y las cuotas suman exactamente el total.','Down payment and installments add up exactly to the total.'):t('Diferencia con el total: ','Difference from the total: ')+money(customLeft)}</p>
    </div>}
   </fieldset>
   <div className="grid min-w-0 gap-3 sm:grid-cols-2">
    <label className="block text-sm font-semibold">{t('Cargo fijo (₡, opcional)','Fixed fee (₡, optional)')}<input aria-label={t('Cargo fijo (₡, opcional)','Fixed fee (₡, optional)')} inputMode="decimal" className={field} value={fee} onChange={event=>setFee(event.target.value)}/></label>
    <label className="block text-sm font-semibold">{t('Recargo por cuota vencida (₡, opcional)','Late fee per overdue installment (₡, optional)')}<input aria-label={t('Recargo por cuota vencida (₡, opcional)','Late fee per overdue installment (₡, optional)')} inputMode="decimal" className={field} value={late} onChange={event=>setLate(event.target.value)}/></label>
   </div>
   <p className="text-xs text-[#52627a]">{t('Los cargos se muestran como condiciones del plan; no se suman solos al saldo. Si los cobra, regístrelos como cambio del importe acordado.','Fees are shown as plan terms; they are not added to the balance automatically. If you charge them, record them as a change of the agreed amount.')}</p>
   <label className="block text-sm font-semibold">{t('Condiciones para el cliente (opcional)','Terms for the customer (optional)')}<textarea aria-label={t('Condiciones para el cliente (opcional)','Terms for the customer (optional)')} maxLength={1000} className={field} value={terms} onChange={event=>setTerms(event.target.value)}/></label>
   {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
  </div>
 </Modal>;
}

function CancelPlan({accountId,workId,plan,onClose,onDone}:{accountId:string;workId:string;plan:PaymentPlanState;onClose:()=>void;onDone:(message:string)=>void|Promise<void>}){
 const en=useLocale()==='en',t:Copy=(es,english)=>en?english:es;
 const [reason,setReason]=useState(''),[error,setError]=useState(''),[saving,setSaving]=useState(false),request=useRef<{id:string;body:string}|null>(null);
 async function confirm(){
  if(!reason.trim()){setError(t('Escriba el motivo.','Enter the reason.'));return;}
  const candidate={action:'cancel',workId,planId:plan.planId,revision:plan.revision,reason:reason.trim()},body=JSON.stringify(candidate);if(request.current?.body!==body)request.current={id:crypto.randomUUID(),body};
  setSaving(true);setError('');
  try{const response=await fetch(api,{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json','X-Pro-Expected-Actor':accountId},body:JSON.stringify({...candidate,actionId:request.current.id})});const answer=await response.json().catch(()=>({}));
   if(!response.ok){setError(answer.reason==='invoiced'?t('Una cuota tiene un borrador de factura activo. Archívelo en Facturas antes de cancelar el plan.','An installment has an active invoice draft. Archive it in Invoices before cancelling the plan.'):response.status===409?t('El plan cambió. Cierre y vuelva a abrir.','The plan changed. Close and open it again.'):t('No se pudo comprobar. Reintente: no se duplicará.','Could not confirm. Retry: it will not be duplicated.'));return;}
   await onDone(t('Plan cancelado. Se conserva en el historial.','Plan cancelled. It is kept in the history.'));
  }catch{setError(t('No se pudo comprobar. Reintente: no se duplicará.','Could not confirm. Retry: it will not be duplicated.'));}finally{setSaving(false);}
 }
 return <Modal title={t('Cancelar plan de pagos','Cancel payment plan')} onClose={onClose} footer={<><Button type="button" variant="secondary" className="min-h-11" disabled={saving} onClick={onClose}>{t('Volver','Back')}</Button><Button type="button" variant="destructive" className="min-h-11" data-payment-plan-cancel-confirm disabled={saving} onClick={()=>void confirm()}>{saving?t('Cancelando…','Cancelling…'):t('Cancelar plan','Cancel plan')}</Button></>}>
  <div className="space-y-3"><p className="text-sm text-[#52627a]">{t('El saldo del cliente no cambia. El plan y sus versiones quedan en el historial.','The customer balance does not change. The plan and its versions stay in the history.')}</p>
   <label className="block text-sm font-semibold">{t('Motivo','Reason')}<input aria-label={t('Motivo','Reason')} maxLength={500} className={field} value={reason} onChange={event=>setReason(event.target.value)}/></label>
   {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}</div>
 </Modal>;
}
