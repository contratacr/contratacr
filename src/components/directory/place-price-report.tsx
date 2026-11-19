'use client';
import {SELECT_CLASS,SELECT_STYLE} from './select-style';
import {useRef,useState,useSyncExternalStore} from 'react';

/**
 * LOCAL PRO ONLY (multivertical M1): «Reportar un precio» on a place page. The person picks a product of the catalogue
 * allowed here (never prescription medicines — Decreto 36868-S — and never fuel, which has a national ARESEP price),
 * the price in colones and the day they saw it. The report starts unconfirmed and private; it shows as «Reportado por
 * usuarios» with its date once another person confirms it or the ContrataCR team publishes it.
 */
type Item={slug:string;name:string;presentation:string|null};
const REASONS:Record<string,[string,string]>={
 login:['Inicie sesión para reportar un precio.','Please sign in to report a price.'],
 rx_not_public:['Los medicamentos con receta no se publican en ContrataCR.','Prescription medicines are not published on ContrataCR.'],
 report_cap:['Alcanzó el máximo de reportes de precios por hoy.','You reached the daily limit of price reports.'],
 limit:['Demasiados reportes seguidos. Intente en unos minutos.','Too many reports in a row. Please try again in a few minutes.'],
 stale:['Ese precio es demasiado antiguo para reportarlo.','That price is too old to report.'],
 date_future:['La fecha no puede ser posterior a hoy.','The date cannot be later than today.'],
 price_invalid:['Escriba un precio válido en colones.','Please enter a valid price in colones.'],
 item_unavailable:['Ese producto no se puede reportar en este lugar.','That product cannot be reported at this place.'],
 unavailable:['No se pudo enviar. Intente de nuevo.','Could not send. Please try again.'],
};
const field='min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-base text-[#162543]';
const noSubscribe=()=>()=>{};
const ring='focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#009FD9]';
export function PlacePriceReport({slug,locale,loginHref,today}:{slug:string;locale:string;loginHref:string|null;today:string}){
 const en=locale==='en',t=(es:string,english:string)=>en?english:es,msg=(r:string)=>(REASONS[r]??REASONS.unavailable)![en?1:0];
 const [items,setItems]=useState<Item[]|null>(null),[state,setState]=useState<'idle'|'loading'|'sending'|'sent'>('idle'),[error,setError]=useState<string|null>(null);
 const action=useRef('');
 // data-ready marks the block as interactive (true only after hydration).
 const ready=useSyncExternalStore(noSubscribe,()=>true,()=>false);
 const load=async()=>{
  if(items||state==='loading')return;setState('loading');
  try{const r=await fetch(`/api/lugar/${encodeURIComponent(slug)}/precios/reporte`,{cache:'no-store'});const j=await r.json() as {items?:Item[]};setItems(r.ok?j.items??[]:[]);}
  catch{setItems([]);}finally{setState('idle');}
 };
 const submit=async(form:HTMLFormElement)=>{
  const f=new FormData(form),price=Number(String(f.get('price')??'').replace(/\s/g,'').replace(',','.'));
  if(!action.current)action.current=crypto.randomUUID();
  setState('sending');setError(null);
  try{
   const r=await fetch(`/api/lugar/${encodeURIComponent(slug)}/precios/reporte`,{method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({actionId:action.current,itemSlug:String(f.get('item')??''),price,observedOn:String(f.get('observedOn')??'')})});
   const j=await r.json().catch(()=>({})) as {reason?:string};
   if(r.ok){setState('sent');action.current='';return;}
   action.current='';setState('idle');setError(msg(r.status===429&&j.reason!=='report_cap'?'limit':String(j.reason??'unavailable')));
  }catch{setState('idle');setError(msg('unavailable'));}
 };
 return <section aria-labelledby="place-price-report" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#e3e9ef] bg-[#f7fafc] px-5 py-4 [&>form]:w-full [&>p]:w-full" data-place-price-report={state} data-ready={ready||undefined}>
  <h2 id="place-price-report" className="text-base font-bold">{t('¿Vio un precio aquí? Repórtelo','Did you see a price here? Report it')}</h2>
  {state==='sent'
   ?<p role="status" className="rounded-xl bg-emerald-50 p-3 text-emerald-900" data-price-report-sent>{t('Gracias. Su reporte queda pendiente de confirmación.','Thank you. Your report is pending confirmation.')}</p>
   :loginHref?<a href={loginHref} className={`inline-flex min-h-11 items-center rounded-full bg-[#162543] px-5 font-semibold text-white ${ring}`}>{t('Inicie sesión para reportar un precio','Sign in to report a price')}</a>
   :items===null?<button type="button" onClick={()=>void load()} disabled={state==='loading'} className={`inline-flex min-h-11 items-center rounded-full border border-[#162543] px-5 font-semibold disabled:opacity-60 ${ring}`}>{t('Reportar un precio','Report a price')}</button>
   :items.length===0?<p className="text-sm text-slate-700" data-price-report-empty>{t('Todavía no hay productos que se puedan reportar en este lugar.','There are no products that can be reported at this place yet.')}</p>
   :<form className="grid gap-3 sm:grid-cols-3" onSubmit={e=>{e.preventDefault();void submit(e.currentTarget);}} onChange={()=>{action.current='';}} data-price-report-form>
    <label className="flex flex-col gap-1 text-sm font-medium sm:col-span-3">{t('Producto','Product')}
     <select name="item" required className={`${field} ${SELECT_CLASS}`} style={SELECT_STYLE}>{items.map(i=><option key={i.slug} value={i.slug}>{i.name}{i.presentation?` · ${i.presentation}`:''}</option>)}</select></label>
    <label className="flex flex-col gap-1 text-sm font-medium">{t('Precio en colones (₡)','Price in colones (₡)')}<input name="price" required inputMode="decimal" autoComplete="off" pattern="[0-9]+([.,][0-9]{1,2})?" className={field}/></label>
    <label className="flex flex-col gap-1 text-sm font-medium">{t('Fecha en que lo vio','Date you saw it')}<input name="observedOn" type="date" required defaultValue={today} max={today} className={field}/></label>
    <div className="flex items-end"><button type="submit" disabled={state==='sending'} className={`inline-flex min-h-11 w-full items-center justify-center rounded-full bg-[#162543] px-5 font-semibold text-white disabled:opacity-60 ${ring}`}>{t('Enviar precio','Send price')}</button></div>
   </form>}
  {error&&<p role="alert" className="text-sm font-semibold text-red-800" data-price-report-error>{error}</p>}
 </section>;
}
