'use client';
import {useEffect,useRef,useState} from 'react';
import {useLocale} from 'next-intl';
import {Button} from '@/components/ui/button';
import {isValidId} from '@/lib/cedula';

type Contact={name:string;email?:string;phone?:string};
export function ClientIdentification({initialValue,autoLookup,disabled,className,onPrefill,onIdentificationChange,onExisting}:{initialValue:string;autoLookup:boolean;disabled:boolean;className:string;onPrefill:(contact:Contact)=>void;onIdentificationChange:()=>void;onExisting:(id:string)=>void}){
 const en=useLocale()==='en',tr=(es:string,enText:string)=>en?enText:es;
 const [value,setValue]=useState(initialValue),[status,setStatus]=useState(''),[existing,setExisting]=useState('');
 const prefill=useRef(onPrefill);useEffect(()=>{prefill.current=onPrefill;},[onPrefill]);
 const input=useRef<HTMLInputElement>(null),request=useRef<AbortController|null>(null),last=useRef('');
 useEffect(()=>()=>request.current?.abort(),[]);
 const id=value.replace(/[\s-]/g,'');
 async function lookup(){
  if(!autoLookup||disabled||!isValidId(id)||last.current===id)return;
  request.current?.abort();const controller=new AbortController();request.current=controller;last.current=id;setStatus('loading');
  const timer=setTimeout(()=>controller.abort(),12000);
  try{
   const response=await fetch('/api/pro/identity-lookup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({identification:id,purpose:'client_contact'}),cache:'no-store',signal:controller.signal});
   if(request.current!==controller||controller.signal.aborted)return;
   if(!response.ok){setStatus(response.status===404?'missing':'unavailable');last.current='';return;}
   const body=await response.json();if(request.current!==controller||controller.signal.aborted)return;
   if(typeof body.existingClientId==='string'&&body.existingClientId){setExisting(body.existingClientId);input.current?.setCustomValidity(tr('Esta identificación ya está en sus clientes. Abra la ficha existente.','This ID is already in your customers. Open the existing record.'));setStatus('existing');return;}
   const contact=body.contact??{name:body.fullName};
   if(!body.found||typeof contact.name!=='string'||!contact.name.trim()||contact.name.length>160||['email','phone'].some(key=>contact[key]!==undefined&&typeof contact[key]!=='string'))throw Error('invalid');
   prefill.current(contact);setStatus('applied');
  }catch{if(request.current===controller){setStatus('unavailable');last.current='';}}
  finally{clearTimeout(timer);if(request.current===controller)request.current=null;}
 }
 return <div className="space-y-2" data-client-identification>
  <label className="block text-[13px] font-bold">{tr('Identificación (cédula, DIMEX o NITE)','Identification (national ID, DIMEX or NITE)')}
   <input ref={input} name="identification" aria-label={tr('Identificación','Identification')} inputMode="numeric" maxLength={24} value={value} disabled={disabled} className={className} onBlur={()=>void lookup()} onChange={event=>{onIdentificationChange();request.current?.abort();request.current=null;last.current='';input.current?.setCustomValidity('');setValue(event.target.value);setExisting('');setStatus('');}}/>
  </label>
  {status&&status!=='applied'&&<p role="status" className="text-sm text-[#52627a]">{status==='existing'?tr('Este cliente ya está guardado.','This customer is already saved.'):status==='loading'?tr('Consultando…','Looking up…'):status==='missing'?tr('Sin datos disponibles.','No details available.'):tr('Consulta no disponible.','Lookup unavailable.')}</p>}
  {existing&&<Button type="button" variant="secondary" disabled={disabled} onClick={()=>onExisting(existing)}>{tr('Abrir cliente existente','Open existing customer')}</Button>}
 </div>;
}
