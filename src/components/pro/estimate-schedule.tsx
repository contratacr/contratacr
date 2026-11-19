'use client';
import {useEffect,useMemo,useRef,useState} from 'react';
import {useLocale} from 'next-intl';
import {Button} from '@/components/ui/button';
import {Modal} from '@/components/ui/modal';
import {estimateSchedulePlan,estimateScheduleResultSchema,estimateScheduleSourceSchema,type EstimateScheduleSource} from '@/lib/pro/operations';

/**
 * Ronda F2-C (row 13, "cotización a cronograma"): build the schedule from a quote of this job. Each quote section
 * becomes a phase and each line a task (1 day, or the quantity when the unit is days). The person reviews titles,
 * durations, waiting days and which lines to include before creating. Tasks run one after the other
 * (finish-to-start); everything is created in one transaction through the existing writers.
 */
type Task={key:string;lineId:string|null;title:string;days:string;lag:string;include:boolean};
type Phase={key:string;title:string;tasks:Task[]};
const crToday=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Costa_Rica'}).format(new Date());
const field='mt-1 block min-h-11 w-full min-w-0 rounded-xl border border-[#d7e1ea] bg-white px-3 text-base font-normal';
function copy(en:boolean){
 return en?{open:'Generate schedule from quote',title:'Schedule from a quote',quote:'Quote',start:'Start date',general:'General work',
  intro:'Each quote section becomes a phase and each line a task. Tasks follow one another: each starts when the previous one ends, plus the waiting days you set. Review everything before creating; nothing is sent to the customer.',
  phase:'Phase name',task:'Task',days:'Days',lag:'Waiting days before',include:'Include',create:'Create schedule',creating:'Creating…',cancel:'Cancel',loading:'Loading quotes…',
  none:'This job has no quotes with lines yet. Create a quote for the project first.',error:'Could not load the quotes.',retry:'Retry',
  summary:(n:number,a:string,b:string)=>`${n} ${n===1?'task':'tasks'} · ${a} – ${b}`,existing:(n:number)=>`The job already has ${n} ${n===1?'task':'tasks'}: the new phases are added after the existing ones; nothing is replaced.`,
  done:(n:number)=>`Schedule created: ${n} ${n===1?'task':'tasks'} added.`,conflict:'The quote or the schedule changed. Reload before creating.',invalid:'Check the names (up to 160 characters), days (1 to 365) and waiting days (0 to 60).',
  failed:'Could not confirm the schedule. Retry: it will not be duplicated.',empty:'Include at least one task.',dates:(a:string,b:string)=>`${a} – ${b}`}
 :{open:'Generar cronograma desde la cotización',title:'Cronograma desde una cotización',quote:'Cotización',start:'Fecha de inicio',general:'Trabajos generales',
  intro:'Cada sección de la cotización se convierte en una fase y cada línea en una tarea. Las tareas van una después de otra: cada una empieza cuando termina la anterior, más los días de espera que indique. Revise todo antes de crear; no se envía nada al cliente.',
  phase:'Nombre de la fase',task:'Tarea',days:'Días',lag:'Días de espera antes',include:'Incluir',create:'Crear cronograma',creating:'Creando…',cancel:'Cancelar',loading:'Cargando cotizaciones…',
  none:'Este trabajo todavía no tiene cotizaciones con líneas. Cree primero una cotización del proyecto.',error:'No se pudieron cargar las cotizaciones.',retry:'Reintentar',
  summary:(n:number,a:string,b:string)=>`${n} ${n===1?'tarea':'tareas'} · ${a} – ${b}`,existing:(n:number)=>`El trabajo ya tiene ${n} ${n===1?'tarea':'tareas'}: las fases nuevas se agregan después de las actuales; no se reemplaza nada.`,
  done:(n:number)=>`Cronograma creado: se agregaron ${n} ${n===1?'tarea':'tareas'}.`,conflict:'La cotización o el cronograma cambiaron. Recargue antes de crear.',invalid:'Revise los nombres (hasta 160 caracteres), los días (1 a 365) y los días de espera (0 a 60).',
  failed:'No se pudo comprobar el cronograma. Reintente: no se duplicará.',empty:'Incluya al menos una tarea.',dates:(a:string,b:string)=>`${a} – ${b}`};
}
function phasesOf(estimate:EstimateScheduleSource['estimates'][number],general:string):Phase[]{
 const out:Phase[]=[];
 estimate.lines.forEach((line,i)=>{const name=line.group??general,last=out.at(-1);const task:Task={key:String(i),lineId:line.lineId,title:line.title,days:String(line.days),lag:'0',include:true};
  if(last&&last.title===name)last.tasks.push(task);else out.push({key:String(i),title:name,tasks:[task]});});
 return out;
}
export function EstimateScheduleAction({workId,accountId,disabled,onApplied}:{workId:string;accountId:string;disabled?:boolean;onApplied:(message:string)=>void}){
 const en=useLocale()==='en',c=copy(en),[open,setOpen]=useState(false);
 return <>
  <Button type="button" variant="secondary" data-estimate-schedule-open data-pro-write="work.write" className="min-h-11" disabled={disabled} onClick={()=>setOpen(true)}>{c.open}</Button>
  {open&&<EstimateScheduleDialog workId={workId} accountId={accountId} onClose={()=>setOpen(false)} onApplied={message=>{setOpen(false);onApplied(message);}}/>}
 </>;
}
function EstimateScheduleDialog({workId,accountId,onClose,onApplied}:{workId:string;accountId:string;onClose:()=>void;onApplied:(message:string)=>void}){
 const en=useLocale()==='en',c=copy(en);
 const [source,setSource]=useState<EstimateScheduleSource|null>(null),[failed,setFailed]=useState(false),[estimateId,setEstimateId]=useState(''),[start,setStart]=useState(crToday()),[phases,setPhases]=useState<Phase[]>([]);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),action=useRef<{key:string;id:string}|null>(null);
 const fmt=(iso:string)=>new Intl.DateTimeFormat(en?'en-US':'es-CR',{dateStyle:'medium',timeZone:'UTC'}).format(new Date(iso+'T12:00:00Z'));
 async function load(){
  setFailed(false);setSource(null);
  try{const r=await fetch('/api/pro/estimate-schedule?'+new URLSearchParams({workId}),{cache:'no-store',headers:{'X-Pro-Expected-Actor':accountId}});if(!r.ok)throw Error();const body=estimateScheduleSourceSchema.parse(await r.json());
   setSource(body);setStart(old=>old||body.today);const first=body.estimates.find(e=>e.lines.length)??null;setEstimateId(first?.id??'');setPhases(first?phasesOf(first,c.general):[]);}
  catch{setFailed(true);}
 }
 // eslint-disable-next-line react-hooks/exhaustive-deps
 useEffect(()=>{const timer=setTimeout(()=>void load(),0);return()=>clearTimeout(timer);},[workId]);
 const estimates=source?.estimates.filter(e=>e.lines.length)??[],estimate=estimates.find(e=>e.id===estimateId)??null;
 const included=phases.map(p=>({...p,tasks:p.tasks.filter(t=>t.include)})).filter(p=>p.tasks.length);
 const valid=included.length>0&&included.every(p=>p.title.trim().length>=1&&p.title.trim().length<=160&&p.tasks.every(t=>t.title.trim().length>=1&&t.title.trim().length<=160&&/^\d{1,3}$/.test(t.days)&&+t.days>=1&&+t.days<=365&&/^\d{1,2}$/.test(t.lag)&&+t.lag<=60))&&/^\d{4}-\d{2}-\d{2}$/.test(start);
 const plan=useMemo(()=>valid?estimateSchedulePlan(start,included.map(p=>({tasks:p.tasks.map(t=>({days:+t.days,lagDays:+t.lag}))}))):null,[valid,start,included]);
 const flat=plan?.flat()??[],count=flat.length;
 const dateOf=(phaseKey:string,taskKey:string)=>{if(!plan)return null;const pi=included.findIndex(p=>p.key===phaseKey);if(pi<0)return null;const ti=included[pi].tasks.findIndex(t=>t.key===taskKey);return ti<0?null:plan[pi][ti];};
 const setTask=(pk:string,tk:string,patch:Partial<Task>)=>setPhases(old=>old.map(p=>p.key!==pk?p:{...p,tasks:p.tasks.map(t=>t.key!==tk?t:{...t,...patch})}));
 async function create(){
  if(busy||!source||!estimate)return;if(!included.length){setError(c.empty);return;}if(!valid){setError(c.invalid);return;}
  const body={action:'apply',workId,estimateId:estimate.id,estimateRevision:estimate.revision,revision:source.revision,startDate:start,
   phases:included.map(p=>({title:p.title.trim(),tasks:p.tasks.map(t=>({lineId:t.lineId,title:t.title.trim(),days:+t.days,lagDays:+t.lag}))}))};
  const key=JSON.stringify(body);if(action.current?.key!==key)action.current={key,id:crypto.randomUUID()};
  setBusy(true);setError('');
  try{const r=await fetch('/api/pro/estimate-schedule',{method:'POST',headers:{'Content-Type':'application/json','X-Pro-Expected-Actor':accountId},body:JSON.stringify({...body,actionId:action.current.id})});
   if(r.status===409){action.current=null;setError(c.conflict);return;}if(r.status===400){setError(c.invalid);return;}if(!r.ok)throw Error();
   const result=estimateScheduleResultSchema.parse(await r.json());onApplied(c.done(result.taskIds.length));}
  catch{setError(c.failed);}finally{setBusy(false);}
 }
 return <Modal title={c.title} ariaLabel={c.title} onClose={()=>{if(!busy)onClose();}} closeLabel={c.cancel} mobilePresentation="fullscreen"
  footer={<><Button type="button" variant="secondary" disabled={busy} onClick={onClose}>{c.cancel}</Button><Button type="button" data-estimate-schedule-create disabled={busy||!estimate||!valid} onClick={()=>void create()}>{busy?c.creating:c.create}</Button></>}>
  <div data-estimate-schedule className="min-w-0 space-y-4">
   <p className="text-sm text-[#52627a]">{c.intro}</p>
   {!source&&!failed&&<p role="status">{c.loading}</p>}
   {failed&&<div role="alert" className="space-y-2 text-sm"><p>{c.error}</p><Button type="button" variant="secondary" onClick={()=>void load()}>{c.retry}</Button></div>}
   {source&&!estimates.length&&<p data-estimate-schedule-empty className="rounded-2xl border border-dashed border-[#d7e1ea] bg-white p-4 text-sm text-[#52627a]">{c.none}</p>}
   {source&&estimate&&<>
    <div className="grid min-w-0 gap-3 sm:grid-cols-2">
     {estimates.length>1&&<label className="block min-w-0 text-sm font-semibold">{c.quote}<select data-estimate-schedule-quote className={field} value={estimateId} disabled={busy} onChange={e=>{const next=estimates.find(x=>x.id===e.target.value);if(next){setEstimateId(next.id);setPhases(phasesOf(next,c.general));action.current=null;}}}>{estimates.map(e=><option key={e.id} value={e.id}>{e.title}</option>)}</select></label>}
     <label className="block min-w-0 text-sm font-semibold">{c.start}<input type="date" data-estimate-schedule-start className={field} value={start} disabled={busy} onChange={e=>setStart(e.target.value)}/></label>
    </div>
    {source.existingTasks>0&&<p className="rounded-xl bg-[#f3f8fb] p-3 text-sm text-[#3d5068]">{c.existing(source.existingTasks)}</p>}
    {plan&&count>0&&<p data-estimate-schedule-summary className="text-sm font-semibold text-[#162543]">{c.summary(count,fmt(flat[0].start),fmt(flat[flat.length-1].end))}</p>}
    <div className="min-w-0 space-y-4">{phases.map(phase=><fieldset key={phase.key} data-estimate-schedule-phase className="min-w-0 space-y-2 rounded-2xl border border-[#d7e1ea] bg-white p-3">
     <label className="block min-w-0 text-sm font-semibold">{c.phase}<input className={field} maxLength={160} value={phase.title} disabled={busy} onChange={e=>setPhases(old=>old.map(p=>p.key===phase.key?{...p,title:e.target.value}:p))}/></label>
     <ul className="min-w-0 divide-y divide-[#eef2f6]">{phase.tasks.map(task=>{const when=task.include?dateOf(phase.key,task.key):null;return <li key={task.key} data-estimate-schedule-task className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)] items-start gap-x-3 gap-y-2 py-2 sm:grid-cols-[auto_minmax(0,1fr)_5rem_7rem]">
      <label className="flex min-h-11 items-center"><input type="checkbox" className="h-5 w-5" aria-label={c.include+': '+task.title} checked={task.include} disabled={busy} onChange={e=>setTask(phase.key,task.key,{include:e.target.checked})}/></label>
      <div className="col-span-2 min-w-0 sm:col-span-1"><input aria-label={c.task} className={field+' mt-0'} maxLength={160} value={task.title} disabled={busy||!task.include} onChange={e=>setTask(phase.key,task.key,{title:e.target.value})}/>{when&&<p className="mt-1 text-xs text-[#52627a]">{c.dates(fmt(when.start),fmt(when.end))}</p>}</div>
      <label className="col-start-2 block min-w-0 text-xs font-semibold text-[#52627a] sm:col-start-auto">{c.days}<input aria-label={c.days+': '+task.title} type="number" inputMode="numeric" min={1} max={365} className={field} value={task.days} disabled={busy||!task.include} onChange={e=>setTask(phase.key,task.key,{days:e.target.value})}/></label>
      <label className="block min-w-0 text-xs font-semibold text-[#52627a]">{c.lag}<input aria-label={c.lag+': '+task.title} type="number" inputMode="numeric" min={0} max={60} className={field} value={task.lag} disabled={busy||!task.include} onChange={e=>setTask(phase.key,task.key,{lag:e.target.value})}/></label>
     </li>;})}</ul>
    </fieldset>)}</div>
   </>}
   {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
  </div>
 </Modal>;
}
