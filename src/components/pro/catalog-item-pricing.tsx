'use client';
import {useCallback,useEffect,useState} from 'react';
import {useLocale} from 'next-intl';
import {z} from 'zod';
import {Button} from '@/components/ui/button';
import {COST_TYPES,COST_TYPE_LABELS,productPricingSchema,type ProductPricing} from '@/lib/pro/catalog-pricing';

/** Area D (price book): cost type, suggested retail price (MSRP), product link and favorite of one catalog item (Pro space). */
type Draft={costType:string;msrp:string;url:string;favorite:boolean};
const toDraft=(p:ProductPricing,en:boolean):Draft=>({costType:p.costType??'',msrp:p.msrpCents===null?'':(p.msrpCents/100).toFixed(2).replace('.',en?'.':','),url:p.url??'',favorite:p.favorite});
function parseMsrp(value:string):number|null|undefined{
 const text=value.trim();if(!text)return null;
 const normalized=text.replace(/\s/g,'').replace(',','.');if(!/^\d{1,10}(\.\d{1,2})?$/.test(normalized))return undefined;
 return Math.round(Number(normalized)*100);
}
export function CatalogItemPricing({productId,disabled=false}:{productId:string;disabled?:boolean}){
 const en=useLocale()==='en',t=(es:string,english:string)=>en?english:es;
 const [pricing,setPricing]=useState<ProductPricing|null>(null),[draft,setDraft]=useState<Draft>({costType:'',msrp:'',url:'',favorite:false}),[busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false),[loadError,setLoadError]=useState(false);
 const load=useCallback(async()=>{
  try{
   const response=await fetch('/api/pro/catalog-pricing?'+new URLSearchParams({ids:productId}),{cache:'no-store'});if(!response.ok)throw Error();
   const body=z.object({items:z.record(z.string(),productPricingSchema)}).parse(await response.json()),item=body.items[productId];if(!item)throw Error();
   setPricing(item);setDraft(toDraft(item,en));setLoadError(false);
  }catch{setLoadError(true);}
 },[productId,en]);
 useEffect(()=>{const timer=setTimeout(()=>void load(),0);return()=>clearTimeout(timer);},[load]);
 async function save(){
  if(!pricing||busy)return;
  const msrp=parseMsrp(draft.msrp);if(msrp===undefined){setError(t('Revise el precio sugerido.','Check the suggested price.'));return;}
  const url=draft.url.trim();if(url&&!/^https?:\/\/\S{1,490}$/i.test(url)){setError(t('El enlace debe comenzar con http:// o https://.','The link must start with http:// or https://.'));return;}
  setBusy(true);setError('');setSaved(false);
  try{
   const payload={productId,revision:pricing.revision,costType:draft.costType||null,msrpCents:msrp,url:url||null,favorite:draft.favorite};
   const response=await fetch('/api/pro/catalog-pricing',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
   if(response.status===409){setError(t('El artículo cambió. Recargue antes de guardar.','The item changed. Reload before saving.'));return;}
   if(!response.ok)throw Error();
   const body=z.object({pricing:productPricingSchema}).parse(await response.json());setPricing(body.pricing);setDraft(toDraft(body.pricing,en));setSaved(true);
  }catch{setError(t('No se pudo guardar. Reintente.','Could not save. Try again.'));}
  finally{setBusy(false);}
 }
 if(loadError)return <p role="alert" className="text-sm">{t('No se pudo cargar el tipo de costo y el precio sugerido.','Could not load the cost type and suggested price.')} <Button variant="outline" onClick={()=>void load()}>{t('Reintentar','Retry')}</Button></p>;
 if(!pricing)return <p role="status" className="text-sm text-[#52627a]">{t('Cargando tipo de costo…','Loading cost type…')}</p>;
 const input='mt-1 block h-11 w-full min-w-0 rounded-xl border border-[#d7e1ea] px-3 text-sm font-normal';
 return <section data-catalog-pricing className="min-w-0 space-y-3 rounded-2xl border border-[#e5e7eb] p-4">
  <h4 className="font-bold text-[#162543]">{t('Tipo de costo y precio sugerido','Cost type and suggested price')}</h4>
  <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
   <label className="block min-w-0 text-sm font-semibold">{t('Tipo de costo','Cost type')}
    <select data-pricing-field="costType" data-pro-write="company.write" disabled={disabled||busy} value={draft.costType} onChange={e=>{setDraft(d=>({...d,costType:e.target.value}));setSaved(false);}} className={input}>
     <option value="">{t('Sin definir','Not set')}</option>{COST_TYPES.map(type=><option key={type} value={type}>{en?COST_TYPE_LABELS[type].en:COST_TYPE_LABELS[type].es}</option>)}</select></label>
   <label className="block min-w-0 text-sm font-semibold">{t('Precio sugerido (₡)','Suggested retail price (₡)')}
    <input data-pricing-field="msrp" data-pro-write="company.write" type="text" inputMode="decimal" maxLength={16} disabled={disabled||busy} value={draft.msrp} onChange={e=>{setDraft(d=>({...d,msrp:e.target.value}));setSaved(false);}} className={input}/></label>
   <label className="block min-w-0 text-sm font-semibold sm:col-span-2">{t('Enlace del producto','Product link')}
    <input data-pricing-field="url" data-pro-write="company.write" type="url" maxLength={500} placeholder="https://" disabled={disabled||busy} value={draft.url} onChange={e=>{setDraft(d=>({...d,url:e.target.value}));setSaved(false);}} className={input}/></label>
  </div>
  <label className="flex min-h-11 items-center gap-2 text-sm font-semibold"><input data-pricing-field="favorite" data-pro-write="company.write" type="checkbox" className="h-5 w-5 accent-[#0f5f8c]" disabled={disabled||busy} checked={draft.favorite} onChange={e=>{setDraft(d=>({...d,favorite:e.target.checked}));setSaved(false);}}/>{t('Favorito','Favorite')}</label>
  <div className="flex flex-wrap items-center gap-3"><Button type="button" data-pro-write="company.write" data-pricing-save disabled={disabled||busy} onClick={()=>void save()}>{busy?t('Guardando…','Saving…'):t('Guardar precios','Save pricing')}</Button>
   {saved&&<p role="status" data-pricing-saved className="text-sm text-[#0b6b3a]">{t('Datos guardados.','Details saved.')}</p>}</div>
  {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
 </section>;
}
