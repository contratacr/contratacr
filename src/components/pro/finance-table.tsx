'use client';
import {useEffect,useState,type ReactNode} from 'react';
import {useLocale} from 'next-intl';
import {nextSort,sanitizeColumns,sortRows,toggleColumn,type SortDirection,type SortValue} from '@/lib/pro/finance-table';

/** Area D: table view shared by the money lists (quotes, invoices, purchase orders): sortable headers and a column picker kept per browser. */
export type FinanceColumn<T>={key:string;label:string;render:(row:T)=>ReactNode;sort?:(row:T)=>SortValue;align?:'right';defaultOn?:boolean};
export type FinanceViewMode='cards'|'table';
function stored(key:string){try{return JSON.parse(window.localStorage.getItem(key)??'null') as unknown;}catch{return null;}}
function save(key:string,value:unknown){try{window.localStorage.setItem(key,JSON.stringify(value));}catch{/* the picker still works for this visit */}}

/** «Cards / Table» switch; the choice is a per-browser convenience. */
export function useFinanceView(id:string){
 const [mode,setMode]=useState<FinanceViewMode>('cards');
 useEffect(()=>{const timer=setTimeout(()=>{const value=stored('pro-finance-view:'+id);if(value==='table'||value==='cards')setMode(value);},0);return()=>clearTimeout(timer);},[id]);
 return [mode,(value:FinanceViewMode)=>{setMode(value);save('pro-finance-view:'+id,value);}] as const;
}
export function FinanceViewSwitch({mode,onChange,groupLabel,cards,table}:{mode:FinanceViewMode;onChange:(mode:FinanceViewMode)=>void;groupLabel:string;cards:string;table:string}){
 return <div role="group" aria-label={groupLabel} data-finance-view-switch className="inline-flex overflow-hidden rounded-full border border-[#d7e1ea] bg-white">
  {(['cards','table'] as const).map(value=><button key={value} type="button" data-finance-view={value} aria-pressed={mode===value} onClick={()=>onChange(value)}
   className={`min-h-11 px-4 text-sm font-semibold ${mode===value?'bg-[#eaf7fb] text-[#006e90]':'text-[#52627a]'}`}>{value==='cards'?cards:table}</button>)}
 </div>;
}

export function FinanceTable<T extends {id:string}>({id,columns,rows,rowAttrs,onOpen,openLabel,caption}:{id:string;columns:FinanceColumn<T>[];rows:T[];rowAttrs?:(row:T)=>Record<string,string>;onOpen?:(row:T)=>void;openLabel?:(row:T)=>string;caption:string}){
 const en=useLocale()==='en',all=columns.map(c=>c.key),defaults=columns.filter(c=>c.defaultOn!==false).map(c=>c.key);
 const [visible,setVisible]=useState<string[]>(()=>sanitizeColumns(null,all,defaults)),[sort,setSort]=useState<{key:string;direction:SortDirection}|null>(null),[picker,setPicker]=useState(false);
 useEffect(()=>{const timer=setTimeout(()=>setVisible(sanitizeColumns(stored('pro-finance-columns:'+id),all,defaults)),0);return()=>clearTimeout(timer);// eslint-disable-next-line react-hooks/exhaustive-deps
 },[id]);
 const shown=columns.filter(c=>visible.includes(c.key)),sortColumn=sort?columns.find(c=>c.key===sort.key):undefined;
 const ordered=sort&&sortColumn?.sort?sortRows(rows,sortColumn.sort,sort.direction):rows;
 const toggle=(key:string)=>{const next=toggleColumn(visible,all,key);setVisible(next);save('pro-finance-columns:'+id,next);};
 return <div data-finance-table={id} className="space-y-2">
  <div className="flex justify-end">
   <button type="button" data-finance-columns-toggle aria-expanded={picker} onClick={()=>setPicker(v=>!v)} className="min-h-11 rounded-full border border-[#d7e1ea] bg-white px-4 text-sm font-semibold text-[#162543]">{en?'Columns':'Columnas'} ({shown.length}/{columns.length})</button>
  </div>
  {picker&&<fieldset data-finance-columns-picker className="grid grid-cols-1 gap-1 rounded-xl border border-[#d7e1ea] bg-[#f7f9fc] p-3 sm:grid-cols-2 lg:grid-cols-4">
   <legend className="px-1 text-sm font-semibold text-[#162543]">{en?'Show columns':'Mostrar columnas'}</legend>
   {columns.map((c,index)=><label key={c.key} className="flex min-h-11 items-center gap-2 text-sm text-[#162543]"><input type="checkbox" className="h-5 w-5" data-finance-column-option={c.key} checked={visible.includes(c.key)} disabled={index===0} onChange={()=>toggle(c.key)}/>{c.label}</label>)}
  </fieldset>}
  <div className="max-w-full overflow-x-auto rounded-xl border border-[#d7e1ea] bg-white">
   <table className="w-full min-w-max border-collapse text-left text-sm">
    <caption className="sr-only">{caption}</caption>
    <thead className="bg-[#f7f9fc] text-xs uppercase tracking-wide text-[#52627a]"><tr>
     {shown.map(c=><th key={c.key} data-finance-column={c.key} scope="col" aria-sort={sort?.key===c.key?(sort.direction==='asc'?'ascending':'descending'):undefined} className={`px-3 py-2 font-semibold ${c.align==='right'?'text-right':''}`}>
      {c.sort?<button type="button" data-finance-sort={c.key} onClick={()=>setSort(nextSort(sort,c.key))} className="min-h-11 whitespace-nowrap font-semibold uppercase">{c.label}{sort?.key===c.key?(sort.direction==='asc'?' ▲':' ▼'):''}</button>:<span className="whitespace-nowrap">{c.label}</span>}
     </th>)}
     {onOpen&&<th scope="col" className="px-3 py-2"><span className="sr-only">{en?'Open':'Abrir'}</span></th>}
    </tr></thead>
    <tbody>{ordered.map(row=><tr key={row.id} data-finance-row={row.id} {...rowAttrs?.(row)} className="border-t border-[#e6edf3] align-top">
     {shown.map(c=><td key={c.key} data-finance-cell={c.key} className={`px-3 py-2 text-[#162543] ${c.align==='right'?'whitespace-nowrap text-right tabular-nums':'max-w-[18rem] break-words'}`}>{c.render(row)||'-'}</td>)}
     {onOpen&&<td className="px-3 py-2"><button type="button" data-finance-open onClick={()=>onOpen(row)} aria-label={openLabel?.(row)} className="min-h-11 rounded-lg border border-[#d7e1ea] px-3 font-semibold text-[#006e90]">{en?'Open':'Abrir'}</button></td>}
    </tr>)}</tbody>
   </table>
  </div>
 </div>;
}
