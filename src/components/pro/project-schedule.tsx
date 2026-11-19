'use client';

import {useCallback,useEffect,useLayoutEffect,useMemo,useRef,useState,useSyncExternalStore,type FormEvent,type ReactNode,type PointerEvent as ReactPointerEvent,type KeyboardEvent as ReactKeyboardEvent} from 'react';
import {useLocale} from 'next-intl';
import {useAuth} from '@/hooks/use-auth';
import {Button} from '@/components/ui/button';
import {pushProParams} from '@/lib/pro/navigation';
import {addDays,baselineMutationSchema,baselineResultSchema,clientScheduleSchema,dayDiff,ganttSchema,type ClientSchedule,type Gantt,type GanttMilestone,type GanttPhase,type GanttTask} from '@/lib/pro/project-schedule';
import {workScheduleMutationSchema,workScheduleResultSchema,workTimelineTaskCreateSchema,type WorkScheduleMutation,type WorkTimelineTaskCreate} from '@/lib/pro/work-schedule';
import {daysFromPixels,dependencyIssues,keyEdit,matchesAssignee,shiftPeriod,undoState,UNASSIGNED,type GanttEditMode} from '@/lib/pro/gantt-edit';
import {useProChildGuard} from './use-pro-child-guard';

// Families 13/79: project schedule (Gantt and chronological list) over the job plan,
// with immutable baselines and deviation in days. Dates are civil (Costa Rica).
// Gap 13 (2026-11-17): the Gantt is editable for whoever can write the job plan — create a task or a
// phase, drag a bar (mouse/touch) or its edges, keyboard alternative, dependency warning with explicit
// confirmation, one-step undo and a filter by assignee. Every write reuses the existing plan writers
// (/api/pro/work-schedule task_plan/phase_save/phase_archive/timeline_task_create, /api/pro/team assign,
// /api/pro/work-tasks archive) with the schedule revision (CAS → 409 shows «Recargar», never overwrites)
// and a fresh idempotent actionId. A company read-only role (html[data-pro-role="read_only"]) sees no
// editing affordances; the customer view (AppointmentSchedule) stays read-only.
const api='/api/pro/project-schedule',planApi='/api/pro/work-schedule',tasksApi='/api/pro/work-tasks',teamApi='/api/pro/team';
const field='mt-1 block min-h-11 w-full min-w-0 max-w-full appearance-none rounded-xl border border-[#d7e1ea] bg-white px-3 py-2 text-base font-normal';
type StateCallback={onStateChange?:(state:{dirty:boolean;busy:boolean})=>void};
type Scale='day'|'week'|'month';
type Mode='gantt'|'list';
const dayWidth:Record<Scale,number>={day:32,week:14,month:6};
// Round 2: a middle row in the header holds the «Hoy» flag, so it no longer covers the month name.
const rowHeight=44,headerHeight=68;
type Editor={kind:'task';task:GanttTask;start:string;end:string;phaseId:string}|{kind:'milestone';milestone:GanttMilestone;title:string;date:string};
type Pending={url:string;body:unknown;kind:'plan'|'baseline'|'other';message?:string;done?:()=>void;revert?:()=>void};
type Row={kind:'phase';phase:GanttPhase}|{kind:'group';label:string}|{kind:'task';task:GanttTask}|{kind:'milestoneGroup'}|{kind:'milestone';milestone:GanttMilestone};
type Preview={taskId:string;start:string;end:string};
type LastChange={kind:'dates';taskId:string;title:string;prevStart:string;prevEnd:string;nextStart:string;nextEnd:string}|{kind:'task';taskId:string;title:string}|{kind:'phase';phaseId:string;title:string};
type Creating={kind:'task'|'phase';id:string;actionId:string;planActionId:string;assignActionId:string;title:string;start:string;end:string;phaseId:string;assignee:string;dependsOn:string};
type Warning={lines:string[];proceed:()=>void;cancel:()=>void};
type Member={grantId:string;name:string;canAssign:boolean};
type Assigned={map:Record<string,string|null>;names:Record<string,string>;members:Member[]};
type EditApi={editable:boolean;preview:Preview|null;onEdit:(task:GanttTask,mode:GanttEditMode,delta:number)=>void;helpId:string};

/** Company read-only members (Round 7C role on <html>) never get editing affordances. */
const subscribeRole=(callback:()=>void)=>{const observer=new MutationObserver(callback);observer.observe(document.documentElement,{attributes:true,attributeFilter:['data-pro-role']});return()=>observer.disconnect();};
const readOnlyRole=()=>document.documentElement.dataset.proRole==='read_only';

function copy(en:boolean){
 return en?{
  title:'Schedule',intro:'Timeline of the job with its phases, tasks and key dates. Drag a bar to move it or its edges to change the dates, or open it to edit the dates; nothing is sent to anyone.',introReadOnly:'Timeline of the job with its phases, tasks and key dates. Read-only: you cannot change the schedule.',
  gantt:'Gantt',list:'List',viewLabel:'Schedule view',scaleLabel:'Time scale',day:'Days',week:'Weeks',month:'Months',today:'Today',todayMarker:'Today',
  period:'Planned period',noPeriod:'No planned dates yet',baseline:'Baseline',noBaseline:'No baseline saved. Save one to compare later changes.',comparing:(t:string,d:string)=>`Comparing with “${t}” (${d})`,
  saveBaseline:'Save baseline',baselineTitle:'Baseline name',baselineHelp:'Stores an unchangeable copy of today’s planned dates. Later changes show as days late or early.',baselineDefault:(d:string)=>`Baseline ${d}`,
  confirmBaseline:'Save copy of dates',cancel:'Cancel',saving:'Saving…',baselineSaved:'Baseline saved.',history:'Saved baselines',
  projectVariance:'Planned end vs baseline',late:(n:number)=>`${n} ${n===1?'day':'days'} late`,early:(n:number)=>`${n} ${n===1?'day':'days'} early`,onTime:'Same as baseline',
  shortLate:(n:number)=>`+${n} d`,shortEarly:(n:number)=>`−${n} d`,noPhase:'No phase',milestones:'Key dates',unscheduled:'Tasks without dates',schedule:'Schedule',edit:'Edit dates',
  emptyTitle:'There is nothing to show yet',empty:'Add tasks with a planned period or key dates in Tasks › Job plan.',openPlan:'Open job plan',
  start:'Start',end:'End',phase:'Phase',date:'Date',name:'Name',predecessors:'Predecessors',deadline:(d:string)=>`Due date: ${d}`,afterDeadline:'Ends after the due date',predecessorsHelp:'Predecessors are edited in Tasks › Job plan.',none:'None',duration:(n:number)=>`${n} ${n===1?'day':'days'}`,
  saveDates:'Save dates',dateSaved:'Dates saved.',invalidPeriod:'The end cannot be before the start.',taskForm:(t:string)=>`Dates for ${t}`,milestoneForm:(t:string)=>`Key date: ${t}`,
  loading:'Loading schedule…',loadError:'Could not load the schedule.',retry:'Retry',conflict:'The plan changed in another window. Reload it before saving again.',reload:'Reload',
  uncertain:'We could not confirm whether it was saved. Retry the same operation; it will not be applied twice.',retrySame:'Retry the same save',failed:'It was not saved. Review the data.',
  leave:'Save or cancel the schedule changes before leaving.',shared:'Visible in the customer view',notShared:'Not shared with the customer',configureShare:'Configure customer view',
  done:'Completed',open:'Pending',overdue:'Overdue',conflictDep:'Starts before a predecessor ends',baselineWas:(a:string,b:string)=>`Baseline: ${a} – ${b}`,baselineDay:(a:string)=>`Baseline: ${a}`,
  taskBar:(t:string,a:string,b:string,s:string)=>`${t}, ${a} – ${b}, ${s}`,milestoneBar:(t:string,d:string)=>`Key date: ${t}, ${d}`,progress:(d:number,t:number)=>`${d}/${t} completed`,
  gridLabel:'Schedule chart, scrolls sideways',newBadge:'Not in baseline',
  newTask:'New task',newPhase:'New phase',createTask:'New task in the schedule',createPhase:'New phase',taskName:'Task name',phaseName:'Phase name',assignee:'Assignee',noAssignee:'No assignee',dependsOn:'Starts after',noDependency:'No dependency',create:'Create',
  phaseHelp:'A phase groups tasks; its dates come from the tasks it contains.',createInvalid:'Enter a name and both dates in order (1900–2100).',
  created:(t:string)=>`Task created: ${t}.`,phaseCreated:(t:string)=>`Phase created: ${t}.`,moved:(t:string,a:string,b:string)=>`${t}: ${a} – ${b}.`,
  createUncertain:'We could not confirm whether the task was created. Press Create again; it will not be duplicated.',partialCreate:'The task was created, but its assignee or dependency could not be saved. Open it in Tasks to review them.',
  filter:'Filter by assignee',everyone:'Everyone',unassigned:'Unassigned',teamMember:'Team member',
  undo:'Undo',undoLabel:(t:string)=>`Undo the last change: ${t}`,undone:'Change undone.',undoChanged:'The task changed afterwards; nothing was undone.',undoMissing:'That item is no longer in the schedule; nothing was undone.',
  depTitle:'Check the dependencies',depPred:(t:string,p:string)=>`“${t}” would start before “${p}” ends.`,depSucc:(t:string,s:string)=>`“${s}” depends on “${t}” and would start before it ends.`,depConfirm:'Save anyway',depCancel:'Keep the previous dates',depCreateCancel:'Back to the form',
  help:'Drag a bar to move it or its edges to change the start or end. Keyboard: focus a bar and use ← → to move it one day, Shift+← → to change the end and Alt+← → to change the start; Enter opens its dates.',
  readOnly:'Read-only',dragging:(a:string,b:string)=>`${a} – ${b}`,
 }:{
  title:'Cronograma',intro:'Línea de tiempo del trabajo con sus fases, tareas y fechas clave. Arrastre una barra para moverla o sus bordes para cambiar las fechas, o ábrala para editar las fechas; no se envía nada a nadie.',introReadOnly:'Línea de tiempo del trabajo con sus fases, tareas y fechas clave. Solo lectura: usted no puede cambiar el cronograma.',
  gantt:'Gantt',list:'Lista',viewLabel:'Vista del cronograma',scaleLabel:'Escala de tiempo',day:'Días',week:'Semanas',month:'Meses',today:'Hoy',todayMarker:'Hoy',
  period:'Período previsto',noPeriod:'Todavía no hay fechas previstas',baseline:'Línea base',noBaseline:'No hay línea base guardada. Guarde una para comparar los cambios posteriores.',comparing:(t:string,d:string)=>`Comparando con «${t}» (${d})`,
  saveBaseline:'Guardar línea base',baselineTitle:'Nombre de la línea base',baselineHelp:'Guarda una copia que no se puede modificar de las fechas previstas de hoy. Los cambios posteriores se muestran como días de atraso o de adelanto.',baselineDefault:(d:string)=>`Línea base ${d}`,
  confirmBaseline:'Guardar copia de fechas',cancel:'Cancelar',saving:'Guardando…',baselineSaved:'Línea base guardada.',history:'Líneas base guardadas',
  projectVariance:'Fin previsto frente a la línea base',late:(n:number)=>`${n} ${n===1?'día':'días'} de atraso`,early:(n:number)=>`${n} ${n===1?'día':'días'} de adelanto`,onTime:'Igual que la línea base',
  shortLate:(n:number)=>`+${n} d`,shortEarly:(n:number)=>`−${n} d`,noPhase:'Sin fase',milestones:'Fechas clave',unscheduled:'Tareas sin fechas',schedule:'Programar',edit:'Editar fechas',
  emptyTitle:'Todavía no hay nada que mostrar',empty:'Agregue tareas con período previsto o fechas clave en Tareas › Plan del trabajo.',openPlan:'Abrir plan del trabajo',
  start:'Inicio',end:'Fin',phase:'Fase',date:'Fecha',name:'Nombre',predecessors:'Predecesoras',deadline:(d:string)=>`Fecha límite: ${d}`,afterDeadline:'Termina después de la fecha límite',predecessorsHelp:'Las predecesoras se editan en Tareas › Plan del trabajo.',none:'Ninguna',duration:(n:number)=>`${n} ${n===1?'día':'días'}`,
  saveDates:'Guardar fechas',dateSaved:'Fechas guardadas.',invalidPeriod:'El fin no puede ser anterior al inicio.',taskForm:(t:string)=>`Fechas de ${t}`,milestoneForm:(t:string)=>`Fecha clave: ${t}`,
  loading:'Cargando cronograma…',loadError:'No se pudo cargar el cronograma.',retry:'Reintentar',conflict:'El plan cambió en otra ventana. Recárguelo antes de volver a guardar.',reload:'Recargar',
  uncertain:'No pudimos confirmar si se guardó. Reintente la misma operación; no se aplicará dos veces.',retrySame:'Reintentar el mismo guardado',failed:'No se guardó. Revise los datos.',
  leave:'Guarde o cancele los cambios del cronograma antes de salir.',shared:'Visible en la vista del cliente',notShared:'No se comparte con el cliente',configureShare:'Configurar vista del cliente',
  done:'Completada',open:'Pendiente',overdue:'Vencida',conflictDep:'Empieza antes de que termine una predecesora',baselineWas:(a:string,b:string)=>`Línea base: ${a} – ${b}`,baselineDay:(a:string)=>`Línea base: ${a}`,
  taskBar:(t:string,a:string,b:string,s:string)=>`${t}, ${a} – ${b}, ${s}`,milestoneBar:(t:string,d:string)=>`Fecha clave: ${t}, ${d}`,progress:(d:number,t:number)=>`${d}/${t} completadas`,
  gridLabel:'Gráfico del cronograma, se desplaza hacia los lados',newBadge:'No estaba en la línea base',
  newTask:'Nueva tarea',newPhase:'Nueva fase',createTask:'Nueva tarea en el cronograma',createPhase:'Nueva fase',taskName:'Nombre de la tarea',phaseName:'Nombre de la fase',assignee:'Responsable',noAssignee:'Sin responsable',dependsOn:'Empieza después de',noDependency:'Sin dependencia',create:'Crear',
  phaseHelp:'Una fase agrupa tareas; sus fechas se calculan con las tareas que contiene.',createInvalid:'Indique un nombre y las dos fechas en orden (1900–2100).',
  created:(t:string)=>`Tarea creada: ${t}.`,phaseCreated:(t:string)=>`Fase creada: ${t}.`,moved:(t:string,a:string,b:string)=>`${t}: ${a} – ${b}.`,
  createUncertain:'No pudimos confirmar si se creó la tarea. Pulse Crear de nuevo; no se duplicará.',partialCreate:'La tarea se creó, pero no se pudo guardar su responsable o su dependencia. Ábrala en Tareas para revisarlos.',
  filter:'Filtrar por responsable',everyone:'Todos',unassigned:'Sin asignar',teamMember:'Miembro del equipo',
  undo:'Deshacer',undoLabel:(t:string)=>`Deshacer el último cambio: ${t}`,undone:'Cambio deshecho.',undoChanged:'La tarea cambió después; no se deshizo nada.',undoMissing:'Ese elemento ya no está en el cronograma; no se deshizo nada.',
  depTitle:'Revise las dependencias',depPred:(t:string,p:string)=>`«${t}» empezaría antes de que termine «${p}».`,depSucc:(t:string,s:string)=>`«${s}» depende de «${t}» y empezaría antes de que esta termine.`,depConfirm:'Guardar de todos modos',depCancel:'Mantener las fechas anteriores',depCreateCancel:'Volver al formulario',
  help:'Arrastre una barra para moverla o sus bordes para cambiar el inicio o el fin. Con el teclado: enfoque una barra y use ← → para moverla un día, Mayús+← → para cambiar el fin y Alt+← → para cambiar el inicio; Intro abre sus fechas.',
  readOnly:'Solo lectura',dragging:(a:string,b:string)=>`${a} – ${b}`,
 };
}
type Copy=ReturnType<typeof copy>;
/** Open and past its planned end or its due date (civil days, Costa Rica). */
const isOverdue=(t:GanttTask,today:string)=>t.status==='open'&&(t.plannedEnd!<today||!!t.dueDate&&t.dueDate<today);
/** The plan finishes after the task's own due date. */
const lateForDeadline=(t:GanttTask)=>t.status==='open'&&!!t.dueDate&&!!t.plannedEnd&&t.plannedEnd>t.dueDate;
const fmt=(value:string,en:boolean,opts:Intl.DateTimeFormatOptions={dateStyle:'medium'})=>new Intl.DateTimeFormat(en?'en-US':'es-CR',{...opts,timeZone:'UTC'}).format(new Date(value+'T12:00:00Z'));
const upperFirst=(value:string)=>value.charAt(0).toUpperCase()+value.slice(1);
const weekday=(value:string)=>new Date(value+'T12:00:00Z').getUTCDay();

export function VarianceBadge({days,c,compact=false}:{days:number|null;c:Copy;compact?:boolean}){
 if(days===null||compact&&days===0)return null;
 const text=days>0?(compact?c.shortLate(days):c.late(days)):days<0?(compact?c.shortEarly(-days):c.early(-days)):(compact?'0 d':c.onTime);
 const full=days>0?c.late(days):days<0?c.early(-days):c.onTime;
 return <span data-schedule-variance={days} title={full} aria-label={full} className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-semibold ${days>0?'bg-[#fdecea] text-[#a03c1f]':days<0?'bg-[#eef8f4] text-[#18573a]':'bg-[#eef2f6] text-[#52627a]'}`}>{text}</span>;
}

export function ProjectSchedule({workId,onStateChange}:{workId:string}&StateCallback){const {user,loading}=useAuth();if(loading||!user)return null;return <ScheduleSession key={user.id+':'+workId} accountId={user.id} workId={workId} onStateChange={onStateChange}/>;}

function ScheduleSession({accountId,workId,onStateChange}:{accountId:string;workId:string}&StateCallback){
 const en=useLocale()==='en',c=copy(en);
 const readOnly=useSyncExternalStore(subscribeRole,readOnlyRole,()=>false),canEdit=!readOnly;
 const [data,setData]=useState<Gantt|null>(null),[loading,setLoading]=useState(true),[loadError,setLoadError]=useState(false);
 // Round 10: critical path ids published by the dependency panel of this job (highlight only).
 const [critical,setCritical]=useState<Set<string>>(()=>new Set());
 const [mode,setMode]=useState<Mode>(()=>typeof window!=='undefined'&&window.matchMedia('(min-width: 768px)').matches?'gantt':'list'),[scale,setScale]=useState<Scale>('day');
 const [editor,setEditor]=useState<Editor|null>(null),[baselineDraft,setBaselineDraft]=useState<string|null>(null);
 const [saving,setSaving]=useState(false),[uncertain,setUncertain]=useState(false),[conflict,setConflict]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 // Gap 13: Gantt editing state.
 const [preview,setPreview]=useState<Preview|null>(null),[lastChange,setLastChange]=useState<LastChange|null>(null),[warning,setWarning]=useState<Warning|null>(null),[creating,setCreating]=useState<Creating|null>(null),[createError,setCreateError]=useState('');
 const [filter,setFilter]=useState(''),[assigned,setAssigned]=useState<Assigned>({map:{},names:{},members:[]}),[assignToken,setAssignToken]=useState(0);
 const active=useRef(true),sequence=useRef(0),pending=useRef<Pending|null>(null),lock=useRef(false),sectionRef=useRef<HTMLElement|null>(null);
 const dirty=!!editor&&isEditorDirty(editor)||baselineDraft!==null||!!warning||!!creating&&!!creating.title.trim(),busy=saving||uncertain;
 useProChildGuard(!onStateChange&&(dirty||busy),useCallback(()=>setError(c.leave),[c.leave]));
 useLayoutEffect(()=>{onStateChange?.({dirty,busy});},[dirty,busy,onStateChange]);
 useEffect(()=>()=>onStateChange?.({dirty:false,busy:false}),[onStateChange]);
 const load=useCallback(async()=>{const id=++sequence.current;setLoading(true);setLoadError(false);try{const response=await fetch(api+'?'+new URLSearchParams({workId}),{cache:'no-store',headers:{'X-Pro-Expected-Actor':accountId}});if(!response.ok)throw Error();const body=ganttSchema.parse(await response.json());if(body.workId!==workId)throw Error();if(active.current&&id===sequence.current)setData(body);}catch{if(active.current&&id===sequence.current)setLoadError(true);}finally{if(active.current&&id===sequence.current)setLoading(false);}},[accountId,workId]);
 const blockedRef=useRef(false);useEffect(()=>{blockedRef.current=dirty||busy;},[dirty,busy]);const invalidate=useCallback(()=>{sequence.current++;},[]);
 useEffect(()=>{active.current=true;const timer=setTimeout(()=>void load(),0),refresh=()=>{if(!blockedRef.current&&document.visibilityState==='visible')void load();};window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',refresh);return()=>{active.current=false;invalidate();clearTimeout(timer);window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',refresh);};},[load,invalidate]);

 // Round 10: the dependency panel reloads this chart after a shift/undo and publishes the critical path.
 useEffect(()=>{const changed=(e:Event)=>{const d=(e as CustomEvent<{workId:string;source?:string}>).detail;if(d?.workId===workId&&d.source!=='gantt'&&!blockedRef.current)void load();},crit=(e:Event)=>{const d=(e as CustomEvent<{workId:string;ids:string[]}>).detail;if(d?.workId===workId)setCritical(new Set(d.ids));};window.addEventListener('ccr:pro-schedule-changed',changed);window.addEventListener('ccr:pro-schedule-critical',crit);return()=>{window.removeEventListener('ccr:pro-schedule-changed',changed);window.removeEventListener('ccr:pro-schedule-critical',crit);};},[workId,load]);
 // Gap 13: real Team assignments of the job's tasks (20 per read) for the assignee filter and the create form.
 const taskKey=data?data.tasks.map(t=>t.id).join(','):null;
 useEffect(()=>{if(taskKey===null)return;let alive=true;const ids=taskKey?taskKey.split(','):[],chunks:string[][]=[];for(let i=0;i<ids.length;i+=20)chunks.push(ids.slice(i,i+20));if(!chunks.length)chunks.push([]);
  type Body={members?:{grantId:string;name:string;canAssign:boolean}[];assignments?:Record<string,{grantId?:string;name?:string}|null>};
  void Promise.all(chunks.map(async chunk=>{try{const response=await fetch(tasksApi+'?'+new URLSearchParams({view:'assignees',workId,tasks:chunk.join(',')}),{cache:'no-store',headers:{'X-Pro-Expected-Actor':accountId}});return response.ok?await response.json() as Body:null;}catch{return null;}})).then(parts=>{
   if(!alive)return;const next:Assigned={map:{},names:{},members:[]};
   for(const part of parts){if(!part)continue;for(const m of part.members??[]){next.names[m.grantId]=m.name;if(!next.members.some(x=>x.grantId===m.grantId))next.members.push({grantId:m.grantId,name:m.name,canAssign:m.canAssign});}for(const [id,a] of Object.entries(part.assignments??{})){next.map[id]=a?.grantId??null;if(a?.grantId&&a.name&&!next.names[a.grantId])next.names[a.grantId]=a.name;}}
   setAssigned(next);
  });
  return()=>{alive=false;};},[taskKey,workId,accountId,assignToken]);
 const announce=useCallback(()=>window.dispatchEvent(new CustomEvent('ccr:pro-schedule-changed',{detail:{workId,source:'gantt'}})),[workId]);

 async function send(next?:Pending){
  if(lock.current)return;const attempt=next??pending.current;if(!attempt)return;lock.current=true;pending.current=attempt;setSaving(true);setError('');setNotice('');setConflict(false);
  try{
   const response=await fetch(attempt.url,{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json','X-Pro-Expected-Actor':accountId},body:JSON.stringify(attempt.body)});
   if(response.status===409){pending.current=null;setUncertain(false);setConflict(true);setError(c.conflict);attempt.revert?.();return;}
   if(response.status>=400&&response.status<500){pending.current=null;setUncertain(false);setError(c.failed);attempt.revert?.();return;}
   if(!response.ok)throw Error();
   const body=await response.json();if(attempt.kind==='baseline')baselineResultSchema.parse(body);else if(attempt.kind==='plan')workScheduleResultSchema.parse(body);
   pending.current=null;setUncertain(false);setEditor(null);setBaselineDraft(null);setNotice(attempt.message??(attempt.kind==='baseline'?c.baselineSaved:c.dateSaved));attempt.done?.();
   if(attempt.kind!=='baseline')announce();
   await load();if(active.current)setPreview(null);
  }catch{if(active.current){setUncertain(true);setError(c.uncertain);}}
  finally{lock.current=false;if(active.current)setSaving(false);}
 }
 function submitEditor(event:FormEvent){
  event.preventDefault();if(!data||!editor||busy||!canEdit)return;
  let input:WorkScheduleMutation,done:(()=>void)|undefined;
  if(editor.kind==='task'){
   if(!editor.start||!editor.end||editor.end<editor.start){setError(c.invalidPeriod);return;}
   input=workScheduleMutationSchema.parse({action:'task_plan',actionId:crypto.randomUUID(),workId,revision:data.revision,taskId:editor.task.id,phaseId:editor.phaseId||null,plannedStart:editor.start,plannedEnd:editor.end,dependsOn:editor.task.dependsOn});
   const t=editor.task,next={start:editor.start,end:editor.end};
   // The dates edited in the form are undoable too (same API, new revision).
   if(t.plannedStart&&t.plannedEnd&&(t.plannedStart!==next.start||t.plannedEnd!==next.end))done=()=>setLastChange({kind:'dates',taskId:t.id,title:t.title,prevStart:t.plannedStart!,prevEnd:t.plannedEnd!,nextStart:next.start,nextEnd:next.end});
  }else{
   const parsed=workScheduleMutationSchema.safeParse({action:'milestone_save',actionId:crypto.randomUUID(),workId,revision:data.revision,milestoneId:editor.milestone.id,title:editor.title,date:editor.date,notes:editor.milestone.notes});
   if(!parsed.success){setError(c.failed);return;}input=parsed.data;
  }
  void send({url:planApi,body:input,kind:'plan',done});
 }
 function submitBaseline(event:FormEvent){event.preventDefault();if(!data||baselineDraft===null||busy||!canEdit)return;const parsed=baselineMutationSchema.safeParse({action:'baseline_save',actionId:crypto.randomUUID(),workId,revision:data.revision,title:baselineDraft});if(!parsed.success){setError(c.failed);return;}void send({url:api,body:parsed.data,kind:'baseline'});}
 const idle=!busy&&!editor&&!warning&&!creating&&baselineDraft===null;
 function openTask(task:GanttTask){if(!canEdit||!idle)return;const start=task.plannedStart??data!.today,end=task.plannedEnd??start;setEditor({kind:'task',task,start,end,phaseId:task.phaseId??''});setError('');setNotice('');}
 function openMilestone(milestone:GanttMilestone){if(!canEdit||!idle)return;setEditor({kind:'milestone',milestone,title:milestone.title,date:milestone.date});setError('');setNotice('');}
 function scrollToday(){const box=sectionRef.current?.querySelector<HTMLElement>('[data-schedule-gantt]'),marker=box?.querySelector<HTMLElement>('[data-schedule-today]');if(box&&marker)box.scrollTo({left:todayScroll(box,marker.offsetLeft)});}

 // ---- Gap 13: drag / keyboard edits with the finish-to-start warning ----
 function persistDates(task:GanttTask,next:{start:string;end:string}){
  if(!data||!task.plannedStart||!task.plannedEnd)return;const prevStart=task.plannedStart,prevEnd=task.plannedEnd;
  const input=workScheduleMutationSchema.parse({action:'task_plan',actionId:crypto.randomUUID(),workId,revision:data.revision,taskId:task.id,phaseId:task.phaseId,plannedStart:next.start,plannedEnd:next.end,dependsOn:task.dependsOn});
  void send({url:planApi,body:input,kind:'plan',message:c.moved(task.title,fmt(next.start,en),fmt(next.end,en)),done:()=>setLastChange({kind:'dates',taskId:task.id,title:task.title,prevStart,prevEnd,nextStart:next.start,nextEnd:next.end}),revert:()=>setPreview(null)});
 }
 /** Dependency rule (documented choice): a change that breaks finish-to-start is NOT saved silently;
  *  the chart shows the new position, explains each broken link and asks to confirm or keep the old dates. */
 function editDates(task:GanttTask,editMode:GanttEditMode,delta:number){
  if(!data||!canEdit||!idle||!task.plannedStart||!task.plannedEnd)return;
  const next=shiftPeriod(task.plannedStart,task.plannedEnd,editMode,delta);if(next.start===task.plannedStart&&next.end===task.plannedEnd)return;
  setError('');setNotice('');setPreview({taskId:task.id,...next});
  const issues=dependencyIssues(data.tasks,task.id,next),title=(id:string)=>data.tasks.find(t=>t.id===id)?.title??'—';
  if(issues.blocking){setWarning({lines:[...issues.predecessors.map(id=>c.depPred(task.title,title(id))),...issues.successors.map(id=>c.depSucc(task.title,title(id)))],proceed:()=>{setWarning(null);persistDates(task,next);},cancel:()=>{setWarning(null);setPreview(null);}});return;}
  persistDates(task,next);
 }
 function undo(){
  if(!data||!lastChange||!canEdit||!idle)return;const change=lastChange;setError('');
  if(change.kind==='dates'){
   const task=data.tasks.find(t=>t.id===change.taskId),state=undoState(change,task);
   if(state!=='ok'||!task){setLastChange(null);setNotice(state==='missing'?c.undoMissing:c.undoChanged);return;}
   setPreview({taskId:task.id,start:change.prevStart,end:change.prevEnd});
   void send({url:planApi,kind:'plan',body:workScheduleMutationSchema.parse({action:'task_plan',actionId:crypto.randomUUID(),workId,revision:data.revision,taskId:task.id,phaseId:task.phaseId,plannedStart:change.prevStart,plannedEnd:change.prevEnd,dependsOn:task.dependsOn}),message:c.undone,done:()=>setLastChange(null),revert:()=>setPreview(null)});
  }else if(change.kind==='task'){
   const task=data.tasks.find(t=>t.id===change.taskId);if(!task){setLastChange(null);setNotice(c.undoMissing);return;}
   void send({url:tasksApi,kind:'other',body:{action:'archive',workId,taskId:task.id,actionId:crypto.randomUUID(),revision:task.revision},message:c.undone,done:()=>setLastChange(null)});
  }else{
   if(!data.phases.some(p=>p.id===change.phaseId)){setLastChange(null);setNotice(c.undoMissing);return;}
   void send({url:planApi,kind:'plan',body:workScheduleMutationSchema.parse({action:'phase_archive',actionId:crypto.randomUUID(),workId,revision:data.revision,phaseId:change.phaseId}),message:c.undone,done:()=>setLastChange(null)});
  }
 }
 function openCreate(kind:'task'|'phase'){if(!data||!canEdit||!idle)return;setError('');setNotice('');setCreateError('');setCreating({kind,id:crypto.randomUUID(),actionId:crypto.randomUUID(),planActionId:crypto.randomUUID(),assignActionId:crypto.randomUUID(),title:'',start:data.today,end:data.today,phaseId:'',assignee:'',dependsOn:''});}
 function submitCreate(event:FormEvent){
  event.preventDefault();if(!data||!creating||busy||warning||!canEdit)return;const draft=creating;setCreateError('');
  if(draft.kind==='phase'){
   const parsed=workScheduleMutationSchema.safeParse({action:'phase_save',actionId:draft.actionId,workId,revision:data.revision,phaseId:draft.id,title:draft.title,position:Math.min(999,Math.max(-1,...data.phases.map(p=>p.position))+1)});
   if(!parsed.success){setCreateError(c.createInvalid);return;}
   void send({url:planApi,body:parsed.data,kind:'plan',message:c.phaseCreated(draft.title.trim()),done:()=>{setCreating(null);setLastChange({kind:'phase',phaseId:draft.id,title:draft.title.trim()});}});return;
  }
  const input=workTimelineTaskCreateSchema.safeParse({action:'timeline_task_create',actionId:draft.actionId,workId,revision:data.revision,taskId:draft.id,title:draft.title,phaseId:draft.phaseId||null,plannedStart:draft.start,plannedEnd:draft.end});
  if(!input.success){setCreateError(c.createInvalid);return;}
  const predecessor=draft.dependsOn?data.tasks.find(t=>t.id===draft.dependsOn):undefined;
  if(predecessor?.plannedEnd&&draft.start<=predecessor.plannedEnd){setWarning({lines:[c.depPred(draft.title.trim(),predecessor.title)],proceed:()=>{setWarning(null);void runCreate(draft,input.data);},cancel:()=>setWarning(null)});return;}
  void runCreate(draft,input.data);
 }
 /** Create → optional assignment (/api/pro/team) → optional dependency (task_plan). Every step keeps its own
  *  actionId in the draft, so pressing Create again after an unconfirmed answer replays without duplicates. */
 async function runCreate(draft:Creating,first:WorkTimelineTaskCreate){
  if(lock.current)return;lock.current=true;setSaving(true);setError('');setNotice('');setConflict(false);setCreateError('');
  const post=(url:string,body:unknown)=>fetch(url,{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json','X-Pro-Expected-Actor':accountId},body:JSON.stringify(body)});
  try{
   let response=await post(planApi,first);
   if(response.status===409){setConflict(true);setError(c.conflict);return;}
   if(response.status>=400&&response.status<500){setCreateError(c.createInvalid);return;}
   if(!response.ok)throw Error();
   const result=await response.json() as {task?:{revision?:number};plan?:{revision?:number}};
   let partial=false;
   if(draft.assignee&&typeof result.task?.revision==='number'){response=await post(teamApi,{action:'assign',actionId:draft.assignActionId,workId,taskId:draft.id,revision:result.task.revision,assigneeGrantId:draft.assignee});if(response.status>=500)throw Error();partial||=!response.ok;}
   if(draft.dependsOn&&typeof result.plan?.revision==='number'){response=await post(planApi,{action:'task_plan',actionId:draft.planActionId,workId,revision:result.plan.revision,taskId:draft.id,phaseId:draft.phaseId||null,plannedStart:draft.start,plannedEnd:draft.end,dependsOn:[draft.dependsOn]});if(response.status>=500)throw Error();partial||=!response.ok;}
   if(!active.current)return;
   setCreating(null);setLastChange({kind:'task',taskId:draft.id,title:draft.title.trim()});setNotice(c.created(draft.title.trim()));if(partial)setError(c.partialCreate);
   setAssignToken(n=>n+1);announce();await load();
  }catch{if(active.current)setCreateError(c.createUncertain);}
  finally{lock.current=false;if(active.current)setSaving(false);}
 }

 if(loading&&!data)return <p role="status" className="text-sm text-[#52627a]">{c.loading}</p>;
 if(loadError&&!data)return <div role="alert" data-schedule-error className="space-y-2 rounded-2xl border border-[#d7e1ea] bg-white p-4"><p className="text-sm">{c.loadError}</p><Button type="button" variant="secondary" disabled={loading} onClick={()=>void load()}>{c.retry}</Button></div>;
 if(!data)return null;
 const visible=(t:GanttTask)=>matchesAssignee(t.id,assigned.map,filter);
 const scheduled=data.tasks.filter(t=>t.plannedStart&&t.plannedEnd),unscheduled=data.tasks.filter(t=>!t.plannedStart&&visible(t));
 const titles=new Map(data.tasks.map(t=>[t.id,t.title]));
 const empty=!scheduled.length&&!data.milestones.length&&!(canEdit&&data.phases.length);
 const filterOptions=[...new Set([...assigned.members.map(m=>m.grantId),...Object.values(assigned.map).filter((v):v is string=>!!v)])].map(id=>({id,name:assigned.names[id]||c.teamMember})).sort((a,b)=>a.name.localeCompare(b.name));
 const edit:EditApi={editable:canEdit,preview,onEdit:editDates,helpId:'gantt-help-'+workId};
 const blockedChart=!idle;
 const undoText=lastChange?(lastChange.kind==='dates'?c.moved(lastChange.title,fmt(lastChange.prevStart,en),fmt(lastChange.prevEnd,en)):lastChange.title):'';
 return <section ref={sectionRef} data-project-schedule data-gantt-editable={canEdit?'true':'false'} data-gantt-busy={busy?'true':'false'} className="min-w-0 max-w-full space-y-4">
  <header className="space-y-1"><h3 className="text-lg font-bold text-[#162543]">{c.title}{!canEdit&&<span data-gantt-read-only className="ml-2 inline-flex rounded-full bg-[#eef2f6] px-2 py-0.5 align-middle text-xs font-semibold text-[#52627a]">{c.readOnly}</span>}</h3><p className="text-sm text-[#52627a]">{canEdit?c.intro:c.introReadOnly}</p></header>
  <div className="grid min-w-0 gap-3 sm:grid-cols-2">
   <div data-schedule-period className="rounded-2xl border border-[#d7e1ea] bg-white p-3 text-sm"><p className="text-xs font-semibold uppercase tracking-wide text-[#52627a]">{c.period}</p><p className="mt-1 font-semibold text-[#162543]">{data.plannedStart&&data.plannedEnd?`${fmt(data.plannedStart,en)} – ${fmt(data.plannedEnd,en)}`:c.noPeriod}</p>{data.plannedStart&&data.plannedEnd&&<p className="text-[#52627a]">{c.duration(dayDiff(data.plannedStart,data.plannedEnd)+1)}</p>}</div>
   <div data-schedule-baseline className="rounded-2xl border border-[#d7e1ea] bg-white p-3 text-sm"><p className="text-xs font-semibold uppercase tracking-wide text-[#52627a]">{c.baseline}</p>{data.baseline?<><p className="mt-1 break-words text-[#162543]">{c.comparing(data.baseline.title,new Date(data.baseline.capturedAt).toLocaleDateString(en?'en-US':'es-CR',{timeZone:'America/Costa_Rica',dateStyle:'medium'}))}</p><p className="mt-1 flex flex-wrap items-center gap-2"><span className="text-[#52627a]">{c.projectVariance}:</span><VarianceBadge days={data.endVarianceDays} c={c}/></p></>:<p className="mt-1 text-[#52627a]">{c.noBaseline}</p>}</div>
  </div>
  <div className="flex min-w-0 flex-wrap items-center gap-2">
   <div role="group" aria-label={c.viewLabel} className="inline-grid grid-cols-2 gap-1 rounded-2xl bg-[#e9eff5] p-1">{(['gantt','list'] as const).map(value=><button key={value} type="button" data-schedule-mode={value} aria-pressed={mode===value} onClick={()=>setMode(value)} className={`min-h-11 rounded-xl px-4 text-sm font-semibold ${mode===value?'bg-white text-[#008bb5] shadow-sm':'text-[#52627a]'}`}>{c[value]}</button>)}</div>
   {mode==='gantt'&&!empty&&<div role="group" aria-label={c.scaleLabel} className="inline-grid grid-cols-3 gap-1 rounded-2xl bg-[#e9eff5] p-1">{(['day','week','month'] as const).map(value=><button key={value} type="button" data-schedule-scale={value} aria-pressed={scale===value} onClick={()=>setScale(value)} className={`min-h-11 rounded-xl px-3 text-sm font-semibold ${scale===value?'bg-white text-[#008bb5] shadow-sm':'text-[#52627a]'}`}>{c[value]}</button>)}</div>}
   {mode==='gantt'&&!empty&&<Button type="button" variant="secondary" className="min-h-11" onClick={scrollToday}>{c.today}</Button>}
   {canEdit&&<Button type="button" data-schedule-baseline-open data-pro-write="work.write" className="min-h-11 sm:ml-auto" disabled={!idle||empty||!scheduled.length&&!data.milestones.length} onClick={()=>{setBaselineDraft(c.baselineDefault(fmt(data.today,en)));setError('');setNotice('');}}>{c.saveBaseline}</Button>}
  </div>
  {/* Gap 13: editing toolbar (create, undo) and the assignee filter. */}
  <div data-gantt-toolbar className="flex min-w-0 flex-wrap items-end gap-2">
   {canEdit&&<><Button type="button" data-gantt-new="task" data-pro-write="work.write" className="min-h-11" disabled={!idle} onClick={()=>openCreate('task')}>{c.newTask}</Button>
    <Button type="button" data-gantt-new="phase" data-pro-write="work.write" variant="secondary" className="min-h-11" disabled={!idle} onClick={()=>openCreate('phase')}>{c.newPhase}</Button>
    <Button type="button" data-gantt-undo data-pro-write="work.write" variant="secondary" className="min-h-11" disabled={!lastChange||!idle} aria-label={lastChange?c.undoLabel(undoText):c.undo} title={lastChange?c.undoLabel(undoText):undefined} onClick={undo}>{c.undo}</Button></>}
   {!!data.tasks.length&&<label className="block min-w-0 text-sm font-semibold sm:ml-auto">{c.filter}<select data-gantt-assignee-filter value={filter} onChange={event=>setFilter(event.target.value)} className={field+' sm:min-w-[12rem]'}><option value="">{c.everyone}</option><option value={UNASSIGNED}>{c.unassigned}</option>{filterOptions.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select></label>}
  </div>
  <p data-schedule-share className="flex flex-wrap items-center gap-2 text-sm text-[#52627a]"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${data.showSchedule?'bg-[#eaf5fb] text-[#006e90]':'bg-[#eef2f6] text-[#52627a]'}`}>{data.showSchedule?c.shared:c.notShared}</span>{canEdit&&<button type="button" data-pro-write="work.write" disabled={dirty||busy} onClick={()=>pushProParams({vistaTrabajo:'client'})} className="min-h-11 font-semibold text-[#008bb5] underline-offset-2 hover:underline disabled:opacity-50">{c.configureShare}</button>}</p>
  {notice&&<p role="status" data-gantt-notice className="text-sm text-[#175b42]">{notice}</p>}
  {error&&<div role="alert" data-gantt-error className="space-y-2 rounded-xl border border-[#f1c9bd] bg-[#fff7f4] p-3 text-sm text-[#7a2e16]"><p>{error}</p>{uncertain&&<Button type="button" disabled={saving} onClick={()=>void send()}>{c.retrySame}</Button>}{conflict&&<Button type="button" data-gantt-reload variant="secondary" onClick={()=>{setConflict(false);setError('');setEditor(null);setBaselineDraft(null);setPreview(null);setWarning(null);void load();}}>{c.reload}</Button>}</div>}
  {warning&&<div role="alertdialog" aria-labelledby={'gantt-dep-'+workId} data-gantt-dependency-warning className="space-y-2 rounded-xl border border-[#f0b37e] bg-[#fff8f1] p-3 text-sm text-[#7a3a06]"><p id={'gantt-dep-'+workId} className="font-semibold">{c.depTitle}</p>{warning.lines.map((line,i)=><p key={i} className="break-words">{line}</p>)}<div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="secondary" autoFocus data-gantt-dependency-cancel onClick={warning.cancel}>{creating?c.depCreateCancel:c.depCancel}</Button><Button type="button" data-gantt-dependency-confirm onClick={warning.proceed}>{c.depConfirm}</Button></div></div>}
  {creating&&<CreateForm draft={creating} data={data} c={c} busy={busy||!!warning} saving={saving} members={assigned.members} error={createError} onChange={setCreating} onSubmit={submitCreate} onCancel={()=>{setCreating(null);setCreateError('');}}/>}
  {baselineDraft!==null&&<form data-schedule-baseline-form onSubmit={submitBaseline} className="space-y-3 rounded-2xl border border-[#0089bb] bg-[#f7fbfd] p-4">
   <label className="block text-sm font-semibold">{c.baselineTitle}<input autoFocus required maxLength={120} value={baselineDraft} disabled={busy} onChange={e=>setBaselineDraft(e.target.value)} className={field}/></label>
   <p className="text-sm text-[#52627a]">{c.baselineHelp}</p>
   <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="secondary" disabled={busy} onClick={()=>setBaselineDraft(null)}>{c.cancel}</Button><Button type="submit" disabled={busy||!baselineDraft.trim()}>{saving?c.saving:c.confirmBaseline}</Button></div>
  </form>}
  {editor&&<EditorForm editor={editor} data={data} c={c} en={en} busy={busy} saving={saving} titles={titles} onChange={setEditor} onSubmit={submitEditor} onCancel={()=>{setEditor(null);setError('');}}/>}
  {mode==='gantt'&&canEdit&&!empty&&<p id={edit.helpId} data-gantt-help className="text-xs text-[#52627a]">{c.help}</p>}
  {empty?<div data-schedule-empty className="space-y-2 rounded-2xl border border-dashed border-[#c9d6e2] bg-[#f7f9fc] p-5 text-sm"><p className="font-semibold text-[#162543]">{c.emptyTitle}</p><p className="text-[#52627a]">{c.empty}</p><Button type="button" variant="secondary" disabled={dirty||busy} onClick={()=>pushProParams({vistaTrabajo:'tasks',vistaTareas:'plan'})}>{c.openPlan}</Button></div>
   :mode==='gantt'?<GanttChart data={data} scale={scale} c={c} en={en} disabled={blockedChart} critical={critical} visible={visible} filtered={!!filter} edit={edit} onTask={canEdit?openTask:undefined} onMilestone={canEdit?openMilestone:undefined}/>
   :<ScheduleList data={data} c={c} en={en} disabled={blockedChart} titles={titles} visible={visible} onTask={canEdit?openTask:undefined} onMilestone={canEdit?openMilestone:undefined}/>}
  {!!unscheduled.length&&<section data-schedule-unscheduled className="space-y-2 rounded-2xl border border-[#d7e1ea] bg-white p-4"><h4 className="font-semibold text-[#162543]">{c.unscheduled} ({unscheduled.length})</h4><ul className="divide-y divide-[#eef2f6]">{unscheduled.map(task=><li key={task.id} className="flex min-w-0 flex-wrap items-center justify-between gap-2 py-2"><span className="min-w-0 break-words text-sm">{task.title}{task.status==='done'&&<span className="ml-2 text-xs text-[#18573a]">{c.done}</span>}</span>{canEdit&&<Button type="button" data-pro-write="work.write" variant="secondary" size="sm" className="min-h-11" disabled={!idle} onClick={()=>openTask(task)}>{c.schedule}</Button>}</li>)}</ul></section>}
  {data.baselines.length>1&&<details className="rounded-2xl border border-[#d7e1ea] bg-white p-3 text-sm"><summary className="min-h-11 cursor-pointer py-2 font-semibold">{c.history} ({data.baselines.length})</summary><ol className="mt-2 space-y-1">{data.baselines.map(b=><li key={b.id} className="break-words text-[#52627a]"><span className="font-semibold text-[#162543]">{b.title}</span> · {new Date(b.capturedAt).toLocaleString(en?'en-US':'es-CR',{timeZone:'America/Costa_Rica',dateStyle:'medium',timeStyle:'short'})}</li>)}</ol></details>}
 </section>;
}
function isEditorDirty(editor:Editor){return editor.kind==='task'?editor.start!==(editor.task.plannedStart??'')||editor.end!==(editor.task.plannedEnd??'')||editor.phaseId!==(editor.task.phaseId??''):editor.title!==editor.milestone.title||editor.date!==editor.milestone.date;}

/** Gap 13: small inline form to create a task (title, dates, optional phase/assignee/dependency) or a phase. */
function CreateForm({draft,data,c,busy,saving,members,error,onChange,onSubmit,onCancel}:{draft:Creating;data:Gantt;c:Copy;busy:boolean;saving:boolean;members:Member[];error:string;onChange:(d:Creating)=>void;onSubmit:(e:FormEvent)=>void;onCancel:()=>void}){
 const ref=useRef<HTMLFormElement|null>(null);
 useEffect(()=>{ref.current?.scrollIntoView({block:'nearest'});ref.current?.querySelector<HTMLInputElement>('input')?.focus();},[]);
 const task=draft.kind==='task',valid=!!draft.title.trim()&&(!task||!!draft.start&&!!draft.end&&draft.start<=draft.end);
 const predecessors=data.tasks.filter(t=>t.plannedStart&&t.plannedEnd);
 return <form ref={ref} data-gantt-create={draft.kind} data-pro-write="work.write" aria-label={task?c.createTask:c.createPhase} onSubmit={onSubmit} className="space-y-3 rounded-2xl border border-[#0089bb] bg-[#f7fbfd] p-4">
  <h4 className="font-semibold text-[#162543]">{task?c.createTask:c.createPhase}</h4>
  <fieldset disabled={busy} className={`grid min-w-0 gap-3 ${task?'sm:grid-cols-2 lg:grid-cols-3':''}`}>
   <label className="block min-w-0 text-sm font-semibold">{task?c.taskName:c.phaseName}<input data-gantt-create-field="title" required maxLength={160} value={draft.title} onChange={e=>onChange({...draft,title:e.target.value})} className={field}/></label>
   {task&&<>
    <label className="block min-w-0 text-sm font-semibold">{c.start}<input data-gantt-create-field="start" type="date" required min="1900-01-01" max="2100-12-31" value={draft.start} onChange={e=>onChange({...draft,start:e.target.value,end:draft.end&&draft.end<e.target.value?e.target.value:draft.end})} className={field}/></label>
    <label className="block min-w-0 text-sm font-semibold">{c.end}<input data-gantt-create-field="end" type="date" required min={draft.start||'1900-01-01'} max="2100-12-31" value={draft.end} onChange={e=>onChange({...draft,end:e.target.value})} className={field}/></label>
    <label className="block min-w-0 text-sm font-semibold">{c.phase}<select data-gantt-create-field="phase" value={draft.phaseId} onChange={e=>onChange({...draft,phaseId:e.target.value})} className={field}><option value="">{c.noPhase}</option>{data.phases.map(p=><option key={p.id} value={p.id}>{p.title}</option>)}</select></label>
    <label className="block min-w-0 text-sm font-semibold">{c.assignee}<select data-gantt-create-field="assignee" value={draft.assignee} onChange={e=>onChange({...draft,assignee:e.target.value})} className={field}><option value="">{c.noAssignee}</option>{members.filter(m=>m.canAssign).map(m=><option key={m.grantId} value={m.grantId}>{m.name||c.teamMember}</option>)}</select></label>
    <label className="block min-w-0 text-sm font-semibold">{c.dependsOn}<select data-gantt-create-field="dependency" value={draft.dependsOn} onChange={e=>onChange({...draft,dependsOn:e.target.value})} className={field}><option value="">{c.noDependency}</option>{predecessors.map(t=><option key={t.id} value={t.id}>{t.title}</option>)}</select></label>
   </>}
  </fieldset>
  {!task&&<p className="text-sm text-[#52627a]">{c.phaseHelp}</p>}
  {task&&draft.start&&draft.end&&draft.end<draft.start&&<p className="text-sm text-[#7a2e16]">{c.invalidPeriod}</p>}
  {error&&<p role="alert" data-gantt-create-error className="text-sm text-[#7a2e16]">{error}</p>}
  <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="secondary" disabled={saving} onClick={onCancel}>{c.cancel}</Button><Button type="submit" data-gantt-create-submit disabled={busy||!valid}>{saving?c.saving:c.create}</Button></div>
 </form>;
}

function EditorForm({editor,data,c,en,busy,saving,titles,onChange,onSubmit,onCancel}:{editor:Editor;data:Gantt;c:Copy;en:boolean;busy:boolean;saving:boolean;titles:Map<string,string>;onChange:(e:Editor)=>void;onSubmit:(e:FormEvent)=>void;onCancel:()=>void}){
 const ref=useRef<HTMLFormElement|null>(null);
 useEffect(()=>{ref.current?.scrollIntoView({block:'nearest'});ref.current?.querySelector<HTMLInputElement>('input')?.focus();},[]);
 if(editor.kind==='task'){
  const valid=!!editor.start&&!!editor.end&&editor.end>=editor.start,t=editor.task;
  return <form ref={ref} data-schedule-editor="task" aria-label={c.taskForm(t.title)} onSubmit={onSubmit} className="space-y-3 rounded-2xl border border-[#0089bb] bg-[#f7fbfd] p-4">
   <h4 className="break-words font-semibold text-[#162543]">{c.taskForm(t.title)}</h4>
   <fieldset disabled={busy} className="grid min-w-0 gap-3 sm:grid-cols-3">
    <label className="block min-w-0 text-sm font-semibold">{c.start}<input data-schedule-field="start" type="date" required min="1900-01-01" max="2100-12-31" value={editor.start} onChange={e=>onChange({...editor,start:e.target.value})} className={field}/></label>
    <label className="block min-w-0 text-sm font-semibold">{c.end}<input data-schedule-field="end" type="date" required min="1900-01-01" max="2100-12-31" value={editor.end} onChange={e=>onChange({...editor,end:e.target.value})} className={field}/></label>
    <label className="block min-w-0 text-sm font-semibold">{c.phase}<select data-schedule-field="phase" value={editor.phaseId} onChange={e=>onChange({...editor,phaseId:e.target.value})} className={field}><option value="">{c.noPhase}</option>{data.phases.map(p=><option key={p.id} value={p.id}>{p.title}</option>)}</select></label>
   </fieldset>
   <p className="text-sm text-[#52627a]">{valid?c.duration(dayDiff(editor.start,editor.end)+1):c.invalidPeriod}{t.baselineStart&&t.baselineEnd&&<> · {c.baselineWas(fmt(t.baselineStart,en),fmt(t.baselineEnd,en))}{valid&&<> · <VarianceBadge days={dayDiff(t.baselineEnd,editor.end)} c={c}/></>}</>}</p>
   <p className="text-sm"><span className="font-semibold">{c.predecessors}: </span>{t.dependsOn.length?t.dependsOn.map(id=>titles.get(id)??'—').join(', '):c.none}<span className="block text-xs text-[#52627a]">{c.predecessorsHelp}</span></p>
   <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="secondary" disabled={busy} onClick={onCancel}>{c.cancel}</Button><Button type="submit" disabled={busy||!valid||!isEditorDirty(editor)}>{saving?c.saving:c.saveDates}</Button></div>
  </form>;
 }
 const m=editor.milestone;
 return <form ref={ref} data-schedule-editor="milestone" aria-label={c.milestoneForm(m.title)} onSubmit={onSubmit} className="space-y-3 rounded-2xl border border-[#0089bb] bg-[#f7fbfd] p-4">
  <h4 className="break-words font-semibold text-[#162543]">{c.milestoneForm(m.title)}</h4>
  <fieldset disabled={busy} className="grid min-w-0 gap-3 sm:grid-cols-2">
   <label className="block min-w-0 text-sm font-semibold">{c.name}<input required maxLength={160} value={editor.title} onChange={e=>onChange({...editor,title:e.target.value})} className={field}/></label>
   <label className="block min-w-0 text-sm font-semibold">{c.date}<input data-schedule-field="date" type="date" required min="1900-01-01" max="2100-12-31" value={editor.date} onChange={e=>onChange({...editor,date:e.target.value})} className={field}/></label>
  </fieldset>
  {m.baselineDate&&<p className="text-sm text-[#52627a]">{c.baselineDay(fmt(m.baselineDate,en))}{editor.date&&<> · <VarianceBadge days={dayDiff(m.baselineDate,editor.date)} c={c}/></>}</p>}
  <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="secondary" disabled={busy} onClick={onCancel}>{c.cancel}</Button><Button type="submit" disabled={busy||!editor.title.trim()||!editor.date||!isEditorDirty(editor)}>{saving?c.saving:c.saveDates}</Button></div>
 </form>;
}

/** Shown period of a task: live drag, then the pending/optimistic preview, then the saved plan. */
function shownPeriod(t:GanttTask,preview:Preview|null){return preview&&preview.taskId===t.id?{start:preview.start,end:preview.end}:{start:t.plannedStart!,end:t.plannedEnd!};}
function buildRows(data:Gantt,c:Copy,visible:(t:GanttTask)=>boolean,filtered:boolean,showEmptyPhases:boolean):Row[]{
 const rows:Row[]=[],scheduled=data.tasks.filter(t=>t.plannedStart&&t.plannedEnd&&visible(t)),phaseIds=new Set(data.phases.map(p=>p.id));
 const byStart=(a:GanttTask,b:GanttTask)=>a.plannedStart!.localeCompare(b.plannedStart!)||a.plannedEnd!.localeCompare(b.plannedEnd!)||a.title.localeCompare(b.title);
 for(const phase of data.phases){const tasks=scheduled.filter(t=>t.phaseId===phase.id).sort(byStart);if(!tasks.length&&(filtered||!phase.plannedStart&&!showEmptyPhases))continue;rows.push({kind:'phase',phase});for(const task of tasks)rows.push({kind:'task',task});}
 const loose=scheduled.filter(t=>!t.phaseId||!phaseIds.has(t.phaseId)).sort(byStart);
 if(loose.length){if(rows.length)rows.push({kind:'group',label:c.noPhase});for(const task of loose)rows.push({kind:'task',task});}
 if(data.milestones.length&&!filtered){rows.push({kind:'milestoneGroup'});for(const milestone of data.milestones)rows.push({kind:'milestone',milestone});}
 return rows;
}
function startOf(value:string,scale:Scale){if(scale==='day')return addDays(value,-2);if(scale==='week'){const w=(weekday(value)+6)%7;return addDays(value,-w-7);}return value.slice(0,8)+'01';}
function endOf(value:string,scale:Scale){if(scale==='day')return addDays(value,3);if(scale==='week'){const w=(weekday(value)+6)%7;return addDays(value,13-w);}const d=new Date(value.slice(0,8)+'01T00:00:00Z');d.setUTCMonth(d.getUTCMonth()+2);d.setUTCDate(0);return d.toISOString().slice(0,10);}

/** Centers a grid x position in the part of the region not covered by the sticky name column. */
function todayScroll(box:HTMLElement,gridX:number){const label=box.querySelector<HTMLElement>('[data-schedule-label-col]')?.offsetWidth??0;return Math.max(0,gridX+label/2-box.clientWidth/2);}
type Drag={id:string;mode:GanttEditMode;pointer:number;originX:number;delta:number};
type BarApi={drag:Drag|null;down:(e:ReactPointerEvent<HTMLElement>,t:GanttTask,mode:GanttEditMode)=>void;move:(e:ReactPointerEvent<HTMLElement>)=>void;up:(e:ReactPointerEvent<HTMLElement>,t:GanttTask,cancelled?:boolean)=>void;key:(e:ReactKeyboardEvent<HTMLElement>,t:GanttTask)=>void;click:(t:GanttTask)=>void};
function GanttChart({data,scale,c,en,disabled,critical,visible,filtered,edit,onTask,onMilestone}:{data:Gantt;scale:Scale;c:Copy;en:boolean;disabled:boolean;critical:Set<string>;visible:(t:GanttTask)=>boolean;filtered:boolean;edit:EditApi;onTask?:(t:GanttTask)=>void;onMilestone?:(m:GanttMilestone)=>void}){
 const rows=useMemo(()=>buildRows(data,c,visible,filtered,edit.editable),[data,c,visible,filtered,edit.editable]);
 const preview=edit.preview;
 const range=useMemo(()=>{const days:string[]=[data.today];for(const t of data.tasks){for(const v of [t.plannedStart,t.plannedEnd,t.baselineStart,t.baselineEnd,t.plannedStart&&t.plannedEnd?t.dueDate:null])if(v)days.push(v);}if(preview)days.push(preview.start,preview.end);for(const m of data.milestones){days.push(m.date);if(m.baselineDate)days.push(m.baselineDate);}days.sort();const from=startOf(days[0],scale);let to=endOf(days[days.length-1],scale);if(dayDiff(from,to)>3660)to=addDays(from,3660);return{from,to,days:dayDiff(from,to)+1};},[data,scale,preview]);
 const w=dayWidth[scale],gridWidth=range.days*w,x=(day:string)=>dayDiff(range.from,day)*w,labelWidth='clamp(9rem,32vw,15rem)';
 const ticks=useMemo(()=>{const out:{day:string;label:string;major:boolean;weekend:boolean}[]=[];for(let i=0;i<range.days;i++){const day=addDays(range.from,i),wd=weekday(day),first=day.endsWith('-01');if(scale==='day')out.push({day,label:day.slice(8),major:wd===1,weekend:wd===0||wd===6});else if(scale==='week'){if(wd===1)out.push({day,label:fmt(day,en,{day:'numeric',month:'short'}),major:true,weekend:false});}else if(first)out.push({day,label:fmt(day,en,{month:'short'}),major:true,weekend:false});}return out;},[range,scale,en]);
 const bands=useMemo(()=>{const out:{day:string;label:string}[]=[];for(let i=0;i<range.days;i++){const day=addDays(range.from,i);if(i===0||(scale==='month'?day.endsWith('-01-01'):day.endsWith('-01')))out.push({day,label:scale==='month'?day.slice(0,4):upperFirst(fmt(day,en,{month:'long',year:'numeric'}))});}return out;},[range,scale,en]);
 // Gap 13: pointer drag (mouse, pen and touch) of a bar or one of its edges; whole days only.
 const [drag,setDrag]=useState<Drag|null>(null),suppress=useRef(false);
 const shown=(t:GanttTask)=>drag&&drag.id===t.id&&drag.delta!==0?shiftPeriod(t.plannedStart!,t.plannedEnd!,drag.mode,drag.delta):shownPeriod(t,preview);
 const bar:BarApi={drag,
  down(e,t,mode){if(!edit.editable||disabled||e.button!==0||!t.plannedStart)return;e.stopPropagation();if(e.pointerType==='mouse')e.preventDefault();try{e.currentTarget.setPointerCapture(e.pointerId);}catch{}suppress.current=false;setDrag({id:t.id,mode,pointer:e.pointerId,originX:e.clientX,delta:0});},
  move(e){if(!drag||e.pointerId!==drag.pointer)return;const delta=daysFromPixels(e.clientX-drag.originX,w);if(delta!==drag.delta)setDrag({...drag,delta});},
  up(e,t,cancelled=false){if(!drag||e.pointerId!==drag.pointer)return;const current=drag;setDrag(null);if(cancelled||current.delta===0||current.id!==t.id)return;suppress.current=true;setTimeout(()=>{suppress.current=false;},0);edit.onEdit(t,current.mode,current.delta);},
  key(e,t){const k=keyEdit(e.key,e);if(!k||!edit.editable)return;e.preventDefault();e.stopPropagation();if(disabled)return;edit.onEdit(t,k.mode,k.delta);},
  click(t){if(suppress.current){suppress.current=false;return;}if(!disabled)onTask?.(t);},
 };
 const rowIndex=new Map<string,number>();rows.forEach((row,i)=>{if(row.kind==='task')rowIndex.set(row.task.id,i);});
 const taskById=new Map(data.tasks.map(t=>[t.id,t]));
 const arrows:{key:string;d:string;conflict:boolean}[]=[];
 rows.forEach((row,i)=>{if(row.kind!=='task')return;const own=shown(row.task);for(const pred of row.task.dependsOn){const j=rowIndex.get(pred),p=taskById.get(pred);if(j===undefined||!p?.plannedEnd)continue;const pEnd=shown(p).end,x1=x(addDays(pEnd,1)),y1=j*rowHeight+rowHeight/2,x2=x(own.start),y2=i*rowHeight+rowHeight/2,conflict=own.start<=pEnd;const mid=Math.max(x1+6,Math.min(x2-6,x1+6));arrows.push({key:pred+'>'+row.task.id,conflict,d:x2>=x1+12?`M${x1} ${y1} H${mid} V${y2} H${x2-1}`:`M${x1} ${y1} h6 V${y2-rowHeight/2+4} H${x2-8} V${y2} H${x2-1}`});}});
 const todayX=x(data.today)+w/2,todayIn=data.today>=range.from&&data.today<=range.to;
 const initial=useRef(''),scroller=useRef<HTMLDivElement|null>(null);
 useEffect(()=>{const key=scale+range.from;if(initial.current===key)return;initial.current=key;const box=scroller.current;if(box&&todayIn)box.scrollLeft=todayScroll(box,todayX);},[scale,range.from,todayIn,todayX,scroller]);
 return <div data-schedule-gantt data-scale={scale} ref={scroller} role="region" aria-label={c.gridLabel} tabIndex={0} onKeyDown={event=>{if(event.target!==event.currentTarget)return;if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();event.currentTarget.scrollBy({left:(event.key==='ArrowLeft'?-1:1)*Math.max(w*7,96)});}}} className="max-h-[70dvh] max-w-full overflow-auto overscroll-contain rounded-2xl border border-[#d7e1ea] bg-white focus-visible:outline-2 focus-visible:outline-[#009fc7]">
  <div className="relative" style={{width:`calc(${labelWidth} + ${gridWidth}px)`,minWidth:'100%'}}>
   <div className="sticky top-0 z-30 flex border-b border-[#d7e1ea] bg-[#f7f9fc]" style={{height:headerHeight}}>
    <div data-schedule-label-col className="sticky left-0 z-40 shrink-0 border-r border-[#d7e1ea] bg-[#f7f9fc]" style={{width:labelWidth}}/>
    <div aria-hidden="true" className="relative shrink-0" style={{width:gridWidth}}>
     {bands.map(b=><span key={b.day} className="absolute top-1 whitespace-nowrap px-1.5 text-xs font-semibold text-[#162543]" style={{left:x(b.day)}}>{b.label}</span>)}
     {todayIn&&<span data-schedule-today-label className="absolute top-[22px] z-10 whitespace-nowrap rounded bg-[#ff7c0a] px-1.5 text-[11px] font-semibold leading-4 text-white" style={{left:todayX+3}}>{c.todayMarker}</span>}
     {ticks.map(t=><span key={t.day} className={`absolute bottom-1 text-center text-[11px] ${t.weekend?'text-[#8a96a8]':'text-[#52627a]'}`} style={scale==='day'?{left:x(t.day),width:w}:{left:x(t.day)+3}}>{t.label}</span>)}
    </div>
   </div>
   <div className="relative">
    {/* Grid background, weekends and today line. */}
    <div aria-hidden="true" className="pointer-events-none absolute inset-y-0" style={{left:labelWidth,width:gridWidth}}>
     {ticks.map(t=><span key={t.day} className={`absolute inset-y-0 border-l ${t.major?'border-[#e3eaf1]':'border-[#f1f4f8]'} ${t.weekend?'bg-[#fafbfd]':''}`} style={{left:x(t.day),width:scale==='day'?w:undefined}}/>)}
     {todayIn&&<span data-schedule-today className="absolute inset-y-0 z-10 w-0.5 bg-[#ff7c0a]" style={{left:todayX}}/>}
     <svg className="absolute left-0 top-0 z-[5] overflow-visible" width={gridWidth} height={rows.length*rowHeight} aria-hidden="true"><defs><marker id="schedule-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0 L8 4 L0 8 z" fill="#68778d"/></marker><marker id="schedule-arrow-bad" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0 L8 4 L0 8 z" fill="#c2410c"/></marker></defs>{arrows.map(a=><path key={a.key} data-schedule-dependency={a.conflict?'conflict':'ok'} d={a.d} fill="none" stroke={a.conflict?'#c2410c':'#68778d'} strokeWidth="1.5" strokeDasharray={a.conflict?'4 3':undefined} markerEnd={`url(#${a.conflict?'schedule-arrow-bad':'schedule-arrow'})`}/>)}</svg>
    </div>
    {rows.map((row,i)=><GanttRow key={row.kind==='task'?row.task.id:row.kind==='phase'?row.phase.id:row.kind==='milestone'?row.milestone.id:row.kind+i} row={row} c={c} en={en} x={x} w={w} labelWidth={labelWidth} gridWidth={gridWidth} today={data.today} disabled={disabled} critical={critical} taskById={taskById} edit={edit} bar={bar} shown={shown} onTask={onTask} onMilestone={onMilestone}/>)}
    {/* Fix 14: the «Hoy» line is drawn above the bars, so a task that spans today no longer hides it (labels stay above it). */}
    {todayIn&&<div aria-hidden="true" className="pointer-events-none absolute inset-y-0 z-[15]" style={{left:labelWidth,width:gridWidth}}><span data-schedule-today-overlay className="absolute inset-y-0 w-0.5 bg-[#ff7c0a] opacity-90 shadow-[0_0_0_1px_rgba(255,255,255,0.7)]" style={{left:todayX}}/></div>}
   </div>
  </div>
 </div>;
}

function GanttRow({row,c,en,x,w,labelWidth,gridWidth,today,disabled,critical,taskById,edit,bar,shown,onTask,onMilestone}:{row:Row;c:Copy;en:boolean;x:(d:string)=>number;w:number;labelWidth:string;gridWidth:number;today:string;disabled:boolean;critical:Set<string>;taskById:Map<string,GanttTask>;edit:EditApi;bar:BarApi;shown:(t:GanttTask)=>{start:string;end:string};onTask?:(t:GanttTask)=>void;onMilestone?:(m:GanttMilestone)=>void}){
 const label='sticky left-0 z-20 flex shrink-0 items-center gap-2 border-r border-[#d7e1ea] bg-white px-3';
 const shell=(content:ReactNode,barNode:ReactNode,extra='')=><div className={`flex border-b border-[#eef2f6] ${extra}`} style={{height:rowHeight}}><div className={label} style={{width:labelWidth}}>{content}</div><div className="relative shrink-0" style={{width:gridWidth}}>{barNode}</div></div>;
 if(row.kind==='group'||row.kind==='milestoneGroup')return shell(<span className="truncate text-xs font-bold uppercase tracking-wide text-[#52627a]">{row.kind==='group'?row.label:c.milestones}</span>,null,'bg-[#f7f9fc]');
 if(row.kind==='phase'){const p=row.phase;return shell(<><span data-gantt-phase-label={p.id} className="min-w-0 flex-1 truncate text-sm font-bold text-[#162543]" title={p.title}>{p.title}</span><VarianceBadge days={p.endVarianceDays} c={c} compact/></>,p.plannedStart&&p.plannedEnd?<>
  {p.baselineStart&&p.baselineEnd&&<span aria-hidden="true" className="absolute bottom-1.5 h-1.5 rounded-full bg-[#c3ccd8]" style={{left:x(p.baselineStart),width:(dayDiff(p.baselineStart,p.baselineEnd)+1)*w}}/>}
  <span data-schedule-phase-bar={p.id} title={`${p.title}: ${fmt(p.plannedStart,en)} – ${fmt(p.plannedEnd,en)} · ${c.progress(p.doneCount,p.taskCount)}`} className="absolute top-3 h-4 overflow-hidden rounded-md bg-[#162543]" style={{left:x(p.plannedStart),width:Math.max(w,(dayDiff(p.plannedStart,p.plannedEnd)+1)*w)}}><span className="block h-full bg-[#3aa776]" style={{width:p.taskCount?`${Math.round(p.doneCount/p.taskCount*100)}%`:0}}/></span></>:null,'bg-[#f7f9fc]');}
 if(row.kind==='milestone'){const m=row.milestone,text=c.milestoneBar(m.title,fmt(m.date,en));return shell(<>{onMilestone?<button type="button" disabled={disabled} onClick={()=>onMilestone(m)} aria-label={c.edit+': '+text} className="min-h-11 min-w-0 flex-1 truncate text-left text-sm text-[#162543] hover:text-[#008bb5] disabled:opacity-60" title={m.title}>{m.title}</button>:<span className="min-w-0 flex-1 truncate text-sm text-[#162543]" title={m.title}>{m.title}</span>}<VarianceBadge days={m.varianceDays} c={c} compact/></>,<>
  {m.baselineDate&&m.baselineDate!==m.date&&<span aria-hidden="true" className="absolute top-[15px] h-3.5 w-3.5 rotate-45 border-2 border-[#c3ccd8] bg-white" style={{left:x(m.baselineDate)+w/2-7}}/>}
  {onMilestone?<button type="button" tabIndex={-1} data-schedule-milestone={m.id} disabled={disabled} onClick={()=>onMilestone(m)} aria-label={text} title={text} className="absolute !min-h-0 !min-w-0 top-[13px] h-[18px] w-[18px] rotate-45 rounded-sm bg-[#ff7c0a] shadow-sm disabled:cursor-default" style={{left:x(m.date)+w/2-9}}/>
   :<span role="img" data-schedule-milestone={m.id} aria-label={text} title={text} className="absolute top-[13px] h-[18px] w-[18px] rotate-45 rounded-sm bg-[#ff7c0a] shadow-sm" style={{left:x(m.date)+w/2-9}}/>}
  <span aria-hidden="true" className="pointer-events-none absolute top-3 whitespace-nowrap text-xs font-semibold text-[#7a3a06]" style={{left:x(m.date)+w/2+14}}>{fmt(m.date,en,{day:'numeric',month:'short'})}</span></>);}
 const t=row.task,{start,end}=shown(t),overdue=isOverdue(t,today),status=t.status==='done'?c.done:overdue?c.overdue:c.open,late=lateForDeadline(t);
 const conflict=t.dependsOn.some(id=>{const p=taskById.get(id);return !!p?.plannedEnd&&start<=shown(p).end;});
 const text=c.taskBar(t.title,fmt(start,en),fmt(end,en),status)+(t.endVarianceDays!==null?', '+(t.endVarianceDays>0?c.late(t.endVarianceDays):t.endVarianceDays<0?c.early(-t.endVarianceDays):c.onTime):'')+(t.dueDate?', '+c.deadline(fmt(t.dueDate,en))+(late?', '+c.afterDeadline:''):'')+(conflict?', '+c.conflictDep:'');
 const width=(dayDiff(start,end)+1)*w,dragging=bar.drag?.id===t.id&&bar.drag.delta!==0,editable=edit.editable&&!!onTask,handles=editable&&width>=24;
 const barClass=`absolute !min-h-0 !min-w-0 top-2 flex h-6 items-center overflow-hidden rounded-lg px-2 text-left text-xs font-semibold text-white shadow-sm ${critical.has(t.id)?'ring-2 ring-[#b42318] ring-offset-1 ':''}${dragging?'opacity-80 ring-2 ring-[#162543] ':''}${t.status==='done'?'bg-[#3aa776]':overdue?'bg-[#d97706]':'bg-[#0089bb]'}`;
 const barLabel=text+(critical.has(t.id)?(en?', critical path':', ruta crítica'):'');
 return shell(<>{onTask?<button type="button" data-schedule-task-label={t.id} disabled={disabled} onClick={()=>onTask(t)} aria-label={c.edit+': '+text} title={t.title} className="min-h-11 min-w-0 flex-1 truncate pl-3 text-left text-sm text-[#162543] hover:text-[#008bb5] disabled:opacity-60">{t.title}</button>:<span data-schedule-task-label={t.id} title={t.title} className="min-w-0 flex-1 truncate pl-3 text-sm text-[#162543]">{t.title}</span>}{conflict&&<span aria-hidden="true" title={c.conflictDep} className="shrink-0 text-sm font-bold text-[#c2410c]">!</span>}<VarianceBadge days={t.endVarianceDays} c={c} compact/></>,<>
  {t.baselineStart&&t.baselineEnd&&<span data-schedule-baseline-bar aria-hidden="true" className="absolute bottom-1 h-1.5 rounded-full bg-[#c3ccd8]" style={{left:x(t.baselineStart),width:(dayDiff(t.baselineStart,t.baselineEnd)+1)*w}}/>}
  {editable?<button type="button" data-schedule-bar={t.id} data-gantt-bar-start={start} data-gantt-bar-end={end} data-schedule-critical={critical.has(t.id)?'true':undefined} data-gantt-draggable="true"
    // Kept focusable while a save runs (aria-disabled), so a keyboard user does not lose the bar.
    aria-disabled={disabled||undefined} aria-label={barLabel} aria-describedby={edit.helpId} title={text}
    onClick={()=>bar.click(t)} onKeyDown={e=>bar.key(e,t)} onPointerDown={e=>bar.down(e,t,'move')} onPointerMove={bar.move} onPointerUp={e=>bar.up(e,t)} onPointerCancel={e=>bar.up(e,t,true)} onLostPointerCapture={e=>bar.up(e,t,true)}
    className={barClass+' cursor-grab touch-none select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#162543] aria-disabled:cursor-default'} style={{left:x(start),width:Math.max(w,width)}}>
    {handles&&<span data-gantt-resize="start" aria-hidden="true" onPointerDown={e=>bar.down(e,t,'start')} className="absolute inset-y-0 left-0 w-2.5 cursor-ew-resize rounded-l-lg bg-white/25"/>}
    {width>=72&&<span className="pointer-events-none truncate">{t.title}</span>}
    {handles&&<span data-gantt-resize="end" aria-hidden="true" onPointerDown={e=>bar.down(e,t,'end')} className="absolute inset-y-0 right-0 w-2.5 cursor-ew-resize rounded-r-lg bg-white/25"/>}
   </button>
   :<span role="img" data-schedule-bar={t.id} data-gantt-bar-start={start} data-gantt-bar-end={end} data-schedule-critical={critical.has(t.id)?'true':undefined} aria-label={barLabel} title={text} className={barClass} style={{left:x(start),width:Math.max(w,width)}}>{width>=72&&<span className="truncate">{t.title}</span>}</span>}
  {dragging&&<span data-gantt-drag-dates aria-live="polite" className="pointer-events-none absolute -top-0.5 z-20 whitespace-nowrap rounded bg-[#162543] px-1.5 text-[11px] font-semibold leading-4 text-white" style={{left:x(start)}}>{c.dragging(fmt(start,en,{day:'numeric',month:'short'}),fmt(end,en,{day:'numeric',month:'short'}))}</span>}
  {t.dueDate&&<span data-schedule-deadline={t.id} data-schedule-deadline-late={late?'true':'false'} aria-hidden="true" title={c.deadline(fmt(t.dueDate,en))+(late?' · '+c.afterDeadline:'')} className={`pointer-events-none absolute inset-y-1 z-[6] w-0.5 rounded-full ${late||overdue?'bg-[#b42318]':'bg-[#162543]'}`} style={{left:x(t.dueDate)+w-1}}><span className={`absolute -left-[3px] top-0 h-2 w-2 rotate-45 ${late||overdue?'bg-[#b42318]':'bg-[#162543]'}`}/></span>}</>);
}

function ScheduleList({data,c,en,disabled,titles,visible,onTask,onMilestone}:{data:Gantt;c:Copy;en:boolean;disabled:boolean;titles:Map<string,string>;visible:(t:GanttTask)=>boolean;onTask?:(t:GanttTask)=>void;onMilestone?:(m:GanttMilestone)=>void}){
 const phases=new Map(data.phases.map(p=>[p.id,p.title]));
 const entries=[...data.tasks.filter(t=>t.plannedStart&&visible(t)).map(t=>({kind:'task' as const,day:t.plannedStart!,task:t})),...data.milestones.map(m=>({kind:'milestone' as const,day:m.date,milestone:m}))].sort((a,b)=>a.day.localeCompare(b.day)||(a.kind==='milestone'?1:-1));
 return <div data-schedule-list className="space-y-3">
  {!!data.phases.length&&<ul className="grid gap-2 sm:grid-cols-2">{data.phases.filter(p=>p.plannedStart).map(p=><li key={p.id} data-schedule-list-phase={p.id} className="min-w-0 space-y-1 rounded-2xl border border-[#d7e1ea] bg-[#f7f9fc] p-3 text-sm"><div className="flex min-w-0 items-start justify-between gap-2"><p className="min-w-0 break-words font-semibold text-[#162543]">{p.title}</p><VarianceBadge days={p.endVarianceDays} c={c}/></div><p className="text-[#52627a]">{fmt(p.plannedStart!,en)} – {fmt(p.plannedEnd!,en)} · {c.progress(p.doneCount,p.taskCount)}</p></li>)}</ul>}
  <ol className="space-y-2">{entries.map(entry=>{
   if(entry.kind==='milestone'){const m=entry.milestone;return <li key={'m'+m.id} data-schedule-list-milestone={m.id} className="min-w-0 space-y-2 rounded-2xl border border-[#f3d2b3] bg-[#fff8f1] p-3 text-sm"><div className="flex min-w-0 flex-wrap items-start justify-between gap-2"><p className="flex min-w-0 flex-1 items-center gap-2 break-words font-semibold text-[#162543]"><span aria-hidden="true" className="h-3 w-3 shrink-0 rotate-45 rounded-sm bg-[#ff7c0a]"/><span className="min-w-0 break-words">{m.title}</span></p><VarianceBadge days={m.varianceDays} c={c}/></div><p className="text-[#52627a]">{c.milestones} · {fmt(m.date,en)}{m.baselineDate&&m.baselineDate!==m.date?' · '+c.baselineDay(fmt(m.baselineDate,en)):''}</p>{onMilestone&&<div className="flex justify-end"><Button type="button" variant="secondary" size="sm" className="min-h-11" disabled={disabled} onClick={()=>onMilestone(m)}>{c.edit}</Button></div>}</li>;}
   const t=entry.task,overdue=isOverdue(t,data.today),late=lateForDeadline(t);
   return <li key={t.id} data-schedule-list-task={t.id} className="min-w-0 space-y-2 rounded-2xl border border-[#d7e1ea] bg-white p-3 text-sm"><div className="flex min-w-0 flex-wrap items-start justify-between gap-2"><p className="min-w-0 flex-1 break-words font-semibold text-[#162543]">{t.title}</p><VarianceBadge days={t.endVarianceDays} c={c}/></div>
    <p className="text-[#52627a]">{fmt(t.plannedStart!,en)} – {fmt(t.plannedEnd!,en)} · {c.duration(dayDiff(t.plannedStart!,t.plannedEnd!)+1)}{t.phaseId&&phases.get(t.phaseId)?' · '+phases.get(t.phaseId):''}</p>
    {t.dueDate&&<p data-schedule-list-deadline className={`text-xs ${late?'font-semibold text-[#b42318]':'text-[#52627a]'}`}>{c.deadline(fmt(t.dueDate,en))}{late?' · '+c.afterDeadline:''}</p>}
    {t.baselineStart&&t.baselineEnd&&<p className="text-xs text-[#52627a]">{c.baselineWas(fmt(t.baselineStart,en),fmt(t.baselineEnd,en))}</p>}
    {!!t.dependsOn.length&&<p className="break-words text-xs text-[#52627a]">{c.predecessors}: {t.dependsOn.map(id=>titles.get(id)??'—').join(', ')}</p>}
    <div className="flex flex-wrap items-center justify-between gap-2"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${t.status==='done'?'bg-[#eef8f4] text-[#18573a]':overdue?'bg-[#fdf1e3] text-[#8a4b0b]':'bg-[#eaf5fb] text-[#006e90]'}`}>{t.status==='done'?c.done:overdue?c.overdue:c.open}</span>{onTask&&<Button type="button" variant="secondary" size="sm" className="min-h-11" disabled={disabled} onClick={()=>onTask(t)}>{c.edit}</Button>}</div>
   </li>;})}</ol>
 </div>;
}

/** Customer side: renders nothing unless the owner shares the schedule for a confirmed/completed request. */
export function AppointmentSchedule({requestId}:{requestId:string}){const {user,loading}=useAuth();if(loading||!user)return null;return <ClientScheduleSession key={user.id+':'+requestId} accountId={user.id} requestId={requestId}/>;}
function ClientScheduleSession({accountId,requestId}:{accountId:string;requestId:string}){
 const en=useLocale()==='en';
 const [view,setView]=useState<ClientSchedule|null>(null),[error,setError]=useState(false),[loading,setLoading]=useState(true),active=useRef(true),sequence=useRef(0);
 const load=useCallback(async()=>{const id=++sequence.current;setLoading(true);setError(false);try{const response=await fetch(api+'?'+new URLSearchParams({requestId}),{cache:'no-store',headers:{'X-Pro-Expected-Actor':accountId}});if(response.status===404){if(active.current&&id===sequence.current)setView({visible:false});return;}if(!response.ok)throw Error();const body=clientScheduleSchema.parse(await response.json());if(active.current&&id===sequence.current)setView(body);}catch{if(active.current&&id===sequence.current)setError(true);}finally{if(active.current&&id===sequence.current)setLoading(false);}},[accountId,requestId]);
 const invalidate=useCallback(()=>{sequence.current++;},[]);
 useEffect(()=>{active.current=true;const timer=setTimeout(()=>void load(),0);return()=>{active.current=false;invalidate();clearTimeout(timer);};},[load,invalidate]);
 const t=en?{title:'Job schedule',error:'Could not load the schedule.',retry:'Retry',empty:'Your provider has not set dates yet.',general:'Other work',keyDates:'Key dates',progress:(d:number,n:number)=>`${d} of ${n} completed`,today:'Today',done:'Completed',inProgress:'In progress',upcoming:'Upcoming'}:{title:'Cronograma del trabajo',error:'No se pudo cargar el cronograma.',retry:'Reintentar',empty:'Su proveedor todavía no ha definido fechas.',general:'Otros trabajos',keyDates:'Fechas clave',progress:(d:number,n:number)=>`${d} de ${n} completadas`,today:'Hoy',done:'Completada',inProgress:'En curso',upcoming:'Próxima'};
 if(error)return <div role="alert" data-client-schedule-error className="space-y-2 rounded-2xl border border-[#d7e1ea] p-4"><p className="text-sm">{t.error}</p><Button type="button" variant="secondary" disabled={loading} onClick={()=>void load()}>{t.retry}</Button></div>;
 if(!view||!view.visible)return null;
 const rows=[...view.phases.filter(p=>p.plannedStart),...(view.general?[{...view.general,title:t.general}]:[])];
 const state=(r:{plannedStart:string|null;plannedEnd:string|null;total:number;done:number})=>r.total>0&&r.done===r.total?'done':r.plannedStart&&r.plannedStart<=view.today?'progress':'upcoming';
 return <section data-client-schedule aria-label={t.title} className="space-y-3 rounded-2xl border border-[#d7e1ea] bg-white p-4">
  <h3 className="font-bold text-[#162543]">{t.title}</h3>
  {!rows.length&&!view.milestones.length?<p className="text-sm text-[#52627a]">{t.empty}</p>:<>
   {!!rows.length&&<ol className="space-y-2">{rows.map((r,i)=>{const s=state(r);return <li key={i} data-client-schedule-phase className="min-w-0 space-y-1 rounded-xl border border-[#e5e7eb] p-3 text-sm"><div className="flex flex-wrap items-start justify-between gap-2"><p className="min-w-0 break-words font-semibold text-[#162543]">{r.title}</p><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${s==='done'?'bg-[#eef8f4] text-[#18573a]':s==='progress'?'bg-[#eaf5fb] text-[#006e90]':'bg-[#eef2f6] text-[#52627a]'}`}>{s==='done'?t.done:s==='progress'?t.inProgress:t.upcoming}</span></div>{r.plannedStart&&r.plannedEnd&&<p className="text-[#52627a]">{fmt(r.plannedStart,en)} – {fmt(r.plannedEnd,en)}</p>}{r.total>0&&<><p className="text-[#52627a]">{t.progress(r.done,r.total)}</p><span aria-hidden="true" className="block h-1.5 overflow-hidden rounded-full bg-[#eef2f6]"><span className="block h-full bg-[#3aa776]" style={{width:`${Math.round(r.done/r.total*100)}%`}}/></span></>}</li>;})}</ol>}
   {!!view.milestones.length&&<div className="space-y-2"><h4 className="text-sm font-semibold text-[#162543]">{t.keyDates}</h4><ul className="space-y-1">{view.milestones.map((m,i)=><li key={i} data-client-schedule-milestone className="flex min-w-0 items-center gap-2 text-sm"><span aria-hidden="true" className="h-3 w-3 shrink-0 rotate-45 rounded-sm bg-[#ff7c0a]"/><span className="min-w-0 break-words">{m.title}</span><span className="ml-auto shrink-0 text-[#52627a]">{fmt(m.date,en)}</span></li>)}</ul></div>}
  </>}
 </section>;
}
