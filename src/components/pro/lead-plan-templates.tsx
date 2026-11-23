'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {useLocale} from 'next-intl';
import {Button} from '@/components/ui/button';
import {leadPlanItemSchema,leadPlansSchema,type LeadPlans} from '@/lib/pro/lead-plans';
import {taskTemplateListSchema} from '@/lib/pro/task-templates';
import {scheduleTemplateListSchema} from '@/lib/pro/schedule-templates';
import {crTodayISO} from '@/lib/time-cr';

/**
 * Rows 78/79: attach a task template and/or a schedule template to an opportunity that is not a job yet. The plan stays
 * pending; when the opportunity becomes a job the tasks, phases, dates and milestones are created in it (same
 * transaction as the conversion), optionally moved to working days with the company calendar. Nothing is sent.
 */
const field='block min-h-11 w-full min-w-0 rounded-xl border border-[#d7e1ea] bg-white px-3 py-2 text-base font-normal';
type TemplateOption={id:string;name:string};
export function LeadPlanTemplates({actor,leadId,disabled=false}:{actor:string;leadId:string;disabled?:boolean}){
 const en=useLocale()==='en',t=(es:string,english:string)=>en?english:es,headers={'X-Pro-Expected-Actor':actor};
 const [plans,setPlans]=useState<LeadPlans|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[kind,setKind]=useState<'tasks'|'schedule'>('tasks'),[options,setOptions]=useState<TemplateOption[]>([]),
  [templateId,setTemplateId]=useState(''),[startDate,setStartDate]=useState(crTodayISO()),[calendar,setCalendar]=useState(true),pending=useRef<{key:string;actionId:string}|null>(null),mutex=useRef(false);
 const load=useCallback(async()=>{
  try{const r=await fetch('/api/pro/lead-plans?'+new URLSearchParams({leadId}),{cache:'no-store',headers});if(!r.ok)throw Error();setPlans(leadPlansSchema.parse(await r.json()));setError('');}
  catch{setPlans(null);setError(t('No se pudieron cargar los planes de la oportunidad.','Could not load the opportunity plans.'));}
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[actor,leadId,en]);
 useEffect(()=>{const timer=setTimeout(()=>void load(),0);return()=>clearTimeout(timer);},[load]);
 useEffect(()=>{
  let live=true;
  (async()=>{
   try{
    const url=(kind==='tasks'?'/api/pro/task-templates?':'/api/pro/schedule-templates?')+new URLSearchParams({view:'list',status:'active',q:''});
    const r=await fetch(url,{cache:'no-store',headers:{'X-Pro-Expected-Actor':actor}});if(!r.ok)throw Error();
    const data=kind==='tasks'?taskTemplateListSchema.parse(await r.json()):scheduleTemplateListSchema.parse(await r.json());
    if(live){setOptions(data.items.map(i=>({id:i.id,name:i.name})));setTemplateId('');}
   }catch{if(live){setOptions([]);}}
  })();
  return()=>{live=false;};
 },[kind,actor]);
 async function send(body:Record<string,unknown>,key:string){
  if(mutex.current)return false;mutex.current=true;setBusy(true);setError('');
  const attempt=pending.current?.key===key?pending.current:(pending.current={key,actionId:crypto.randomUUID()});
  try{
   const r=await fetch('/api/pro/lead-plans',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify({...body,actionId:attempt.actionId})});
   if(r.status===409){pending.current=null;setError(t('La oportunidad o el plan cambió. Se recargó: revise y vuelva a intentarlo.','The opportunity or the plan changed. It was reloaded: review and try again.'));await load();return false;}
   if(!r.ok){const data=await r.json().catch(()=>({}));setError(typeof data.error==='string'?data.error:t('No se pudo guardar.','Could not save.'));return false;}
   leadPlanItemSchema.parse(await r.json());pending.current=null;await load();return true;
  }catch{setError(t('No se pudo comprobar el guardado. Reintente: no se duplicará.','Could not confirm the save. Retry: it will not be duplicated.'));return false;}
  finally{mutex.current=false;setBusy(false);}
 }
 async function attach(){if(!templateId||!/^\d{4}-\d{2}-\d{2}$/.test(startDate)){setError(t('Elija la plantilla y la fecha de inicio.','Choose the template and the start date.'));return;}
  if(await send({action:'attach',leadId,kind,templateId,startDate,calendar},'attach:'+kind+':'+templateId+':'+startDate+':'+calendar))setTemplateId('');}
 const items=plans?.items??[],closed=!plans||plans.archived||plans.converted||disabled;
 const kindLabel=(k:string)=>k==='tasks'?t('Tareas','Tasks'):t('Cronograma','Schedule');
 const statusLabel=(s:string)=>({pending:t('Pendiente: se crea al convertir en trabajo','Pending: created when converted to a job'),applied:t('Aplicada al trabajo','Applied to the job'),skipped:t('No se aplicó','Not applied'),removed:t('Quitada','Removed')} as Record<string,string>)[s]??s;
 return <section data-lead-plan-templates className="min-w-0 space-y-3 rounded-2xl border border-[#d7e1ea] bg-white p-4">
  <h3 className="font-bold">{t('Plan de trabajo para cuando se convierta','Work plan for when it becomes a job')}</h3>
  <p className="text-sm text-[#52627a]">{t('Elija una plantilla de tareas o de cronograma. Se guardará como plan pendiente y se creará en el trabajo cuando convierta la oportunidad; hasta entonces no se crea ninguna tarea. No se envía nada.','Choose a task or schedule template. It is saved as a pending plan and created in the job when you convert the opportunity; no task is created until then. Nothing is sent.')}</p>
  {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
  {!!items.length&&<ul className="space-y-2" data-lead-plan-list>{items.map(item=><li key={item.id} data-lead-plan-item={item.status} className="min-w-0 rounded-xl border border-[#eef2f6] p-3 text-sm">
   <p className="break-words font-semibold">{kindLabel(item.kind)}: {item.templateName}</p>
   <p className="text-[#52627a]">{t('Inicio','Start')} {item.startDate}{item.calendar?' · '+t('respeta el calendario laboral','respects the work calendar'):''}</p>
   <p data-lead-plan-status className={item.status==='skipped'?'text-red-700':'text-[#175b42]'}>{statusLabel(item.status)}{item.status==='pending'&&!item.available?' · '+t('la plantilla ya no está disponible','the template is no longer available'):''}</p>
   {item.status==='skipped'&&<p className="text-xs text-[#52627a]">{t('Puede aplicarla manualmente desde Plantillas dentro del trabajo.','You can apply it manually from Templates inside the job.')}</p>}
   {item.status==='pending'&&!closed&&<Button type="button" size="sm" variant="ghost" data-pro-write="sales.write" data-lead-plan-remove={item.id} disabled={busy} onClick={()=>void send({action:'remove',leadId,id:item.id,revision:item.revision},'remove:'+item.id+':'+item.revision)}>{t('Quitar','Remove')}</Button>}
  </li>)}</ul>}
  {!closed&&<div className="grid gap-3 sm:grid-cols-2">
   <label className="block text-sm font-semibold">{t('Tipo','Type')}<select data-lead-plan-kind className={field} value={kind} disabled={busy} onChange={e=>setKind(e.target.value as 'tasks'|'schedule')}><option value="tasks">{t('Plantilla de tareas','Task template')}</option><option value="schedule">{t('Plantilla de cronograma','Schedule template')}</option></select></label>
   <label className="block text-sm font-semibold">{t('Plantilla','Template')}<select data-lead-plan-template className={field} value={templateId} disabled={busy} onChange={e=>setTemplateId(e.target.value)}><option value="">{options.length?t('Elija una plantilla','Choose a template'):t('No hay plantillas activas','No active templates')}</option>{options.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
   <label className="block text-sm font-semibold">{t('Fecha de inicio prevista','Planned start date')}<input data-lead-plan-start type="date" className={field} value={startDate} disabled={busy} onChange={e=>setStartDate(e.target.value)}/></label>
   <label className="flex min-h-11 items-center gap-2 text-sm font-semibold"><input data-lead-plan-calendar type="checkbox" checked={calendar} disabled={busy} onChange={e=>setCalendar(e.target.checked)}/>{t('Mover a días laborables (calendario de la empresa)','Move to working days (company calendar)')}</label>
   <div className="sm:col-span-2"><Button type="button" data-pro-write="sales.write" data-lead-plan-attach disabled={busy||!templateId} onClick={()=>void attach()}>{t('Guardar plan pendiente','Save pending plan')}</Button></div>
  </div>}
  {!closed&&<p className="text-xs text-[#52627a]">{t('Si la fecha de inicio ya pasó al convertir, se usa la fecha de ese día.','If the start date has passed when you convert, that day\'s date is used.')}</p>}
 </section>;
}
