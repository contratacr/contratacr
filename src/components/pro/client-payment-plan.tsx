'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {useLocale} from 'next-intl';
import {useAuth} from '@/hooks/use-auth';
import {Button} from '@/components/ui/button';
import {proMoney} from '@/lib/pro/money';
import {proCount} from '@/lib/pro/plural';
import {clientPaymentPlanBodySchema,clientPaymentPlanSchema,paymentPlanLabels,type ClientPaymentPlan} from '@/lib/pro/payment-plan';
import {nextInstallment} from '@/lib/pro/round11';

const api='/api/pro/payment-plan';
const statusStyle:Record<string,string>={paid:'bg-[#e7f5ec] text-[#1d5b33]',partial:'bg-[#fff6e0] text-[#7a4b00]',overdue:'bg-[#fdeceb] text-[#8a2a1b]',pending:'bg-[#eef2f6] text-[#38485f]'};
/**
 * Round 5: «Plan de pagos» in the customer view (off by default; the owner turns it on in Customer
 * view). Read-only schedule with what was already paid; the linked customer accepts the current
 * version explicitly. In the owner's preview this renders inside a disabled fieldset and the server
 * refuses any acceptance that is not made by the customer.
 */
export function AppointmentPaymentPlan({requestId}:{requestId:string}){
 const {user,loading}=useAuth();if(loading||!user)return null;
 return <PlanSession key={user.id+':'+requestId} accountId={user.id} requestId={requestId}/>;
}

function PlanSession({accountId,requestId}:{accountId:string;requestId:string}){
 const en=useLocale()==='en',t=(es:string,english:string)=>en?english:es,labels=paymentPlanLabels(t);
 const [view,setView]=useState<ClientPaymentPlan|null>(null),[error,setError]=useState(false),[loading,setLoading]=useState(true),[confirming,setConfirming]=useState(false),[saving,setSaving]=useState(false),[message,setMessage]=useState(''),[problem,setProblem]=useState('');
 const active=useRef(true),sequence=useRef(0),request=useRef<{key:string;id:string}|null>(null);
 const load=useCallback(async()=>{const id=++sequence.current;setLoading(true);setError(false);try{const response=await fetch(api+'?'+new URLSearchParams({requestId}),{cache:'no-store',headers:{'X-Pro-Expected-Actor':accountId}});if(response.status===404){if(active.current&&id===sequence.current)setView({visible:false});return;}if(!response.ok)throw Error();const body=clientPaymentPlanSchema.parse(await response.json());if(active.current&&id===sequence.current)setView(body);}catch{if(active.current&&id===sequence.current)setError(true);}finally{if(active.current&&id===sequence.current)setLoading(false);}},[accountId,requestId]);
 const invalidate=useCallback(()=>{sequence.current++;},[]);
 useEffect(()=>{active.current=true;const timer=setTimeout(()=>void load(),0);return()=>{active.current=false;invalidate();clearTimeout(timer);};},[load,invalidate]);
 if(error&&!view)return <div role="alert" data-client-payment-plan-error className="space-y-2 rounded-2xl border border-[#d7e1ea] p-4 text-sm"><p>{t('No se pudo cargar el plan de pagos.','Could not load the payment plan.')}</p><Button type="button" variant="secondary" className="min-h-11" disabled={loading} onClick={()=>void load()}>{t('Reintentar','Retry')}</Button></div>;
 if(!view||!view.visible)return null;
 const plan=view.plan,money=(cents:number)=>proMoney(cents/100,en);
 const day=(value:string)=>new Intl.DateTimeFormat(en?'en-US':'es-CR',{dateStyle:'medium',timeZone:'UTC'}).format(new Date(value+'T12:00:00Z'));
 const stamp=(value:string)=>new Intl.DateTimeFormat(en?'en-US':'es-CR',{dateStyle:'medium',timeStyle:'short',timeZone:'America/Costa_Rica'}).format(new Date(value));
 async function accept(){
  if(!plan||saving)return;const key=plan.planId+':'+plan.revision;if(request.current?.key!==key)request.current={key,id:crypto.randomUUID()};
  setSaving(true);setProblem('');
  try{
   const response=await fetch(api,{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json','X-Pro-Expected-Actor':accountId},body:JSON.stringify({action:'accept',actionId:request.current.id,requestId,planId:plan.planId,revision:plan.revision,contentHash:plan.contentHash})});
   if(response.status===409){request.current=null;setProblem(t('El plan cambió o ya se aceptó. Se actualizó; revíselo de nuevo.','The plan changed or was already accepted. It was refreshed; please review it again.'));setConfirming(false);await load();return;}
   if(!response.ok){setProblem(response.status===403?t('Solo el cliente vinculado a este trabajo puede aceptar el plan.','Only the customer linked to this job can accept the plan.'):t('No se pudo comprobar la aceptación. Reintente: no se duplicará.','Could not confirm the acceptance. Retry: it will not be duplicated.'));return;}
   const next=clientPaymentPlanBodySchema.parse(await response.json());request.current=null;setConfirming(false);setMessage(t('Plan aceptado. Gracias.','Plan accepted. Thank you.'));
   setView(old=>old&&old.visible?{...old,plan:next}:old);
  }catch{setProblem(t('No se pudo comprobar la aceptación. Reintente: no se duplicará.','Could not confirm the acceptance. Retry: it will not be duplicated.'));}finally{setSaving(false);}
 }
 const count=plan?.items.filter(item=>item.kind==='installment').length??0;
 return <section data-client-payment-plan aria-labelledby={'plan-'+requestId} className="min-w-0 space-y-4 rounded-2xl border border-[#d7e1ea] p-4">
  <div><h3 id={'plan-'+requestId} className="text-lg font-bold">{t('Plan de pagos','Payment plan')}</h3><p className="text-xs text-[#52627a]">{t('Calendario de pagos que le ofrece su profesional para este trabajo. Sin intereses ni terceros.','Payment schedule your professional offers for this job. No interest and no third party.')}</p></div>
  {!plan?<p className="text-sm text-[#52627a]">{t('Todavía no hay un plan de pagos para este trabajo.','There is no payment plan for this job yet.')}</p>:<>
   <dl className="grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-3">
    <div><dt className="text-xs text-[#52627a]">{t('Total del plan','Plan total')}</dt><dd data-client-payment-plan-total className="break-words text-base font-bold">{money(plan.totalCents)}</dd></div>
    <div><dt className="text-xs text-[#52627a]">{t('Abonado','Paid')}</dt><dd data-client-payment-plan-applied className="break-words text-base font-bold">{money(plan.appliedCents)}</dd></div>
    <div><dt className="text-xs text-[#52627a]">{t('Por pagar','Left to pay')}</dt><dd data-client-payment-plan-remaining className="break-words text-base font-bold">{money(plan.remainingCents)}</dd></div>
   </dl>
   <p className="text-xs text-[#52627a]">{labels.frequency[plan.frequency]}{plan.downPaymentCents?' · '+t('prima ','down payment ')+money(plan.downPaymentCents):''} · {proCount(count,en,['cuota','cuotas'],['installment','installments'])}{plan.feeCents?' · '+t('cargo fijo ','fixed fee ')+money(plan.feeCents):''}{plan.lateFeeCents?' · '+t('recargo por cuota vencida ','late fee per overdue installment ')+money(plan.lateFeeCents):''}</p>
   {/* Round 11: in-app reminder for the customer (nothing is sent): next installment and anything overdue. */}
   {(()=>{const r=nextInstallment(plan.items);if(!r.next&&!r.overdueCount)return null;return <div data-client-payment-plan-reminder role="status" className={'rounded-xl p-3 text-sm '+(r.overdueCount?'bg-[#fdeceb] text-[#8a2a1b]':'bg-[#eaf5fb] text-[#0d4a63]')}>
    {r.overdueCount>0&&<p className="font-semibold">{en?`${proCount(r.overdueCount,en,['cuota vencida','cuotas vencidas'],['overdue installment','overdue installments'])}: ${money(r.overdueCents)} pending.`:`${proCount(r.overdueCount,en,['cuota vencida','cuotas vencidas'],['overdue installment','overdue installments'])}: ${money(r.overdueCents)} por pagar.`}</p>}
    {r.next&&<p>{t('Próxima cuota: ','Next installment: ')}<strong>{money(r.next.cents)}</strong>{t(' vence el ',' due ')}{day(r.next.dueDate)}.</p>}
   </div>;})()}
   <ol className="divide-y divide-[#eef2f6] rounded-2xl border border-[#e5e7eb]">{plan.items.map(item=><li key={item.seq} data-client-payment-plan-item={item.seq} data-status={item.status} className="flex min-w-0 flex-wrap items-center justify-between gap-2 p-3 text-sm">
    <span className="min-w-0 flex-1 break-words"><span className="font-semibold">{item.kind==='down'?t('Prima','Down payment'):t('Cuota ','Installment ')+item.seq+t(' de ',' of ')+count}</span> · {money(item.amountCents)}
     <span className="block text-xs text-[#52627a]">{item.dueDate?t('Vence ','Due ')+day(item.dueDate):item.link?.kind==='task'?t('Al completar la etapa acordada','When the agreed stage is completed'):t('Fecha por definir','Date to be set')}{item.link?.kind==='milestone'&&item.link.title?' · '+item.link.title:''}{item.appliedCents>0&&item.status!=='paid'?' · '+t('abonado ','paid ')+money(item.appliedCents):''}</span></span>
    <span className={'rounded-full px-2.5 py-1 text-xs font-semibold '+statusStyle[item.status]}>{labels.status[item.status]}</span>
   </li>)}</ol>
   {plan.terms&&<p className="whitespace-pre-wrap break-words text-sm"><span className="font-semibold">{t('Condiciones: ','Terms: ')}</span>{plan.terms}</p>}
   {plan.acceptance?<p data-client-payment-plan-accepted role="status" className="rounded-xl bg-[#e7f5ec] px-3 py-2 text-sm text-[#1d5b33]">{t('Usted aceptó este plan el ','You accepted this plan on ')}{stamp(plan.acceptance.acceptedAt)}.</p>
   :<div className="space-y-2">
    <p className="text-sm">{t('Revise las cuotas. Si está de acuerdo, acepte el plan: quedará registrada la fecha y la versión.','Review the installments. If you agree, accept the plan: the date and version will be recorded.')}</p>
    {!confirming?<Button type="button" className="min-h-11" data-client-payment-plan-accept onClick={()=>{setMessage('');setConfirming(true);}}>{t('Aceptar plan de pagos','Accept payment plan')}</Button>
    :<div className="space-y-2 rounded-xl border border-[#d7e1ea] p-3"><p className="text-sm font-semibold">{t('¿Confirme que acepta este plan de ','Do you confirm you accept this plan of ')}{money(plan.totalCents)}?</p><div className="flex flex-wrap gap-2"><Button type="button" variant="secondary" className="min-h-11" disabled={saving} onClick={()=>setConfirming(false)}>{t('Volver','Back')}</Button><Button type="button" className="min-h-11" data-client-payment-plan-confirm disabled={saving} onClick={()=>void accept()}>{saving?t('Guardando…','Saving…'):t('Sí, acepto el plan','Yes, I accept the plan')}</Button></div></div>}
   </div>}
   {message&&<p role="status" className="text-sm text-green-800">{message}</p>}
   {problem&&<p role="alert" className="text-sm text-red-700">{problem}</p>}
   <p className="text-xs text-[#68778d]">{t('Los abonos que registre su profesional se aplican primero a la cuota más antigua. Este plan no es un préstamo ni una factura.','Payments your professional records go to the oldest installment first. This plan is not a loan or an invoice.')}</p>
  </>}
 </section>;
}
