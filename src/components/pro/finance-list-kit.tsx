'use client';
import {ProSearchField} from './search-field';

/** Area D: summary cards and status chips shared by the money lists. Presentation only; the numbers come from lib/pro/finance-list. */
export type SummaryCard={key:string;label:string;value:string;detail?:string};
export function FinanceSummaryCards({cards,label}:{cards:SummaryCard[];label:string}){
 return <dl data-finance-summary aria-label={label} className="grid grid-cols-2 gap-2 lg:grid-cols-4">
  {cards.map(card=><div key={card.key} data-finance-card={card.key} className="min-w-0 rounded-xl border border-[#d7e1ea] bg-white p-3">
   <dt className="text-xs font-semibold uppercase tracking-wide text-[#52627a]">{card.label}</dt>
   <dd className="mt-1 break-words text-lg font-bold text-[#162543]">{card.value}</dd>
   {card.detail&&<dd className="text-xs text-[#52627a]">{card.detail}</dd>}
  </div>)}
 </dl>;
}
export type FilterOption<T extends string>={value:T;label:string;count:number};
export function FinanceFilters<T extends string>({options,value,onChange,query,onQuery,searchLabel,groupLabel}:{options:FilterOption<T>[];value:T;onChange:(value:T)=>void;query:string;onQuery:(value:string)=>void;searchLabel:string;groupLabel:string}){
 return <div data-finance-filters className="space-y-2">
  <ProSearchField label={searchLabel} value={query} onChange={onQuery}/>
  <div role="group" aria-label={groupLabel} className="flex flex-wrap gap-2">
   {options.map(option=><button key={option.value} type="button" data-finance-filter={option.value} aria-pressed={value===option.value} onClick={()=>onChange(option.value)}
    className={`min-h-11 rounded-full border px-4 text-sm font-semibold ${value===option.value?'border-[#009FD9] bg-[#eaf7fb] text-[#006e90]':'border-[#d7e1ea] bg-white text-[#52627a]'}`}>{option.label} ({option.count})</button>)}
  </div>
 </div>;
}
export function moneyList(values:Record<string,number>,format:(cents:number,currency:string)=>string,empty:string){
 const entries=Object.entries(values);return entries.length?entries.map(([currency,cents])=>format(cents,currency)).join(' · '):empty;
}
