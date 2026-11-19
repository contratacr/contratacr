'use client';

import {useCallback,useEffect,useRef,useState} from 'react';
import {useLocale} from 'next-intl';
import {useAuth} from '@/hooks/use-auth';
import {Button} from '@/components/ui/button';
import {currentProPath,navigatePro,pushProParams} from '@/lib/pro/navigation';
import {useProSearchParams} from './use-pro-search-params';
import {ProjectCreateDialog} from './project-create';
import {projectsPageSchema,type Project,type ProjectFilter,type ProjectStatus} from '@/lib/pro/projects';
import {projectColorHex,projectColorNames,projectHubPageSchema,projectTypeLabel,type ProjectHubPage,type ProjectHubRow} from '@/lib/pro/project-details';

const api='/api/pro/projects';
const field='mt-1 block min-h-11 w-full min-w-0 rounded-xl border border-[#d7e1ea] bg-white px-3 py-2 text-base font-normal';
function copy(en:boolean){
 return en?{
  search:'Search projects',searchHint:'Project or customer name',status:'Status',
  filters:{active:'Open and in progress',open:'Open',in_progress:'In progress',completed:'Completed',cancelled:'Cancelled',all:'All projects'} as Record<ProjectFilter,string>,
  states:{open:'Open',in_progress:'In progress',completed:'Completed',cancelled:'Cancelled'} as Record<ProjectStatus,string>,
  typeTags:'Type and tags',noTypeTags:'—',typeFilter:'Project type',tagFilter:'Tag',anyType:'All types',anyTag:'All tags',code:'Code',
  project:'Project',customer:'Customer',dates:'Dates',view:'Customer view',open:'Open project',noDates:'Not scheduled',
  linked:'Customer has access',notLinked:'No linked customer',custom:'Customized',quote:'Quote',
  empty:'There are no projects with this filter.',emptyAll:'You have no projects yet. Create the first one with "Create project". Jobs from Appointments also appear here.',
  newJob:'Create project',loading:'Loading projects…',updating:'Updating projects…',error:'Could not load projects.',moreError:'Could not load more projects.',retry:'Retry',more:'Show more projects',total:(n:number)=>`${n} project${n===1?'':'s'} in total`,totalSearch:(n:number)=>`${n} project${n===1?'':'s'} in total · the search only filters the list`,
 }:{
  search:'Buscar proyectos',searchHint:'Nombre del proyecto o del cliente',status:'Estado',
  filters:{active:'Abiertos y en curso',open:'Abiertos',in_progress:'En curso',completed:'Terminados',cancelled:'Cancelados',all:'Todos los proyectos'} as Record<ProjectFilter,string>,
  states:{open:'Abierto',in_progress:'En curso',completed:'Terminado',cancelled:'Cancelado'} as Record<ProjectStatus,string>,
  typeTags:'Tipo y etiquetas',noTypeTags:'—',typeFilter:'Tipo de proyecto',tagFilter:'Etiqueta',anyType:'Todos los tipos',anyTag:'Todas las etiquetas',code:'Código',
  project:'Proyecto',customer:'Cliente',dates:'Fechas',view:'Vista del cliente',open:'Abrir proyecto',noDates:'Sin programar',
  linked:'Cliente con acceso',notLinked:'Sin cliente vinculado',custom:'Personalizada',quote:'Cotización',
  empty:'No hay proyectos con este filtro.',emptyAll:'Aún no tiene proyectos. Cree el primero con "Crear proyecto". Los trabajos de Citas también aparecen aquí.',
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

function ProjectsSession({accountId,disabled}:{accountId:string;disabled:boolean}){
 const en=useLocale()==='en',c=copy(en);
 const [status,setStatus]=useState<ProjectFilter>('active'),[typeFilter,setTypeFilter]=useState(''),[tagFilter,setTagFilter]=useState(''),[search,setSearch]=useState(''),[query,setQuery]=useState('');
 const [page,setPage]=useState<ProjectHubPage|null>(null),[loading,setLoading]=useState<false|'page'|'more'>('page'),[error,setError]=useState<false|{after?:number}>(false),active=useRef(true),sequence=useRef(0);
 const invalidate=useCallback(()=>{sequence.current++;},[]);
 const load=useCallback(async(after?:number)=>{
  const id=++sequence.current;setLoading(after?'more':'page');setError(false);
  try{
   const base={status,q:query,...after?{after:String(after)}:{}},headers={'X-Pro-Expected-Actor':accountId};
   // v2 adds colour, type, code and tags; if it is unavailable the hub keeps working with v1.
   let response=await fetch(api+'?'+new URLSearchParams({...base,v:'2',...typeFilter?{type:typeFilter}:{},...tagFilter?{tag:tagFilter}:{}}),{cache:'no-store',headers});
   let body:ProjectHubPage;
   if(response.status===404&&!typeFilter&&!tagFilter){
    response=await fetch(api+'?'+new URLSearchParams(base),{cache:'no-store',headers});if(!response.ok)throw Error();
    const v1=projectsPageSchema.parse(await response.json());body={...v1,items:v1.items.map(item=>({...item,color:null,code:null,type:null,tags:[]})),filters:{types:[],tags:[]}};
   }else{if(!response.ok)throw Error();body=projectHubPageSchema.parse(await response.json());}
   if(active.current&&id===sequence.current)setPage(old=>after&&old?{...body,items:[...old.items,...body.items.filter(item=>!old.items.some(prior=>prior.id===item.id))]}:body);
  }catch{if(active.current&&id===sequence.current)setError({after});}
  finally{if(active.current&&id===sequence.current)setLoading(false);}
 },[accountId,status,query,typeFilter,tagFilter]);
 useEffect(()=>{active.current=true;const timer=setTimeout(()=>void load(),0);return()=>{active.current=false;invalidate();clearTimeout(timer);};},[load,invalidate]);
 useEffect(()=>{const timer=setTimeout(()=>setQuery(search.trim()),300);return()=>clearTimeout(timer);},[search]);
 const open=(project:Project)=>navigatePro('pro_agenda',{cita:project.id,volverProyectos:currentProPath()});
 const params=useProSearchParams(),creating=params.get('crearProyecto')==='1';
 const counts=page?.counts,countFor=(filter:ProjectFilter)=>!counts?null:filter==='active'?counts.open+counts.in_progress:counts[filter];
 const period=(project:Project)=>project.start?`${day(project.start,en)}${project.end&&day(project.end,en)!==day(project.start,en)?' — '+day(project.end,en):''}`:c.noDates;
 // «Retry» repeats the request that failed: after «Show more» it asks for that same page again.
 const retryBox=(message:string,after:number|undefined)=><div role="alert" data-projects-error className="space-y-2"><p className="text-sm">{message}</p><Button type="button" variant="secondary" data-projects-retry disabled={!!loading} onClick={()=>void load(after)}>{c.retry}</Button></div>;
 return <section data-projects-workspace className="space-y-4">
  {creating&&!disabled&&<ProjectCreateDialog accountId={accountId}/>}
  <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,16rem)_auto] sm:items-end">
   <label className="block text-sm font-semibold">{c.search}<input type="search" data-projects-search disabled={disabled} placeholder={c.searchHint} value={search} onChange={event=>setSearch(event.target.value)} className={field}/></label>
   <label className="block text-sm font-semibold">{c.status}<select data-projects-status disabled={disabled} value={status} onChange={event=>setStatus(event.target.value as ProjectFilter)} className={field}>
    {(Object.keys(c.filters) as ProjectFilter[]).map(filter=>{const n=countFor(filter);return <option key={filter} value={filter}>{c.filters[filter]}{n===null?'':` (${n})`}</option>;})}
   </select></label>
   <Button type="button" data-project-create-open disabled={disabled} onClick={()=>pushProParams({crearProyecto:'1'})}>{c.newJob}</Button>
  </div>
  {page&&page.filters.types.length>0&&<div data-projects-extra-filters className="grid gap-3 sm:grid-cols-2">
   <label className="block text-sm font-semibold">{c.typeFilter}<select data-projects-type disabled={disabled} value={typeFilter} onChange={event=>setTypeFilter(event.target.value)} className={field}><option value="">{c.anyType}</option>{page.filters.types.filter(type=>!type.archived||type.id===typeFilter).map(type=><option key={type.id} value={type.id}>{projectTypeLabel(type,en)}</option>)}</select></label>
   {(page.filters.tags.length>0||tagFilter)&&<label className="block text-sm font-semibold">{c.tagFilter}<select data-projects-tag disabled={disabled} value={tagFilter} onChange={event=>setTagFilter(event.target.value)} className={field}><option value="">{c.anyTag}</option>{page.filters.tags.map(tag=><option key={tag.id} value={tag.id}>{tag.name}</option>)}</select></label>}
  </div>}
  {counts&&<p data-projects-total className="text-sm text-[#52627a]">{query?c.totalSearch(counts.all):c.total(counts.all)}</p>}
  {error&&!error.after&&retryBox(c.error,undefined)}
  {/* A filter or search change keeps the previous rows (dimmed) and says it is updating. */}
  {loading==='page'&&<p role="status" data-projects-loading className="text-sm text-[#52627a]">{page?c.updating:c.loading}</p>}
  {page&&!page.items.length&&<p data-projects-empty className="rounded-2xl border border-dashed border-[#d7e1ea] bg-white p-6 text-sm text-[#52627a]">{counts?.all?c.empty:c.emptyAll}</p>}
  {page&&page.items.length>0&&<div aria-busy={loading==='page'} className={loading==='page'?'opacity-60 transition-opacity':'transition-opacity'}>
   <div className="hidden overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white lg:block">
    <table className="w-full table-fixed text-left text-sm">
     <thead className="bg-[#f7f9fc] text-xs uppercase tracking-wide text-[#52627a]"><tr><th className="w-[26%] px-4 py-3">{c.project}</th><th className="w-[17%] px-4 py-3">{c.customer}</th><th className="w-[19%] px-4 py-3">{c.typeTags}</th><th className="w-[12%] px-4 py-3">{c.status}</th><th className="w-[14%] px-4 py-3">{c.dates}</th><th className="w-[12%] px-4 py-3">{c.view}</th></tr></thead>
     <tbody>{page.items.map(project=><tr key={project.id} data-project-row={project.id} className="border-t border-[#eef1f5] align-top">
      <td className="px-4 py-3"><ProjectSwatch project={project} en={en}/><button type="button" disabled={disabled} onClick={()=>open(project)} className="break-words text-left font-semibold text-[#162543] hover:text-[#008bb5] hover:underline">{project.name||c.project}</button>{project.hasQuote&&<span className="ml-2 rounded-md bg-[#f1f3f6] px-1.5 py-0.5 text-xs text-[#52627a]">{c.quote}</span>}{project.code&&<span className="mt-1 block break-words text-xs text-[#52627a]">{c.code}: {project.code}</span>}</td>
      <td className="break-words px-4 py-3">{project.client}</td>
      <td className="px-4 py-3 text-sm"><ProjectTypeTags project={project} en={en} empty={c.noTypeTags}/></td>
      <td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${badge[project.status]}`}>{c.states[project.status]}</span></td>
      <td className="px-4 py-3 text-[#52627a]">{period(project)}</td>
      <td className="px-4 py-3 text-xs text-[#52627a]">{project.linkedCustomer?c.linked:c.notLinked}{project.customView&&<span className="block text-[#008bb5]">{c.custom}</span>}</td>
     </tr>)}</tbody>
    </table>
   </div>
   <ul className="space-y-3 lg:hidden">{page.items.map(project=><li key={project.id} data-project-card={project.id}>
    {/* No aria-label: the accessible name is the whole card (project, status, customer, dates, access). */}
    <button type="button" disabled={disabled} onClick={()=>open(project)} className="block w-full rounded-2xl border border-[#e5e7eb] bg-white p-4 text-left">
     <span className="sr-only">{c.open}: </span>
     <span className="flex items-start justify-between gap-3"><span className="min-w-0 break-words font-semibold">{project.name||c.project}</span><span className={`shrink-0 rounded-full px-2 py-1 text-xs font-semibold ${badge[project.status]}`}>{c.states[project.status]}</span></span>
     <span className="mt-1 block break-words text-sm">{project.client}</span>
     {(project.color||project.code||project.type||project.tags.length>0)&&<span data-project-card-meta className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#52627a]"><ProjectSwatch project={project} en={en}/>{[project.code,projectTypeLabel(project.type,en),...project.tags.map(tag=>tag.name)].filter(Boolean).map((value,index)=><span key={index} className="max-w-full break-words">{value}</span>)}</span>}
     <span className="mt-1 block text-sm text-[#52627a]">{period(project)}</span>
     <span className="mt-2 block text-xs text-[#52627a]">{project.linkedCustomer?c.linked:c.notLinked}{project.customView?' · '+c.custom:''}</span>
    </button>
   </li>)}</ul>
   {error&&error.after&&<div className="mt-3">{retryBox(c.moreError,error.after)}</div>}
   {page.nextCursor!==null&&!(error&&error.after)&&<Button type="button" variant="secondary" className="mt-3" disabled={disabled||!!loading} onClick={()=>void load(page.nextCursor!)}>{loading==='more'?c.loading:c.more}</Button>}
  </div>}
 </section>;
}
