'use client';
import {useEffect,useRef,useState} from 'react';
import {useLocale} from 'next-intl';
import {ArrowDown,ArrowUp} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {defaultOverviewLayout,overviewLayoutPageSchema,overviewLayoutSchema,overviewWidgets,type OverviewLayout,type OverviewWidget} from '@/lib/pro/round8';
import {readExtras,saveExtras,ExtrasConflict} from './use-project-extras';

/**
 * Round 8: «Personalizar resumen». Move widgets up/down, hide/show them and reset to the default.
 * The arrangement is saved on the server per person (owner, or each company member separately) and
 * applies to every job overview of that person. CAS by revision; a retried save never duplicates.
 */
export function OverviewLayoutBar({layout,onChange,titles,disabled,workId}:{workId?:string;layout:OverviewLayout;onChange:(layout:OverviewLayout)=>void;titles:Record<OverviewWidget,string>;disabled?:boolean}){
 const en=useLocale()==='en',t=(es:string,english:string)=>en?english:es;
 const [revision,setRevision]=useState<number|null>(null),[custom,setCustom]=useState(false),[editing,setEditing]=useState(false),[draft,setDraft]=useState<OverviewLayout>(layout);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState('');
 // Area C: scope of the saved arrangement (Houzz "Apply to all projects" / "This project only").
 const [scope,setScope]=useState<'all'|'project'>('all'),[ovRevision,setOvRevision]=useState(0),[hasOverride,setHasOverride]=useState(false);const action=useRef<{key:string;id:string}|null>(null);
 const apply=(body:unknown)=>{const page=overviewLayoutPageSchema.parse(body);setRevision(page.revision);setCustom(page.custom);onChange(page.layout);return page;};
 useEffect(()=>{let alive=true;fetch('/api/pro/overview-layout',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error();return r.json();}).then(async body=>{if(!alive)return;apply(body);if(!workId)return;try{const own=await readExtras({scope:'work',workId,kind:'prefs'}),row=own.items[''];if(!alive||!row)return;setOvRevision(row.revision);const parsed=overviewLayoutSchema.nullable().safeParse((row.data as {layout?:unknown}).layout??null);if(parsed.success&&parsed.data){setHasOverride(true);setScope('project');onChange(parsed.data);}}catch{/* the shared arrangement stays */}}).catch(()=>{if(alive)setRevision(null);});return()=>{alive=false;};},[workId]);// eslint-disable-line react-hooks/exhaustive-deps
 function move(name:OverviewWidget,delta:number){const order=[...draft.order],i=order.indexOf(name),j=i+delta;if(j<0||j>=order.length)return;[order[i],order[j]]=[order[j],order[i]];setDraft({...draft,order});}
 function toggle(name:OverviewWidget){const hidden=draft.hidden.includes(name)?draft.hidden.filter(x=>x!==name):[...draft.hidden,name];if(hidden.length>=overviewWidgets.length)return;setDraft({...draft,hidden});}
 async function saveProject(kind:'save'|'reset'){
  if(!workId)return;setBusy(true);setError('');setSaved('');
  try{const next=kind==='save'?draft:null;const row=await saveExtras({scope:'work',workId,kind:'prefs',key:'',revision:ovRevision,data:{layout:next}});setOvRevision(row.revision);setHasOverride(!!next);if(next)onChange(next);else onChange(layout);setEditing(false);setSaved(kind==='reset'?t('Este trabajo vuelve a usar la disposición general.','This job uses the shared layout again.'):t('Disposición guardada solo para este trabajo.','Layout saved for this job only.'));}
  catch(failure){setError(failure instanceof ExtrasConflict?t('La disposición cambió en otra pestaña. Recargue la página.','The layout changed in another tab. Reload the page.'):t('No se pudo guardar. Reintente.','Could not save. Try again.'));}finally{setBusy(false);}
 }
 async function save(kind:'save'|'reset'){
  if(workId&&scope==='project'){await saveProject(kind);return;}
  if(revision===null)return;const body=kind==='save'?{action:'save',revision,layout:draft}:{action:'reset',revision};const key=JSON.stringify(body);
  if(action.current?.key!==key)action.current={key,id:crypto.randomUUID()};
  setBusy(true);setError('');setSaved('');
  try{const r=await fetch('/api/pro/overview-layout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,actionId:action.current.id})});const data=await r.json().catch(()=>({}));
   if(r.status===409){setError(t('La disposición cambió en otra pestaña. Recargue la página.','The layout changed in another tab. Reload the page.'));return;}
   if(!r.ok)throw Error(typeof data?.error==='string'?data.error:'');
   const page=apply(data);if(hasOverride&&workId){try{const row=await saveExtras({scope:'work',workId,kind:'prefs',key:'',revision:ovRevision,data:{layout:null}});setOvRevision(row.revision);setHasOverride(false);}catch{/* the job keeps its own arrangement */}}setDraft(page.layout);setEditing(false);action.current=null;setSaved(kind==='reset'?t('Se restableció el resumen predeterminado.','The default overview was restored.'):t('Disposición guardada.','Layout saved.'));}
  catch(failure){setError((failure as Error).message||t('No se pudo comprobar el guardado. Reintente: no se duplicará.','Could not confirm the save. Retry: it will not be duplicated.'));}finally{setBusy(false);}
 }
 return <div data-overview-layout className="space-y-2">
  <div className="flex flex-wrap items-center justify-end gap-2">
   {saved&&<p role="status" className="mr-auto text-sm text-green-800">{saved}</p>}
   {!editing&&<Button type="button" variant="outline" className="min-h-11" disabled={disabled||revision===null} onClick={()=>{setDraft(layout);setEditing(true);setSaved('');}}>{t('Personalizar resumen','Customize overview')}</Button>}
  </div>
  {editing&&<section data-overview-layout-editor aria-label={t('Personalizar resumen','Customize overview')} className="space-y-3 rounded-xl border border-[#d7e1ea] bg-white p-4">
   <p className="text-sm text-[#52627a]">{t('Ordene los bloques y elija cuáles ver. Se guarda para su cuenta y aplica a todos sus trabajos.','Order the blocks and choose which to show. It is saved for your account and applies to all your jobs.')}</p>
   {workId&&<fieldset data-overview-scope className="space-y-1"><legend className="text-sm font-semibold">{t('Aplicar a','Apply to')}</legend>{(['all','project'] as const).map(value=><label key={value} className="flex min-h-11 items-center gap-2 text-sm"><input type="radio" name="overview-scope" data-overview-scope-option={value} checked={scope===value} disabled={busy} onChange={()=>setScope(value)} className="h-5 w-5"/><span>{value==='all'?t('Todos los trabajos (los demás de su cuenta)','All jobs (every other job of your account)'):t('Solo este trabajo','This job only')}</span></label>)}</fieldset>}
   <ol className="space-y-2">{draft.order.map((name,i)=>{const shown=!draft.hidden.includes(name);return <li key={name} data-overview-layout-item={name} className="flex flex-wrap items-center gap-2 rounded-lg border border-[#e5e7eb] p-2">
    <span className="min-w-0 flex-1 font-semibold">{titles[name]}</span>
    <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={shown} disabled={busy||shown&&draft.hidden.length>=overviewWidgets.length-1} onChange={()=>toggle(name)} className="h-5 w-5"/>{t('Visible','Visible')}</label>
    <Button type="button" variant="outline" className="h-11 w-11 p-0" aria-label={t(`Subir ${titles[name]}`,`Move ${titles[name]} up`)} disabled={busy||i===0} onClick={()=>move(name,-1)}><ArrowUp className="h-4 w-4"/></Button>
    <Button type="button" variant="outline" className="h-11 w-11 p-0" aria-label={t(`Bajar ${titles[name]}`,`Move ${titles[name]} down`)} disabled={busy||i===draft.order.length-1} onClick={()=>move(name,1)}><ArrowDown className="h-4 w-4"/></Button>
   </li>;})}</ol>
   {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
   <div className="flex flex-wrap gap-2">
    <Button type="button" disabled={busy} onClick={()=>void save('save')}>{busy?t('Guardando…','Saving…'):t('Guardar disposición','Save layout')}</Button>
    <Button type="button" variant="secondary" disabled={busy||(scope==='project'?!hasOverride:!custom&&JSON.stringify(draft)===JSON.stringify(defaultOverviewLayout()))} onClick={()=>void save('reset')}>{t('Restablecer predeterminado','Reset to default')}</Button>
    <Button type="button" variant="outline" disabled={busy} onClick={()=>{setEditing(false);setError('');}}>{t('Cancelar','Cancel')}</Button>
   </div>
  </section>}
 </div>;
}
