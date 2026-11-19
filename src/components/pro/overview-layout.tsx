'use client';
import {useEffect,useRef,useState} from 'react';
import {useLocale} from 'next-intl';
import {ArrowDown,ArrowUp} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {defaultOverviewLayout,overviewLayoutPageSchema,overviewWidgets,type OverviewLayout,type OverviewWidget} from '@/lib/pro/round8';

/**
 * Round 8: «Personalizar resumen». Move widgets up/down, hide/show them and reset to the default.
 * The arrangement is saved on the server per person (owner, or each company member separately) and
 * applies to every job overview of that person. CAS by revision; a retried save never duplicates.
 */
export function OverviewLayoutBar({layout,onChange,titles,disabled}:{layout:OverviewLayout;onChange:(layout:OverviewLayout)=>void;titles:Record<OverviewWidget,string>;disabled?:boolean}){
 const en=useLocale()==='en',t=(es:string,english:string)=>en?english:es;
 const [revision,setRevision]=useState<number|null>(null),[custom,setCustom]=useState(false),[editing,setEditing]=useState(false),[draft,setDraft]=useState<OverviewLayout>(layout);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState('');const action=useRef<{key:string;id:string}|null>(null);
 const apply=(body:unknown)=>{const page=overviewLayoutPageSchema.parse(body);setRevision(page.revision);setCustom(page.custom);onChange(page.layout);return page;};
 useEffect(()=>{let alive=true;fetch('/api/pro/overview-layout',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error();return r.json();}).then(body=>{if(alive)apply(body);}).catch(()=>{if(alive)setRevision(null);});return()=>{alive=false;};},[]);// eslint-disable-line react-hooks/exhaustive-deps
 function move(name:OverviewWidget,delta:number){const order=[...draft.order],i=order.indexOf(name),j=i+delta;if(j<0||j>=order.length)return;[order[i],order[j]]=[order[j],order[i]];setDraft({...draft,order});}
 function toggle(name:OverviewWidget){const hidden=draft.hidden.includes(name)?draft.hidden.filter(x=>x!==name):[...draft.hidden,name];if(hidden.length>=overviewWidgets.length)return;setDraft({...draft,hidden});}
 async function save(kind:'save'|'reset'){
  if(revision===null)return;const body=kind==='save'?{action:'save',revision,layout:draft}:{action:'reset',revision};const key=JSON.stringify(body);
  if(action.current?.key!==key)action.current={key,id:crypto.randomUUID()};
  setBusy(true);setError('');setSaved('');
  try{const r=await fetch('/api/pro/overview-layout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,actionId:action.current.id})});const data=await r.json().catch(()=>({}));
   if(r.status===409){setError(t('La disposición cambió en otra pestaña. Recargue la página.','The layout changed in another tab. Reload the page.'));return;}
   if(!r.ok)throw Error(typeof data?.error==='string'?data.error:'');
   const page=apply(data);setDraft(page.layout);setEditing(false);action.current=null;setSaved(kind==='reset'?t('Se restableció el resumen predeterminado.','The default overview was restored.'):t('Disposición guardada.','Layout saved.'));}
  catch(failure){setError((failure as Error).message||t('No se pudo comprobar el guardado. Reintente: no se duplicará.','Could not confirm the save. Retry: it will not be duplicated.'));}finally{setBusy(false);}
 }
 return <div data-overview-layout className="space-y-2">
  <div className="flex flex-wrap items-center justify-end gap-2">
   {saved&&<p role="status" className="mr-auto text-sm text-green-800">{saved}</p>}
   {!editing&&<Button type="button" variant="outline" className="min-h-11" disabled={disabled||revision===null} onClick={()=>{setDraft(layout);setEditing(true);setSaved('');}}>{t('Personalizar resumen','Customize overview')}</Button>}
  </div>
  {editing&&<section data-overview-layout-editor aria-label={t('Personalizar resumen','Customize overview')} className="space-y-3 rounded-xl border border-[#d7e1ea] bg-white p-4">
   <p className="text-sm text-[#52627a]">{t('Ordene los bloques y elija cuáles ver. Se guarda para su cuenta y aplica a todos sus trabajos.','Order the blocks and choose which to show. It is saved for your account and applies to all your jobs.')}</p>
   <ol className="space-y-2">{draft.order.map((name,i)=>{const shown=!draft.hidden.includes(name);return <li key={name} data-overview-layout-item={name} className="flex flex-wrap items-center gap-2 rounded-lg border border-[#e5e7eb] p-2">
    <span className="min-w-0 flex-1 font-semibold">{titles[name]}</span>
    <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={shown} disabled={busy||shown&&draft.hidden.length>=overviewWidgets.length-1} onChange={()=>toggle(name)} className="h-5 w-5"/>{t('Visible','Visible')}</label>
    <Button type="button" variant="outline" className="h-11 w-11 p-0" aria-label={t(`Subir ${titles[name]}`,`Move ${titles[name]} up`)} disabled={busy||i===0} onClick={()=>move(name,-1)}><ArrowUp className="h-4 w-4"/></Button>
    <Button type="button" variant="outline" className="h-11 w-11 p-0" aria-label={t(`Bajar ${titles[name]}`,`Move ${titles[name]} down`)} disabled={busy||i===draft.order.length-1} onClick={()=>move(name,1)}><ArrowDown className="h-4 w-4"/></Button>
   </li>;})}</ol>
   {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
   <div className="flex flex-wrap gap-2">
    <Button type="button" disabled={busy} onClick={()=>void save('save')}>{busy?t('Guardando…','Saving…'):t('Guardar disposición','Save layout')}</Button>
    <Button type="button" variant="secondary" disabled={busy||!custom&&JSON.stringify(draft)===JSON.stringify(defaultOverviewLayout())} onClick={()=>void save('reset')}>{t('Restablecer predeterminado','Reset to default')}</Button>
    <Button type="button" variant="outline" disabled={busy} onClick={()=>{setEditing(false);setError('');}}>{t('Cancelar','Cancel')}</Button>
   </div>
  </section>}
 </div>;
}
