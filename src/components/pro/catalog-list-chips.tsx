'use client';
import {useEffect,useState} from 'react';
import {useLocale} from 'next-intl';
import {z} from 'zod';
import {proMoney} from '@/lib/pro/money';
import {COST_TYPE_LABELS,productPricingSchema,type ProductPricing} from '@/lib/pro/catalog-pricing';

/** Area D (price book): cost type, MSRP and favorite chips on the catalog list rows. Rows ask for their pricing together (one request per 50). */
const cache=new Map<string,ProductPricing>(),waiting=new Map<string,Array<(value:ProductPricing|null)=>void>>();
let timer:ReturnType<typeof setTimeout>|undefined;
async function flush(){
 timer=undefined;
 const batch=[...waiting.entries()].slice(0,50),ids=batch.map(([id])=>id);
 const taken=new Map(batch);for(const id of ids)waiting.delete(id);
 try{
  const response=await fetch('/api/pro/catalog-pricing?'+new URLSearchParams({ids:ids.join(',')}),{cache:'no-store'});if(!response.ok)throw Error();
  const items=z.object({items:z.record(z.string(),productPricingSchema)}).parse(await response.json()).items;
  for(const [id,callbacks] of taken){const item=items[id]??null;if(item)cache.set(id,item);for(const callback of callbacks)callback(item);}
 }catch{for(const callbacks of taken.values())for(const callback of callbacks)callback(null);}
 if(waiting.size)timer=setTimeout(()=>void flush(),0);
}
/** After a save, the next list render asks again. */
export function forgetCatalogChips(id:string){cache.delete(id);}
function request(id:string,callback:(value:ProductPricing|null)=>void){
 const hit=cache.get(id);if(hit){callback(hit);return;}
 waiting.set(id,[...(waiting.get(id)??[]),callback]);if(!timer)timer=setTimeout(()=>void flush(),30);
}
export function CatalogListChips({productId}:{productId:string}){
 const en=useLocale()==='en',[pricing,setPricing]=useState<ProductPricing|null>(()=>cache.get(productId)??null);
 useEffect(()=>{let alive=true;request(productId,value=>{if(alive)setPricing(value);});return()=>{alive=false;};},[productId]);
 if(!pricing||(!pricing.costType&&pricing.msrpCents===null&&!pricing.favorite))return null;
 const chip='inline-block rounded-full bg-[#eaf7fb] px-2 py-0.5 text-[11px] font-semibold text-[#006f93]';
 return <span data-catalog-list-chips className="flex flex-wrap gap-1.5">
  {pricing.favorite&&<span data-chip="favorite" className={chip}>{en?'Favorite':'Favorito'}</span>}
  {pricing.costType&&<span data-chip="costType" className={chip}>{en?COST_TYPE_LABELS[pricing.costType].en:COST_TYPE_LABELS[pricing.costType].es}</span>}
  {pricing.msrpCents!==null&&<span data-chip="msrp" className={chip}>{en?'MSRP':'Precio sugerido'} {proMoney(pricing.msrpCents/100,en)}</span>}
 </span>;
}
