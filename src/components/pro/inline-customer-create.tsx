'use client';
import {useRef,useState} from 'react';
import {useLocale} from 'next-intl';
import {Button} from '@/components/ui/button';
import type {Client} from '@/lib/pro/business';
import {createCustomerInline,type InlineCustomerResult} from '@/lib/pro/inline-customer';

/**
 * «Agregar cliente» inside the lead form: a small inline form (not a nested <form>: it lives inside the
 * lead <form>, so Enter is intercepted) that creates the customer through the Clientes write contract
 * and hands it back to be preselected. The lead draft stays in the lead form the whole time.
 */
const field='mt-1 min-h-11 w-full min-w-0 rounded-xl border border-[#d7e1ea] bg-white px-3 py-2 text-base font-normal';
export function InlineCustomerCreate({actor,disabled,onCreated,onBusy}:{actor:string;disabled?:boolean;onCreated:(client:Client)=>void;onBusy?:(busy:boolean)=>void}){
 const en=useLocale()==='en',[open,setOpen]=useState(false),[fields,setFields]=useState({name:'',email:'',phone:''}),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),lock=useRef(false);
 const copy=(es:string,english:string)=>en?english:es;
 const explain=(result:Exclude<InlineCustomerResult,{status:'created'}>)=>result.status==='invalid'
  ?(result.field==='name'?copy('Escriba el nombre del cliente.','Enter the customer name.'):result.field==='email'?copy('Revise el correo del cliente.','Check the customer e-mail.'):copy('Revise el teléfono del cliente.','Check the customer phone.'))
  :result.status==='pending'?copy('Hay un cliente pendiente de comprobar en Clientes. Resuélvalo allí antes de crear otro.','A customer save is waiting to be checked in Customers. Resolve it there before creating another one.')
  :result.status==='rejected'?copy('No se guardó el cliente. Revise los datos y reintente.','The customer was not saved. Review the information and retry.')
  :copy('No se pudo comprobar si el cliente se guardó. Revíselo en Clientes antes de reintentar.','Could not confirm whether the customer was saved. Check Customers before retrying.');
 async function create(){
  if(lock.current||disabled)return;lock.current=true;setBusy(true);onBusy?.(true);setMessage('');
  try{
   const result=await createCustomerInline({actor,fields,request:(url,init)=>fetch(url,init),store:localStorage});
   if(result.status==='created'){onCreated(result.client);setFields({name:'',email:'',phone:''});setOpen(false);setMessage(copy('Cliente creado y seleccionado.','Customer created and selected.'));return;}
   setMessage(explain(result));
  }finally{lock.current=false;setBusy(false);onBusy?.(false);}
 }
 const enter=(event:React.KeyboardEvent<HTMLInputElement>)=>{if(event.key==='Enter'){event.preventDefault();void create();}};
 if(!open)return <div className="space-y-1">
  <Button type="button" variant="ghost" data-inline-customer-open disabled={disabled} onClick={()=>{setMessage('');setOpen(true);}}>{copy('Agregar cliente','Add customer')}</Button>
  {message&&<p role="status" data-inline-customer-message className="text-sm text-[#1d5b33]">{message}</p>}
 </div>;
 return <div role="group" aria-label={copy('Nuevo cliente','New customer')} data-inline-customer className="space-y-3 rounded-xl border border-[#d7e1ea] bg-[#f7f9fc] p-3">
  <p className="text-sm font-bold">{copy('Nuevo cliente','New customer')}</p>
  <label className="block text-sm font-semibold">{copy('Nombre','Name')}<input data-inline-customer-name aria-label={copy('Nombre del cliente','Customer name')} required maxLength={160} autoFocus value={fields.name} disabled={busy||disabled} className={field} onKeyDown={enter} onChange={event=>setFields({...fields,name:event.target.value})}/></label>
  <label className="block text-sm font-semibold">{copy('Correo (opcional)','E-mail (optional)')}<input data-inline-customer-email aria-label={copy('Correo del cliente (opcional)','Customer e-mail (optional)')} type="email" maxLength={254} placeholder={copy('nombre@correo.com','you@email.com')} value={fields.email} disabled={busy||disabled} className={field} onKeyDown={enter} onChange={event=>setFields({...fields,email:event.target.value})}/></label>
  <label className="block text-sm font-semibold">{copy('Teléfono (opcional)','Phone (optional)')}<input data-inline-customer-phone aria-label={copy('Teléfono del cliente (opcional)','Customer phone (optional)')} type="tel" inputMode="tel" maxLength={30} value={fields.phone} disabled={busy||disabled} className={field} onKeyDown={enter} onChange={event=>setFields({...fields,phone:event.target.value})}/></label>
  {message&&<p role="alert" data-inline-customer-message className="text-sm text-red-700">{message}</p>}
  <div className="flex flex-wrap gap-2">
   <Button type="button" data-inline-customer-save disabled={busy||disabled||!fields.name.trim()} onClick={()=>void create()}>{busy?copy('Guardando…','Saving…'):copy('Crear cliente','Create customer')}</Button>
   <Button type="button" variant="outline" disabled={busy} onClick={()=>{setOpen(false);setMessage('');}}>{copy('Cancelar','Cancel')}</Button>
  </div>
 </div>;
}
