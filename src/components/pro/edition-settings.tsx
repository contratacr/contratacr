'use client';

import {useCallback,useEffect,useRef,useState} from 'react';
import {useLocale} from 'next-intl';
import {Button} from '@/components/ui/button';
import {useProSearchParams} from './use-pro-search-params';
import {EDITION_COPY,MODULE_COPY,PRO_CHOOSABLE_EDITIONS,editionViewSchema,type EditionSettingsView,type ProChoosableEdition} from '@/lib/pro/edition-choice';
import {PRO_EDITION_DEFAULT_MODULES} from '@/lib/pro/editions';

/**
 * Gaps round (2026-11-17): Pro › Ediciones (?tab=pro_editions[&edicion=<edition>]). Shows the workspace edition and
 * lets the owner or a company administrator choose another one (SQL choose_edition: CAS on revision, idempotent
 * actionId). Free during the launch: no prices, no payment data, nothing is charged. Other roles only read.
 * An uncertain answer (network/503) keeps the same actionId so «Comprobar guardado» re-sends the exact request and the
 * SQL answers the saved result (replayed) instead of applying it twice.
 */
type Pending={actionId:string;edition:ProChoosableEdition;revision:number};
const card='rounded-2xl border border-[#e5e7eb] bg-white p-5';
const ownModules=(edition:ProChoosableEdition)=>{const common=new Set(PRO_EDITION_DEFAULT_MODULES.servicios.map(m=>m.module).filter(m=>PRO_EDITION_DEFAULT_MODULES.autos.some(a=>a.module===m)));return PRO_EDITION_DEFAULT_MODULES[edition].map(m=>m.module).filter(m=>!common.has(m));};

async function fetchEditionView():Promise<EditionSettingsView|null>{
 try{const response=await fetch('/api/pro/editions',{cache:'no-store'});if(!response.ok)return null;return editionViewSchema.parse(await response.json());}catch{return null;}
}

export function EditionSettings(){
 const en=useLocale()==='en',params=useProSearchParams(),suggested=params.get('edicion');
 const [view,setView]=useState<EditionSettingsView|null>(null),[loadError,setLoadError]=useState(false);
 const [selected,setSelected]=useState<ProChoosableEdition|null>(null);
 const [busy,setBusy]=useState(false),[message,setMessage]=useState<{kind:'ok'|'error'|'conflict'|'uncertain';text:string}|null>(null);
 const [pending,setPending]=useState<Pending|null>(null),alive=useRef(true);
 const t=(es:string,english:string)=>en?english:es;
 const apply=useCallback((next:EditionSettingsView|null)=>{
  if(!alive.current)return;
  if(!next){setLoadError(true);return;}
  setView(next);setLoadError(false);
  setSelected(current=>current??((PRO_CHOOSABLE_EDITIONS as readonly string[]).includes(suggested??'')&&suggested!==next.edition?suggested as ProChoosableEdition:(PRO_CHOOSABLE_EDITIONS as readonly string[]).includes(next.edition)?next.edition as ProChoosableEdition:null));
 },[suggested]);
 const load=useCallback(()=>fetchEditionView().then(apply),[apply]);
 useEffect(()=>{alive.current=true;fetchEditionView().then(apply);return()=>{alive.current=false;};},[apply]);

 async function send(attempt:Pending){
  setBusy(true);setMessage(null);
  try{
   let response:Response;
   try{response=await fetch('/api/pro/editions',{method:'POST',headers:{'Content-Type':'application/json','X-Pro-Expected-Actor':view!.ownerId},body:JSON.stringify(attempt)});}
   catch{if(alive.current)setMessage({kind:'uncertain',text:t('No se pudo confirmar el cambio. Compruebe el guardado: se reenviará la misma solicitud y no se aplicará dos veces.','The change could not be confirmed. Check the saved result: the same request is sent again and is never applied twice.')});return;}
   if(response.ok){
    setPending(null);
    const name=EDITION_COPY[attempt.edition][en?'en':'es'].name;
    if(alive.current)setMessage({kind:'ok',text:t(`Listo: su edición ahora es "${name}". Es gratis durante el lanzamiento.`,`Done: your edition is now "${name}". It is free during the launch.`)});
    await load();return;
   }
   if(response.status===409){setPending(null);if(alive.current)setMessage({kind:'conflict',text:t('Alguien cambió la edición mientras usted elegía. Recargue para ver la edición actual.','Someone changed the edition while you were choosing. Reload to see the current edition.')});return;}
   if(response.status===403){setPending(null);if(alive.current)setMessage({kind:'error',text:t('Solo el dueño o un administrador de la empresa puede elegir la edición.','Only the owner or a company administrator can choose the edition.')});return;}
   if(response.status>=500){if(alive.current)setMessage({kind:'uncertain',text:t('No se pudo confirmar el cambio. Compruebe el guardado: se reenviará la misma solicitud y no se aplicará dos veces.','The change could not be confirmed. Check the saved result: the same request is sent again and is never applied twice.')});return;}
   setPending(null);if(alive.current)setMessage({kind:'error',text:t('No se pudo guardar la edición. Revise la selección.','The edition could not be saved. Check your choice.')});
  }finally{if(alive.current)setBusy(false);}
 }
 function choose(){
  if(!view||!selected||selected===view.edition||busy)return;
  const attempt={actionId:crypto.randomUUID(),edition:selected,revision:view.revision};
  setPending(attempt);void send(attempt);
 }

 if(loadError)return <section data-edition-settings className={card+' space-y-3'}><p role="alert">{t('No se pudo cargar su edición.','Your edition could not be loaded.')}</p><Button variant="secondary" onClick={()=>{setLoadError(false);void load();}}>{t('Reintentar','Retry')}</Button></section>;
 if(!view)return <p role="status" aria-busy="true">{t('Cargando ediciones…','Loading editions…')}</p>;
 const current=EDITION_COPY[view.edition][en?'en':'es'];
 const options=PRO_CHOOSABLE_EDITIONS;
 return <section data-edition-settings data-edition-current={view.edition} className="space-y-5">
  <div className={card+' space-y-2'}>
   <p className="text-sm font-semibold text-[#52627a]">{t('Edición actual','Current edition')}</p>
   <p className="text-xl font-bold" data-edition-current-name>{current.name}</p>
   <p className="text-[#52627a]">{current.text}</p>
   <p className="text-sm text-[#52627a]">{view.paywallEnabled?t('Las funciones dependen de su plan.','Features depend on your plan.'):t('Durante el lanzamiento todas las funciones de la edición elegida son gratis. No se le cobrará nada al cambiarla.','During the launch every feature of the chosen edition is free. Nothing is charged when you change it.')}</p>
   {!view.active&&<p role="alert" className="font-semibold text-[#9a3412]">{t('Su edición está suspendida. Escríbanos a soporte para reactivarla.','Your edition is suspended. Contact support to reactivate it.')}</p>}
  </div>
  {!view.canChoose&&view.active&&<p data-edition-readonly role="note" className="rounded-xl bg-[#eef3f8] p-3 text-sm">{t('Puede ver la edición de la empresa. Solo el dueño o un administrador puede cambiarla.','You can see the company edition. Only the owner or an administrator can change it.')}</p>}
  <fieldset className="space-y-3" disabled={!view.canChoose||busy}>
   <legend className="mb-2 text-lg font-bold">{t('Elegir edición','Choose an edition')}</legend>
   <div className="grid gap-3 md:grid-cols-2">
    {options.map(edition=>{const copy=EDITION_COPY[edition][en?'en':'es'],checked=selected===edition,isCurrent=view.edition===edition;
     return <label key={edition} data-edition-option={edition} className={`flex cursor-pointer gap-3 rounded-2xl border bg-white p-4 ${checked?'border-[#009FD9] ring-2 ring-[#009FD9]/30':'border-[#e5e7eb]'} has-[:disabled]:cursor-default`}>
      <input type="radio" name="pro-edition" value={edition} checked={checked} onChange={()=>{setSelected(edition);setMessage(null);}} className="mt-1 h-5 w-5 shrink-0 accent-[#162543]"/>
      <span className="min-w-0 space-y-1"><span className="flex flex-wrap items-center gap-2 font-bold">{copy.name}{isCurrent&&<span className="rounded-full bg-[#eaf7fb] px-2 py-0.5 text-xs font-bold text-[#008bb5]">{t('Actual','Current')}</span>}</span>
       <span className="block text-sm text-[#52627a]">{copy.text}</span>
       <span className="block text-xs text-[#52627a]">{t('Incluye: ','Includes: ')}{ownModules(edition).map(m=>MODULE_COPY[m]?.[en?'en':'es']??m).join(', ')}{t(', además de clientes, cotizaciones, citas y pagos.',', plus customers, quotes, appointments and payments.')}</span></span>
     </label>;})}
   </div>
  </fieldset>
  {view.canChoose&&<div className="flex flex-wrap items-center gap-3">
   <Button data-edition-save disabled={busy||!selected||selected===view.edition} onClick={choose}>{busy?t('Guardando…','Saving…'):t('Usar esta edición','Use this edition')}</Button>
   {selected&&selected!==view.edition&&<p className="text-sm text-[#52627a]">{t('Sus datos se conservan: cambiar de edición solo cambia las herramientas que ve.','Your data is kept: changing editions only changes the tools you see.')}</p>}
  </div>}
  {message&&<div data-edition-message={message.kind} role={message.kind==='ok'?'status':'alert'} className={`space-y-2 rounded-xl p-3 text-sm font-semibold ${message.kind==='ok'?'bg-[#ecfdf3] text-[#14532d]':'bg-[#fff8eb] text-[#5c3b00]'}`}>
   <p>{message.text}</p>
   {message.kind==='uncertain'&&pending&&<Button variant="secondary" disabled={busy} onClick={()=>void send(pending)}>{t('Comprobar guardado','Check saved result')}</Button>}
   {message.kind==='conflict'&&<Button variant="secondary" onClick={()=>{setSelected(null);setMessage(null);void load();}}>{t('Recargar','Reload')}</Button>}
   {message.kind==='ok'&&view.edition==='restaurantes'&&<p className="flex flex-wrap gap-2"><a className="underline" href={(en?'/en':'')+'/dashboard/pro/menu'}>{t('Abrir Menú','Open Menu')}</a><a className="underline" href={(en?'/en':'')+'/dashboard/pro/reservas-mesa'}>{t('Abrir Reservas de mesa','Open Table reservations')}</a></p>}
  </div>}
 </section>;
}
