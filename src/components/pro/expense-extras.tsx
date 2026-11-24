'use client';
import {useLocale} from 'next-intl';
import {proMoney} from '@/lib/pro/money';
import type {InternalExpense} from '@/lib/pro/expenses';

/** Area C: KPI cards of the expense list and . */
export function expenseKpis(rows:readonly Pick<InternalExpense,'amountCents'|'billable'|'invoicedDraftId'>[]){
 let billable=0,invoiced=0,cost=0;
 for(const row of rows){if(row.billable){if(row.invoicedDraftId)invoiced+=row.amountCents;else billable+=row.amountCents;}else cost+=row.amountCents;}
 return {billable,invoiced,cost};
}
export function ExpenseKpiCards({rows}:{rows:readonly InternalExpense[]}){
 const en=useLocale()==='en',k=expenseKpis(rows),money=(cents:number)=>proMoney(cents/100);
 const cards:[string,string,number][]=[['billable',en?'Total billable':'Total facturable',k.billable],['invoiced',en?'Total invoiced':'Total facturado',k.invoiced],['cost',en?'Total cost (non-billable)':'Costo total (no facturable)',k.cost]];
 return <dl data-expense-kpis className="grid grid-cols-1 gap-2 sm:grid-cols-3">{cards.map(([id,label,value])=><div key={id} data-expense-kpi={id} data-raw={value} className="min-w-0 rounded-xl border border-[#d7e1ea] bg-white p-3"><dt className="text-xs font-semibold uppercase tracking-wide text-[#52627a]">{label}</dt><dd className="break-words text-lg font-bold text-[#162543]">{money(value)}</dd></div>)}</dl>;
}
