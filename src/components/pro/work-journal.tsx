'use client';
import {DailyLogCrewPicker} from './daily-log-crew';
import {useCallback,useEffect,useRef,useState} from 'react';
import {useLocale} from 'next-intl';
import {Button} from '@/components/ui/button';
import {clientJournalSchema,crewSummary,workJournalSchema,type ClientJournal} from '@/lib/pro/work-journal';

type JournalMap=Record<string,{clientVisible:boolean;crewCount:number|null;crewMinutes:number|null;fromUpdate:boolean}>;
const field='block min-h-11 w-full min-w-0 rounded-xl border border-[#d7e1ea] bg-white px-3 py-2 text-base';

/** Round 7C: journal fields of the owner's entries for one job (one read, refreshed after writes). */
export function useWorkJournal(workId:string){
 const [map,setMap]=useState<JournalMap>({}),[error,setError]=useState(false),seq=useRef(0);
 const load=useCallback(async()=>{const n=++seq.current;try{const response=await fetch('/api/pro/work-journal?'+new URLSearchParams({view:'owner',workId}),{cache:'no-store'});if(!response.ok)throw Error();const body=workJournalSchema.parse(await response.json());if(n===seq.current){setMap(body.entries);setError(false);}}catch{if(n===seq.current)setError(true);}},[workId]);
 useEffect(()=>{const timer=setTimeout(()=>void load(),0);return()=>clearTimeout(timer);},[load]);
 return {map,error,load};
}

/** «Visible al cliente» + crew/hours of one Daily Log entry (owner). */
export function JournalEntryControls({workId,log,info,blocked,onSaved}:{workId:string;log:{id:string;revision:number;archived:boolean};info?:JournalMap[string];blocked:boolean;onSaved:()=>void}){
 const en=useLocale()==='en',[editing,setEditing]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[count,setCount]=useState(''),[hours,setHours]=useState(''),[pendingVisible,setPendingVisible]=useState<{value:boolean;base:boolean}|null>(null),[savedRevision,setSavedRevision]=useState(0),[team,setTeam]=useState(false);
 // The entry list reloads after each write; until then the revision returned by the last save is the current one.
 const revision=Math.max(log.revision,savedRevision);
 // The switch shows the requested value while it saves; once the saved value is read it wins again.
 const savedVisible=!!info?.clientVisible,visible=pendingVisible&&pendingVisible.base===savedVisible?pendingVisible.value:savedVisible,summary=info?crewSummary(info.crewCount,info.crewMinutes,en):'';
 async function save(next:{clientVisible:boolean;crewCount:number|null;crewMinutes:number|null}){if(busy||blocked)return;setBusy(true);setError('');try{const response=await fetch('/api/pro/work-journal',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'journal_set',actionId:crypto.randomUUID(),workId,logId:log.id,revision,...next})});if(!response.ok)setPendingVisible(null);if(response.status===409){setError(en?'The entry changed. It was refreshed; try again.':'La entrada cambió. Se actualizó; intente de nuevo.');onSaved();return;}if(response.status===403){setError(en?'Your role does not allow this change.':'Su rol no permite este cambio.');return;}if(!response.ok)throw Error();const saved=await response.json() as {revision?:number};if(typeof saved.revision==='number')setSavedRevision(saved.revision);setEditing(false);onSaved();}catch{setPendingVisible(null);setError(en?'Could not save. Try again.':'No se pudo guardar. Intente de nuevo.');}finally{setBusy(false);}}
 function parseCrew(){const c=count.trim()===''?null:Number(count),h=hours.trim()===''?null:Number(hours.replace(',','.'));if(c!==null&&(!Number.isInteger(c)||c<0||c>500)||h!==null&&(!Number.isFinite(h)||h<0||h>10000))return null;return{crewCount:c,crewMinutes:h===null?null:Math.round(h*60)};}
 return <div data-journal-entry={log.id} className="space-y-2 rounded-xl bg-[#f7f9fc] p-3 text-sm">
  <div className="flex flex-wrap items-center gap-3">
   <label className="flex min-h-11 items-center gap-2 font-semibold"><input type="checkbox" data-journal-visible data-pro-write="work.write" className="h-5 w-5 accent-[#008fb8]" checked={visible} disabled={busy||blocked||log.archived} onChange={event=>{setPendingVisible({value:event.target.checked,base:savedVisible});void save({clientVisible:event.target.checked,crewCount:info?.crewCount??null,crewMinutes:info?.crewMinutes??null});}}/>{en?'Visible to the customer':'Visible al cliente'}</label>
   {summary&&<span data-journal-crew className="rounded-lg bg-white px-2 py-1 text-xs font-semibold text-[#334155]">{(en?'Crew: ':'Personal: ')+summary}</span>}
   {info?.fromUpdate&&<span className="text-xs text-[#52627a]">{en?'From a previous update':'Venía de un avance anterior'}</span>}
   {!editing&&!log.archived&&<Button type="button" variant="ghost" data-pro-write="work.write" disabled={busy||blocked} onClick={()=>{setCount(info?.crewCount==null?'':String(info.crewCount));setHours(info?.crewMinutes==null?'':String(Math.round(info.crewMinutes/6)/10));setEditing(true);}}>{en?'Crew and hours':'Personal y horas'}</Button>}
   {!editing&&!team&&!log.archived&&<Button type="button" variant="ghost" data-journal-team-crew data-pro-write="work.write" disabled={busy||blocked} onClick={()=>setTeam(true)}>{en?'Crew from the team':'Personal del equipo'}</Button>}
  </div>
  {team&&<DailyLogCrewPicker workId={workId} logId={log.id} onCancel={()=>setTeam(false)} onSaved={next=>{setSavedRevision(next);setTeam(false);onSaved();}}/>}
  {editing&&<form data-journal-crew-form className="grid min-w-0 gap-2 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end" onSubmit={event=>{event.preventDefault();const crew=parseCrew();if(!crew){setError(en?'People: whole number 0–500. Hours: 0–10,000.':'Personas: número entero de 0 a 500. Horas: de 0 a 10 000.');return;}void save({clientVisible:visible,...crew});}}>
   <label className="block min-w-0 font-semibold">{en?'People on site':'Personas en obra'}<input aria-label={en?'People on site':'Personas en obra'} inputMode="numeric" className={field} value={count} onChange={event=>setCount(event.target.value)}/></label>
   <label className="block min-w-0 font-semibold">{en?'Total hours':'Horas totales'}<input aria-label={en?'Total crew hours':'Horas totales del personal'} inputMode="decimal" className={field} value={hours} onChange={event=>setHours(event.target.value)}/></label>
   <Button type="submit" disabled={busy}>{en?'Save':'Guardar'}</Button><Button type="button" variant="outline" disabled={busy} onClick={()=>setEditing(false)}>{en?'Cancel':'Cancelar'}</Button>
  </form>}
  {error&&<p role="alert" className="text-red-700">{error}</p>}
 </div>;
}

function date(day:string,en:boolean){return new Intl.DateTimeFormat(en?'en-US':'es-CR',{dateStyle:'full',timeZone:'UTC'}).format(new Date(day+'T12:00:00Z'));}
function weatherText(value:unknown,en:boolean){if(!value||typeof value!=='object')return '';const w=value as {condition?:string;temperatureC?:number|null;note?:string};const label=({clear:en?'Clear':'Despejado',cloudy:en?'Cloudy':'Nublado',rain:en?'Rain':'Lluvia',other:en?'Other':'Otro'} as Record<string,string>)[w.condition??'']??'';const parts=[label,typeof w.temperatureC==='number'?w.temperatureC+' °C':'',w.note??''].filter(Boolean);return parts.length?(en?'Weather: ':'Clima: ')+parts.join(' · '):'';}

/** Customer side: the job's Daily Log entries marked visible (newest first). */
/** `updates`/`dailyLogs`: the two existing «Vista del cliente» switches; entries copied from updates follow the first, the rest the second. */
export function ClientJournal({requestId,updates=true,dailyLogs=true}:{requestId:string;updates?:boolean;dailyLogs?:boolean}){
 const en=useLocale()==='en',[state,setState]=useState<{data:ClientJournal|null;error:boolean}>({data:null,error:false}),items=(state.data?.items??[]).filter(item=>item.fromUpdate?updates:dailyLogs);
 const load=useCallback(async()=>{try{const response=await fetch('/api/pro/work-journal?'+new URLSearchParams({view:'client',requestId}),{cache:'no-store'});if(!response.ok)throw Error();setState({data:clientJournalSchema.parse(await response.json()),error:false});}catch{setState(old=>({...old,error:true}));}},[requestId]);
 useEffect(()=>{const timer=setTimeout(()=>void load(),0);return()=>clearTimeout(timer);},[load]);
 if(state.error)return <section data-client-journal className="space-y-2"><h3 className="font-semibold">{en?'Daily log':'Bitácora'}</h3><p role="alert">{en?'Could not load the daily log.':'No se pudo cargar la bitácora.'} <Button variant="outline" onClick={()=>void load()}>{en?'Retry':'Reintentar'}</Button></p></section>;
 if(!state.data)return <p role="status">{en?'Loading daily log…':'Cargando bitácora…'}</p>;
 return <section data-client-journal className="min-w-0 space-y-3"><h3 className="font-semibold">{en?'Daily log':'Bitácora'}</h3>
  {items.length===0?<p className="text-sm text-[#52627a]">{en?'Your professional has not shared daily log entries yet.':'Su profesional todavía no ha compartido entradas de la bitácora.'}</p>:items.map(item=><article key={item.id} data-client-journal-entry={item.id} className="min-w-0 space-y-2 rounded-2xl border border-[#d7e1ea] bg-white p-4">
   <p className="text-xs font-semibold uppercase tracking-wide text-[#52627a]">{date(item.date,en)}</p><h4 className="break-words font-semibold">{item.title}</h4>
   {item.notes&&<p className="whitespace-pre-wrap break-words text-sm">{item.notes}</p>}
   {weatherText(item.weather,en)&&<p className="text-sm text-[#334155]">{weatherText(item.weather,en)}</p>}
   {(item.crewCount!==null||item.crewMinutes!==null)&&<p className="text-sm text-[#334155]">{(en?'Crew: ':'Personal: ')+crewSummary(item.crewCount,item.crewMinutes,en)}</p>}
   {item.photos.length>0&&<div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{item.photos.map(photo=><PrivatePhoto key={photo.id} src={'/api/pro/work-journal?'+new URLSearchParams({view:'photo',requestId,fileId:photo.id})} alt={photo.name}/>)}</div>}
  </article>)}
 </section>;
}

function PrivatePhoto({src,alt}:{src:string;alt:string}){
 // eslint-disable-next-line @next/next/no-img-element -- authenticated same-origin bytes (no image optimizer for private files)
 return <img src={src} alt={alt} loading="lazy" className="aspect-square w-full rounded-xl object-cover"/>;
}
