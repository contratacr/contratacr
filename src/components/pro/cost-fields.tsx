'use client';
import {useLocale} from 'next-intl';
import {expenseCategories,expenseCategoryLabel,expensePaymentMethods,expenseVatRates} from '@/lib/pro/expenses';

/** Round 7C: the cost fields shared by «Nuevo gasto» (Expenses) and «Registrar gasto» (job costs). */
export type CostMeta={category:string;vatRateBps:string;billable:boolean;paymentMethod:string;receipt:File|null};
export const emptyCostMeta=():CostMeta=>({category:'',vatRateBps:'',billable:false,paymentMethod:'',receipt:null});
const control='mt-1 block min-h-11 w-full min-w-0 rounded-xl border border-[#d7e1ea] bg-white px-3 py-2 text-base font-normal';
export function methodLabel(value:string,en:boolean){return ({cash:en?'Cash':'Efectivo',transfer:en?'Bank transfer':'Transferencia',card:en?'Card':'Tarjeta',sinpe:'SINPE Móvil',check:en?'Check':'Cheque',other:en?'Other':'Otro'} as Record<string,string>)[value]??value;}
/** Payload keys for the writers: only what the person filled (an untouched form sends nothing extra). */
export function costMetaPayload(meta:CostMeta):{category?:never;vatRateBps?:never;billable?:boolean;paymentMethod?:never}{return{...meta.category?{category:meta.category as never}:{},...meta.vatRateBps?{vatRateBps:Number(meta.vatRateBps) as never}:{},...meta.billable?{billable:true}:{},...meta.paymentMethod?{paymentMethod:meta.paymentMethod as never}:{}};}
/** Attaches a receipt (JPEG/PDF) to a saved expense through the existing receipts route. */
export async function attachCostReceipt(expenseId:string,file:File){
 const data=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onerror=()=>reject(reader.error);reader.onload=()=>{const value=String(reader.result);resolve(value.slice(value.indexOf(',')+1));};reader.readAsDataURL(file);});
 const response=await fetch('/api/pro/expense-receipts',{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'attach',expenseId,receiptId:crypto.randomUUID(),name:file.name.slice(0,160)||'comprobante.jpg',data})});
 return response.ok;
}
export function CostMetaFields({value,onChange,disabled=false,receipt=true}:{value:CostMeta;onChange:(next:CostMeta)=>void;disabled?:boolean;receipt?:boolean}){
 const en=useLocale()==='en';
 return <fieldset data-cost-fields disabled={disabled} className="min-w-0 space-y-3 rounded-xl border border-[#d7e1ea] p-3"><legend className="px-1 text-sm font-semibold">{en?'Cost details':'Detalles del costo'}</legend>
  <div className="grid min-w-0 gap-3 sm:grid-cols-2">
   <label className="block min-w-0 text-sm font-semibold">{en?'Category':'Categoría'}<select data-cost-field="category" aria-label={en?'Cost category':'Categoría del costo'} className={control} value={value.category} onChange={event=>onChange({...value,category:event.target.value})}><option value="">{en?'Not stated':'Sin indicar'}</option>{expenseCategories.map(c=><option key={c} value={c}>{expenseCategoryLabel(c,en)}</option>)}</select></label>
   <label className="block min-w-0 text-sm font-semibold">{en?'VAT included in the amount':'IVA incluido en el importe'}<select data-cost-field="vat" aria-label={en?'VAT included in the amount':'IVA incluido en el importe'} className={control} value={value.vatRateBps} onChange={event=>onChange({...value,vatRateBps:event.target.value})}><option value="">{en?'Do not split':'No separar'}</option>{expenseVatRates.map(rate=><option key={rate} value={rate}>{(rate/100).toLocaleString(en?'en-US':'es-CR')+(en?'%':' %')}</option>)}</select></label>
   <label className="block min-w-0 text-sm font-semibold">{en?'Payment method':'Medio de pago'}<select data-cost-field="method" aria-label={en?'Payment method':'Medio de pago'} className={control} value={value.paymentMethod} onChange={event=>onChange({...value,paymentMethod:event.target.value})}><option value="">{en?'Not stated':'Sin indicar'}</option>{expensePaymentMethods.map(m=><option key={m} value={m}>{methodLabel(m,en)}</option>)}</select></label>
   {receipt&&<label className="block min-w-0 text-sm font-semibold">{en?'Receipt (JPEG or PDF, optional)':'Comprobante (JPEG o PDF, opcional)'}<input data-cost-field="receipt" type="file" accept="image/jpeg,application/pdf" className={control} onChange={event=>onChange({...value,receipt:event.target.files?.[0]??null})}/></label>}
  </div>
  <label className="flex min-h-11 items-center gap-3 text-sm font-semibold"><input data-cost-field="billable" type="checkbox" checked={value.billable} onChange={event=>onChange({...value,billable:event.target.checked})} className="h-5 w-5 shrink-0 accent-[#0089bb]"/>{en?'Billable to the customer':'Facturable al cliente'}</label>
 </fieldset>;
}
