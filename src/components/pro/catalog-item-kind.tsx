'use client';
import {useCallback,useEffect,useState} from 'react';
import {useLocale} from 'next-intl';
import {z} from 'zod';
import {Button} from '@/components/ui/button';
import {proMoney} from '@/lib/pro/money';
import {ITEM_KINDS,ITEM_KIND_LABELS,assemblyCostCents,itemKindSchema,parseQtyMilli,type ItemKind} from '@/lib/pro/catalog-kind';
import {CatalogSelect} from './catalog-select';

/** Area D (price book): kind of one catalog item (standard, placeholder, assembly) and the parts of an assembly (Pro space). */
type PartDraft={partId:string;name:string;qty:string;unitCostCents:number};
const toDrafts=(item:ItemKind):PartDraft[]=>item.parts.map(part=>({partId:part.partId,name:part.name,qty:String(part.qtyMilli/1000),unitCostCents:part.unitCostCents}));
export function CatalogItemKind({productId,disabled=false}:{productId:string;disabled?:boolean}){
 const en=useLocale()==='en',t=(es:string,english:string)=>en?english:es;
 const [item,setItem]=useState<ItemKind|null>(null),[kind,setKind]=useState<ItemKind['kind']>('standard'),[parts,setParts]=useState<PartDraft[]>([]),[pick,setPick]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false),[loadError,setLoadError]=useState(false);
 const apply=(next:ItemKind)=>{setItem(next);setKind(next.kind);setParts(toDrafts(next));};
 const load=useCallback(async()=>{
  try{
   const response=await fetch('/api/pro/catalog-kind?'+new URLSearchParams({id:productId}),{cache:'no-store'});if(!response.ok)throw Error();
   const next=z.object({item:itemKindSchema}).parse(await response.json()).item;setItem(next);setKind(next.kind);setParts(toDrafts(next));setLoadError(false);
  }catch{setLoadError(true);}
 },[productId]);
 useEffect(()=>{const timer=setTimeout(()=>void load(),0);return()=>clearTimeout(timer);},[load]);
 async function save(){
  if(!item||busy)return;
  const payloadParts=[];for(const part of parts){const qty=parseQtyMilli(part.qty);if(qty===null){setError(t('Revise las cantidades de las partes.','Check the part quantities.'));return;}payloadParts.push({partId:part.partId,qtyMilli:qty});}
  setBusy(true);setError('');setSaved(false);
  try{
   const response=await fetch('/api/pro/catalog-kind',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({productId,revision:item.revision,kind,parts:kind==='assembly'?payloadParts:[]})});
   if(response.status===409){setError(t('El artículo cambió. Recargue antes de guardar.','The item changed. Reload before saving.'));return;}
   if(response.status===400){setError((await response.json().catch(()=>({error:''}))).error||t('No se pudo guardar. Revise los datos.','Could not save. Check the details.'));return;}
   if(!response.ok)throw Error();
   apply(z.object({item:itemKindSchema}).parse(await response.json()).item);setSaved(true);
  }catch{setError(t('No se pudo guardar. Reintente.','Could not save. Try again.'));}
  finally{setBusy(false);}
 }
 if(loadError)return <p role="alert" className="text-sm">{t('No se pudo cargar el tipo de artículo.','Could not load the item kind.')} <Button variant="outline" onClick={()=>void load()}>{t('Reintentar','Retry')}</Button></p>;
 if(!item)return <p role="status" className="text-sm text-[#52627a]">{t('Cargando tipo de artículo…','Loading item kind…')}</p>;
 const input='mt-1 block h-11 w-full min-w-0 rounded-xl border border-[#d7e1ea] px-3 text-sm font-normal',liveCost=assemblyCostCents(parts.map(part=>({unitCostCents:part.unitCostCents,qtyMilli:parseQtyMilli(part.qty)??0})));
 return <section data-catalog-kind className="min-w-0 space-y-3 rounded-2xl border border-[#e5e7eb] p-4">
  <h4 className="font-bold text-[#162543]">{t('Clase de artículo','Item kind')}</h4>
  <label className="block min-w-0 text-sm font-semibold">{t('Clase','Kind')}
   <select data-kind-field="kind" data-pro-write="company.write" disabled={disabled||busy} value={kind} onChange={e=>{setKind(e.target.value as ItemKind['kind']);setSaved(false);}} className={input}>
    {ITEM_KINDS.map(value=><option key={value} value={value}>{en?ITEM_KIND_LABELS[value].en:ITEM_KIND_LABELS[value].es}</option>)}</select></label>
  {kind==='placeholder'&&<p className="text-sm text-[#52627a]">{t('Úselo para reservar un renglón cuando todavía no conoce el producto o el precio final.','Use it to hold a line when the final product or price is not known yet.')}</p>}
  {kind==='assembly'&&<div data-kind-parts className="space-y-3">
   <p className="text-sm text-[#52627a]">{t('Un ensamble se arma con otros artículos del catálogo. Su costo es la suma de sus partes.','An assembly is built from other catalog items. Its cost is the sum of its parts.')}</p>
   {parts.length===0&&<p data-kind-parts-empty className="text-sm text-[#52627a]">{t('Todavía no tiene partes.','No parts yet.')}</p>}
   <ul className="space-y-2">{parts.map((part,index)=><li key={part.partId} data-kind-part={part.partId} className="grid min-w-0 grid-cols-[1fr_6rem_auto] items-end gap-2">
    <span className="min-w-0 break-words text-sm font-semibold">{part.name}<span className="block text-xs font-normal text-[#52627a]">{proMoney(part.unitCostCents/100,en)}</span></span>
    <label className="block text-xs font-semibold">{t('Cantidad','Quantity')}<input data-kind-part-qty data-pro-write="company.write" inputMode="decimal" maxLength={10} disabled={disabled||busy} value={part.qty} onChange={e=>{setParts(list=>list.map((row,i)=>i===index?{...row,qty:e.target.value}:row));setSaved(false);}} className={input}/></label>
    <Button type="button" variant="secondary" data-pro-write="company.write" data-kind-part-remove disabled={disabled||busy} aria-label={`${t('Quitar','Remove')}: ${part.name}`} onClick={()=>{setParts(list=>list.filter((_,i)=>i!==index));setSaved(false);}}>{t('Quitar','Remove')}</Button>
   </li>)}</ul>
   {parts.length<40&&<CatalogSelect kind="products" itemType="all" value={pick} label={t('Agregar parte','Add part')} disabled={disabled||busy} onChange={row=>{
    if(!row||row.id===productId){setPick('');return;}
    if(parts.some(part=>part.partId===row.id)){setError(t('Esa parte ya está en el ensamble.','That part is already in the assembly.'));setPick('');return;}
    setError('');setParts(list=>[...list,{partId:row.id,name:row.name,qty:'1',unitCostCents:Math.round(row.cost*100)}]);setPick('');setSaved(false);
   }}/>}
   <p data-kind-cost className="text-sm font-semibold">{t('Costo del ensamble','Assembly cost')}: {proMoney(liveCost/100,en)}</p>
  </div>}
  <div className="flex flex-wrap items-center gap-3"><Button type="button" data-pro-write="company.write" data-kind-save disabled={disabled||busy} onClick={()=>void save()}>{busy?t('Guardando…','Saving…'):t('Guardar clase','Save kind')}</Button>
   {saved&&<p role="status" data-kind-saved className="text-sm text-[#0b6b3a]">{t('Datos guardados.','Details saved.')}</p>}</div>
  {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
 </section>;
}
