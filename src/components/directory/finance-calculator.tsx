'use client';
import {idiomaDe} from '@/lib/prefijo-de-idioma';
import {useId,useState} from 'react';
import {FINANCE_DISCLAIMER,FINANCE_LIMITS,frenchAmortization} from '@/lib/directory/finance-calc';
import {formatDate,formatMoney,type DeclaredFinancing} from '@/lib/directory/listing-public';
import {focusRing,tr} from './listing-detail-parts';

/**
 * LOCAL PRO ONLY (multivertical V4/V7): installment estimate. Renders ONLY when the dealer declared financing terms
 * (the caller passes `financing`); otherwise returns null. Always shows the fixed disclaimer.
 */
const field=`mt-1 block min-h-11 w-full min-w-0 rounded-xl border border-[#d7e1ea] bg-white px-3 py-2 text-base text-[#162543] ${focusRing}`;
export function FinanceCalculator({priceMinor,currency,financing,locale}:{priceMinor:number;currency:'CRC'|'USD';financing:DeclaredFinancing|null|undefined;locale:string}){
 const t=tr(locale),id=useId();
 const minDown=financing?Math.ceil(priceMinor*financing.minDownPaymentPct/100/100):0;
 const maxTerm=financing?Math.min(financing.maxTermMonths,FINANCE_LIMITS.maxTermMonths):0;
 const [down,setDown]=useState(()=>String(minDown)),[term,setTerm]=useState(()=>String(maxTerm));
 if(!financing||!(financing.annualRatePct>=0)||maxTerm<1)return null;
 const downMinor=Math.round(Number(down.replace(/[^\d.]/g,''))*100),termMonths=Number(term);
 const result=frenchAmortization({priceMinor,downPaymentMinor:Number.isFinite(downMinor)?downMinor:-1,annualRatePct:financing.annualRatePct,termMonths});
 const belowMin=downMinor<minDown*100;
 const terms=[12,24,36,48,60,72,84,96,120].filter(m=>m<=maxTerm);if(!terms.includes(maxTerm))terms.push(maxTerm);
 const error=!result.ok?(result.error==='invalid_down_payment'?t('La prima debe ser menor que el precio.','The down payment must be lower than the price.'):t('Revise los datos.','Check the values.'))
  :belowMin?t(`La prima mínima declarada es ${formatMoney(minDown*100,currency,locale)}.`,`The declared minimum down payment is ${formatMoney(minDown*100,currency,locale)}.`):null;
 return <section aria-labelledby={id+'h'} data-finance-calculator className="space-y-4 rounded-2xl border border-[#d7e1ea] p-5">
  <div>
   <h2 id={id+'h'} className="text-lg font-bold">{t('Calcule una cuota aproximada','Estimate a monthly payment')}</h2>
   <p className="text-sm text-slate-700">{t('Tasa anual declarada por el vendedor','Annual rate declared by the seller')}: <strong>{financing.annualRatePct.toLocaleString({es:'es-CR',en:'en-US'}[idiomaDe(locale)])} %</strong> · {t('declarada el','declared on')} {formatDate(financing.declaredAt,locale)}</p>
  </div>
  <div className="grid gap-3 sm:grid-cols-2">
   <label className="block text-sm font-medium" htmlFor={id+'d'}>{t('Prima','Down payment')} ({currency==='USD'?'US$':'₡'})
    <input id={id+'d'} inputMode="decimal" className={field} value={down} onChange={e=>setDown(e.target.value)} aria-describedby={error?id+'e':undefined} aria-invalid={!!error}/></label>
   <label className="block text-sm font-medium" htmlFor={id+'t'}>{t('Plazo','Term')}
    <select id={id+'t'} className={field} value={term} onChange={e=>setTerm(e.target.value)}>{terms.map(m=><option key={m} value={m}>{m} {t('meses','months')}</option>)}</select></label>
  </div>
  {error?<p id={id+'e'} role="alert" className="text-sm text-red-700">{error}</p>
   :result.ok&&<dl aria-live="polite" className="grid gap-2 sm:grid-cols-3" data-finance-result>
    <div className="rounded-xl bg-[#EBF5FB] px-3 py-2"><dt className="text-xs font-medium text-slate-700">{t('Cuota mensual aprox.','Approx. monthly payment')}</dt><dd className="text-xl font-extrabold text-[#162543]">{formatMoney(result.value.monthlyPaymentMinor,currency,locale)}</dd></div>
    <div className="rounded-xl bg-[#f6f9fc] px-3 py-2"><dt className="text-xs font-medium text-slate-700">{t('Monto financiado','Amount financed')}</dt><dd className="font-semibold">{formatMoney(result.value.principalMinor,currency,locale)}</dd></div>
    <div className="rounded-xl bg-[#f6f9fc] px-3 py-2"><dt className="text-xs font-medium text-slate-700">{t('Intereses totales aprox.','Approx. total interest')}</dt><dd className="font-semibold">{formatMoney(result.value.totalInterestMinor,currency,locale)}</dd></div>
   </dl>}
  <p className="text-xs text-slate-700" data-finance-disclaimer>{FINANCE_DISCLAIMER[idiomaDe(locale)]}</p>
 </section>;
}
