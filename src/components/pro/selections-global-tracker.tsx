'use client';
import {useCallback,useEffect,useMemo,useState} from 'react';
import {Button} from '@/components/ui/button';
import {proMoney} from '@/lib/pro/money';
import {proCsv} from '@/lib/pro/reports';
import {globalTrackerSchema,type GlobalRow} from '@/lib/pro/selection-boards';

/** Area E: global selections tracker across all the owner's jobs, with search, job/status filters and CSV export (the "global tracker report"). */
const field='mt-1 block min-h-11 w-full min-w-0 rounded-xl border border-[#d7e1ea] bg-white px-3 text-base font-normal';
const states={es:{no_options:'Sin opciones',draft:'Sin publicar',pending_client:'Pendiente del cliente',approved:'Aprobado',changes_requested:'Cambios solicitados'},en:{no_options:'No options',draft:'Not published',pending_client:'Waiting for customer',approved:'Approved',changes_requested:'Changes requested'}} as Record<'es'|'en',Record<string,string>>;
const orders={es:{not_ordered:'Sin pedir',ordered:'Pedido',delivered:'Entregado',installed:'Instalado'},en:{not_ordered:'Not ordered',ordered:'Ordered',delivered:'Delivered',installed:'Installed'}} as Record<'es'|'en',Record<string,string>>;
export function SelectionsGlobalTracker({accountId,en}:{accountId:string;en:boolean}){
 const l=en?'en':'es',t=(es:string,english:string)=>en?english:es,[rows,setRows]=useState<GlobalRow[]|null>(null),[truncated,setTruncated]=useState(false),[error,setError]=useState(false);
 const [query,setQuery]=useState(''),[job,setJob]=useState('all'),[state,setState]=useState('all'),[order,setOrder]=useState('all');
 const load=useCallback(async()=>{setError(false);try{const r=await fetch('/api/pro/selections-global',{cache:'no-store',headers:{'X-Pro-Expected-Actor':accountId}});if(!r.ok)throw Error();const body=globalTrackerSchema.parse(await r.json());setRows(body.items);setTruncated(body.truncated);}catch{setError(true);}},[accountId]);
 useEffect(()=>{const timer=setTimeout(()=>void load(),0);return()=>clearTimeout(timer);},[load]);
 const jobs=useMemo(()=>[...new Map((rows??[]).map(r=>[r.workId,r.workName||r.workId])).entries()],[rows]);
 const shown=useMemo(()=>(rows??[]).filter(r=>(job==='all'||r.workId===job)&&(state==='all'||r.state===state)&&(order==='all'||r.order===order)&&(!query.trim()||(r.name+' '+r.areaName+' '+r.workName+' '+(r.optionName??'')+' '+(r.brand??'')).toLocaleLowerCase('es').includes(query.trim().toLocaleLowerCase('es')))),[rows,job,state,order,query]);
 const money=(c:number|null)=>c===null?'—':proMoney(c/100,en);
 function exportCsv(){
  const head=[t('Trabajo','Job'),t('Habitación','Room'),t('Ítem','Item'),t('Estado de aprobación','Approval status'),t('Opción','Option'),t('Proveedor o marca','Vendor or brand'),t('Cantidad','Quantity'),t('Precio total (₡)','Total price (₡)'),t('Estado del pedido','Order status'),t('Fecha del pedido','Order date'),t('Fecha de entrega','Delivery date'),t('Fecha límite','Due date')];
  const body=shown.map(r=>[r.workName,r.areaName,r.name,states[l][r.state]??r.state,r.optionName??'',r.brand??'',r.quantity===null?'':String(r.quantity),r.totalCents===null?'':(r.totalCents/100).toFixed(2),orders[l][r.order]??r.order,r.orderedOn??'',r.deliveredOn??'',r.dueDate??'']);
  const url=URL.createObjectURL(new Blob([proCsv([head,...body])],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download=en?'global-selections-tracker.csv':'seguimiento-global-selecciones.csv';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
 if(error)return <div role="alert" data-global-error className="space-y-2 text-sm"><p>{t('No se pudo cargar el seguimiento global.','Could not load the global tracker.')}</p><Button type="button" variant="secondary" onClick={()=>void load()}>{t('Reintentar','Retry')}</Button></div>;
 if(!rows)return <p role="status" className="text-sm text-[#52627a]">{t('Cargando seguimiento global…','Loading global tracker…')}</p>;
 return <div data-selections-global className="min-w-0 space-y-3">
  <p className="text-sm text-[#52627a]">{t('Todos los ítems de selección de todos sus trabajos en una sola tabla.','Every selection item of all your jobs in one table.')}</p>
  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
   <label className="block text-sm font-semibold">{t('Buscar','Search')}<input type="search" data-global-filter="query" value={query} onChange={e=>setQuery(e.target.value)} className={field}/></label>
   <label className="block text-sm font-semibold">{t('Trabajo','Job')}<select data-global-filter="job" value={job} onChange={e=>setJob(e.target.value)} className={field}><option value="all">{t('Todos','All')}</option>{jobs.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label>
   <label className="block text-sm font-semibold">{t('Estado de aprobación','Approval status')}<select data-global-filter="state" value={state} onChange={e=>setState(e.target.value)} className={field}><option value="all">{t('Todos','All')}</option>{Object.entries(states[l]).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
   <label className="block text-sm font-semibold">{t('Estado del pedido','Order status')}<select data-global-filter="order" value={order} onChange={e=>setOrder(e.target.value)} className={field}><option value="all">{t('Todos','All')}</option>{Object.entries(orders[l]).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
  </div>
  <div className="flex flex-wrap items-center gap-2"><Button type="button" variant="outline" className="min-h-11" data-global-export disabled={!shown.length} onClick={exportCsv}>{t('Exportar CSV','Export CSV')}</Button><span data-global-count className="text-sm text-[#52627a]">{shown.length} {shown.length===1?t('ítem','item'):t('ítems','items')}</span></div>
  {truncated&&<p className="text-sm text-[#8a5a00]">{t('Se muestran los primeros 1000 ítems.','Showing the first 1000 items.')}</p>}
  {!shown.length?<p data-global-empty className="rounded-2xl border border-dashed border-[#d7e1ea] bg-[#f7f9fc] p-5 text-center text-sm text-[#52627a]">{rows.length?t('Ningún ítem coincide con los filtros.','No item matches the filters.'):t('Todavía no hay ítems de selección en sus trabajos.','There are no selection items in your jobs yet.')}</p>:<>
   <div className="hidden overflow-x-auto rounded-2xl border border-[#d7e1ea] md:block"><table className="w-full min-w-[44rem] text-left text-sm"><thead className="bg-[#f7f9fc] text-xs font-bold uppercase tracking-wide text-[#52627a]"><tr>{[t('Trabajo','Job'),t('Habitación','Room'),t('Ítem','Item'),t('Estado','Status'),t('Pedido','Order'),t('Total','Total')].map((h,i)=><th key={h} className={`px-3 py-2 ${i===5?'text-right':''}`}>{h}</th>)}</tr></thead>
    <tbody>{shown.map(r=><tr key={r.itemId} data-global-row={r.itemId} className="border-t border-[#e5e7eb] align-top"><td className="break-words px-3 py-2">{r.workName}</td><td className="break-words px-3 py-2">{r.areaName}</td><td className="break-words px-3 py-2 font-semibold text-[#162543]">{r.name}{r.optionName&&<span className="block text-xs font-normal text-[#52627a]">{r.optionName}</span>}</td><td className="px-3 py-2">{states[l][r.state]??r.state}</td><td className="px-3 py-2">{orders[l][r.order]??r.order}</td><td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{money(r.totalCents)}</td></tr>)}</tbody></table></div>
   <ul className="space-y-2 md:hidden">{shown.map(r=><li key={r.itemId} data-global-card={r.itemId} className="space-y-1 rounded-xl border border-[#d7e1ea] bg-white p-3 text-sm"><p className="break-words font-semibold text-[#162543]">{r.name}</p><p className="break-words text-[#52627a]">{r.workName} · {r.areaName}</p><p>{states[l][r.state]??r.state} · {orders[l][r.order]??r.order} · {money(r.totalCents)}</p></li>)}</ul></>}
 </div>;
}
