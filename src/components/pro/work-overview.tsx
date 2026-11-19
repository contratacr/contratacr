'use client';
import {useEffect,useState,type ReactNode} from 'react';
import {useLocale} from 'next-intl';
import {Button} from '@/components/ui/button';
import {proMoney} from '@/lib/pro/money';
import {proPhone} from '@/lib/pro/phone';
import {proCount} from '@/lib/pro/plural';
import {workOverviewSchemas,type WorkOverview as Part,type WorkOverviewPart} from '@/lib/pro/work-overview';
import {useProSearchParams} from './use-pro-search-params';
import {defaultOverviewLayout,type OverviewLayout,type OverviewWidget} from '@/lib/pro/round8';
import {OverviewLayoutBar} from './overview-layout';

type View='estimates'|'contracts'|'schedule'|'costs'|'tasks'|'updates'|'changes'|'selections'|'allowances'|'client'|'time';
type Facts={workId:string;phase:string;planStart:string|null;planEnd:string|null;contractStatus:'draft'|'shared'|'accepted'|'declined'|null;estimateAccepted:boolean;estimateAwaitingContinue?:boolean};
const card='flex min-w-0 flex-col gap-3 rounded-xl border border-[#d7e1ea] bg-white p-4';
const muted='text-sm text-[#52627a]';

/** One widget = one request: it loads, fails and retries on its own; refreshed on focus and when the job view changes. */
function usePart<P extends WorkOverviewPart>(workId:string,part:P){
 const view=useProSearchParams().get('vistaTrabajo')??'',[data,setData]=useState<Part<P>|null>(null),[failed,setFailed]=useState(false),[attempt,setAttempt]=useState(0);
 useEffect(()=>{let alive=true;
  const load=()=>{fetch('/api/pro/work-overview?'+new URLSearchParams({workId,part}),{cache:'no-store'}).then(r=>{if(!r.ok)throw Error();return r.json();}).then(body=>{const parsed=workOverviewSchemas[part].parse(body) as Part<P>;if(!alive)return;if(parsed.workId!==workId)throw Error();setData(parsed);setFailed(false);}).catch(()=>{if(alive)setFailed(true);});};
  load();window.addEventListener('focus',load);window.addEventListener('ccr:pro-quote-changed',load);return()=>{alive=false;window.removeEventListener('focus',load);window.removeEventListener('ccr:pro-quote-changed',load);};},[workId,part,view,attempt]);
 return {data,failed,retry:()=>{setFailed(false);setAttempt(value=>value+1);}};
}
function useFacts(workId:string){
 const view=useProSearchParams().get('vistaTrabajo')??'',[facts,setFacts]=useState<Facts|null>(null),[failed,setFailed]=useState(false),[attempt,setAttempt]=useState(0);
 useEffect(()=>{let alive=true;const load=()=>fetch('/api/pro/work-header?'+new URLSearchParams({workId}),{cache:'no-store'}).then(r=>{if(!r.ok)throw Error();return r.json();}).then((body:Facts)=>{if(!alive)return;if(body?.workId!==workId)throw Error();setFacts(body);setFailed(false);}).catch(()=>{if(alive)setFailed(true);});
  load();window.addEventListener('focus',load);window.addEventListener('ccr:pro-quote-changed',load);return()=>{alive=false;window.removeEventListener('focus',load);window.removeEventListener('ccr:pro-quote-changed',load);};},[workId,view,attempt]);
 return {facts,failed,retry:()=>{setFailed(false);setAttempt(value=>value+1);}};
}

function Widget({name,legacy,title,state,children,footer,place}:{name:string;legacy?:string;title:string;state:{loading:boolean;failed:boolean;retry:()=>void;en:boolean};children?:ReactNode;footer?:ReactNode;place?:{order:number;hidden:boolean}}){
 const {loading,failed,retry,en}=state;
 return <section data-work-overview-widget={name} data-work-summary-block={legacy} aria-label={title} className={card} style={place?{order:place.order}:undefined} hidden={place?.hidden||undefined}>
  <h3 className="font-semibold">{title}</h3>
  {failed&&loading?<div role="alert" data-work-overview-error className="space-y-2 text-sm"><p>{en?'This block could not be loaded.':'No se pudo cargar este bloque.'}</p><Button type="button" variant="outline" className="min-h-11" onClick={retry}>{en?'Retry':'Reintentar'}</Button></div>
   :loading?<p role="status" className={muted}>{en?'Loading…':'Cargando…'}</p>:<div className="min-w-0 flex-1 space-y-2">{children}</div>}
  {footer&&<div className="flex flex-wrap gap-2">{footer}</div>}
 </section>;
}
const Row=({label,value,attr,stack=false}:{label:string;value:ReactNode;attr?:Record<string,string>;stack?:boolean})=>stack?<div className="text-sm"><dt className="text-[#52627a]">{label}</dt><dd {...attr} className="font-semibold">{value}</dd></div>:<div className="flex justify-between gap-3 text-sm"><dt className="min-w-0 text-[#52627a]">{label}</dt><dd {...attr} className="text-right font-semibold">{value}</dd></div>;

/**
 * Round 4A: the job Summary is a project overview. Multi-column on desktop, stacked on phones:
 * customer & contact, next steps, schedule and next tasks, finances, recent activity and open items.
 * Each widget links to its section and keeps its own loading / error / empty state. Figures come
 * from the same readers as the header, the customer balance (single formula) and Costs & payments.
 * Keeps the Round 2 block markers (next / figures / schedule) so earlier checks still apply.
 */
export function WorkOverview({workId,dated,period,disabled,onOpen}:{workId:string;dated:boolean;period:string;disabled:boolean;onOpen:(view:View)=>void}){
 const en=useLocale()==='en',t=(es:string,english:string)=>en?english:es;
 const [layout,setLayout]=useState<OverviewLayout>(defaultOverviewLayout);
 const placeOf=(name:OverviewWidget)=>({order:layout.order.indexOf(name),hidden:layout.hidden.includes(name)});
 const widgetTitles:Record<OverviewWidget,string>={client:t('Cliente','Customer'),next:t('Próximos pasos','Next steps'),schedule:t('Cronograma y tareas','Schedule and tasks'),finance:t('Finanzas','Finances'),activity:t('Actividad reciente','Recent activity'),open:t('Pendientes','Open items')};
 const header=useFacts(workId),client=usePart(workId,'client'),schedule=usePart(workId,'schedule'),finance=usePart(workId,'finance'),activity=usePart(workId,'activity'),open=usePart(workId,'open');
 const state=(part:{data:unknown;failed:boolean;retry:()=>void})=>({loading:!part.data,failed:part.failed,retry:part.retry,en});
 const money=(cents:number)=>proMoney(cents/100,en);
 const day=(value:string)=>new Intl.DateTimeFormat(en?'en-US':'es-CR',{dateStyle:'medium',timeZone:'UTC'}).format(new Date(value.slice(0,10)+'T00:00:00Z'));
 const stampDay=(value:string)=>new Intl.DateTimeFormat(en?'en-US':'es-CR',{dateStyle:'medium',timeZone:'America/Costa_Rica'}).format(new Date(value));
 const go=(view:View,label:string)=><Button type="button" variant="outline" className="min-h-11" disabled={disabled} onClick={()=>onOpen(view)}>{label}</Button>;
 const facts=header.facts,finished=facts?.phase==='completed'||facts?.phase==='cancelled';
 const planned=dated||!!(facts?.planStart&&facts.planEnd);
 // Launch fix I1: a version shared and waiting for the customer is its own step state.
 const quoteWaiting=(open.data?.quotesWaiting??0)>0;
 const steps:{key:string;done:boolean;label:string;action?:{label:string;view:View}}[]=facts?[
  {key:'estimate',done:facts.estimateAccepted,label:facts.estimateAccepted?t('Cotización aceptada','Quote accepted'):facts.estimateAwaitingContinue?t('El cliente aceptó la cotización: continúela en este trabajo','The customer accepted the quote: continue it into this job'):quoteWaiting?t('Cotización compartida: esperando la respuesta del cliente','Quote shared: waiting for the customer\'s answer'):t('Prepare o comparta la cotización','Prepare or share the quote'),action:facts.estimateAccepted?undefined:{label:facts.estimateAwaitingContinue?t('Revisar cotización aceptada','Review accepted quote'):t('Abrir cotizaciones','Open quotes'),view:'estimates'}},
  {key:'contract',done:facts.contractStatus==='accepted',label:facts.contractStatus==='accepted'?t('Contrato aceptado','Contract accepted'):facts.contractStatus==='shared'?t('Contrato enviado, esperando al cliente','Contract sent, waiting for the customer'):t('Prepare el contrato','Prepare the contract'),action:facts.contractStatus==='accepted'||facts.contractStatus==='shared'?undefined:{label:t('Abrir contratos','Open contracts'),view:'contracts'}},
  {key:'schedule',done:planned,label:planned?t('Fechas planificadas','Dates planned'):t('Planifique las fechas en el cronograma','Plan the dates in the schedule'),action:planned?undefined:{label:t('Abrir cronograma','Open schedule'),view:'schedule'}},
 ]:[];
 const c=client.data,s=schedule.data,f=finance.data,a=activity.data,o=open.data;
 const kind={file:t('Archivo','File'),daily_log:t('Resumen del día','Daily summary'),update:t('Avance','Update'),change:t('Extra o cambio','Extra or change')};
 const kindView:Record<string,View>={file:'updates',daily_log:'updates',update:'updates',change:'changes'};
 const changeStatus={proposed:t('propuesto','proposed'),accepted:t('aceptado','accepted'),declined:t('rechazado','declined'),withdrawn:t('retirado','withdrawn')};
 const openItems:{key:string;count:number;label:string;view:View}[]=o?([
  {key:'tasks',count:o.openTasks,label:proCount(o.openTasks,en,['tarea abierta','tareas abiertas'],['open task','open tasks'])+(o.overdueTasks?` · ${proCount(o.overdueTasks,en,['vencida','vencidas'],['overdue','overdue'])}`:''),view:'tasks'},
  {key:'punch',count:o.punchOpen,label:proCount(o.punchOpen,en,['pendiente final abierto','pendientes finales abiertos'],['open punch item','open punch items'])+(o.punchTotal?` (${t('de','of')} ${o.punchTotal})`:''),view:'tasks'},
  {key:'selections',count:o.selectionsPending,label:proCount(o.selectionsPending,en,['selección esperando al cliente','selecciones esperando al cliente'],['selection waiting for the customer','selections waiting for the customer']),view:'selections'},
  {key:'changes',count:o.changesProposed,label:proCount(o.changesProposed,en,['extra propuesto sin respuesta','extras propuestos sin respuesta'],['proposed extra without an answer','proposed extras without an answer']),view:'changes'},
  {key:'contracts',count:o.contractsShared,label:proCount(o.contractsShared,en,['contrato esperando firma','contratos esperando firma'],['contract waiting for acceptance','contracts waiting for acceptance']),view:'contracts'},
  {key:'quotes',count:o.quotesWaiting,label:proCount(o.quotesWaiting,en,['cotización esperando respuesta','cotizaciones esperando respuesta'],['quote waiting for an answer','quotes waiting for an answer']),view:'estimates'},
  {key:'payment-overdue',count:o.paymentOverdue,label:proCount(o.paymentOverdue,en,['cuota vencida del plan de pagos','cuotas vencidas del plan de pagos'],['overdue payment plan installment','overdue payment plan installments'])+' · '+money(o.paymentOverdueCents),view:'costs'},
  {key:'payment-upcoming',count:o.paymentUpcoming,label:proCount(o.paymentUpcoming,en,['cuota vence','cuotas vencen'],['installment due','installments due'])+t(' en los próximos 7 días',' in the next 7 days'),view:'costs'},
  {key:'payment-awaiting',count:o.paymentAwaiting?1:0,label:t('Plan de pagos esperando la aceptación del cliente','Payment plan waiting for the customer to accept'),view:'costs'},
  {key:'allowances',count:o.allowancesPending,label:proCount(o.allowancesPending,en,['monto previsto sin definir','montos previstos sin definir'],['allowance not decided','allowances not decided']),view:'allowances'},
 ] satisfies {key:string;count:number;label:string;view:View}[]).filter(item=>item.count>0):[];
 return <div className="space-y-3"><OverviewLayoutBar layout={layout} onChange={setLayout} titles={widgetTitles} disabled={disabled}/>
 <section data-work-overview data-work-summary-blocks aria-label={t('Resumen del proyecto','Project overview')} className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-3">
  <Widget place={placeOf("client")} name="client" title={t('Cliente','Customer')} state={state(client)} footer={go('client',t('Abrir vista del cliente','Open customer view'))}>
   {c&&(c.client?<><p data-work-overview-client-name className="break-words font-semibold">{c.client.name}{c.client.archived?' · '+t('archivado','archived'):''}</p>
    <dl className="space-y-1">{c.client.phone&&<Row label={t('Teléfono','Phone')} value={<a className="underline" href={'tel:'+c.client.phone.replace(/[^\d+]/g,'')}>{proPhone(c.client.phone)}</a>}/>}{c.client.email&&<Row stack label={t('Correo','Email')} value={<span title={c.client.email} className="[overflow-wrap:anywhere]">{c.client.email.includes("@")?<>{c.client.email.slice(0,c.client.email.lastIndexOf("@"))}<wbr/>{c.client.email.slice(c.client.email.lastIndexOf("@"))}</>:c.client.email}</span>}/>}{c.client.address&&<Row stack label={t('Dirección','Address')} value={<span className="break-words">{c.client.address}</span>}/>}</dl>
    {!c.client.phone&&!c.client.email&&<p className={muted}>{t('La ficha no tiene teléfono ni correo.','The customer record has no phone or email.')}</p>}</>:<p className={muted}>{t('Este trabajo no tiene una ficha de cliente.','This job has no customer record.')}</p>)}
   {c&&<p data-work-overview-link={c.linked?'linked':c.pendingInvitation?'invited':'none'} className={'rounded-lg p-2 text-sm '+(c.linked?'bg-[#eef8f4] text-[#18573a]':'bg-[#f3f8fb] text-[#3d5068]')}>{c.linked?t('Cuenta vinculada: ','Linked account: ')+c.linked.name:c.pendingInvitation?t('Invitación enviada, esperando que el cliente la acepte.','Invitation sent, waiting for the customer to accept it.'):t('Sin cuenta de cliente vinculada. Puede invitarlo desde Vista del cliente.','No linked customer account. You can invite them from Customer view.')}</p>}
  </Widget>
  <Widget place={placeOf("next")} name="next" legacy="next" title={t('Próximos pasos','Next steps')} state={{loading:!facts,failed:header.failed,retry:header.retry,en}}>
   {facts&&(finished?<p className={muted}>{facts.phase==='completed'?t('Este trabajo está finalizado.','This job is completed.'):t('Este trabajo está cancelado.','This job is cancelled.')}</p>:
    <ul className="space-y-2">{steps.map(step=><li key={step.key} data-work-summary-step={step.key} data-done={step.done?'true':'false'} className="text-sm"><span aria-hidden className={'mr-2 inline-block h-2.5 w-2.5 rounded-full '+(step.done?'bg-[#1d8a52]':'bg-[#d7e1ea]')}/>{step.label}{step.action&&<Button type="button" variant="outline" className="mt-1 block min-h-11" disabled={disabled} onClick={()=>onOpen(step.action!.view)}>{step.action.label}</Button>}</li>)}</ul>)}
  </Widget>
  <Widget place={placeOf("schedule")} name="schedule" legacy="schedule" title={t('Cronograma y tareas','Schedule and tasks')} state={state(schedule)} footer={<>{go('schedule',t('Abrir cronograma','Open schedule'))}{go('tasks',t('Abrir tareas','Open tasks'))}</>}>
   {s&&<><p className="text-sm">{dated?period:s.planStart&&s.planEnd?`${t('Plan','Plan')}: ${day(s.planStart)} – ${day(s.planEnd)}`:t('Todavía sin programar.','Not scheduled yet.')}</p>
    {s.nextTasks.length?<><p className="text-xs font-semibold uppercase tracking-wide text-[#68778d]">{t('Próximas tareas','Next tasks')} · {proCount(s.openTasks,en,['abierta','abiertas'],['open','open'])}</p><ul className="space-y-1">{s.nextTasks.map(task=><li key={task.id} data-work-overview-task className="flex justify-between gap-3 text-sm"><span className="min-w-0 break-words">{task.title}{task.punch?' · '+t('pendiente final','punch item'):''}</span><span className={'shrink-0 '+(task.overdue?'font-semibold text-[#8a2a1b]':'text-[#52627a]')}>{task.dueDate?(task.overdue?t('Vencida ','Overdue ')+day(task.dueDate):day(task.dueDate)):task.plannedStart&&task.plannedEnd?(task.overdue?t('Vencida ','Overdue '):'')+(task.plannedStart===task.plannedEnd?day(task.plannedEnd):day(task.plannedStart)+' – '+day(task.plannedEnd)):t('Sin fecha','No date')}</span></li>)}</ul></>:<p className={muted}>{t('No hay tareas abiertas.','No open tasks.')}</p>}
    {s.keyDates.length>0&&<><p className="text-xs font-semibold uppercase tracking-wide text-[#68778d]">{t('Fechas clave','Key dates')}</p><ul className="space-y-1">{s.keyDates.map(item=><li key={item.id} className="flex justify-between gap-3 text-sm"><span className="min-w-0 break-words">{item.title}</span><span className="shrink-0 text-[#52627a]">{day(item.date)}</span></li>)}</ul></>}</>}
  </Widget>
  <Widget place={placeOf("finance")} name="finance" legacy="figures" title={t('Finanzas','Finances')} state={state(finance)} footer={go('costs',t('Costos y pagos','Costs and payments'))}>
   {f&&<dl className="space-y-1">
    <Row label={t('Importe acordado','Agreed amount')} value={f.agreedCents===null?t('Sin definir','Not set'):money(f.agreedCents)+(f.agreedTaxCents?t(' (IVA incluido)',' (VAT included)'):'')}/>
    {f.agreedCents!==null&&!!f.agreedTaxCents&&f.agreedNetCents!==null&&<Row label={t('Acordado sin IVA','Agreed before VAT')} value={money(f.agreedNetCents)} attr={{'data-work-overview-agreed-net':''}}/>}
    <Row label={t('Facturado','Invoiced')} value={money(f.invoicedCents)} attr={{'data-work-overview-invoiced':''}}/>
    <Row label={t('Abonos recibidos','Payments received')} value={money(f.paidCents)}/>
    {f.balanceCents!==null&&<Row label={t('Saldo del cliente','Customer balance')} value={money(f.balanceCents)} attr={{'data-work-summary-balance':''}}/>}
    {f.creditCents>0&&<Row label={t('A favor del cliente','Customer credit')} value={money(f.creditCents)}/>}
    {f.costsHidden?<p role="status" data-work-overview-costs-hidden className="text-xs text-[#52627a]">{t('Su rol en esta empresa no permite ver costos ni el resultado del trabajo.','Your role in this company does not allow viewing costs or the job result.')}</p>:<>
    <Row label={t('Costos registrados','Recorded costs')} value={money(f.costCents??0)} attr={{'data-work-overview-costs':''}}/>
    {(f.committedCents??0)>0&&<Row label={t('Comprometido en órdenes de compra','Committed in purchase orders')} value={money(f.committedCents??0)}/>}
    {(f.committedCents??0)>0&&<Row label={t('Costos y comprometido','Costs and committed')} value={money((f.costCents??0)+(f.committedCents??0))}/>}
    {/* Round 7A: like with like — agreed before VAT (when known) minus costs and purchase-order commitments. */}
    <Row label={f.resultBasis==='without_tax'?t('Resultado (sin IVA)','Result (before VAT)'):t('Resultado','Result')} value={f.resultCents===null?t('Sin calcular','Not calculated'):money((f.committedCents??0)>0&&f.resultWithCommittedCents!==null?f.resultWithCommittedCents:f.resultCents)} attr={{'data-work-overview-result':''}}/>
    {f.resultCents!==null&&<p data-work-overview-result-basis className="text-xs text-[#52627a]">{(f.resultBasis==='without_tax'?t('Acordado sin IVA','Agreed before VAT'):t('Importe acordado','Agreed amount'))+t(' menos costos registrados',' minus recorded costs')+((f.committedCents??0)>0?t(' y lo comprometido en órdenes de compra',' and purchase-order commitments'):'')+'.'}{f.resultBasis==='as_agreed'?t(' El importe acordado se registró a mano: si incluye IVA, el resultado también lo incluye.',' The agreed amount was entered by hand: if it includes VAT, so does the result.'):''}</p>}
    {f.resultCents===null&&<p className="text-xs text-[#52627a]">{f.agreedCents===null?t('Defina el importe acordado para calcular el resultado.','Set the agreed amount to calculate the result.'):t('Hay horas sin costo por hora; complételas en Costos y pagos.','Some hours have no hourly cost; complete them in Costs and payments.')}</p>}</>}
   </dl>}
  </Widget>
  <Widget place={placeOf("activity")} name="activity" title={t('Actividad reciente','Recent activity')} state={state(activity)} footer={<>{go('updates',t('Abrir avances y archivos','Open updates and files'))}{go('changes',t('Abrir extras y cambios','Open extras and changes'))}</>}>
   {a&&(a.items.length?<ul className="space-y-2">{a.items.map(item=><li key={item.kind+item.id} data-work-overview-activity={item.kind}><button type="button" disabled={disabled} onClick={()=>onOpen(kindView[item.kind])} className="min-h-11 w-full rounded-lg px-2 py-1 text-left text-sm hover:bg-[#f3f8fb] disabled:opacity-50"><span className="block break-words font-semibold">{item.title||kind[item.kind]}</span><span className="block text-xs text-[#52627a]">{kind[item.kind]} · {stampDay(item.at)}{item.kind==='change'&&item.status?' · '+changeStatus[item.status]:item.shared?' · '+t('compartido con el cliente','shared with the customer'):''}</span></button></li>)}</ul>:<p className={muted}>{t('Todavía no hay archivos, resúmenes, avances ni cambios.','No files, summaries, updates or changes yet.')}</p>)}
  </Widget>
  <Widget place={placeOf("open")} name="open" title={t('Pendientes','Open items')} state={state(open)}>
   {o&&(openItems.length?<ul className="space-y-1">{openItems.map(item=><li key={item.key} data-work-overview-open={item.key}><button type="button" disabled={disabled} onClick={()=>onOpen(item.view)} className="min-h-11 w-full rounded-lg px-2 py-1 text-left text-sm font-semibold text-[#162543] underline-offset-2 hover:bg-[#f3f8fb] hover:underline disabled:opacity-50">{item.label}</button></li>)}</ul>:<p data-work-overview-open-empty className={muted}>{t('No hay pendientes: tareas, aprobaciones y respuestas del cliente están al día.','Nothing open: tasks, approvals and customer answers are up to date.')}</p>)}
  </Widget>
 </section></div>;
}

/** Launch fix I1: the job's «Next step» card follows the quote state (shared, accepted) instead of always asking to share it. */
export function WorkQuoteNextStep({workId,fallback}:{workId:string;fallback:string}){
 const en=useLocale()==='en',t=(es:string,english:string)=>en?english:es,{facts}=useFacts(workId),open=usePart(workId,'open');
 if(!facts)return <>{fallback}</>;
 if(facts.estimateAccepted)return <>{t('Cotización aceptada: planifique las fechas del trabajo y prepare el contrato.','Quote accepted: plan the job dates and prepare the contract.')}</>;
 if(facts.estimateAwaitingContinue)return <>{t('El cliente aceptó la cotización: continúela en este trabajo.','The customer accepted the quote: continue it into this job.')}</>;
 if((open.data?.quotesWaiting??0)>0)return <>{t('Cotización compartida: espere la respuesta del cliente. Mientras tanto puede preparar el contrato o planificar las fechas.','Quote shared: wait for the customer\'s answer. Meanwhile you can prepare the contract or plan the dates.')}</>;
 return <>{fallback}</>;
}
