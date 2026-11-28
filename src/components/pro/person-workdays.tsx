'use client';
import {useCallback,useEffect,useState} from 'react';
import {useLocale} from 'next-intl';
import {Button} from '@/components/ui/button';
import {personWorkdaysSchema,type PersonWorkdays} from '@/lib/pro/work-calendar';

/** Row 13: working weekdays per person, inside the work calendar. Holidays stay company-wide; the owner edits, the team reads. */
function civil(v:string,en:boolean){return new Intl.DateTimeFormat(en?'en-US':'es-CR',{dateStyle:'medium',timeZone:'UTC'}).format(new Date(v+'T12:00:00Z'));}
const DAYS:[number,string,string][]=[[1,'Lun','Mon'],[2,'Mar','Tue'],[3,'Mié','Wed'],[4,'Jue','Thu'],[5,'Vie','Fri'],[6,'Sáb','Sat'],[0,'Dom','Sun']];
export function PersonWorkdaysPanel({accountId,canEdit}:{accountId:string;canEdit:boolean}){
 const en=useLocale()==='en',t=(es:string,english:string)=>en?english:es;
 const [data,setData]=useState<PersonWorkdays|null>(null),[drafts,setDrafts]=useState<Record<string,number[]>>({}),[busy,setBusy]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState(''),[dayDrafts,setDayDrafts]=useState<Record<string,string>>({});
 const load=useCallback(async()=>{
  try{const r=await fetch('/api/pro/person-workdays',{cache:'no-store',headers:{'X-Pro-Expected-Actor':accountId}});if(!r.ok)throw Error();setData(personWorkdaysSchema.parse(await r.json()));setDrafts({});}
  catch{setError(t('No se pudieron cargar las jornadas.','Could not load the workdays.'));}
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[accountId]);
 useEffect(()=>{const timer=setTimeout(()=>void load(),0);return()=>clearTimeout(timer);},[load]);
 async function send(body:object,id:string,done:string){
  if(busy)return;setBusy(id);setError('');setNotice('');
  try{const r=await fetch('/api/pro/person-workdays',{method:'POST',headers:{'Content-Type':'application/json','X-Pro-Expected-Actor':accountId},body:JSON.stringify(body)});
   if(r.status===409){setError(t('Las jornadas cambiaron en otra pestaña. Se recargaron.','The workdays changed in another tab. They were reloaded.'));await load();return;}
   if(!r.ok)throw Error();setNotice(done);await load();}
  catch{setError(t('No se pudo guardar. Reintente.','Could not save. Try again.'));}finally{setBusy('');}
 }
 if(!data)return error?<p role="alert" className="text-sm text-red-700">{error}</p>:null;
 if(!data.people.length)return <p className="text-sm text-[#52627a]">{t('Aún no hay personas del equipo para configurar.','There are no team members to set up yet.')}</p>;
 return <div data-person-workdays className="min-w-0 space-y-3">
  <h4 className="font-semibold">{t('Jornada por persona','Workdays per person')}</h4>
  <p className="text-xs text-[#68778d]">{t('Si una persona tiene jornada propia, el cronograma ajustado al calendario laboral usa sus días en las tareas que tiene asignadas. Los feriados siguen siendo de toda la empresa.','If a person has their own workdays, the schedule adjusted to the work calendar uses their days on the tasks assigned to them. Holidays stay company-wide.')}</p>
  <ul className="space-y-2">{data.people.map(p=>{const draft=drafts[p.personId]??p.workDays,custom=p.workDays!==null,dirty=drafts[p.personId]!==undefined&&JSON.stringify(drafts[p.personId])!==JSON.stringify(p.workDays);
   return <li key={p.personId} data-person-workdays-row={p.personId} className="min-w-0 space-y-2 rounded-xl border border-[#d7e1ea] bg-white p-3">
    <p className="break-words font-semibold">{p.name} <span className="text-xs font-normal text-[#52627a]">{custom?t('Jornada propia','Own workdays'):t('Sigue el calendario de la empresa','Follows the company calendar')}</span></p>
    <div className="flex flex-wrap gap-2" role="group" aria-label={t('Días laborables de ','Working days of ')+p.name}>{DAYS.map(([d,es,e])=>{const on=(draft??[]).includes(d);
     return <label key={d} className="flex min-h-11 items-center gap-2 rounded-xl border border-[#d7e1ea] px-3 text-sm"><input type="checkbox" className="h-5 w-5" data-person-workday={d} checked={on} disabled={!canEdit||!!busy} onChange={()=>{const base=draft??[1,2,3,4,5];const next=on?base.filter(x=>x!==d):[...base,d].sort((a,b)=>a-b);if(!next.length){setError(t('Elija al menos un día laborable.','Choose at least one working day.'));return;}setError('');setDrafts(old=>({...old,[p.personId]:next}));}}/>{en?e:es}</label>;})}</div>
    {canEdit&&<div className="flex flex-wrap gap-2"><Button type="button" data-person-workdays-save disabled={!!busy||!dirty} onClick={()=>void send({action:'set',personId:p.personId,revision:p.revision,workDays:drafts[p.personId]},p.personId,t('Jornada guardada.','Workdays saved.'))}>{t('Guardar jornada','Save workdays')}</Button>
     {custom&&<Button type="button" variant="secondary" data-person-workdays-clear disabled={!!busy} onClick={()=>void send({action:'clear',personId:p.personId,revision:p.revision},p.personId,t('Ahora sigue el calendario de la empresa.','Now follows the company calendar.'))}>{t('Usar el calendario de la empresa','Use the company calendar')}</Button>}</div>}
    <div data-person-days-off className="min-w-0 space-y-2 border-t border-[#d7e1ea] pt-2">
     <p className="text-sm font-semibold">{t('Días libres','Days off')}</p>
     {p.daysOff.length?<ul className="flex flex-wrap gap-2">{p.daysOff.map(d=><li key={d} data-person-day-off={d} className="flex min-h-11 flex-wrap items-center gap-2 rounded-xl border border-[#d7e1ea] px-3 text-sm"><span className="break-words">{civil(d,en)}</span>{canEdit&&<Button type="button" variant="outline" size="sm" disabled={!!busy} aria-label={t('Quitar el día libre ','Remove the day off ')+civil(d,en)} onClick={()=>void send({action:'days_off',personId:p.personId,revision:p.daysOffRevision,daysOff:p.daysOff.filter(x=>x!==d)},p.personId,t('Día libre quitado.','Day off removed.'))}>{t('Quitar','Remove')}</Button>}</li>)}</ul>
      :<p className="text-sm text-[#52627a]">{t('No tiene días libres registrados.','No days off recorded.')}</p>}
     {canEdit&&<div className="flex flex-wrap items-end gap-2"><label className="block min-w-0 text-sm font-semibold">{t('Fecha del día libre','Date of the day off')}<input type="date" min="2000-01-01" max="2100-12-31" data-person-day-off-input className="block min-h-11 w-full min-w-0 max-w-full appearance-none rounded-xl border border-[#d7e1ea] bg-white px-3 py-2 text-base font-normal" disabled={!!busy} value={dayDrafts[p.personId]??''} onChange={e=>setDayDrafts(old=>({...old,[p.personId]:e.target.value}))}/></label>
      <Button type="button" variant="secondary" data-person-day-off-add disabled={!!busy||!dayDrafts[p.personId]||p.daysOff.includes(dayDrafts[p.personId])||p.daysOff.length>=60} onClick={()=>{const d=dayDrafts[p.personId];void send({action:'days_off',personId:p.personId,revision:p.daysOffRevision,daysOff:[...p.daysOff,d].sort()},p.personId,t('Día libre agregado.','Day off added.')).then(()=>setDayDrafts(old=>({...old,[p.personId]:''})));}}>{t('Agregar día libre','Add day off')}</Button></div>}
     <p className="text-xs text-[#68778d]">{t('Un día libre nunca cuenta como laborable para las tareas asignadas a esta persona.','A day off never counts as a working day for the tasks assigned to this person.')}</p>
    </div>
   </li>;})}</ul>
  {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}{notice&&<p role="status" className="text-sm text-[#0b6b3a]">{notice}</p>}
 </div>;
}
