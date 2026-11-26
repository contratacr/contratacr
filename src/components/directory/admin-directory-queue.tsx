'use client';
import {SELECT_CLASS,SELECT_STYLE} from './select-style';
import {useCallback,useEffect,useRef,useState,type ReactNode} from 'react';
import {CLAIM_DOCUMENT_LABELS,REVIEW_FLAG_LABELS,type StaffQueue} from '@/lib/directory/moderation-schemas';
import {PLACE_SECTIONS} from '@/lib/directory/place-verticals';

/**
 * LOCAL PRO ONLY (multivertical M1): staff queue of the public directory in the admin area (/admin/directorio).
 * Tabs: claims (documents / cédula jurídica), reviews and owner replies (flags), user price reports, place reports,
 * pharmacy permits (Decreto 36868-S) and the audit trail. Every decision needs a reason (except approve/publish), is
 * Place features round (2026-11-17): questions & answers, events, brands (merge/split) and brand claims (documents).
 * idempotent (the actionId is kept until the server answers) and sends the state the moderator saw: if someone else
 * changed it first the server answers 409 and the list reloads. ES/EN by page locale.
 */
type Row=Record<string,unknown>;
type Tab=Exclude<StaffQueue,'log'>|'log'|'questions'|'events'|'brands'|'brand_claims'|'photos';
const TABS:[Tab,string,string][]=[['claims','Reclamos','Claims'],['reviews','Reseñas','Reviews'],['photos','Fotos','Photos'],['questions','Preguntas','Questions'],['events','Eventos','Events'],['brands','Marcas','Brands'],['brand_claims','Reclamos de marca','Brand claims'],['prices','Precios','Prices'],['reports','Reportes de lugares','Place reports'],['pharmacies','Farmacias','Pharmacies'],['log','Historial','History']];
const METHOD:Record<string,[string,string]>={hacienda_juridica:['Cédula jurídica (Hacienda)','Corporate ID (Hacienda)'],document_review:['Documentos','Documents']};
const REPORT_KIND:Record<string,[string,string]>={wrong_info:['Información incorrecta','Wrong information'],closed:['Cerró','Closed'],duplicate:['Duplicado','Duplicate'],removal_request:['Pide el retiro','Removal request'],abuse:['Abuso','Abuse'],other:['Otro','Other']};
const VERTICALS:[string,string,string][]=[['restaurant','Restaurante','Restaurant'],['fuel','Gasolinera','Fuel station'],['pharmacy','Farmacia','Pharmacy'],['grocery','Supermercado','Supermarket'],['vehicle_dealer','Agencia de vehículos','Vehicle dealer'],['real_estate','Inmobiliaria','Real estate agency'],
 // 2026-11-17 sections (place-verticals.ts).
 ...PLACE_SECTIONS.filter(v=>v.added).map(v=>[v.id,v.nameEs,v.nameEn] as [string,string,string])];
const PLACE_STATUS:Record<string,[string,string]>={draft:['Borrador','Draft'],published:['Publicado','Published'],hidden:['Oculto','Hidden'],closed_permanently:['Cerrado definitivamente','Permanently closed'],removed:['Retirado','Removed']};
const DECISION:Record<string,[string,string]>={approve:['aprobado','approved'],reject:['rechazado','rejected'],hide:['ocultado','hidden'],restore:['restaurado','restored'],dismiss:['reportes cerrados','reports closed'],publish:['publicado','published'],fix:['datos corregidos','data fixed'],close:['marcado cerrado','marked closed'],remove:['retirado','removed'],recategorize:['cambio de sección','section changed'],verify_permit:['permiso verificado','permit verified'],merge:['marcas unidas','brands merged'],split:['marca separada','brand split'],create:['creado','created']};
const LOG_KIND:Record<string,[string,string]>={claim:['Reclamo','Claim'],review:['Reseña','Review'],reply:['Respuesta','Reply'],price:['Precio','Price'],report:['Reporte','Report'],permit:['Permiso','Permit'],
 question:['Pregunta','Question'],answer:['Respuesta (P&R)','Answer (Q&A)'],event:['Evento','Event'],brand:['Marca','Brand'],brand_claim:['Reclamo de marca','Brand claim'],photo:['Foto','Photo'],place:['Lugar agregado','Place added']};
const ring='focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#009FD9]';
const btn=`inline-flex min-h-11 items-center justify-center rounded-full px-4 text-sm font-semibold disabled:opacity-50 ${ring}`;
const field='min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-base text-[#162543]';
const s=(v:unknown)=>v==null?'':String(v);

export function AdminDirectoryQueue({locale}:{locale:string}){
 const en=locale==='en',t=(es:string,english:string)=>en?english:es,pick=(pair:[string,string]|undefined,fallback='')=>pair?pair[en?1:0]:fallback;
 const [photoFilter,setPhotoFilter]=useState('pending'),[qaFilter,setQaFilter]=useState('flagged'),[eventFilter,setEventFilter]=useState('new');
 const [tab,setTab]=useState<Tab>('claims'),[filter,setFilter]=useState('flagged'),[priceStatus,setPriceStatus]=useState('pending'),[query,setQuery]=useState(''),[offset,setOffset]=useState(0);
 const [data,setData]=useState<{items:Row[];total?:number}|null>(null),[loading,setLoading]=useState(true),[notice,setNotice]=useState<{ok:boolean;text:string}|null>(null),[busy,setBusy]=useState<string|null>(null);
 const [nonce,setNonce]=useState(0);const actions=useRef(new Map<string,string>());
 const date=(iso:unknown)=>iso?new Intl.DateTimeFormat(en?'en-US':'es-CR',{dateStyle:'medium',timeStyle:'short',timeZone:'America/Costa_Rica'}).format(new Date(String(iso))):'';
 const money=(n:unknown,c:unknown)=>new Intl.NumberFormat(en?'en-US':'es-CR',{style:'currency',currency:s(c)||'CRC',maximumFractionDigits:2}).format(Number(n));
 useEffect(()=>{
  let alive=true;
  const qs=new URLSearchParams({queue:tab});
  if(tab==='reviews')qs.set('filter',filter);if(tab==='prices')qs.set('status',priceStatus);if(tab==='pharmacies'){if(query)qs.set('q',query);qs.set('offset',String(offset));}
  if(tab==='questions')qs.set('filter',qaFilter);if(tab==='events')qs.set('filter',eventFilter);if(tab==='brands'&&query)qs.set('q',query);if(tab==='photos')qs.set('filter',photoFilter);
  fetch('/api/admin/directorio?'+qs,{cache:'no-store'}).then(r=>r.json().then(j=>({ok:r.ok,j}))).then(({ok,j})=>{if(!alive)return;setLoading(false);setData(ok?j as {items:Row[];total?:number}:{items:[]});if(!ok)setNotice({ok:false,text:t('No se pudo cargar la cola.','Could not load the queue.')});})
   .catch(()=>{if(alive){setLoading(false);setNotice({ok:false,text:t('No se pudo cargar la cola.','Could not load the queue.')});}});
  return ()=>{alive=false;};
 // eslint-disable-next-line react-hooks/exhaustive-deps -- `t` only depends on the locale
 },[tab,filter,priceStatus,query,offset,nonce,qaFilter,eventFilter,photoFilter]);
 const reload=()=>{setLoading(true);setNonce(n=>n+1);};
 const decide=useCallback(async(key:string,body:Row)=>{
  let actionId=actions.current.get(key);if(!actionId){actionId=crypto.randomUUID();actions.current.set(key,actionId);}
  setBusy(key);setNotice(null);
  try{
   const r=await fetch('/api/admin/directorio',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...body,actionId})});
   const j=await r.json().catch(()=>({})) as {reason?:string;error?:string};
   actions.current.delete(key);
   if(r.ok){setNotice({ok:true,text:en?'Decision saved in the history.':'Decisión guardada en el historial.'});setLoading(true);setNonce(n=>n+1);return true;}
   if(r.status===409){setNotice({ok:false,text:en?'Someone changed this item first. The queue was reloaded.':'Alguien cambió este elemento antes. Se recargó la cola.'});setLoading(true);setNonce(n=>n+1);return false;}
   setNotice({ok:false,text:j.reason==='reason_required'||j.reason==='invalid'?(en?'Check the data: a reason of at least 3 characters is required.':'Revise los datos: se requiere un motivo de al menos 3 caracteres.'):(en?'Could not save the decision.':'No se pudo guardar la decisión.')});
   return false;
  }catch{setNotice({ok:false,text:en?'Connection problem. Try again: the same decision will not be applied twice.':'Problema de conexión. Intente de nuevo: la misma decisión no se aplicará dos veces.'});return false;}
  finally{setBusy(null);}
 },[en]);
 const items=data?.items??[];
 return <div className="space-y-5 text-[#162543]" data-admin-directory data-ready={!loading||undefined}>
  <header className="space-y-1">
   <h1 className="text-2xl font-extrabold">{t('Directorio: cola de revisión','Directory: review queue')}</h1>
   <p className="text-sm text-slate-700">{t('Cada decisión queda en un historial que no se puede editar. Indique siempre el motivo.','Every decision is kept in a history that cannot be edited. Always state the reason.')}</p>
  </header>
  <div role="tablist" aria-label={t('Secciones de la cola','Queue sections')} className="flex gap-2 overflow-x-auto pb-1">
   {TABS.map(([id,es,english])=><button key={id} role="tab" type="button" aria-selected={tab===id} data-admin-dir-tab={id} onClick={()=>{if(tab!==id){setTab(id);setLoading(true);setData(null);setNotice(null);}}}
    className={`${btn} shrink-0 border ${tab===id?'border-[#162543] bg-[#162543] text-white':'border-slate-300 bg-white text-[#162543]'}`}>{en?english:es}</button>)}
  </div>
  {tab==='reviews'&&<Segmented value={filter} onChange={v=>{setFilter(v);setLoading(true);}} options={[['flagged',t('Reportadas','Flagged')],['hidden',t('Ocultas','Hidden')],['recent',t('Recientes','Recent')]]} label={t('Filtro de reseñas','Review filter')}/>}
  {tab==='prices'&&<Segmented value={priceStatus} onChange={v=>{setPriceStatus(v);setLoading(true);}} options={[['pending',t('Pendientes','Pending')],['published',t('Publicados','Published')]]} label={t('Estado de los precios','Price status')}/>}
  {tab==='photos'&&<Segmented value={photoFilter} onChange={v=>{setPhotoFilter(v);setLoading(true);}} options={[['pending',t('Pendientes','Pending')],['flagged',t('Reportadas','Flagged')],['recent',t('Recientes','Recent')]]} label={t('Filtro de fotos','Photo filter')}/>}
  {tab==='questions'&&<Segmented value={qaFilter} onChange={v=>{setQaFilter(v);setLoading(true);}} options={[['flagged',t('Reportadas','Flagged')],['hidden',t('Ocultas','Hidden')],['recent',t('Recientes','Recent')]]} label={t('Filtro de preguntas','Question filter')}/>}
  {tab==='events'&&<Segmented value={eventFilter} onChange={v=>{setEventFilter(v);setLoading(true);}} options={[['new',t('Nuevos o editados','New or edited')],['hidden',t('Ocultos','Hidden')],['recent',t('Recientes','Recent')]]} label={t('Filtro de eventos','Event filter')}/>}
  {tab==='brands'&&<form className="flex flex-wrap items-end gap-2" onSubmit={e=>{e.preventDefault();const v=String(new FormData(e.currentTarget).get('q')??'').trim();setQuery(v);setLoading(true);}}>
   <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm font-medium">{t('Buscar marca','Search brand')}<input name="q" defaultValue={query} maxLength={80} className={field}/></label>
   <button type="submit" className={`${btn} bg-[#162543] text-white`}>{t('Buscar','Search')}</button>
  </form>}
  {tab==='pharmacies'&&<form className="flex flex-wrap items-end gap-2" onSubmit={e=>{e.preventDefault();const v=String(new FormData(e.currentTarget).get('q')??'').trim();setQuery(v);setOffset(0);setLoading(true);}}>
   <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm font-medium">{t('Buscar farmacia por nombre o localidad','Search pharmacy by name or locality')}<input name="q" defaultValue={query} maxLength={80} className={field}/></label>
   <button type="submit" className={`${btn} bg-[#162543] text-white`}>{t('Buscar','Search')}</button>
  </form>}
  {notice&&<p role={notice.ok?'status':'alert'} data-admin-dir-notice={notice.ok?'ok':'error'} className={`rounded-xl p-3 text-sm font-semibold ${notice.ok?'bg-emerald-50 text-emerald-900':'bg-red-50 text-red-800'}`}>{notice.text}</p>}
  {loading?<p className="text-sm text-slate-600" aria-live="polite">{t('Cargando…','Loading…')}</p>
   :items.length===0?<p className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-slate-700" data-admin-dir-empty>{t('No hay elementos pendientes en esta sección.','Nothing pending in this section.')}</p>
   :<ul className="space-y-3">{items.map(row=>{
    const key=s(row.claimId??row.reviewId??row.observationId??row.reportId??row.placeId??row.targetId??row.id)+s(row.at);
    return <li key={key} className="min-w-0 rounded-2xl border border-[#d7e1ea] bg-white p-4" data-admin-dir-item={s(row.claimId??row.reviewId??row.observationId??row.reportId??row.placeId??row.targetId??row.id??'')}>
     {tab==='claims'&&<ClaimCard row={row} en={en} t={t} pick={pick} date={date} busy={busy} decide={decide}/>}
     {tab==='reviews'&&<ReviewCard row={row} en={en} t={t} date={date} busy={busy} decide={decide}/>}
     {tab==='prices'&&<PriceCard row={row} t={t} date={date} money={money} busy={busy} decide={decide}/>}
     {tab==='reports'&&<ReportCard row={row} en={en} t={t} pick={pick} date={date} busy={busy} decide={decide}/>}
     {tab==='pharmacies'&&<PharmacyCard row={row} t={t} busy={busy} decide={decide}/>}
     {tab==='photos'&&<PhotoCard row={row} en={en} t={t} date={date} busy={busy} decide={decide}/>}
     {tab==='questions'&&<QaCard row={row} en={en} t={t} date={date} busy={busy} decide={decide}/>}
     {tab==='events'&&<EventQueueCard row={row} en={en} t={t} date={date} busy={busy} decide={decide}/>}
     {tab==='brands'&&<BrandCard row={row} t={t} busy={busy} decide={decide} brands={items}/>}
     {tab==='brand_claims'&&<BrandClaimCard row={row} t={t} date={date} busy={busy} decide={decide}/>}
     {tab==='log'&&<p className="text-sm"><span className="font-semibold">{pick(LOG_KIND[s(row.kind)],s(row.kind))}</span> · {pick(DECISION[s(row.decision)],s(row.decision))} · {s(row.placeName)} · {date(row.at)}{row.reason?<><br/><span className="text-slate-700">{t('Motivo: ','Reason: ')}{s(row.reason)}</span></>:null}</p>}
    </li>;})}</ul>}
  {tab==='pharmacies'&&data?.total!==undefined&&data.total>20&&<div className="flex items-center justify-between gap-2 text-sm">
   <span>{t(`${offset+1}–${Math.min(offset+20,data.total)} de ${data.total}`,`${offset+1}–${Math.min(offset+20,data.total)} of ${data.total}`)}</span>
   <span className="flex gap-2"><button type="button" disabled={offset===0} onClick={()=>{setOffset(Math.max(0,offset-20));setLoading(true);}} className={`${btn} border border-slate-300`}>{t('Anterior','Previous')}</button>
    <button type="button" disabled={offset+20>=data.total} onClick={()=>{setOffset(offset+20);setLoading(true);}} className={`${btn} border border-slate-300`}>{t('Siguiente','Next')}</button></span>
  </div>}
  <p><button type="button" onClick={reload} className={`${btn} border border-slate-300`}>{t('Recargar','Reload')}</button></p>
 </div>;
}

function Segmented({value,onChange,options,label}:{value:string;onChange:(v:string)=>void;options:[string,string][];label:string}){
 return <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">{options.map(([v,text])=><button key={v} type="button" role="radio" aria-checked={value===v} onClick={()=>onChange(v)}
  className={`${btn} border ${value===v?'border-[#009FD9] bg-[#E6F6FC]':'border-slate-300 bg-white'}`}>{text}</button>)}</div>;
}
type Decide=(key:string,body:Row)=>Promise<boolean>;
type T=(es:string,en:string)=>string;
function Reason({id,t,optional=false}:{id:string;t:T;optional?:boolean}){
 return <label className="flex flex-col gap-1 text-sm font-medium" htmlFor={id}>{optional?t('Motivo (opcional al aprobar)','Reason (optional when approving)'):t('Motivo (obligatorio)','Reason (required)')}
  <textarea id={id} name="reason" rows={2} maxLength={1000} className={`${field} py-2`}/></label>;
}
const reasonOf=(form:HTMLFormElement|null)=>String(new FormData(form??undefined).get('reason')??'').trim();
function PlaceLink({slug,name,en}:{slug:unknown;name:unknown;en:boolean}){
 return <a href={`${en?'/en':''}/lugar/${s(slug)}`} target="_blank" rel="noopener noreferrer" className={`font-semibold underline underline-offset-2 ${ring}`}>{s(name)}</a>;
}
function Actions({children}:{children:ReactNode}){return <div className="flex flex-wrap gap-2">{children}</div>;}

function ClaimCard({row,en,t,pick,date,busy,decide}:{row:Row;en:boolean;t:T;pick:(p:[string,string]|undefined,f?:string)=>string;date:(v:unknown)=>string;busy:string|null;decide:Decide}){
 const form=useRef<HTMLFormElement>(null),id=s(row.claimId),ev=(row.evidence??{}) as {hacienda?:Row;documents?:{kind:string;path:string}[]};
 const send=(decision:string)=>decide(id+decision,{kind:'claim',claimId:id,decision,reason:reasonOf(form.current)});
 return <form ref={form} className="space-y-3" onSubmit={e=>e.preventDefault()}>
  <p className="flex flex-wrap items-center gap-2"><PlaceLink slug={row.slug} name={row.placeName} en={en}/><span className="rounded-full border border-slate-300 px-2 py-0.5 text-xs">{pick(METHOD[s(row.method)],s(row.method))}</span>
   {row.isDispute?<span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-900">{t('Disputa','Dispute')}</span>:null}{row.selfSignup?<span className="rounded-full bg-sky-50 px-2 py-0.5 text-xs">{t('Negocio nuevo','New business')}</span>:null}</p>
  <p className="text-sm [overflow-wrap:anywhere]">{t('Solicita: ','Requested by: ')}{s(row.claimantName)||t('(sin nombre)','(no name)')}{row.claimantEmail?` · ${s(row.claimantEmail)}`:''} · {date(row.createdAt)}</p>
  {ev.hacienda&&<dl className="grid min-w-0 grid-cols-1 gap-x-4 gap-y-1 rounded-xl bg-slate-50 p-3 text-sm sm:grid-cols-[max-content_minmax(0,1fr)]" data-admin-claim-hacienda>
   <dt className="font-medium text-slate-700 sm:text-[#162543]">{t('Cédula jurídica','Corporate ID')}</dt><dd className="min-w-0 break-words">{s(ev.hacienda.cedula)}</dd>
   <dt className="font-medium text-slate-700 sm:text-[#162543]">{t('Nombre en Hacienda','Name at Hacienda')}</dt><dd className="min-w-0 break-words">{s(ev.hacienda.officialName)}</dd>
   <dt className="font-medium text-slate-700 sm:text-[#162543]">{t('Nombre del lugar','Place name')}</dt><dd className="min-w-0 break-words">{s(row.placeName)}</dd>
   <dt className="font-medium text-slate-700 sm:text-[#162543]">{t('Coincidencia con el nombre escrito','Match with the typed name')}</dt><dd className="min-w-0">{Math.round(Number(ev.hacienda.score)*100)} %</dd></dl>}
  {ev.documents&&<ul className="space-y-1 text-sm" data-admin-claim-documents>{ev.documents.map(d=><li key={d.path}><a className={`underline underline-offset-2 ${ring}`} href={`/api/admin/directorio/documento?path=${encodeURIComponent(d.path)}`} target="_blank" rel="noopener noreferrer">{t('Ver documento: ','Open document: ')}{pick(CLAIM_DOCUMENT_LABELS[d.kind as keyof typeof CLAIM_DOCUMENT_LABELS],d.kind)}</a></li>)}</ul>}
  {row.note?<p className="text-sm text-slate-700">{t('Nota: ','Note: ')}{s(row.note)}</p>:null}
  <Reason id={'r-'+id} t={t} optional/>
  <Actions><button type="button" disabled={!!busy} onClick={()=>void send('approve')} className={`${btn} bg-emerald-700 text-white`}>{t('Aprobar reclamo','Approve claim')}</button>
   <button type="button" disabled={!!busy} onClick={()=>void send('reject')} className={`${btn} border border-red-700 text-red-800`}>{t('Rechazar reclamo','Reject claim')}</button></Actions>
 </form>;
}

function ReviewCard({row,en,t,date,busy,decide}:{row:Row;en:boolean;t:T;date:(v:unknown)=>string;busy:string|null;decide:Decide}){
 const form=useRef<HTMLFormElement>(null),id=s(row.reviewId),flags=(row.flags??[]) as {reason:string;message:string|null;at:string}[];
 const send=(target:'review'|'reply',decision:string,expected:unknown)=>decide(id+target+decision,{kind:'review',reviewId:id,target,decision,expectedStatus:s(expected),reason:reasonOf(form.current)});
 const hidden=row.status==='hidden',replyHidden=row.replyStatus==='hidden';
 return <form ref={form} className="space-y-3" onSubmit={e=>e.preventDefault()}>
  <p className="flex flex-wrap items-center gap-2"><PlaceLink slug={row.slug} name={row.placeName} en={en}/>{hidden&&<span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-800">{t('Reseña oculta','Review hidden')}</span>}
   {Number(row.openFlags)>0&&<span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-900" data-admin-review-flags={s(row.openFlags)}>{t(`${s(row.openFlags)} reporte(s)`,`${s(row.openFlags)} report(s)`)}</span>}</p>
  <blockquote className="space-y-1 border-l-4 border-slate-300 pl-3"><p className="text-sm font-semibold">{s(row.name)} · {String(row.rating).replace('.',en?'.':',')} / 5 · {date(row.createdAt)}</p><p className="break-words">{s(row.comment)}</p></blockquote>
  {row.reason?<p className="text-sm text-slate-700">{t('Motivo registrado: ','Recorded reason: ')}{s(row.reason)}</p>:null}
  {flags.length>0&&<ul className="space-y-1 text-sm">{flags.map((f,i)=><li key={i}>• {REVIEW_FLAG_LABELS[f.reason as keyof typeof REVIEW_FLAG_LABELS]?.[en?1:0]??f.reason}{f.message?`: "${f.message}"`:''} · {date(f.at)}</li>)}</ul>}
  {row.ownerReply?<div className="rounded-xl bg-slate-50 p-3 text-sm"><p className="font-semibold">{t('Respuesta del negocio','Reply from the business')}{replyHidden?` · ${t('oculta','hidden')}`:''}</p><p className="break-words">{s(row.ownerReply)}</p></div>:null}
  <Reason id={'r-'+id} t={t}/>
  <Actions>
   {hidden?<button type="button" disabled={!!busy} onClick={()=>void send('review','restore','hidden')} className={`${btn} border border-[#162543]`}>{t('Restaurar reseña','Restore review')}</button>
    :<button type="button" disabled={!!busy} onClick={()=>void send('review','hide','published')} className={`${btn} bg-red-700 text-white`}>{t('Ocultar reseña','Hide review')}</button>}
   {Number(row.openFlags)>0&&!hidden&&<button type="button" disabled={!!busy} onClick={()=>void send('review','dismiss',row.status)} className={`${btn} border border-slate-400`}>{t('Mantener y cerrar reportes','Keep and close reports')}</button>}
   {row.ownerReply?(replyHidden?<button type="button" disabled={!!busy} onClick={()=>void send('reply','restore','hidden')} className={`${btn} border border-[#162543]`}>{t('Restaurar respuesta','Restore reply')}</button>
    :<button type="button" disabled={!!busy} onClick={()=>void send('reply','hide','published')} className={`${btn} border border-red-700 text-red-800`}>{t('Ocultar respuesta','Hide reply')}</button>):null}
  </Actions>
 </form>;
}

function PriceCard({row,t,date,money,busy,decide}:{row:Row;t:T;date:(v:unknown)=>string;money:(n:unknown,c:unknown)=>string;busy:string|null;decide:Decide}){
 const form=useRef<HTMLFormElement>(null),id=s(row.observationId),pending=row.status==='pending';
 const send=(decision:string)=>decide(id+decision,{kind:'price',observationId:id,decision,expectedStatus:s(row.status),reason:reasonOf(form.current)});
 return <form ref={form} className="space-y-3" onSubmit={e=>e.preventDefault()}>
  <p className="font-semibold">{s(row.itemName)}{row.presentation?<span className="font-normal text-slate-600"> · {s(row.presentation)}</span>:null}</p>
  <p className="text-xl font-bold" data-admin-price={s(row.price)}>{money(row.price,row.currency)}</p>
  <p className="text-sm">{s(row.placeName)} · {t('Visto el ','Seen on ')}{date(row.observedAt)} · {t('Reportes que coinciden: ','Matching reports: ')}{s(row.similarReports)}</p>
  <p className="text-xs text-slate-600">{t('Reportado por usuarios. Al publicarlo se muestra con confianza baja hasta que otra persona lo confirme.','Reported by users. Once published it shows with low confidence until another person confirms it.')}</p>
  <Reason id={'r-'+id} t={t} optional={pending}/>
  <Actions>{pending&&<button type="button" disabled={!!busy} onClick={()=>void send('publish')} className={`${btn} bg-emerald-700 text-white`}>{t('Publicar precio','Publish price')}</button>}
   <button type="button" disabled={!!busy} onClick={()=>void send('reject')} className={`${btn} border border-red-700 text-red-800`}>{pending?t('Rechazar precio','Reject price'):t('Retirar precio','Take price down')}</button></Actions>
 </form>;
}

function ReportCard({row,en,t,pick,date,busy,decide}:{row:Row;en:boolean;t:T;pick:(p:[string,string]|undefined,f?:string)=>string;date:(v:unknown)=>string;busy:string|null;decide:Decide}){
 const form=useRef<HTMLFormElement>(null),id=s(row.reportId),place=(row.place??{}) as Row,[decision,setDecision]=useState('fix');
 const submit=()=>{
  const f=new FormData(form.current!),body:Row={kind:'report',reportId:id,decision,reason:reasonOf(form.current)};
  if(decision!=='reject')body.revision=Number(place.revision);
  if(decision==='recategorize')body.vertical=String(f.get('vertical'));
  if(decision==='fix'){const fix:Row={};for(const k of ['name','phone','website','email','addressLine','locality'] as const){const raw=String(f.get(k)??'').trim(),v=k==='email'?raw.toLowerCase():raw,old=s(place[k]);if(v!==old)fix[k]=v===''?(k==='name'?old:null):v;}body.place=fix;}
  return decide(id+decision,body);
 };
 const options:[string,string,string][]=[['fix','Corregir datos','Fix data'],['hide','Ocultar lugar','Hide place'],['close','Marcar cerrado definitivamente','Mark permanently closed'],['remove','Retirar (solicitud de retiro)','Remove (removal request)'],['recategorize','Cambiar de sección','Change section'],['reject','Rechazar reporte','Reject report']];
 return <form ref={form} className="space-y-3" onSubmit={e=>{e.preventDefault();void submit();}}>
  <p className="flex flex-wrap items-center gap-2"><PlaceLink slug={place.slug} name={place.name} en={en}/><span className="rounded-full border border-slate-300 px-2 py-0.5 text-xs">{pick(REPORT_KIND[s(row.kind)],s(row.kind))}</span>
   <span className="text-xs text-slate-600">{pick(VERTICALS.find(v=>v[0]===place.vertical)?.slice(1) as [string,string]|undefined,s(place.vertical))} · {pick(PLACE_STATUS[s(place.status)],s(place.status))}</span></p>
  <p className="break-words">{s(row.message)}</p>
  <p className="text-sm text-slate-700 [overflow-wrap:anywhere]">{date(row.createdAt)}{row.contactEmail?` · ${s(row.contactEmail)}`:''}{Number(row.openReports)>1?` · ${t(`${s(row.openReports)} reportes abiertos de este lugar`,`${s(row.openReports)} open reports for this place`)}`:''}</p>
  <label className="flex flex-col gap-1 text-sm font-medium">{t('Decisión','Decision')}
   <select value={decision} onChange={e=>setDecision(e.target.value)} className={`${field} ${SELECT_CLASS}`} style={SELECT_STYLE}>{options.map(([v,es,english])=><option key={v} value={v}>{en?english:es}</option>)}</select></label>
  {decision==='fix'&&<div className="grid gap-2 sm:grid-cols-2">
   {([['name','Nombre','Name'],['phone','Teléfono','Phone'],['website','Sitio web','Website'],['email','Correo del negocio (privado)','Business e-mail (private)'],['addressLine','Dirección','Address'],['locality','Localidad','Locality']] as const).map(([k,es,english])=>
    <label key={k} className="flex flex-col gap-1 text-sm font-medium">{en?english:es}<input name={k} type={k==='email'?'email':'text'} autoComplete="off" data-fix-field={k} defaultValue={s(place[k])} className={field}/></label>)}
   <p className="text-xs text-slate-600 sm:col-span-2">{t('El correo nunca se publica: solo recibe el código cuando el negocio reclama su ficha.','The e-mail is never published: it only receives the code when the business claims its listing.')}</p>
  </div>}
  {decision==='recategorize'&&<label className="flex flex-col gap-1 text-sm font-medium">{t('Nueva sección','New section')}
   <select name="vertical" defaultValue={VERTICALS.find(v=>v[0]!==place.vertical)?.[0]} className={`${field} ${SELECT_CLASS}`} style={SELECT_STYLE}>{VERTICALS.filter(v=>v[0]!==place.vertical).map(([v,es,english])=><option key={v} value={v}>{en?english:es}</option>)}</select>
   <span className="text-xs font-normal text-slate-600">{t('El cambio conserva el enlace, las reseñas y los datos; solo se quitan los atributos que la nueva sección no usa.','The change keeps the link, reviews and data; only attributes the new section does not use are dropped.')}</span></label>}
  <Reason id={'r-'+id} t={t}/>
  <Actions><button type="submit" disabled={!!busy} className={`${btn} bg-[#162543] text-white`}>{t('Aplicar decisión','Apply decision')}</button></Actions>
 </form>;
}

function PharmacyCard({row,t,busy,decide}:{row:Row;t:T;busy:string|null;decide:Decide}){
 const form=useRef<HTMLFormElement>(null),id=s(row.placeId);
 const submit=()=>{const f=new FormData(form.current!);return decide(id+'permit',{kind:'permit',placeId:id,revision:Number(row.revision),permitNumber:String(f.get('permitNumber')??'').trim(),
  evidence:{kind:String(f.get('evidenceKind')),reference:String(f.get('reference')??'').trim(),...(String(f.get('note')??'').trim()?{note:String(f.get('note')).trim()}:{})}});};
 return <form ref={form} className="space-y-3" onSubmit={e=>{e.preventDefault();void submit();}}>
  <p className="flex flex-wrap items-center gap-2"><span className="font-semibold">{s(row.name)}</span><span className="text-xs text-slate-600">{[row.locality,row.adminArea2,row.adminArea1].filter(Boolean).map(s).join(', ')}</span>
   {row.claimStatus!=='unclaimed'&&<span className="rounded-full bg-sky-50 px-2 py-0.5 text-xs">{t('Reclamada','Claimed')}</span>}<span className="rounded-full border border-slate-300 px-2 py-0.5 text-xs">{(PLACE_STATUS[s(row.status)]??[s(row.status),s(row.status)])[t('0','1')==='0'?0:1]}</span></p>
  <p className="text-xs text-slate-600">{t('Al verificar el permiso la farmacia se vuelve pública. Nunca se publican precios de medicamentos con receta (Decreto 36868-S).','Verifying the permit makes the pharmacy public. Prescription medicine prices are never published (Decreto 36868-S).')}</p>
  <div className="grid gap-2 sm:grid-cols-2">
   <label className="flex flex-col gap-1 text-sm font-medium">{t('Número de permiso sanitario','Health permit number')}<input name="permitNumber" required maxLength={40} defaultValue={s(row.licenseNumber)} className={field}/></label>
   <label className="flex flex-col gap-1 text-sm font-medium">{t('Evidencia','Evidence')}<select name="evidenceKind" className={`${field} ${SELECT_CLASS}`} style={SELECT_STYLE}>
    <option value="official_registry">{t('Consulta en el registro oficial','Official registry lookup')}</option><option value="document">{t('Documento del permiso','Permit document')}</option><option value="inspection">{t('Inspección','Inspection')}</option></select></label>
   <label className="flex flex-col gap-1 text-sm font-medium sm:col-span-2">{t('Referencia de la evidencia','Evidence reference')}<input name="reference" required minLength={3} maxLength={300} className={field}/></label>
   <label className="flex flex-col gap-1 text-sm font-medium sm:col-span-2">{t('Nota (opcional)','Note (optional)')}<input name="note" maxLength={500} className={field}/></label>
  </div>
  <Actions><button type="submit" disabled={!!busy} className={`${btn} bg-emerald-700 text-white`}>{t('Verificar permiso y publicar','Verify permit and publish')}</button></Actions>
 </form>;
}

// ---------------------------------------------------------------- place features round (2026-11-17)
function QaCard({row,en,t,date,busy,decide}:{row:Row;en:boolean;t:T;date:(v:unknown)=>string;busy:string|null;decide:Decide}){
 const ref=useRef<HTMLFormElement>(null),id=s(row.targetId),status=s(row.status),kind=s(row.targetKind);
 const flags=(row.flags as {reason:string;message:string|null}[]|undefined)??[];
 const act=(decision:string)=>decide('qa:'+id+decision,{kind:'qa',targetKind:kind,targetId:id,decision,reason:reasonOf(ref.current),expectedStatus:status});
 return <div className="space-y-2" data-admin-qa={id}>
  <p className="text-sm"><span className="font-semibold">{kind==='question'?t('Pregunta','Question'):t('Respuesta','Answer')}{row.isOwner?` · ${t('del negocio','from the business')}`:''}</span> · <PlaceLink slug={row.slug} name={row.placeName} en={en}/> · {date(row.createdAt)} · {status==='hidden'?t('Oculta','Hidden'):t('Publicada','Published')}</p>
  {row.question?<p className="text-sm text-slate-700">{t('Pregunta:','Question:')} {s(row.question)}</p>:null}
  <p className="break-words">&quot;{s(row.body)}&quot; — {s(row.name)}</p>
  {flags.length>0&&<ul className="list-disc pl-5 text-sm">{flags.map((f,i)=><li key={i}>{pick2(REVIEW_FLAG_LABELS[f.reason as keyof typeof REVIEW_FLAG_LABELS],t)}{f.message?`: ${f.message}`:''}</li>)}</ul>}
  <form ref={ref} onSubmit={e=>e.preventDefault()} className="space-y-2"><Reason id={'qa-r-'+id} t={t}/>
   <div className="flex flex-wrap gap-2">
    {status==='published'?<button type="button" data-admin-qa-hide disabled={busy!==null} onClick={()=>act('hide')} className={`${btn} bg-red-700 text-white`}>{t('Ocultar','Hide')}</button>
     :<button type="button" disabled={busy!==null} onClick={()=>act('restore')} className={`${btn} bg-[#162543] text-white`}>{t('Restaurar','Restore')}</button>}
    {flags.length>0&&<button type="button" disabled={busy!==null} onClick={()=>act('dismiss')} className={`${btn} border border-slate-300`}>{t('Cerrar reportes','Dismiss reports')}</button>}
   </div></form>
 </div>;
}
const pick2=(pair:[string,string]|undefined,t:T)=>pair?t(pair[0],pair[1]):'';
function EventQueueCard({row,en,t,date,busy,decide}:{row:Row;en:boolean;t:T;date:(v:unknown)=>string;busy:string|null;decide:Decide}){
 const ref=useRef<HTMLFormElement>(null),id=s(row.id),hidden=s(row.moderationStatus)==='hidden';
 const act=(decision:string)=>decide('event:'+id+decision,{kind:'event',eventId:id,decision,...(reasonOf(ref.current)?{reason:reasonOf(ref.current)}:{}),expectedRevision:Number(row.revision)});
 return <div className="space-y-2" data-admin-event={id}>
  <p className="text-sm"><span className="font-semibold">{s(row.title)}</span> · <PlaceLink slug={row.slug} name={row.placeName} en={en}/> · {date(row.startsAt)}{row.status==='cancelled'?` · ${t('Cancelado','Canceled')}`:''}{hidden?` · ${t('Oculto','Hidden')}`:''}</p>
  {row.priceText?<p className="text-sm">{s(row.priceText)}</p>:null}{row.description?<p className="whitespace-pre-line text-sm text-slate-700">{s(row.description)}</p>:null}
  <form ref={ref} onSubmit={e=>e.preventDefault()} className="space-y-2"><Reason id={'ev-r-'+id} t={t} optional={!hidden}/>
   <div className="flex flex-wrap gap-2">
    {!hidden&&!row.reviewed&&<button type="button" data-admin-event-approve disabled={busy!==null} onClick={()=>act('approve')} className={`${btn} bg-[#162543] text-white`}>{t('Aprobar','Approve')}</button>}
    {!hidden?<button type="button" data-admin-event-hide disabled={busy!==null} onClick={()=>act('hide')} className={`${btn} bg-red-700 text-white`}>{t('Ocultar','Hide')}</button>
     :<button type="button" disabled={busy!==null} onClick={()=>act('restore')} className={`${btn} bg-[#162543] text-white`}>{t('Restaurar','Restore')}</button>}
   </div></form>
 </div>;
}
function BrandCard({row,t,busy,decide,brands}:{row:Row;t:T;busy:string|null;decide:Decide;brands:Row[]}){
 const ref=useRef<HTMLFormElement>(null),id=s(row.id),branches=(row.branchList as {slug:string;name:string;source:string;province:string|null}[]|undefined)??[];
 const [into,setInto]=useState(''),[picked,setPicked]=useState<string[]>([]),[name,setName]=useState('');
 const sources=Object.entries((row.sources as Record<string,number>|null)??{}).map(([k,v])=>`${k}: ${v}`).join(' · ');
 return <div className="space-y-2" data-admin-brand={s(row.slug)}>
  <p className="text-sm"><a className="font-semibold underline" href={`/marca/${s(row.slug)}`} target="_blank" rel="noopener">{s(row.name)}</a> · {s(row.branches)} {t('sucursales','branches')}{row.wikidata?` · ${s(row.wikidata)}`:''} · {sources}{row.claimStatus!=='unclaimed'?` · ${s(row.claimStatus)}`:''}</p>
  <details><summary className="cursor-pointer text-sm font-semibold">{t('Sucursales y acciones','Branches and actions')}</summary>
   <form ref={ref} onSubmit={e=>e.preventDefault()} className="mt-2 space-y-3">
    <fieldset className="max-h-60 space-y-1 overflow-y-auto text-sm"><legend className="font-semibold">{t('Elija sucursales para separarlas','Choose branches to split them off')}</legend>
     {branches.map(b=><label key={b.slug} className="flex min-h-11 items-center gap-2"><input type="checkbox" className="h-4 w-4" checked={picked.includes(b.slug)} onChange={e=>setPicked(p=>e.target.checked?[...p,b.slug]:p.filter(x=>x!==b.slug))}/>{b.name}{b.province?` · ${b.province}`:''} <span className="text-xs text-slate-600">({b.source})</span></label>)}</fieldset>
    <label className="flex flex-col gap-1 text-sm font-medium">{t('Nombre de la marca nueva','New brand name')}<input value={name} onChange={e=>setName(e.target.value)} maxLength={120} className={field}/></label>
    <label className="flex flex-col gap-1 text-sm font-medium">{t('Unir esta marca dentro de','Merge this brand into')}<select value={into} onChange={e=>setInto(e.target.value)} className={field}>
     <option value="">—</option>{brands.filter(b=>s(b.id)!==id).map(b=><option key={s(b.id)} value={s(b.id)}>{s(b.name)}</option>)}</select></label>
    <Reason id={'br-r-'+id} t={t}/>
    <div className="flex flex-wrap gap-2">
     <button type="button" data-admin-brand-split disabled={busy!==null||!picked.length||name.trim().length<2} className={`${btn} border border-[#162543]`}
      onClick={()=>decide('split:'+id,{kind:'brand_split',brandId:id,newBrandId:crypto.randomUUID(),name:name.trim(),placeSlugs:picked,reason:reasonOf(ref.current),expectedRevision:Number(row.revision)})}>{t('Separar sucursales','Split branches')}</button>
     <button type="button" data-admin-brand-merge disabled={busy!==null||!into} className={`${btn} bg-[#162543] text-white`}
      onClick={()=>decide('merge:'+id,{kind:'brand_merge',brandId:id,intoBrandId:into,reason:reasonOf(ref.current),expectedRevision:Number(row.revision)})}>{t('Unir','Merge')}</button>
     <button type="button" data-admin-brand-hide disabled={busy!==null} className={`${btn} border border-red-300 text-red-800`}
      onClick={()=>decide('hide:'+id,{kind:'brand_hide',brandId:id,reason:reasonOf(ref.current),expectedRevision:Number(row.revision)})}>{t('Ocultar: no es una cadena','Hide: not a chain')}</button>
    </div></form></details>
 </div>;
}
function BrandClaimCard({row,t,date,busy,decide}:{row:Row;t:T;date:(v:unknown)=>string;busy:string|null;decide:Decide}){
 const ref=useRef<HTMLFormElement>(null),id=s(row.claimId),docs=(row.documents as {kind:string;path:string}[]|undefined)??[];
 const act=(decision:string)=>decide('bclaim:'+id+decision,{kind:'brand_claim',claimId:id,decision,...(reasonOf(ref.current)?{reason:reasonOf(ref.current)}:{})});
 return <div className="space-y-2" data-admin-brand-claim={id}>
  <p className="text-sm"><a className="font-semibold underline" href={`/marca/${s(row.slug)}`} target="_blank" rel="noopener">{s(row.brandName)}</a> · {s(row.branches)} {t('sucursales','branches')} · {date(row.createdAt)}</p>
  {row.note?<p className="text-sm">{s(row.note)}</p>:null}
  <ul className="text-sm">{docs.map(d=><li key={d.path}><a className="underline" href={`/api/admin/directorio/documento?path=${encodeURIComponent(d.path)}`} target="_blank" rel="noopener">{pick2(CLAIM_DOCUMENT_LABELS[d.kind as keyof typeof CLAIM_DOCUMENT_LABELS],t)}</a></li>)}</ul>
  <form ref={ref} onSubmit={e=>e.preventDefault()} className="space-y-2"><Reason id={'bc-r-'+id} t={t} optional/>
   <div className="flex flex-wrap gap-2"><button type="button" data-admin-brand-claim-approve disabled={busy!==null} onClick={()=>act('approve')} className={`${btn} bg-[#162543] text-white`}>{t('Aprobar','Approve')}</button>
    <button type="button" disabled={busy!==null} onClick={()=>act('reject')} className={`${btn} bg-red-700 text-white`}>{t('Rechazar','Reject')}</button></div></form>
 </div>;
}

// Launch round (2026-11-18): uploaded place photos. Pending → approve/reject; approved → remove (hide) or dismiss reports;
// hidden → restore. The preview uses the photo route, which serves non-approved photos only to administrators.
const PHOTO_STATUS:Record<string,[string,string]>={pending:['Pendiente','Pending'],approved:['Publicada','Published'],hidden:['Retirada por el equipo','Taken down by staff'],rejected:['Rechazada','Rejected'],removed:['Quitada por quien la subió','Removed by uploader']};
const PHOTO_FLAG:Record<string,[string,string]>={not_this_place:['No es de este lugar','Not this place'],offensive:['Ofensiva','Offensive'],private_info:['Datos privados o personas','Private data or people'],copyright:['Derechos de autor','Copyright'],spam:['Spam','Spam'],other:['Otro','Other']};
function PhotoCard({row,en,t,date,busy,decide}:{row:Row;en:boolean;t:T;date:(v:unknown)=>string;busy:string|null;decide:Decide}){
 const ref=useRef<HTMLFormElement>(null),id=s(row.id),status=s(row.status),flags=(row.flags as {reason:string;message:string|null;at:string}[]|undefined)??[];
 const act=(decision:string)=>decide('photo:'+id+decision,{kind:'photo',mediaId:id,decision,expectedStatus:status,...(reasonOf(ref.current)?{reason:reasonOf(ref.current)}:{})});
 const pick=(m:Record<string,[string,string]>,k:string)=>m[k]?.[en?1:0]??k;
 return <div className="flex flex-col gap-3 sm:flex-row" data-admin-photo={id}>
  {/* eslint-disable-next-line @next/next/no-img-element -- same-origin photo route (staff preview) */}
  <a href={`/api/fotos-lugar/${id}?s=1600`} target="_blank" rel="noopener" className="shrink-0"><img src={`/api/fotos-lugar/${id}?s=320`} alt={s(row.caption)||t('Foto subida','Uploaded photo')} className="h-32 w-32 rounded-xl bg-slate-100 object-cover"/></a>
  <div className="min-w-0 flex-1 space-y-2">
   <p className="text-sm"><PlaceLink slug={row.slug} name={row.placeName} en={en}/> · {pick(PHOTO_STATUS,status)} · {row.origin==='owner'?t('Del negocio','From the business'):t('De una persona usuaria','From a user')}{row.reviewId?` · ${t('en una reseña','on a review')}`:''} · {date(row.createdAt)}</p>
   {row.caption?<p className="text-sm">&quot;{s(row.caption)}&quot;</p>:null}
   {row.reviewComment?<p className="text-sm text-slate-700">{t('Reseña: ','Review: ')}{s(row.reviewComment)}</p>:null}
   {flags.length>0&&<ul className="list-disc pl-5 text-sm text-red-900">{flags.map(f=><li key={f.at}>{pick(PHOTO_FLAG,f.reason)}{f.message?`: ${f.message}`:''} · {date(f.at)}</li>)}</ul>}
   {['pending','approved','hidden'].includes(status)&&<form ref={ref} onSubmit={e=>e.preventDefault()} className="space-y-2"><Reason id={'ph-r-'+id} t={t} optional={status==='pending'}/>
    <div className="flex flex-wrap gap-2">
     {status==='pending'&&<><button type="button" data-admin-photo-approve disabled={busy!==null} onClick={()=>act('approve')} className={`${btn} bg-[#162543] text-white`}>{t('Aprobar','Approve')}</button>
      <button type="button" data-admin-photo-reject disabled={busy!==null} onClick={()=>act('reject')} className={`${btn} bg-red-700 text-white`}>{t('Rechazar','Reject')}</button></>}
     {status==='approved'&&<><button type="button" data-admin-photo-remove disabled={busy!==null} onClick={()=>act('remove')} className={`${btn} bg-red-700 text-white`}>{t('Retirar','Take down')}</button>
      {flags.length>0&&<button type="button" disabled={busy!==null} onClick={()=>act('dismiss')} className={`${btn} border border-slate-300 text-[#162543]`}>{t('Cerrar reportes','Close reports')}</button>}</>}
     {status==='hidden'&&<button type="button" disabled={busy!==null} onClick={()=>act('restore')} className={`${btn} bg-[#162543] text-white`}>{t('Restaurar','Restore')}</button>}
    </div></form>}
  </div>
 </div>;
}
