'use client';
import {useEffect,useState} from 'react';
import {useLocale} from 'next-intl';
import {z} from 'zod';
import {productSpecsSchema,SPEC_FIELDS,type ProductSpecs} from '@/lib/pro/catalog-specs';

/**
 * Family 59: read-only specifications (brand, model, finish, color, material, dimensions, warranty) of catalog items, shown
 * where a catalog item is chosen for a quote, proposal, selection or idea board. Reads /api/pro/catalog-specs (owner only);
 * when the route is unavailable or the item has no specifications, nothing is rendered. Never writes.
 */
const cache=new Map<string,ProductSpecs>();
const body=z.object({items:z.record(z.string(),productSpecsSchema)});
export function useCatalogSpecs(ids:readonly string[]):Record<string,ProductSpecs>{
 const key=[...new Set(ids)].filter(Boolean).slice(0,50).sort().join(',');
 const [,bump]=useState(0);
 useEffect(()=>{
  const missing=key.split(',').filter(id=>id&&!cache.has(id));if(!missing.length)return;let alive=true;
  fetch('/api/pro/catalog-specs?'+new URLSearchParams({ids:missing.join(',')}),{cache:'no-store'}).then(r=>r.ok?r.json():Promise.reject()).then(json=>{
   const parsed=body.parse(json);for(const [id,value] of Object.entries(parsed.items))cache.set(id,value);for(const id of missing)if(!cache.has(id))cache.set(id,{productId:id,revision:0,brand:null,model:null,finish:null,color:null,material:null,dimensions:null,warranty:null});
   if(alive)bump(n=>n+1);}).catch(()=>{});
  return()=>{alive=false;};
 },[key]);
 return Object.fromEntries(key.split(',').filter(id=>cache.has(id)).map(id=>[id,cache.get(id)!]));
}
export function specsSummary(specs:ProductSpecs|undefined,en:boolean){
 return specs?SPEC_FIELDS.filter(f=>specs[f.key]).map(f=>`${en?f.en:f.es}: ${specs[f.key]}`).join(' · ')??'':'';
}
export function CatalogSpecsLine({specs,productId,className='mt-1 text-xs text-[#52627a]'}:{specs?:ProductSpecs;productId?:string;className?:string}){
 const en=useLocale()==='en',loaded=useCatalogSpecs(productId&&!specs?[productId]:[]),value=specs??(productId?loaded[productId]:undefined),text=specsSummary(value,en);
 return text?<p data-catalog-specs-line className={className}>{text}</p>:null;
}
