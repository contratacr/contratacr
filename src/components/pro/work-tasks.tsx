'use client';

import {useCallback,useEffect,useLayoutEffect,useRef,useState,type FormEvent} from 'react';
import {useLocale} from 'next-intl';
import {z} from 'zod';
import {useAuth} from '@/hooks/use-auth';
import {useAppDialog} from '@/hooks/use-app-dialog';
import {Button} from '@/components/ui/button';
import {pushProParams,currentCanonicalProPath,PRO_BEFORE_PATH_CHANGE} from '@/lib/pro/navigation';
import {crTodayISO} from '@/lib/time-cr';
import {workTaskSchema,workTaskMutationSchema,workTasksPageSchema,type WorkTask,type WorkTaskMutation,type WorkTasksPage} from '@/lib/pro/work-tasks';
import {createWorkTaskWrite,readWorkTaskWrite,mergeWorkTaskWrite,saveWorkTaskWrite,clearWorkTaskWrite,continueWorkTaskWrite,type WorkTaskWrite} from '@/lib/pro/work-task-recovery';
import {WorkPlan} from './work-plan';
import {WorkPunchlist} from './work-punchlist';
import {useProSearchParams} from './use-pro-search-params';
import {useProChildGuard,useProServiceRefresh} from './use-pro-child-guard';

const api='/api/pro/work-tasks';
const field='mt-1 block min-h-11 w-full min-w-0 rounded-xl border border-[#d7e1ea] bg-white px-3 py-2 text-base font-normal';
type StateCallback={onStateChange?:(state:{dirty:boolean;busy:boolean})=>void};
// Round 4B: `assignee` is the legacy free text (kept readable, never silently dropped); the real
// responsible person is a Team member of this job (`assigneeGrantId`, written through the Team writer).
type Values={title:string;dueDate:string;assignee:string;details:string;assigneeGrantId:string};
type Editor={task:WorkTask|null;values:Values;baseGrant:string};
const values=(task:WorkTask|null,grant=''):Values=>({title:task?.title??'',dueDate:task?.dueDate??'',assignee:task?.assignee??'',details:task?.details??'',assigneeGrantId:grant});
const editorSchema=z.object({task:workTaskSchema.nullable(),values:z.object({title:z.string().max(160),dueDate:z.string().max(10),assignee:z.string().max(160),details:z.string().max(2000),assigneeGrantId:z.union([z.literal(''),z.string().uuid()]).default('')}).strict(),baseGrant:z.union([z.literal(''),z.string().uuid()]).default('')}).strict();
const assignmentSchema=z.object({grantId:z.string().uuid(),name:z.string().max(160),active:z.boolean()}).strict();
const assigneesSchema=z.object({workId:z.string(),members:z.array(z.object({grantId:z.string().uuid(),name:z.string().max(160),role:z.enum(['viewer','contributor']),active:z.boolean(),canAssign:z.boolean()}).strict()).max(50),others:z.array(z.object({name:z.string().max(160)}).strict()).max(20),assignments:z.record(z.string().uuid(),assignmentSchema)}).strict();
type Assignees=z.infer<typeof assigneesSchema>;
type AssignRetry={taskId:string;title:string;grantId:string|null;revision:number;actionId:string};
function useAssignees(accountId:string,workId:string,taskIds:string[]){
 const key=accountId+':'+workId+':'+taskIds.join(','),[state,setState]=useState<{key:string;data:Assignees|null;error:boolean}>({key:'',data:null,error:false}),sequence=useRef(0);
 const load=useCallback(async()=>{const n=++sequence.current;try{const response=await fetch(api+'?'+new URLSearchParams({view:'assignees',workId,tasks:taskIds.join(',')}),{cache:'no-store',headers:{'X-Pro-Expected-Actor':accountId}});if(!response.ok)throw Error();const data=assigneesSchema.parse(await response.json());if(data.workId!==workId)throw Error();if(n===sequence.current)setState({key,data,error:false});}catch{if(n===sequence.current)setState(old=>({key,data:old.key===key?old.data:null,error:true}));}},[accountId,workId,taskIds,key]);
 const invalidate=useCallback(()=>{sequence.current++;},[]);
 useEffect(()=>{const timer=setTimeout(()=>void load(),0);return()=>{clearTimeout(timer);invalidate();};},[load,invalidate]);
 return{data:state.key===key?state.data:null,error:state.key===key&&state.error,load};
}
const detailSchema=z.object({task:workTaskSchema,history:z.array(z.object({actionId:z.string().uuid(),at:z.string(),action:z.enum(['create','update','complete','reopen','archive','restore']),before:workTaskSchema.nullable(),after:workTaskSchema})).max(20)});

export function WorkTasks({workId,onStateChange,initialStatus='open'}:{workId:string;initialStatus?:'open'|'done'}&StateCallback){const {user,loading}=useAuth();if(loading||!user)return null;return <TaskViews key={user.id+':'+workId} initialStatus={initialStatus} workId={workId} accountId={user.id} onStateChange={onStateChange}/>;}
function TaskViews({workId,accountId,initialStatus,onStateChange}:{workId:string;accountId:string;initialStatus:'open'|'done'}&StateCallback){const en=useLocale()==='en',params=useProSearchParams(),requested=params.get('vistaTareas'),mode:'list'|'plan'|'punch'=requested==='plan'?'plan':requested==='punch'?'punch':'list',plan=mode==='plan',[listState,setListState]=useState({dirty:false,busy:true}),[planState,setPlanState]=useState({dirty:false,busy:true}),[punchState,setPunchState]=useState({dirty:false,busy:true}),active=plan?planState:mode==='punch'?punchState:listState,blocked=active.dirty||active.busy,[notice,setNotice]=useState('');useLayoutEffect(()=>{onStateChange?.(active);return()=>onStateChange?.({dirty:false,busy:false});},[active,onStateChange]);useProChildGuard(blocked,useCallback(()=>setNotice(en?'Save or cancel your changes before switching views.':'Guarde o cancele los cambios antes de cambiar de vista.'),[en]));function view(next:boolean|'list'|'plan'|'punch'){const target=next===true?'plan':next===false?'list':next;if(blocked||target===mode)return;setNotice('');pushProParams({vistaTareas:target==='list'?null:target});}
 // Family 15: the punch list is a third view of the same job tasks (Houzz: Tasks / Punchlist tabs).
 const labels={list:en?'List':'Lista',plan:en?'Job plan':'Plan del trabajo',punch:en?'Punch list':'Pendientes finales'};
 return <div data-work-task-views className="min-w-0 space-y-4"><div role="group" aria-label={en?'Task view':'Vista de tareas'} className="grid grid-cols-3 gap-1 rounded-2xl bg-[#e9eff5] p-1.5">{(['list','plan','punch'] as const).map(value=><button type="button" key={value} data-work-task-view={value} aria-pressed={value===mode} disabled={blocked} onClick={()=>view(value)} className={'min-h-11 rounded-xl px-2 text-sm font-semibold leading-tight '+(value===mode?'bg-white text-[#008bb5] shadow-sm':'text-[#52627a]')}>{labels[value]}</button>)}</div>{notice&&<p role="alert" className="text-sm">{notice}</p>}{plan?<WorkPlan workId={workId} onStateChange={setPlanState} onList={()=>view(false)} onKeepDraft={()=>{if(blocked)return false;pushProParams({vistaTareas:null});return new URLSearchParams(window.location.search).get('vistaTareas')!=='plan';}}/>:mode==='punch'?<WorkPunchlist workId={workId} onStateChange={setPunchState}/>:<TasksSession workId={workId} accountId={accountId} initialStatus={initialStatus} onStateChange={setListState}/>}</div>;}
export function WorkTasksSummary({workId,blocked=false}:{workId:string;blocked?:boolean}){const {user,loading}=useAuth();if(loading||!user)return null;return <TasksSummarySession key={user.id+':'+workId} workId={workId} accountId={user.id} blocked={blocked}/>;}

function useTasksPage(accountId:string,workId:string,status:'open'|'done'|'all',archived=false){
 const scope=[accountId,workId,status,archived?'archived':'active'].join(':');
 const [result,setResult]=useState<{scope:string;page:WorkTasksPage|null;loading:boolean;error:boolean}|null>(null),sequence=useRef(0),active=useRef(true);
 const load=useCallback(async(after?:string)=>{const current=++sequence.current;setResult(old=>({scope,page:old?.scope===scope?old.page:null,loading:true,error:false}));try{const response=await fetch(api+'?'+new URLSearchParams({workId,status,...archived?{archived:'1'}:{},...after?{after}:{}}),{cache:'no-store',headers:{'X-Pro-Expected-Actor':accountId}});if(!response.ok)throw Error();const body=workTasksPageSchema.parse(await response.json());if(body.workId!==workId||body.items.some(item=>item.workId!==workId||item.archived!==archived||status!=='all'&&item.status!==status))throw Error();if(active.current&&current===sequence.current)setResult(old=>({scope,page:after&&old?.scope===scope&&old.page?{...body,items:[...old.page.items,...body.items.filter(item=>!old.page!.items.some(prior=>prior.id===item.id))]}:body,loading:false,error:false}));return true;}catch{if(active.current&&current===sequence.current)setResult(old=>({scope,page:after&&old?.scope===scope?old.page:null,loading:false,error:true}));return false;}},[accountId,workId,status,archived,scope]);
 const invalidate=useCallback(()=>{sequence.current++;},[]);
 useEffect(()=>{active.current=true;const timer=setTimeout(()=>void load(),0);return()=>{active.current=false;invalidate();clearTimeout(timer);};},[load,invalidate]);
 const current=result?.scope===scope?result:null;
 return{page:current?.page??null,loading:current?.loading??true,error:current?.error??false,load};
}
function TasksSummarySession({accountId,workId,blocked}:{accountId:string;workId:string;blocked:boolean}){
 const en=useLocale()==='en',remote=useTasksPage(accountId,workId,'open');
 return <section data-work-tasks-summary className="space-y-3 rounded-xl border border-[#d7e1ea] bg-white p-4"><h3 className="font-semibold">{en?'Job tasks':'Tareas del trabajo'}</h3>{remote.error?<><p role="alert" className="text-sm">{en?'Could not load tasks.':'No se pudieron cargar las tareas.'}</p><Button type="button" variant="secondary" disabled={blocked||remote.loading} onClick={()=>void remote.load()}>{en?'Retry':'Reintentar'}</Button></>:remote.loading&&!remote.page?<p role="status" className="text-sm">{en?'Loading tasks…':'Cargando tareas…'}</p>:remote.page&&<><p className="text-sm text-[#52627a]">{remote.page.counts.open} {en?'open':remote.page.counts.open===1?'pendiente':'pendientes'} · {remote.page.counts.done} {en?'completed':remote.page.counts.done===1?'completada':'completadas'}</p>{!!remote.page.items.length&&<ul className="space-y-2 text-sm">{remote.page.items.slice(0,3).map(task=><li key={task.id} className="break-words">{task.title}{task.dueDate&&<span className="ml-2 text-[#52627a]">{formatDate(task.dueDate,en)}</span>}</li>)}</ul>}<Button type="button" variant="secondary" disabled={blocked} onClick={()=>pushProParams({vistaTrabajo:'tasks'})}>{en?'View tasks':'Ver tareas'}</Button></>}</section>;
}
function formatDate(value:string,en:boolean){return new Intl.DateTimeFormat(en?'en-US':'es-CR',{dateStyle:'medium',timeZone:'UTC'}).format(new Date(value+'T12:00:00Z'));}

function TasksSession({workId,accountId,onStateChange,initialStatus}:{workId:string;accountId:string;initialStatus:'open'|'done'}&StateCallback){
 const en=useLocale()==='en',t=(es:string,english:string)=>en?english:es;
 const [status,setStatus]=useState<'open'|'done'>(initialStatus),[archived,setArchived]=useState(false),remote=useTasksPage(accountId,workId,archived?'all':status,archived),[taskIds,setTaskIds]=useState<string[]>([]),assignees=useAssignees(accountId,workId,taskIds),[assignRetry,setAssignRetry]=useState<AssignRetry|null>(null);
 const pageIds=(remote.page?.items??[]).filter(task=>!task.archived).slice(0,20).map(task=>task.id).join(',');
 if(pageIds!==taskIds.join(','))setTaskIds(pageIds?pageIds.split(','):[]);
 const [editor,setEditor]=useState<Editor|null>(null),[pending,setPending]=useState<WorkTaskWrite|null>(null),[ready,setReady]=useState(false),[saving,setSaving]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[storageIssue,setStorageIssue]=useState(false),[conflict,setConflict]=useState(false);
 const [history,setHistory]=useState<z.infer<typeof detailSchema>|null>(null),[historyLoading,setHistoryLoading]=useState(false),[historyError,setHistoryError]=useState(false);
 const current=useRef({active:true,accountId,workId}),lock=useRef(false),attempt=useRef<WorkTaskWrite|null>(null),historySequence=useRef(0);
 const draftKey='ccr:pro:work-task-draft:v1:'+accountId+':'+encodeURIComponent(workId),{confirm,dialogNode}=useAppDialog();
 const dirty=!!editor&&JSON.stringify(editor.values)!==JSON.stringify(values(editor.task,editor.baseGrant));
 const busy=saving||!!pending||storageIssue||!ready,guarded=dirty||busy;
 const leaveNotice=useCallback(()=>setError(en?'Save or cancel your task before leaving.':'Guarde o cancele la tarea antes de salir.'),[en]);
 useProChildGuard(!onStateChange&&guarded,leaveNotice);
 // Cross-page links can fire before the embedded editor's passive state report
 // reaches its parent. Install this guard in the same commit as the edited field.
 useLayoutEffect(()=>{
  if(!guarded)return;
  const before=(event:Event)=>{const path=(event as CustomEvent<{path:string}>).detail?.path;if(path&&new URL(path,window.location.origin).pathname!==new URL(currentCanonicalProPath(),window.location.origin).pathname){event.preventDefault();leaveNotice();}};
  window.addEventListener(PRO_BEFORE_PATH_CHANGE,before);
  return()=>window.removeEventListener(PRO_BEFORE_PATH_CHANGE,before);
 },[guarded,leaveNotice]);
 useLayoutEffect(()=>{onStateChange?.({dirty,busy});return()=>onStateChange?.({dirty:false,busy:false});},[dirty,busy,onStateChange]);
 const invalidateHistory=useCallback(()=>{historySequence.current++;},[]);
 useEffect(()=>{current.current={active:true,accountId,workId};return()=>{current.current.active=false;invalidateHistory();};},[accountId,workId,invalidateHistory]);
 const restore=useCallback(()=>{
  try{
   const tab=readWorkTaskWrite(sessionStorage,accountId,workId),global=readWorkTaskWrite(localStorage,accountId,workId);let record=tab?mergeWorkTaskWrite(tab,global):global;
   if(attempt.current)record=mergeWorkTaskWrite(attempt.current,record);
   attempt.current=record;setPending(record);
   const raw=sessionStorage.getItem(draftKey);
   if(raw){if(raw.length>20000)throw Error();const stored=editorSchema.parse(JSON.parse(raw));if(stored.task&&stored.task.workId!==workId)throw Error();setEditor(stored);}
   else if(record){const input=workTaskMutationSchema.parse(JSON.parse(record.body));if(input.action==='create'||input.action==='update')setEditor({task:record.baseline,values:{title:input.title,dueDate:input.dueDate??'',assignee:input.assignee,details:input.details,assigneeGrantId:''},baseGrant:''});}
   setStorageIssue(false);setReady(true);
  }catch{setStorageIssue(true);setError(en?'Could not read the saved task attempt. Retry recovery before making changes.':'No se pudo leer el intento guardado. Reintente la recuperación antes de hacer cambios.');}
 },[accountId,workId,draftKey,en]);
 useEffect(()=>{const timer=setTimeout(()=>restore(),0);return()=>clearTimeout(timer);},[restore]);
 useEffect(()=>{if(!ready||!editor||pending)return;let alive=true;queueMicrotask(()=>{if(!alive)return;try{const raw=JSON.stringify(editor);
  // A draft saved before Round 4B lacks the Team keys; when it reads back as this same editor, keep its exact bytes.
  const existing=sessionStorage.getItem(draftKey);if(existing&&existing!==raw){try{if(JSON.stringify(editorSchema.parse(JSON.parse(existing)))===raw)return;}catch{}}
  sessionStorage.setItem(draftKey,raw);if(sessionStorage.getItem(draftKey)!==raw)throw Error();}catch{setStorageIssue(true);setError(en?'Could not retain this draft. Retry recovery before saving.':'No se pudo conservar el borrador. Reintente la recuperación antes de guardar.');}});return()=>{alive=false;};},[editor,draftKey,en,ready,pending]);
 useProServiceRefresh(remote.load,guarded);
 async function cancel(){if(busy)return;if(dirty){const answer=await confirm({title:t('¿Descartar cambios?','Discard changes?'),description:t('La tarea guardada se conserva.','The saved task is preserved.'),confirmLabel:t('Descartar cambios','Discard changes'),cancelLabel:t('Seguir editando','Keep editing')});if(!answer.confirmed||!current.current.active)return;}if(!current.current.active)return;try{sessionStorage.removeItem(draftKey);if(sessionStorage.getItem(draftKey)!==null)throw Error();setEditor(null);setError('');setConflict(false);}catch{setStorageIssue(true);setError(t('No se pudo cerrar el borrador. Reintente la recuperación.','Could not close the draft. Retry recovery.'));}}
 async function mutate(input?:WorkTaskMutation,baseline:WorkTask|null=null):Promise<WorkTask|null>{
  if(lock.current||!current.current.active||storageIssue||!ready)return null;lock.current=true;setSaving(true);setError('');setNotice('');
  try{
   const tab=readWorkTaskWrite(sessionStorage,accountId,workId),global=readWorkTaskWrite(localStorage,accountId,workId),disk=tab?mergeWorkTaskWrite(tab,global):global;
   let record=attempt.current?mergeWorkTaskWrite(attempt.current,disk):disk;
   if(record&&input&&record.body!==JSON.stringify(workTaskMutationSchema.parse(input))){attempt.current=record;setPending(record);throw Error('pending');}
   if(!record){if(!input)throw Error();record=createWorkTaskWrite(accountId,input,baseline);}
   attempt.current=record;setPending(record);
   const result=await continueWorkTaskWrite({attempt:record,store:localStorage,request:fetch,currentAccount:()=>current.current.active?current.current.accountId:undefined,currentWork:()=>current.current.active?current.current.workId:undefined,onCheckpoint:value=>{attempt.current=value;if(current.current.active)setPending(value);saveWorkTaskWrite(sessionStorage,value);}});
   if(!current.current.active)return null;
   if(result.status==='rejected'){
    clearWorkTaskWrite(localStorage,result.attempt);clearWorkTaskWrite(sessionStorage,result.attempt);attempt.current=null;setPending(null);
    setConflict(result.code===409);setError(result.reason==='photo_required'?t('Este pendiente exige una foto. Agréguela en Pendientes finales antes de completarlo.','This item requires a photo. Add it in Punch list before completing it.'):result.code===409?t('La tarea cambió. Cancele la edición y vuelva a abrirla para revisar los cambios.','The task changed. Cancel editing and reopen it to review the changes.'):t('No se guardó el cambio. Revise los datos o vuelva a cargar las tareas.','The change was not saved. Review the details or reload tasks.'));return null;
   }
   // Clear the owned draft only once the server result is verified. A clearing
   // failure retains the confirmed record, whose next retry only reads.
   sessionStorage.removeItem(draftKey);if(sessionStorage.getItem(draftKey)!==null)throw Error();
   clearWorkTaskWrite(localStorage,result.attempt);clearWorkTaskWrite(sessionStorage,result.attempt);attempt.current=null;setPending(null);setEditor(null);setConflict(false);clearHistory();setNotice(t('Tarea guardada.','Task saved.'));await remote.load();return result.task;
  }catch{if(current.current.active){setPending(attempt.current);setError(t('Compruebe el guardado antes de continuar.','Check the saved result before continuing.'));}return null;}
  finally{lock.current=false;if(current.current.active)setSaving(false);}
 }
 // Round 4B: the responsible person is written by the existing Team writer (task revision CAS, idempotent actionId).
 async function assign(request:AssignRetry){
  if(lock.current||!current.current.active)return false;lock.current=true;setSaving(true);setAssignRetry(null);
  try{
   const response=await fetch('/api/pro/team',{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json','X-Pro-Expected-Actor':accountId},body:JSON.stringify({action:'assign',actionId:request.actionId,workId,taskId:request.taskId,revision:request.revision,assigneeGrantId:request.grantId})});
   if(!current.current.active)return false;
   if(!response.ok){setError(response.status===409?t('La tarea o el miembro del equipo cambió. Vuelva a abrir la tarea y elija el responsable otra vez.','The task or team member changed. Reopen the task and choose the assignee again.'):t('No se pudo asignar el responsable. Revise el equipo de este trabajo.','Could not set the assignee. Review this job\'s team.'));void remote.load();return false;}
   // Final verification 2026-11-14: refresh the team/assignments before announcing, so an Edit opened
   // right after the notice starts from the new assignee (it used to open with the previous one).
   await remote.load();await assignees.load();if(!current.current.active)return false;setNotice(request.grantId?t('Responsable asignado.','Assignee set.'):t('Responsable quitado.','Assignee removed.'));return true;
  }catch{if(current.current.active){setAssignRetry(request);setError(t('No se pudo comprobar la asignación del responsable de "'+request.title+'". Reintente la misma operación.','Could not verify the assignee of "'+request.title+'". Retry the same operation.'));}return false;}
  finally{lock.current=false;if(current.current.active)setSaving(false);}
 }
 async function save(event:FormEvent){event.preventDefault();if(!editor||busy||conflict)return;const grantChanged=editor.values.assigneeGrantId!==editor.baseGrant,taskChanged=JSON.stringify({...editor.values,assigneeGrantId:''})!==JSON.stringify(values(editor.task));
  if(editor.task&&grantChanged&&!taskChanged){const done=await assign({taskId:editor.task.id,title:editor.task.title,grantId:editor.values.assigneeGrantId||null,revision:editor.task.revision,actionId:crypto.randomUUID()});if(done&&current.current.active){try{sessionStorage.removeItem(draftKey);}catch{}setEditor(null);}return;}
  const wanted=editor.values.assigneeGrantId,input=workTaskMutationSchema.safeParse({action:editor.task?'update':'create',workId,taskId:editor.task?.id??crypto.randomUUID(),actionId:crypto.randomUUID(),revision:editor.task?.revision??0,title:editor.values.title,details:editor.values.details,dueDate:editor.values.dueDate||null,assignee:editor.values.assignee});if(!input.success){setError(t('Revise el título y la fecha de la tarea.','Review the task title and due date.'));return;}const saved=await mutate(input.data,editor.task);if(saved&&grantChanged&&current.current.active)await assign({taskId:saved.id,title:saved.title,grantId:wanted||null,revision:saved.revision,actionId:crypto.randomUUID()});}
 // Round 4B: a save whose answer was lost keeps the draft (with the chosen Team member) until the
 // check confirms it; apply that same choice afterwards instead of dropping it silently.
 async function recover(){const draft=editor,write=pending?workTaskMutationSchema.safeParse((()=>{try{return JSON.parse(pending.body);}catch{return null;}})()):null,ownWrite=!!write?.success&&(write.data.action==='create'||write.data.action==='update'),wanted=draft&&ownWrite&&draft.values.assigneeGrantId!==draft.baseGrant?draft.values.assigneeGrantId:null;const saved=await mutate();if(saved&&wanted!==null&&(!draft?.task||draft.task.id===saved.id)&&current.current.active)await assign({taskId:saved.id,title:saved.title,grantId:wanted||null,revision:saved.revision,actionId:crypto.randomUUID()});}
 function action(task:WorkTask,kind:'complete'|'reopen'|'archive'|'restore'){if(guarded||editor)return;void mutate({action:kind,workId,taskId:task.id,actionId:crypto.randomUUID(),revision:task.revision},task);}
 function edit(task:WorkTask|null){if(guarded||editor)return;const grant=task?assignees.data?.assignments[task.id]?.grantId??'':'';setEditor({task,values:values(task,grant),baseGrant:grant});setError('');setNotice('');setConflict(false);}
 function change(name:keyof Values,value:string){setEditor(old=>old?{...old,values:{...old.values,[name]:value}}:null);setError('');setNotice('');}
 async function loadHistory(task:WorkTask){if(guarded)return;const sequence=++historySequence.current;setHistoryLoading(true);setHistoryError(false);setHistory(null);try{const response=await fetch(api+'?'+new URLSearchParams({workId,taskId:task.id}),{cache:'no-store',headers:{'X-Pro-Expected-Actor':accountId}});if(!response.ok)throw Error();const body=detailSchema.parse(await response.json());if(body.task.id!==task.id||body.task.workId!==workId||body.history.some(item=>item.after.id!==task.id||item.after.workId!==workId||item.before&&(item.before.id!==task.id||item.before.workId!==workId)))throw Error();if(current.current.active&&sequence===historySequence.current)setHistory(body);}catch{if(current.current.active&&sequence===historySequence.current)setHistoryError(true);}finally{if(current.current.active&&sequence===historySequence.current)setHistoryLoading(false);}}
 const actionNames:Record<string,string>=en?{create:'Created',update:'Edited',complete:'Completed',reopen:'Reopened',archive:'Archived',restore:'Restored'}:{create:'Creada',update:'Editada',complete:'Completada',reopen:'Reabierta',archive:'Archivada',restore:'Restaurada'};
 function clearHistory(){invalidateHistory();setHistory(null);setHistoryError(false);setHistoryLoading(false);}
 const today=crTodayISO();
 return <section data-work-tasks className="min-w-0 space-y-4">
  <div className="space-y-3"><div className="flex items-center justify-between gap-3"><h3 className="font-bold">{t('Tareas del trabajo','Job tasks')}</h3><details className="relative"><summary aria-label={t('Opciones','Options')} className="flex min-h-11 min-w-11 cursor-pointer list-none items-center justify-center text-xl font-bold text-[#68778d] [&::-webkit-details-marker]:hidden"><span aria-hidden="true">⋯</span></summary><div className="absolute right-0 z-20 min-w-52 rounded-xl border border-[#d7e1ea] bg-white p-2 shadow-lg"><Button type="button" variant="secondary" disabled={guarded||!!editor} onClick={()=>{setArchived(value=>!value);clearHistory();}}>{archived?t('Volver a tareas activas','Back to active tasks'):t('Ver archivadas','Show archived')}</Button></div></details></div><Button type="button" className="w-full sm:w-auto" disabled={!ready||guarded||!!editor||!remote.page||remote.error||remote.loading} onClick={()=>edit(null)}>{t('Nueva tarea','New task')}</Button></div>
  {notice&&<p role="status" className="text-sm text-[#175b42]">{notice}</p>}{error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
  {assignRetry&&<Button type="button" variant="secondary" disabled={saving} onClick={()=>void assign(assignRetry)}>{t('Reintentar asignación','Retry assignment')}</Button>}
  {storageIssue&&<Button type="button" variant="secondary" onClick={restore}>{t('Reintentar recuperación','Retry recovery')}</Button>}
  {pending&&<div data-work-task-recovery className="space-y-2 rounded-xl border border-[#d7e1ea] bg-[#f3f8fb] p-3"><p className="text-sm">{t('Hay un guardado pendiente de comprobar.','A task save needs to be checked.')}</p><Button type="button" disabled={saving||storageIssue} onClick={()=>void recover()}>{t('Comprobar guardado','Check saved result')}</Button></div>}
  {editor&&<form data-work-task-form aria-label={editor.task?t('Editar tarea','Edit task'):t('Nueva tarea','New task')} onSubmit={save} className="space-y-4 rounded-2xl border border-[#d7e1ea] bg-white p-4">
   <h4 className="font-semibold">{editor.task?t('Editar tarea','Edit task'):t('Nueva tarea','New task')}</h4>
   <fieldset disabled={busy} className="min-w-0 space-y-4"><label className="block text-sm font-semibold">{t('Tarea','Task')}<input autoFocus required maxLength={160} value={editor.values.title} onChange={e=>change('title',e.target.value)} className={field}/></label>
   <div className="grid gap-4 sm:grid-cols-2"><label className="block text-sm font-semibold">{t('Fecha límite (opcional)','Due date (optional)')}<input type="date" min="1900-01-01" max="2100-12-31" value={editor.values.dueDate} onChange={e=>change('dueDate',e.target.value)} className={field+' max-w-full appearance-none'}/></label><AssigneeField en={en} assignees={assignees} value={editor.values.assigneeGrantId} current={editor.task?assignees.data?.assignments[editor.task.id]??null:null} legacy={editor.values.assignee} originalLegacy={editor.task?.assignee??''} onChange={value=>change('assigneeGrantId',value)} onClearLegacy={()=>change('assignee','')} onRestoreLegacy={()=>change('assignee',editor.task?.assignee??'')}/></div>
   <label className="block text-sm font-semibold">{t('Notas (opcional)','Notes (optional)')}<textarea aria-label={t('Notas (opcional)','Notes (optional)')} maxLength={2000} value={editor.values.details} onChange={e=>change('details',e.target.value)} className={field}/></label></fieldset>
   <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="secondary" disabled={busy} onClick={()=>void cancel()}>{t('Cancelar','Cancel')}</Button><Button type="submit" disabled={busy||!dirty||conflict||!editor.values.title.trim()}>{t('Guardar','Save')}</Button></div>
  </form>}
  <div className="grid grid-cols-2 gap-1 rounded-2xl bg-[#e9eff5] p-1.5" aria-label={t('Estado de tareas','Task status')}>{(['open','done'] as const).map(value=><button key={value} type="button" disabled={guarded||!!editor} aria-pressed={!archived&&status===value} onClick={()=>{setArchived(false);setStatus(value);clearHistory();}} className={`min-h-11 rounded-xl px-3 text-sm font-semibold ${!archived&&status===value?'bg-white text-[#008bb5] shadow-sm':'text-[#52627a]'}`}>{value==='open'?t('Pendientes','Open'):t('Completadas','Completed')}</button>)}</div>
  {archived&&<h4 className="font-semibold">{t('Tareas archivadas','Archived tasks')}</h4>}
  {remote.error?<div role="alert" className="space-y-2"><p>{t('No se pudieron cargar las tareas.','Could not load tasks.')}</p><Button type="button" variant="secondary" disabled={guarded||remote.loading} onClick={()=>void remote.load()}>{t('Reintentar','Retry')}</Button></div>:remote.loading&&!remote.page?<p role="status">{t('Cargando tareas…','Loading tasks…')}</p>:remote.page&&!remote.page.items.length?<p className="rounded-xl border border-[#d7e1ea] p-4 text-sm text-[#52627a]">{t('No hay tareas en esta vista.','No tasks in this view.')}</p>:null}
  {!remote.error&&remote.page?.items.map(task=><article key={task.id} data-work-task={task.id} className="space-y-3 rounded-2xl border border-[#d7e1ea] bg-white p-4"><h4 className="break-words font-semibold">{task.title}</h4><div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-[#52627a]">{task.dueDate&&<p>{formatDate(task.dueDate,en)}{!task.archived&&task.status==='open'&&task.dueDate<today&&<span className="ml-2 font-semibold text-[#a34919]">{t('Vencida','Overdue')}</span>}</p>}{assignees.data?.assignments[task.id]&&<p data-work-task-assignee className="break-words font-semibold text-[#172744]">{t('Responsable: ','Assignee: ')}{assignees.data.assignments[task.id].name||t('Miembro del equipo','Team member')}{!assignees.data.assignments[task.id].active&&<span className="font-normal text-[#a34919]">{t(' (sin acceso vigente)',' (no current access)')}</span>}</p>}{task.assignee&&<p data-work-task-legacy-assignee className="break-words">{t('Responsable anotado antes: ','Previously noted assignee: ')}{task.assignee}</p>}</div>{task.details&&<p className="whitespace-pre-wrap break-words text-sm text-[#52627a]">{task.details}</p>}
   <div className="flex flex-wrap gap-2">{!task.archived&&<><Button type="button" variant="secondary" disabled={guarded||!!editor||!assignees.data&&!assignees.error} onClick={()=>edit(task)}>{t('Editar','Edit')}</Button><Button type="button" disabled={guarded||!!editor} onClick={()=>action(task,task.status==='open'?'complete':'reopen')}>{task.status==='open'?t('Completar','Complete'):t('Reabrir','Reopen')}</Button></>}<details className="relative ml-auto"><summary aria-label={t('Más opciones','More options')} className="flex min-h-11 min-w-11 cursor-pointer list-none items-center justify-center text-xl font-bold text-[#68778d] [&::-webkit-details-marker]:hidden"><span aria-hidden="true">⋯</span></summary><div className="absolute bottom-full right-0 z-30 mb-2 flex min-w-44 flex-col gap-2 rounded-xl border border-[#d7e1ea] bg-white p-2 shadow-lg"><Button type="button" variant="secondary" disabled={guarded||!!editor} onClick={()=>action(task,task.archived?'restore':'archive')}>{task.archived?t('Restaurar','Restore'):t('Archivar','Archive')}</Button><Button type="button" variant="secondary" disabled={guarded||historyLoading||!!editor} onClick={()=>void loadHistory(task)}>{t('Historial','History')}</Button></div></details></div>
  </article>)}
  {remote.page?.nextCursor&&<Button type="button" variant="secondary" disabled={guarded||remote.loading||!!editor} onClick={()=>void remote.load(remote.page!.nextCursor!)}>{t('Ver más tareas','Show more tasks')}</Button>}
  {historyLoading&&<p role="status">{t('Cargando historial…','Loading history…')}</p>}{historyError&&<p role="alert">{t('No se pudo cargar el historial. Vuelva a abrirlo.','Could not load history. Open it again.')}</p>}
  {history&&<section data-work-task-history aria-label={t('Historial de la tarea','Task history')} className="space-y-3 rounded-xl border border-[#d7e1ea] bg-[#f3f8fb] p-4"><h4 className="break-words font-semibold">{t('Historial','History')}: {history.task.title}</h4>{history.history.map(item=><article key={item.actionId} className="space-y-1 border-t border-[#d7e1ea] pt-3 text-sm"><p className="font-semibold">{actionNames[item.action]} · {new Date(item.at).toLocaleString(en?'en-US':'es-CR',{timeZone:'America/Costa_Rica'})}</p><p className="break-words">{item.after.title}</p>{item.after.dueDate&&<p>{formatDate(item.after.dueDate,en)}</p>}{item.after.assignee&&<p className="break-words">{t('Responsable anotado antes: ','Previously noted assignee: ')}{item.after.assignee}</p>}{item.after.details&&<p className="whitespace-pre-wrap break-words">{item.after.details}</p>}</article>)}<Button type="button" variant="secondary" onClick={()=>setHistory(null)}>{t('Cerrar historial','Close history')}</Button></section>}{dialogNode}
 </section>;
}

function AssigneeField({en,assignees,value,current,legacy,originalLegacy,onChange,onClearLegacy,onRestoreLegacy}:{en:boolean;assignees:{data:Assignees|null;error:boolean;load:()=>Promise<void>};value:string;current:z.infer<typeof assignmentSchema>|null;legacy:string;originalLegacy:string;onChange:(value:string)=>void;onClearLegacy:()=>void;onRestoreLegacy:()=>void}){
 const t=(es:string,english:string)=>en?english:es,data=assignees.data,label=t('Responsable (opcional)','Assignee (optional)');
 const roleNote=(member:Assignees['members'][number])=>!member.active?t(' · sin acceso',' · no access'):member.role==='viewer'?t(' · solo lectura',' · view only'):!member.canAssign?t(' · cuenta no disponible',' · account unavailable'):'';
 return <div data-work-task-assignee-field className="min-w-0 space-y-2"><label className="block text-sm font-semibold">{label}<select aria-label={label} value={value} disabled={!data} onChange={event=>onChange(event.target.value)} className={field}><option value="">{t('Sin responsable','No assignee')}</option>
  {value&&data&&!data.members.some(member=>member.grantId===value)&&<option value={value} disabled>{(current?.name||t('Miembro del equipo','Team member'))+t(' (sin acceso vigente)',' (no current access)')}</option>}
  {data&&data.members.length>0&&<optgroup label={t('Equipo de este trabajo','This job\'s team')}>{data.members.map(member=><option key={member.grantId} value={member.grantId} disabled={!member.canAssign&&member.grantId!==value}>{(member.name||t('Miembro del equipo','Team member'))+roleNote(member)}</option>)}</optgroup>}
  {data&&data.others.length>0&&<optgroup label={t('Otros miembros de su equipo (invítelos a este trabajo)','Other team members (invite them to this job)')}>{data.others.map((other,index)=><option key={'other-'+index} value={'other-'+index} disabled>{other.name}</option>)}</optgroup>}
 </select></label>
 {assignees.error&&!data?<p role="alert" className="text-xs text-red-700">{t('No se pudo cargar el equipo. ','Could not load the team. ')}<button type="button" className="min-h-11 font-semibold underline" onClick={()=>void assignees.load()}>{t('Reintentar','Retry')}</button></p>:!data?<p role="status" className="text-xs text-[#52627a]">{t('Cargando equipo…','Loading team…')}</p>:<p className="text-xs font-normal text-[#52627a]">{data.members.some(member=>member.canAssign)?t('Solo los colaboradores de este trabajo pueden ser responsables. No se envían avisos.','Only collaborators on this job can be assignees. No notices are sent.'):t('Este trabajo aún no tiene colaboradores. Invítelos desde Equipo para asignarles tareas.','This job has no collaborators yet. Invite them from Team to assign tasks.')}</p>}
 {legacy?<div data-work-task-legacy className="rounded-xl bg-[#f3f8fb] p-3 text-xs"><p className="break-words"><span className="font-semibold">{t('Responsable anotado antes (solo referencia): ','Previously noted assignee (reference only): ')}</span>{legacy}</p><button type="button" className="mt-1 min-h-11 font-semibold text-[#008bb5] underline" onClick={onClearLegacy}>{t('Quitar texto anterior','Remove previous text')}</button></div>:originalLegacy?<p className="text-xs text-[#52627a]">{t('Se quitará el texto anterior al guardar. ','The previous text will be removed when you save. ')}<button type="button" className="min-h-11 font-semibold underline" onClick={onRestoreLegacy}>{t('Conservarlo','Keep it')}</button></p>:null}
 </div>;
}
