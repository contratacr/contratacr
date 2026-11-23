'use client';
import {useCallback,useEffect,useState} from 'react';
import {useLocale} from 'next-intl';
import {Button} from '@/components/ui/button';
import {floorLibraryItemSchema,type FloorLibraryItem} from '@/lib/pro/floor-library';
import {parseDimensionsText} from '@/lib/pro/floor-walk';
import {measureVertices,parseObjVertices,scanUnitScale,type ScanUnit,type ScanUpAxis} from '@/lib/pro/room-scan';
import type {Product} from '@/lib/pro/business';
import {CatalogSelect} from './catalog-select';
import {useCatalogSpecs} from './catalog-specs-line';

/**
 * Row 63: library of custom 3D objects (name, width/depth/height in metres, colour). Sources: typed by hand, the bounding box of an
 * OBJ model (read in the browser, the file itself is not stored; only its SHA-256 is kept) or a catalog item whose "Dimensions"
 * specification pre-fills the size. Placed from the plan's Object tool as boxes with the library size, name and colour.
 */
const field='mt-1 block min-h-11 w-full min-w-0 rounded-xl border border-[#d7e1ea] bg-white px-3 text-base font-normal';
const num=(v:string)=>Number(v.trim().replace(',','.'));
const hex=async(bytes:ArrayBuffer)=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');
export function FloorObjectLibrary({items,onItems}:{items:FloorLibraryItem[];onItems:(items:FloorLibraryItem[])=>void}){
 const en=useLocale()==='en',t=(es:string,english:string)=>en?english:es;
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [draft,setDraft]=useState({name:'',w:'1',d:'1',h:'1',color:'#8a6d3b'}),[origin,setOrigin]=useState<{source:'manual'}|{source:'obj';fileSha256:string}|{source:'catalog';productId:string}>({source:'manual'});
 const [unit,setUnit]=useState<ScanUnit>('m'),[up,setUp]=useState<ScanUpAxis>('y'),[product,setProduct]=useState<Product|undefined>();
 const specs=useCatalogSpecs(product?[product.id]:[]),spec=product?specs[product.id]:undefined;
 const reload=useCallback(async()=>{try{const r=await fetch('/api/pro/floor-object-library',{cache:'no-store'});if(!r.ok)throw Error();const json=await r.json() as {items:unknown};onItems(floorLibraryItemSchema.array().parse(json.items));}catch{setError(t('No se pudo cargar la biblioteca.','Could not load the library.'));}
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[]);
 useEffect(()=>{const timer=setTimeout(()=>void reload(),0);return()=>clearTimeout(timer);},[reload]);
 // Catalog origin: the "Dimensions" spec ("120 x 60 x 75 cm") pre-fills the size when it can be read.
 useEffect(()=>{
  if(!product||!spec?.dimensions)return;const dims=parseDimensionsText(spec.dimensions);if(!dims)return;
  const timer=setTimeout(()=>setDraft(d=>({...d,w:String(dims.w),d:String(dims.d),h:dims.h===null?d.h:String(dims.h)})),0);return()=>clearTimeout(timer);
 },[product,spec?.dimensions]);
 async function readObj(file:File){
  setError('');if(file.size>10*1024*1024){setError(t('El archivo supera 10 MB.','The file exceeds 10 MB.'));return;}
  const buffer=await file.arrayBuffer(),measured=measureVertices(parseObjVertices(new TextDecoder().decode(buffer)),{unit,upAxis:up});
  if(!measured){setError(t('No se pudieron leer vértices del OBJ.','Could not read vertices from the OBJ.'));return;}
  const {width,depth,height}=measured.measures;
  if(!(width>=0.05&&width<=50&&depth>=0.05&&depth<=50&&height>=0.05&&height<=20)){setError(t('Las dimensiones no son plausibles. Revise la unidad y el eje vertical.','The dimensions are not plausible. Check the unit and the up axis.'));return;}
  setOrigin({source:'obj',fileSha256:await hex(buffer)});setDraft(d=>({...d,name:d.name||file.name.replace(/\.[^.]+$/,'').slice(0,60),w:String(width),d:String(depth),h:String(height)}));
  setNotice(t(`Caja envolvente leída: ${width} × ${depth} × ${height} m. Revise y guarde.`,`Bounding box read: ${width} × ${depth} × ${height} m. Review and save.`));
 }
 async function post(body:Record<string,unknown>,done:string){
  setBusy(true);setError('');setNotice('');
  try{const r=await fetch('/api/pro/floor-object-library',{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
   if(!r.ok){setError(r.status===409?t('Ya existe un objeto con ese nombre o cambió en otra pestaña. Recargue la lista.','An object with that name already exists or it changed in another tab. Reload the list.'):t('Revise el objeto: nombre, medidas entre 0,05 y 50 m y altura hasta 20 m.','Check the object: name, sizes between 0.05 and 50 m and height up to 20 m.'));return false;}
   setNotice(done);await reload();return true;
  }catch{setError(t('No se pudo guardar. Reintente.','Could not save. Retry.'));return false;}finally{setBusy(false);}
 }
 async function create(){
  const w=num(draft.w),d=num(draft.d),h=num(draft.h);
  if(!draft.name.trim()||![w,d,h].every(Number.isFinite)){setError(t('Indique nombre, ancho, fondo y altura.','Enter name, width, depth and height.'));return;}
  if(await post({action:'create',id:crypto.randomUUID(),name:draft.name.trim(),w,d,h,color:draft.color,...origin},t('Objeto agregado a la biblioteca.','Object added to the library.'))){setDraft({name:'',w:'1',d:'1',h:'1',color:'#8a6d3b'});setOrigin({source:'manual'});setProduct(undefined);}
 }
 const active=items.filter(i=>!i.archived),archived=items.filter(i=>i.archived);
 return <details data-floor-library className="rounded-xl border border-[#e3eaf0] p-3"><summary className="cursor-pointer text-sm font-semibold text-[#007aa0]">{t('Biblioteca de objetos 3D','3D object library')} ({active.length})</summary>
  <p className="mt-2 text-xs text-[#52627a]">{t('Guarde muebles y equipos propios con sus medidas reales (en metros) para colocarlos en cualquier plano con la herramienta Objeto. Se dibujan como cajas con ese tamaño y color; el archivo OBJ no se guarda, solo su caja envolvente.','Save your own furniture and equipment with real sizes (in metres) to place them on any plan with the Object tool. They are drawn as boxes with that size and colour; the OBJ file is not stored, only its bounding box.')}</p>
  {notice&&<p role="status" data-floor-library-notice className="mt-2 text-sm text-[#175b42]">{notice}</p>}{error&&<p role="alert" data-floor-library-error className="mt-2 text-sm text-red-700">{error}</p>}
  <div className="mt-2 grid min-w-0 gap-2 sm:grid-cols-5">
   <label className="block text-sm font-medium sm:col-span-2">{t('Nombre','Name')}<input data-floor-library-field="name" className={field} maxLength={60} value={draft.name} onChange={e=>setDraft({...draft,name:e.target.value})}/></label>
   <label className="block text-sm font-medium">{t('Ancho (m)','Width (m)')}<input data-floor-library-field="w" inputMode="decimal" className={field} value={draft.w} onChange={e=>setDraft({...draft,w:e.target.value})}/></label>
   <label className="block text-sm font-medium">{t('Fondo (m)','Depth (m)')}<input data-floor-library-field="d" inputMode="decimal" className={field} value={draft.d} onChange={e=>setDraft({...draft,d:e.target.value})}/></label>
   <label className="block text-sm font-medium">{t('Alto (m)','Height (m)')}<input data-floor-library-field="h" inputMode="decimal" className={field} value={draft.h} onChange={e=>setDraft({...draft,h:e.target.value})}/></label>
   <label className="block text-sm font-medium">{t('Color','Colour')}<input data-floor-library-field="color" type="color" className={field+' p-1'} value={draft.color} onChange={e=>setDraft({...draft,color:e.target.value})}/></label>
   <div className="min-w-0 sm:col-span-2"><span className="block text-sm font-medium">{t('Desde un modelo OBJ','From an OBJ model')}</span>
    <div className="mt-1 flex flex-wrap items-center gap-2"><select aria-label={t('Unidad del modelo','Model unit')} data-floor-library-unit className="min-h-11 rounded-xl border border-[#d7e1ea] px-2" value={unit} onChange={e=>setUnit(e.target.value as ScanUnit)}>{(Object.keys(scanUnitScale) as ScanUnit[]).map(u=><option key={u} value={u}>{u}</option>)}</select>
     <select aria-label={t('Eje vertical','Up axis')} data-floor-library-up className="min-h-11 rounded-xl border border-[#d7e1ea] px-2" value={up} onChange={e=>setUp(e.target.value as ScanUpAxis)}><option value="y">{t('Y arriba','Y up')}</option><option value="z">{t('Z arriba','Z up')}</option></select>
     <label className="inline-flex min-h-11 cursor-pointer items-center rounded-full border border-[#d7e1ea] bg-white px-4 text-sm font-semibold">{t('Elegir OBJ','Choose OBJ')}<input type="file" data-floor-library-obj accept=".obj,model/obj" className="sr-only" onChange={e=>{const f=e.target.files?.[0];e.target.value='';if(f)void readObj(f);}}/></label></div></div>
   <div className="min-w-0 sm:col-span-3"><CatalogSelect kind="products" label={t('Desde un artículo del catálogo','From a catalog item')} value={product?.id??''} selected={product} onChange={row=>{setProduct(row);if(row){setOrigin({source:'catalog',productId:row.id});setDraft(d=>({...d,name:d.name||row.name.slice(0,60)}));}else setOrigin({source:'manual'});}}/>
    {product&&!spec?.dimensions&&<p className="mt-1 text-xs text-[#52627a]">{t('Este artículo no tiene "Medidas" en sus especificaciones: escriba el tamaño a mano.','This item has no "Dimensions" in its specifications: enter the size by hand.')}</p>}</div>
   <div className="flex items-end"><Button type="button" data-floor-library-add disabled={busy} onClick={()=>void create()}>{t('Agregar a la biblioteca','Add to library')}</Button></div>
  </div>
  {active.length>0&&<ul className="mt-3 space-y-1 text-sm">{active.map(i=><li key={i.id} data-floor-library-item={i.name} className="flex flex-wrap items-center gap-2"><span aria-hidden="true" className="inline-block h-4 w-4 rounded border border-[#d7e1ea]" style={{background:i.color}}/><strong>{i.name}</strong><span className="text-[#52627a]">{i.w} × {i.d} × {i.h} m · {i.source==='obj'?'OBJ':i.source==='catalog'?t('catálogo','catalog'):t('manual','manual')}</span>
   <Button type="button" variant="ghost" disabled={busy} onClick={()=>void post({action:'archive',id:i.id,revision:i.revision},t('Objeto archivado.','Object archived.'))}>{t('Archivar','Archive')}</Button></li>)}</ul>}
  {archived.length>0&&<p className="mt-2 text-xs text-[#52627a]">{t(`${archived.length} archivado(s): los planos que ya los usan se conservan.`,`${archived.length} archived: plans already using them are kept.`)}</p>}
 </details>;
}
