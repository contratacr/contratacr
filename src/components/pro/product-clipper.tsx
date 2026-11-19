'use client';
import {useEffect,useRef,useState} from 'react';
import {useLocale} from 'next-intl';
import {Button} from '@/components/ui/button';
import {replaceProParams} from '@/lib/pro/navigation';
import {proMoney} from '@/lib/pro/money';
import type {Product} from '@/lib/pro/business';
import type {ClipMetadata} from '@/lib/pro/integrations/clipper/parse';
import {useProSearchParams} from './use-pro-search-params';

/**
 * Round 6D (row 60): «Agregar desde enlace» in My items. The server reads the link (mock fixture locally; the
 * real reader only uses public Open Graph / schema.org data and respects robots.txt); the owner reviews and
 * edits every value, then «Guardar en mi catálogo» uses the catalog's own writer. The browser extension opens
 * this view with ?clip=<url>: the link is only PREFILLED; nothing is read until the owner presses «Leer enlace».
 */
type Clip={id:string;url:string;host:string;mode:string;metadata:ClipMetadata;status:string};
const field='mt-1 block min-h-11 w-full min-w-0 rounded-xl border border-[#d7e1ea] bg-white px-3 text-base font-normal';
export function ProductClipper({onSave,disabled=false}:{onSave:(row:Product)=>Promise<boolean>;disabled?:boolean}){
 const en=useLocale()==='en',t=(es:string,english:string)=>en?english:es,params=useProSearchParams();
 const [open,setOpen]=useState(false),[url,setUrl]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[clip,setClip]=useState<Clip|null>(null);
 const [draft,setDraft]=useState({name:'',sku:'',price:'',cost:'',unit:'',category:'',itemType:'product' as 'product'|'service'});
 const [source,setSource]=useState<'app'|'extension'>('app');
 const attempt=useRef<{url:string;actionId:string;id:string}|null>(null),fromExtension=useRef(false);
 async function read(target:string,source:'app'|'extension'){
  setBusy(true);setError('');setNotice('');setClip(null);
  if(attempt.current?.url!==target)attempt.current={url:target,actionId:crypto.randomUUID(),id:crypto.randomUUID()};
  try{const response=await fetch('/api/pro/catalog-clipper',{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'read',actionId:attempt.current.actionId,id:attempt.current.id,url:target,source})});const json=await response.json().catch(()=>({}));
   if(!response.ok){setError(json.reason==='robots'?t('Ese sitio no permite leer la página (robots.txt). Agregue el artículo a mano.','That site does not allow reading the page (robots.txt). Add the item by hand.'):json.reason==='no_data'?t('La página no publica datos de producto. Agregue el artículo a mano.','The page does not publish product data. Add the item by hand.'):json.reason==='invalid_url'?t('Pegue un enlace https de una página pública de producto.','Paste an https link to a public product page.'):t('No se pudo leer el enlace. Reintente.','Could not read the link. Retry.'));return;}
   const value=json as Clip,m=value.metadata;setClip(value);attempt.current=null;
   const crc=m.currency==='CRC'||m.currency===null;
   setDraft({name:m.name,sku:(m.sku||'WEB-'+value.id.slice(0,6)).toUpperCase().slice(0,40),price:'',cost:m.price!==null&&crc?String(m.price):'',unit:'',category:m.brand?m.brand.slice(0,80):'',itemType:'product'});
  }catch{setError(t('No se pudo leer el enlace. Reintente.','Could not read the link. Retry.'));}finally{setBusy(false);}
 }
 const clipParam=params.get('clip');
 useEffect(()=>{if(!clipParam||fromExtension.current)return;const timer=setTimeout(()=>{fromExtension.current=true;setOpen(true);setUrl(clipParam);setSource('extension');replaceProParams({clip:null});},0);return()=>clearTimeout(timer);
 },[clipParam]);
 async function save(){
  if(!clip)return;const number=(v:string)=>{const n=Number(v.replace(/\s/g,'').replace(',','.'));return Number.isFinite(n)&&n>=0?Math.round(n*100)/100:NaN;};
  const price=number(draft.price||'0'),cost=number(draft.cost||'0');if(!draft.name.trim()||!draft.sku.trim()||Number.isNaN(price)||Number.isNaN(cost)){setError(t('Revise nombre, código, precio y costo.','Check name, code, price and cost.'));return;}
  const row:Product={id:crypto.randomUUID(),sku:draft.sku.trim(),name:draft.name.trim(),stock:0,minimum:0,cost,price,archived:false,itemType:draft.itemType,...(draft.unit.trim()?{unit:draft.unit.trim().slice(0,30)}:{}),...(draft.category.trim()?{category:draft.category.trim().slice(0,80)}:{})};
  setBusy(true);setError('');
  try{if(!await onSave(row)){setError(t('No se guardó en el catálogo. Revise el código (no puede repetirse).','It was not saved to the catalog. Check the code (it cannot repeat).'));return;}
   await fetch('/api/pro/catalog-clipper',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'review',id:clip.id,decision:'saved',productId:row.id})}).catch(()=>{});
   setNotice(t('Artículo guardado en su catálogo.','Item saved to your catalog.'));setClip(null);setUrl('');
  }finally{setBusy(false);}
 }
 function discard(){if(!clip)return;void fetch('/api/pro/catalog-clipper',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'review',id:clip.id,decision:'discarded',productId:null})}).catch(()=>{});setClip(null);}
 if(!open)return <div className="mb-3 flex flex-wrap items-center gap-2">{notice&&<p role="status" className="text-sm text-[#175b42]">{notice}</p>}<Button type="button" variant="secondary" data-clipper-open disabled={disabled} onClick={()=>setOpen(true)}>{t('Agregar desde enlace','Add from link')}</Button></div>;
 return <section data-clipper aria-labelledby="clipper-title" className="mb-4 min-w-0 space-y-3 rounded-2xl border border-[#d7e1ea] bg-white p-4">
  <div className="flex flex-wrap items-center justify-between gap-2"><h3 id="clipper-title" className="font-bold">{t('Agregar desde enlace','Add from link')}</h3><Button type="button" variant="ghost" onClick={()=>{setOpen(false);setClip(null);setError('');}}>{t('Cerrar','Close')}</Button></div>
  <p className="text-sm text-[#52627a]">{t('Pegue el enlace de un producto de una tienda en línea. Se leen solo los datos públicos de la página (nombre, precio, imagen) y usted los revisa antes de guardar.','Paste the link of a product from an online store. Only the page\'s public data (name, price, image) is read and you review it before saving.')}</p>
  <form className="flex min-w-0 flex-wrap items-end gap-2" onSubmit={e=>{e.preventDefault();void read(url.trim(),source);}}><label className="block min-w-0 flex-1 text-sm font-medium">{t('Enlace del producto','Product link')}<input data-clipper-url type="url" inputMode="url" required className={field} placeholder="https://" value={url} maxLength={2000} onChange={e=>setUrl(e.target.value)}/></label><Button type="submit" data-clipper-read disabled={busy||disabled||!url.trim()}>{busy&&!clip?t('Leyendo…','Reading…'):t('Leer enlace','Read link')}</Button></form>
  {error&&<p role="alert" data-clipper-error className="text-sm text-red-700">{error}</p>}
  {clip&&<div data-clipper-review={clip.id} className="space-y-3 rounded-xl border border-[#e3eaf0] p-3">
   <div className="flex flex-wrap items-center gap-2 text-xs">{clip.metadata.simulated&&<span data-simulated className="rounded-lg bg-[#fff6e5] px-2 py-0.5 font-bold uppercase text-[#8a5300]">{t('Simulado','Simulated')}</span>}<span className="text-[#52627a]">{t('Fuente','Source')}: {clip.host} · {clip.metadata.source==='schema'?'schema.org':clip.metadata.source==='og'?'Open Graph':'Open Graph + schema.org'}</span></div>
   {clip.metadata.simulated&&<p className="text-xs text-[#8a5300]">{t('Datos de ejemplo: en este entorno no se visita la tienda. Revise y corrija todo antes de guardar.','Sample data: in this environment the store is not visited. Review and correct everything before saving.')}</p>}
   {clip.metadata.price!==null&&<p className="text-sm">{t('Precio publicado en la tienda: ','Price published by the store: ')}<strong data-clipper-store-price>{clip.metadata.currency==='USD'?'US$'+clip.metadata.price.toLocaleString(en?'en-US':'es-CR'):clip.metadata.currency==='CRC'||clip.metadata.currency===null?proMoney(clip.metadata.price,en):clip.metadata.price+' '+clip.metadata.currency}</strong>{clip.metadata.currency==='USD'?t(' (convierta a colones si lo usa como costo)',' (convert to colones if you use it as cost)'):''}</p>}
   <div className="grid min-w-0 gap-2 sm:grid-cols-2">
    <label className="block text-sm font-medium sm:col-span-2">{t('Nombre','Name')}<input data-clipper-field="name" className={field} maxLength={160} value={draft.name} onChange={e=>setDraft({...draft,name:e.target.value})}/></label>
    <label className="block text-sm font-medium">{t('Código','Code')}<input data-clipper-field="sku" className={field} maxLength={40} value={draft.sku} onChange={e=>setDraft({...draft,sku:e.target.value})}/></label>
    <label className="block text-sm font-medium">{t('Tipo','Type')}<select className={field} value={draft.itemType} onChange={e=>setDraft({...draft,itemType:e.target.value as 'product'|'service'})}><option value="product">{t('Producto','Product')}</option><option value="service">{t('Servicio','Service')}</option></select></label>
    <label className="block text-sm font-medium">{t('Costo ₡ (lo que le cuesta)','Cost ₡ (what it costs you)')}<input data-clipper-field="cost" inputMode="decimal" className={field} value={draft.cost} onChange={e=>setDraft({...draft,cost:e.target.value})}/></label>
    <label className="block text-sm font-medium">{t('Precio de venta ₡','Sale price ₡')}<input data-clipper-field="price" inputMode="decimal" className={field} value={draft.price} onChange={e=>setDraft({...draft,price:e.target.value})}/></label>
    <label className="block text-sm font-medium">{t('Unidad (opcional)','Unit (optional)')}<input className={field} maxLength={30} value={draft.unit} onChange={e=>setDraft({...draft,unit:e.target.value})}/></label>
    <label className="block text-sm font-medium">{t('Categoría (opcional)','Category (optional)')}<input className={field} maxLength={80} value={draft.category} onChange={e=>setDraft({...draft,category:e.target.value})}/></label>
   </div>
   <div className="flex flex-wrap gap-2"><Button type="button" data-clipper-save disabled={busy||disabled} onClick={()=>void save()}>{t('Guardar en mi catálogo','Save to my catalog')}</Button><Button type="button" variant="ghost" data-clipper-discard disabled={busy} onClick={discard}>{t('Descartar','Discard')}</Button></div>
  </div>}
  {notice&&<p role="status" data-clipper-notice className="text-sm text-[#175b42]">{notice}</p>}
 </section>;
}
