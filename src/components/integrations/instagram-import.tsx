'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {Check,Loader2} from 'lucide-react';
import {InstagramIcon} from '@/components/icons/social-icons';
import {Modal} from '@/components/ui/modal';
import {makePlaceVariants} from '@/lib/client-image-variants';
import {INSTAGRAM_IMPORT_MAX} from '@/lib/integrations/instagram/types';

/**
 * "Importar desde Instagram" (owner request 2026-11-27, docs/instagram-import.md). A secondary button next to the normal
 * upload of (a) a place's «Agregar fotos» panel for its managers and (b) the success-case form of a professional. It opens a
 * sheet: connect the account (Business or Creator) in a small window → grid of the account's recent photos → choose up to
 * `max` → «Importar seleccionadas». Each photo goes through the server pipeline of normal uploads; already imported ones are
 * marked and skipped. Rendered only when INSTAGRAM_IMPORT_UI_ENABLED (the caller checks it).
 */
type Item={id:string;type:string;permalink:string|null;timestamp:string|null;imported:boolean};
type Phase='loading'|'connect'|'grid'|'importing'|'done'|'error';
export type InstagramImportResult={added:number;skipped:number;urls:string[];errors:string[]};
const IG_MESSAGE='contratacr:instagram';
const ring='focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#009FD9]';

export function InstagramImportButton({target,slug,locale,max=INSTAGRAM_IMPORT_MAX,onImported,className,disabled}:{
 target:'place'|'portfolio';slug?:string;locale:string;max?:number;onImported?:(r:InstagramImportResult)=>void;className?:string;disabled?:boolean;
}){
 const en=locale==='en',t=(es:string,english:string)=>en?english:es,prefix=en?'/en':'';
 const cap=Math.max(0,Math.min(INSTAGRAM_IMPORT_MAX,max));
 const [open,setOpen]=useState(false),[phase,setPhase]=useState<Phase>('loading'),[username,setUsername]=useState<string|null>(null);
 const [items,setItems]=useState<Item[]>([]),[picked,setPicked]=useState<string[]>([]),[rights,setRights]=useState(false);
 const [progress,setProgress]=useState(0),[result,setResult]=useState<InstagramImportResult|null>(null),[problem,setProblem]=useState<string|null>(null);
 const [waiting,setWaiting]=useState(false);
 const query=new URLSearchParams(target==='place'?{target,slug:slug??''}:{target}).toString();
 // Imported while this button is mounted (e.g. into a success case not saved yet, which the server does not see).
 const session=useRef(new Set<string>());
 // Set again on mount: React's development double mount runs the cleanup once before the real mount.
 const alive=useRef(true);useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);

 const load=useCallback(async()=>{
  setProblem(null);
  try{
   const s=await fetch('/api/integrations/instagram/connection',{cache:'no-store'});
   const sj=await s.json().catch(()=>({})) as {connected?:boolean;username?:string|null};
   if(!alive.current)return;
   if(!s.ok){setPhase('error');setProblem(t('La importación desde Instagram no está disponible en este momento.','Importing from Instagram is not available right now.'));return;}
   if(!sj.connected){setPhase('connect');return;}
   setWaiting(false);setUsername(sj.username??null);
   const m=await fetch(`/api/integrations/instagram/media?${query}`,{cache:'no-store'});
   const mj=await m.json().catch(()=>({})) as {items?:Item[];username?:string|null;reason?:string;error?:string};
   if(!alive.current)return;
   if(m.status===409&&mj.reason==='not_connected'){setPhase('connect');return;}
   if(!m.ok){setPhase('error');setProblem(mj.error??t('No se pudieron cargar sus fotos de Instagram. Intente de nuevo.','Your Instagram photos could not be loaded. Try again.'));return;}
   setItems((mj.items??[]).map(x=>session.current.has(x.id)?{...x,imported:true}:x));setPicked([]);setPhase('grid');
  }catch{if(alive.current){setPhase('error');setProblem(t('No se pudieron cargar sus fotos de Instagram. Intente de nuevo.','Your Instagram photos could not be loaded. Try again.'));}}
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[query,en]);

 // The connect window tells this page when it is done (postMessage from /integraciones/instagram/listo); coming back to the
 // tab also re-checks, for browsers that open the window as a tab.
 useEffect(()=>{
  if(!open)return;
  const onMsg=(e:MessageEvent)=>{if(e.origin===window.location.origin&&(e.data as {type?:string})?.type===IG_MESSAGE)void load();};
  const onFocus=()=>{if(waiting)void load();};
  window.addEventListener('message',onMsg);window.addEventListener('focus',onFocus);
  return()=>{window.removeEventListener('message',onMsg);window.removeEventListener('focus',onFocus);};
 },[open,waiting,load]);

 function start(){setOpen(true);setPhase('loading');setResult(null);setRights(false);void load();}
 function connect(){
  const done=`${prefix}/integraciones/instagram/listo`;
  const w=window.open(`/api/integrations/instagram/connect?return=${encodeURIComponent(done)}`,'contratacr-instagram','popup,width=520,height=760');
  if(w){setWaiting(true);return;}
  // Popup blocked: connect in this tab and come back here.
  window.open(`/api/integrations/instagram/connect?return=${encodeURIComponent(window.location.pathname+window.location.search)}`,'_self');
 }
 async function disconnect(){
  await fetch('/api/integrations/instagram/connection',{method:'DELETE'}).catch(()=>null);
  setItems([]);setPicked([]);setUsername(null);setPhase('connect');
 }
 function toggle(id:string){setPicked(p=>p.includes(id)?p.filter(x=>x!==id):p.length>=cap?p:[...p,id]);}

 async function importPicked(){
  setPhase('importing');setProgress(0);
  const out:InstagramImportResult={added:0,skipped:0,urls:[],errors:[]};
  for(const [n,id] of picked.entries()){
   setProgress(n+1);
   const form=new FormData();form.set('target',target);if(slug)form.set('slug',slug);form.set('mediaId',id);form.set('rights','1');
   try{
    if(target==='place'){
     // Storage plan 2026-11-26: the browser makes the 1600/800/320 variants and the server validates them as-is.
     const src=await fetch(`/api/integrations/instagram/media/${encodeURIComponent(id)}`);
     if(src.ok){
      const blob=await src.blob(),file=new File([blob],`${id}.jpg`,{type:blob.type||'image/jpeg'});
      const v=await makePlaceVariants(file).catch(()=>null);
      if(v){form.set('file',v.v1600);form.set('v800',v.v800);form.set('v320',v.v320);}
     }
    }
    const r=await fetch('/api/integrations/instagram/import',{method:'POST',body:form,headers:{'accept-language':en?'en':'es'}});
    const j=await r.json().catch(()=>({})) as {status?:string;url?:string;error?:string};
    if(r.ok&&j.status==='imported'){out.added++;if(j.url)out.urls.push(j.url);session.current.add(id);}
    else if(r.ok&&j.status==='skipped'){out.skipped++;session.current.add(id);}
    else out.errors.push(j.error??t('No se pudo importar una foto.','A photo could not be imported.'));
   }catch{out.errors.push(t('No se pudo importar una foto.','A photo could not be imported.'));}
  }
  if(!alive.current)return;
  setResult(out);setPhase('done');setPicked([]);setRights(false);
  if(out.added>0)onImported?.(out);
 }

 const btn=`inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold ${ring}`;
 const added=(n:number)=>n===1?t('Se agregó 1 foto.','1 photo was added.'):t(`Se agregaron ${n} fotos.`,`${n} photos were added.`);
 const footer=phase==='grid'?<div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-end">
   <button type="button" onClick={()=>setOpen(false)} className={`${btn} hidden border border-[#162543] text-[#162543] sm:inline-flex`}>{t('Cancelar','Cancel')}</button>
   <button type="button" data-instagram-import-submit disabled={picked.length===0||!rights} onClick={()=>void importPicked()} className={`${btn} bg-[#162543] text-white disabled:opacity-50`}>
    {t('Importar seleccionadas','Import selected')}{picked.length>0?` (${picked.length})`:''}</button>
  </div>
  :phase==='done'?<div className="flex w-full justify-end"><button type="button" onClick={()=>setOpen(false)} className={`${btn} w-full bg-[#162543] text-white sm:w-auto`}>{t('Listo','Done')}</button></div>:undefined;

 return <>
  <button type="button" data-instagram-import-open disabled={disabled||cap===0} onClick={start}
   className={className??`${btn} border border-[#162543] bg-white text-[#162543] hover:bg-[#F7FAFC] disabled:opacity-50`}>
   <InstagramIcon className="h-4 w-4"/>{t('Importar desde Instagram','Import from Instagram')}</button>
  {/* z-[130]: above the place page's photo panel, a z-[120] bottom sheet on phones that hosts this button. */}
  {open&&<Modal className="z-[130]" onClose={()=>setOpen(false)} title={t('Importar desde Instagram','Import from Instagram')} closeLabel={t('Cerrar','Close')} mobilePresentation="sheet" size="lg"
   footer={footer} bodyClassName="bg-white px-4 py-4">
   <div data-instagram-import-sheet data-phase={phase} className="space-y-4 text-[#162543]">
    {phase==='loading'&&<p className="flex items-center gap-2 text-sm text-slate-700"><Loader2 aria-hidden className="h-4 w-4 animate-spin"/>{t('Cargando…','Loading…')}</p>}
    {phase==='error'&&<p role="alert" className="text-sm font-semibold text-red-800">{problem}</p>}
    {phase==='connect'&&<div className="space-y-3" data-instagram-connect>
     <p className="text-base font-semibold">{t('Conectar su cuenta de Instagram (Empresa o Creador)','Connect your Instagram account (Business or Creator)')}</p>
     <p className="text-sm text-slate-700">{t('Se abre una ventana de Instagram para que usted autorice a ContrataCR a ver las fotos publicadas de su cuenta. ContrataCR no publica nada en Instagram y puede desconectarla cuando quiera.','An Instagram window opens so you can let ContrataCR see the published photos of your account. ContrataCR never posts on Instagram, and you can disconnect it at any time.')}</p>
     <p className="text-sm text-slate-700">{t('Funciona con cuentas de Empresa o de Creador. Una cuenta personal se cambia en Instagram: Configuración, Tipo de cuenta.','It works with Business or Creator accounts. A personal account can be switched in Instagram: Settings, Account type.')}</p>
     <button type="button" data-instagram-connect-start onClick={connect} className={`${btn} w-full bg-[#162543] text-white sm:w-auto`}><InstagramIcon className="h-4 w-4"/>{t('Conectar Instagram','Connect Instagram')}</button>
     {waiting&&<p className="text-sm text-slate-700" role="status">{t('Termine en la ventana de Instagram. Esta pantalla se actualiza sola.','Finish in the Instagram window. This screen updates by itself.')}</p>}
    </div>}
    {phase==='grid'&&<div className="space-y-3" data-instagram-grid>
     <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
      <p className="font-semibold">{username?`@${username}`:t('Cuenta conectada','Connected account')}</p>
      <button type="button" data-instagram-disconnect onClick={()=>void disconnect()} className={`rounded text-sm font-semibold text-[#00688f] underline ${ring}`}>{t('Desconectar Instagram','Disconnect Instagram')}</button>
     </div>
     <p className="text-sm text-slate-700">{cap===1?t('Elija 1 foto.','Choose 1 photo.'):t(`Elija hasta ${cap} fotos.`,`Choose up to ${cap} photos.`)} <span data-instagram-picked>{t(`${picked.length} de ${cap} elegidas.`,`${picked.length} of ${cap} chosen.`)}</span></p>
     {items.length===0?<p className="text-sm text-slate-700">{t('No encontramos fotos publicadas en esta cuenta. Los videos no se pueden importar.','No published photos were found in this account. Videos cannot be imported.')}</p>
     :<ul className="grid grid-cols-3 gap-2">{items.map(m=>{const on=picked.includes(m.id),full=!on&&picked.length>=cap;
      return <li key={m.id}><button type="button" data-instagram-item={m.id} aria-pressed={on} disabled={m.imported||full} onClick={()=>toggle(m.id)}
       aria-label={m.imported?t('Foto ya importada','Photo already imported'):on?t('Quitar de la selección','Remove from selection'):t('Elegir esta foto','Choose this photo')}
       className={`relative block aspect-square w-full overflow-hidden rounded-xl border-2 bg-slate-100 ${on?'border-[#009FD9]':'border-transparent'} ${full?'opacity-60':''} ${ring}`}>
       {/* eslint-disable-next-line @next/next/no-img-element */}
       <img src={`/api/integrations/instagram/media/${encodeURIComponent(m.id)}`} alt="" loading="lazy" className="h-full w-full object-cover"/>
       <span aria-hidden className={`absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full border-2 border-white ${on?'bg-[#009FD9] text-white':'bg-black/35 text-transparent'}`}><Check className="h-3.5 w-3.5"/></span>
       {m.imported&&<span className="absolute inset-x-0 bottom-0 bg-black/60 px-1 py-1 text-center text-xs font-semibold text-white">{t('Ya importada','Already imported')}</span>}
      </button></li>;})}</ul>}
     <label className="flex items-start gap-2.5 text-sm text-[#334155]" data-instagram-rights>
      <input type="checkbox" checked={rights} onChange={e=>setRights(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-[#009FD9]"/>
      <span>{t('Confirmo que tomé estas fotos o tengo permiso para publicarlas. Son de mi propia cuenta de Instagram, no de otras personas ni de otros sitios.','I confirm I took these photos or have permission to publish them. They come from my own Instagram account, not from other people or other sites.')}</span>
     </label>
    </div>}
    {phase==='importing'&&<p role="status" className="flex items-center gap-2 text-sm font-semibold"><Loader2 aria-hidden className="h-4 w-4 animate-spin"/>{t(`Importando ${progress} de ${picked.length}…`,`Importing ${progress} of ${picked.length}…`)}</p>}
    {phase==='done'&&result&&<div role="status" data-instagram-result className="space-y-1 rounded-xl bg-[#F7FAFC] p-3 text-sm">
     {result.added>0&&<p className="font-semibold text-emerald-900" data-instagram-added>{added(result.added)}</p>}
     {result.skipped>0&&<p className="text-[#162543]" data-instagram-skipped>{result.skipped===1?t('1 foto ya estaba importada y se omitió.','1 photo was already imported and was skipped.'):t(`${result.skipped} fotos ya estaban importadas y se omitieron.`,`${result.skipped} photos were already imported and were skipped.`)}</p>}
     {result.added===0&&result.skipped===0&&result.errors.length===0&&<p>{t('No se agregó ninguna foto.','No photo was added.')}</p>}
     {[...new Set(result.errors)].map(e=><p key={e} className="text-red-800">{e}</p>)}
    </div>}
   </div>
  </Modal>}
 </>;
}

/** /integraciones/instagram/listo: tells the page that opened the connect window, then closes it. */
export function InstagramConnectDone({locale,result}:{locale:string;result:'conectado'|'cancelado'|'error'}){
 const en=locale==='en',t=(es:string,english:string)=>en?english:es;
 useEffect(()=>{
  if(!window.opener)return;
  try{(window.opener as Window).postMessage({type:IG_MESSAGE,result},window.location.origin);}catch{}
  const id=window.setTimeout(()=>window.close(),600);return()=>window.clearTimeout(id);
 },[result]);
 return <div role="status" data-instagram-done={result} className="space-y-2">
  <h1 className="text-xl font-bold">{result==='conectado'?t('Su cuenta de Instagram quedó conectada.','Your Instagram account is connected.'):result==='cancelado'?t('No se conectó la cuenta de Instagram.','The Instagram account was not connected.'):t('No se pudo conectar la cuenta de Instagram. Intente de nuevo.','The Instagram account could not be connected. Try again.')}</h1>
  <p className="text-slate-700">{t('Puede cerrar esta ventana y volver a ContrataCR.','You can close this window and go back to ContrataCR.')}</p>
 </div>;
}
