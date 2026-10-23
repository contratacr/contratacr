'use client';
import { useRef, useState } from 'react';
import { useLocale } from 'next-intl';
import { Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { applyCatalogImport, catalogColumns, previewCatalogImport, type CatalogKind, type CatalogPreview } from '@/lib/pro/catalog-import';
import type { Business } from '@/lib/pro/business';
import { businessCsv, downloadFile } from './exports';
export function CatalogImport({kind,data,commit,saving}:{kind:CatalogKind;data:Business;commit:(next:Business)=>Promise<boolean>;saving:boolean}){
 const en=useLocale()==='en',tr=(es:string,english:string)=>en?english:es;
 const [open,setOpen]=useState(false),[preview,setPreview]=useState<CatalogPreview|null>(null),[error,setError]=useState(''),[reading,setReading]=useState(false);
 const sequence=useRef(0),lock=useRef(false);
 const close=()=>{if(saving||lock.current)return;sequence.current++;setOpen(false);setPreview(null);setError('');setReading(false);};
 async function select(file:File|undefined){const request=++sequence.current;setPreview(null);setError('');if(!file)return;setReading(true);try{
  if(file.size>2_000_000)throw Error('El archivo supera 2 MB.');
  if(!file.name.toLowerCase().endsWith('.csv'))throw Error('Seleccione un archivo CSV.');
  const value=previewCatalogImport(await file.text(),kind,data,()=>crypto.randomUUID());
  if(request===sequence.current)setPreview(value);
 }catch(e){if(request===sequence.current)setError(en?'Could not read the CSV. Use this section’s template (up to 500 rows, 2 MB).':e instanceof Error?e.message:'No se pudo leer el archivo.');}finally{if(request===sequence.current)setReading(false);}}
 async function save(){if(!preview||lock.current)return;lock.current=true;setError('');try{if(await commit(applyCatalogImport(data,preview))){setOpen(false);setPreview(null);}else setError(tr('No se guardó la importación. Recargue los datos y revise el archivo.','Import was not saved. Reload data and review the file.'));}catch(e){setError(en?'Import could not be saved. Check duplicates and review the file again.':e instanceof Error?e.message:'No se pudo importar.');}finally{lock.current=false;}}
 return <><Button variant="secondary" disabled={saving} onClick={()=>setOpen(true)}><Upload className="h-4 w-4"/>{tr('Importar CSV','Import CSV')}</Button>{open&&<Modal title={kind==='clients'?tr('Importar clientes','Import customers'):tr('Importar productos','Import products')} onClose={close} size="lg" mobilePresentation="fullscreen" closeLabel={tr('Cerrar','Close')} footer={<Button disabled={saving||reading||!preview||!!preview.issues.length} onClick={()=>void save()}>{saving?tr('Guardando…','Saving…'):tr('Guardar importación','Save import')}</Button>}>
 <div className="space-y-4 text-sm text-[#52627a]">
 <p>{tr('Descargue la plantilla, complete sus datos y revise el resultado antes de guardarlo. Máximo 500 registros y 2 MB. Los registros existentes se conservan.','Download the template, fill it out and review before saving. Up to 500 records and 2 MB. Existing records are preserved.')}</p>
 <Button variant="secondary" onClick={async()=>{try{const row=Object.fromEntries(catalogColumns[kind].map(k=>[k,'']));await downloadFile(businessCsv([row]),`${kind}-plantilla.csv`,'text/csv;charset=utf-8');}catch{setError(tr('No se pudo descargar la plantilla.','Could not download the template.'));}}}>{tr('Descargar plantilla','Download template')}</Button>
 <label className="block font-bold text-[#162543]">{tr('Archivo CSV','CSV file')}<input type="file" accept=".csv,text/csv" disabled={saving} className="mt-2 block w-full min-w-0 rounded-xl border border-[#e5e7eb] p-3 text-sm" onChange={e=>void select(e.target.files?.[0])}/></label>
 <p className="text-xs">{tr('Encabezados de la plantilla:','Template columns:')} {catalogColumns[kind].join(', ')}. {tr('Use punto decimal, sin separadores de miles.','Use a decimal point and no thousands separators.')}</p>
 {reading&&<p role="status">{tr('Revisando archivo…','Checking file…')}</p>}
 {error&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-red-700">{error}</p>}
 {preview&&<><p role="status" className="rounded-xl bg-[#eef9fd] p-3 font-semibold text-[#162543]">{preview.count} {tr('registros','records')} · {preview.issues.length} {tr('errores','errors')}</p>
 {!!preview.issues.length&&<div role="alert" className="space-y-2 rounded-xl border border-red-200 p-3 text-red-700">{preview.issues.slice(0,20).map(i=><p key={i.row}>{tr('Fila','Row')} {i.row}: {en?'Invalid or duplicate record. Check values against the template.':i.message}</p>)}{preview.issues.length>20&&<p>{tr('Se muestran los primeros 20 errores.','Showing the first 20 errors.')}</p>}<p>{tr('No se guardará ningún registro hasta corregir todos los errores.','No records will be saved until all errors are corrected.')}</p></div>}
 <div className="divide-y divide-[#eef2f6] rounded-2xl border border-[#e5e7eb]">{[...preview.clients,...preview.products].slice(0,20).map(row=><div key={row.id} className="p-3"><strong className="break-words text-[#162543]">{row.name}</strong><p className="break-words">{'sku' in row?`${row.sku} · ${row.stock} · ₡${row.price}`:[row.email,row.phone,row.identification].filter(Boolean).join(' · ')}</p></div>)}</div>
 {preview.count>20&&<p>{tr('Vista previa de los primeros 20. Se importará el archivo completo si no hay errores.','Preview of the first 20. All rows are imported if there are no errors.')}</p>}</>}
 </div></Modal>}</>;
}
