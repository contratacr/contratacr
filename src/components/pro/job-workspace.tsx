'use client';

import {useEffect,useId,useRef,useState,type ReactNode} from 'react';
import {useLocale} from 'next-intl';
import {pushProParams} from '@/lib/pro/navigation';
import {useWorkMessagesUnread} from './work-messages';
import {useProSearchParams} from './use-pro-search-params';
import {JobChecklistSummary} from './job-checklist-summary';
import {WorkTasksSummary} from './work-tasks';
import {WorkUpdatesSummary} from './work-updates';
import {WorkActivity,WorkActivitySummary} from './work-activity';

type View='summary'|'activity'|'contracts'|'estimates'|'allowances'|'selections'|'moodboards'|'takeoffs'|'bids'|'schedule'|'tasks'|'updates'|'files'|'subs'|'messages'|'costs'|'time'|'orders'|'credits'|'changes'|'delivery'|'client'|'notes'|'details';
const views:View[]=['summary','activity','contracts','estimates','allowances','selections','moodboards','takeoffs','bids','schedule','tasks','updates','files','subs','messages','costs','time','orders','credits','changes','delivery','client','notes','details'];

/** Keep visited panels mounted so navigation never drops an in-progress edit. */
export function JobWorkspace({aside,files,subs,overview,summary,contracts,estimates,allowances,selections,moodboards,takeoffs,bids,schedule,tasks,updates,messages,badges,costs,time,orders,credits,changes,delivery,client,notes,details,blocked=false,workId}:{aside?:ReactNode;files?:ReactNode;subs?:ReactNode;overview?:ReactNode;summary:ReactNode;contracts?:ReactNode;estimates?:ReactNode;allowances?:ReactNode;selections?:ReactNode;moodboards?:ReactNode;takeoffs?:ReactNode;bids?:ReactNode;schedule?:ReactNode;tasks?:ReactNode;updates?:ReactNode;messages?:ReactNode;badges?:Partial<Record<View,number>>;costs:ReactNode;time?:ReactNode;orders?:ReactNode;credits?:ReactNode;changes:ReactNode;delivery:ReactNode;client?:ReactNode;notes?:ReactNode;details?:ReactNode;blocked?:boolean;workId?:string}){
 const en=useLocale()==='en',params=useProSearchParams(),id=useId(),unreadMessages=useWorkMessagesUnread(messages!=null?workId:undefined),shownBadges:Partial<Record<View,number>>={...badges,...(messages!=null?{messages:unreadMessages}:{})};
 const requested=params.get('vistaTrabajo');
 // Activity history: read-only, owned here (needs only the job id). Offered with the job overview (the
 // independent Pro space), like the other project sections.
 const activity=workId&&overview!=null?<WorkActivity workId={workId} blocked={blocked}/>:null;
 const available=views.filter(view=>({summary,activity,contracts,estimates,allowances,selections,moodboards,takeoffs,bids,schedule,tasks,updates,files,subs,messages,costs,time,orders,credits,changes,delivery,client,notes,details})[view]!=null);
 const active:View=available.includes(requested as View)?requested as View:'summary';
 const [visited,setVisited]=useState<Set<View>>(()=>new Set([active]));
 if(!visited.has(active))setVisited(new Set([...visited,active]));
 // Round 7B (bug 9): the dialog body kept the previous section's scroll, so a
 // shorter section opened below the fold and looked blank. On a section change
 // bring the top of the workspace back into view (never on first render).
 const root=useRef<HTMLDivElement>(null),shown=useRef(active),nav=useRef<HTMLElement>(null);
 // Round 9: keep the active section visible inside the phone strip (only scrolls the strip).
 useEffect(()=>{const strip=nav.current,current=strip?.querySelector<HTMLElement>('[aria-current="page"]');if(!strip||!current||strip.scrollWidth<=strip.clientWidth)return;const left=current.offsetLeft-strip.offsetLeft;if(left<strip.scrollLeft||left+current.offsetWidth>strip.scrollLeft+strip.clientWidth)strip.scrollLeft=Math.max(0,left-24);},[active]);
 useEffect(()=>{
  if(shown.current===active)return;shown.current=active;
  const section=root.current;if(!section)return;
  let parent=section.parentElement;
  while(parent&&!(parent.scrollHeight>parent.clientHeight&&/(auto|scroll)/.test(getComputedStyle(parent).overflowY)))parent=parent.parentElement;
  const scroller=parent??document.scrollingElement;if(!scroller)return;
  const top=section.getBoundingClientRect().top-(parent?parent.getBoundingClientRect().top:0);
  if(top<0)scroller.scrollTop=Math.max(0,scroller.scrollTop+top-8);
 },[active]);
 const labels:Record<View,string>=en?{summary:'Overview',activity:'Activity',contracts:'Contracts',estimates:'Quotes',allowances:'Allowances',selections:'Selections',moodboards:'Idea boards',takeoffs:'Measurements',bids:'Bid requests',schedule:'Schedule',tasks:'Tasks',updates:'Daily log',files:'Files',subs:'Subcontractors',messages:'Messages',costs:'Costs & payments',time:'Time',orders:'Purchase orders',credits:'Credits & retainers',changes:'Changes',delivery:'Completion report',client:'Customer view',notes:'Notes and calls',details:'Project details'}:{summary:'Resumen',activity:'Actividad',contracts:'Contratos',estimates:'Cotizaciones',allowances:'Montos previstos',selections:'Selecciones',moodboards:'Tableros de ideas',takeoffs:'Mediciones',bids:'Licitaciones',schedule:'Cronograma',tasks:'Tareas',updates:'Bitácora',files:'Archivos',subs:'Subcontratistas',messages:'Mensajes',costs:'Costos y pagos',time:'Horas',orders:'Órdenes de compra',credits:'Créditos y anticipos',changes:'Extras y cambios',delivery:'Constancia',client:'Vista del cliente',notes:'Notas y llamadas',details:'Detalles del proyecto'};
 const panels={summary,activity,contracts,estimates,allowances,selections,moodboards,takeoffs,bids,schedule,tasks,updates,files,subs,messages,costs,time,orders,credits,changes,delivery,client,notes,details};
 const groupDefs:Array<{label:string|null;views:View[]}>=[
  {label:null,views:['summary','activity']},
  {label:en?'Planning':'Planificación',views:['contracts','estimates','allowances','selections','moodboards','takeoffs','bids']},
  {label:en?'Management':'Gestión',views:['schedule','tasks','updates','files','messages','subs','client','delivery']},
  {label:en?'Finance':'Finanzas',views:['costs','time','orders','credits','changes']},
 ];
 const groups=groupDefs.map(group=>({...group,views:group.views.filter(view=>available.includes(view))})).filter(group=>group.views.length>0);
 return <section data-job-workspace className={'space-y-5 lg:grid lg:items-start lg:gap-5 lg:space-y-0 '+(aside?'lg:grid-cols-[12rem_minmax(0,1fr)] xl:grid-cols-[12rem_minmax(0,1fr)_17rem]':'lg:grid-cols-[12rem_minmax(0,1fr)]')}>
  {/* Round 9: on phones and tablets the 20 sections are one compact, grouped strip that scrolls
      sideways (it used to fill the first screen); from lg up it is the grouped side menu. */}
  <nav ref={nav} data-job-workspace-nav aria-label={en?'Job workspace':'Gestión del trabajo'} className="flex gap-3 overflow-x-auto overscroll-x-contain rounded-2xl bg-[#e9eff5] p-1.5 [scrollbar-width:thin] lg:sticky lg:top-4 lg:block lg:space-y-3 lg:overflow-visible">
   {groups.map(group=><div key={group.label??'top'} data-job-workspace-group={group.label??'overview'} className="flex shrink-0 items-center gap-1.5 lg:block">
    {group.label&&<p data-job-workspace-group-label className="ml-1 flex shrink-0 cursor-default select-none items-center self-stretch border-l-2 border-[#c3cfdc] pl-2.5 pr-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#7a879a] lg:ml-0 lg:block lg:self-auto lg:border-l-0 lg:px-2 lg:pb-1 lg:pt-1 lg:text-xs lg:font-bold lg:text-[#68778d]">{group.label}</p>}
    <div className="flex gap-1.5 lg:grid lg:grid-cols-1">
     {group.views.map(view=><button key={view} type="button" aria-current={view===active?'page':undefined} aria-controls={`${id}-${view}`} disabled={blocked&&view!==active} onClick={()=>{if(view!==active)pushProParams({vistaTrabajo:view==='summary'?null:view});}} className={`min-h-11 shrink-0 whitespace-nowrap rounded-xl px-3 py-2 text-left text-sm font-semibold transition-colors disabled:opacity-50 lg:min-w-0 lg:whitespace-normal ${view===active?'bg-white text-[#008bb5] shadow-sm':'text-[#52627a] hover:bg-white/60'}`}>{labels[view]}{(shownBadges[view]??0)>0&&<span data-job-badge={view} className="ml-2 inline-block rounded-full bg-[#d14343] px-2 text-xs font-bold text-white">{shownBadges[view]}</span>}</button>)}
    </div>
   </div>)}
  </nav>
  <div ref={root} data-job-workspace-content className="min-w-0 space-y-5">
  {(notes!=null||details!=null)&&<div data-job-workspace-header role="group" aria-label={en?'Project log and details':'Bitácora y detalles del proyecto'} className="flex flex-wrap justify-end gap-2">
   {(['notes','details'] as View[]).filter(view=>available.includes(view)).map(view=><button key={view} type="button" aria-current={view===active?'page':undefined} aria-controls={`${id}-${view}`} disabled={blocked&&view!==active} onClick={()=>pushProParams({vistaTrabajo:view===active?null:view})} className={`min-h-11 min-w-0 rounded-xl border px-3 py-2 text-sm font-semibold transition-colors disabled:opacity-50 ${view===active?'border-[#008bb5] bg-white text-[#008bb5] shadow-sm':'border-[#d7e1ea] bg-white text-[#52627a] hover:text-[#162543]'}`}>{labels[view]}</button>)}
  </div>}
  {views.map(view=>(visited.has(view)||view===active)&&<div key={view} id={`${id}-${view}`} hidden={view!==active} role="region" aria-label={labels[view]}>{view==='summary'?<div className="space-y-4">{overview}{active==='summary'&&workId&&tasks!=null&&<WorkTasksSummary workId={workId} blocked={blocked}/>}
{active==='summary'&&workId&&updates!=null&&<WorkUpdatesSummary workId={workId} blocked={blocked}/>}
{active==='summary'&&workId&&overview!=null&&<WorkActivitySummary workId={workId} blocked={blocked}/>}
{active==='summary'&&workId&&delivery!=null&&<JobChecklistSummary workId={workId} blocked={blocked} hideEmpty={tasks!=null}/>}{panels[view]}</div>:panels[view]}</div>)}
  </div>
  {aside&&<div data-job-workspace-aside className={'min-w-0 lg:col-start-2 xl:col-start-auto xl:sticky xl:top-4 '+(active==='summary'?'':'hidden xl:block')}>{aside}</div>}
 </section>;
}
