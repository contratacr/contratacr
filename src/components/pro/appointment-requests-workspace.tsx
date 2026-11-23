'use client';
import {AppointmentReminderPreference} from './appointment-reminder-preference';
import {useCallback,useEffect,useRef,useState,type FormEvent,type ReactNode} from 'react';
import {useLocale,useTranslations} from 'next-intl';
import {useRouter} from '@/i18n/navigation';
import {Modal} from '@/components/ui/modal';
import {Button} from '@/components/ui/button';
import {useAppDialog} from '@/hooks/use-app-dialog';
import {appointmentMutationSchema,appointmentStatuses,type AppointmentPage,type AppointmentDetail,type AppointmentMutation,type AppointmentEvent} from '@/lib/pro/appointment-requests';
import {closeProStep,currentProPath,navigatePro,pushProParams,replaceProParams,PRO_PATH_CHANGED} from '@/lib/pro/navigation';
import {crTodayISO} from '@/lib/time-cr';
import {registerProTraversalGuard,useProSearchParams} from './use-pro-search-params';
import {appointmentCopy,appointmentDate,appointmentDay,appointmentField,crInput} from './appointment-copy';
import {useProChildNavigationGuard,PRO_SERVICE_REFRESH} from './use-pro-child-guard';
import {VisitPreparationAnswers} from './visit-preparation';
import {ClientWorkSections} from './client-work-sections';
import {AppointmentQuoteChoices,ClientQuoteChoices} from './quote-choices';
import {AppointmentReschedule} from './appointment-reschedule';
import {AppointmentDuration} from './appointment-duration';
import {RequestFollowup} from './request-followup';
import {clientProjectPagePath,markClientProjectFromApp} from '@/lib/pro/client-project-route';
import {PRO_UI_ENABLED} from '@/lib/pro/enabled-client';
// Fix 14: the customer's project page exists only where the Pro suite runs (development, like the job page).
const clientProjectPageEnabled=PRO_UI_ENABLED;
const api='/api/pro/appointment-requests';
export function AppointmentRequestsWorkspace({side,compactEmpty=false}:{side:'provider'|'client';compactEmpty?:boolean}){
 const router=useRouter();
 const language=useLocale(),simple=useTranslations('ProSimple'),copy=appointmentCopy[language==='en'?'en':'es'],params=useProSearchParams(),id=params.get('citaSolicitud'),rawStatus=params.get('estadoCitaSolicitud')??(side==='provider'?'requested':''),status=appointmentStatuses.includes(rawStatus as typeof appointmentStatuses[number])?rawStatus:'';
 const key=side+':'+status,[page,setPage]=useState<{key:string;data:AppointmentPage}|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[errorKey,setErrorKey]=useState(''),[retryCursor,setRetryCursor]=useState(''),[tick,setTick]=useState(0),sequence=useRef(0),busy=useRef(false);
 const load=useCallback(async(after='')=>{const current=++sequence.current;busy.current=true;setLoading(true);setError('');setRetryCursor(after);try{const response=await fetch(api+'?'+new URLSearchParams({view:side,...(status?{status}:{}),...(after?{after}:{})}),{cache:'no-store'}),body:AppointmentPage=await response.json();if(!response.ok||!Array.isArray(body.items))throw Error();if(current!==sequence.current)return;setPage(previous=>({key,data:{...body,items:after&&previous?.key===key?[...previous.data.items,...body.items.filter(row=>!previous.data.items.some(old=>old.id===row.id))]:body.items}}));}catch{if(current===sequence.current){setErrorKey(key);setError(copy.loadError);}}finally{if(current===sequence.current){busy.current=false;setLoading(false);}}},[side,status,key,copy.loadError]);
 const invalidate=useCallback(()=>{sequence.current++;busy.current=false;},[]);
 useEffect(()=>{const timer=setTimeout(()=>void load(),0);return()=>{clearTimeout(timer);invalidate();};},[load,tick,invalidate]);
 useEffect(()=>{const refresh=()=>setTick(value=>value+1);window.addEventListener('contratacr:appointments-changed',refresh);return()=>window.removeEventListener('contratacr:appointments-changed',refresh);},[]);
 const current=page?.key===key?page.data:null,shownError=errorKey===key?error:'';
 // An empty inbox must not push the actual agenda below an entire form of filters.
 if(compactEmpty&&side==='provider'&&current&&!current.items.length&&!current.nextCursor&&!status&&!shownError&&!id)return <section aria-label={copy.providerTitle} data-appointment-requests className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#f7f9fc] p-3"><p className="text-sm text-[#52627a]">{language==='en'?'No appointment requests.':'No hay solicitudes de citas.'}</p><Button type="button" variant="ghost" disabled={loading} onClick={()=>setTick(value=>value+1)}>{copy.refresh}</Button></section>;
 return <section aria-label={side==='provider'?copy.providerTitle:copy.myAppointments} data-appointment-requests className="space-y-4">
  {side==='provider'&&<div><h2 className="text-lg font-bold text-[#162543]">{copy.providerTitle}</h2><p className="mt-1 text-sm text-[#52627a]">{copy.providerHint}</p></div>}
  {side==='client'&&<ClientQuoteChoices/>}
  <label className="block text-sm font-semibold">{side==='client'?copy.showAppointments:copy.show}<select aria-label={side==='client'?copy.showAppointments:copy.show} className={appointmentField} value={status} onChange={event=>replaceProParams({estadoCitaSolicitud:event.target.value||'all'})}><option value="">{copy.all}</option>{appointmentStatuses.map(value=><option key={value} value={value}>{copy.status[value]}</option>)}</select></label>
  {shownError&&<div role="alert" className="space-y-2"><p>{shownError}</p><Button type="button" variant="secondary" disabled={loading} onClick={()=>void load(retryCursor)}>{copy.retry}</Button></div>}
  {loading&&!current?<p role="status">{copy.loadingRequests}</p>:current&&<><div className="grid gap-3">{current.items.map(row=><article key={row.id} className="rounded-2xl border border-[#d7e1ea] p-4"><button type="button" aria-label={`${copy.viewRequest}: ${row.service}`} disabled={loading||!!shownError} className="min-h-11 w-full space-y-1 text-left text-[#162543]" onClick={()=>{if(side==='client'&&row.workId&&clientProjectPageEnabled){markClientProjectFromApp(row.id);router.push(clientProjectPagePath(row.id));return;}pushProParams({citaSolicitud:row.id});}}><h3 className="break-words font-semibold">{row.service}</h3><p className="break-words text-sm">{side==='provider'?row.clientName:row.professionalName}</p><p className="text-sm font-semibold text-[#0089bb]">{copy.status[row.status]}</p>{side==='provider'&&<p className="text-sm text-[#52627a]">{simple(row.status==='requested'?'requestAction':row.status==='proposed'?'proposalWaiting':row.status==='confirmed'?'confirmedAction':row.status==='completed'?'completedAction':'closedRequest')}</p>}<p className="text-sm text-[#52627a]">{appointmentDate(row.start||row.proposedStart||row.requestedStart,language)||copy.noTime}</p></button></article>)}</div>{!current.items.length&&!shownError&&<p className="text-sm text-[#52627a]">{copy.empty}</p>}{current.nextCursor!==null&&<Button type="button" variant="secondary" disabled={loading||!!shownError} onClick={()=>{if(!busy.current)void load(String(current.nextCursor));}}>{copy.more}</Button>}</>}
  <Button type="button" variant="secondary" disabled={loading} onClick={()=>setTick(value=>value+1)}>{copy.refresh}</Button>
  {side==='client'&&<AppointmentReminderPreference/>}
  {id&&<AppointmentRequestDetail key={side+':'+id} id={id} side={side} onChanged={()=>setTick(value=>value+1)} onClose={()=>closeProStep('citaSolicitud')}/>}
 </section>;
}
export function AppointmentRequestDetail({id,side,onChanged,onClose,proLeadStage,proLeadState,presentation='modal'}:{id:string;side:'provider'|'client';onChanged:()=>void;onClose:()=>void;proLeadStage?:(context:{blocked:boolean})=>ReactNode;proLeadState?:{dirty:boolean;busy:boolean};presentation?:'modal'|'page'}){
 const router=useRouter();
 const journey=useTranslations('ProJourney'),clientJourney=useTranslations('ClientJourney');
 const [preparingQuote,setPreparingQuote]=useState(false),quoteBusy=useRef(false);
 const language=useLocale(),copy=appointmentCopy[language==='en'?'en':'es'],[detail,setDetail]=useState<AppointmentDetail|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState(''),[saving,setSaving]=useState(false),[uncertain,setUncertain]=useState(false),[pendingRead,setPendingRead]=useState(false),[editing,setEditing]=useState(false),[day,setDay]=useState(crTodayISO),[time,setTime]=useState(''),[duration,setDuration]=useState(60),[note,setNote]=useState(''),[dirty,setDirty]=useState(false),[historyError,setHistoryError]=useState(''),[leadNavigationWarning,setLeadNavigationWarning]=useState(false);
 const sequence=useRef(0),busy=useRef(false),pending=useRef<AppointmentMutation|null>(null),confirming=useRef(false),allowExit=useRef(false),{confirm,dialogNode}=useAppDialog(),[now]=useState(()=>Date.now());
 const load=useCallback(async(after='')=>{const current=++sequence.current;setLoading(true);if(after)setHistoryError('');else setError('');try{const response=await fetch(api+'?'+new URLSearchParams({view:'detail',id,...(after?{after}:{})}),{cache:'no-store'}),body:AppointmentDetail=await response.json();if(!response.ok||body.request?.id!==id||body.request.side!==side||!Array.isArray(body.events))throw Error();if(current!==sequence.current)return false;setDetail(previous=>({...body,events:after&&previous?.request.id===id?[...previous.events,...body.events.filter(event=>!previous.events.some(old=>old.position===event.position))]:body.events}));setPendingRead(false);return true;}catch{if(current===sequence.current){if(after)setHistoryError(copy.detailError);else setError(copy.detailError);}return false;}finally{if(current===sequence.current)setLoading(false);}},[id,side,copy.detailError]);
 const invalidate=useCallback(()=>{sequence.current++;},[]);
 useEffect(()=>{const timer=setTimeout(()=>void load(),0);return()=>{clearTimeout(timer);invalidate();};},[load,invalidate]);
 const [dailyState,setDailyState]=useState({dirty:false,busy:false}),[followupState,setFollowupState]=useState({dirty:false,busy:false}),[prepState,setPrepState]=useState({dirty:false,busy:false}),[deliveryState,setDeliveryState]=useState({dirty:false,busy:false}),[changeState,setChangeState]=useState({dirty:false,busy:false}),[quoteState,setQuoteState]=useState({dirty:false,busy:false}),[rescheduleState,setRescheduleState]=useState({dirty:false,busy:false});
 const baseChildBlocked=[dailyState,followupState,prepState,deliveryState,changeState,quoteState,rescheduleState].some(value=>value.dirty||value.busy);
 const childBlocked=baseChildBlocked||!!proLeadState&&(proLeadState.dirty||proLeadState.busy);
 const blocked=saving||uncertain||pendingRead||childBlocked;
 const leadBlocked=!!proLeadStage&&!!proLeadState&&(proLeadState.dirty||proLeadState.busy),onlyLeadBlocked=leadBlocked&&!baseChildBlocked&&!saving&&!uncertain&&!pendingRead&&!dirty;
 useEffect(()=>{if(!leadNavigationWarning||leadBlocked)return;const timer=setTimeout(()=>setLeadNavigationWarning(false),0);return()=>clearTimeout(timer);},[leadNavigationWarning,leadBlocked]);
 const warnNavigation=useCallback(()=>{if(onlyLeadBlocked)setLeadNavigationWarning(true);else setError(language==='en'?'Save or cancel the service changes before leaving.':'Guarde o cancele los cambios del servicio antes de salir.');},[language,onlyLeadBlocked]);
 useProChildNavigationGuard(blocked||dirty,warnNavigation);
 const [serviceTick,setServiceTick]=useState(0),handledTick=useRef(0);
 useEffect(()=>{const refresh=()=>setServiceTick(value=>value+1);window.addEventListener('contratacr:appointments-changed',refresh);return()=>window.removeEventListener('contratacr:appointments-changed',refresh);},[]);
 useEffect(()=>{if(serviceTick>handledTick.current&&!blocked&&!dirty&&!loading){handledTick.current=serviceTick;void load();}},[serviceTick,blocked,dirty,loading,load]);
 const mayDiscard=useCallback(async()=>{if(blocked){if(onlyLeadBlocked)setLeadNavigationWarning(true);else setError(childBlocked?(language==='en'?'Save or cancel the service changes before leaving.':'Guarde o cancele los cambios del servicio antes de salir.'):copy.blockedClose);return false;}if(!dirty)return true;if(confirming.current)return false;confirming.current=true;try{return(await confirm({title:copy.discardTitle,description:copy.discardHint,confirmLabel:copy.discard,cancelLabel:copy.stay})).confirmed;}finally{confirming.current=false;}},[blocked,childBlocked,onlyLeadBlocked,language,dirty,confirm,copy]);
 async function close(){
  if(!await mayDiscard())return;
  allowExit.current=true;
  // A notification opens the detail directly, without a Pro parent entry.
  // Keep that explicit origin instead of leaving the user in the appointment list.
  if(new URLSearchParams(window.location.search).get('returnTo')==='/notificaciones'){
   router.replace('/notificaciones');return;
  }
  onClose();
 }
 useEffect(()=>{if(!dirty&&!blocked)return;const path=currentProPath(),state={...window.history.state};function unload(event:BeforeUnloadEvent){if(!allowExit.current){event.preventDefault();event.returnValue='';}}function back(event:PopStateEvent){if(allowExit.current)return false;event.stopImmediatePropagation();window.history.pushState(state,'',path);window.dispatchEvent(new Event(PRO_PATH_CHANGED));void mayDiscard().then(answer=>{if(answer){allowExit.current=true;window.history.back();}});return true;}const unregister=registerProTraversalGuard(back);window.addEventListener('beforeunload',unload);return()=>{unregister();window.removeEventListener('beforeunload',unload);};},[dirty,blocked,mayDiscard]);
 async function refresh(){if(!await mayDiscard())return;setEditing(false);setDirty(false);window.dispatchEvent(new Event(PRO_SERVICE_REFRESH));void load();}
 async function mutate(input:AppointmentMutation){if(busy.current)return;busy.current=true;pending.current=input;setSaving(true);setError('');setNotice('');
  try{const response=await fetch(api,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});let body;try{body=await response.json();}catch{throw Error();}if(response.status>=500)throw Error();if(!response.ok){pending.current=null;setUncertain(false);setError(response.status===409&&typeof body.error==='string'&&body.error.includes('respuestas')?(language==='en'?'Required preparation answers are missing. Complete them before confirming.':body.error):response.status===409?copy.conflict:copy.saveError);return;}if((body.id??body.request?.id)!==id)throw Error();
   // A durable receipt is success. A subsequent failed read must never retry the write.
   window.dispatchEvent(new Event('contratacr:appointments-changed'));pending.current=null;setUncertain(false);setPendingRead(true);setEditing(false);setDirty(false);setNotice(copy.changesSaved);onChanged();if(!await load())setError(copy.savedReadError);
  }catch{setUncertain(true);setError(copy.uncertain);}finally{busy.current=false;setSaving(false);}
 }
 const row=detail?.request;
 async function prepareQuote(){
  if(!row||side!=='provider'||blocked||dirty||loading||quoteBusy.current)return;
  const version=sequence.current;quoteBusy.current=true;setPreparingQuote(true);setError('');
  try{const response=await fetch('/api/pro/appointment-quote-context',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requestId:id})}),body=await response.json();if(!response.ok||body.requestId!==id||typeof body.clientId!=='string')throw Error();if(version!==sequence.current)return;navigatePro('quotes',{nueva:'1',cliente:body.clientId,solicitudOrigen:id,volverSolicitud:currentProPath()});}
  catch{if(version===sequence.current)setError(journey('quoteError'));}finally{quoteBusy.current=false;if(version===sequence.current)setPreparingQuote(false);}
 }

 async function act(action:'confirm'|'accept'|'decline'|'cancel'){
  if(!row||blocked||loading||confirming.current)return;confirming.current=true;
  try{const cancellation=action==='cancel',declining=action==='decline';const answer=await confirm({title:cancellation?copy.cancelTitle:declining?copy.declineTitle:copy.confirmationTitle,description:cancellation?copy.cancelHint:declining?copy.declineHint:copy.confirmationHint,confirmLabel:cancellation?(row.status==='confirmed'?copy.cancelAppointment:copy.cancelRequest):declining?copy.decline:action==='accept'?copy.accept:copy.confirm,cancelLabel:copy.stay});if(!answer.confirmed)return;const input=appointmentMutationSchema.parse({action,id,actionId:crypto.randomUUID(),revision:row.revision,...(cancellation||declining?{note:''}:{})});await mutate(input);}finally{confirming.current=false;}
 }
 function propose(){if(!row||blocked)return;const initial=crInput(row.proposedStart||row.requestedStart);setDay(initial.slice(0,10)||row.preferredDay||crTodayISO());setTime(initial.slice(11,16));setDuration(row.proposedDurationMinutes??row.durationMinutes);setNote('');setDirty(false);setEditing(true);setError('');setNotice('');}
 async function submit(event:FormEvent){event.preventDefault();if(!row||blocked||!['requested','proposed'].includes(row.status))return;const input=appointmentMutationSchema.safeParse({action:'propose',id,actionId:crypto.randomUUID(),revision:row.revision,start:day&&time?`${day}T${time}:00-06:00`:'',durationMinutes:duration,note});if(!input.success){setError(copy.invalidProposal);return;}await mutate(input.data);}
 const future=!!row?.start&&Date.parse(row.start)>now,terminal=!!row&&['declined','cancelled','completed'].includes(row.status),showActions=!!row&&!terminal&&!row.workCancelled&&row.workStage!=='completed'&&row.origin!=='project_invite';
 function historyLabel(event:AppointmentEvent){if(event.action==='reschedule')return language==='en'?'Appointment rescheduled':'Cita reprogramada';return copy.events[(event.action==='complete'?'completed':event.action) as keyof typeof copy.events]??copy.status[event.status];}
 // Fix 13: for the customer, a request linked to a job is «My project» (the job's own page in this dialog), not an appointment request.
 // Fix 14: a customer's linked job has its own page; the old dialog address (lists, notifications, invitations) is replaced by it, so Back returns where the customer came from.
 const toPage=presentation==='modal'&&side==='client'&&!!row?.workId&&clientProjectPageEnabled;
 useEffect(()=>{if(!toPage)return;const returnTo=new URLSearchParams(window.location.search).get('returnTo');markClientProjectFromApp(id);router.replace(clientProjectPagePath(id,returnTo==='/notificaciones'?returnTo:null));},[toPage,id,router]);
 const dialogTitle=side==='client'&&(row?.workId||presentation==='page')?(language==='en'?'My project':'Mi proyecto'):row?.origin==='project_invite'?(language==='en'?'Linked job':'Proyecto vinculado'):copy.detailTitle;
 if(toPage)return <p role="status" className="text-sm text-[#52627a]">{language==='en'?'Opening your project…':'Abriendo su proyecto…'}</p>;
 const body=<div className="space-y-4">
   {notice&&<p role="status" className="rounded-xl bg-[#eef8f4] p-3 text-sm text-[#18573a]">{notice}</p>}
   {leadNavigationWarning&&leadBlocked&&<p data-lead-navigation-warning role="alert" className="text-sm">{language==='en'?'Save or cancel the service changes before leaving.':'Guarde o cancele los cambios del servicio antes de salir.'}</p>}
   {error&&<div role="alert" className="space-y-2"><p>{error}</p>{uncertain?<Button type="button" variant="secondary" disabled={saving} onClick={()=>pending.current&&void mutate(pending.current)}>{copy.retryCheck}</Button>:<Button type="button" variant="secondary" disabled={saving||loading} onClick={()=>pendingRead?void load():void refresh()}>{copy.retry}</Button>}</div>}
   {loading&&!row?<p role="status">{copy.loadingRequests}</p>:row?<>
    {proLeadStage?.({blocked:saving||uncertain||pendingRead||baseChildBlocked||dirty||editing||preparingQuote})}<div><h3 className="break-words text-lg font-bold">{row.service}</h3><p className="mt-1 font-semibold text-[#0089bb]">{row.origin==='project_invite'?(language==='en'?'Linked job':'Proyecto vinculado'):copy.status[row.status]}</p></div>
    {side==='client'&&row.origin==='project_invite'&&<p data-client-next-step className="rounded-xl bg-[#f3f8fb] p-3 text-sm text-[#52627a]">{language==='en'?'You follow this job with your account. Here you will see what the professional shares with you.':'Usted sigue este trabajo con su cuenta. Aquí verá lo que el profesional le comparta.'}</p>}
    {side==='client'&&row.origin!=='project_invite'&&<p data-client-next-step className="rounded-xl bg-[#f3f8fb] p-3 text-sm text-[#52627a]">{clientJourney(row.workCancelled||row.status==='cancelled'?'requestCancelled':row.workStage==='completed'||row.status==='completed'?'requestCompleted':row.status==='proposed'?'requestProposed':row.status==='confirmed'?'requestConfirmed':row.status==='declined'?'requestDeclined':'requestWaiting')}</p>}
    {side==='provider'&&row.workId&&<Button type="button" variant="secondary" disabled={blocked||dirty||loading} onClick={()=>navigatePro('pro_agenda',{cita:row.workId!,volverCitaSolicitud:currentProPath()})}>{copy.work}</Button>}
    {side==='provider'&&showActions&&<div className="space-y-2"><Button type="button" disabled={blocked||dirty||loading||preparingQuote} onClick={()=>void prepareQuote()}>{journey(preparingQuote?'quotePreparing':'quote')}</Button><p className="text-xs text-[#52627a]">{journey('quoteHint')}</p></div>}
    {showActions&&!editing&&<div className="flex flex-wrap gap-2">{side==='provider'&&row.status==='requested'&&row.requestedStart&&<Button type="button" disabled={blocked||loading||Date.parse(row.requestedStart)<=now} onClick={()=>void act('confirm')}>{copy.confirm}</Button>}{side==='provider'&&['requested','proposed'].includes(row.status)&&<><Button type="button" variant="secondary" disabled={blocked||loading} onClick={propose}>{copy.propose}</Button><Button type="button" variant="secondary" disabled={blocked||loading} onClick={()=>void act('decline')}>{copy.decline}</Button></>}{side==='client'&&row.status==='proposed'&&<Button type="button" disabled={blocked||loading} onClick={()=>void act('accept')}>{copy.accept}</Button>}{(side==='client'&&['requested','proposed'].includes(row.status)||row.status==='confirmed'&&future)&&<Button type="button" variant="secondary" disabled={blocked||loading} onClick={()=>void act('cancel')}>{row.status==='confirmed'?copy.cancelAppointment:copy.cancelRequest}</Button>}</div>}
    {row.workId&&row.origin!=='project_invite'&&<AppointmentReschedule key={'reschedule:'+row.id} requestId={row.id} sourceRevision={row.revision} optional readOnly={terminal||row.workCancelled||row.workStage==='completed'} onStateChange={setRescheduleState}/>}
    <dl className="grid gap-3 text-sm">{[[side==='provider'?copy.customer:copy.professional,side==='provider'?row.clientName:row.professionalName],...(row.origin==='project_invite'?[]:row.workId&&row.start?[[copy.confirmedTime,appointmentDate(row.start,language)]]:row.proposedStart?[[copy.proposed,appointmentDate(row.proposedStart,language)],...(row.requestedStart&&row.requestedStart!==row.proposedStart?[[copy.requestedTime,appointmentDate(row.requestedStart,language)]]:[])]:[[copy.requestedTime,appointmentDate(row.requestedStart,language)||copy.noTime]]),[copy.duration,`${row.workId&&row.start&&row.end?Math.round((Date.parse(row.end)-Date.parse(row.start))/60000):row.proposedDurationMinutes??row.durationMinutes} min`],[copy.location,copy.locations[row.locationKind]],...(row.locationText?[[copy.locationDetail,row.locationText]]:[]),...(row.preferredDay||row.preference?[[copy.preferred,[appointmentDay(row.preferredDay,language),row.preference].filter(Boolean).join(' · ')]]:[]),...(row.note?[[copy.note,row.note]]:[])].filter(([label])=>row.origin!=='project_invite'||label===copy.professional||label===copy.customer).map(([label,value])=><div key={label}><dt className="font-semibold">{label}</dt><dd className="mt-1 whitespace-pre-wrap break-words text-[#52627a]">{value}</dd></div>)}</dl>
    {row.workCancelled&&<p className="text-sm">{copy.cancelledWork}</p>}{row.workStage==='completed'&&<p className="text-sm">{copy.completedWork}</p>}

    {side==='provider'&&<RequestFollowup key={'followup:'+row.id} requestId={row.id} onStateChange={setFollowupState}/>}
    <VisitPreparationAnswers key={'prep:'+row.id} requestId={row.id} side={side} sourceRevision={row.revision} onStateChange={setPrepState}/>
    {side==='client'&&<AppointmentQuoteChoices key={'quotes:'+row.id} requestId={row.id} onStateChange={setQuoteState}/>}
    {side==='client'&&row.workId&&<ClientWorkSections key={'sections:'+row.id} requestId={row.id} parentBlocked={saving||uncertain||pendingRead||dirty||[followupState,prepState,deliveryState,changeState,quoteState,rescheduleState].some(value=>value.dirty||value.busy)} onDailyState={setDailyState} onChangeState={setChangeState} onDeliveryState={setDeliveryState}/>}

    {editing&&<form onSubmit={event=>void submit(event)} className="space-y-4 rounded-xl border border-[#d7e1ea] p-4"><h3 className="font-semibold">{copy.propose}</h3><p className="text-sm text-[#52627a]">{copy.proposalHelp}</p><fieldset disabled={blocked||loading} className="space-y-4"><div className="grid items-end gap-3 sm:grid-cols-2"><label className="block text-sm font-semibold">{copy.proposedDay}<input aria-label={copy.proposedDay} className={appointmentField} type="date" required min={crTodayISO()} value={day} onChange={event=>{setDay(event.target.value);setDirty(true);setError('');}}/></label><label className="block text-sm font-semibold">{copy.proposedTime}<input aria-label={copy.proposedTime} className={appointmentField} type="time" required step={900} value={time} onChange={event=>{setTime(event.target.value);setDirty(true);setError('');}}/></label></div><AppointmentDuration value={duration} onChange={value=>{setDuration(value);setDirty(true);setError('');}}/><label className="block text-sm font-semibold">{copy.proposalNote}<textarea aria-label={copy.proposalNote} className={appointmentField} value={note} maxLength={500} onChange={event=>{setNote(event.target.value);setDirty(true);setError('');}}/></label></fieldset><p className="text-xs text-[#68778d]">{copy.timeZone}</p><div className="flex flex-wrap gap-2"><Button type="button" variant="secondary" disabled={blocked} onClick={()=>void mayDiscard().then(answer=>{if(answer){setEditing(false);setDirty(false);setError('');}})}>{copy.cancelEdit}</Button><Button type="submit" disabled={blocked||loading}>{saving?copy.sending:copy.saveProposal}</Button></div></form>}

    {side==='client'&&row.professionalSlug&&terminal&&<a aria-disabled={blocked||dirty} onClick={event=>{if(blocked||dirty)event.preventDefault();}} className="inline-flex min-h-11 items-center rounded-full border border-[#d7e1ea] px-4 py-2 font-semibold text-[#162543]" href={`/${language==='en'?'en':'es'}/profesionales/${encodeURIComponent(row.professionalSlug)}?repetirCita=${encodeURIComponent(row.id)}`}>{copy.again}</a>}
    <h3 className="font-bold">{copy.history}</h3><ol className="space-y-3">{detail.events.map(event=><li key={event.position} className="rounded-xl border border-[#e5e7eb] p-3 text-sm"><p className="font-semibold">{historyLabel(event)} · {copy.side[event.side]}</p><p className="mt-1 text-[#68778d]">{appointmentDate(event.at,language)}</p>{event.start&&<p className="mt-1">{appointmentDate(event.start,language)}</p>}{event.note&&<p className="mt-1 whitespace-pre-wrap break-words">{event.note}</p>}</li>)}</ol>
    {historyError&&<p role="alert">{historyError}</p>}{detail.nextCursor!==null&&<Button type="button" variant="secondary" disabled={loading||blocked||dirty} onClick={()=>void load(String(detail.nextCursor))}>{copy.moreHistory}</Button>}
   </>:null}
  </div>;
 if(presentation==='page')return <><main data-client-project-page={id} aria-labelledby="client-project-title" className="mx-auto w-full max-w-5xl min-w-0 space-y-4 px-4 pb-16 pt-4 lg:pt-8">
  {/* The phone header (CabeceraDeTramite) already shows the title and Back; this row is for wider screens. */}
  <div className="hidden flex-wrap items-center justify-between gap-3 lg:flex"><div className="min-w-0"><h1 id="client-project-title" className="text-2xl font-bold text-[#162543]">{dialogTitle}</h1>{row&&<p className="mt-1 break-words text-sm text-[#52627a]">{row.professionalName}</p>}</div>
   <Button type="button" variant="outline" data-client-project-back onClick={()=>void close()}>{row?.origin==='project_invite'?(language==='en'?'Back to My projects':'Volver a Mis proyectos'):row?(language==='en'?'Back to '+copy.myAppointments:'Volver a '+copy.myAppointments):(language==='en'?'Back':'Volver')}</Button></div>
  {body}
 </main>{dialogNode}</>;
 return <><Modal manageFocus title={dialogTitle} ariaLabel={dialogTitle} closeLabel={copy.close} mobilePresentation="fullscreen" size={side==='client'&&row?.workId?'xl':undefined} onClose={()=>void close()}>
  {body}
 </Modal>{dialogNode}</>;
}
