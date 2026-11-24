/** Area D: pure helpers for the table view of the money lists (sortable columns, column picker, document codes). No browser APIs. */
export type SortDirection='asc'|'desc';
export type SortValue=string|number|null|undefined;
/** Rows with an empty sort value always go last, whatever the direction. Strings compare in Spanish order with numeric parts. */
export function sortRows<T>(rows:readonly T[],value:(row:T)=>SortValue,direction:SortDirection):T[]{
 const sign=direction==='asc'?1:-1,empty=(v:SortValue)=>v===null||v===undefined||v==='';
 return rows.map((row,index)=>({row,index,v:value(row)})).sort((a,b)=>{
  if(empty(a.v)||empty(b.v))return empty(a.v)&&empty(b.v)?a.index-b.index:empty(a.v)?1:-1;
  const order=typeof a.v==='number'&&typeof b.v==='number'?a.v-b.v:String(a.v).localeCompare(String(b.v),'es',{numeric:true,sensitivity:'base'});
  return order?order*sign:a.index-b.index;
 }).map(entry=>entry.row);
}
/** Next direction when the same header is pressed again: ascending, descending, then back to ascending. */
export function nextSort(current:{key:string;direction:SortDirection}|null,key:string):{key:string;direction:SortDirection}{
 return current&&current.key===key&&current.direction==='asc'?{key,direction:'desc'}:{key,direction:'asc'};
}
/** Toggles a column in the picker. The first column (the title) and at least one column always stay visible. */
export function toggleColumn(visible:readonly string[],all:readonly string[],key:string):string[]{
 if(!all.includes(key)||key===all[0])return all.filter(k=>visible.includes(k)||k===all[0]);
 const on=visible.includes(key);
 return all.filter(k=>k===all[0]||(k===key?!on:visible.includes(k)));
}
/** Stored picker values come from the browser: keep only known keys, in table order, title first. */
export function sanitizeColumns(stored:unknown,all:readonly string[],defaults:readonly string[]):string[]{
 if(!Array.isArray(stored))return all.filter(k=>defaults.includes(k)||k===all[0]);
 const list=stored.filter((k):k is string=>typeof k==='string');
 return all.filter(k=>k===all[0]||list.includes(k));
}
/** Short, stable document code built from the record id, for example FAC-3F9A1C. */
export function documentCode(prefix:string,id:string){return `${prefix}-${id.replace(/[^0-9a-f]/gi,'').slice(0,6).toUpperCase()}`;}
