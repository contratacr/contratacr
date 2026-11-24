'use client';

import {useCallback,useEffect,useRef,useState} from 'react';
import {useLocale} from 'next-intl';
import {useAuth} from '@/hooks/use-auth';
import {Button} from '@/components/ui/button';
import {currentProPath,navigatePro,pushProParams} from '@/lib/pro/navigation';
import {useProSearchParams} from './use-pro-search-params';
import {ProjectCreateDialog} from './project-create';
import {projectStatuses,type Project,type ProjectStatus} from '@/lib/pro/projects';
import {hubPageSchema,type HubPage,type HubRow,type HubSortKey} from '@/lib/pro/projects-hub';
import {ManagersEditor,StatusManager,hubSend} from './projects-hub-parts';
import {projectColorHex,projectColorNames,projectTypeLabel,type ProjectHubRow} from '@/lib/pro/project-details';

const api='/api/pro/projects-hub';
const field='mt-1 block min-h-11 w-full min-w-0 rounded-xl border border-[#d7e1ea] bg-white px-3 py-2 text-base font-normal';
function copy(en:boolean){
 return en?{
  search:'Search projects',searchHint:'Project or customer name',status:'Status',
  applyFilter:'Apply',clearFilter:'Clear',allStatuses:'All statuses',managersFilter:'Manager',anyManager:'All managers',location:'Location',managers:'Managers',created:'Created',viewed:'Viewed',never:'Never',noValue:'—',pin:'Pin project',unpin:'Unpin project',pinned:'Pinned first',select:'Select project',selected:(n:number)=>`${n} selected`,pinSelected:'Pin selected',unpinSelected:'Unpin selected',clearSelection:'Clear selection',sortBy:'Sort by',customize:'Customize',noStatus:'No status',moveTo:'Move to',statusOf:'Status of the project',actionError:'Could not save the change. Try again.',
  states:{open:'Open',in_progress:'In progress',completed:'Completed',cancelled:'Cancelled'} as Record<ProjectStatus,string>,
  typeTags:'Type and tags',noTypeTags:'—',typeFilter:'Project type',tagFilter:'Tag',anyType:'All types',anyTag:'All tags',code:'Code',
  project:'Project',customer:'Customer',dates:'Dates',view:'Customer view',open:'Open project',noDates:'Not scheduled',
  linked:'Customer has access',notLinked:'No linked customer',custom:'Customized',quote:'Quote',
  empty:'There are no projects with this filter.',emptyAll:'You have no projects yet. Create the first one with "Create project". Jobs from Appointments also appear here.',
  listView:'List view',boardView:'Board view',viewMode:'Project view',noneInColumn:'No projects.',
  newJob:'Create project',loading:'Loading projects…',updating:'Updating projects…',error:'Could not load projects.',moreError:'Could not load more projects.',retry:'Retry',more:'Show more projects',total:(n:number)=>`${n} project${n===1?'':'s'} in total`,totalSearch:(n:number)=>`${n} project${n===1?'':'s'} in total · the search only filters the list`,
 }:{
  search:'Buscar proyectos',searchHint:'Nombre del proyecto o del cliente',status:'Estado',
  applyFilter:'Aplicar',clearFilter:'Limpiar',allStatuses:'Todos los estados',managersFilter:'Responsable',anyManager:'Todos los responsables',location:'Ubicación',managers:'Responsables',created:'Creado',viewed:'Visto',never:'Nunca',noValue:'—',pin:'Anclar proyecto',unpin:'Quitar ancla',pinned:'Anclados primero',select:'Seleccionar proyecto',selected:(n:number)=>`${n} seleccionado${n===1?'':'s'}`,pinSelected:'Anclar seleccionados',unpinSelected:'Quitar ancla',clearSelection:'Quitar selección',sortBy:'Ordenar por',customize:'Personalizar',noStatus:'Sin estado',moveTo:'Mover a',statusOf:'Estado del proyecto',actionError:'No se pudo guardar el cambio. Intente de nuevo.',
  states:{open:'Abierto',in_progress:'En curso',completed:'Terminado',cancelled:'Cancelado'} as Record<ProjectStatus,string>,
  typeTags:'Tipo y etiquetas',noTypeTags:'—',typeFilter:'Tipo de proyecto',tagFilter:'Etiqueta',anyType:'Todos los tipos',anyTag:'Todas las etiquetas',code:'Código',
  project:'Proyecto',customer:'Cliente',dates:'Fechas',view:'Vista del cliente',open:'Abrir proyecto',noDates:'Sin programar',
  linked:'Cliente con acceso',notLinked:'Sin cliente vinculado',custom:'Personalizada',quote:'Cotización',
  empty:'No hay proyectos con este filtro.',emptyAll:'Aún no tiene proyectos. Cree el primero con "Crear proyecto". Los trabajos de Citas también aparecen aquí.',
  listView:'Vista de lista',boardView:'Vista de tablero',viewMode:'Vista de proyectos',noneInColumn:'Sin proyectos.',
  newJob:'Crear proyecto',loading:'Cargando proyectos…',updating:'Actualizando proyectos…',error:'No se pudieron cargar los proyectos.',moreError:'No se pudieron cargar más proyectos.',retry:'Reintentar',more:'Ver más proyectos',total:(n:number)=>`${n} proyecto${n===1?'':'s'} en total`,totalSearch:(n:number)=>`${n} proyecto${n===1?'':'s'} en total · la búsqueda solo filtra la lista`,
 };
}
const badge:Record<ProjectStatus,string>={open:'bg-[#eaf7fb] text-[#006f93]',in_progress:'bg-[#fff6e0] text-[#7a5400]',completed:'bg-[#eef8f4] text-[#18573a]',cancelled:'bg-[#f1f3f6] text-[#52627a]'};
const day=(value:string,en:boolean)=>{const date=new Date(value);return Number.isNaN(date.getTime())?value:new Intl.DateTimeFormat(en?'en-US':'es-CR',{dateStyle:'medium',timeZone:'America/Costa_Rica'}).format(date);};

function ProjectSwatch({project,en}:{project:ProjectHubRow;en:boolean}){
 if(!project.color)return null;const name=projectColorNames[en?'en':'es'][project.color];
 return <><span aria-hidden title={name} className="mr-2 inline-block h-3 w-3 shrink-0 rounded-full align-middle" style={{background:projectColorHex[project.color]}}/><span className="sr-only">{name}. </span></>;
}
function ProjectTypeTags({project,en,empty}:{project:ProjectHubRow;en:boolean;empty:string}){
 const type=projectTypeLabel(project.type,en);
 if(!type&&!project.tags.length)return <span className="text-[#68778d]">{empty}</span>;
 return <span className="block min-w-0">{type&&<span className="block break-words text-[#162543]">{type}</span>}{project.tags.length>0&&<span className="mt-1 flex flex-wrap gap-1">{project.tags.map(tag=><span key={tag.id} className="max-w-full truncate rounded-md bg-[#f1f3f6] px-1.5 py-0.5 text-xs text-[#52627a]">{tag.name}</span>)}</span>}</span>;
}

export function ProjectsWorkspace({disabled=false}:{disabled?:boolean}){const {user,loading}=useAuth();if(loading||!user)return null;return <ProjectsSession key={user.id} accountId={user.id} disabled={disabled}/>;}

const defaultStatuses:ProjectStatus[]=['open','in_progress'];
const sortable:{key:HubSortKey;label:'project'|'customer'|'status'|'location'|'created'|'viewed'}[]=[{key:'name',label:'project'},{key:'client',label:'customer'},{key:'status',label:'status'},{key:'location',label:'location'},{key:'created',label:'created'},{key:'viewed',label:'viewed'}];

function ProjectsSession({accountId,disabled}:{accountId:string;disabled:boolean}){
 const en=useLocale()==='en',c=copy(en);
 const [statuses,setStatuses]=useState<ProjectStatus[]>(defaultStatuses),[draftStatuses,setDraftStatuses]=useState<ProjectStatus[]>(defaultStatuses),[statusOpen,setStatusOpen]=useState(false);
 const [typeFilter,setTypeFilter]=useState(''),[tagFilter,setTagFilter]=useState(''),[managerFilter,setManagerFilter]=useState(''),[sort,setSort]=useState<HubSortKey>('default'),[dir,setDir]=useState<'asc'|'desc'>('desc'),[search,setSearch]=useState(''),[query,setQuery]=useState('');
 const [mode,setMode]=useState<'list'|'board'>('list'),[page,setPage]=useState<HubPage|null>(null),[loading,setLoading]=useState<false|'page'|'more'>('page'),[error,setError]=useState<false|{after?:number}>(false),active=useRef(true),sequence=useRef(0);
 const [selected,setSelected]=useState<string[]>([]),[managing,setManaging]=useState(false),[actionError,setActionError]=useState(false);
 const invalidate=useCallback(()=>{sequence.current++;},[]);
 const load=useCallback(async(after?:number)=>{
  const id=++sequence.current;setLoading(after?'more':'page');setError(false);
  try{
   const params=new URLSearchParams({statuses:statuses.join(','),q:query,...after?{after:String(after)}:{},...typeFilter?{type:typeFilter}:{},...tagFilter?{tag:tagFilter}:{},...managerFilter?{manager:managerFilter}:{},...sort!=='default'?{sort,dir}:{}});
   const response=await fetch(api+'?'+params,{cache:'no-store',headers:{'X-Pro-Expected-Actor':accountId}});if(!response.ok)throw Error();
   const body=hubPageSchema.parse(await response.json());
   if(active.current&&id===sequence.current)setPage(old=>after&&old?{...body,items:[...old.items,...body.items.filter(item=>!old.items.some(prior=>prior.id===item.id))]}:body);
  }catch{if(active.current&&id===sequence.current)setError({after});}
  finally{if(active.current&&id===sequence.current)setLoading(false);}
 },[accountId,statuses,query,typeFilter,tagFilter,managerFilter,sort,dir]);
 useEffect(()=>{active.current=true;const timer=setTimeout(()=>void load(),0);return()=>{active.current=false;invalidate();clearTimeout(timer);};},[load,invalidate]);
 useEffect(()=>{const timer=setTimeout(()=>setQuery(search.trim()),300);return()=>clearTimeout(timer);},[search]);
 const open=(project:Project)=>{void fetch(api,{method:'POST',keepalive:true,headers:{'Content-Type':'application/json','X-Pro-Expected-Actor':accountId},body:JSON.stringify({action:'viewed',workId:project.id})}).catch(()=>{});navigatePro('pro_agenda',{cita:project.id,volverProyectos:currentProPath()});};
 const params=useProSearchParams(),creating=params.get('crearProyecto')==='1';
 const counts=page?.counts,customStatuses=page?.filters.statuses??[];
 const period=(project:Project)=>project.start?`${day(project.start,en)}${project.end&&day(project.end,en)!==day(project.start,en)?' — '+day(project.end,en):''}`:c.noDates;
 const reload=()=>void load();
 async function act(body:object){setActionError(false);try{await hubSend(accountId,body);reload();return true;}catch{setActionError(true);return false;}}
 async function bulkPin(pinned:boolean){const ids=selected;setSelected([]);for(const workId of ids)if(!await act({action:'pin',workId,pinned}))break;}
 const toggleSort=(key:HubSortKey)=>{if(sort!==key){setSort(key);setDir('asc');}else if(dir==='asc')setDir('desc');else{setSort('default');setDir('desc');}};
 const statusSummary=statuses.length===0||statuses.length===4?c.allStatuses:statuses.map(state=>c.states[state]).join(', ');
 const retryBox=(message:string,after:number|undefined)=><div role="alert" data-projects-error className="space-y-2"><p className="text-sm">{message}</p><Button type="button" variant="secondary" data-projects-retry disabled={!!loading} onClick={()=>void load(after)}>{c.retry}</Button></div>;
 const pinButton=(project:HubRow)=><button type="button" data-project-pin={project.pinned?'on':'off'} disabled={disabled} aria-pressed={project.pinned} aria-label={`${project.pinned?c.unpin:c.pin}: ${project.name||c.project}`} title={project.pinned?c.unpin:c.pin} onClick={()=>void act({action:'pin',workId:project.id,pinned:!project.pinned})} className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border text-lg ${project.pinned?'border-[#008bb5] bg-[#eaf7fb] text-[#006f93]':'border-[#d7e1ea] bg-white text-[#68778d]'}`}><span aria-hidden>{project.pinned?'★':'☆'}</span></button>;
 const select=(project:HubRow)=><label className="inline-flex h-11 w-11 shrink-0 items-center justify-center"><input type="checkbox" data-project-select={project.id} className="h-5 w-5" checked={selected.includes(project.id)} onChange={event=>setSelected(old=>event.target.checked?[...old,project.id]:old.filter(id=>id!==project.id))}/><span className="sr-only">{c.select}: {project.name||c.project}</span></label>;
 const managersCell=(project:HubRow)=><ManagersEditor key={project.id+project.managers.map(person=>person.id).join()} accountId={accountId} en={en} workId={project.id} current={project.managers} pool={page?.filters.managers??[]} disabled={disabled} onSaved={reload}/>;
 const stamp=(value:string|null,empty:string)=>value?day(value,en):empty;
 const boardColumns=customStatuses.length?[{key:'none',label:c.noStatus,badgeClass:'bg-[#f1f3f6] text-[#52627a]',match:(project:HubRow)=>!project.customStatusId||!customStatuses.some(status=>status.id===project.customStatusId),color:null as string|null},...customStatuses.map(status=>({key:status.id,label:status.name,badgeClass:'bg-[#eaf7fb] text-[#162543]',match:(project:HubRow)=>project.customStatusId===status.id,color:projectColorHex[status.color]}))]
  :projectStatuses.map(state=>({key:state,label:c.states[state],badgeClass:badge[state],match:(project:HubRow)=>project.status===state,color:null as string|null}));
 return <section data-projects-workspace className="space-y-4">
  {creating&&!disabled&&<ProjectCreateDialog accountId={accountId}/>}
  <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,16rem)_auto] sm:items-end">
   <label className="block text-sm font-semibold">{c.search}<input type="search" data-projects-search disabled={disabled} placeholder={c.searchHint} value={search} onChange={event=>setSearch(event.target.value)} className={field}/></label>
   <div className="relative text-sm font-semibold"><span id="projects-status-label">{c.status}</span>
    <button type="button" data-projects-status-toggle aria-labelledby="projects-status-label" aria-expanded={statusOpen} disabled={disabled} onClick={()=>{setDraftStatuses(statuses);setStatusOpen(value=>!value);}} className={field+' truncate text-left'}>{statusSummary}</button>
    {statusOpen&&<fieldset data-projects-status-panel className="absolute left-0 right-0 z-20 mt-1 min-w-0 space-y-1 rounded-xl border border-[#d7e1ea] bg-white p-3 shadow-lg sm:min-w-[16rem]"><legend className="sr-only">{c.status}</legend>
     {projectStatuses.map(state=><label key={state} className="flex min-h-11 items-center gap-2 font-normal"><input type="checkbox" data-projects-status-option={state} className="h-5 w-5" checked={draftStatuses.includes(state)} onChange={event=>setDraftStatuses(old=>event.target.checked?[...old,state]:old.filter(value=>value!==state))}/><span className="min-w-0 flex-1">{c.states[state]}</span>{counts&&<span className="text-xs text-[#52627a]">{counts[state]}</span>}</label>)}
     <div className="flex gap-2 pt-1"><Button type="button" data-projects-status-apply onClick={()=>{const next=projectStatuses.filter(state=>draftStatuses.includes(state));setStatuses(next);setSelected([]);setStatusOpen(false);}}>{c.applyFilter}</Button><Button type="button" variant="secondary" data-projects-status-clear onClick={()=>setDraftStatuses([])}>{c.clearFilter}</Button></div>
    </fieldset>}
   </div>
   <Button type="button" data-project-create-open disabled={disabled} onClick={()=>pushProParams({crearProyecto:'1'})}>{c.newJob}</Button>
  </div>
  {page&&(page.filters.types.length>0||page.filters.managers.length>0)&&<div data-projects-extra-filters className="grid gap-3 sm:grid-cols-3">
   {page.filters.types.length>0&&<label className="block text-sm font-semibold">{c.typeFilter}<select data-projects-type disabled={disabled} value={typeFilter} onChange={event=>setTypeFilter(event.target.value)} className={field}><option value="">{c.anyType}</option>{page.filters.types.filter(type=>!type.archived||type.id===typeFilter).map(type=><option key={type.id} value={type.id}>{projectTypeLabel(type,en)}</option>)}</select></label>}
   {(page.filters.tags.length>0||tagFilter)&&<label className="block text-sm font-semibold">{c.tagFilter}<select data-projects-tag disabled={disabled} value={tagFilter} onChange={event=>setTagFilter(event.target.value)} className={field}><option value="">{c.anyTag}</option>{page.filters.tags.map(tag=><option key={tag.id} value={tag.id}>{tag.name}</option>)}</select></label>}
   {(page.filters.managers.length>0||managerFilter)&&<label className="block text-sm font-semibold">{c.managersFilter}<select data-projects-manager disabled={disabled} value={managerFilter} onChange={event=>setManagerFilter(event.target.value)} className={field}><option value="">{c.anyManager}</option>{page.filters.managers.map(person=><option key={person.id} value={person.id}>{person.name||'—'}</option>)}</select></label>}
  </div>}
  <div className="flex flex-wrap items-center gap-2">
   <div role="group" aria-label={c.viewMode} data-projects-view-toggle className="flex flex-wrap gap-2">{(['list','board'] as const).map(kind=><button key={kind} type="button" data-projects-view={kind} aria-pressed={mode===kind} onClick={()=>setMode(kind)} className={`min-h-11 rounded-xl border px-4 text-sm font-semibold ${mode===kind?'border-[#008bb5] bg-[#eaf7fb] text-[#006f93]':'border-[#d7e1ea] bg-white text-[#52627a]'}`}>{kind==='list'?c.listView:c.boardView}</button>)}</div>
   {mode==='board'&&<Button type="button" variant="secondary" data-projects-customize disabled={disabled} onClick={()=>setManaging(value=>!value)}>{c.customize}</Button>}
   {mode==='list'&&<label className="flex items-center gap-2 text-sm font-semibold lg:hidden">{c.sortBy}<select data-projects-sort-select value={sort} onChange={event=>{setSort(event.target.value as HubSortKey);setDir(event.target.value==='created'||event.target.value==='viewed'?'desc':'asc');}} className="min-h-11 rounded-xl border border-[#d7e1ea] bg-white px-3 text-sm font-normal"><option value="default">{c.pinned}</option>{sortable.map(item=><option key={item.key} value={item.key}>{c[item.label]}</option>)}</select></label>}
  </div>
  {mode==='board'&&managing&&<StatusManager accountId={accountId} en={en} statuses={customStatuses} onChanged={reload} onClose={()=>setManaging(false)}/>}
  {selected.length>0&&mode==='list'&&<div data-projects-bulk role="group" className="flex flex-wrap items-center gap-2 rounded-xl bg-[#eaf7fb] p-3 text-sm"><span data-projects-selected className="font-semibold">{c.selected(selected.length)}</span><Button type="button" variant="secondary" data-projects-bulk-pin disabled={disabled} onClick={()=>void bulkPin(true)}>{c.pinSelected}</Button><Button type="button" variant="secondary" data-projects-bulk-unpin disabled={disabled} onClick={()=>void bulkPin(false)}>{c.unpinSelected}</Button><Button type="button" variant="secondary" onClick={()=>setSelected([])}>{c.clearSelection}</Button></div>}
  {actionError&&<p role="alert" data-projects-action-error className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{c.actionError}</p>}
  {counts&&<p data-projects-total className="text-sm text-[#52627a]">{query?c.totalSearch(counts.all):c.total(counts.all)}</p>}
  {error&&!error.after&&retryBox(c.error,undefined)}
  {/* A filter or search change keeps the previous rows (dimmed) and says it is updating. */}
  {loading==='page'&&<p role="status" data-projects-loading className="text-sm text-[#52627a]">{page?c.updating:c.loading}</p>}
  {page&&!page.items.length&&<p data-projects-empty className="rounded-2xl border border-dashed border-[#d7e1ea] bg-white p-6 text-sm text-[#52627a]">{counts?.all?c.empty:c.emptyAll}</p>}
  {page&&page.items.length>0&&<div aria-busy={loading==='page'} className={loading==='page'?'opacity-60 transition-opacity':'transition-opacity'}>
   {mode==='board'&&<div data-projects-board className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{boardColumns.map(column=>{const cards=page.items.filter(column.match);
    return <section key={column.key} data-projects-column={column.key} aria-label={column.label} className="min-w-0 space-y-2 rounded-2xl border border-[#e5e7eb] bg-[#f7f9fc] p-3"><h2 className="flex items-center justify-between gap-2 text-sm font-bold"><span className={`min-w-0 break-words rounded-full px-2 py-1 text-xs font-semibold ${column.badgeClass}`}>{column.color&&<span aria-hidden className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{background:column.color}}/>}{column.label}</span><span data-projects-column-count>{cards.length}</span></h2>
     {cards.length===0?<p className="text-sm text-[#52627a]">{c.noneInColumn}</p>:<ul className="space-y-2">{cards.map(project=><li key={project.id} data-project-board-card={project.id} className="rounded-xl border border-[#e5e7eb] bg-white p-3"><button type="button" disabled={disabled} onClick={()=>open(project)} className="block w-full min-w-0 text-left"><span className="sr-only">{c.open}: </span><span className="block break-words font-semibold">{project.pinned&&<span aria-hidden className="mr-1 text-[#006f93]">★</span>}<ProjectSwatch project={project} en={en}/>{project.name||c.project}</span><span className="mt-1 block break-words text-sm">{project.client}</span>{project.code&&<span className="block break-words text-xs text-[#52627a]">{c.code}: {project.code}</span>}<span className="mt-1 block text-xs text-[#52627a]">{period(project)}</span></button>
      {customStatuses.length>0&&<label className="mt-2 block text-xs font-semibold">{c.moveTo}<select data-project-move={project.id} disabled={disabled} value={project.customStatusId&&customStatuses.some(status=>status.id===project.customStatusId)?project.customStatusId:''} onChange={event=>void act({action:'status_set',workId:project.id,statusId:event.target.value||null})} className="mt-1 block min-h-11 w-full rounded-xl border border-[#d7e1ea] bg-white px-2 text-sm font-normal"><option value="">{c.noStatus}</option>{customStatuses.map(status=><option key={status.id} value={status.id}>{status.name}</option>)}</select></label>}
     </li>)}</ul>}
    </section>;})}</div>}
   {mode==='list'&&<>
   <div data-projects-table-scroll className="hidden overflow-x-auto rounded-2xl border border-[#e5e7eb] bg-white lg:block" tabIndex={0} role="region" aria-label={c.project}>
    <table className="w-full min-w-[68rem] text-left text-sm">
     <thead className="bg-[#f7f9fc] text-xs uppercase tracking-wide text-[#52627a]"><tr>
      <th className="w-12 px-2 py-3"><span className="sr-only">{c.select}</span></th>
      {sortable.slice(0,1).map(item=><SortHead key={item.key} item={item} label={c[item.label]} sort={sort} dir={dir} onSort={toggleSort}/>)}
      <SortHead item={sortable[1]} label={c.customer} sort={sort} dir={dir} onSort={toggleSort}/>
      <th className="px-3 py-3">{c.typeTags}</th>
      <SortHead item={sortable[2]} label={c.status} sort={sort} dir={dir} onSort={toggleSort}/>
      <th className="px-3 py-3">{c.managers}</th>
      <SortHead item={sortable[3]} label={c.location} sort={sort} dir={dir} onSort={toggleSort}/>
      <SortHead item={sortable[4]} label={c.created} sort={sort} dir={dir} onSort={toggleSort}/>
      <SortHead item={sortable[5]} label={c.viewed} sort={sort} dir={dir} onSort={toggleSort}/>
      <th className="px-3 py-3">{c.dates}</th>
     </tr></thead>
     <tbody>{page.items.map(project=><tr key={project.id} data-project-row={project.id} data-project-pinned={project.pinned?'':undefined} className="border-t border-[#eef1f5] align-top">
      <td className="px-2 py-2"><div className="flex flex-col items-center">{select(project)}{pinButton(project)}</div></td>
      <td className="min-w-[13rem] px-3 py-3"><ProjectSwatch project={project} en={en}/><button type="button" disabled={disabled} onClick={()=>open(project)} className="break-words text-left font-semibold text-[#162543] hover:text-[#008bb5] hover:underline">{project.name||c.project}</button>{project.hasQuote&&<span className="ml-2 rounded-md bg-[#f1f3f6] px-1.5 py-0.5 text-xs text-[#52627a]">{c.quote}</span>}{project.code&&<span className="mt-1 block break-words text-xs text-[#52627a]">{c.code}: {project.code}</span>}<span className="mt-1 block text-xs text-[#52627a]">{project.linkedCustomer?c.linked:c.notLinked}{project.customView?' · '+c.custom:''}</span></td>
      <td className="break-words px-3 py-3">{project.client}</td>
      <td className="px-3 py-3 text-sm"><ProjectTypeTags project={project} en={en} empty={c.noTypeTags}/></td>
      <td className="px-3 py-3"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${badge[project.status]}`}>{c.states[project.status]}</span></td>
      <td className="min-w-[10rem] px-3 py-3">{managersCell(project)}</td>
      <td className="break-words px-3 py-3 text-[#52627a]">{project.location||c.noValue}</td>
      <td data-project-created className="whitespace-nowrap px-3 py-3 text-[#52627a]">{stamp(project.created,c.noValue)}</td>
      <td data-project-viewed className="whitespace-nowrap px-3 py-3 text-[#52627a]">{stamp(project.viewed,c.never)}</td>
      <td className="px-3 py-3 text-[#52627a]">{period(project)}</td>
     </tr>)}</tbody>
    </table>
   </div>
   <ul className="space-y-3 lg:hidden">{page.items.map(project=><li key={project.id} data-project-card={project.id} className="rounded-2xl border border-[#e5e7eb] bg-white p-4">
    {/* No aria-label: the accessible name is the whole card (project, status, customer, dates, access). */}
    <div className="flex items-start gap-1"><div className="min-w-0 flex-1"><button type="button" disabled={disabled} onClick={()=>open(project)} className="block w-full text-left">
     <span className="sr-only">{c.open}: </span>
     <span className="flex items-start justify-between gap-3"><span className="min-w-0 break-words font-semibold">{project.name||c.project}</span><span className={`shrink-0 rounded-full px-2 py-1 text-xs font-semibold ${badge[project.status]}`}>{c.states[project.status]}</span></span>
     <span className="mt-1 block break-words text-sm">{project.client}</span>
     {(project.color||project.code||project.type||project.tags.length>0)&&<span data-project-card-meta className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#52627a]"><ProjectSwatch project={project} en={en}/>{[project.code,projectTypeLabel(project.type,en),...project.tags.map(tag=>tag.name)].filter(Boolean).map((value,index)=><span key={index} className="max-w-full break-words">{value}</span>)}</span>}
     <span className="mt-1 block text-sm text-[#52627a]">{period(project)}</span>
     <span className="mt-2 block text-xs text-[#52627a]">{project.linkedCustomer?c.linked:c.notLinked}{project.customView?' · '+c.custom:''}</span>
    </button>
    {project.location&&<p className="mt-1 break-words text-xs text-[#52627a]">{c.location}: {project.location}</p>}
    <p className="mt-1 text-xs text-[#52627a]">{c.created}: {stamp(project.created,c.noValue)} · {c.viewed}: {stamp(project.viewed,c.never)}</p>
    <div className="mt-2 text-xs"><span className="font-semibold">{c.managers}: </span>{managersCell(project)}</div></div>
    <div className="flex flex-col items-center">{select(project)}{pinButton(project)}</div></div>
   </li>)}</ul></>}
   {error&&error.after&&<div className="mt-3">{retryBox(c.moreError,error.after)}</div>}
   {page.nextCursor!==null&&!(error&&error.after)&&<Button type="button" variant="secondary" className="mt-3" disabled={disabled||!!loading} onClick={()=>void load(page.nextCursor!)}>{loading==='more'?c.loading:c.more}</Button>}
  </div>}
 </section>;
}

function SortHead({item,label,sort,dir,onSort}:{item:{key:HubSortKey};label:string;sort:HubSortKey;dir:'asc'|'desc';onSort:(key:HubSortKey)=>void}){
 const current=sort===item.key;
 return <th scope="col" aria-sort={current?(dir==='asc'?'ascending':'descending'):'none'} className="px-3 py-3"><button type="button" data-projects-sort={item.key} onClick={()=>onSort(item.key)} className="inline-flex min-h-11 items-center gap-1 text-left font-semibold uppercase tracking-wide">{label}<span aria-hidden>{current?(dir==='asc'?'▲':'▼'):''}</span></button></th>;
}
