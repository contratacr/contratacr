'use client';
/* eslint-disable @next/next/no-img-element -- Thumbnails of the authenticated owner download route. */
import {useCallback,useEffect,useRef,useState} from 'react';
import {useLocale} from 'next-intl';
import {useAuth} from '@/hooks/use-auth';
import {Button} from '@/components/ui/button';
import {comparisonOwnerSchema,comparisonResultSchema,type ComparisonItem,type ComparisonOwner} from '@/lib/pro/file-comparisons';
import {BeforeAfterSlider} from './before-after-slider';
import {comparisonLabels} from './client-before-after';

/**
 * Row 33, owner side: before/after comparisons of a job. Pick two photos from the job files, optional title and caption
 * (up to 20), edit, mark «Visible para el cliente» (presentation only: it never revokes an access and respects «Archivos
 * y fotos»), archive and restore. Every change is kept in an immutable history. Nothing here sends a message.
 */
const api='/api/pro/work-file-comparisons',fileHref=(id:string)=>'/api/pro/work-files?'+new URLSearchParams({fileId:id});
const COPY={
 es:{title:'Comparación antes y después',intro:'Elija dos fotos de los archivos del trabajo para mostrarlas a su cliente con un deslizador. Marcar una comparación como visible solo cambia lo que ve el cliente: no le quita ni le da acceso a otros archivos.',
  loading:'Cargando comparaciones…',loadFailed:'No se pudieron cargar las comparaciones.',retry:'Reintentar',noPhotos:'Suba al menos dos fotos JPG en los archivos del trabajo para crear una comparación.',
  before:'Foto de antes',after:'Foto de después',choose:'Elija una foto',cmpTitle:'Título (opcional)',caption:'Leyenda (opcional)',create:'Crear comparación',save:'Guardar cambios',cancel:'Cancelar',edit:'Editar',
  visible:'Visible para el cliente',hiddenTag:'No visible',archive:'Archivar',restore:'Restaurar',archived:'Archivadas',empty:'Todavía no hay comparaciones.',untitled:'Sin título',
  unavailable:'Una de las fotos está en la papelera o ya no está lista: el cliente no ve esta comparación.',saved:'Comparación guardada.',failed:'No se pudo guardar. Reintente: no se duplicará.',changed:'La comparación cambió en otra pestaña. Se recargó.',
  same:'Elija dos fotos distintas.',photo:'Una de las fotos ya no está disponible. Elija otra.',limit:'Se alcanzó el máximo de 20 comparaciones por trabajo. Archive una para crear otra.',history:'Historial',
  actions:{create:'Creada',update:'Editada',visibility:'Visibilidad cambiada',archive:'Archivada',restore:'Restaurada'} as Record<string,string>,count:(n:number,max:number)=>`${n} de ${max} activas`,preview:'Vista previa'},
 en:{title:'Before and after comparison',intro:'Pick two photos from the job files to show your customer with a slider. Marking a comparison as visible only changes what the customer sees: it does not grant or remove access to other files.',
  loading:'Loading comparisons…',loadFailed:'Could not load the comparisons.',retry:'Retry',noPhotos:'Upload at least two JPG photos to the job files to create a comparison.',
  before:'Before photo',after:'After photo',choose:'Choose a photo',cmpTitle:'Title (optional)',caption:'Caption (optional)',create:'Create comparison',save:'Save changes',cancel:'Cancel',edit:'Edit',
  visible:'Visible to the customer',hiddenTag:'Not visible',archive:'Archive',restore:'Restore',archived:'Archived',empty:'There are no comparisons yet.',untitled:'Untitled',
  unavailable:'One of the photos is in the trash or no longer ready: the customer does not see this comparison.',saved:'Comparison saved.',failed:'Could not save. Try again: it will not be duplicated.',changed:'The comparison changed in another tab. It was reloaded.',
  same:'Choose two different photos.',photo:'One of the photos is no longer available. Choose another.',limit:'The maximum of 20 comparisons per job was reached. Archive one to create another.',history:'History',
  actions:{create:'Created',update:'Edited',visibility:'Visibility changed',archive:'Archived',restore:'Restored'} as Record<string,string>,count:(n:number,max:number)=>`${n} of ${max} active`,preview:'Preview'},
};
export function BeforeAfterEditor({workId}:{workId:string}){
 const {user,loading}=useAuth();if(loading||!user)return null;return <Session key={user.id+':'+workId} accountId={user.id} workId={workId}/>;
}
function Session({accountId,workId}:{accountId:string;workId:string}){
 const en=useLocale()==='en',c=COPY[en?'en':'es'],lang=en?'en-US':'es-CR';
 const [data,setData]=useState<ComparisonOwner|null>(null),[error,setError]=useState(false),[msg,setMsg]=useState(''),[busy,setBusy]=useState(false);
 const [editing,setEditing]=useState<string|null>(null),[bf,setBf]=useState(''),[af,setAf]=useState(''),[ttl,setTtl]=useState(''),[cap,setCap]=useState('');
 const pending=useRef<{key:string;actionId:string}|null>(null),seq=useRef(0);
 const load=useCallback(async()=>{const n=++seq.current;try{setError(false);const r=await fetch(api+'?'+new URLSearchParams({workId}),{cache:'no-store',headers:{'X-Pro-Expected-Actor':accountId}});if(!r.ok)throw Error();const d=comparisonOwnerSchema.parse(await r.json());if(n===seq.current)setData(d);}catch{if(n===seq.current)setError(true);}},[accountId,workId]);
 useEffect(()=>{const timer=setTimeout(()=>void load(),0);return()=>clearTimeout(timer);},[load]);
 async function run(body:Record<string,unknown>,after?:()=>void){
  if(busy)return;const key=JSON.stringify(body);if(pending.current?.key!==key)pending.current={key,actionId:crypto.randomUUID()};setBusy(true);setMsg('');
  try{const r=await fetch(api,{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json','X-Pro-Expected-Actor':accountId},body:JSON.stringify({...body,actionId:pending.current.actionId,workId})});let json:Record<string,unknown>|null=null;try{json=await r.json();}catch{}
   if(r.status===409){pending.current=null;setMsg(c.changed);setEditing(null);await load();return;}
   if(r.status===400){pending.current=null;const reason=json?.reason;setMsg(reason==='pro_comparison_same'?c.same:reason==='pro_comparison_photo'?c.photo:reason==='pro_comparison_limit'?c.limit:c.failed);return;}
   if(!r.ok)throw Error();comparisonResultSchema.parse(json);pending.current=null;setMsg(c.saved);after?.();await load();}
  catch{setMsg(c.failed);}finally{setBusy(false);}
 }
 const reset=()=>{setEditing(null);setBf('');setAf('');setTtl('');setCap('');};
 const startEdit=(i:ComparisonItem)=>{setEditing(i.id);setBf(i.beforeFileId);setAf(i.afterFileId);setTtl(i.title??'');setCap(i.caption??'');setMsg('');};
 const photos=data?.photos??[];const nameOf=(id:string,fallback:string|null)=>photos.find(p=>p.id===id)?.name??fallback??'';
 const active=(data?.items??[]).filter(i=>!i.archived),archived=(data?.items??[]).filter(i=>i.archived),current=(data?.items??[]).find(i=>i.id===editing);
 const field='mt-1 min-h-11 w-full rounded-xl border border-[#d7e1ea] bg-white px-3 text-base text-[#162543]';
 const ready=!!bf&&!!af&&bf!==af;
 const picker=(label:string,value:string,set:(v:string)=>void,attr:string)=><div className="min-w-0 space-y-2"><label className="block text-sm font-semibold text-[#162543]">{label}
  <select data-comparison-pick={attr} className={field} value={value} disabled={busy} onChange={e=>set(e.target.value)}><option value="">{c.choose}</option>{photos.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
   {value&&!photos.some(p=>p.id===value)&&<option value={value}>{nameOf(value,current?(attr==='before'?current.beforeName:current.afterName):null)}</option>}</select></label>
  {value&&<img src={fileHref(value)} alt="" loading="lazy" className="h-28 w-full rounded-xl bg-[#f3f8fb] object-cover sm:h-36"/>}</div>;
 const row=(i:ComparisonItem)=><li key={i.id} data-comparison={i.id} className="min-w-0 space-y-3 rounded-xl bg-[#f7f9fc] p-3">
  <div className="grid grid-cols-2 gap-2"><img src={fileHref(i.beforeFileId)} alt={c.before+': '+(i.beforeName??'')} loading="lazy" className="h-24 w-full rounded-lg object-cover sm:h-32"/><img src={fileHref(i.afterFileId)} alt={c.after+': '+(i.afterName??'')} loading="lazy" className="h-24 w-full rounded-lg object-cover sm:h-32"/></div>
  <div className="min-w-0"><p className="break-words font-semibold">{i.title||c.untitled}{i.archived&&<span className="ml-2 rounded-full bg-[#eef2f6] px-2 py-0.5 text-xs font-normal text-[#52627a]">{c.archived}</span>}</p>{i.caption&&<p className="break-words text-sm text-[#52627a]">{i.caption}</p>}
   {!i.available&&<p role="status" className="mt-1 text-xs text-[#9a3412]">{c.unavailable}</p>}</div>
  <div className="flex flex-wrap items-center gap-2">
   {!i.archived&&<label className="flex min-h-11 items-center gap-2 text-sm font-semibold"><input type="checkbox" data-comparison-visible={i.id} className="h-5 w-5" checked={i.clientVisible} disabled={busy} data-pro-write="work.write"
    onChange={e=>void run({action:'visibility',comparisonId:i.id,revision:i.revision,visible:e.target.checked})}/>{c.visible}</label>}
   {!i.archived&&<Button type="button" size="sm" variant="outline" data-pro-write="work.write" data-comparison-edit={i.id} disabled={busy} onClick={()=>startEdit(i)}>{c.edit}</Button>}
   {i.archived?<Button type="button" size="sm" variant="outline" data-pro-write="work.write" data-comparison-restore={i.id} disabled={busy} onClick={()=>void run({action:'restore',comparisonId:i.id,revision:i.revision})}>{c.restore}</Button>
    :<Button type="button" size="sm" variant="outline" data-pro-write="work.write" data-comparison-archive={i.id} disabled={busy} onClick={()=>void run({action:'archive',comparisonId:i.id,revision:i.revision})}>{c.archive}</Button>}
  </div>
  {!i.archived&&i.available&&<details className="text-sm"><summary className="min-h-11 cursor-pointer py-2 font-semibold">{c.preview}</summary><BeforeAfterSlider beforeSrc={fileHref(i.beforeFileId)} afterSrc={fileHref(i.afterFileId)} beforeAlt={c.before} afterAlt={c.after} labels={comparisonLabels(en)}/></details>}
 </li>;
 return <section data-before-after-editor aria-label={c.title} className="mt-4 min-w-0 space-y-4 rounded-2xl border border-[#d7e1ea] bg-white p-4">
  <div><h3 className="text-base font-bold text-[#162543]">{c.title}</h3><p className="mt-0.5 max-w-prose text-xs text-[#52627a]">{c.intro}</p></div>
  {error&&<p role="alert" className="text-sm">{c.loadFailed} <Button size="sm" variant="outline" onClick={()=>void load()}>{c.retry}</Button></p>}
  {!data&&!error&&<p role="status" className="text-sm text-[#52627a]">{c.loading}</p>}
  {msg&&<p role="status" data-comparison-notice className="text-sm text-[#1f6f43]">{msg}</p>}
  {data&&<>
   {photos.length<2&&!editing?<p className="text-sm text-[#52627a]">{c.noPhotos}</p>
    :<form data-comparison-form className="space-y-3 rounded-xl border border-[#e3eaf1] p-3" onSubmit={e=>{e.preventDefault();if(!ready)return;void run(editing?{action:'update',comparisonId:editing,revision:current?.revision??1,beforeFileId:bf,afterFileId:af,title:ttl.trim()||null,caption:cap.trim()||null}:{action:'create',beforeFileId:bf,afterFileId:af,title:ttl.trim()||null,caption:cap.trim()||null},reset);}}>
     <div className="grid gap-3 sm:grid-cols-2">{picker(c.before,bf,setBf,'before')}{picker(c.after,af,setAf,'after')}</div>
     <div className="grid gap-3 sm:grid-cols-2"><label className="block text-sm font-semibold text-[#162543]">{c.cmpTitle}<input data-comparison-title className={field} maxLength={120} value={ttl} disabled={busy} onChange={e=>setTtl(e.target.value)}/></label>
      <label className="block text-sm font-semibold text-[#162543]">{c.caption}<input data-comparison-caption className={field} maxLength={300} value={cap} disabled={busy} onChange={e=>setCap(e.target.value)}/></label></div>
     {bf&&af&&bf===af&&<p role="alert" className="text-sm text-[#9a3412]">{c.same}</p>}
     <div className="flex flex-wrap gap-2"><Button type="submit" data-pro-write="work.write" data-comparison-save disabled={busy||!ready||(!editing&&active.length>=data.max)}>{editing?c.save:c.create}</Button>{editing&&<Button type="button" variant="outline" disabled={busy} onClick={reset}>{c.cancel}</Button>}
      <span className="self-center text-xs text-[#52627a]">{c.count(active.length,data.max)}</span></div>
    </form>}
   {active.length===0&&archived.length===0?<p className="text-sm text-[#52627a]">{c.empty}</p>:<ul className="grid gap-3 lg:grid-cols-2">{active.map(row)}</ul>}
   {archived.length>0&&<details><summary className="min-h-11 cursor-pointer py-2 text-sm font-bold">{c.archived} ({archived.length})</summary><ul className="mt-2 grid gap-3 lg:grid-cols-2">{archived.map(row)}</ul></details>}
   {data.history.length>0&&<details data-comparison-history><summary className="min-h-11 cursor-pointer py-2 text-sm font-bold">{c.history}</summary>
    <ul className="space-y-1 text-sm text-[#52627a]">{data.history.map((h,i)=><li key={i}>{c.actions[h.action]}{h.title?': '+h.title:''} · {new Intl.DateTimeFormat(lang,{dateStyle:'medium',timeStyle:'short',timeZone:'America/Costa_Rica'}).format(new Date(h.at))}</li>)}</ul></details>}
  </>}
 </section>;
}
