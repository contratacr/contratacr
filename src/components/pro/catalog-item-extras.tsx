'use client';
import {useCallback,useEffect,useState} from 'react';
import {useLocale} from 'next-intl';
import {Button} from '@/components/ui/button';
import {PagedSelect} from './paged-select';
import {productDetailSchema,type ProductDetail} from '@/lib/pro/catalog-details';
import {WORK_FILE_MAX_BYTES} from '@/lib/pro/work-files';
import type {ExpenseSupplier} from '@/lib/pro/expenses';
import {z} from 'zod';

/** Round 7C: image and preferred vendor (from the vendor directory) of one catalog item. */
export function CatalogItemExtras({productId,disabled=false}:{productId:string;disabled?:boolean}){
 const en=useLocale()==='en',[detail,setDetail]=useState<ProductDetail|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[loadError,setLoadError]=useState(false);
 const load=useCallback(async()=>{try{const response=await fetch('/api/pro/catalog-details?'+new URLSearchParams({ids:productId}),{cache:'no-store'});if(!response.ok)throw Error();const body=z.object({items:z.record(z.string(),productDetailSchema)}).parse(await response.json());setDetail(body.items[productId]??null);setLoadError(false);}catch{setLoadError(true);}},[productId]);
 useEffect(()=>{const timer=setTimeout(()=>void load(),0);return()=>clearTimeout(timer);},[load]);
 async function send(body:Record<string,unknown>){if(!detail||busy)return;setBusy(true);setError('');try{const response=await fetch('/api/pro/catalog-details',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({actionId:crypto.randomUUID(),productId,revision:detail.revision,...body})});const result=await response.json().catch(()=>({}));if(response.status===409){setError(en?'The item changed. It was refreshed; try again.':'El artículo cambió. Se actualizó; intente de nuevo.');await load();return;}if(!response.ok)throw Error(typeof result.error==='string'?result.error:'');setDetail(productDetailSchema.parse(result.detail));}catch(caught){setError(caught instanceof Error&&caught.message?caught.message:(en?'Could not save. Try again.':'No se pudo guardar. Intente de nuevo.'));}finally{setBusy(false);}}
 async function upload(file:File){if(file.size>WORK_FILE_MAX_BYTES){setError((en?'The image exceeds ':'La imagen supera ')+Math.round(WORK_FILE_MAX_BYTES/1048576)+' MB.');return;}const data=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onerror=()=>reject(reader.error);reader.onload=()=>{const value=String(reader.result);resolve(value.slice(value.indexOf(',')+1));};reader.readAsDataURL(file);});await send({action:'upload_image',name:file.name.slice(0,160)||'imagen.jpg',data});}
 if(loadError)return <p role="alert" className="text-sm">{en?'Could not load image and vendor.':'No se pudieron cargar la imagen y el proveedor.'} <Button variant="outline" onClick={()=>void load()}>{en?'Retry':'Reintentar'}</Button></p>;
 if(!detail)return <p role="status" className="text-sm text-[#52627a]">{en?'Loading image and vendor…':'Cargando imagen y proveedor…'}</p>;
 const selected=detail.vendorId&&detail.vendorName?{id:detail.vendorId,name:detail.vendorName} as ExpenseSupplier:undefined;
 return <section data-catalog-extras className="min-w-0 space-y-3 rounded-2xl border border-[#e5e7eb] p-4">
  <h4 className="font-bold text-[#162543]">{en?'Image and preferred vendor':'Imagen y proveedor preferido'}</h4>
  <div className="flex min-w-0 flex-wrap items-start gap-4">
   {detail.imageId?<ItemImage src={'/api/pro/catalog-details?'+new URLSearchParams({view:'image',productId,v:detail.imageId})} alt={en?'Item image':'Imagen del artículo'}/>:<div className="flex h-32 w-32 items-center justify-center rounded-xl border border-dashed border-[#c7d2de] text-center text-xs text-[#52627a]">{en?'No image':'Sin imagen'}</div>}
   <div className="min-w-0 flex-1 space-y-2">
    <label className="block text-sm font-semibold">{detail.imageId?(en?'Replace image':'Cambiar imagen'):(en?'Add image':'Agregar imagen')}<input data-catalog-image-input data-pro-write="company.write" type="file" accept="image/jpeg,image/png,image/webp" disabled={disabled||busy} className="mt-1 block w-full min-w-0 text-sm" onChange={event=>{const file=event.target.files?.[0];event.target.value='';if(file)void upload(file);}}/></label>
    <p className="text-xs text-[#52627a]">{en?'JPEG, PNG or WebP up to ':'JPEG, PNG o WebP de hasta '}{Math.round(WORK_FILE_MAX_BYTES/1048576)} MB. {en?'It is stored as JPEG (white background for transparency).':'Se guarda como JPEG (fondo blanco si tenía transparencia).'}</p>
    {detail.imageId&&<Button type="button" variant="ghost" data-pro-write="company.write" disabled={disabled||busy} onClick={()=>void send({action:'remove_image'})}>{en?'Remove image':'Quitar imagen'}</Button>}
   </div>
  </div>
  <div data-catalog-vendor className="min-w-0 space-y-2"><PagedSelect<ExpenseSupplier> url="/api/pro/expenses?kind=suppliers" value={detail.vendorId??''} selected={selected} label={en?'Preferred vendor':'Proveedor preferido'} placeholder={en?'No preferred vendor':'Sin proveedor preferido'} searchLabel={en?'Search vendors':'Buscar proveedores'} moreLabel={en?'More vendors':'Más proveedores'} disabled={disabled||busy} optionLabel={row=>row.name} parse={body=>(body as {items:ExpenseSupplier[]}).items} onChange={row=>void send({action:'set_vendor',vendorId:row?.id??null})}/>{detail.vendorId&&<Button type="button" variant="ghost" data-pro-write="company.write" disabled={disabled||busy} onClick={()=>void send({action:'set_vendor',vendorId:null})}>{en?'Clear preferred vendor':'Quitar proveedor preferido'}</Button>}</div>
  {busy&&<p role="status" className="text-sm">{en?'Saving…':'Guardando…'}</p>}{error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
 </section>;
}

function ItemImage({src,alt}:{src:string;alt:string}){
 // eslint-disable-next-line @next/next/no-img-element -- private same-origin bytes (no image optimizer for private files)
 return <img data-catalog-image src={src} alt={alt} className="h-32 w-32 rounded-xl border border-[#e5e7eb] object-cover"/>;
}
