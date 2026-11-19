'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {useLocale} from 'next-intl';
import {Button} from '@/components/ui/button';
import {Modal} from '@/components/ui/modal';
import {proCount} from '@/lib/pro/plural';
import {PRO_TIMER_CHANGED,timerPageSchema,type WorkTimer} from '@/lib/pro/round8';

/**
 * Round 8: person timer. `WorkTimerControl` starts/stops the timer of one job (activity, billable,
 * note); `RunningTimerIndicator` shows the open timer anywhere in the Pro space. Stopping opens a
 * review form (minutes, date, activity, billable, note) that saves one time entry through the single
 * time writer. One open timer per person is enforced on the server (409 otherwise).
 */
type Page={timer:WorkTimer|null;serverNow:string;activities:{id:string;name:string;billable:boolean}[]};
const crToday=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Costa_Rica'}).format(new Date());
function useTimer(){
 const [page,setPage]=useState<Page|null>(null),[failed,setFailed]=useState(false),[offset,setOffset]=useState(0);
 const load=useCallback(async()=>{try{const r=await fetch('/api/pro/work-timers',{cache:'no-store'});if(!r.ok)throw Error();const p=timerPageSchema.parse(await r.json()) as Page;setOffset(Date.parse(p.serverNow)-Date.now());setPage(p);setFailed(false);}catch{setFailed(true);}},[]);
 useEffect(()=>{const first=setTimeout(()=>void load(),0);const changed=()=>void load();window.addEventListener(PRO_TIMER_CHANGED,changed);window.addEventListener('focus',changed);return()=>{clearTimeout(first);window.removeEventListener(PRO_TIMER_CHANGED,changed);window.removeEventListener('focus',changed);};},[load]);
 return {page,failed,load,offset};
}
function useElapsed(timer:WorkTimer|null,offset:number){
 const [now,setNow]=useState(()=>Date.now());
 useEffect(()=>{if(timer?.status!=='running')return;const id=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(id);},[timer?.status]);
 if(!timer)return 0;const end=timer.stoppedAt?Date.parse(timer.stoppedAt):now+offset;return Math.max(0,Math.floor((end-Date.parse(timer.startedAt))/1000));
}
const clock=(seconds:number)=>{const h=Math.floor(seconds/3600),m=Math.floor(seconds%3600/60),s=seconds%60;return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;};
async function send(body:Record<string,unknown>){
 const r=await fetch('/api/pro/work-timers',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await r.json().catch(()=>({}));
 if(!r.ok)throw Object.assign(Error(typeof data?.error==='string'?data.error:''),{status:r.status});return data;
}
function ReviewForm({timer,activities,onDone,onClose}:{timer:WorkTimer;activities:Page['activities'];onDone:()=>void;onClose:()=>void}){
 const en=useLocale()==='en',t=(es:string,english:string)=>en?english:es;
 const [minutes,setMinutes]=useState(String(timer.minutes)),[date,setDate]=useState(crToday()),[activity,setActivity]=useState(timer.activityId??''),[billable,setBillable]=useState(timer.billable),[note,setNote]=useState(timer.note);
 const [busy,setBusy]=useState(false),[error,setError]=useState('');const action=useRef<{key:string;id:string}|null>(null);
 async function save(kind:'save'|'discard'){
  const value=Number(minutes);if(kind==='save'&&(!Number.isInteger(value)||value<1||value>1440)){setError(t('Ingrese entre 1 y 1440 minutos.','Enter between 1 and 1440 minutes.'));return;}
  const key=JSON.stringify([kind,minutes,date,activity,billable,note]);if(action.current?.key!==key)action.current={key,id:crypto.randomUUID()};
  setBusy(true);setError('');
  try{await send(kind==='save'?{action:'save',actionId:action.current.id,timerId:timer.id,revision:timer.revision,minutes:value,date,activityId:activity||null,billable,note:note.trim()}:{action:'discard',actionId:action.current.id,timerId:timer.id,revision:timer.revision});
   window.dispatchEvent(new Event(PRO_TIMER_CHANGED));onDone();}
  catch(failure){setError((failure as Error).message||t('No se pudo comprobar el guardado. Reintente: no se duplicará.','Could not confirm the save. Retry: it will not be duplicated.'));}finally{setBusy(false);}
 }
 return <Modal title={t('Revisar tiempo','Review time')} ariaLabel={t('Revisar tiempo','Review time')} onClose={()=>{if(!busy)onClose();}} closeLabel={t('Cerrar','Close')} mobilePresentation="fullscreen"
  footer={<><Button type="button" variant="secondary" disabled={busy} onClick={()=>void save('discard')}>{t('Descartar','Discard')}</Button><Button type="button" disabled={busy} onClick={()=>void save('save')}>{busy?t('Guardando…','Saving…'):t('Guardar tiempo','Save time')}</Button></>}>
  <form data-work-timer-review className="space-y-3" onSubmit={event=>{event.preventDefault();void save('save');}}>
   <p className="text-sm text-[#52627a]">{timer.service??''} · {t('Puede corregir los datos antes de guardar. Se registra una sola vez en Horas y en Costos.','You can correct the details before saving. It is recorded once in Time and in Costs.')}</p>
   <label className="block text-sm font-semibold">{t('Minutos','Minutes')}<input aria-label={t('Minutos','Minutes')} type="number" inputMode="numeric" min={1} max={1440} value={minutes} onChange={e=>setMinutes(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-[#d7e1ea] px-3"/></label>
   <label className="block text-sm font-semibold">{t('Fecha','Date')}<input aria-label={t('Fecha','Date')} type="date" max={crToday()} value={date} onChange={e=>setDate(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-[#d7e1ea] px-3"/></label>
   <label className="block text-sm font-semibold">{t('Actividad','Activity')}<select aria-label={t('Actividad','Activity')} value={activity} onChange={e=>setActivity(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-[#d7e1ea] bg-white px-3"><option value="">{t('Sin actividad','No activity')}</option>{activities.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
   <label className="flex min-h-11 items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={billable} onChange={e=>setBillable(e.target.checked)} className="h-5 w-5"/>{t('Facturable','Billable')}</label>
   <label className="block text-sm font-semibold">{t('Nota (opcional)','Note (optional)')}<input aria-label={t('Nota (opcional)','Note (optional)')} maxLength={300} value={note} onChange={e=>setNote(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-[#d7e1ea] px-3"/></label>
   {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
  </form>
 </Modal>;
}

export function WorkTimerControl({workId,disabled}:{workId:string;disabled?:boolean}){
 const en=useLocale()==='en',t=(es:string,english:string)=>en?english:es;
 const {page,failed,load,offset}=useTimer(),timer=page?.timer??null,elapsed=useElapsed(timer,offset);
 const [activity,setActivity]=useState(''),[billable,setBillable]=useState(true),[note,setNote]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[review,setReview]=useState(false);
 const startId=useRef<string|null>(null);
 async function run(body:Record<string,unknown>){setBusy(true);setError('');try{await send(body);window.dispatchEvent(new Event(PRO_TIMER_CHANGED));await load();return true;}catch(failure){setError((failure as Error).message||t('No se pudo comprobar el cronómetro. Reintente: no se duplicará.','Could not confirm the timer. Retry: it will not be duplicated.'));await load();return false;}finally{setBusy(false);}}
 if(!page)return <div data-work-timer className="space-y-2">{failed?<><p role="alert" className="text-sm">{t('No se pudo cargar el cronómetro.','Could not load the timer.')}</p><Button type="button" variant="secondary" onClick={()=>void load()}>{t('Reintentar','Retry')}</Button></>:<p role="status" className="text-sm text-[#68778d]">{t('Cargando cronómetro…','Loading timer…')}</p>}</div>;
 const here=timer?.workId===workId;
 return <div data-work-timer className="space-y-2">
  {timer&&<div data-work-timer-open={timer.status} className="rounded-xl bg-[#eaf7fb] p-3 text-sm">
   <p className="font-semibold"><span aria-hidden className={'mr-2 inline-block h-2.5 w-2.5 rounded-full '+(timer.status==='running'?'animate-pulse bg-[#1d8a52]':'bg-[#c58a00]')}/>{timer.status==='running'?t('Cronómetro en marcha','Timer running'):t('Tiempo por revisar','Time to review')} · <span data-work-timer-clock className="tabular-nums">{clock(elapsed)}</span></p>
   <p className="text-[#3d5068]">{here?(timer.activityName??t('Sin actividad','No activity')):t('En otro trabajo: ','On another job: ')+(timer.service??'')}</p>
   <div className="mt-2 flex flex-wrap gap-2">{timer.status==='running'&&<Button type="button" disabled={busy||disabled} onClick={()=>void run({action:'stop',actionId:crypto.randomUUID(),timerId:timer.id,revision:timer.revision}).then(ok=>{if(ok)setReview(true);})}>{t('Detener','Stop')}</Button>}
    {timer.status==='stopped'&&<Button type="button" disabled={busy||disabled} onClick={()=>setReview(true)}>{t('Revisar y guardar','Review and save')}</Button>}</div>
  </div>}
  {!timer&&<form className="space-y-2" onSubmit={event=>{event.preventDefault();startId.current??=crypto.randomUUID();void run({action:'start',actionId:startId.current,workId,activityId:activity||null,billable,note:note.trim()}).then(ok=>{if(ok)startId.current=null;});}}>
   <label className="block text-sm font-semibold">{t('Actividad','Activity')}<select aria-label={t('Actividad del cronómetro','Timer activity')} value={activity} disabled={busy||disabled} onChange={e=>{setActivity(e.target.value);const found=page.activities.find(a=>a.id===e.target.value);if(found)setBillable(found.billable);}} className="mt-1 min-h-11 w-full rounded-xl border border-[#d7e1ea] bg-white px-3"><option value="">{t('Sin actividad','No activity')}</option>{page.activities.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
   <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={billable} disabled={busy||disabled} onChange={e=>setBillable(e.target.checked)} className="h-5 w-5"/>{t('Facturable','Billable')}</label>
   <input aria-label={t('Nota del cronómetro (opcional)','Timer note (optional)')} placeholder={t('Nota (opcional)','Note (optional)')} maxLength={300} value={note} disabled={busy||disabled} onChange={e=>setNote(e.target.value)} className="min-h-11 w-full rounded-xl border border-[#d7e1ea] px-3 text-sm"/>
   <Button type="submit" disabled={busy||disabled} className="w-full">{busy?t('Iniciando…','Starting…'):t('Iniciar cronómetro','Start timer')}</Button>
  </form>}
  {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
  {review&&timer&&timer.status==='stopped'&&<ReviewForm timer={timer} activities={page.activities} onClose={()=>setReview(false)} onDone={()=>{setReview(false);void load();}}/>}
 </div>;
}

export function RunningTimerIndicator(){
 const en=useLocale()==='en',t=(es:string,english:string)=>en?english:es;
 const {page,offset,load}=useTimer(),timer=page?.timer??null,elapsed=useElapsed(timer,offset),[review,setReview]=useState(false),[busy,setBusy]=useState(false);
 if(!timer)return null;
 const label=timer.status==='running'?t('Cronómetro en marcha','Timer running'):t('Tiempo por revisar','Time to review');
 return <div data-running-timer={timer.status} role="status" aria-label={label} className="flex items-center gap-2 rounded-full border border-[#bfe6f2] bg-[#eaf7fb] py-1 pl-3 pr-1 text-sm">
  <span aria-hidden className={'inline-block h-2.5 w-2.5 rounded-full '+(timer.status==='running'?'animate-pulse bg-[#1d8a52]':'bg-[#c58a00]')}/>
  <span className="max-w-[10rem] truncate font-semibold sm:max-w-[14rem]">{timer.service??label}</span>
  <span className="tabular-nums text-[#3d5068]">{clock(elapsed)}</span>
  <span className="sr-only">{proCount(Math.max(1,Math.ceil(elapsed/60)),en,['minuto','minutos'],['minute','minutes'])}</span>
  <Button type="button" variant="secondary" disabled={busy} className="h-9 min-h-9 px-3" onClick={async()=>{if(timer.status==='stopped'){setReview(true);return;}setBusy(true);try{await send({action:'stop',actionId:crypto.randomUUID(),timerId:timer.id,revision:timer.revision});await load();setReview(true);}catch{await load();}finally{setBusy(false);}}}>{timer.status==='running'?t('Detener','Stop'):t('Revisar','Review')}</Button>
  {review&&page&&page.timer?.status==='stopped'&&<ReviewForm timer={page.timer} activities={page.activities} onClose={()=>setReview(false)} onDone={()=>{setReview(false);void load();}}/>}
 </div>;
}
