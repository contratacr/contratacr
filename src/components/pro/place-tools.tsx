'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {featureReasonText,ORDER_SECTIONS,type OwnerEvent} from '@/lib/directory/place-features';
import {ClaimPlaceNextStep} from '@/components/pro/place-next-step';

/**
 * LOCAL PRO ONLY (place features round, 2026-11-17): «Mi negocio en el directorio» (/dashboard/pro/lugar).
 *  - Events: create, edit, cancel (title, start/end in Costa Rica time, optional price text, description; no links).
 *    Published at once on /eventos and the place page; staff may hide them (reason shown here).
 *  - «Pedir»: one channel of the business itself (WhatsApp number → wa.me link, its https order page, or a phone).
 *    ContrataCR takes no orders, deliveries or payments.
 *  - Brand: common information (website, description ES/EN) when the account owns an approved brand.
 * Requests go through the Pro routes (team gate + SQL role checks); CAS → 409 reloads; actionId kept per action.
 */
type Place={id:string;slug:string;name:string;vertical:string};
type Order={allowed:boolean;revision:number;channel:'whatsapp'|'web'|'phone'|null;value:string|null;phone:string|null;website:string|null};
type Brand={id:string;slug:string;name:string;website:string|null;descriptionEs:string|null;descriptionEn:string|null;revision:number;branches:number};
const ring='focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#009FD9]';
const btn=`inline-flex min-h-11 items-center justify-center rounded-full px-4 text-sm font-semibold disabled:opacity-60 ${ring}`;
const field='min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-base text-[#162543]';
// <input type="datetime-local"> works in local wall time; the directory is Costa Rica (UTC−6, no DST).
const toCR=(iso:string)=>new Date(new Date(iso).getTime()-6*3600_000).toISOString().slice(0,16);
const fromCR=(local:string)=>local?new Date(local+':00-06:00').toISOString():'';
// endpoint/brandEndpoint (2026-11-18): «Mi negocio» without Pro uses /api/negocio/lugar and no brand tools (brandEndpoint null).
export function PlaceTools({locale,expectedActor,endpoint='/api/pro/place-events',brandEndpoint='/api/pro/brand-info'}:{locale:string;expectedActor:string;endpoint?:string;brandEndpoint?:string|null}){
 const en=locale==='en',t=(es:string,english:string)=>en?english:es;
 const [places,setPlaces]=useState<Place[]|null>(null),[placeId,setPlaceId]=useState(''),[events,setEvents]=useState<OwnerEvent[]>([]),[order,setOrder]=useState<Order|null>(null);
 const [brands,setBrands]=useState<Brand[]>([]),[msg,setMsg]=useState<{ok:boolean;text:string}|null>(null),[busy,setBusy]=useState(false),[nonce,setNonce]=useState(0),[editing,setEditing]=useState<OwnerEvent|'new'|null>(null);
 const [off,setOff]=useState<string|null>(null);
 const actions=useRef(new Map<string,{id:string;body:string}>());
 const headers=useCallback((json=false)=>({...(json?{'content-type':'application/json'}:{}),'x-pro-expected-actor':expectedActor}),[expectedActor]);
 useEffect(()=>{let alive=true;
  fetch(endpoint,{cache:'no-store',headers:headers()}).then(r=>r.json().then(j=>({ok:r.ok,j}))).then(({ok,j})=>{if(!alive)return;
   if(!ok){setOff(String(j.reason??'unavailable'));setPlaces([]);return;}const list=(j.places??[]) as Place[];setPlaces(list);if(list[0])setPlaceId(p=>p||list[0]!.id);}).catch(()=>{if(alive){setOff('unavailable');setPlaces([]);}});
  if(brandEndpoint)fetch(brandEndpoint,{cache:'no-store',headers:headers()}).then(r=>r.ok?r.json():{brands:[]}).then(j=>{if(alive)setBrands((j.brands??[]) as Brand[]);}).catch(()=>{});
  return ()=>{alive=false;};},[headers,nonce,endpoint,brandEndpoint]);
 useEffect(()=>{if(!placeId)return;let alive=true;
  fetch(`${endpoint}?placeId=${placeId}`,{cache:'no-store',headers:headers()}).then(r=>r.json().then(j=>({ok:r.ok,j}))).then(({ok,j})=>{if(!alive)return;
   if(ok){setEvents((j.events?.items??[]) as OwnerEvent[]);setOrder(j.order as Order);}else setMsg({ok:false,text:featureReasonText(j.reason,en)});}).catch(()=>{if(alive)setMsg({ok:false,text:featureReasonText('unavailable',en)});});
  return ()=>{alive=false;};},[placeId,nonce,headers,en,endpoint]);
 const post=async(url:string,key:string,body:Record<string,unknown>,okText:string,inner=true)=>{
  const k=JSON.stringify(body);let a=actions.current.get(key);if(!a||a.body!==k){a={id:crypto.randomUUID(),body:k};actions.current.set(key,a);}
  setBusy(true);setMsg(null);
  try{
   const payload=inner?{...body,input:{...(body.input as Record<string,unknown>),actionId:a.id}}:{...body,actionId:a.id};
   const r=await fetch(url,{method:'POST',headers:headers(true),body:JSON.stringify(payload)});
   const j=await r.json().catch(()=>({})) as {reason?:string};actions.current.delete(key);setNonce(n=>n+1);
   setMsg(r.ok?{ok:true,text:okText}:{ok:false,text:featureReasonText(r.status===409&&!j.reason?'reload':j.reason,en)});return r.ok;
  }catch{setMsg({ok:false,text:featureReasonText('unavailable',en)});return false;}finally{setBusy(false);}
 };
 if(places===null)return <p role="status">{t('Cargando…','Loading…')}</p>;
 if(off)return <p className="rounded-2xl bg-slate-50 p-5">{off==='module_unavailable'?t('Active ContrataCR Pro (gratis durante el lanzamiento) para usar estas herramientas.','Activate ContrataCR Pro (free during the launch) to use these tools.'):featureReasonText(off,en)}</p>;
 const place=places.find(p=>p.id===placeId);
 return <div className="space-y-8" data-place-tools={placeId}>
  {!places.length?<div data-place-tools-no-place><ClaimPlaceNextStep locale={locale} edition={brandEndpoint?'any':undefined} intro={{es:'Primero reclame su negocio. Luego podrá publicar eventos y su canal de pedidos aquí.',en:'First claim your business. Then you can publish events and your ordering channel here.'}}/></div>:<>
   {places.length>1&&<label className="block max-w-sm space-y-1 text-sm font-semibold">{t('Negocio','Business')}
    <select className={field} value={placeId} onChange={e=>{setPlaceId(e.target.value);setEditing(null);}}>{places.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}
   {msg&&<p role={msg.ok?'status':'alert'} data-place-tools-msg={msg.ok?'ok':'error'} className={`text-sm font-semibold ${msg.ok?'text-emerald-800':'text-red-800'}`}>{msg.text}</p>}
   <section aria-labelledby="tools-events" className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2"><h2 id="tools-events" className="text-lg font-bold">{t('Eventos','Events')}</h2>
     <button type="button" data-event-new className={`${btn} bg-[#162543] text-white`} onClick={()=>setEditing('new')}>{t('Nuevo evento','New event')}</button></div>
    {editing&&<EventForm key={editing==='new'?'new':editing.id+editing.revision} event={editing==='new'?null:editing} en={en} busy={busy} onCancel={()=>setEditing(null)}
     onSave={async ev=>{const ok=await post(endpoint,editing==='new'?'event:new':'event:'+editing.id,{op:'event',input:editing==='new'
      ?{action:'create',eventId:crypto.randomUUID(),placeId,event:ev}:{action:'update',eventId:editing.id,revision:editing.revision,event:ev}},t('Evento guardado y publicado.','Event saved and published.'));if(ok)setEditing(null);}}/>}
    {events.length===0?<p className="text-slate-700">{t('Todavía no publicó eventos.','You have not published events yet.')}</p>
     :<ul className="divide-y divide-[#d7e1ea] rounded-2xl border border-[#d7e1ea]">{events.map(e=><li key={e.id} data-owner-event={e.title} className="flex flex-wrap items-start justify-between gap-3 p-4">
      <div className="min-w-0"><p className="font-semibold">{e.title}</p>
       <p className="text-sm text-slate-700">{new Intl.DateTimeFormat(en?'en-US':'es-CR',{dateStyle:'medium',timeStyle:'short',timeZone:'America/Costa_Rica'}).format(new Date(e.startsAt))}{e.priceText?` · ${e.priceText}`:''}</p>
       {e.status==='cancelled'&&<span className="text-xs font-semibold text-slate-700">{t('Cancelado','Cancelled')}</span>}
       {e.moderationStatus==='hidden'&&<p className="text-sm text-red-800">{t('Oculto por ContrataCR','Hidden by ContrataCR')}{e.moderationReason?`: ${e.moderationReason}`:''}</p>}</div>
      {e.status==='published'&&<div className="flex gap-2"><button type="button" className={`${btn} border border-slate-300`} onClick={()=>setEditing(e)}>{t('Editar','Edit')}</button>
       <button type="button" data-event-cancel disabled={busy} className={`${btn} border border-red-300 text-red-800`} onClick={()=>{if(window.confirm(t('¿Cancelar este evento?','Cancel this event?')))void post(endpoint,'cancel:'+e.id,{op:'event',input:{action:'cancel',eventId:e.id,revision:e.revision}},t('Evento cancelado.','Event cancelled.'));}}>{t('Cancelar evento','Cancel event')}</button></div>}
     </li>)}</ul>}
   </section>
   {order&&place&&(ORDER_SECTIONS as readonly string[]).includes(place.vertical)&&<OrderForm key={placeId+':'+order.revision} order={order} en={en} busy={busy}
    onSave={(channel,value)=>post(endpoint,'order:'+placeId,{op:'order',input:{placeId,revision:order.revision,channel,value}},channel?t('Botón «Pedir» guardado.','«Order» button saved.'):t('Botón «Pedir» quitado.','«Order» button removed.'))}/>}
  </>}
  {brands.map(b=><BrandForm key={b.id+':'+b.revision} brand={b} en={en} busy={busy} onSave={v=>post(brandEndpoint??'','brand:'+b.id,{brandId:b.id,revision:b.revision,...v},t('Información de la marca guardada.','Brand information saved.'),false)}/>)}
 </div>;
}
function EventForm({event,en,busy,onSave,onCancel}:{event:OwnerEvent|null;en:boolean;busy:boolean;onSave:(e:Record<string,string>)=>void;onCancel:()=>void}){
 const t=(es:string,english:string)=>en?english:es;const [err,setErr]=useState<string|null>(null);
 return <form data-event-form className="grid gap-3 rounded-2xl border border-[#d7e1ea] p-4 sm:grid-cols-2" onSubmit={e=>{e.preventDefault();setErr(null);const f=new FormData(e.currentTarget);
   const title=String(f.get('title')??'').trim(),start=fromCR(String(f.get('start')??'')),end=fromCR(String(f.get('end')??'')),priceText=String(f.get('price')??'').trim(),description=String(f.get('description')??'').trim();
   if(title.length<3||!start){setErr(t('Escriba el título y la fecha de inicio.','Enter the title and start date.'));return;}
   if(/(https?:\/\/|www\.)/i.test(title+priceText+description)){setErr(t('No incluya enlaces.','Do not include links.'));return;}
   onSave({title,startsAt:start,...(end?{endsAt:end}:{}),...(priceText?{priceText}:{}),...(description?{description}:{})});}}>
  <label className="space-y-1 text-sm font-semibold sm:col-span-2">{t('Título','Title')}<input name="title" data-event-title required maxLength={120} defaultValue={event?.title} className={field}/></label>
  <label className="space-y-1 text-sm font-semibold">{t('Inicio (hora de Costa Rica)','Start (Costa Rica time)')}<input name="start" data-event-start type="datetime-local" required defaultValue={event?toCR(event.startsAt):''} className={field}/></label>
  <label className="space-y-1 text-sm font-semibold">{t('Fin (opcional)','End (optional)')}<input name="end" type="datetime-local" defaultValue={event?.endsAt?toCR(event.endsAt):''} className={field}/></label>
  <label className="space-y-1 text-sm font-semibold sm:col-span-2">{t('Precio (texto opcional, p. ej. «Entrada ₡3 000» o «Gratis»)','Price (optional text, e.g. «Entry ₡3,000» or «Free»)')}<input name="price" data-event-price maxLength={60} defaultValue={event?.priceText??''} className={field}/></label>
  <label className="space-y-1 text-sm font-semibold sm:col-span-2">{t('Descripción (opcional)','Description (optional)')}<textarea name="description" rows={3} maxLength={1000} defaultValue={event?.description??''} className="w-full rounded-xl border border-slate-300 px-3 py-2 text-base"/></label>
  {err&&<p role="alert" className="text-sm font-semibold text-red-800 sm:col-span-2">{err}</p>}
  <div className="flex gap-2 sm:col-span-2"><button type="submit" data-event-save disabled={busy} className={`${btn} bg-[#162543] text-white`}>{t('Publicar','Publish')}</button>
   <button type="button" onClick={onCancel} className={`${btn} border border-slate-300`}>{t('Cerrar','Close')}</button></div>
  <p className="text-xs text-slate-700 sm:col-span-2">{t('El evento se publica de inmediato y el equipo de ContrataCR lo revisa. ContrataCR no vende entradas ni cobra pagos.','The event is published at once and the ContrataCR team reviews it. ContrataCR sells no tickets and takes no payments.')}</p>
 </form>;
}
function OrderForm({order,en,busy,onSave}:{order:Order;en:boolean;busy:boolean;onSave:(channel:string|null,value:string|null)=>void}){
 const t=(es:string,english:string)=>en?english:es;
 const [channel,setChannel]=useState<string>(order.channel??''),[value,setValue]=useState(order.channel==='whatsapp'?(order.value??'').replace('https://wa.me/',''):order.value??'');
 return <section aria-labelledby="tools-order" className="space-y-3"><h2 id="tools-order" className="text-lg font-bold">{t('Botón «Pedir»','«Order» button')}</h2>
  <p className="text-sm text-slate-700">{t('Lleva a sus clientes a SU canal: su WhatsApp, la página de pedidos de su sitio o su teléfono. ContrataCR no toma pedidos, no hace entregas y no cobra comisiones.','Takes your customers to YOUR channel: your WhatsApp, your website order page or your phone. ContrataCR takes no orders, makes no deliveries and charges no commission.')}</p>
  <form data-order-form className="grid gap-3 sm:grid-cols-[1fr_2fr_auto] sm:items-end" onSubmit={e=>{e.preventDefault();onSave(channel||null,channel?value.trim():null);}}>
   <label className="space-y-1 text-sm font-semibold">{t('Canal','Channel')}<select data-order-channel className={field} value={channel} onChange={e=>{setChannel(e.target.value);setValue(e.target.value==='phone'?order.phone??'':e.target.value==='web'?order.website??'':'');}}>
    <option value="">{t('Sin botón','No button')}</option><option value="whatsapp">WhatsApp</option><option value="web">{t('Página de pedidos (https)','Order page (https)')}</option><option value="phone">{t('Teléfono','Phone')}</option></select></label>
   <label className="space-y-1 text-sm font-semibold">{channel==='whatsapp'?t('Número de WhatsApp','WhatsApp number'):channel==='web'?t('Dirección https de su página de pedidos','https address of your order page'):channel==='phone'?t('Teléfono','Phone'):t('Valor','Value')}
    <input data-order-value disabled={!channel} className={field} value={value} onChange={e=>setValue(e.target.value)} inputMode={channel==='web'?'url':'tel'} maxLength={500}/></label>
   <button type="submit" data-order-save disabled={busy} className={`${btn} bg-[#162543] text-white`}>{t('Guardar','Save')}</button></form>
 </section>;
}
function BrandForm({brand,en,busy,onSave}:{brand:Brand;en:boolean;busy:boolean;onSave:(v:{website:string|null;descriptionEs:string|null;descriptionEn:string|null})=>void}){
 const t=(es:string,english:string)=>en?english:es;
 return <section aria-labelledby={'brand-'+brand.id} className="space-y-3 rounded-2xl border border-[#d7e1ea] p-4" data-brand-form={brand.slug}>
  <h2 id={'brand-'+brand.id} className="text-lg font-bold">{t('Marca','Brand')}: {brand.name}</h2>
  <p className="text-sm text-slate-700">{t(`Información común de sus ${brand.branches} sucursales. Se muestra en la página de la marca y en cada sucursal.`,`Information shared by your ${brand.branches} branches. Shown on the brand page and on every branch.`)}</p>
  <form className="grid gap-3" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget),v=(k:string)=>String(f.get(k)??'').trim()||null;onSave({website:v('website'),descriptionEs:v('es'),descriptionEn:v('en')});}}>
   <label className="space-y-1 text-sm font-semibold">{t('Sitio web (https)','Website (https)')}<input name="website" defaultValue={brand.website??''} className={field} inputMode="url"/></label>
   <label className="space-y-1 text-sm font-semibold">{t('Descripción en español','Description in Spanish')}<textarea name="es" rows={2} maxLength={500} defaultValue={brand.descriptionEs??''} className="w-full rounded-xl border border-slate-300 px-3 py-2 text-base"/></label>
   <label className="space-y-1 text-sm font-semibold">{t('Descripción en inglés','Description in English')}<textarea name="en" rows={2} maxLength={500} defaultValue={brand.descriptionEn??''} className="w-full rounded-xl border border-slate-300 px-3 py-2 text-base"/></label>
   <div><button type="submit" disabled={busy} className={`${btn} bg-[#162543] text-white`}>{t('Guardar','Save')}</button></div></form></section>;
}
