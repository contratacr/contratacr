'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {Tag} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Modal} from '@/components/ui/modal';
import {proFileSize} from '@/lib/pro/file-size';
import {proDocKindLabel} from '@/lib/pro/file-formats';
import type {CompanyFile} from '@/lib/pro/company-files';
import {COMPANY_FILE_TAG_PRESETS,COMPANY_FILE_TAGS_MAX,companyFileTagLabel,companyFileTagsReadSchema,companyFileTagsResultSchema,type CompanyFileTagsRead} from '@/lib/pro/company-file-tags';

/**
 * Ronda F2-D (row 31): tags of the company library (Plantilla, Manual, Permiso and custom ones),
 * a filter by tag and the per-file editor. Owner only; only metadata travels here.
 */
const api='/api/pro/company-file-tags';
export function useCompanyFileTags(actor:string){
 const [data,setData]=useState<CompanyFileTagsRead|null>(null),[filter,setFilterState]=useState<string|null>(null),[error,setError]=useState(false),sequence=useRef(0);
 const load=useCallback(async(tag:string|null)=>{const n=++sequence.current;try{const r=await fetch(api+(tag?'?'+new URLSearchParams({tag}):''),{cache:'no-store',headers:{'X-Pro-Expected-Actor':actor}});if(!r.ok)throw Error();const body=companyFileTagsReadSchema.parse(await r.json());if(n===sequence.current){setData(body);setError(false);}}catch{if(n===sequence.current)setError(true);}},[actor]);
 useEffect(()=>{const timer=setTimeout(()=>void load(filter),0);const focus=()=>void load(filter);window.addEventListener('focus',focus);return()=>{clearTimeout(timer);window.removeEventListener('focus',focus);};},[load,filter]);
 const save=useCallback(async(fileId:string,tags:string[],actionId:string)=>{const r=await fetch(api,{method:'POST',headers:{'Content-Type':'application/json','X-Pro-Expected-Actor':actor},body:JSON.stringify({action:'set_tags',actionId,fileId,tags})});if(!r.ok)throw Object.assign(Error(),{status:r.status});const result=companyFileTagsResultSchema.parse(await r.json());await load(filter);return result;},[actor,load,filter]);
 return{tags:data?.tags??[],fileTags:data?.fileTags??{},files:data?.files??[],filter,setFilter:(tag:string|null)=>setFilterState(tag),error,reload:()=>load(filter),save};
}
type TagState=ReturnType<typeof useCompanyFileTags>;
export function CompanyFileTagChips({tags,en}:{tags?:string[];en:boolean}){
 if(!tags?.length)return null;
 return <div data-company-file-tags className="flex flex-wrap gap-1">{tags.map(tag=><span key={tag} className="inline-flex min-h-6 items-center gap-1 rounded-full bg-[#eef3f8] px-2 text-xs font-semibold text-[#33475f]"><Tag aria-hidden className="h-3 w-3"/>{companyFileTagLabel(tag,en)}</span>)}</div>;
}
export function CompanyFileTagFilter({state,en,disabled,onPreview}:{state:TagState;en:boolean;disabled:boolean;onPreview:(file:CompanyFile)=>void}){
 if(!state.tags.length&&!state.filter)return null;
 return <section data-company-tag-filter aria-label={en?'Filter by tag':'Filtrar por etiqueta'} className="space-y-3 rounded-2xl border border-[#d7e1ea] bg-white p-3">
  <div className="flex flex-wrap items-center gap-2"><span className="text-sm font-semibold">{en?'Tags':'Etiquetas'}</span>
   {state.tags.map(item=><button key={item.tag} type="button" disabled={disabled} aria-pressed={state.filter===item.tag} onClick={()=>state.setFilter(state.filter===item.tag?null:item.tag)} className={'inline-flex min-h-11 items-center gap-1 rounded-full border px-3 text-sm font-semibold '+(state.filter===item.tag?'border-[#009FD9] bg-[#e8f6fc] text-[#006c8f]':'border-[#d7e1ea] bg-white text-[#33475f]')}><Tag aria-hidden className="h-3.5 w-3.5"/>{companyFileTagLabel(item.tag,en)} <span className="font-normal text-[#68778d]">{item.count}</span></button>)}
   {state.filter&&<Button type="button" variant="ghost" disabled={disabled} onClick={()=>state.setFilter(null)}>{en?'Clear filter':'Quitar filtro'}</Button>}</div>
  {state.error&&<p role="alert" className="text-sm text-red-700">{en?'Could not load the tags.':'No se pudieron cargar las etiquetas.'}</p>}
  {state.filter&&<ul data-company-tag-results className="space-y-2">{state.files.length?state.files.map(file=><li key={file.id} data-company-tag-result={file.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-[#f8fbfd] p-2">
   <div className="min-w-0 flex-1"><p className="break-all text-sm font-semibold">{file.name}</p><p className="text-xs text-[#52627a]">{proDocKindLabel(file.mimeType,en)} · {proFileSize(file.sizeBytes,en)}</p></div>
   <Button type="button" variant="secondary" disabled={disabled} onClick={()=>onPreview(file)}>{en?'View':'Ver'}</Button>
   <Button asChild variant="secondary"><a href={'/api/pro/company-files?'+new URLSearchParams({view:'binary',fileId:file.id})} download={file.name}>{en?'Download':'Descargar'}</a></Button></li>)
   :<li className="text-sm text-[#52627a]">{en?'No files with this tag.':'No hay archivos con esta etiqueta.'}</li>}</ul>}
 </section>;
}
export function CompanyFileTagEditor({file,state,en,onClose}:{file:CompanyFile;state:TagState;en:boolean;onClose:()=>void}){
 const [selected,setSelected]=useState<string[]>(()=>state.fileTags[file.id]??[]),[custom,setCustom]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),action=useRef<{key:string;id:string}|null>(null);
 const toggle=(tag:string)=>setSelected(list=>list.includes(tag)?list.filter(x=>x!==tag):list.length>=COMPANY_FILE_TAGS_MAX?list:[...list,tag]);
 const addCustom=()=>{const tag=custom.trim().toLowerCase().replace(/[\u0000-\u001f\u007f/\\,]/gu,'').slice(0,30);if(!tag)return;if(!selected.includes(tag)&&selected.length<COMPANY_FILE_TAGS_MAX)setSelected([...selected,tag]);setCustom('');};
 async function save(){const key=JSON.stringify([...selected].sort());if(action.current?.key!==key)action.current={key,id:crypto.randomUUID()};setBusy(true);setError('');
  try{await state.save(file.id,selected,action.current.id);action.current=null;onClose();}catch(e){const status=(e as {status?:number}).status;if(status===409||status===400)action.current=null;setError(status===409?(en?'The file changed. Close and open it again.':'El archivo cambió. Cierre y vuelva a abrirlo.'):(en?'Could not save the tags. Retry: it will not be duplicated.':'No se pudieron guardar las etiquetas. Reintente: no se duplicará.'));}finally{setBusy(false);}}
 const title=en?'Tags':'Etiquetas';
 return <Modal title={title} ariaLabel={title} onClose={()=>{if(!busy)onClose();}} closeLabel={en?'Close':'Cerrar'} mobilePresentation="center"
  footer={<><Button type="button" variant="secondary" disabled={busy} onClick={onClose}>{en?'Cancel':'Cancelar'}</Button><Button type="button" disabled={busy} onClick={()=>void save()}>{busy?(en?'Saving…':'Guardando…'):(en?'Save tags':'Guardar etiquetas')}</Button></>}>
  <div data-company-tag-editor className="space-y-4">
   <p className="break-all text-sm font-semibold">{file.name}</p>
   <fieldset className="space-y-2"><legend className="text-sm font-semibold">{en?'Type of document':'Tipo de documento'}</legend><div className="flex flex-wrap gap-2">
    {COMPANY_FILE_TAG_PRESETS.map(tag=><label key={tag} className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-[#d7e1ea] px-3 text-sm"><input type="checkbox" checked={selected.includes(tag)} onChange={()=>toggle(tag)} className="h-4 w-4"/>{companyFileTagLabel(tag,en)}</label>)}</div></fieldset>
   <div className="space-y-2"><label className="block text-sm font-semibold">{en?'Other tag':'Otra etiqueta'}<div className="mt-1 flex gap-2"><input value={custom} maxLength={30} onChange={e=>setCustom(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();addCustom();}}} aria-label={en?'Other tag':'Otra etiqueta'} placeholder={en?'For example: electrical':'Por ejemplo: eléctrico'} className="min-h-11 min-w-0 flex-1 rounded-xl border border-[#d7e1ea] px-3 font-normal"/><Button type="button" variant="secondary" disabled={!custom.trim()||selected.length>=COMPANY_FILE_TAGS_MAX} onClick={addCustom}>{en?'Add':'Agregar'}</Button></div></label>
    <p className="text-xs text-[#52627a]">{en?`Up to ${COMPANY_FILE_TAGS_MAX} tags per file.`:`Hasta ${COMPANY_FILE_TAGS_MAX} etiquetas por archivo.`}</p></div>
   {selected.filter(tag=>!(COMPANY_FILE_TAG_PRESETS as readonly string[]).includes(tag)).length>0&&<div className="flex flex-wrap gap-2">{selected.filter(tag=>!(COMPANY_FILE_TAG_PRESETS as readonly string[]).includes(tag)).map(tag=><button key={tag} type="button" onClick={()=>toggle(tag)} aria-label={(en?'Remove tag ':'Quitar etiqueta ')+tag} className="inline-flex min-h-11 items-center gap-1 rounded-full bg-[#eef3f8] px-3 text-sm font-semibold">{tag} <span aria-hidden>×</span></button>)}</div>}
   {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
  </div>
 </Modal>;
}
