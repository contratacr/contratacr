'use client';
import {useRef,useState} from 'react';
import {useLocale} from 'next-intl';
import {Button} from '@/components/ui/button';
import {useAppDialog} from '@/hooks/use-app-dialog';
import {proMoney} from '@/lib/pro/money';
import {expenseMethodLabel,type InternalExpense} from '@/lib/pro/expenses';
import {WORK_FILE_MAX_BYTES} from '@/lib/pro/work-files';
import {ProFileInput} from './pro-file-input';

/**
 * Round 4B: billing data of an internal expense (billable, payment method, VAT included) and its
 * receipt (one photo or PDF, same limits as job files). The receipt is private to the owner.
 */
const api='/api/pro/expense-receipts';
function base64(file:File){return new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onerror=()=>reject(reader.error);reader.onload=()=>{const value=String(reader.result);resolve(value.slice(value.indexOf(',')+1));};reader.readAsDataURL(file);});}
export function ExpenseBilling({expense,disabled=false,onChanged}:{expense:InternalExpense;disabled?:boolean;onChanged:()=>void}){
 const en=useLocale()==='en',t=(es:string,english:string)=>en?english:es,money=(cents:number)=>proMoney(cents/100,en),{confirm}=useAppDialog();
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),attempt=useRef<{receiptId:string;file:File}|null>(null);
 async function post(body:unknown){return fetch(api,{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});}
 async function upload(file:File){
  if(busy)return;setError('');setNotice('');
  if(file.size>WORK_FILE_MAX_BYTES||!['image/jpeg','image/png','image/webp','application/pdf'].includes(file.type)){setError(t('Use una foto JPG, PNG o WebP, o un PDF de hasta 20 MB.','Use a JPG, PNG or WebP photo, or a PDF up to 20 MB.'));return;}
  if(attempt.current?.file!==file)attempt.current={receiptId:crypto.randomUUID(),file};
  setBusy(true);
  try{const response=await post({action:'attach',expenseId:expense.id,receiptId:attempt.current.receiptId,name:file.name.slice(0,160)||'comprobante',data:await base64(file)});
   if(!response.ok){setError(response.status===400?t('Use una foto JPG, PNG o WebP, o un PDF de hasta 20 MB.','Use a JPG, PNG or WebP photo, or a PDF up to 20 MB.'):t('No se pudo guardar el comprobante. Reintente: no se duplicará.','Could not save the receipt. Retry: it will not be duplicated.'));return;}
   attempt.current=null;setNotice(t('Comprobante guardado.','Receipt saved.'));onChanged();
  }catch{setError(t('No se pudo guardar el comprobante. Reintente: no se duplicará.','Could not save the receipt. Retry: it will not be duplicated.'));}finally{setBusy(false);}
 }
 async function remove(){
  if(busy||!expense.receipt)return;if(!await confirm({title:t('¿Quitar el comprobante?','Remove the receipt?'),description:t('El gasto se conserva; solo se quita el archivo adjunto.','The expense is kept; only the attached file is removed.'),confirmLabel:t('Quitar','Remove'),cancelLabel:t('Cancelar','Cancel')}))return;
  setBusy(true);setError('');setNotice('');
  try{const response=await post({action:'remove',expenseId:expense.id,receiptId:expense.receipt.id});if(!response.ok){setError(t('No se pudo quitar el comprobante. Actualice el gasto.','Could not remove the receipt. Refresh the expense.'));return;}setNotice(t('Comprobante quitado.','Receipt removed.'));onChanged();}
  catch{setError(t('No se pudo quitar el comprobante. Actualice el gasto.','Could not remove the receipt. Refresh the expense.'));}finally{setBusy(false);}
 }
 const vat=expense.vatRateBps??null;
 return <section data-expense-billing className="space-y-2 rounded-xl border border-[#d7e1ea] p-3 text-sm">
  <p data-expense-billable>{expense.billable?t('Facturable al cliente','Billable to the customer'):t('No facturable al cliente','Not billable to the customer')}{expense.paymentMethod?' · '+t('Pagado con ','Paid by ')+expenseMethodLabel(expense.paymentMethod,en):''}</p>
  {vat!==null&&expense.netCents!=null&&expense.vatCents!=null&&<p data-expense-vat-split>{t('Incluye IVA ','Includes VAT ')}{(vat/100).toLocaleString(en?'en-US':'es-CR')+(en?'%':' %')}: {money(expense.netCents)} + {money(expense.vatCents)} = {money(expense.amountCents)}</p>}
  {expense.billable&&!expense.workId&&<p className="text-xs text-[#8a4b00]">{t('Vincúlelo a un trabajo (Costos y pagos del trabajo) para poder facturarlo.','Link it to a job (the job’s Costs & payments) to bill it.')}</p>}
  {expense.invoicedDraftId&&<p data-expense-invoiced className="text-xs font-semibold text-[#8a4b00]">{t('En un borrador de factura activo: el importe, la fecha, el concepto y el IVA quedan fijos hasta archivar ese borrador.','In an active invoice draft: amount, date, description and VAT stay fixed until that draft is archived.')}</p>}
  <div className="space-y-2 border-t border-[#e5e7eb] pt-2">
   <p className="font-semibold">{t('Comprobante','Receipt')}</p>
   {expense.receipt?<div className="flex min-w-0 flex-wrap items-center gap-2"><a data-expense-receipt href={api+'?'+new URLSearchParams({receiptId:expense.receipt.id})} className="inline-flex min-h-11 min-w-0 items-center break-all font-semibold text-[#0f5f8c] underline">{expense.receipt.name}</a><Button type="button" variant="ghost" disabled={disabled||busy} onClick={()=>void remove()}>{t('Quitar','Remove')}</Button></div>:<p className="text-[#52627a]">{t('Sin comprobante adjunto.','No receipt attached.')}</p>}
   <label className="block text-sm font-medium">{expense.receipt?t('Reemplazar comprobante (foto o PDF, hasta 20 MB)','Replace receipt (photo or PDF, up to 20 MB)'):t('Adjuntar comprobante (foto o PDF, hasta 20 MB)','Attach receipt (photo or PDF, up to 20 MB)')}
    <ProFileInput aria-label={t('Comprobante del gasto','Expense receipt')} accept="image/jpeg,image/png,image/webp,application/pdf" disabled={disabled||busy} onChange={event=>{const file=event.target.files?.[0];event.target.value='';if(file)void upload(file);}} className="mt-1"/></label>
   {busy&&<p role="status">{t('Guardando…','Saving…')}</p>}
   {notice&&<p role="status" className="text-green-800">{notice}</p>}
   {error&&<p role="alert" className="text-red-700">{error}</p>}
  </div>
 </section>;
}
