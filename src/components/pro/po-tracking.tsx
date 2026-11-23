'use client';
import {useCallback,useEffect,useRef,useState,type FormEvent} from 'react';
import {Button} from '@/components/ui/button';

/**
 * Seguimiento de una orden de compra emitida (family 52): transportista, guía, fecha de envío, entrega estimada,
 * instalación y un estado propio por línea. Solo registra datos: ContrataCR no consulta al transportista ni avisa a nadie.
 */
type Tracking={orderId:string;revision:number;carrier:string|null;trackingNumber:string|null;shippedOn:string|null;etaOn:string|null;installOn:string|null;note:string|null;lineStates:Record<string,string>};
type Line={id:string;description:string};
type Draft={carrier:string;trackingNumber:string;shippedOn:string;etaOn:string;installOn:string;note:string;lineStates:Record<string,string>};
const api='/api/pro/purchase-order-tracking';
const field='mt-1 block min-h-11 w-full min-w-0 rounded-xl border border-[#d7e1ea] bg-white px-3 text-base font-normal';
const label='block min-w-0 text-sm font-semibold text-[#162543]';
const toDraft=(t:Tracking):Draft=>({carrier:t.carrier??'',trackingNumber:t.trackingNumber??'',shippedOn:t.shippedOn??'',etaOn:t.etaOn??'',installOn:t.installOn??'',note:t.note??'',lineStates:{...t.lineStates}});
const orNull=(v:string)=>v.trim()?v.trim():null;
const dayText=(v:string|null,en:boolean)=>v?new Intl.DateTimeFormat(en?'en-US':'es-CR',{dateStyle:'medium',timeZone:'UTC'}).format(new Date(v+'T12:00:00Z')):'—';

function copy(en:boolean){
 return en?{
  title:'Shipping and installation',intro:'Record who delivers, the tracking number and the dates. ContrataCR does not contact the carrier or notify anyone.',
  carrier:'Carrier',guide:'Tracking number',shipped:'Shipped on',eta:'Estimated delivery',install:'Installation date',note:'Notes (optional)',
  lineStates:'State of each line',lineState:'State',suggest:['Ordered','In production','In transit','Delivered','Waiting for installation','Installed','Returned'],
  edit:'Edit tracking',save:'Save tracking',saving:'Saving…',cancel:'Cancel',empty:'No shipping information recorded yet.',loading:'Loading tracking…',
  loadError:'Could not load the tracking.',retry:'Retry',saved:'Tracking saved.',conflict:'This tracking changed in another window. Reload it and try again.',reload:'Reload',
  saveError:'Could not save the tracking. Check the dates and try again.',datesHint:'Delivery and installation cannot be before the shipping date.',none:'No state',
 }:{
  title:'Envío e instalación',intro:'Registre quién entrega, la guía y las fechas. ContrataCR no consulta al transportista ni avisa a nadie.',
  carrier:'Transportista',guide:'Número de guía',shipped:'Fecha de envío',eta:'Entrega estimada',install:'Fecha de instalación',note:'Notas (opcional)',
  lineStates:'Estado de cada línea',lineState:'Estado',suggest:['Pedido','En producción','En tránsito','Entregado','Pendiente de instalación','Instalado','Devuelto'],
  edit:'Editar seguimiento',save:'Guardar seguimiento',saving:'Guardando…',cancel:'Cancelar',empty:'Todavía no hay información de envío.',loading:'Cargando seguimiento…',
  loadError:'No se pudo cargar el seguimiento.',retry:'Reintentar',saved:'Seguimiento guardado.',conflict:'Este seguimiento cambió en otra ventana. Vuelva a cargarlo e intente de nuevo.',reload:'Recargar',
  saveError:'No se pudo guardar el seguimiento. Revise las fechas e intente de nuevo.',datesHint:'La entrega y la instalación no pueden ser antes del envío.',none:'Sin estado',
 };
}

export function PurchaseOrderTracking({accountId,workId,orderId,lines,en,canWrite}:{accountId:string;workId:string;orderId:string;lines:Line[];en:boolean;canWrite:boolean}){
 const c=copy(en),[data,setData]=useState<Tracking|null>(null),[error,setError]=useState(false),[draft,setDraft]=useState<Draft|null>(null);
 const [saving,setSaving]=useState(false),[notice,setNotice]=useState(''),[problem,setProblem]=useState<''|'conflict'|'save'>(''),seq=useRef(0);
 const load=useCallback(async()=>{
  const id=++seq.current;setError(false);
  try{
   const r=await fetch(api+'?'+new URLSearchParams({workId,id:orderId}),{cache:'no-store',headers:{'X-Pro-Expected-Actor':accountId}});if(!r.ok)throw Error();
   const body=await r.json() as Tracking;if(id===seq.current)setData(body);
  }catch{if(id===seq.current)setError(true);}
 },[accountId,workId,orderId]);
 useEffect(()=>{const ticket=seq;const timer=setTimeout(()=>void load(),0);return()=>{clearTimeout(timer);ticket.current++;};},[load]);
 async function submit(event:FormEvent){
  event.preventDefault();if(!draft||!data||saving)return;
  const bad=(draft.etaOn&&draft.shippedOn&&draft.etaOn<draft.shippedOn)||(draft.installOn&&draft.shippedOn&&draft.installOn<draft.shippedOn);
  if(bad){setProblem('save');return;}
  setSaving(true);setProblem('');setNotice('');
  try{
   const r=await fetch(api,{method:'POST',headers:{'Content-Type':'application/json','X-Pro-Expected-Actor':accountId},body:JSON.stringify({
    workId,id:orderId,revision:data.revision,carrier:orNull(draft.carrier),trackingNumber:orNull(draft.trackingNumber),shippedOn:orNull(draft.shippedOn),etaOn:orNull(draft.etaOn),
    installOn:orNull(draft.installOn),note:orNull(draft.note),lineStates:Object.fromEntries(Object.entries(draft.lineStates).map(([k,v])=>[k,orNull(v)]))})});
   if(r.status===409){setProblem('conflict');return;}
   if(!r.ok)throw Error();
   setData(await r.json() as Tracking);setDraft(null);setNotice(c.saved);
  }catch{setProblem('save');}finally{setSaving(false);}
 }
 if(error)return <section data-po-tracking-error role="alert" className="space-y-2 rounded-2xl border border-[#d7e1ea] p-3"><p className="text-sm">{c.loadError}</p><Button type="button" variant="secondary" className="min-h-11" onClick={()=>void load()}>{c.retry}</Button></section>;
 if(!data)return <section data-po-tracking className="rounded-2xl border border-[#d7e1ea] p-3 text-sm text-[#52627a]" aria-busy="true">{c.loading}</section>;
 const filled=!!(data.carrier||data.trackingNumber||data.shippedOn||data.etaOn||data.installOn||data.note||Object.keys(data.lineStates).length);
 return <section data-po-tracking className="min-w-0 space-y-3 rounded-2xl border border-[#d7e1ea] p-3">
  <div className="flex flex-wrap items-center justify-between gap-2"><h5 className="font-semibold text-[#162543]">{c.title}</h5>
   {canWrite&&!draft&&<Button type="button" variant="secondary" className="min-h-11" data-po-tracking-edit onClick={()=>{setDraft(toDraft(data));setNotice('');setProblem('');}}>{c.edit}</Button>}</div>
  {notice&&<p role="status" className="text-sm font-semibold text-[#007a4d]">{notice}</p>}
  {!draft&&(filled?<div className="space-y-2 text-sm">
   <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
    {([[c.carrier,data.carrier],[c.guide,data.trackingNumber]] as const).map(([k,v])=><div key={k} className="min-w-0"><dt className="text-xs text-[#52627a]">{k}</dt><dd className="break-words font-semibold">{v||'—'}</dd></div>)}
    {([[c.shipped,data.shippedOn],[c.eta,data.etaOn],[c.install,data.installOn]] as const).map(([k,v])=><div key={k} className="min-w-0"><dt className="text-xs text-[#52627a]">{k}</dt><dd className="font-semibold">{dayText(v,en)}</dd></div>)}
   </dl>
   {data.note&&<p className="break-words text-[#52627a]">{data.note}</p>}
   {Object.keys(data.lineStates).length>0&&<ul data-po-tracking-lines className="space-y-1">{lines.filter(l=>data.lineStates[l.id]).map(l=><li key={l.id} className="flex flex-wrap justify-between gap-2"><span className="min-w-0 break-words">{l.description}</span><span className="rounded-full bg-[#EBF5FB] px-2.5 py-0.5 text-xs font-bold text-[#007fae]">{data.lineStates[l.id]}</span></li>)}</ul>}
  </div>:<p className="text-sm text-[#52627a]">{c.empty}</p>)}
  {draft&&<form data-po-tracking-form onSubmit={submit} noValidate className="space-y-3">
   <p className="text-sm text-[#52627a]">{c.intro}</p>
   <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
    <label className={label}>{c.carrier}<input data-po-tracking-field="carrier" className={field} maxLength={80} value={draft.carrier} disabled={saving} onChange={e=>setDraft({...draft,carrier:e.target.value})}/></label>
    <label className={label}>{c.guide}<input data-po-tracking-field="trackingNumber" className={field} maxLength={80} value={draft.trackingNumber} disabled={saving} onChange={e=>setDraft({...draft,trackingNumber:e.target.value})}/></label>
    <label className={label}>{c.shipped}<input type="date" data-po-tracking-field="shippedOn" className={field} value={draft.shippedOn} disabled={saving} onChange={e=>setDraft({...draft,shippedOn:e.target.value})}/></label>
    <label className={label}>{c.eta}<input type="date" data-po-tracking-field="etaOn" className={field} value={draft.etaOn} disabled={saving} onChange={e=>setDraft({...draft,etaOn:e.target.value})}/></label>
    <label className={label}>{c.install}<input type="date" data-po-tracking-field="installOn" className={field} value={draft.installOn} disabled={saving} onChange={e=>setDraft({...draft,installOn:e.target.value})}/></label>
   </div>
   <p className="text-xs text-[#52627a]">{c.datesHint}</p>
   <label className={label}>{c.note}<input data-po-tracking-field="note" className={field} maxLength={300} value={draft.note} disabled={saving} onChange={e=>setDraft({...draft,note:e.target.value})}/></label>
   <fieldset className="space-y-2"><legend className="text-sm font-semibold text-[#162543]">{c.lineStates}</legend>
    <datalist id={'po-states-'+orderId}>{c.suggest.map(s=><option key={s} value={s}/>)}</datalist>
    {lines.map(l=><label key={l.id} className={label}><span className="block break-words font-normal text-[#52627a]">{l.description}</span>
     <input list={'po-states-'+orderId} data-po-tracking-line-state={l.id} placeholder={c.none} className={field} maxLength={40} value={draft.lineStates[l.id]??''} disabled={saving} onChange={e=>setDraft({...draft,lineStates:{...draft.lineStates,[l.id]:e.target.value}})}/></label>)}
   </fieldset>
   {problem==='conflict'&&<div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-[#b42318]"><span>{c.conflict}</span><Button type="button" variant="secondary" className="min-h-11" onClick={()=>{setDraft(null);void load();}}>{c.reload}</Button></div>}
   {problem==='save'&&<p role="alert" className="text-sm text-[#b42318]">{c.saveError}</p>}
   <div className="flex flex-wrap gap-2"><Button type="submit" className="min-h-11" disabled={saving}>{saving?c.saving:c.save}</Button><Button type="button" variant="secondary" className="min-h-11" disabled={saving} onClick={()=>{setDraft(null);setProblem('');}}>{c.cancel}</Button></div>
  </form>}
 </section>;
}
