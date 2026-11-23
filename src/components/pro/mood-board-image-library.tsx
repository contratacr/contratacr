'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {useLocale} from 'next-intl';
import {z} from 'zod';
import {companyFilesPageSchema} from '@/lib/pro/company-files';
import {productDetailSchema} from '@/lib/pro/catalog-details';
import {moodProductsSchema,type MoodProduct} from '@/lib/pro/mood-boards';

/**
 * Row 61: the owner's own image library for idea boards. Photos from the company files (Empresa › Archivos) and the photos of
 * catalog items (Mis artículos) are copied INTO the job as private job photos through the same upload the editor already uses,
 * so the board, its published copy and the customer view keep working with job files only. No third-party image service is
 * used; an external stock-photo source exists only as an inactive adapter (src/lib/pro/integrations/stock-images/adapter.ts).
 */
type CompanyImage={id:string;name:string};
type CatalogImage={productId:string;name:string};
const cell='block w-full overflow-hidden rounded-xl border-2 border-[#d7e1ea]';
export function MoodImageLibrary({accountId,disabled,onPick}:{accountId:string;disabled:boolean;onPick:(file:File)=>Promise<void>}){
 const en=useLocale()==='en',t=(es:string,english:string)=>en?english:es;
 const [source,setSource]=useState<'company'|'catalog'>('company'),[company,setCompany]=useState<CompanyImage[]|null>(null),[catalog,setCatalog]=useState<CatalogImage[]|null>(null),[cursor,setCursor]=useState<string|null>(null);
 const [error,setError]=useState(''),[busyId,setBusyId]=useState<string|null>(null),alive=useRef(true),seq=useRef(0);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 const loadCompany=useCallback(async(after:string|null)=>{
  const n=++seq.current;setError('');
  try{const query=new URLSearchParams({view:'list',scope:'all',type:'image',...(after?{after}:{})});
   const response=await fetch('/api/pro/company-files?'+query,{cache:'no-store',headers:{'X-Pro-Expected-Actor':accountId}});if(!response.ok)throw Error();
   const page=companyFilesPageSchema.parse(await response.json());if(!alive.current||n!==seq.current)return;
   const images=page.items.flatMap(item=>item.kind==='file'&&item.file.ready&&!item.file.archived&&item.file.mimeType.startsWith('image/')?[{id:item.file.id,name:item.file.name}]:[]);
   setCompany(old=>after&&old?[...old,...images]:images);setCursor(page.nextCursor);}
  catch{if(alive.current&&n===seq.current)setError(t('No se pudieron cargar los archivos de la empresa.','Could not load the company files.'));}
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[accountId,en]);
 const loadCatalog=useCallback(async()=>{
  const n=++seq.current;setError('');
  try{const response=await fetch('/api/pro/mood-boards?'+new URLSearchParams({products:''}),{cache:'no-store',headers:{'X-Pro-Expected-Actor':accountId}});if(!response.ok)throw Error();
   const products:MoodProduct[]=moodProductsSchema.parse(await response.json()).items;
   if(!products.length){if(alive.current&&n===seq.current)setCatalog([]);return;}
   const details=await fetch('/api/pro/catalog-details?'+new URLSearchParams({ids:products.map(p=>p.id).join(',')}),{cache:'no-store',headers:{'X-Pro-Expected-Actor':accountId}});if(!details.ok)throw Error();
   const map=z.object({items:z.record(z.string(),productDetailSchema)}).parse(await details.json()).items;
   if(alive.current&&n===seq.current)setCatalog(products.filter(p=>map[p.id]?.imageId).map(p=>({productId:p.id,name:p.name})));}
  catch{if(alive.current&&n===seq.current)setError(t('No se pudieron cargar las fotos de los artículos.','Could not load the item photos.'));}
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[accountId,en]);
 useEffect(()=>{const timer=setTimeout(()=>{if(source==='company'&&company===null)void loadCompany(null);if(source==='catalog'&&catalog===null)void loadCatalog();},0);return()=>clearTimeout(timer);},[source,company,catalog,loadCompany,loadCatalog]);
 async function pick(key:string,url:string,name:string){
  setBusyId(key);setError('');
  try{const response=await fetch(url,{cache:'no-store',headers:{'X-Pro-Expected-Actor':accountId}});if(!response.ok)throw Error();const blob=await response.blob();
   await onPick(new File([blob],name.slice(0,150)||'foto.jpg',{type:blob.type||'image/jpeg'}));}
  catch{if(alive.current)setError(t('No se pudo copiar la imagen al trabajo. Intente de nuevo.','Could not copy the image to the job. Try again.'));}
  finally{if(alive.current)setBusyId(null);}
 }
 return <div data-mood-library className="space-y-2 rounded-xl border border-[#e3eaf0] p-3">
  <div className="flex flex-wrap items-center justify-between gap-2"><h5 className="text-sm font-semibold">{t('Mi biblioteca de imágenes','My image library')}</h5>
   <div role="group" aria-label={t('Origen de las imágenes','Image source')} className="flex gap-1 rounded-xl bg-[#e9eff5] p-1">{(['company','catalog'] as const).map(value=><button key={value} type="button" data-mood-library-source={value} aria-pressed={source===value} onClick={()=>setSource(value)} className={`min-h-11 rounded-lg px-3 text-sm font-semibold ${source===value?'bg-white text-[#008bb5] shadow-sm':'text-[#52627a]'}`}>{value==='company'?t('Archivos de la empresa','Company files'):t('Fotos de artículos','Item photos')}</button>)}</div></div>
  <p className="text-xs text-[#52627a]">{t('Al elegir una imagen se copia como foto privada de este trabajo. No se usan bancos de imágenes externos.','Choosing an image copies it as a private photo of this job. No external image banks are used.')}</p>
  {error&&<p role="alert" className="text-sm text-[#8a2a1b]">{error}</p>}
  {source==='company'&&company&&!company.length&&<p className="text-sm text-[#52627a]">{t('No hay imágenes en los archivos de la empresa.','There are no images in the company files.')}</p>}
  {source==='catalog'&&catalog&&!catalog.length&&<p className="text-sm text-[#52627a]">{t('Ningún artículo tiene foto todavía.','No item has a photo yet.')}</p>}
  {source==='company'&&company&&company.length>0&&<ul className="grid grid-cols-3 gap-2 sm:grid-cols-5">{company.map(file=><li key={file.id}><button type="button" disabled={disabled||busyId!==null} data-mood-library-image={file.id} aria-label={t('Usar ','Use ')+file.name} onClick={()=>void pick(file.id,'/api/pro/company-files?'+new URLSearchParams({view:'binary',fileId:file.id}),file.name)} className={cell}>
   {/* eslint-disable-next-line @next/next/no-img-element -- private company file reauthorized on every request */}
   <img src={'/api/pro/company-files?'+new URLSearchParams({view:'binary',fileId:file.id})} alt="" loading="lazy" className="aspect-square w-full object-cover"/></button></li>)}</ul>}
  {source==='catalog'&&catalog&&catalog.length>0&&<ul className="grid grid-cols-3 gap-2 sm:grid-cols-5">{catalog.map(item=><li key={item.productId}><button type="button" disabled={disabled||busyId!==null} data-mood-library-image={item.productId} aria-label={t('Usar la foto de ','Use the photo of ')+item.name} onClick={()=>void pick(item.productId,'/api/pro/catalog-details?'+new URLSearchParams({view:'image',productId:item.productId}),item.name+'.jpg')} className={cell}>
   {/* eslint-disable-next-line @next/next/no-img-element -- private catalog image reauthorized on every request */}
   <img src={'/api/pro/catalog-details?'+new URLSearchParams({view:'image',productId:item.productId})} alt="" loading="lazy" className="aspect-square w-full object-cover"/><span className="block truncate px-1 text-xs">{item.name}</span></button></li>)}</ul>}
  {source==='company'&&cursor&&<button type="button" className="min-h-11 text-sm font-semibold text-[#008bb5] underline" disabled={busyId!==null} onClick={()=>void loadCompany(cursor)}>{t('Cargar más imágenes','Load more images')}</button>}
  {busyId&&<p role="status" className="text-xs text-[#52627a]">{t('Copiando la imagen…','Copying the image…')}</p>}
 </div>;
}
