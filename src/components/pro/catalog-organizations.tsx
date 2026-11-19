'use client';
import {ProSearchField} from './search-field';
import {useCallback,useEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import {useLocale,useTranslations} from 'next-intl';
import {Button} from '@/components/ui/button';
import {Modal} from '@/components/ui/modal';
import {PagedSelect} from './paged-select';
import {useAppDialog} from '@/hooks/use-app-dialog';
import {closeProStep,currentProPath,PRO_PATH_CHANGED,pushProParams} from '@/lib/pro/navigation';
import {registerProTraversalGuard,useProSearchParams} from './use-pro-search-params';
import {type CatalogOrganization,type ExistingOrganization,type OrganizationKind,type OrganizationPage,organizationNameSchema} from '@/lib/pro/catalog-organizations';
const COPY_KEYS=["discardTitle","discardDescription","discardLabel","groups","categories","notice","active","archived","existing","search","name","create","adopt","rename","archive","restore","save","cancel","more","retry","error","changed","reload","empty","count","close","manual","choose","option","loading","historical","reserved"] as const;
function useCopy(){const translate=useTranslations('ProCatalogOrganizations');return useMemo(()=>Object.fromEntries(COPY_KEYS.map(key=>[key,translate(key)])) as Record<(typeof COPY_KEYS)[number],string>,[translate]);}
const inputClass='min-h-11 w-full rounded-xl border border-[#d7e1ea] bg-white px-3 text-sm';
export function OrganizationSelect({kind,value,onChange,label,disabled=false,name}:{kind:OrganizationKind;value:string;onChange:(value:string)=>void;label:string;disabled?:boolean;name?:string}){
 const en=useLocale()==='en',copy=useCopy(),[optionsVersion,setOptionsVersion]=useState(0),[choicesOpen,setChoicesOpen]=useState(false);
 const chooseLabel=kind==='client_group'?(en?'Choose saved group':'Elegir grupo guardado'):(en?'Choose saved category':'Elegir categoría guardada'),optionsLabel=kind==='client_group'?(en?'Saved groups':'Grupos guardados'):(en?'Saved categories':'Categorías guardadas');
 useEffect(()=>{const refresh=(event:Event)=>{if((event as CustomEvent).detail===kind)setOptionsVersion(value=>value+1);};window.addEventListener('ccr:pro-catalog-organizations-changed',refresh);return()=>window.removeEventListener('ccr:pro-catalog-organizations-changed',refresh);},[kind]);
 return <div className="space-y-2" data-organization-select={kind}>
 <label className="block text-sm font-semibold">{label}<input name={name} aria-label={label} className={inputClass+' mt-1'} value={value} maxLength={80} disabled={disabled} onChange={e=>onChange(e.target.value)}/></label>
 <details open={choicesOpen} onToggle={event=>setChoicesOpen(event.currentTarget.open)}><summary className="min-h-11 cursor-pointer text-sm font-semibold" aria-disabled={disabled} onClick={event=>{if(disabled)event.preventDefault();}}>{chooseLabel}</summary>
 {choicesOpen&&<PagedSelect<CatalogOrganization> key={optionsVersion} url={'/api/pro/catalog-organizations?'+new URLSearchParams({kind})} value="" label={optionsLabel} placeholder={copy.choose} searchLabel={copy.search} moreLabel={copy.more} disabled={disabled} optionLabel={row=>row.name} onChange={row=>{if(row){onChange(row.name);setChoicesOpen(false);}}} parse={body=>(body as OrganizationPage).items}/>}
 </details>
 </div>;
}
export function CatalogOrganizations({kind,onChanged,renderTrigger}:{kind:OrganizationKind;onChanged?:()=>void;renderTrigger?:(open:()=>void)=>ReactNode}){
 const en=useLocale()==='en',copy=useCopy(),params=useProSearchParams(),open=params.get('organizar')===kind,{confirm,dialogNode}=useAppDialog(),allowExit=useRef(false);const [filter,setFilter]=useState<'active'|'archived'|'existing'>('active'),[search,setSearch]=useState(''),[rows,setRows]=useState<(CatalogOrganization|ExistingOrganization)[]>([]),[cursor,setCursor]=useState<string|null>(null),[revision,setRevision]=useState<number|null>(null),[loading,setLoading]=useState(false),[saving,setSaving]=useState(false),[error,setError]=useState(''),[draft,setDraft]=useState(''),[editing,setEditing]=useState<string|null>(null);
 const sequence=useRef(0),mutationBusy=useRef(false),pageBusy=useRef(false),alive=useRef(true),revisionRef=useRef<number|null>(null);
 const invalidate=useCallback(()=>{sequence.current++;pageBusy.current=false;},[]);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;invalidate();};},[invalidate]);
 function resetPage(){invalidate();revisionRef.current=null;setRevision(null);setRows([]);setCursor(null);setLoading(true);}
 const dirty=!!draft||editing!==null;
 useEffect(()=>{if(open)allowExit.current=false;},[open]);
 useEffect(()=>{if(!open||(!dirty&&!saving))return;const path=currentProPath(),state={...window.history.state};let asking=false;
  function unload(event:BeforeUnloadEvent){if(!allowExit.current){event.preventDefault();event.returnValue='';}}
  function back(event:PopStateEvent){if(allowExit.current)return false;event.stopImmediatePropagation();window.history.pushState(state,'',path);window.dispatchEvent(new Event(PRO_PATH_CHANGED));if(saving||mutationBusy.current||asking)return true;asking=true;void confirm({title:copy.discardTitle,description:copy.discardDescription,confirmLabel:copy.discardLabel}).then(answer=>{asking=false;if(answer.confirmed){allowExit.current=true;setDraft('');setEditing(null);window.history.back();}});return true;}
  const unregister=registerProTraversalGuard(back);window.addEventListener('beforeunload',unload);return()=>{unregister();window.removeEventListener('beforeunload',unload);};
 },[open,dirty,saving,confirm,copy]);
 async function close(){if(saving||mutationBusy.current)return;if(dirty&&!(await confirm({title:copy.discardTitle,description:copy.discardDescription,confirmLabel:copy.discardLabel})).confirmed)return;allowExit.current=true;setDraft('');setEditing(null);closeProStep('organizar');}
 const load=useCallback(async(after='')=>{
  if(after&&pageBusy.current)return;pageBusy.current=true;const request=++sequence.current;setLoading(true);setError('');
  try{const response=await fetch('/api/pro/catalog-organizations?'+new URLSearchParams({kind,q:search,after,...(filter==='existing'?{source:'existing'}:{filter})}),{cache:'no-store'});const body=await response.json();if(!response.ok)throw Error(body.error||copy.error);if(request!==sequence.current)return;
   if(after&&revisionRef.current!==body.revision){setError(copy.changed);setCursor(null);setRevision(null);return;}
   revisionRef.current=body.revision;setRevision(body.revision);setRows(old=>after?[...old,...body.items]:body.items);setCursor(body.nextCursor);
  }catch(e){if(request===sequence.current){setError(e instanceof Error?e.message:copy.error);setRevision(null);}}
  finally{if(request===sequence.current){pageBusy.current=false;setLoading(false);}}
 },[kind,filter,search,copy]);
 useEffect(()=>{if(!open)return;const timer=setTimeout(()=>void load(),200);return()=>{clearTimeout(timer);invalidate();};},[open,load,invalidate]);
 async function mutate(action:'create'|'rename'|'archive'|'restore',id=crypto.randomUUID(),name?:string,clearEditor=false){
  if(mutationBusy.current||revision===null)return;
  if(name!==undefined){const result=organizationNameSchema.safeParse(name);if(!result.success){setError(result.error.issues[0].message);return;}name=result.data;}
  mutationBusy.current=true;setSaving(true);setError('');
  try{const response=await fetch('/api/pro/catalog-organizations',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind,action,id,name,revision})});const body=await response.json();if(!response.ok){if(response.status===409){revisionRef.current=null;setRevision(null);setCursor(null);}throw Error(body.error||copy.error);}if(!alive.current)return;if(clearEditor){setDraft('');setEditing(null);}window.dispatchEvent(new CustomEvent('ccr:pro-catalog-organizations-changed',{detail:kind}));onChanged?.();await load();}
  catch(e){if(alive.current)setError(e instanceof Error?e.message:copy.error);}
  finally{mutationBusy.current=false;if(alive.current)setSaving(false);}
 }
 async function beginRename(row:CatalogOrganization){if(dirty&&!(await confirm({title:copy.discardTitle,description:copy.discardDescription,confirmLabel:copy.discardLabel})).confirmed)return;setEditing(row.id);setDraft(row.name);}
 const title=copy[kind==='client_group'?'groups':'categories'];
 function show(){pushProParams({organizar:kind});}
 return <>{renderTrigger?renderTrigger(show):<Button type="button" variant="secondary" onClick={show}>{title}</Button>}<Modal open={open} onClose={()=>void close()} title={title} ariaLabel={title} size="lg" mobilePresentation="fullscreen" closeLabel={copy.close}>
 <div className="space-y-4" data-catalog-organizations={kind}>
 <details className="text-sm text-slate-600"><summary className="min-h-11 cursor-pointer font-semibold">{en?'About saved names':'Acerca de los nombres guardados'}</summary><p>{copy.notice}</p><p className="mt-2">{copy.reserved}</p></details>
 <form className="space-y-3 rounded-2xl border border-[#e5e7eb] p-4" onSubmit={e=>{e.preventDefault();void mutate(editing?'rename':'create',editing??undefined,draft,true);}}><label className="min-w-0 flex-1 text-sm font-semibold">{copy.name}<input aria-label={copy.name} className={inputClass+' mt-1'} value={draft} maxLength={80} disabled={saving} onChange={e=>setDraft(e.target.value)}/></label><div className="flex flex-wrap justify-end gap-2">{editing&&<Button type="button" variant="secondary" disabled={saving} onClick={()=>{setEditing(null);setDraft('');}}>{copy.cancel}</Button>}<Button type="submit" disabled={saving||loading||revision===null||!draft.trim()}>{editing?copy.save:copy.create}</Button></div></form>
 <fieldset disabled={saving} className="min-w-0 space-y-4"><label className="block text-sm font-semibold">{en?'Show names':'Mostrar nombres'}<select aria-label={en?'Show names':'Mostrar nombres'} className={inputClass+' mt-1'} value={filter} onChange={event=>{resetPage();setFilter(event.target.value as 'active'|'archived'|'existing');}}>{(['active','archived','existing'] as const).map(value=><option key={value} value={value}>{copy[value]}</option>)}</select></label>
 <ProSearchField label={copy.search} value={search} onChange={value=>{resetPage();setSearch(value);}}/></fieldset>
 {error&&<p role="alert" className="text-sm text-red-700">{error} <Button type="button" variant="secondary" disabled={saving||loading} onClick={()=>void load()}>{copy.reload}</Button></p>}
 <ul className="divide-y divide-slate-200">{rows.map(row=><li key={'id'in row?row.id:row.name} className="flex flex-wrap items-center justify-between gap-3 py-3"><div className="min-w-0"><p className="break-words font-semibold">{row.name}</p><p className="text-xs text-slate-600">{copy.count}: {row.recordCount}</p></div><div className="flex flex-wrap gap-2">{'id'in row?<><Button type="button" variant="secondary" disabled={saving||loading||revision===null} onClick={()=>void beginRename(row)}>{copy.rename}</Button><Button type="button" variant="secondary" disabled={saving||loading||revision===null} onClick={()=>void mutate(row.archived?'restore':'archive',row.id)}>{row.archived?copy.restore:copy.archive}</Button></>:<Button type="button" variant="secondary" disabled={saving||loading||revision===null} onClick={()=>void mutate('create',undefined,row.name)}>{copy.adopt}</Button>}</div></li>)}</ul>
 {!rows.length&&!error&&<p role="status" className="text-sm text-slate-600">{loading?copy.loading:copy.empty}</p>}
 {cursor&&<Button type="button" variant="secondary" disabled={loading||saving} onClick={()=>void load(cursor)}>{copy.more}</Button>}
 </div></Modal>{dialogNode}</>;
}
