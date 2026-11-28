'use client';
import {useCallback,useEffect,useRef,useState,type FormEvent,type ReactNode} from 'react';
import {useLocale,useTranslations} from 'next-intl';
import {z} from 'zod';
import {CalendarDays,ChevronLeft,ChevronRight} from 'lucide-react';
import {AccionesAlPie} from '@/components/ui/acciones-al-pie';
import {Modal} from '@/components/ui/modal';
import {Button} from '@/components/ui/button';
import {useAppDialog} from '@/hooks/use-app-dialog';
import {useAuth} from '@/hooks/use-auth';
import {crTodayISO} from '@/lib/time-cr';
import {appointmentMutationSchema,type AppointmentMutation} from '@/lib/pro/appointment-requests';
import {appointmentCopy,appointmentField} from './appointment-copy';
import {ReservationCalendar} from './reservation-calendar';
import {AppointmentDuration} from './appointment-duration';
type Slot={start:string;end:string};
const api='/api/pro/appointment-requests';
const draftKey='contratacr:appointment-login-draft';
const draftSchema=z.object({professional:z.string().uuid(),path:z.string().max(2000),expires:z.number(),day:z.string().max(10),other:z.boolean(),input:appointmentMutationSchema}).strict();

const maxDay=()=>new Date(Date.parse(crTodayISO()+'T12:00:00Z')+90*86400000).toISOString().slice(0,10);
type PublicRequestProps={professional:string;service:string;isOwn?:boolean;professionalName?:string;fallback?:ReactNode;pinned?:boolean;
 /** Classes of the pinned strip (default: the standard one). */pinnedClass?:string;
 /** Profile contact: with it, `fallback` stays on screen while availability is checked and without booking; with booking
  * the pinned strip shows this node (WhatsApp) beside «Agendar», and the unpinned card shows «Agendar» under `fallback`. */
 companion?:ReactNode;
 /** Classes of the «Agendar» button that goes with `companion`. */bookClass?:string};
export function PublicReservations(props:PublicRequestProps){
 const {user}=useAuth();
 return <PublicRequestForm key={props.professional+':'+(user?.id??'guest')} {...props}/>;
}
function PublicRequestForm({professional,service,isOwn=false,professionalName,fallback,pinned=false,pinnedClass,companion,bookClass}:PublicRequestProps){
 const {user,loading:authLoading}=useAuth();
 const initialDayChosen=useRef(false),leavingForLogin=useRef(false),loginNotice=useRef<HTMLParagraphElement>(null);
 const journey=useTranslations('ClientJourney');
 const language=useLocale(),copy=appointmentCopy[language==='en'?'en':'es'],ref=useRef<HTMLDivElement>(null),busy=useRef(false),pending=useRef<AppointmentMutation|null>(null),slotSequence=useRef(0),repeatController=useRef<AbortController|null>(null);
 const [previewOffset,setPreviewOffset]=useState(0);
 const [enabled,setEnabled]=useState(false),[open,setOpen]=useState(false),[day,setDay]=useState(crTodayISO),[duration,setDuration]=useState(60),[slots,setSlots]=useState<Slot[]>([]),[slotLoading,setSlotLoading]=useState(false),[slotError,setSlotError]=useState(''),[time,setTime]=useState(''),[other,setOther]=useState(false),[preferredDay,setPreferredDay]=useState(''),[preference,setPreference]=useState(''),[title,setTitle]=useState(service),[locationKind,setLocationKind]=useState<'agree'|'provider'|'customer'|'online'>('agree'),[locationText,setLocationText]=useState(''),[note,setNote]=useState(''),[saving,setSaving]=useState(false),[uncertain,setUncertain]=useState(false),[error,setError]=useState(''),[login,setLogin]=useState(false),[sentId,setSentId]=useState(''),[dirty,setDirty]=useState(false),[slotTick,setSlotTick]=useState(0),[repeatLoading,setRepeatLoading]=useState(false),[repeated,setRepeated]=useState(false);
 const [step,setStep]=useState<'calendar'|'details'>('calendar'),[month,setMonth]=useState(crTodayISO().slice(0,7)),[calendar,setCalendar]=useState<{day:string;slots:Slot[];count?:number}[]>([]),[calendarLoading,setCalendarLoading]=useState(false),[calendarError,setCalendarError]=useState(false),[direct,setDirect]=useState(false),[confirmed,setConfirmed]=useState(false);
 const en=language==='en',tr=(es:string,english:string)=>en?english:es;
 const {confirm,dialogNode}=useAppDialog();
 const loadSlots=useCallback(async(signal?:AbortSignal)=>{
  const sequence=++slotSequence.current;setSlotLoading(true);setSlotError('');
  if(!Number.isInteger(duration)||duration<15||duration>480||duration%15||!day){setSlots([]);setSlotLoading(false);return;}
  try{const response=await fetch(api+'?'+new URLSearchParams({view:'slots',professional,day,duration:String(duration)}),{signal,cache:'no-store'}),body=await response.json();if(!response.ok||!Array.isArray(body.slots))throw Error();if(sequence!==slotSequence.current||signal?.aborted)return;setEnabled(body.enabled===true);setSlots(body.slots);setDirect(body.directBooking===true);if(body.directBooking&&Number.isInteger(body.durationMinutes))setDuration(body.durationMinutes);}
  catch{if(sequence===slotSequence.current&&!signal?.aborted){setSlots([]);setSlotError(copy.loadSlotsError);}}
  finally{if(sequence===slotSequence.current&&!signal?.aborted){setSlotLoading(false);}}
 },[professional,day,duration,copy.loadSlotsError]);
 useEffect(()=>{if(open||enabled)return;const controller=new AbortController(),node=ref.current;if(!node)return;const observer=new IntersectionObserver(entries=>{if(entries.some(item=>item.isIntersecting)){observer.disconnect();void loadSlots(controller.signal);}},{rootMargin:'100px'});observer.observe(node);return()=>{observer.disconnect();controller.abort();};},[loadSlots,open,enabled]);
 useEffect(()=>{if(!open||other||sentId)return;const controller=new AbortController(),timer=setTimeout(()=>void loadSlots(controller.signal),0);return()=>{clearTimeout(timer);controller.abort();};},[open,other,sentId,loadSlots,slotTick]);
 // Month end (2026-11-28): the compact preview showed only the days left in the current month (e.g. 2 on the 28th).
 // When the current month has fewer than two preview pages left, the next month's days follow in the preview only.
 const [previewNext,setPreviewNext]=useState<{day:string;slots:Slot[];count?:number}[]>([]);
 const currentMonth=crTodayISO().slice(0,7),spansNext=month===currentMonth&&calendar.length<6,preview=spansNext?[...calendar,...previewNext]:calendar;
 useEffect(()=>{if(!enabled||!spansNext||calendarLoading)return;
  const c=new AbortController(),[y,m]=currentMonth.split('-').map(Number),next=`${m===12?y+1:y}-${String(m===12?1:m+1).padStart(2,'0')}`;
  void fetch(api+'?'+new URLSearchParams({view:'calendar',professional,month:next,duration:String(duration)}),{signal:c.signal,cache:'no-store'}).then(async r=>{const b=await r.json();if(!c.signal.aborted)setPreviewNext(r.ok&&Array.isArray(b.days)?b.days:[]);}).catch(()=>{if(!c.signal.aborted)setPreviewNext([]);});
  return()=>c.abort();},[enabled,spansNext,currentMonth,calendarLoading,professional,duration,slotTick]);
 useEffect(()=>{if(!enabled)return;const c=new AbortController();const timer=setTimeout(()=>{setCalendarLoading(true);setCalendarError(false);void fetch(api+'?'+new URLSearchParams({view:'calendar',professional,month,duration:String(duration)}),{signal:c.signal,cache:'no-store'}).then(async r=>{const b=await r.json();if(!r.ok||!Array.isArray(b.days))throw Error();if(!c.signal.aborted){setCalendar(b.days);if(!initialDayChosen.current&&b.days[0]){initialDayChosen.current=true;setDay(b.days[0].day);}}}).catch(()=>{if(!c.signal.aborted){setCalendar([]);setCalendarError(true);}}).finally(()=>{if(!c.signal.aborted)setCalendarLoading(false);});},0);return()=>{clearTimeout(timer);c.abort();};},[enabled,professional,month,duration,slotTick]);
 useEffect(()=>()=>repeatController.current?.abort(),[]);
 useEffect(()=>{if(login){loginNotice.current?.scrollIntoView({block:"center"});loginNotice.current?.focus({preventScroll:true});}},[login]);
 useEffect(()=>{
  if(authLoading||new URLSearchParams(window.location.search).get('pendingAppointment')!=='1')return;
  const timer=setTimeout(()=>{
   try{
    const draft=draftSchema.safeParse(JSON.parse(sessionStorage.getItem(draftKey)??'null'));
    if(!draft.success||draft.data.expires<Date.now()){sessionStorage.removeItem(draftKey);return;}
    const {input,...saved}=draft.data;
    if(saved.professional!==professional||saved.path.split('/').filter(Boolean).pop()!==window.location.pathname.split('/').filter(Boolean).pop()||input.action!=='create'||input.professionalId!==professional)return;
    setTitle(input.service);setDuration(input.durationMinutes);setDay(saved.day);setTime(input.start??'');setOther(saved.other);setPreferredDay(input.preferredDay??'');setPreference(input.preference);setLocationKind(input.locationKind);setLocationText(input.locationText);setNote(input.note);setDirty(true);initialDayChosen.current=true;setStep('details');setMonth(saved.day.slice(0,7));setOpen(true);
    // Consume only after auth has settled; never submit on the customer's behalf.
    sessionStorage.removeItem(draftKey);
    const url=new URL(window.location.href);url.searchParams.delete('pendingAppointment');window.history.replaceState(window.history.state,'',url.pathname+url.search+url.hash);
   }catch{/* Storage unavailable: the original form remains usable. */}
  },0);
  return()=>clearTimeout(timer);
 },[authLoading,user?.id,professional]);
 function continueToLogin(){
  try{
   const input={action:'create' as const,id:crypto.randomUUID(),actionId:crypto.randomUUID(),professionalId:professional,service:title,durationMinutes:duration,locationKind,locationText,note,start:other?null:time||null,preferredDay:other?preferredDay||null:null,preference:other?preference:''};
   const saved=draftSchema.parse({professional,path:window.location.pathname,expires:Date.now()+30*60*1000,day,other,input});
   sessionStorage.setItem(draftKey,JSON.stringify(saved));
   const destination=new URL(window.location.href);
   // English short profile URLs are presentation-only; return through the real route.
   const slug=destination.pathname.split('/').filter(Boolean).pop();
   destination.pathname=`/${language==='en'?'en':'es'}/profesionales/${slug}`;
   destination.searchParams.set('pendingAppointment','1');
   leavingForLogin.current=true;
   // A full document navigation avoids Safari's RSC locale-redirect loop; the draft is already in sessionStorage.
   // eslint-disable-next-line @next/next/no-location-assign-relative-destination
   window.location.assign(`${language==='en'?'/en':''}/login?redirect=${encodeURIComponent(destination.pathname+destination.search+destination.hash)}`);
  }catch{setError(language==='en'?'Could not keep your request. Please try again before signing in.':'No se pudo conservar la solicitud. Intente de nuevo antes de iniciar sesión.');}
 }
 const reset=useCallback(()=>{initialDayChosen.current=false;repeatController.current?.abort();setRepeatLoading(false);setTitle(service);setDuration(60);setDay(crTodayISO());setTime('');setOther(false);setPreferredDay('');setPreference('');setLocationKind('agree');setLocationText('');setNote('');setError('');setLogin(false);setSentId('');setConfirmed(false);setStep('calendar');setMonth(crTodayISO().slice(0,7));setPreviewOffset(0);setDirty(false);setRepeated(false);pending.current=null;},[service]);
 const close=useCallback(async()=>{if(saving||uncertain){setError(copy.blockedClose);return false;}if(dirty&&!sentId&&!(await confirm({title:copy.discardTitle,description:copy.discardHint,confirmLabel:copy.discard,cancelLabel:copy.stay})).confirmed)return false;setOpen(false);reset();return true;},[saving,uncertain,dirty,sentId,confirm,copy,reset]);
 useEffect(()=>{if(!open||(!dirty&&!saving&&!uncertain)||sentId)return;const path=window.location.pathname+window.location.search,state={...window.history.state};let asking=false,allow=false;
  function beforeUnload(event:BeforeUnloadEvent){if(!allow&&!leavingForLogin.current){event.preventDefault();event.returnValue='';}}
  function back(event:PopStateEvent){if(allow)return;event.stopImmediatePropagation();window.history.pushState(state,'',path);if(asking)return;asking=true;void close().then(answer=>{asking=false;if(answer){allow=true;window.history.back();}});}
  window.addEventListener('beforeunload',beforeUnload);window.addEventListener('popstate',back);return()=>{window.removeEventListener('beforeunload',beforeUnload);window.removeEventListener('popstate',back);};
 },[open,dirty,saving,uncertain,sentId,close]);
 function change(){initialDayChosen.current=true;setDirty(true);setError('');setLogin(false);}
 async function begin(selectedDay?:string){if(isOwn)return;setOpen(true);if(dirty||uncertain)return;if(selectedDay)setDay(selectedDay);else if(!time&&calendar[0])setDay(calendar[0].day);setTitle(service);const previous=new URLSearchParams(window.location.search).get('repetirCita');if(!previous||!/^[a-f\d-]{36}$/i.test(previous))return;repeatController.current?.abort();const controller=new AbortController();repeatController.current=controller;setRepeatLoading(true);setRepeated(false);try{const response=await fetch(api+'?'+new URLSearchParams({view:'detail',id:previous}),{cache:'no-store',signal:controller.signal}),body=await response.json();if(controller.signal.aborted)return;if(!response.ok||body.request?.professionalId!==professional||body.request?.side!=='client')throw Error();setTitle(body.request.service);setDuration(body.request.proposedDurationMinutes??body.request.durationMinutes);setLocationKind(body.request.locationKind);setLocationText(body.request.locationText);setOther(true);setTime('');setStep('calendar');setRepeated(true);}catch{if(!controller.signal.aborted)setError(copy.repeatError);}finally{if(!controller.signal.aborted)setRepeatLoading(false);}}
 async function submit(event:FormEvent){event.preventDefault();if(step==='calendar'){if(other||time)setStep('details');return;}if(busy.current||repeatLoading)return;
  let input=pending.current;
  if(!input){const parsed=appointmentMutationSchema.safeParse({action:'create',id:crypto.randomUUID(),actionId:crypto.randomUUID(),professionalId:professional,service:title,durationMinutes:duration,locationKind,locationText,note,start:other?null:time||null,preferredDay:other?preferredDay||null:null,preference:other?preference:''});if(!parsed.success||!other&&!time){setError(copy.invalid);return;}input=parsed.data;pending.current=input;}
  busy.current=true;setSaving(true);setError('');setLogin(false);
  try{const response=await fetch(api,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});let body;try{body=await response.json();}catch{throw Error();}
   if(response.status>=500)throw Error();if(!response.ok){pending.current=null;setUncertain(false);if(response.status===401)setLogin(true);else setError(response.status===409?copy.conflict:copy.requestError);if(response.status===409){setTime('');setStep('calendar');setSlotTick(value=>value+1);}return;}
   if((body.request?.id??body.id)!==input.id)throw Error();window.dispatchEvent(new Event('contratacr:appointments-changed'));setSentId(input.id);setConfirmed(body.status==='confirmed'||body.request?.status==='confirmed');setDirty(false);setUncertain(false);pending.current=null;
  }catch{setUncertain(true);setError(copy.uncertain);}
  finally{busy.current=false;setSaving(false);}
 }
 const disabled=saving||uncertain||repeatLoading,locale=language==='en'?'en':'es',mine=`/${locale}/dashboard/profesional?tab=appointments${sentId?'&citaSolicitud='+encodeURIComponent(sentId):''}`;
 return <div ref={ref} data-public-appointment-request className="min-h-px">
  {enabled&&preview.length>0&&<div data-availability-preview className="my-3 flex w-full items-start gap-1" aria-label={tr('Próximos horarios','Upcoming times')}>
   <button type="button" className="flex w-4 shrink-0 self-center items-center justify-center rounded text-[#9ca3af] enabled:hover:text-[#009FD9] disabled:opacity-25" aria-label={tr('Días anteriores','Previous days')} disabled={previewOffset===0} onClick={event=>{event.stopPropagation();setPreviewOffset(v=>Math.max(0,v-3));}}><ChevronLeft className="h-[15px] w-[15px]"/></button>
   <div className="grid min-w-0 flex-1 grid-cols-3 gap-2">{preview.slice(previewOffset,previewOffset+3).map(d=>{
    const today=crTodayISO(),tomorrow=new Date(Date.parse(today+'T12:00:00Z')+86400000).toISOString().slice(0,10),label=d.day===today?tr('Hoy','Today'):d.day===tomorrow?tr('Mañana','Tomorrow'):new Date(d.day+'T12:00:00Z').toLocaleDateString(en?'en-US':'es-CR',{day:'numeric',month:'short',timeZone:'UTC'}),extra=Math.max(0,(d.count??d.slots.length)-3);
    return <div key={d.day} data-preview-day className="flex min-w-0 flex-col gap-1.5 text-center"><p className="truncate text-[11px] font-semibold leading-tight text-[#6b7280]">{label}</p>{d.slots.slice(0,3).map(s=><button data-preview-slot type="button" disabled={isOwn} key={s.start} className="w-full rounded-md bg-[#EBF5FB] py-1 text-[11px] font-semibold leading-none text-[#0089bb] transition-colors hover:bg-[#009FD9] hover:text-white" onClick={event=>{event.stopPropagation();setDay(d.day);setTime(s.start);setOther(false);setStep('details');change();void begin(d.day);}}>{new Date(s.start).toLocaleTimeString(en?'en-US':'es-CR',{timeZone:'America/Costa_Rica',hour:'2-digit',minute:'2-digit',hourCycle:'h23'})}</button>)}{extra>0&&<button data-preview-more type="button" disabled={isOwn} aria-label={tr('Ver todos los horarios del','View all times for')+' '+d.day} className="w-full rounded-md border border-dashed border-[#bfdbfe] py-1 text-[10px] font-bold leading-none text-[#0089bb] transition-colors hover:bg-[#EBF5FB]" onClick={event=>{event.stopPropagation();setStep('calendar');void begin(d.day);}}>+{extra}</button>}</div>;
   })}</div>
   <button type="button" className="flex w-4 shrink-0 self-center items-center justify-center rounded text-[#9ca3af] enabled:hover:text-[#009FD9] disabled:opacity-25" aria-label={tr('Días siguientes','Next days')} disabled={previewOffset+3>=preview.length} onClick={event=>{event.stopPropagation();setPreviewOffset(v=>v+3);}}><ChevronRight className="h-[15px] w-[15px]"/></button>
  </div>}
  {companion!==undefined?(() => {const book=<Button type="button" data-profile-book className={bookClass??'w-full'} disabled={isOwn} onClick={()=>void begin()}><CalendarDays aria-hidden className="h-4 w-4 shrink-0"/>{tr('Agendar','Book')}</Button>;
   // One strip in every state: contact while checking, then the call button gives its half to «Agendar».
   return pinned?<AccionesAlPie className={pinnedClass??"flex flex-col gap-2"}>{enabled?<div className="grid grid-cols-2 gap-2">{companion}{book}</div>:fallback}</AccionesAlPie>
    :<div className="ccr-grupo-botones flex flex-col gap-2">{fallback}{enabled&&book}</div>;})()
  // Contact while checking (2026-11-27): a «Consultando horarios…» line here grew into the contact buttons after hydration and
  // every search card jumped (the /buscar flicker); the buttons are server-painted and only a bookable pro swaps them.
  :(() => {const action=enabled?<Button type="button" className="w-full" disabled={isOwn} onClick={()=>void begin()}>{pinned&&<CalendarDays aria-hidden className="mr-2 h-4 w-4"/>}{tr('Ver disponibilidad','View availability')}</Button>:fallback;return pinned?<AccionesAlPie className={pinnedClass??"flex flex-col gap-2"}>{action}</AccionesAlPie>:action;})()}
  <Modal open={open} onClose={()=>void close()} title={sentId?(confirmed?tr('Cita confirmada','Appointment confirmed'):copy.sentTitle):copy.requestTitle} ariaLabel={sentId?(confirmed?tr('Cita confirmada','Appointment confirmed'):copy.sentTitle):copy.requestTitle} closeLabel={copy.close} backLabel={step==='details'&&!sentId?tr('Volver al horario','Back to time selection'):undefined} onBack={step==='details'&&!sentId?()=>{if(!disabled){setStep('calendar');setLogin(false);}}:undefined} mobilePresentation="fullscreen" footer={!sentId?<div className="flex w-full gap-2">{step==='details'&&!uncertain&&<Button type="button" variant="secondary" disabled={saving} onClick={()=>{setStep('calendar');setLogin(false);}}>{tr('Cambiar horario','Change time')}</Button>}<Button type="submit" className="flex-1" form={'appointment-request-'+professional} disabled={saving||repeatLoading||step==='calendar'&&!other&&(!time||slotLoading)}>{saving?copy.sending:uncertain?copy.retryCheck:step==='calendar'?tr('Continuar','Continue'):direct&&!other?tr('Reservar cita','Book appointment'):copy.requestCta}</Button></div>:undefined}>
   {sentId?<div className="space-y-4"><p>{confirmed?tr('La cita ya está en la agenda. Puede consultar sus detalles y su historial en Mis citas.','Your appointment is on the calendar. Review its details and history in My appointments.'):copy.sentHint}</p><a href={mine} className="block min-h-11 rounded-full bg-[#009fd9] px-4 py-3 text-center font-semibold text-white">{copy.viewMine}</a><Button type="button" variant="secondary" onClick={()=>{setOpen(false);reset();setSlotTick(value=>value+1);}}>{copy.done}</Button></div>:<form id={'appointment-request-'+professional} onSubmit={event=>void submit(event)} className="space-y-5">
   <p className="font-semibold text-[#162543]">{professionalName||service}</p><p className="text-sm text-[#52627a]">{direct&&!other?tr("Elija una hora y revise los datos antes de reservar. Hora de Costa Rica.","Choose a time and review the details before booking. Costa Rica time."):copy.requestHint}</p>{repeatLoading&&<p role="status">{copy.repeatLoading}</p>}{repeated&&<p className="text-sm text-[#52627a]">{copy.repeated}</p>}
    <fieldset disabled={disabled} className="min-w-0 space-y-5">
     <div hidden={step!=='calendar'} className="space-y-4">
     <div className="flex flex-wrap gap-2"><Button type="button" variant={!other?'default':'secondary'} aria-pressed={!other} onClick={()=>{setOther(false);change();}}>{copy.chooseTime}</Button><Button type="button" variant={other?'default':'secondary'} aria-pressed={other} onClick={()=>{setOther(true);setTime('');change();}}>{copy.otherTime}</Button></div>
     {other?<div className="space-y-3"><p className="text-sm text-[#52627a]">{copy.otherHint}</p><label className="block text-sm font-semibold">{copy.preferredDay}<input type="date" aria-label={copy.preferredDay} min={crTodayISO()} max={maxDay()} value={preferredDay} onChange={event=>{setPreferredDay(event.target.value);change();}} className={appointmentField}/></label><label className="block text-sm font-semibold">{copy.preferences}<input aria-label={copy.preferences} maxLength={200} value={preference} onChange={event=>{setPreference(event.target.value);change();}} className={appointmentField}/></label></div>:<div className="space-y-3"><ReservationCalendar compact selected={calendar.some(item=>item.day===day)?day:''} onSelect={value=>{setDay(value);setTime('');change();}} marked={calendar.map(d=>d.day)} availableOnly monthValue={month} onMonth={value=>{if(value>=crTodayISO().slice(0,7)&&value<=maxDay().slice(0,7)){initialDayChosen.current=false;setTime('');setDay(value+'-01');setSlots([]);setMonth(value);setPreviewOffset(0);}}}/>{calendarLoading&&<p role="status">{copy.loadingSlots}</p>}{calendarError&&<p role="alert">{copy.loadSlotsError} <button type="button" className="min-h-11 underline" onClick={()=>setSlotTick(v=>v+1)}>{copy.retry}</button></p>}<h3 className="text-sm font-semibold">{copy.available}</h3>{slotLoading?<p role="status">{copy.loadingSlots}</p>:slotError?<div role="alert" className="space-y-2"><p>{slotError}</p><Button type="button" variant="secondary" onClick={()=>setSlotTick(value=>value+1)}>{copy.retry}</Button></div>:slots.length?<div className="flex flex-wrap gap-2">{slots.map(slot=><Button type="button" variant={time===slot.start?'default':'secondary'} aria-pressed={time===slot.start} key={slot.start} onClick={()=>{setTime(slot.start);change();}}>{new Date(slot.start).toLocaleTimeString(language==='en'?'en-US':'es-CR',{timeZone:'America/Costa_Rica',hour:'2-digit',minute:'2-digit'})}</Button>)}</div>:<p className="text-sm text-[#52627a]">{copy.noSlots}</p>}</div>}
     </div><div hidden={step!=='details'} className="space-y-5">
     <p className="font-semibold">{other?copy.otherTime:time?new Date(time).toLocaleString(en?'en-US':'es-CR',{timeZone:'America/Costa_Rica',dateStyle:'medium',timeStyle:'short'}):copy.chooseTime} · {duration} min</p>
     <label className="block text-sm font-semibold">{copy.service}<input aria-label={copy.service} className={appointmentField} value={title} required={step==='details'} maxLength={160} onChange={event=>{setTitle(event.target.value);change();}}/></label>
     {!direct&&<details data-request-duration className="rounded-xl border border-[#d7e1ea] p-3" onInvalidCapture={event=>{event.currentTarget.open=true;}}><summary className="min-h-11 cursor-pointer text-sm font-semibold">{journey('durationAdjust')} · {duration} min</summary><p className="mb-3 text-sm text-[#52627a]">{journey('durationHint')}</p><AppointmentDuration value={duration} onChange={value=>{setDuration(value);setTime('');change();}}/></details>}
     <label className="block text-sm font-semibold">{copy.location}<select aria-label={copy.location} className={appointmentField} value={locationKind} onChange={event=>{setLocationKind(event.target.value as typeof locationKind);change();}}>{Object.entries(copy.locations).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
     {locationKind!=='agree'&&<label className="block text-sm font-semibold">{copy.locationDetail}<textarea aria-label={copy.locationDetail} className={appointmentField} value={locationText} maxLength={500} required={step==='details'&&locationKind==='customer'} onChange={event=>{setLocationText(event.target.value);change();}}/><span className="mt-1 block text-xs font-normal text-[#68778d]">{copy.locationPrivate}</span></label>}
     <label className="block text-sm font-semibold">{copy.note}<textarea aria-label={copy.note} className={appointmentField} value={note} maxLength={500} onChange={event=>{setNote(event.target.value);change();}}/></label>
    </div></fieldset>
    {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}{login&&<p ref={loginNotice} tabIndex={-1} role="alert" className="text-sm">{copy.login} <button type="button" className="min-h-11 font-semibold text-[#0089bb] underline" onClick={continueToLogin}>{copy.signIn}</button></p>}
   </form>}
  </Modal>{dialogNode}
 </div>;
}
