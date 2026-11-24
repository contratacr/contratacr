'use client';
import {useState} from 'react';
import {useLocale} from 'next-intl';
import {Button} from '@/components/ui/button';
import {scheduleTemplateMutationSchema} from '@/lib/pro/schedule-templates';
import {workScheduleMutationSchema,workScheduleResultSchema} from '@/lib/pro/work-schedule';
import type {Gantt} from '@/lib/pro/project-schedule';
import {addDays,daysBetween,scheduleCsv,scheduleToTemplate} from '@/lib/pro/schedule-views';

/**
 * Area C (Houzz "Actions" menu): export the schedule as CSV and move the whole project start date.
 * Also "Save as template" (existing schedule-templates writer) and "Delete schedule" (clears periods, archives phases and key dates; the tasks themselves are kept).
 * Moving uses the existing item writers one by one (same dates, new offset, dependencies unchanged, revision per write).
 */
export function ScheduleActions({data,workId,accountId,disabled,onChanged,canEdit}:{data:Gantt;workId:string;accountId:string;disabled:boolean;onChanged:()=>void;canEdit:boolean}){
 const en=useLocale()==='en',t=(es:string,english:string)=>en?english:es;
 const [panel,setPanel]=useState<''|'template'|'delete'>(''),[name,setName]=useState(''),[confirmed,setConfirmed]=useState(false),[open,setOpen]=useState(false),[start,setStart]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
 const first=data.plannedStart,moving=data.tasks.filter(task=>task.plannedStart&&task.plannedEnd&&task.status==='open'),delta=first&&start?daysBetween(first,start):0;
 function download(){
  const blob=new Blob([scheduleCsv(data,en)],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=(en?'schedule':'cronograma')+'.csv';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
 async function saveTemplate(){
  const def=scheduleToTemplate(data);if(!def||!name.trim()||busy)return;setBusy(true);setError('');setMessage('');
  try{
   const body=scheduleTemplateMutationSchema.parse({action:'save',actionId:crypto.randomUUID(),templateId:crypto.randomUUID(),revision:0,name:name.trim(),notes:'',...def});
   const response=await fetch('/api/pro/schedule-templates',{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json','X-Pro-Expected-Actor':accountId},body:JSON.stringify(body)});
   if(!response.ok)throw Error(String(response.status));
   setMessage(t('Plantilla guardada. La encuentra en Plantillas del cronograma.','Template saved. You will find it under Schedule templates.'));setPanel('');setName('');
  }catch{setError(t('No se pudo guardar la plantilla. Revise el nombre y reintente.','The template could not be saved. Check the name and try again.'));}
  finally{setBusy(false);}
 }
 async function removeSchedule(){
  if(!confirmed||busy)return;setBusy(true);setError('');setMessage('');let revision=data.revision,done=0;
  const steps=[...data.tasks.filter(x=>x.plannedStart||x.plannedEnd||x.phaseId||x.dependsOn.length).map(x=>({action:'task_clear',taskId:x.id})),...data.phases.map(x=>({action:'phase_archive',phaseId:x.id})),...data.milestones.map(x=>({action:'milestone_archive',milestoneId:x.id}))];
  try{
   for(const step of steps){
    const body=workScheduleMutationSchema.parse({...step,actionId:crypto.randomUUID(),workId,revision});
    const response=await fetch('/api/pro/work-schedule',{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json','X-Pro-Expected-Actor':accountId},body:JSON.stringify(body)});
    if(!response.ok)throw Error(String(response.status));
    revision=workScheduleResultSchema.parse(await response.json()).revision;done++;
   }
   setMessage(t('Cronograma eliminado. Las tareas se conservan en Tareas.','Schedule deleted. The tasks are kept under Tasks.'));setPanel('');setConfirmed(false);
  }catch(failure){setError((failure as Error).message==='409'?t('El cronograma cambió. Recargue y repita; lo ya eliminado se conserva.','The schedule changed. Reload and repeat; what was already removed stays removed.'):t(`Se eliminaron ${done} elementos y se detuvo. Recargue y repita para terminar.`,`${done} elements were removed and it stopped. Reload and repeat to finish.`));}
  finally{setBusy(false);onChanged();}
 }
 async function move(){
  if(!delta||busy)return;setBusy(true);setError('');setMessage('');let revision=data.revision,done=0;
  try{
   for(const task of moving){
    const body=workScheduleMutationSchema.parse({action:'task_plan',actionId:crypto.randomUUID(),workId,revision,taskId:task.id,phaseId:task.phaseId,plannedStart:addDays(task.plannedStart!,delta),plannedEnd:addDays(task.plannedEnd!,delta),dependsOn:task.dependsOn});
    const response=await fetch('/api/pro/work-schedule',{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json','X-Pro-Expected-Actor':accountId},body:JSON.stringify(body)});
    if(!response.ok)throw Error(String(response.status));
    revision=workScheduleResultSchema.parse(await response.json()).revision;done++;
   }
   for(const m of data.milestones){
    const body=workScheduleMutationSchema.parse({action:'milestone_save',actionId:crypto.randomUUID(),workId,revision,milestoneId:m.id,title:m.title,date:addDays(m.date,delta),notes:m.notes});
    const response=await fetch('/api/pro/work-schedule',{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json','X-Pro-Expected-Actor':accountId},body:JSON.stringify(body)});
    if(!response.ok)throw Error(String(response.status));
    revision=workScheduleResultSchema.parse(await response.json()).revision;
   }
   setMessage(t(`Se movieron ${done} elementos ${delta>0?delta+' días hacia adelante':-delta+' días hacia atrás'}.`,`${done} items moved ${delta>0?delta+' days later':-delta+' days earlier'}.`));setOpen(false);setStart('');
  }catch(failure){setError((failure as Error).message==='409'?t('El cronograma cambió. Recargue y repita; los elementos ya movidos se conservan.','The schedule changed. Reload and repeat; items already moved are kept.'):t(`Se movieron ${done} elementos y se detuvo. Recargue y repita para terminar.`,`${done} items were moved and it stopped. Reload and repeat to finish.`));}
  finally{setBusy(false);onChanged();}
 }
 const field='mt-1 block min-h-11 w-full min-w-0 rounded-xl border border-[#d7e1ea] bg-white px-3 text-base font-normal';
 return <div data-schedule-actions className="min-w-0 space-y-2">
  <div className="flex flex-wrap gap-2">
   <Button type="button" variant="secondary" className="min-h-11" data-schedule-export disabled={disabled||busy||(!data.tasks.length&&!data.milestones.length)} onClick={download}>{t('Exportar CSV','Export CSV')}</Button>
   {canEdit&&<Button type="button" variant="secondary" className="min-h-11" data-schedule-move-open data-pro-write="work.write" disabled={disabled||busy||!first||!moving.length} onClick={()=>{setOpen(!open);setPanel('');setStart(first??'');setError('');setMessage('');}}>{t('Mover fecha de inicio','Move start date')}</Button>}
   {canEdit&&<Button type="button" variant="secondary" className="min-h-11" data-schedule-template-open data-pro-write="work.write" disabled={disabled||busy||!scheduleToTemplate(data)} onClick={()=>{setPanel(panel==='template'?'':'template');setOpen(false);setError('');setMessage('');}}>{t('Guardar como plantilla','Save as template')}</Button>}
   {canEdit&&<Button type="button" variant="outline" className="min-h-11 border-red-300 text-red-700" data-schedule-delete-open data-pro-write="work.write" disabled={disabled||busy||(!data.tasks.some(x=>x.plannedStart||x.phaseId)&&!data.phases.length&&!data.milestones.length)} onClick={()=>{setPanel(panel==='delete'?'':'delete');setOpen(false);setConfirmed(false);setError('');setMessage('');}}>{t('Eliminar cronograma','Delete schedule')}</Button>}
  </div>
  {open&&first&&<div data-schedule-move-panel className="space-y-2 rounded-xl border border-[#d7e1ea] bg-white p-3">
   <p className="text-sm text-[#52627a]">{t('Mueve todos los elementos abiertos y las fechas clave el mismo número de días; las dependencias no cambian.','Moves every open item and key date by the same number of days; dependencies do not change.')}</p>
   <label className="block text-sm font-semibold">{t('Nueva fecha de inicio','New start date')}<input type="date" data-schedule-move-date value={start} min="1900-01-01" max="2100-12-31" onChange={e=>setStart(e.target.value)} className={field}/></label>
   {delta!==0&&<p data-schedule-move-preview className="text-sm">{t(`${moving.length} elementos se moverán ${Math.abs(delta)} días ${delta>0?'hacia adelante':'hacia atrás'}.`,`${moving.length} items will move ${Math.abs(delta)} days ${delta>0?'later':'earlier'}.`)}</p>}
   <div className="flex flex-wrap gap-2"><Button type="button" data-schedule-move-apply disabled={busy||!start||!delta} onClick={()=>void move()}>{busy?t('Moviendo…','Moving…'):t('Mover','Move')}</Button><Button type="button" variant="outline" disabled={busy} onClick={()=>setOpen(false)}>{t('Cancelar','Cancel')}</Button></div></div>}
  {panel==='template'&&<div data-schedule-template-panel className="space-y-2 rounded-xl border border-[#d7e1ea] bg-white p-3">
   <p className="text-sm text-[#52627a]">{t('Guarda las fases, tareas con período, dependencias y fechas clave como plantilla reutilizable, con fechas relativas al primer día.','Saves the phases, tasks with a period, dependencies and key dates as a reusable template, with dates relative to the first day.')}</p>
   <label className="block text-sm font-semibold">{t('Nombre de la plantilla','Template name')}<input data-schedule-template-name value={name} maxLength={80} onChange={e=>setName(e.target.value)} className={field}/></label>
   <div className="flex flex-wrap gap-2"><Button type="button" data-schedule-template-save disabled={busy||!name.trim()} onClick={()=>void saveTemplate()}>{busy?t('Guardando…','Saving…'):t('Guardar plantilla','Save template')}</Button><Button type="button" variant="outline" disabled={busy} onClick={()=>setPanel('')}>{t('Cancelar','Cancel')}</Button></div></div>}
  {panel==='delete'&&<div data-schedule-delete-panel className="space-y-2 rounded-xl border border-red-300 bg-white p-3">
   <p className="text-sm text-red-700">{t('Se quitan los períodos, las fases y las fechas clave del cronograma. Las tareas no se borran y siguen en Tareas.','This removes the periods, phases and key dates from the schedule. Tasks are not deleted and stay under Tasks.')}</p>
   <label className="flex min-h-11 items-center gap-2 text-sm font-semibold"><input type="checkbox" data-schedule-delete-confirm checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>{t('Entiendo y deseo eliminar el cronograma','I understand and want to delete the schedule')}</label>
   <div className="flex flex-wrap gap-2"><Button type="button" data-schedule-delete-apply disabled={busy||!confirmed} onClick={()=>void removeSchedule()}>{busy?t('Eliminando…','Deleting…'):t('Eliminar cronograma','Delete schedule')}</Button><Button type="button" variant="outline" disabled={busy} onClick={()=>setPanel('')}>{t('Cancelar','Cancel')}</Button></div></div>}
  {message&&<p role="status" className="text-sm text-[#0b6b3a]">{message}</p>}
  {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
 </div>;
}
