'use client';
import {useCallback,useEffect,useState} from 'react';
import {useLocale} from 'next-intl';
import {z} from 'zod';
import {Button} from '@/components/ui/button';
import {productSpecsSchema,SPEC_FIELDS,type ProductSpecs} from '@/lib/pro/catalog-specs';

/** Family 59: brand, model, finish, color, material, dimensions and warranty of one catalog item (Pro space). */
export function CatalogItemSpecs({productId,disabled=false}:{productId:string;disabled?:boolean}){
 const en=useLocale()==='en',[specs,setSpecs]=useState<ProductSpecs|null>(null),[draft,setDraft]=useState<Record<string,string>>({}),[busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false),[loadError,setLoadError]=useState(false);
 const load=useCallback(async()=>{
  try{
   const response=await fetch('/api/pro/catalog-specs?'+new URLSearchParams({ids:productId}),{cache:'no-store'});if(!response.ok)throw Error();
   const body=z.object({items:z.record(z.string(),productSpecsSchema)}).parse(await response.json()),item=body.items[productId];if(!item)throw Error();
   setSpecs(item);setDraft(Object.fromEntries(SPEC_FIELDS.map(f=>[f.key,item[f.key]??''])));setLoadError(false);
  }catch{setLoadError(true);}
 },[productId]);
 useEffect(()=>{const timer=setTimeout(()=>void load(),0);return()=>clearTimeout(timer);},[load]);
 async function save(){
  if(!specs||busy)return;setBusy(true);setError('');setSaved(false);
  try{
   const payload={productId,revision:specs.revision,...Object.fromEntries(SPEC_FIELDS.map(f=>[f.key,draft[f.key]?.trim()?draft[f.key].trim():null]))};
   const response=await fetch('/api/pro/catalog-specs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
   if(response.status===409){setError(en?'The item changed. Reload before saving.':'El artículo cambió. Recargue antes de guardar.');return;}
   if(!response.ok)throw Error();
   const body=z.object({specs:productSpecsSchema}).parse(await response.json());setSpecs(body.specs);setDraft(Object.fromEntries(SPEC_FIELDS.map(f=>[f.key,body.specs[f.key]??''])));setSaved(true);
  }catch{setError(en?'Could not save the specifications. Try again.':'No se pudieron guardar las especificaciones. Reintente.');}
  finally{setBusy(false);}
 }
 if(loadError)return <p role="alert" className="text-sm">{en?'Could not load the specifications.':'No se pudieron cargar las especificaciones.'} <Button variant="outline" onClick={()=>void load()}>{en?'Retry':'Reintentar'}</Button></p>;
 if(!specs)return <p role="status" className="text-sm text-[#52627a]">{en?'Loading specifications…':'Cargando especificaciones…'}</p>;
 return <section data-catalog-specs className="min-w-0 space-y-3 rounded-2xl border border-[#e5e7eb] p-4">
  <h4 className="font-bold text-[#162543]">{en?'Specifications':'Especificaciones'}</h4>
  <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
   {SPEC_FIELDS.map(f=><label key={f.key} className="block min-w-0 text-sm font-semibold">{en?f.en:f.es}
    <input data-spec-field={f.key} data-pro-write="company.write" type="text" maxLength={f.max} disabled={disabled||busy} value={draft[f.key]??''} onChange={e=>{setDraft(d=>({...d,[f.key]:e.target.value}));setSaved(false);}} className="mt-1 block h-11 w-full min-w-0 rounded-xl border border-[#d7e1ea] px-3 text-sm font-normal"/></label>)}
  </div>
  <div className="flex flex-wrap items-center gap-3"><Button type="button" data-pro-write="company.write" data-spec-save disabled={disabled||busy} onClick={()=>void save()}>{busy?(en?'Saving…':'Guardando…'):(en?'Save specifications':'Guardar especificaciones')}</Button>
   {saved&&<p role="status" data-spec-saved className="text-sm text-[#0b6b3a]">{en?'Specifications saved.':'Especificaciones guardadas.'}</p>}</div>
  {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
 </section>;
}
