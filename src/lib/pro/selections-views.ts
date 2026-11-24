import type {SelectionArea,SelectionItem,SelectionState} from './selections';
import type {SelectionTracking} from './round10';

/**
 * Row 62: tracker views, column groups, sorting, grouping and CSV rows. Pure and client-safe: it works on data the
 * selections and tracking APIs already return, so it adds no table, route or SQL.
 */
export const trackerColumnGroups=[
 {key:'item',es:'Ítem',en:'Item',columns:['item','link','state']},
 {key:'details',es:'Detalles',en:'Details',columns:['area','brand','due']},
 {key:'financials',es:'Finanzas',en:'Financials',columns:['quantity','unit','total','cost','margin']},
 {key:'order',es:'Pedido',en:'Order tracking',columns:['order','orderedOn','deliveredOn','supplierRef']},
 {key:'notes',es:'Notas',en:'Notes',columns:['notes']},
] as const;
export type TrackerColumn=typeof trackerColumnGroups[number]['columns'][number];
export const trackerColumns:TrackerColumn[]=trackerColumnGroups.flatMap(group=>[...group.columns]);
export const trackerColumnLabels:Record<TrackerColumn,{es:string;en:string}>={
 item:{es:'Ítem',en:'Item'},link:{es:'Enlace',en:'Link'},state:{es:'Estado de aprobación',en:'Approval status'},area:{es:'Habitación',en:'Room'},brand:{es:'Proveedor o marca',en:'Vendor or brand'},due:{es:'Fecha límite',en:'Due date'},
 quantity:{es:'Cantidad',en:'Quantity'},unit:{es:'Precio unitario',en:'Unit price'},total:{es:'Precio total',en:'Total price'},cost:{es:'Costo interno',en:'Internal cost'},margin:{es:'Margen',en:'Margin'},
 order:{es:'Estado del pedido',en:'Order status'},orderedOn:{es:'Fecha del pedido',en:'Order date'},deliveredOn:{es:'Fecha de entrega',en:'Delivery date'},supplierRef:{es:'Referencia del proveedor',en:'Supplier reference'},notes:{es:'Notas',en:'Notes'},
};
export const trackerViews=['planning','financials','procurement','all'] as const;
export type TrackerView=typeof trackerViews[number];
export const trackerViewLabels:Record<TrackerView,{es:string;en:string}>={planning:{es:'Planificación',en:'Planning'},financials:{es:'Finanzas',en:'Financials'},procurement:{es:'Compras',en:'Procurement'},all:{es:'Todo',en:'All'}};
export const trackerViewColumns:Record<TrackerView,TrackerColumn[]>={
 planning:['item','area','state','due','notes'],
 financials:['item','area','quantity','unit','total','cost','margin'],
 procurement:['item','area','brand','link','order','orderedOn','deliveredOn','supplierRef'],
 all:trackerColumns,
};
export const trackerSorts=['custom','name','state','area','due','order'] as const;
export type TrackerSort=typeof trackerSorts[number];
export const trackerGroups=['none','area','state','order','brand'] as const;
export type TrackerGroup=typeof trackerGroups[number];
export const trackerOrderStatuses=['not_ordered','ordered','delivered','installed'] as const;
export const stateRank:Record<SelectionState,number>={no_options:0,draft:1,pending_client:2,changes_requested:3,approved:4,archived:5};

export type TrackerRow={
 id:string;name:string;areaId:string;area:string;state:SelectionState;due:string|null;overdue:boolean;notes:string;
 optionName:string;brand:string;url:string;quantity:number|null;unitCents:number|null;totalCents:number|null;costCents:number|null;marginCents:number|null;
 order:string;orderedOn:string;deliveredOn:string;supplierRef:string;position:number;
};
/** One row per item; price columns come from the approved option, or the recommended one while nothing is approved. */
export function buildTrackerRows(areas:readonly SelectionArea[],items:readonly SelectionItem[],tracking:SelectionTracking|null):TrackerRow[]{
 const names=new Map(areas.map(area=>[area.id,area.name])),byItem=new Map((tracking?.items??[]).map(row=>[row.itemId,row]));
 return items.map((item,index)=>{
  const option=item.options.find(row=>row.id===(item.approvedOptionId??item.recommendedOptionId))??null,track=byItem.get(item.id),cost=track?.options.find(row=>row.optionId===option?.id);
  return {id:item.id,name:item.name,areaId:item.areaId,area:names.get(item.areaId)??'',state:item.state,due:item.dueDate,overdue:item.overdue,notes:item.notes??'',
   optionName:option?.name??'',brand:option?.brand??'',url:option?.url??'',quantity:option?option.quantity:null,unitCents:option?option.unitCents:null,totalCents:option?option.totalCents:null,
   costCents:cost?.costCents??null,marginCents:cost?.marginCents??null,
   order:track?.tracking.status??'',orderedOn:track?.tracking.orderedOn??'',deliveredOn:track?.tracking.deliveredOn??'',supplierRef:track?.tracking.supplierRef??'',position:index};
 });
}
export function sortTrackerRows(rows:readonly TrackerRow[],sort:TrackerSort,descending=false):TrackerRow[]{
 const key=(row:TrackerRow):string|number=>sort==='name'?row.name.toLocaleLowerCase('es'):sort==='state'?stateRank[row.state]:sort==='area'?row.area.toLocaleLowerCase('es'):sort==='due'?(row.due??'9999-99-99'):sort==='order'?trackerOrderStatuses.indexOf(row.order as typeof trackerOrderStatuses[number]):row.position;
 const out=[...rows].sort((a,b)=>{const x=key(a),y=key(b);const c=x<y?-1:x>y?1:0;return c||a.position-b.position;});
 return descending?out.reverse():out;
}
export function groupTrackerRows(rows:readonly TrackerRow[],group:TrackerGroup):{key:string;rows:TrackerRow[]}[]{
 if(group==='none')return [{key:'',rows:[...rows]}];
 const out=new Map<string,TrackerRow[]>();
 for(const row of rows){const key=group==='area'?row.area:group==='state'?row.state:group==='order'?row.order:row.brand;out.set(key,[...(out.get(key)??[]),row]);}
 return [...out.entries()].map(([key,list])=>({key,rows:list}));
}
export type TrackerFilters={query:string;state:SelectionState|'all';area:string;order:string;overdue:boolean};
export function filterTrackerRows(rows:readonly TrackerRow[],f:TrackerFilters):TrackerRow[]{
 const q=f.query.trim().toLocaleLowerCase('es');
 return rows.filter(row=>(f.state==='all'||row.state===f.state)&&(f.area==='all'||row.areaId===f.area)&&(f.order==='all'||row.order===f.order)&&(!f.overdue||row.overdue)&&(!q||[row.name,row.area,row.brand,row.optionName,row.notes,row.supplierRef].some(text=>text.toLocaleLowerCase('es').includes(q))));
}
/** Room cards: counters by approval state and the approved total (the Houzz pending / declined / approved trio). */
export type RoomSummary={areaId:string;name:string;pending:number;declined:number;approved:number;total:number;approvedCents:number;lastUpdated:string};
export function summarizeRooms(areas:readonly SelectionArea[],items:readonly SelectionItem[]):RoomSummary[]{
 return areas.filter(area=>!area.archived).map(area=>{
  const own=items.filter(item=>item.areaId===area.id&&!item.archived);
  let approvedCents=0;for(const item of own){const option=item.options.find(row=>row.id===item.approvedOptionId);if(option)approvedCents+=option.totalCents;}
  return {areaId:area.id,name:area.name,pending:own.filter(item=>item.state==='pending_client').length,declined:own.filter(item=>item.state==='changes_requested').length,approved:own.filter(item=>item.state==='approved').length,total:own.length,approvedCents,lastUpdated:own.map(item=>item.updatedAt).sort().at(-1)??area.updatedAt};
 });
}
export const roomSorts=['custom','name','updated'] as const;
export type RoomSort=typeof roomSorts[number];
export function sortRooms(rooms:readonly RoomSummary[],sort:RoomSort):RoomSummary[]{
 if(sort==='name')return [...rooms].sort((a,b)=>a.name.localeCompare(b.name,'es'));
 if(sort==='updated')return [...rooms].sort((a,b)=>b.lastUpdated.localeCompare(a.lastUpdated));
 return [...rooms];
}
/** CSV cells for the chosen columns, in the canonical column order. Cost and margin are left out when the caller hides them. */
export function trackerCsvRows(rows:readonly TrackerRow[],columns:readonly TrackerColumn[],labels:(column:TrackerColumn)=>string,stateText:(state:SelectionState)=>string,orderText:(status:string)=>string):(string|number|null)[][]{
 const shown=trackerColumns.filter(column=>columns.includes(column)),money=(cents:number|null)=>cents===null?'':(cents/100).toFixed(2);
 const cell=(row:TrackerRow,column:TrackerColumn):string|number|null=>{switch(column){
  case 'item':return row.name;case 'link':return row.url;case 'state':return stateText(row.state);case 'area':return row.area;case 'brand':return row.brand;case 'due':return row.due??'';
  case 'quantity':return row.quantity;case 'unit':return money(row.unitCents);case 'total':return money(row.totalCents);case 'cost':return money(row.costCents);case 'margin':return money(row.marginCents);
  case 'order':return orderText(row.order);case 'orderedOn':return row.orderedOn;case 'deliveredOn':return row.deliveredOn;case 'supplierRef':return row.supplierRef;case 'notes':return row.notes;}};
 return [shown.map(labels),...rows.map(row=>shown.map(column=>cell(row,column)))];
}
export const trackerCustomViewKey='ccr-pro-selection-tracker-views';
export type CustomView={id:string;name:string;columns:TrackerColumn[]};
/** Custom views are a per-browser convenience: read defensively, keep only known columns. */
export function parseCustomViews(raw:string|null):CustomView[]{
 try{const data=JSON.parse(raw??'[]');if(!Array.isArray(data))return [];
  return data.flatMap((row):CustomView[]=>typeof row?.id==='string'&&typeof row?.name==='string'&&Array.isArray(row?.columns)?[{id:row.id.slice(0,60),name:row.name.slice(0,40),columns:row.columns.filter((c:unknown):c is TrackerColumn=>trackerColumns.includes(c as TrackerColumn))}]:[]).filter(view=>view.name&&view.columns.length).slice(0,8);
 }catch{return [];}
}
