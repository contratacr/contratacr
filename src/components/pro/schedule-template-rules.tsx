'use client';
import {useRef,useState} from 'react';
import {Button} from '@/components/ui/button';
import {scheduleTemplateDetailSchema,scheduleTemplateResultSchema,type ScheduleTemplateSummary} from '@/lib/pro/schedule-templates';

/**
 * Row 79: link rules of a plan template. Each dependency of the template ("task B after task A") gets a kind
 * (finish -> start or start -> start) and a lag in days. They are stored with the template, survive template edits and are
 * copied to the job when the template is applied. One save = one idempotent mutation (same action id on retry).
 */
const api='/api/pro/schedule-templates';
const field='block min-h-11 w-full min-w-0 rounded-xl border border-[#d7e1ea] bg-white px-3 py-2 text-base font-normal';
type Row={taskId:string;predecessorId:string;task:string;predecessor:string;kind:'fs'|'ss';lag:string};

export function ScheduleTemplateRules({template,actor,en,disabled,onSaved}:{template:ScheduleTemplateSummary;actor:string;en:boolean;disabled:boolean;onSaved:()=>void}){
 const [open,setOpen]=useState(false),[rows,setRows]=useState<Row[]|null>(null),[revision,setRevision]=useState(template.revision),[busy,setBusy]=useState(false),[message,setMessage]=useState<{kind:'ok'|'error';text:string}|null>(null);
 const attempt=useRef<{actionId:string;body:string}|null>(null);
 const headers={'X-Pro-Expected-Actor':actor};
 async function openPanel(){
  if(open){setOpen(false);return;}
  setBusy(true);setMessage(null);
  try{
   const response=await fetch(api+'?'+new URLSearchParams({view:'detail',templateId:template.id}),{cache:'no-store',headers});
   if(!response.ok)throw Error();
   const detail=scheduleTemplateDetailSchema.parse((await response.json()).template);
   const titles=new Map(detail.tasks.map(task=>[task.id,task.title||(en?'Untitled task':'Tarea sin nombre')]));
   const saved=new Map((detail.rules??[]).map(rule=>[rule.taskId+':'+rule.predecessorId,rule]));
   setRows(detail.tasks.flatMap(task=>task.dependsOn.map(pred=>{const rule=saved.get(task.id+':'+pred);return{taskId:task.id,predecessorId:pred,task:titles.get(task.id)!,predecessor:titles.get(pred)??'',kind:rule?.kind??'fs',lag:String(rule?.lagDays??0)};})));
   setRevision(detail.revision);attempt.current=null;setOpen(true);
  }catch{setMessage({kind:'error',text:en?'Could not load the rules. Try again.':'No se pudieron cargar las reglas. Intente de nuevo.'});}
  finally{setBusy(false);}
 }
 function update(index:number,changes:Partial<Row>){attempt.current=null;setRows(old=>old?old.map((row,i)=>i===index?{...row,...changes}:row):old);}
 async function save(){
  if(!rows||busy)return;
  const rules=rows.map(row=>({taskId:row.taskId,predecessorId:row.predecessorId,kind:row.kind,lagDays:Number(row.lag)}));
  if(rules.some(rule=>!Number.isInteger(rule.lagDays)||rule.lagDays<-60||rule.lagDays>365)){setMessage({kind:'error',text:en?'The lag must be a whole number of days between -60 and 365.':'El desfase debe ser un número entero de días entre -60 y 365.'});return;}
  if(!attempt.current){const input={action:'rules',actionId:crypto.randomUUID(),templateId:template.id,revision,rules};attempt.current={actionId:input.actionId,body:JSON.stringify(input)};}
  setBusy(true);setMessage(null);
  try{
   const response=await fetch(api,{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:attempt.current.body});
   if(response.status===409){attempt.current=null;setMessage({kind:'error',text:en?'This template changed in another window. Close and open the rules again.':'La plantilla cambió en otra ventana. Cierre y vuelva a abrir las reglas.'});return;}
   if(!response.ok){attempt.current=response.status>=500?attempt.current:null;throw Error();}
   const result=scheduleTemplateResultSchema.parse(await response.json());
   if(result.action!=='rules')throw Error();
   setRevision(result.template.revision);attempt.current=null;setMessage({kind:'ok',text:en?'Rules saved.':'Reglas guardadas.'});onSaved();
  }catch{setMessage({kind:'error',text:en?'Could not confirm the save. Retry: it will not be applied twice.':'No se pudo confirmar el guardado. Reintente: no se aplicará dos veces.'});}
  finally{setBusy(false);}
 }
 if(template.archived||template.taskCount<2)return null;
 return <div data-schedule-template-rules={template.id} className="min-w-0 space-y-3">
  <Button type="button" variant="outline" disabled={disabled||busy} aria-expanded={open} onClick={()=>void openPanel()}>{en?'Task rules':'Reglas entre tareas'}</Button>
  {message&&<p role={message.kind==='error'?'alert':'status'} className={message.kind==='error'?'text-sm text-red-700':'text-sm text-[#175b42]'}>{message.text}</p>}
  {open&&rows&&(rows.length===0
   ?<p className="text-sm text-[#52627a]">{en?'This template has no tasks that wait for another. Add "After" links in the editor first.':'Esta plantilla no tiene tareas que dependan de otra. Primero agregue vínculos "Después de" en el editor.'}</p>
   :<div className="space-y-3">{rows.map((row,index)=><fieldset key={row.taskId+row.predecessorId} data-schedule-template-rule className="min-w-0 space-y-2 rounded-xl border border-[#d7e1ea] p-3">
     <legend className="px-1 text-sm font-semibold break-words">{row.task} <span className="font-normal text-[#52627a]">{en?'after':'después de'}</span> {row.predecessor}</legend>
     <label className="block text-sm font-semibold">{en?'Rule':'Regla'}<select aria-label={(en?'Rule: ':'Regla: ')+row.task} className={field} disabled={disabled||busy} value={row.kind} onChange={event=>update(index,{kind:event.target.value as 'fs'|'ss'})}>
      <option value="fs">{en?'Starts when the other finishes':'Empieza cuando termina la otra'}</option><option value="ss">{en?'Starts when the other starts':'Empieza cuando empieza la otra'}</option></select></label>
     <label className="block text-sm font-semibold">{en?'Lag (days)':'Desfase (días)'}<input aria-label={(en?'Lag in days: ':'Desfase en días: ')+row.task} type="number" step={1} min={-60} max={365} className={field} disabled={disabled||busy} value={row.lag} onChange={event=>update(index,{lag:event.target.value})}/></label>
    </fieldset>)}
    <Button type="button" disabled={disabled||busy} onClick={()=>void save()}>{en?'Save rules':'Guardar reglas'}</Button></div>)}
 </div>;
}
