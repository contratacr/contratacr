'use client';
import {useState} from 'react';
import {useLocale} from 'next-intl';
import {Button} from '@/components/ui/button';
import {workScheduleMutationSchema,workScheduleResultSchema} from '@/lib/pro/work-schedule';
import type {Gantt} from '@/lib/pro/project-schedule';
import {addDays,daysBetween,scheduleCsv} from '@/lib/pro/schedule-views';

/**
 * Area C (Houzz "Actions" menu): export the schedule as CSV and move the whole project start date.
 * Moving uses the existing item writers one by one (same dates, new offset, dependencies unchanged, revision per write).
 */
export function ScheduleActions({data,workId,accountId,disabled,onChanged,canEdit}:{data:Gantt;workId:string;accountId:string;disabled:boolean;onChanged:()=>void;canEdit:boolean}){
 const en=useLocale()==='en',t=(es:string,english:string)=>en?english:es;
 const [open,setOpen]=useState(false),[start,setStart]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
 const first=data.plannedStart,moving=data.tasks.filter(task=>task.plannedStart&&task.plannedEnd&&task.status==='open'),delta=first&&start?daysBetween(first,start):0;
 function download(){
  const blob=new Blob([scheduleCsv(data,en)],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=(en?'schedule':'cronograma')+'.csv';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
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
   {canEdit&&<Button type="button" variant="secondary" className="min-h-11" data-schedule-move-open data-pro-write="work.write" disabled={disabled||busy||!first||!moving.length} onClick={()=>{setOpen(!open);setStart(first??'');setError('');setMessage('');}}>{t('Mover fecha de inicio','Move start date')}</Button>}
  </div>
  {open&&first&&<div data-schedule-move-panel className="space-y-2 rounded-xl border border-[#d7e1ea] bg-white p-3">
   <p className="text-sm text-[#52627a]">{t('Mueve todos los elementos abiertos y las fechas clave el mismo número de días; las dependencias no cambian.','Moves every open item and key date by the same number of days; dependencies do not change.')}</p>
   <label className="block text-sm font-semibold">{t('Nueva fecha de inicio','New start date')}<input type="date" data-schedule-move-date value={start} min="1900-01-01" max="2100-12-31" onChange={e=>setStart(e.target.value)} className={field}/></label>
   {delta!==0&&<p data-schedule-move-preview className="text-sm">{t(`${moving.length} elementos se moverán ${Math.abs(delta)} días ${delta>0?'hacia adelante':'hacia atrás'}.`,`${moving.length} items will move ${Math.abs(delta)} days ${delta>0?'later':'earlier'}.`)}</p>}
   <div className="flex flex-wrap gap-2"><Button type="button" data-schedule-move-apply disabled={busy||!start||!delta} onClick={()=>void move()}>{busy?t('Moviendo…','Moving…'):t('Mover','Move')}</Button><Button type="button" variant="outline" disabled={busy} onClick={()=>setOpen(false)}>{t('Cancelar','Cancel')}</Button></div></div>}
  {message&&<p role="status" className="text-sm text-[#0b6b3a]">{message}</p>}
  {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
 </div>;
}
