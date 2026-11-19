'use client';
import {InvoiceIssuerFields} from './invoice-issuer-fields';
import {useState} from 'react';
import {useLocale} from 'next-intl';
import {preparationDueDate,type InvoicePreparation} from '@/lib/pro/invoice-preparation';
const field='mt-1 block min-h-11 w-full min-w-0 max-w-full rounded-xl border border-[#e5e7eb] bg-white px-3 text-base font-normal';
export function InvoicePreparationFields({value,onChange,error,receiverId}:{value:InvoicePreparation;onChange:(value:InvoicePreparation)=>void;error:string;receiverId:string}){
 const en=useLocale()==='en',t=(es:string,eng:string)=>en?eng:es;
 const [saleOpen,setSaleOpen]=useState(false),[issuerOpen,setIssuerOpen]=useState(false);
 function change(key:keyof InvoicePreparation,next:string|number){onChange({...value,[key]:next,...(key==='saleCondition'&&next!=='credit'?{creditDays:0}:{})});}
 function text(key:keyof InvoicePreparation,label:string,maxLength:number,type='text'){
  return <label className="block text-sm font-bold">{label}<input autoCorrect="off" autoCapitalize="none" spellCheck={false} aria-label={label} value={String(value[key])} type={type} maxLength={maxLength} onChange={e=>change(key,e.target.value)} className={type==='date'?field+' appearance-none':field}/></label>;
 }
 function select(key:keyof InvoicePreparation,label:string,options:[string,string][]){
  return <label className="block text-sm font-bold">{label}<select aria-label={label} value={String(value[key])} onChange={e=>change(key,e.target.value)} className={field}><option value="">{t('Por definir','To be defined')}</option>{options.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label>;
 }
 const due=preparationDueDate(value),missing=[!value.issuerName&&t('Nombre del emisor','Issuer name'),(!value.issuerId||!value.issuerIdType)&&t('Tipo e identificación del emisor','Issuer identification and type'),!value.issuerEmail&&t('Correo del emisor','Issuer email'),!value.issuerAddress&&t('Dirección del emisor','Issuer address'),!value.issuerActivity&&t('Actividad económica del emisor','Issuer economic activity'),!receiverId&&t('Identificación del receptor','Recipient identification'),!value.plannedDate&&t('Fecha prevista','Planned date'),!value.saleCondition&&t('Condición de venta','Sale terms'),!value.paymentMethod&&t('Medio de pago previsto','Expected payment method')].filter(Boolean);
 // Launch fix: an incomplete fiscal profile is said up front (it was only inside the collapsed review), before anything is issued.
 const issuerMissing=[!value.issuerName&&t('nombre','name'),(!value.issuerId||!value.issuerIdType)&&t('tipo e identificación','identification and type'),!value.issuerEmail&&t('correo','email'),!value.issuerAddress&&t('dirección','address')].filter(Boolean) as string[];
 return <div className="space-y-3" data-invoice-preparation="">
  {issuerMissing.length>0&&<div role="alert" data-invoice-issuer-incomplete className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-[#5c3b00]"><p><strong>{t('Perfil fiscal incompleto.','Incomplete fiscal profile.')}</strong> {t('Faltan datos del emisor: ','Missing issuer details: ')}{issuerMissing.join(', ')}. {t('Sin ellos, este documento sale sin identificar a su empresa y no se puede emitir. Complételos en "Datos del emisor" (o en Facturación › Emisor de facturación para los borradores nuevos).','Without them this document does not identify your business and cannot be issued. Complete them in "Issuer details" (or in Billing › Billing issuer for new drafts).')}</p><button type="button" className="min-h-11 rounded-xl border border-amber-300 bg-white px-3 font-semibold" onClick={()=>setIssuerOpen(true)}>{t('Completar datos del emisor','Complete issuer details')}</button></div>}
  <details open={saleOpen||!!error} onToggle={e=>setSaleOpen(e.currentTarget.open)} className="rounded-xl border border-[#e5e7eb] p-3"><summary className="min-h-8 cursor-pointer text-sm font-semibold">{t('Condiciones de venta','Sale terms')}</summary><div className="mt-3 space-y-3">
   {text('plannedDate',t('Fecha prevista del documento','Planned document date'),10,'date')}
   {select('saleCondition',t('Condición de venta','Sale condition'),[['cash',t('Contado','Cash sale')],['credit',t('Crédito','Credit sale')]])}
   {value.saleCondition==='credit'&&<><label className="block text-sm font-bold">{t('Plazo de crédito (días)','Credit term (days)')}<input aria-label={t('Plazo de crédito (días)','Credit term (days)')} type="number" min="1" max="3650" step="1" value={value.creditDays||''} onChange={e=>change('creditDays',Number(e.target.value))} className={field}/></label>{due&&!Number.isNaN(due.getTime())&&<p className="text-sm">{t('Vencimiento previsto: ','Expected due date: ')}{new Intl.DateTimeFormat(en?'en-US':'es-CR',{timeZone:'UTC',dateStyle:'long'}).format(due)}</p>}</>}
   {select('paymentMethod',t('Medio de pago previsto','Expected payment method'),[['cash',t('Efectivo','Cash')],['card',t('Tarjeta','Card')],['transfer',t('Transferencia','Bank transfer')],['sinpe','SINPE'],['other',t('Otro','Other')]])}
   {text('orderReference',t('Orden o referencia comercial (opcional)','Order or commercial reference (optional)'),80)}
   <p className="text-xs text-[#68778d]">{t('Datos previstos del borrador. Elegir contado o un medio de pago no registra un cobro ni cambia el saldo del trabajo.','Planned draft details. Choosing a cash sale or payment method does not record a payment or change the job balance.')}</p>
  </div></details>
  <details open={issuerOpen||!!error} onToggle={e=>setIssuerOpen(e.currentTarget.open)} className="rounded-xl border border-[#e5e7eb] p-3"><summary className="min-h-8 cursor-pointer text-sm font-semibold">{t('Datos del emisor','Issuer details')}</summary><div className="mt-3 space-y-3">
   <InvoiceIssuerFields value={value} onChange={issuer=>onChange({...value,...issuer})}/>
   <p className="text-xs text-[#68778d]">{t('Se guardan solo en este borrador. No cambian su perfil ni otros documentos. La identificación, actividad y autorización del emisor todavía requieren validación fiscal.','Saved only in this draft. They do not change your profile or other documents. Identification, activity and issuer authorization still need fiscal validation.')}</p>
  </div></details>
  {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
  <details className="rounded-xl bg-[#f3f8fb] p-3"><summary className="min-h-8 cursor-pointer text-sm font-semibold">{t('Revisar datos pendientes','Review missing details')} ({missing.length})</summary><div className="mt-2 space-y-2 text-xs text-[#52627a]">{missing.length?<ul className="list-disc space-y-1 pl-4">{missing.map(item=><li key={String(item)}>{item}</li>)}</ul>:<p>{t('Los campos de esta revisión están completos.','The fields in this review are complete.')}</p>}<p>{t('Puede guardar el borrador incompleto. Esta revisión no valida impuestos, CABYS, exoneraciones ni requisitos de Hacienda; no habilita la emisión.','You may save an incomplete draft. This review does not validate taxes, CABYS, exemptions or tax authority (Hacienda) requirements and does not enable issuance.')}</p></div></details>
 </div>;
}
