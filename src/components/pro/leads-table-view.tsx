'use client';
import {useEffect,useMemo,useState} from 'react';
import {Button} from '@/components/ui/button';
import {proMoney} from '@/lib/pro/money';
import type {LeadCenterItem} from '@/lib/pro/lead-center';
import type {RequestPipelineCatalog} from '@/lib/pro/request-pipeline';
import {leadStageName} from './lead-stages-editor';

/**
 * Leads area: a table view of the lead list with the "Customize your view" column chooser (show/hide, reorder, reset),
 * sortable headers and a pinned first column. The choice is a per-viewer convenience kept in the browser.
 */
export const leadColumnIds=['stage','client','address','projectType','source','revenue','profit','created','activity'] as const;
export type LeadColumnId=typeof leadColumnIds[number];
const storeKey='contratacr-pro-lead-columns-v1',modeKey='contratacr-pro-lead-view-v1';
type Prefs={order:LeadColumnId[];hidden:LeadColumnId[]};
const defaults=():Prefs=>({order:[...leadColumnIds],hidden:[]});
function readPrefs():Prefs{
 try{const raw=JSON.parse(localStorage.getItem(storeKey)||'null') as Prefs|null;if(!raw||!Array.isArray(raw.order)||!Array.isArray(raw.hidden))return defaults();
  const order=raw.order.filter((v,i,a):v is LeadColumnId=>(leadColumnIds as readonly string[]).includes(v)&&a.indexOf(v)===i);for(const id of leadColumnIds)if(!order.includes(id))order.push(id);
  return {order,hidden:raw.hidden.filter((v):v is LeadColumnId=>(leadColumnIds as readonly string[]).includes(v))};}catch{return defaults();}
}
export function useLeadViewMode(){
 const [mode,setMode]=useState<'cards'|'table'>('cards');
 useEffect(()=>{const timer=setTimeout(()=>{try{if(localStorage.getItem(modeKey)==='table')setMode('table');}catch{/* browser storage unavailable */}},0);return()=>clearTimeout(timer);},[]);
 return [mode,(next:'cards'|'table')=>{setMode(next);try{localStorage.setItem(modeKey,next);}catch{/* browser storage unavailable */}}] as const;
}
export function LeadViewToggle({en,mode,onChange,disabled}:{en:boolean;mode:'cards'|'table';onChange:(m:'cards'|'table')=>void;disabled?:boolean}){
 return <div role="group" aria-label={en?'List view':'Vista de la lista'} className="flex flex-wrap gap-2">{([['cards',en?'Cards':'Tarjetas'],['table',en?'Table':'Tabla']] as const).map(([v,label])=><button key={v} type="button" data-lead-view={v} aria-pressed={mode===v} disabled={disabled} onClick={()=>onChange(v)} className={'min-h-9 rounded-full border px-3 text-sm '+(mode===v?'border-[#008bb5] bg-[#e8f6fb] font-semibold':'border-[#d7e1ea]')}>{label}</button>)}</div>;
}
type Row={item:LeadCenterItem;name:string;stage:string;client:string;address:string;projectType:string;source:string;revenue:number|null;profit:number|null;currency:'CRC'|'USD';created:string;activity:string};
export function LeadsTableView({en,items,catalog,sourceOf,onOpen,onArchiveMany,disabled}:{en:boolean;onArchiveMany?:(items:LeadCenterItem[])=>void;items:LeadCenterItem[];catalog:RequestPipelineCatalog;sourceOf:(item:LeadCenterItem)=>string;onOpen:(item:LeadCenterItem)=>void;disabled?:boolean}){
 const t=(es:string,english:string)=>en?english:es,[prefs,setPrefs]=useState<Prefs>(defaults()),[draft,setDraft]=useState<Prefs|null>(null),[picked,setPicked]=useState<string[]>([]),[sort,setSort]=useState<{col:'name'|LeadColumnId;dir:'asc'|'desc'}>({col:'created',dir:'desc'});
 useEffect(()=>{const timer=setTimeout(()=>setPrefs(readPrefs()),0);return()=>clearTimeout(timer);},[]);
 const label:Record<'name'|LeadColumnId,string>={name:t('Nombre de la solicitud','Lead name'),stage:t('Etapa','Stage'),client:t('Cliente','Client name'),address:t('Dirección','Lead address'),projectType:t('Tipo de proyecto','Project type'),source:t('Canal de origen','Lead source'),revenue:t('Ingreso estimado','Estimated revenue'),profit:t('Ganancia estimada','Estimated profit'),created:t('Creada','Lead created'),activity:t('Última actividad','Last activity')};
 const rows=useMemo<Row[]>(()=>items.map(item=>{
  const stageId=item.kind==='request'?item.request.effectiveStageId:item.manual.stageId??'new',stage=catalog.stages.find(s=>s.id===stageId);
  if(item.kind==='manual'){const m=item.manual;return {item,name:m.title,stage:stage?leadStageName(stage,en):'',client:item.client.name,address:m.address,projectType:m.forecast.projectType,source:sourceOf(item)||m.sourceLabel,revenue:m.forecast.revenueCents,profit:m.forecast.profitCents,currency:m.forecast.currency,created:m.createdAt,activity:m.updatedAt};}
  const r=item.request;return {item,name:r.service,stage:stage?leadStageName(stage,en):'',client:r.clientName,address:'',projectType:'',source:sourceOf(item),revenue:null,profit:null,currency:'CRC' as const,created:r.createdAt,activity:[r.updatedAt,item.preference.updatedAt].filter((v):v is string=>!!v).sort().at(-1)!};
 }),[items,catalog,sourceOf,en]);
 const sorted=useMemo(()=>{
  const key=(r:Row)=>sort.col==='name'?r.name:sort.col==='revenue'?(r.revenue??-1):sort.col==='profit'?(r.profit??-1e13):r[sort.col];
  return [...rows].sort((a,b)=>{const x=key(a),y=key(b),c=typeof x==='number'&&typeof y==='number'?x-y:String(x).localeCompare(String(y),en?'en':'es');return sort.dir==='asc'?c:-c;});
 },[rows,sort,en]);
 const shown=prefs.order.filter(c=>!prefs.hidden.includes(c));
 const money=(v:number|null,currency:'CRC'|'USD')=>v===null?'—':currency==='CRC'?proMoney(v/100,en):new Intl.NumberFormat(en?'en-US':'es-CR',{style:'currency',currency:'USD'}).format(v/100);
 const day=(v:string)=>new Intl.DateTimeFormat(en?'en-US':'es-CR',{dateStyle:'medium',timeZone:'America/Costa_Rica'}).format(new Date(v));
 const cell=(r:Row,c:LeadColumnId)=>c==='revenue'?money(r.revenue,r.currency):c==='profit'?money(r.profit,r.currency):c==='created'||c==='activity'?day(r[c]):(r[c]||'—');
 function save(next:Prefs){setPrefs(next);try{localStorage.setItem(storeKey,JSON.stringify(next));}catch{/* browser storage unavailable */}}
 const header=(c:'name'|LeadColumnId)=><th key={c} scope="col" aria-sort={sort.col===c?(sort.dir==='asc'?'ascending':'descending'):'none'} className={'whitespace-nowrap border-b border-[#d7e1ea] bg-white p-2 text-left font-semibold'+(c==='name'?' sticky left-0 z-10':'')}><button type="button" data-lead-sort={c} disabled={disabled} className="min-h-9 text-left font-semibold" onClick={()=>setSort(s=>({col:c,dir:s.col===c&&s.dir==='asc'?'desc':'asc'}))}>{label[c]}{sort.col===c?(sort.dir==='asc'?' ▲':' ▼'):''}</button></th>;
 return <div data-lead-table-view className="min-w-0 space-y-2">
  <div className="flex flex-wrap items-center justify-between gap-2">{picked.length?<div data-lead-bulk-bar role="group" aria-label={t('Acciones en lote','Bulk actions')} className="flex flex-wrap items-center gap-2 rounded-xl bg-[#e8f6fb] px-3 py-2 text-sm"><span data-lead-bulk-count className="font-semibold">{picked.length}{t(' seleccionadas',' selected')}</span>{onArchiveMany&&<Button type="button" variant="outline" data-lead-bulk-archive disabled={disabled} onClick={()=>{const set=new Set(picked);onArchiveMany(items.filter(i=>set.has(i.kind+':'+i.id)));setPicked([]);}}>{t('Archivar','Archive')}</Button>}<Button type="button" variant="ghost" data-lead-bulk-clear onClick={()=>setPicked([])}>{t('Quitar selección','Clear selection')}</Button></div>:<span/>}<Button type="button" variant="outline" data-lead-customize disabled={disabled} onClick={()=>setDraft({order:[...prefs.order],hidden:[...prefs.hidden]})}>{t('Personalizar su vista','Customize your view')}</Button></div>
  <div className="max-w-full overflow-x-auto rounded-xl border border-[#d7e1ea] bg-white"><table className="w-full min-w-max border-collapse text-sm"><thead><tr><th scope="col" className="border-b border-[#d7e1ea] bg-white p-2"><input type="checkbox" data-lead-select-all aria-label={t('Seleccionar todas','Select all')} disabled={disabled||!sorted.length} checked={!!sorted.length&&sorted.every(r=>picked.includes(r.item.kind+':'+r.item.id))} onChange={e=>setPicked(e.target.checked?sorted.map(r=>r.item.kind+':'+r.item.id):[])}/></th>{header('name')}{shown.map(header)}<th scope="col" className="border-b border-[#d7e1ea] bg-white p-2"><span className="sr-only">{t('Acciones','Actions')}</span></th></tr></thead>
   <tbody>{sorted.map(r=><tr key={r.item.kind+':'+r.item.id} data-lead-table-row={r.item.id} className="border-b border-[#eef2f6] align-top"><td className="p-2"><input type="checkbox" data-lead-select={r.item.id} aria-label={t('Seleccionar ','Select ')+r.name} disabled={disabled} checked={picked.includes(r.item.kind+':'+r.item.id)} onChange={e=>setPicked(p=>e.target.checked?[...p,r.item.kind+':'+r.item.id]:p.filter(x=>x!==r.item.kind+':'+r.item.id))}/></td><th scope="row" className="sticky left-0 max-w-[16rem] break-words bg-white p-2 text-left font-semibold">{r.name}</th>{shown.map(c=><td key={c} data-lead-col={c} className="max-w-[16rem] break-words p-2">{cell(r,c)}</td>)}<td className="p-2"><Button type="button" variant="outline" disabled={disabled} onClick={()=>onOpen(r.item)}>{t('Abrir solicitud','Open lead')}</Button></td></tr>)}</tbody></table></div>
  {draft&&<div role="dialog" aria-modal="true" aria-label={t('Personalizar su vista','Customize your view')} className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"><div className="max-h-[90vh] w-full max-w-md space-y-3 overflow-y-auto rounded-2xl bg-white p-4">
   <h3 className="text-lg font-semibold">{t('Personalizar su vista','Customize your view')}</h3>
   <p className="text-sm text-[#52627a]">{t('Elija qué columnas desea ver y use las flechas para cambiar su orden.','Choose which columns you want to see and use the arrows to reorder them.')}</p>
   <p className="rounded-xl bg-[#f4f7fa] p-2 text-sm font-semibold">{t('Fija: ','Pinned: ')}{label.name}</p>
   <ul className="space-y-1">{draft.order.map((c,i)=><li key={c} className="flex items-center gap-2"><label className="flex min-h-11 flex-1 items-center gap-2 text-sm"><input type="checkbox" data-lead-col-toggle={c} checked={!draft.hidden.includes(c)} onChange={e=>setDraft({...draft,hidden:e.target.checked?draft.hidden.filter(x=>x!==c):[...draft.hidden,c]})}/>{label[c]}</label>
    <button type="button" aria-label={t('Subir ','Move up ')+label[c]} disabled={i===0} className="min-h-9 min-w-9 rounded-lg border border-[#d7e1ea] disabled:opacity-40" onClick={()=>{const o=[...draft.order];[o[i-1],o[i]]=[o[i],o[i-1]];setDraft({...draft,order:o});}}>↑</button>
    <button type="button" aria-label={t('Bajar ','Move down ')+label[c]} disabled={i===draft.order.length-1} className="min-h-9 min-w-9 rounded-lg border border-[#d7e1ea] disabled:opacity-40" onClick={()=>{const o=[...draft.order];[o[i+1],o[i]]=[o[i],o[i+1]];setDraft({...draft,order:o});}}>↓</button></li>)}</ul>
   <div className="flex flex-wrap justify-between gap-2"><Button type="button" variant="ghost" onClick={()=>setDraft(defaults())}>{t('Restablecer valores','Reset to defaults')}</Button><div className="flex gap-2"><Button type="button" variant="outline" onClick={()=>setDraft(null)}>{t('Cancelar','Cancel')}</Button><Button type="button" data-lead-columns-save onClick={()=>{save(draft);setDraft(null);}}>{t('Guardar','Save')}</Button></div></div>
  </div></div>}
 </div>;
}
