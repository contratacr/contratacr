'use client';
import {useEffect,useRef,useState,type ReactNode} from 'react';
import {useLocale} from 'next-intl';
import {Modal} from '@/components/ui/modal';
import {Button} from '@/components/ui/button';
import {closeProStep} from '@/lib/pro/navigation';
import type {InvoiceManagement} from '@/lib/pro/invoice-management';
export function InvoiceArchiveGate({id,children}:{id:string;children:(onCreated:(createdId:string)=>Promise<void>)=>ReactNode}){
 const en=useLocale()==='en',t=(es:string,eng:string)=>en?eng:es;
 const [state,setState]=useState<(InvoiceManagement&{confirmedCreation?:boolean})|null>(null),[tick,setTick]=useState(0),[error,setError]=useState(''),[saving,setSaving]=useState(false),lock=useRef(false);
 useEffect(()=>{if(!id||id==='nueva')return;let alive=true;const timer=setTimeout(()=>{setState(previous=>previous?.id===id&&previous.confirmedCreation?{...previous,confirmedCreation:false}:null);setError('');void fetch('/api/pro/invoice-management?'+new URLSearchParams({id}),{cache:'no-store'}).then(async response=>{if(!response.ok)throw Error();const body=await response.json();if(alive)setState(body);}).catch(()=>{if(alive)setError('load');});},0);return()=>{alive=false;clearTimeout(timer);};},[id,tick]);
 async function verifiedCreation(createdId:string){
  // Only a successful write callback may prime this transition, and the owned
  // management response must confirm it is active before keeping the form alive.
  try{const response=await fetch('/api/pro/invoice-management?'+new URLSearchParams({id:createdId}),{cache:'no-store'});if(!response.ok)return;const body=await response.json();if(body.id===createdId&&body.archived===false){setState({...body,confirmedCreation:true});}}catch{/* Normal gate verification handles an uncertain status after navigation. */}
 }
 if(!id||id==='nueva')return children(verifiedCreation);
 if(state?.id===id&&!state.archived)return children(verifiedCreation);
 const current=state?.id===id?state:null;
 async function restore(){if(!state||state.id!==id||lock.current)return;lock.current=true;setSaving(true);setError('');try{const response=await fetch('/api/pro/invoice-management',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...state,action:'restore'})});if(!response.ok)throw Error();setTick(value=>value+1);}catch{setError('restore');}finally{lock.current=false;setSaving(false);}}
 return <Modal title={current?.archived?t('Borrador archivado','Archived draft'):t('Borrador de factura','Invoice draft')} ariaLabel={current?.archived?t('Borrador archivado','Archived draft'):t('Borrador de factura','Invoice draft')} closeLabel={t('Cerrar','Close')} mobilePresentation="fullscreen" onClose={()=>{if(!saving)closeProStep('factura','detalleFactura');}}><div className="space-y-4">
 {error?<><p role="alert">{t('No se pudo comprobar o restaurar el borrador. Recargue su estado antes de repetir.','Could not check or restore the draft. Reload its status before retrying.')}</p><Button disabled={saving} onClick={()=>setTick(value=>value+1)}>{t('Recargar estado','Reload status')}</Button></>:!current?<p role="status">{t('Comprobando borrador…','Checking draft…')}</p>:<><p>{t('Este borrador está archivado. Sus datos se conservan; restáurelo para editarlo.','This draft is archived. Its data is retained; restore it to edit it.')}</p><Button disabled={saving} onClick={()=>void restore()}>{saving?t('Restaurando…','Restoring…'):t('Restaurar borrador','Restore draft')}</Button></>}
 </div></Modal>;
}
