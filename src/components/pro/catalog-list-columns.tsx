'use client';
import {useCallback,useEffect,useState} from 'react';
import {useLocale} from 'next-intl';

/**
 * Row 59 (batch F): what each catalogue row shows (stock, price, cost, margin, chips). A per-viewer convenience kept in this
 * browser only; the catalogue data and its order on the server do not change. Defaults match the list before this option.
 */
export const CATALOG_COLUMNS=['stock','price','cost','margin','chips'] as const;
export type CatalogColumn=typeof CATALOG_COLUMNS[number];
const DEFAULT:CatalogColumn[]=['stock','price','chips'];
const KEY='ccr:pro:catalog-columns:v1';
function read():CatalogColumn[]{
 try{const raw=localStorage.getItem(KEY);if(!raw)return DEFAULT;const v=JSON.parse(raw);if(!Array.isArray(v))return DEFAULT;return CATALOG_COLUMNS.filter(c=>v.includes(c));}catch{return DEFAULT;}
}
export function useCatalogColumns(){
 const [columns,setColumns]=useState<CatalogColumn[]>(DEFAULT);
 useEffect(()=>{const t=setTimeout(()=>setColumns(read()),0);return()=>clearTimeout(t);},[]);
 const update=useCallback((next:CatalogColumn[])=>{setColumns(next);try{localStorage.setItem(KEY,JSON.stringify(next));}catch{}},[]);
 return [columns,update] as const;
}
export function catalogColumnLabel(column:CatalogColumn,en:boolean){
 return {stock:en?'Stock':'Existencias',price:en?'Price':'Precio',cost:en?'Cost':'Costo',margin:en?'Margin':'Margen',chips:en?'Favorite, cost type and MSRP':'Favorito, tipo de costo y precio sugerido'}[column];
}
export function CatalogColumnsPicker({columns,onChange}:{columns:CatalogColumn[];onChange:(next:CatalogColumn[])=>void}){
 const en=useLocale()==='en';
 return <details data-catalog-columns className="rounded-xl border border-[#d7e1ea] bg-white px-3">
  <summary className="flex min-h-11 cursor-pointer items-center text-[13px] font-bold text-[#162543]">{en?'Show in each item':'Mostrar en cada artículo'}</summary>
  <div className="flex flex-wrap gap-2 pb-3">{CATALOG_COLUMNS.map(column=>{const on=columns.includes(column);
   return <label key={column} className="flex min-h-11 items-center gap-2 rounded-xl border border-[#d7e1ea] px-3 text-sm"><input type="checkbox" className="h-5 w-5" data-catalog-column={column} checked={on} onChange={()=>onChange(on?columns.filter(c=>c!==column):CATALOG_COLUMNS.filter(c=>c===column||columns.includes(c)))}/><span className="break-words">{catalogColumnLabel(column,en)}</span></label>;})}</div>
  <p className="pb-3 text-xs text-[#68778d]">{en?'Saved in this browser only. "To replenish" always shows when stock is at or below the minimum.':'Se guarda solo en este navegador. "Por reponer" siempre se muestra cuando las existencias llegan al mínimo.'}</p>
 </details>;
}
