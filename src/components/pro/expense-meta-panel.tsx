'use client';
import {useCallback,useEffect,useState} from 'react';
import {useLocale} from 'next-intl';
import {z} from 'zod';
import {expenseMetaSchema,type ExpenseMeta} from '@/lib/pro/expense-meta';

/** Area D: automatic reference number and Taxable flag of one internal expense (saved on its own, outside the expense form). */
export function ExpenseMetaPanel({expenseId,disabled=false}:{expenseId:string;disabled?:boolean}){
 const en=useLocale()==='en',t=(es:string,english:string)=>en?english:es;
 const [meta,setMeta]=useState<ExpenseMeta|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[loadError,setLoadError]=useState(false),[saved,setSaved]=useState(false),[pending,setPending]=useState<boolean|null>(null);
 const load=useCallback(async()=>{
  try{
   const response=await fetch('/api/pro/expense-meta?'+new URLSearchParams({ids:expenseId}),{cache:'no-store'});if(!response.ok)throw Error();
   const body=z.object({items:z.record(z.string(),expenseMetaSchema)}).parse(await response.json()),item=body.items[expenseId];if(!item)throw Error();
   setMeta(item);setLoadError(false);
  }catch{setLoadError(true);}
 },[expenseId]);
 useEffect(()=>{const timer=setTimeout(()=>void load(),0);return()=>clearTimeout(timer);},[load]);
 async function toggle(taxable:boolean){
  if(!meta||busy)return;setBusy(true);setPending(taxable);setError('');setSaved(false);
  try{
   const response=await fetch('/api/pro/expense-meta',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({expenseId,revision:meta.revision,taxable})});
   if(response.status===409){setError(t('El gasto cambió. Recargue antes de guardar.','The expense changed. Reload before saving.'));return;}
   if(!response.ok)throw Error();
   setMeta(z.object({meta:expenseMetaSchema}).parse(await response.json()).meta);setSaved(true);
  }catch{setError(t('No se pudo guardar. Reintente.','Could not save. Try again.'));}
  finally{setBusy(false);setPending(null);}
 }
 if(loadError)return <p role="alert" className="text-sm text-red-700">{t('No se pudo cargar el número de referencia.','Could not load the reference number.')} <button type="button" className="font-semibold underline" onClick={()=>void load()}>{t('Reintentar','Retry')}</button></p>;
 if(!meta)return <p role="status" className="text-sm text-[#52627a]">{t('Cargando referencia…','Loading reference…')}</p>;
 return <div data-expense-meta className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-[#d7e1ea] bg-[#f7f9fc] p-3 text-sm">
  <p><span className="text-[#52627a]">{t('Referencia','Reference')}</span> <strong data-expense-ref className="text-[#008bb5]">{meta.ref}</strong></p>
  <label className="flex min-h-11 items-center gap-2 font-semibold"><input data-expense-taxable data-pro-write="finance.write" type="checkbox" className="h-5 w-5 accent-[#0f5f8c]" disabled={disabled||busy} checked={pending??meta.taxable} onChange={event=>void toggle(event.target.checked)}/>{t('Gasto gravado con IVA','Taxable expense')}</label>
  {saved&&<span role="status" data-expense-meta-saved className="text-[#0b6b3a]">{t('Datos guardados.','Details saved.')}</span>}
  {error&&<span role="alert" className="text-red-700">{error}</span>}
 </div>;
}
