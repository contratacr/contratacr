'use client';
import {useEffect,useMemo,useState} from 'react';
import {useLocale} from 'next-intl';
import {useAuth} from '@/hooks/use-auth';
import {Button} from '@/components/ui/button';
import {pushProParams} from '@/lib/pro/navigation';
import {ganttSchema,type Gantt} from '@/lib/pro/project-schedule';
import {inRange,upcomingBounds,upcomingItems,type UpcomingRange,type UpcomingType} from '@/lib/pro/schedule-views';

/**
 * Overview widget "Upcoming": open task due dates and schedule starts or key dates, split into
 * Today / This week / Next week, with a type filter. Read only; it reuses the schedule reader.
 */
export function WorkUpcoming({workId,blocked=false}:{workId:string;blocked?:boolean}){
 const {user,loading}=useAuth();if(loading||!user)return null;
 return <UpcomingSession key={user.id+':'+workId} accountId={user.id} workId={workId} blocked={blocked}/>;
}
function UpcomingSession({accountId,workId,blocked}:{accountId:string;workId:string;blocked:boolean}){
 const en=useLocale()==='en',t=(es:string,english:string)=>en?english:es;
 const [data,setData]=useState<Gantt|null>(null),[failed,setFailed]=useState(false),[attempt,setAttempt]=useState(0),[range,setRange]=useState<UpcomingRange>('today'),[type,setType]=useState<UpcomingType>('all');
 useEffect(()=>{let alive=true;fetch('/api/pro/project-schedule?'+new URLSearchParams({workId}),{cache:'no-store',headers:{'X-Pro-Expected-Actor':accountId}}).then(r=>{if(!r.ok)throw Error();return r.json();}).then(body=>{const parsed=ganttSchema.parse(body);if(alive&&parsed.workId===workId){setData(parsed);setFailed(false);}}).catch(()=>{if(alive)setFailed(true);});return()=>{alive=false;};},[accountId,workId,attempt]);
 const all=useMemo(()=>data?upcomingItems(data.today,data.tasks,data.milestones):[],[data]);
 const bounds=useMemo(()=>data?upcomingBounds(data.today):null,[data]);
 if(failed&&!data)return <section data-work-upcoming className="space-y-2 rounded-2xl border border-[#d7e1ea] bg-white p-4"><p role="alert" className="text-sm">{t('No se pudieron cargar los próximos eventos.','Could not load upcoming items.')}</p><Button type="button" variant="secondary" className="min-h-11" onClick={()=>{setFailed(false);setAttempt(v=>v+1);}}>{t('Reintentar','Retry')}</Button></section>;
 if(!data||!bounds)return <p role="status" className="text-sm text-[#68778d]">{t('Cargando próximos eventos…','Loading upcoming items…')}</p>;
 const ranges:Array<[UpcomingRange,string]>=[['today',t('Hoy','Today')],['week',t('Esta semana','This week')],['next',t('Próxima semana','Next week')]];
 const rows=inRange(all,bounds[range],type);
 const day=(value:string)=>new Intl.DateTimeFormat(en?'en-US':'es-CR',{weekday:'short',day:'numeric',month:'short',timeZone:'UTC'}).format(new Date(value+'T12:00:00Z'));
 const reason={due:t('Vence','Due'),start:t('Inicia','Starts'),key_date:t('Fecha clave','Key date')};
 return <section data-work-upcoming aria-label={t('Próximos eventos','Upcoming')} className="min-w-0 space-y-3 rounded-2xl border border-[#d7e1ea] bg-white p-4">
  <div className="flex flex-wrap items-center justify-between gap-2">
   <h3 className="text-sm font-bold uppercase tracking-wide text-[#68778d]">{t('Próximos eventos','Upcoming')} ({all.length})</h3>
   <label className="flex items-center gap-2 text-sm font-semibold">{t('Filtrar por','Filter by')}<select data-upcoming-type value={type} onChange={e=>setType(e.target.value as UpcomingType)} className="min-h-11 rounded-xl border border-[#d7e1ea] bg-white px-2 text-base font-normal"><option value="all">{t('Todos','All')}</option><option value="task">{t('Tareas','Tasks')}</option><option value="schedule">{t('Cronograma','Schedule')}</option></select></label>
  </div>
  <div role="group" aria-label={t('Período','Period')} className="grid grid-cols-3 gap-1 rounded-2xl bg-[#e9eff5] p-1">{ranges.map(([key,label])=>{const n=inRange(all,bounds[key],type).length;return <button key={key} type="button" data-upcoming-range={key} aria-pressed={range===key} onClick={()=>setRange(key)} className={`min-h-11 min-w-0 rounded-xl px-2 text-sm font-semibold ${range===key?'bg-white text-[#008bb5] shadow-sm':'text-[#52627a]'}`}>{label} ({n})</button>;})}</div>
  {rows.length?<ul className="divide-y divide-[#eef2f6]">{rows.map(item=><li key={item.key} data-upcoming-item={item.type} className="flex min-w-0 flex-wrap items-center justify-between gap-2 py-2 text-sm"><span className="min-w-0 flex-1 break-words"><span className="mr-2 rounded-full bg-[#eef3f8] px-2 py-0.5 text-xs font-bold uppercase text-[#3d5068]">{item.type==='task'?t('Tarea','Task'):t('Cronograma','Schedule')}</span>{item.title}</span><span className="shrink-0 text-xs text-[#52627a]">{reason[item.reason]} · {day(item.date)}</span></li>)}</ul>:<p data-upcoming-empty className="text-sm text-[#68778d]">{t('Nada para este período.','Nothing for this period.')}</p>}
  {!blocked&&<Button type="button" variant="outline" className="min-h-11" onClick={()=>pushProParams({vistaTrabajo:'schedule'})}>{t('Abrir cronograma','Open schedule')}</Button>}
 </section>;
}
