'use client';
import {useEffect,useMemo,useState} from 'react';
import {Button} from '@/components/ui/button';
import {proMoney} from '@/lib/pro/money';
import {proCsv} from '@/lib/pro/reports';
import {trackerViewSchema,trackerViewsSchema} from '@/lib/pro/selection-boards';
import {selectionTrackingSchema,type SelectionTracking} from '@/lib/pro/round10';
import type {SelectionArea,SelectionItem,SelectionState} from '@/lib/pro/selections';
import {
 buildTrackerRows,filterTrackerRows,groupTrackerRows,parseCustomViews,roomSorts,sortRooms,sortTrackerRows,summarizeRooms,trackerColumnGroups,trackerColumnLabels,trackerColumns,trackerCsvRows, trackerGroups,trackerOrderStatuses,trackerSorts,trackerViewColumns,trackerViewLabels,trackerViews,
 type CustomView,type RoomSort,type TrackerColumn,type TrackerFilters,type TrackerGroup,type TrackerRow,type TrackerSort,
} from '@/lib/pro/selections-views';

/**
 * Row 62: Tracker with saved views (Planning, Financials, Procurement, All), column chooser, sort, organize by,
 * filters and CSV export, plus room cards (pending / changes requested / approved counters and approved total).
 * Everything is computed from the selections and tracking APIs; nothing here writes data.
 */
const field='mt-1 block min-h-11 w-full min-w-0 rounded-xl border border-[#d7e1ea] bg-white px-3 text-base font-normal';
const states:SelectionState[]=['no_options','draft','pending_client','approved','changes_requested'];
const stateText={es:{no_options:'Sin opciones',draft:'Sin publicar',pending_client:'Pendiente del cliente',approved:'Aprobado',changes_requested:'Cambios solicitados',archived:'Archivado'},en:{no_options:'No options',draft:'Not published',pending_client:'Waiting for customer',approved:'Approved',changes_requested:'Changes requested',archived:'Archived'}};
const orderText={es:{'':'Sin pedir',not_ordered:'Sin pedir',ordered:'Pedido',delivered:'Entregado',installed:'Instalado'},en:{'':'Not ordered',not_ordered:'Not ordered',ordered:'Ordered',delivered:'Delivered',installed:'Installed'}} as Record<'es'|'en',Record<string,string>>;
const sortText={es:{custom:'Personalizado',name:'Nombre',state:'Estado',area:'Habitación',due:'Fecha límite',order:'Pedido'},en:{custom:'Custom',name:'Name',state:'Status',area:'Room',due:'Due date',order:'Order status'}};
const groupText={es:{none:'Ninguno',area:'Habitación',state:'Estado de aprobación',order:'Estado del pedido',brand:'Proveedor o marca'},en:{none:'None',area:'Room',state:'Approval status',order:'Order status',brand:'Vendor or brand'}};
const roomSortText={es:{custom:'Personalizado',name:'Nombre',updated:'Último cambio'},en:{custom:'Custom',name:'Name',updated:'Last updated'}};

export function SelectionsTrackerPro({accountId,workId,en,areas,items,stateBadge,onOpenBoard}:{accountId:string;workId:string;en:boolean;areas:SelectionArea[];items:SelectionItem[];stateBadge:(state:SelectionState,wrap?:boolean)=>React.ReactNode;onOpenBoard?:()=>void}){
 const l=en?'en':'es',t=(es:string,english:string)=>en?english:es;
 const [tracking,setTracking]=useState<SelectionTracking|null>(null);
 useEffect(()=>{let live=true;
  void (async()=>{try{const response=await fetch('/api/pro/selections-tracking?'+new URLSearchParams({workId}),{cache:'no-store',headers:{'X-Pro-Expected-Actor':accountId}});if(!response.ok)return;const body=selectionTrackingSchema.parse(await response.json());if(live)setTracking(body);}catch{/* the table still works without order data */}})();
  return()=>{live=false;};
 },[accountId,workId]);
 const costsHidden=!!(tracking as (SelectionTracking&{costsHidden?:boolean})|null)?.costsHidden;
 const [panel,setPanel]=useState<'table'|'rooms'>('table'),[view,setView]=useState<string>('planning'),[custom,setCustom]=useState<CustomView[]>([]),[choosing,setChoosing]=useState(false),[draftColumns,setDraftColumns]=useState<TrackerColumn[]>([]),[viewName,setViewName]=useState('');
 useEffect(()=>{let live=true;const timer=setTimeout(()=>{
  void (async()=>{
   try{const r=await fetch('/api/pro/selection-tracker-views',{cache:'no-store',headers:{'X-Pro-Expected-Actor':accountId}});if(!r.ok)throw Error();const body=trackerViewsSchema.parse(await r.json());if(live)setCustom(parseCustomViews(JSON.stringify(body.views)));}
   catch{/* the saved views stay empty; the built-in views keep working */}
  })();},0);return()=>{live=false;clearTimeout(timer);};},[accountId]);
 /** Views are stored on the account (server); new ones get their real id from the answer, edited ones are replaced, removed ones deleted. */
 function saveCustom(next:CustomView[]){
  const previous=custom,uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;setCustom(next);
  void (async()=>{
   const send=(body:object)=>fetch('/api/pro/selection-tracker-views',{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json','X-Pro-Expected-Actor':accountId},body:JSON.stringify(body)});
   try{
    for(const row of previous){const kept=next.find(r=>r.id===row.id);if(!kept||kept.columns.join()!==row.columns.join()||kept.name!==row.name)if(uuid.test(row.id))await send({action:'delete',id:row.id});}
    const saved=new Map<string,CustomView>();
    for(const row of next){const old=previous.find(r=>r.id===row.id);if(old&&old.columns.join()===row.columns.join()&&old.name===row.name&&uuid.test(row.id))continue;const r=await send({action:'save',name:row.name,columns:row.columns});if(r.ok){const v=trackerViewSchema.parse((await r.json()).view);saved.set(row.id,{id:v.id,name:v.name,columns:row.columns});}}
    if(saved.size){setCustom(cur=>cur.map(r=>saved.get(r.id)??r));setView(cur=>saved.get(cur)?.id??cur);}
   }catch{/* kept in memory until the next load */}
  })();
 }
 const [filters,setFilters]=useState<TrackerFilters>({query:'',state:'all',area:'all',order:'all',overdue:false}),[sort,setSort]=useState<TrackerSort>('custom'),[descending,setDescending]=useState(false),[group,setGroup]=useState<TrackerGroup>('none'),[roomSort,setRoomSort]=useState<RoomSort>('custom'),[roomQuery,setRoomQuery]=useState('');
 const active=custom.find(row=>row.id===view),viewColumns:TrackerColumn[]=(active?active.columns:trackerViewColumns[view as keyof typeof trackerViewColumns]??trackerViewColumns.planning).filter(column=>!(costsHidden&&(column==='cost'||column==='margin')));
 const columns=trackerColumns.filter(column=>viewColumns.includes(column));
 const all=useMemo(()=>buildTrackerRows(areas,items,tracking),[areas,items,tracking]);
 const rows=useMemo(()=>sortTrackerRows(filterTrackerRows(all,filters),sort,descending),[all,filters,sort,descending]);
 const groups=useMemo(()=>groupTrackerRows(rows,group),[rows,group]);
 const usedAreas=areas.filter(row=>items.some(item=>item.areaId===row.id));
 const money=(cents:number|null)=>cents===null?'—':proMoney(cents/100,en);
 const label=(column:TrackerColumn)=>trackerColumnLabels[column][l];
 const day=(value:string|null)=>value?new Intl.DateTimeFormat(en?'en-US':'es-CR',{dateStyle:'medium',timeZone:'UTC'}).format(new Date(value+'T12:00:00Z')):'—';
 const groupTitle=(key:string)=>group==='state'?stateText[l][key as SelectionState]??key:group==='order'?orderText[l][key]??key:key||t('Sin asignar','Unassigned');
 function cell(row:TrackerRow,column:TrackerColumn):React.ReactNode{switch(column){
  case 'item':return <><span className="font-semibold text-[#162543]">{row.name}</span>{row.optionName&&<span className="block text-xs text-[#52627a]">{row.optionName}</span>}</>;
  case 'link':return row.url?<a href={row.url} target="_blank" rel="noopener noreferrer nofollow" className="font-semibold text-[#008bb5] underline">{t('Ver producto','View product')}</a>:'—';
  case 'state':return stateBadge(row.state,true);case 'area':return row.area||'—';case 'brand':return row.brand||'—';
  case 'due':return <>{day(row.due)}{row.overdue&&<span data-tracker-overdue className="mt-1 block text-xs font-semibold text-[#8a2a1b]">{t('Vencido','Past due')}</span>}</>;
  case 'quantity':return row.quantity===null?'—':new Intl.NumberFormat(en?'en-US':'es-CR',{maximumFractionDigits:2}).format(row.quantity);
  case 'unit':return money(row.unitCents);case 'total':return money(row.totalCents);case 'cost':return money(row.costCents);case 'margin':return money(row.marginCents);
  case 'order':return orderText[l][row.order]??row.order;case 'orderedOn':return day(row.orderedOn||null);case 'deliveredOn':return day(row.deliveredOn||null);case 'supplierRef':return row.supplierRef||'—';case 'notes':return row.notes||'—';}}
 const numeric=(column:TrackerColumn)=>column==='quantity'||column==='unit'||column==='total'||column==='cost'||column==='margin';
 function exportCsv(){
  const text=proCsv(trackerCsvRows(rows,columns,label,state=>stateText[l][state],status=>orderText[l][status]??status));
  const url=URL.createObjectURL(new Blob([text],{type:'text/csv;charset=utf-8'})),link=document.createElement('a');link.href=url;link.download=(en?'selections-tracker':'seguimiento-selecciones')+'.csv';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
 const rooms=sortRooms(summarizeRooms(areas,items).filter(room=>!roomQuery.trim()||room.name.toLocaleLowerCase('es').includes(roomQuery.trim().toLocaleLowerCase('es'))),roomSort);
 const seg=(on:boolean)=>`min-h-11 shrink-0 whitespace-nowrap rounded-lg px-3 text-sm font-semibold ${on?'bg-white text-[#008bb5] shadow-sm':'text-[#52627a]'}`;
 return <div data-selections-tracker className="min-w-0 space-y-3">
  <div role="group" aria-label={t('Vista de selecciones','Selections view')} className="inline-flex rounded-xl bg-[#e9eff5] p-1">{(['table','rooms'] as const).map(value=><button key={value} type="button" aria-pressed={panel===value} data-tracker-panel={value} onClick={()=>setPanel(value)} className={seg(panel===value)}>{value==='table'?t('Tabla','Table'):t('Habitaciones','Rooms')}</button>)}</div>
  {panel==='rooms'?<div data-selection-rooms className="space-y-3">
   <div className="grid gap-2 sm:grid-cols-2"><label className="block text-sm font-semibold">{t('Buscar habitaciones','Search rooms')}<input type="search" value={roomQuery} onChange={event=>setRoomQuery(event.target.value)} className={field}/></label>
    <label className="block text-sm font-semibold">{t('Ordenar por','Sort by')}<select value={roomSort} onChange={event=>setRoomSort(event.target.value as RoomSort)} className={field}>{roomSorts.map(value=><option key={value} value={value}>{roomSortText[l][value]}</option>)}</select></label></div>
   {!rooms.length?<p data-room-empty className="rounded-2xl border border-dashed border-[#d7e1ea] bg-[#f7f9fc] p-5 text-center text-sm text-[#52627a]">{t('Todavía no hay habitaciones. Cree una en el tablero.','There are no rooms yet. Create one on the board.')}</p>
   :<ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{rooms.map(room=><li key={room.areaId} data-room-card={room.areaId} className="min-w-0 space-y-2 rounded-2xl border border-[#d7e1ea] bg-white p-4">
    <p className="break-words font-bold text-[#162543]">{room.name}</p>
    <dl className="grid grid-cols-3 gap-2 text-center text-xs"><div className="rounded-xl bg-[#f7f9fc] p-2"><dd data-room-pending className="text-lg font-bold">{room.pending}</dd><dt className="text-[#52627a]">{t('Pendientes','Pending')}</dt></div><div className="rounded-xl bg-[#fff4f2] p-2"><dd data-room-declined className="text-lg font-bold text-[#8a2a1b]">{room.declined}</dd><dt className="text-[#52627a]">{t('Con cambios','Changes')}</dt></div><div className="rounded-xl bg-[#eef8f4] p-2"><dd data-room-approved className="text-lg font-bold text-[#18573a]">{room.approved}</dd><dt className="text-[#52627a]">{t('Aprobados','Approved')}</dt></div></dl>
    <p className="text-sm text-[#52627a]">{t('Aprobado','Approved total')}: <span className="font-semibold text-[#162543]">{money(room.approvedCents)}</span> · {room.total} {room.total===1?t('ítem','item'):t('ítems','items')}</p>
    <div className="flex flex-wrap gap-2"><Button type="button" variant="secondary" onClick={()=>{setFilters(prev=>({...prev,area:room.areaId}));setPanel('table');}}>{t('Ver en la tabla','View in table')}</Button>{onOpenBoard&&<Button type="button" variant="secondary" onClick={onOpenBoard}>{t('Abrir tablero','Open board')}</Button>}</div>
   </li>)}</ul>}
  </div>:<>
  <div role="tablist" aria-label={t('Vistas del seguimiento','Tracker views')} className="flex max-w-full gap-1 overflow-x-auto rounded-xl bg-[#e9eff5] p-1">
   {trackerViews.map(value=><button key={value} type="button" role="tab" aria-selected={view===value} data-tracker-view={value} onClick={()=>setView(value)} className={seg(view===value)}>{trackerViewLabels[value][l]}</button>)}
   {custom.map(row=><button key={row.id} type="button" role="tab" aria-selected={view===row.id} data-tracker-view={row.id} onClick={()=>setView(row.id)} className={seg(view===row.id)}>{row.name}</button>)}
   <button type="button" data-tracker-add-view aria-label={t('Agregar vista','Add view')} onClick={()=>{setDraftColumns(columns);setViewName('');setChoosing(true);}} className={seg(false)}>+</button>
  </div>
  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4 lg:items-end">
   <label className="block text-sm font-semibold">{t('Buscar','Search')}<input type="search" data-tracker-filter="query" value={filters.query} onChange={event=>setFilters({...filters,query:event.target.value})} className={field}/></label>
   <label className="block text-sm font-semibold">{t('Estado de aprobación','Approval status')}<select data-tracker-filter="state" value={filters.state} onChange={event=>setFilters({...filters,state:event.target.value as SelectionState|'all'})} className={field}><option value="all">{t('Todos','All')}</option>{states.map(value=><option key={value} value={value}>{stateText[l][value]}</option>)}</select></label>
   <label className="block text-sm font-semibold">{t('Habitación','Room')}<select data-tracker-filter="area" value={filters.area} onChange={event=>setFilters({...filters,area:event.target.value})} className={field}><option value="all">{t('Todas','All')}</option>{usedAreas.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
   <label className="block text-sm font-semibold">{t('Estado del pedido','Order status')}<select data-tracker-filter="order" value={filters.order} onChange={event=>setFilters({...filters,order:event.target.value})} className={field}><option value="all">{t('Todos','All')}</option>{trackerOrderStatuses.map(value=><option key={value} value={value}>{orderText[l][value]}</option>)}</select></label>
   <label className="block text-sm font-semibold">{t('Ordenar por','Sort by')}<select data-tracker-sort value={sort} onChange={event=>setSort(event.target.value as TrackerSort)} className={field}>{trackerSorts.map(value=><option key={value} value={value}>{sortText[l][value]}</option>)}</select></label>
   <label className="block text-sm font-semibold">{t('Organizar por','Organize by')}<select data-tracker-group value={group} onChange={event=>setGroup(event.target.value as TrackerGroup)} className={field}>{trackerGroups.map(value=><option key={value} value={value}>{groupText[l][value]}</option>)}</select></label>
   <label className="flex min-h-11 items-center gap-2 text-sm font-semibold"><input type="checkbox" data-tracker-filter="overdue" checked={filters.overdue} onChange={event=>setFilters({...filters,overdue:event.target.checked})} className="h-5 w-5 accent-[#0089bb]"/>{t('Solo vencidos','Only overdue')}</label>
   <label className="flex min-h-11 items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={descending} onChange={event=>setDescending(event.target.checked)} className="h-5 w-5 accent-[#0089bb]"/>{t('Orden descendente','Descending order')}</label>
  </div>
  <div className="flex flex-wrap gap-2"><Button type="button" variant="secondary" data-tracker-columns onClick={()=>{setDraftColumns(columns);setViewName('');setChoosing(value=>!value);}}>{t('Columnas','Columns')}</Button><Button type="button" variant="outline" data-tracker-export disabled={!rows.length} onClick={exportCsv}>{t('Exportar CSV','Export CSV')}</Button></div>
  {choosing&&<fieldset data-tracker-chooser className="space-y-3 rounded-2xl border border-[#d7e1ea] bg-white p-4"><legend className="px-1 text-sm font-bold">{t('Columnas visibles','Visible columns')}</legend>
   {trackerColumnGroups.map(g=><div key={g.key}><p className="text-xs font-bold uppercase tracking-wide text-[#52627a]">{g[l]}</p><div className="flex flex-wrap gap-x-4">{g.columns.filter(column=>!(costsHidden&&(column==='cost'||column==='margin'))).map(column=><label key={column} className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={draftColumns.includes(column)} onChange={event=>setDraftColumns(prev=>event.target.checked?[...prev,column]:prev.filter(value=>value!==column))} className="h-5 w-5 accent-[#0089bb]"/>{label(column)}</label>)}</div></div>)}
   <label className="block text-sm font-semibold">{t('Nombre de la vista (opcional)','View name (optional)')}<input value={viewName} maxLength={40} onChange={event=>setViewName(event.target.value)} className={field}/></label>
   <p className="text-xs text-[#52627a]">{t('Las vistas propias se guardan en su cuenta.','Your own views are saved to your account.')}</p>
   <div className="flex flex-wrap gap-2"><Button type="button" disabled={!draftColumns.length||(!!viewName.trim()&&custom.length>=8)} onClick={()=>{const name=viewName.trim();if(name){const row={id:'v'+Date.now().toString(36),name,columns:draftColumns};saveCustom([...custom,row].slice(0,8));setView(row.id);}else if(active){saveCustom(custom.map(r=>r.id===active.id?{...r,columns:draftColumns}:r));}else{const row={id:'v'+Date.now().toString(36),name:t('Mi vista','My view'),columns:draftColumns};saveCustom([...custom,row].slice(0,8));setView(row.id);}setChoosing(false);}}>{t('Aplicar','Apply')}</Button><Button type="button" variant="secondary" onClick={()=>setChoosing(false)}>{t('Cancelar','Cancel')}</Button>{active&&<Button type="button" variant="secondary" onClick={()=>{saveCustom(custom.filter(r=>r.id!==active.id));setView('planning');setChoosing(false);}}>{t('Quitar esta vista','Remove this view')}</Button>}</div></fieldset>}
  {!rows.length?<p data-tracker-empty className="rounded-2xl border border-dashed border-[#d7e1ea] bg-[#f7f9fc] p-5 text-center text-sm text-[#52627a]">{items.length?t('Ningún ítem coincide con los filtros.','No item matches the filters.'):t('Su proyecto en un vistazo: cuando agregue ítems verá aquí productos, costos y estado del pedido.','Your project at a glance: once you add items you will see products, costs and order status here.')}</p>:<>
   <div className="hidden overflow-x-auto rounded-2xl border border-[#d7e1ea] md:block">
    <table className="w-full min-w-[40rem] text-left text-sm"><thead className="bg-[#f7f9fc] text-xs font-bold uppercase tracking-wide text-[#52627a]"><tr>{columns.map(column=><th key={column} className={`px-3 py-2 ${numeric(column)?'text-right':''}`}>{label(column)}</th>)}</tr></thead>
    {groups.map(g=><tbody key={g.key||'all'}>{group!=='none'&&<tr data-tracker-group={g.key}><th colSpan={columns.length} className="bg-[#eef6fb] px-3 py-2 text-left text-sm font-bold text-[#162543]">{groupTitle(g.key)} <span className="font-normal text-[#52627a]">({g.rows.length})</span></th></tr>}
     {g.rows.map(row=><tr key={row.id} data-tracker-row={row.id} className="border-t border-[#e5e7eb] align-top">{columns.map(column=><td key={column} className={`break-words px-3 py-2 ${numeric(column)?'whitespace-nowrap text-right tabular-nums':''}`}>{cell(row,column)}</td>)}</tr>)}</tbody>)}
    </table>
   </div>
   <div className="space-y-2 md:hidden">{groups.map(g=><div key={g.key||'all'} className="space-y-2">{group!=='none'&&<p data-tracker-group={g.key} className="text-sm font-bold text-[#162543]">{groupTitle(g.key)} <span className="font-normal text-[#52627a]">({g.rows.length})</span></p>}
    <ul className="space-y-2">{g.rows.map(row=><li key={row.id} data-tracker-card={row.id} className="space-y-1 rounded-xl border border-[#d7e1ea] bg-white p-3 text-sm">
     <div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0 break-words">{cell(row,'item')}</div>{columns.includes('state')&&stateBadge(row.state)}</div>
     {columns.filter(column=>column!=='item'&&column!=='state').map(column=><p key={column} className="break-words"><span className="text-[#52627a]">{label(column)}: </span>{cell(row,column)}</p>)}
    </li>)}</ul></div>)}</div>
  </>}
  </>}
 </div>;
}
