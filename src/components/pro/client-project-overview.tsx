'use client';
import {useCallback,useEffect,useRef,useState,type ReactNode} from 'react';
import {useLocale} from 'next-intl';
import {useAuth} from '@/hooks/use-auth';
import {Button} from '@/components/ui/button';
import {CLIENT_SECTION_OPEN_EVENT,clientProjectOverviewSchema,clientSectionAnchor,type ClientProjectOverview} from '@/lib/pro/round12';
import {privateEstimateMoney} from './private-estimate-preview';

const api='/api/pro/client-project-overview';
type Section='messages'|'quotes'|'finances'|'payment-plan'|'selections'|'schedule'|'contracts'|'changes'|'files';
/**
 * Round 12: «Resumen de su proyecto» at the top of the customer's project (also in the owner's
 * Customer view preview, where it runs as the linked customer). Widgets: approvals waiting for the
 * customer, payments, schedule, messages and latest files; each one jumps to its section below.
 * Read-only: every decision is still taken in its own section with its own writer.
 */
export function ClientProjectOverview({requestId}:{requestId:string}){
 const {user,loading}=useAuth();if(loading||!user)return null;
 return <OverviewSession key={user.id+':'+requestId} accountId={user.id} requestId={requestId}/>;
}

function OverviewSession({accountId,requestId}:{accountId:string;requestId:string}){
 const en=useLocale()==='en',t=(es:string,english:string)=>en?english:es;
 const [view,setView]=useState<ClientProjectOverview|null>(null),[error,setError]=useState(false),[loading,setLoading]=useState(true),active=useRef(true),sequence=useRef(0);
 const load=useCallback(async()=>{const id=++sequence.current;setLoading(true);setError(false);try{const response=await fetch(api+'?'+new URLSearchParams({requestId}),{cache:'no-store',headers:{'X-Pro-Expected-Actor':accountId}});if(response.status===404){if(active.current&&id===sequence.current)setView({visible:false});return;}if(!response.ok)throw Error();const body=clientProjectOverviewSchema.parse(await response.json());if(active.current&&id===sequence.current)setView(body);}catch{if(active.current&&id===sequence.current)setError(true);}finally{if(active.current&&id===sequence.current)setLoading(false);}},[accountId,requestId]);
 useEffect(()=>{active.current=true;const counter=sequence,timer=setTimeout(()=>void load(),0);return()=>{active.current=false;counter.current++;clearTimeout(timer);};},[load]);
 if(error&&!view)return <div role="alert" data-client-overview-error className="space-y-2 rounded-2xl border border-[#d7e1ea] p-4 text-sm"><p>{t('No se pudo cargar el resumen de su proyecto.','Could not load your project summary.')}</p><Button type="button" variant="secondary" disabled={loading} onClick={()=>void load()}>{t('Reintentar','Retry')}</Button></div>;
 if(!view)return <p role="status" className="text-sm text-[#52627a]">{t('Cargando el resumen de su proyecto…','Loading your project summary…')}</p>;
 if(!view.visible)return null;
 const money=(cents:number,currency:'CRC'|'USD'='CRC')=>privateEstimateMoney(cents,currency,en);
 const day=(value:string)=>new Intl.DateTimeFormat(en?'en-US':'es-CR',{dateStyle:'medium',timeZone:'America/Costa_Rica'}).format(new Date(value.length===10?value+'T12:00:00-06:00':value));
 const when=(value:string)=>new Intl.DateTimeFormat(en?'en-US':'es-CR',{dateStyle:'medium',timeStyle:'short',timeZone:'America/Costa_Rica'}).format(new Date(value));
 // Sections below load on their own: if one above finishes after the jump, settle on the target again.
 const go=(section:Section)=>{window.dispatchEvent(new CustomEvent(CLIENT_SECTION_OPEN_EVENT,{detail:{requestId,section}}));const el=document.getElementById(clientSectionAnchor(requestId,section));if(!el)return;el.scrollIntoView({behavior:'smooth',block:'start'});
  // Fix 13: a section still loading is empty (hidden); keep settling on it for a few seconds until it has content.
  let tries=0;const settle=()=>{tries++;const box=el.getBoundingClientRect();if(box.height>0&&(box.top<0||box.top>window.innerHeight*0.4))el.scrollIntoView({block:'start'});if(tries<12&&(box.height===0||tries<3))window.setTimeout(settle,500);};window.setTimeout(settle,900);};
 const stage:Record<string,string>={new:t('Por programar','To be scheduled'),scheduled:t('Programado','Scheduled'),in_progress:t('En curso','In progress'),completed:t('Terminado','Completed'),cancelled:t('Cancelado','Cancelled')};
 const kindLabel:Record<string,string>={quote:t('Cotización','Quote'),contract:t('Contrato','Contract'),selection:t('Selección','Selection'),change:t('Cambio o extra','Change order'),payment_plan:t('Plan de pagos','Payment plan')};
 const kindSection:Record<string,Section>={quote:'quotes',contract:'contracts',selection:'selections',change:'changes',payment_plan:'payment-plan'};
 const kindAction:Record<string,string>={quote:t('Revisar y responder','Review and respond'),contract:t('Revisar y firmar','Review and sign'),selection:t('Elegir opción','Choose an option'),change:t('Revisar cambio','Review change'),payment_plan:t('Revisar plan','Review plan')};
 const inst=view.installments,fin=view.finances,sched=view.schedule,msgs=view.messages,files=view.files;
 const nav:Array<[Section,string]>=[['messages',t('Mensajes','Messages')],['quotes',t('Cotizaciones','Quotes')],...(files?[['files',t('Archivos','Files')] as [Section,string]]:[]),...(fin?[['finances',t('Finanzas','Finances')] as [Section,string]]:[]),...(inst?[['payment-plan',t('Plan de pagos','Payment plan')] as [Section,string]]:[]),...(sched?[['schedule',t('Cronograma','Schedule')] as [Section,string]]:[]),['changes',t('Cambios','Changes')]];
 return <section data-client-overview aria-labelledby={'overview-'+requestId} className="@container min-w-0 space-y-4 rounded-2xl border border-[#d7e1ea] bg-white p-4">
  <div className="flex flex-wrap items-start justify-between gap-3">
   <div className="min-w-0"><h3 id={'overview-'+requestId} className="text-lg font-bold">{t('Resumen de su proyecto','Your project at a glance')}</h3>
    <p className="mt-1 break-words text-sm text-[#52627a]">{view.professionalName?t(`Con ${view.professionalName}`,`With ${view.professionalName}`):view.workTitle}{' · '}<span data-client-overview-stage className="font-semibold text-[#162543]">{stage[view.stage]??view.stage}</span></p>
    {view.nextVisit&&<p data-client-overview-visit className="mt-1 text-sm text-[#52627a]">{t('Próxima visita: ','Next visit: ')}<span className="font-semibold text-[#162543]">{when(view.nextVisit)}</span></p>}
   </div>
   <Button type="button" variant="secondary" disabled={loading} onClick={()=>void load()}>{loading?t('Actualizando…','Refreshing…'):t('Actualizar','Refresh')}</Button>
  </div>
  <nav aria-label={t('Secciones del proyecto','Project sections')} data-client-overview-nav className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]">
   {nav.map(([key,label])=><button key={key} type="button" onClick={()=>go(key)} data-client-overview-chip={key} className="min-h-11 shrink-0 whitespace-nowrap rounded-xl border border-[#d7e1ea] px-3 py-2 text-sm font-semibold text-[#52627a] hover:bg-[#f3f8fb]">{label}{key==='messages'&&(msgs?.unread??0)>0&&<span className="ml-2 inline-block rounded-full bg-[#d14343] px-2 text-xs font-bold text-white">{msgs!.unread}</span>}</button>)}
  </nav>
  <div className="grid gap-3 @2xl:grid-cols-2">
   <Widget title={t('Pendiente de su aprobación','Waiting for your approval')} data="approvals" wide>
    {view.approvals.length===0?<p className="text-sm text-[#52627a]">{t('No tiene nada pendiente por aprobar.','Nothing is waiting for your approval.')}</p>:
    <ul className="divide-y divide-[#e6edf3]">{view.approvals.map(item=><li key={item.kind+':'+item.id} data-client-overview-approval={item.kind} className="flex flex-wrap items-center justify-between gap-2 py-2">
     <div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wide text-[#68778d]">{kindLabel[item.kind]}{item.overdue?<span className="ml-2 text-[#b42318]">{t('Fecha vencida','Past due date')}</span>:null}</p>
      <p className="break-words text-sm font-semibold">{item.title||(item.kind==='payment_plan'?t('Plan de pagos propuesto','Proposed payment plan'):item.code||kindLabel[item.kind])}{item.area?<span className="font-normal text-[#52627a]"> · {item.area}</span>:null}</p>
      <p className="text-xs text-[#52627a]">{typeof item.amountCents==='number'?(item.kind==='change'&&item.amountCents>0?'+':'')+money(item.amountCents,item.currency??'CRC'):''}{item.kind==='selection'&&item.date?t(`Decidir antes del ${day(item.date)}`,`Decide by ${day(item.date)}`):''}</p></div>
     <Button type="button" variant="secondary" onClick={()=>go(kindSection[item.kind])}>{kindAction[item.kind]}</Button>
    </li>)}</ul>}
   </Widget>
   {(fin||inst)&&<Widget title={t('Pagos','Payments')} data="payments">
    {fin&&<dl className="grid grid-cols-2 gap-2 text-sm"><div><dt className="text-xs text-[#52627a]">{t('Abonado','Paid')}</dt><dd data-client-overview-paid className="font-bold">{money(fin.paidCents)}</dd></div><div><dt className="text-xs text-[#52627a]">{t('Saldo pendiente','Balance due')}</dt><dd data-client-overview-balance className="font-bold">{fin.balanceCents===null?t('Sin definir','Not set'):money(fin.balanceCents)}</dd></div></dl>}
    {inst&&<div className="space-y-1 text-sm">
     {inst.overdueCount>0&&<p data-client-overview-overdue role="status" className="rounded-xl bg-[#fdecec] p-2 font-semibold text-[#8a1c1c]">{inst.overdueCount===1?t(`Tiene 1 cuota vencida (${money(inst.overdueCents)}).`,`You have 1 overdue installment (${money(inst.overdueCents)}).`):t(`Tiene ${inst.overdueCount} cuotas vencidas (${money(inst.overdueCents)}).`,`You have ${inst.overdueCount} overdue installments (${money(inst.overdueCents)}).`)}</p>}
     {inst.next?<p data-client-overview-next-installment>{inst.next.status==='overdue'?t('Cuota pendiente más antigua: ','Oldest unpaid installment: '):t('Próxima cuota: ','Next installment: ')}<span className="font-semibold">{money(inst.next.amountCents)}</span>{inst.next.status==='overdue'?t(', venció el ',', due on '):t(' el ',' on ')}{day(inst.next.dueDate)}</p>:<p className="text-[#52627a]">{t('No hay cuotas pendientes.','No installments pending.')}</p>}
    </div>}
    <div className="flex flex-wrap gap-2">{fin&&<Button type="button" variant="secondary" onClick={()=>go('finances')}>{t('Ver finanzas','View finances')}</Button>}{inst&&<Button type="button" variant="secondary" onClick={()=>go('payment-plan')}>{t('Ver plan de pagos','View payment plan')}</Button>}</div>
   </Widget>}
   {sched&&<Widget title={t('Cronograma','Schedule')} data="schedule">
    {sched.total>0&&<div><div className="h-2 overflow-hidden rounded-full bg-[#e6edf3]" role="progressbar" aria-label={t('Avance de tareas','Task progress')} aria-valuemin={0} aria-valuemax={sched.total} aria-valuenow={sched.done}><div className="h-full bg-[#008bb5]" style={{width:Math.round(sched.done/sched.total*100)+'%'}}/></div><p className="mt-1 text-xs text-[#52627a]">{t(`${sched.done} de ${sched.total} tareas terminadas`,`${sched.done} of ${sched.total} tasks done`)}</p></div>}
    {sched.nextMilestone?<p className="text-sm">{t('Próxima fecha clave: ','Next key date: ')}<span className="font-semibold">{sched.nextMilestone.title}</span>{' · '}{day(sched.nextMilestone.date)}</p>:<p className="text-sm text-[#52627a]">{t('Sin fechas clave próximas.','No upcoming key dates.')}</p>}
    {sched.plannedEnd&&<p className="text-xs text-[#52627a]">{t('Fin previsto: ','Planned end: ')}{day(sched.plannedEnd)}</p>}
    <Button type="button" variant="secondary" onClick={()=>go('schedule')}>{t('Ver cronograma','View schedule')}</Button>
   </Widget>}
   {/* Fix 14: no separate «Mensajes» card here; the chip above opens the single conversation card below (unread count and last message live there). */}
   {files&&<Widget title={t('Archivos recientes','Recent files')} data="files">
    {files.items.length===0?<p className="text-sm text-[#52627a]">{t('Su profesional todavía no ha compartido archivos.','Your professional has not shared files yet.')}</p>:<ul className="space-y-1 text-sm">{files.items.map(f=><li key={f.id} className="break-words">{f.name}{f.publishedAt&&<span className="text-xs text-[#52627a]"> · {day(f.publishedAt)}</span>}</li>)}</ul>}
    <Button type="button" variant="secondary" onClick={()=>go('files')}>{t('Ver archivos','View files')}</Button>
   </Widget>}
  </div>
 </section>;
}

function Widget({title,data,wide=false,children}:{title:string;data:string;wide?:boolean;children:ReactNode}){
 return <div data-client-overview-widget={data} className={'min-w-0 space-y-3 rounded-2xl bg-[#f7fafc] p-3'+(wide?' @2xl:col-span-2':'')}><h4 className="text-sm font-bold">{title}</h4>{children}</div>;
}
