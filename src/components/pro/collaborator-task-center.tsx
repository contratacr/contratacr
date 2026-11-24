'use client';
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {useLocale} from 'next-intl';
import {taskRowsCsv,taskRowsMatrix} from '@/lib/pro/task-center-detail';
import {teamSharedPageSchema,teamTasksPageSchema,type TeamSharedGrant,type TeamSharedTask} from '@/lib/pro/team';

/**
 * Row 15 (collaborator's global task center): one list of the tasks of EVERY job shared with this person, across
 * companies, with the filters of the owner's center (status, timing, search) plus "only mine". It adds no new access:
 * it only reads, grant by grant, the same pages the job board already reads (/api/pro/team view=shared and view=tasks),
 * so each read keeps its own server-side permission check, and opening a task goes to that job's board as before.
 * Bounded on purpose: up to 20 shared jobs and 3 pages of tasks per job; if there is more, it says so.
 */
type Row={grant:TeamSharedGrant;task:TeamSharedTask};
type TaskGrantLabel={id:string;label:string};
const MAX_GRANTS=20,MAX_TASK_PAGES=3;
const crToday=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Costa_Rica',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const control='min-h-11 min-w-0 rounded-xl border border-[#d7e1ea] bg-white px-3 text-base';
export function CollaboratorTaskCenter({accountId,disabled,onOpen,onDiscuss}:{accountId:string;disabled:boolean;onOpen:(grant:TeamSharedGrant)=>void;onDiscuss:(grant:TeamSharedGrant,task:TeamSharedTask)=>void}){
 const en=useLocale()==='en',t=(es:string,english:string)=>en?english:es;
 const [rows,setRows]=useState<Row[]|null>(null),[truncated,setTruncated]=useState(false),[failed,setFailed]=useState(false);
 const [status,setStatus]=useState<'open'|'done'|'all'>('open'),[timing,setTiming]=useState<'all'|'overdue'|'today'|'upcoming'>('all'),[mine,setMine]=useState(true),[query,setQuery]=useState(''),[job,setJob]=useState(''),[sort,setSort]=useState<'due'|'job'>('due'),[csvError,setCsvError]=useState(false);
 const sequence=useRef(0);
 const headers=useMemo(()=>({'X-Pro-Expected-Actor':accountId}),[accountId]);
 const read=useCallback(async(path:string)=>{const r=await fetch('/api/pro/team?'+path,{cache:'no-store',headers});if(!r.ok)throw Error(String(r.status));return r.json();},[headers]);
 const load=useCallback(async()=>{
  const id=++sequence.current;setFailed(false);
  try{
   const grants:TeamSharedGrant[]=[];let after:string|null=null,more=false;
   for(let page=0;page<2;page++){const body=teamSharedPageSchema.parse(await read('view=shared'+(after?'&after='+encodeURIComponent(after):'')));grants.push(...body.items);after=body.nextCursor;if(!after)break;}
   if(after)more=true;
   const used=grants.filter(g=>!g.cancelled).slice(0,MAX_GRANTS);if(grants.filter(g=>!g.cancelled).length>MAX_GRANTS)more=true;
   const all:Row[]=[];
   await Promise.all(used.map(async grant=>{let cursor:string|null=null;for(let page=0;page<MAX_TASK_PAGES;page++){
    const body=teamTasksPageSchema.parse(await read(new URLSearchParams({view:'tasks',grantId:grant.id}).toString()+(cursor?'&after='+encodeURIComponent(cursor):'')));
    for(const task of body.items)all.push({grant:body.grant,task});cursor=body.nextCursor;if(!cursor)break;}
    if(cursor)more=true;}));
   if(id!==sequence.current)return;setRows(all);setTruncated(more);
  }catch{if(id===sequence.current){setFailed(true);}}
 },[read]);
 // eslint-disable-next-line react-hooks/exhaustive-deps -- the counter only invalidates in-flight reads on unmount
 useEffect(()=>{const timer=setTimeout(()=>void load(),0);return()=>{sequence.current++;clearTimeout(timer);};},[load]);
 const today=crToday();
 const shown=useMemo(()=>{
  const needle=query.trim().toLowerCase();
  return (rows??[]).filter(({grant,task})=>(status==='all'||task.status===status)
   &&(!job||grant.id===job)&&(!mine||task.assignment?.grantId===grant.id)
   &&(timing==='all'||(timing==='overdue'?task.status==='open'&&!!task.dueDate&&task.dueDate<today:timing==='today'?task.dueDate===today:!!task.dueDate&&task.dueDate>today))
   &&(!needle||task.title.toLowerCase().includes(needle)||grant.service.toLowerCase().includes(needle)||grant.ownerName.toLowerCase().includes(needle)))
   .sort((a,b)=>(sort==='job'?(a.grant.service+a.grant.ownerName).localeCompare(b.grant.service+b.grant.ownerName):0)||(a.task.dueDate??'9999-12-31').localeCompare(b.task.dueDate??'9999-12-31')||a.task.title.localeCompare(b.task.title));
 },[rows,status,timing,mine,query,today,job,sort]);
 const jobs=useMemo(()=>{const seen=new Map<string,TaskGrantLabel>();for(const{grant}of rows??[])seen.set(grant.id,{id:grant.id,label:grant.service+' · '+grant.ownerName});return[...seen.values()].sort((a,b)=>a.label.localeCompare(b.label));},[rows]);
 async function exportXlsx(){
  try{const {xlsxFromRows,XLSX_MIME}=await import('@/lib/pro/xlsx-lite');const data=xlsxFromRows(taskRowsMatrix(shown.map(({grant,task})=>({title:task.title,job:grant.service,customer:grant.ownerName,dueDate:task.dueDate,status:task.status,assignee:task.assignment?.name??''})),en),en?'My tasks':'Mis tareas');const {saveFile}=await import('@/lib/file-download');await saveFile(new Blob([data as BlobPart],{type:XLSX_MIME}),(en?'contratacr-my-tasks-':'contratacr-mis-tareas-')+crToday()+'.xlsx');}catch{setCsvError(true);}
 }
 async function exportCsv(){
  setCsvError(false);
  try{const csv=taskRowsCsv(shown.map(({grant,task})=>({title:task.title,job:grant.service,customer:grant.ownerName,dueDate:task.dueDate,status:task.status,assignee:task.assignment?.name??''})),en);const {saveFile}=await import('@/lib/file-download');await saveFile(new Blob([csv],{type:'text/csv;charset=utf-8'}),(en?'contratacr-my-tasks-':'contratacr-mis-tareas-')+crToday()+'.csv');}catch{setCsvError(true);}
 }
 const overdue=(row:Row)=>row.task.status==='open'&&!!row.task.dueDate&&row.task.dueDate<today;
 if(rows&&!rows.length&&!failed)return null;
 return <section data-collaborator-task-center aria-labelledby="collab-tasks-title" className="space-y-3">
  <h2 id="collab-tasks-title" className="text-lg font-semibold">{t('Mis tareas de todos los trabajos','My tasks across all jobs')}</h2>
  {failed?<p role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm">{t('No se pudieron cargar las tareas. ','Could not load the tasks. ')}<button type="button" className="min-h-11 font-semibold underline" onClick={()=>void load()}>{t('Reintentar','Retry')}</button></p>
  :!rows?<p role="status" aria-busy="true">{t('Cargando tareas…','Loading tasks…')}</p>:<>
   <div className="grid min-w-0 gap-2 sm:grid-cols-2 lg:grid-cols-[10rem_10rem_minmax(0,1fr)_12rem_9rem_auto] lg:items-end">
    <label className="block text-sm font-semibold">{t('Estado','Status')}<select data-collab-status value={status} onChange={e=>setStatus(e.target.value as typeof status)} className={control+' block w-full'}><option value="open">{t('Abiertas','Open')}</option><option value="done">{t('Hechas','Done')}</option><option value="all">{t('Todas','All')}</option></select></label>
    <label className="block text-sm font-semibold">{t('Fecha','Date')}<select data-collab-timing value={timing} onChange={e=>setTiming(e.target.value as typeof timing)} className={control+' block w-full'}><option value="all">{t('Todas','All')}</option><option value="overdue">{t('Atrasadas','Overdue')}</option><option value="today">{t('Hoy','Today')}</option><option value="upcoming">{t('Próximas','Upcoming')}</option></select></label>
    <label className="block text-sm font-semibold sm:col-span-2 lg:col-span-1">{t('Buscar','Search')}<input data-collab-search type="search" maxLength={100} value={query} onChange={e=>setQuery(e.target.value)} className={control+' block w-full'}/></label>
    <label className="block text-sm font-semibold">{t('Trabajo','Job')}<select data-collab-job value={job} onChange={e=>setJob(e.target.value)} className={control+' block w-full'}><option value="">{t('Todos los trabajos','All jobs')}</option>{jobs.map(j=><option key={j.id} value={j.id}>{j.label}</option>)}</select></label>
    <label className="block text-sm font-semibold">{t('Ordenar por','Sort by')}<select data-collab-sort value={sort} onChange={e=>setSort(e.target.value as typeof sort)} className={control+' block w-full'}><option value="due">{t('Fecha límite','Due date')}</option><option value="job">{t('Trabajo','Job')}</option></select></label>
    <label className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold"><input data-collab-mine type="checkbox" checked={mine} onChange={e=>setMine(e.target.checked)} className="h-5 w-5"/>{t('Solo las mías','Only mine')}</label>
   </div>
   <div className="flex flex-wrap items-center gap-3"><button type="button" data-collab-csv disabled={!shown.length} onClick={()=>void exportCsv()} className="min-h-11 rounded-full border border-[#d7e1ea] px-4 text-sm font-semibold hover:bg-[#f6f9fb] disabled:opacity-50">{t('Exportar CSV','Export CSV')}</button><button type="button" data-collab-xlsx disabled={!shown.length} onClick={()=>void exportXlsx()} className="min-h-11 rounded-full border border-[#d7e1ea] px-4 text-sm font-semibold hover:bg-[#f6f9fb] disabled:opacity-50">{t('Exportar Excel','Export Excel')}</button>{csvError&&<p role="alert" className="text-sm text-red-700">{t('No se pudo preparar el CSV.','Could not prepare the CSV.')}</p>}</div>
   <p role="status" className="text-sm text-[#52627a]">{shown.length===1?t('1 tarea','1 task'):`${shown.length} ${t('tareas','tasks')}`}{truncated?' · '+t('Se muestran las primeras de cada trabajo; abra el trabajo para ver todas.','The first ones of each job are shown; open the job to see them all.'):''}</p>
   {shown.length===0?<p className="rounded-2xl border border-dashed border-[#c9d6e2] bg-[#f7f9fc] p-4 text-sm text-[#52627a]">{mine?t('No tiene tareas asignadas con estos filtros. Quite "Solo las mías" para ver todas las de sus trabajos.','You have no assigned tasks with these filters. Clear "Only mine" to see every task of your jobs.'):t('No hay tareas con estos filtros.','No tasks match these filters.')}</p>
   :<ul className="space-y-2">{shown.map(row=><li key={row.grant.id+':'+row.task.id} data-collab-task={row.task.id} className="flex min-w-0 flex-col gap-2 rounded-2xl border border-[#d7e1ea] bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
    <div className="min-w-0"><p className="break-words font-semibold">{row.task.title}</p>
     <p className="break-words text-sm text-[#52627a]">{row.grant.service} · {row.grant.ownerName}</p>
     <p className="text-sm"><span className={overdue(row)?'font-semibold text-[#9b1c1c]':'text-[#52627a]'}>{row.task.dueDate?(overdue(row)?t('Atrasada · ','Overdue · '):t('Vence ','Due '))+row.task.dueDate:t('Sin fecha','No date')}</span> · {row.task.status==='done'?t('Hecha','Done'):t('Abierta','Open')}{row.task.assignment&&row.task.assignment.grantId===row.grant.id?' · '+t('Asignada a usted','Assigned to you'):row.task.assignment?' · '+row.task.assignment.name:''}</p></div>
    <div className="flex shrink-0 flex-wrap gap-2">
     <button type="button" data-collab-discuss disabled={disabled} onClick={()=>onDiscuss(row.grant,row.task)} className="min-h-11 rounded-full bg-[#009FD9] px-4 text-sm font-semibold text-white hover:bg-[#0089bb] disabled:opacity-50">{t('Comentarios','Comments')}</button>
     <button type="button" disabled={disabled} onClick={()=>onOpen(row.grant)} className="min-h-11 rounded-full border border-[#d7e1ea] px-4 text-sm font-semibold hover:bg-[#f6f9fb] disabled:opacity-50">{t('Abrir trabajo','Open job')}</button>
    </div>
   </li>)}</ul>}
  </>}
 </section>;
}
