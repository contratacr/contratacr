'use client';
import {useCallback,useEffect,useState} from 'react';
import {z} from 'zod';
import {Button} from '@/components/ui/button';
import {assigneeNames,boardSorts,UNASSIGNED_FILTER,type BoardSort} from '@/lib/pro/selection-boards';

/**
 * Area E row 12: boards toolbar (search, sort, multi-select assignee filter) and the team member list used to assign a room.
 * Members come from the job's team (same API as Equipo); the room keeps the member's name as its assignee.
 */
const field='mt-1 block min-h-11 w-full min-w-0 rounded-xl border border-[#d7e1ea] bg-white px-3 text-base font-normal';
const membersSchema=z.object({items:z.array(z.object({displayName:z.string(),active:z.boolean()}).passthrough()),nextCursor:z.string().nullable()});

export function useTeamAssignees(accountId:string,workId:string){
 const [names,setNames]=useState<string[]>([]),[ready,setReady]=useState(false);
 const load=useCallback(async()=>{
  try{
   const all:{displayName:string;active:boolean}[]=[];let after:string|null=null;
   for(let page=0;page<5;page++){
    const r:Response=await fetch('/api/pro/team?'+new URLSearchParams({view:'owner',workId,kind:'members',...(after?{after}:{})}),{cache:'no-store',headers:{'X-Pro-Expected-Actor':accountId}});
    if(!r.ok)break;const body=membersSchema.parse(await r.json());all.push(...body.items);after=body.nextCursor;if(!after)break;
   }
   setNames(assigneeNames(all));
  }catch{/* the picker keeps only "Unassigned" and the saved value */}finally{setReady(true);}
 },[accountId,workId]);
 useEffect(()=>{const timer=setTimeout(()=>void load(),0);return()=>clearTimeout(timer);},[load]);
 return {names,ready};
}

/** Select that lists the job's team members plus the value already saved (so an old name is never lost). */
export function AssigneeSelect({en,value,names,onChange,inputProps}:{en:boolean;value:string;names:string[];onChange:(v:string)=>void;inputProps?:Record<string,string>}){
 const options=value&&!names.includes(value)?[value,...names]:names;
 return <select {...inputProps} value={value} onChange={e=>onChange(e.target.value)} className={field}>
  <option value="">{en?'Unassigned':'Sin asignar'}</option>{options.map(n=><option key={n} value={n}>{n}</option>)}</select>;
}

export type BoardsFilter={query:string;sort:BoardSort;assignees:ReadonlySet<string>};
export function BoardsToolbar({en,filter,onChange,names,extraAssignees}:{en:boolean;filter:BoardsFilter;onChange:(f:BoardsFilter)=>void;names:string[];extraAssignees:string[]}){
 const t=(es:string,english:string)=>en?english:es,[open,setOpen]=useState(false),[draft,setDraft]=useState<Set<string>>(new Set(filter.assignees));
 const choices=[...new Set([...names,...extraAssignees])].sort((a,b)=>a.localeCompare(b,'es',{sensitivity:'base'}));
 const sortLabel:Record<BoardSort,string>={custom:t('Personalizado','Custom'),name:t('Nombre','Name')};
 const toggle=(v:string)=>setDraft(prev=>{const next=new Set(prev);if(next.has(v))next.delete(v);else next.add(v);return next;});
 return <div data-boards-toolbar className="flex flex-wrap items-end gap-3 rounded-2xl border border-[#d7e1ea] bg-white p-3">
  <label className="block min-w-0 flex-1 basis-48 text-sm font-semibold">{t('Buscar tableros','Search boards')}<input data-boards-search type="search" maxLength={80} value={filter.query} onChange={e=>onChange({...filter,query:e.target.value})} className={field}/></label>
  <label className="block min-w-0 basis-40 text-sm font-semibold">{t('Ordenar por','Sort by')}<select data-boards-sort value={filter.sort} onChange={e=>onChange({...filter,sort:e.target.value as BoardSort})} className={field}>{boardSorts.map(s=><option key={s} value={s}>{sortLabel[s]}</option>)}</select></label>
  <div className="relative min-w-0 basis-44 text-sm font-semibold">
   <span>{t('Responsables','Assignees')}</span>
   <button type="button" data-boards-assignees-toggle aria-expanded={open} onClick={()=>{setDraft(new Set(filter.assignees));setOpen(v=>!v);}} className={field+' text-left'}>{filter.assignees.size?t(`Responsables (${filter.assignees.size})`,`Assignees (${filter.assignees.size})`):t('Todos los responsables','All assignees')}</button>
   {open&&<div data-boards-assignees-panel role="group" aria-label={t('Filtrar por responsable','Filter by assignee')} className="absolute z-10 mt-1 w-64 max-w-[80vw] space-y-2 rounded-xl border border-[#d7e1ea] bg-white p-3 shadow-lg">
    <label className="flex min-h-11 items-center gap-2 font-normal"><input type="checkbox" data-boards-assignee-option={UNASSIGNED_FILTER} checked={draft.has(UNASSIGNED_FILTER)} onChange={()=>toggle(UNASSIGNED_FILTER)} className="h-5 w-5"/>{t('Sin asignar','Unassigned')}</label>
    {choices.map(n=><label key={n} className="flex min-h-11 items-center gap-2 font-normal"><input type="checkbox" data-boards-assignee-option={n} checked={draft.has(n)} onChange={()=>toggle(n)} className="h-5 w-5"/><span className="min-w-0 break-words">{n}</span></label>)}
    <div className="flex flex-wrap gap-2"><Button type="button" variant="ghost" size="sm" className="min-h-11" data-boards-assignees-clear onClick={()=>setDraft(new Set())}>{t('Quitar todos','Clear all')}</Button>
     <Button type="button" size="sm" className="min-h-11" data-boards-assignees-apply onClick={()=>{onChange({...filter,assignees:new Set(draft)});setOpen(false);}}>{t(`Aplicar (${draft.size})`,`Apply (${draft.size})`)}</Button></div>
   </div>}
  </div>
 </div>;
}
