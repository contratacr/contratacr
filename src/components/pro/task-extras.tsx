'use client';
import {useCallback,useEffect,useState} from 'react';
import {useLocale} from 'next-intl';
import {Button} from '@/components/ui/button';
import {parseTags,taskExtrasSchema} from '@/lib/pro/project-extras';
import {ExtrasConflict,readExtras,saveExtras,type ExtrasRow} from './use-project-extras';

/** Area C: tags and linked schedule phase of each task (Houzz "Tags" and "Schedule" columns). Side store, one request per page. */
export type TaskLink={phase:string|null;start:string|null;end:string|null};
export function useTaskExtras(workId:string,taskIds:string[]){
 const key=taskIds.join(','),[state,setState]=useState<{key:string;rows:Record<string,ExtrasRow>;links:Record<string,TaskLink>;error:boolean}>({key:'',rows:{},links:{},error:false});
 const load=useCallback(async()=>{
  if(!key){setState({key,rows:{},links:{},error:false});return;}
  try{const r=await readExtras({scope:'work',workId,kind:'task',keys:key});setState({key,rows:r.items,links:r.links??{},error:false});}
  catch{setState(old=>({...old,key,error:true}));}
 },[workId,key]);
 useEffect(()=>{const timer=setTimeout(()=>void load(),0);return()=>clearTimeout(timer);},[load]);
 const tagsOf=(id:string)=>{const parsed=taskExtrasSchema.safeParse(state.rows[id]?.data??{tags:[]});return parsed.success?parsed.data.tags:[];};
 return {...state,loaded:state.key===key,tagsOf,reload:load,setRow:(id:string,row:ExtrasRow)=>setState(old=>({...old,rows:{...old.rows,[id]:row}}))};
}
export function TaskTagFilter({tags,value,onChange}:{tags:string[];value:string;onChange:(tag:string)=>void}){
 const en=useLocale()==='en';
 return <label className="block text-sm font-semibold">{en?'Tags':'Etiquetas'}<select data-task-tag-filter value={value} onChange={e=>onChange(e.target.value)} className="mt-1 block min-h-11 w-full min-w-0 rounded-xl border border-[#d7e1ea] bg-white px-3 py-2 text-base font-normal"><option value="">{en?'All tags':'Todas las etiquetas'}</option>{tags.map(tag=><option key={tag} value={tag}>{tag}</option>)}</select></label>;
}
export function TaskExtrasRow({workId,taskId,extras,disabled}:{workId:string;taskId:string;extras:ReturnType<typeof useTaskExtras>;disabled?:boolean}){
 const en=useLocale()==='en',t=(es:string,english:string)=>en?english:es;
 const tags=extras.tagsOf(taskId),link=extras.links[taskId],[editing,setEditing]=useState(false),[text,setText]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function save(){
  const next=parseTags(text);setBusy(true);setError('');
  try{const row=await saveExtras({scope:'work',workId,kind:'task',key:taskId,revision:extras.rows[taskId]?.revision??0,data:{tags:next}});extras.setRow(taskId,row);setEditing(false);}
  catch(failure){setError(failure instanceof ExtrasConflict?t('Las etiquetas cambiaron. Recargue antes de guardar.','The tags changed. Reload before saving.'):t('No se pudo guardar. Reintente.','Could not save. Try again.'));if(failure instanceof ExtrasConflict)void extras.reload();}
  finally{setBusy(false);}
 }
 if(!extras.loaded)return null;
 return <div data-task-extras={taskId} className="space-y-2 text-sm">
  {link?.phase!==undefined&&link&&<p data-task-schedule-link className="break-words text-[#52627a]"><span className="font-semibold text-[#172744]">{t('Cronograma: ','Schedule: ')}</span>{link.phase??t('Sin fase','No phase')}{link.start&&link.end?' · '+link.start+' → '+link.end:''}</p>}
  <div className="flex flex-wrap items-center gap-2">
   {tags.map(tag=><span key={tag} data-task-tag className="rounded-full bg-[#e6f4f9] px-3 py-1 text-xs font-semibold text-[#0f5f8c]">{tag}</span>)}
   {!editing&&<Button type="button" variant="outline" className="min-h-11" data-pro-write="work.write" data-task-tags-edit disabled={disabled} onClick={()=>{setText(tags.join(', '));setEditing(true);}}>{tags.length?t('Editar etiquetas','Edit tags'):t('Agregar etiquetas','Add tags')}</Button>}
  </div>
  {editing&&<div className="space-y-2"><label className="block font-semibold">{t('Etiquetas (separadas por coma)','Tags (comma separated)')}<input data-task-tags-input value={text} maxLength={250} onChange={e=>setText(e.target.value)} className="mt-1 block min-h-11 w-full min-w-0 rounded-xl border border-[#d7e1ea] px-3 text-base font-normal"/></label>
   <div className="flex flex-wrap gap-2"><Button type="button" data-task-tags-save disabled={busy} onClick={()=>void save()}>{busy?t('Guardando…','Saving…'):t('Guardar etiquetas','Save tags')}</Button><Button type="button" variant="outline" disabled={busy} onClick={()=>{setEditing(false);setError('');}}>{t('Cancelar','Cancel')}</Button></div></div>}
  {error&&<p role="alert" className="text-red-700">{error}</p>}
 </div>;
}
