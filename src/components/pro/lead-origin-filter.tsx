'use client';
import {useEffect,useRef,useState} from 'react';
import {useLocale} from 'next-intl';
import {Button} from '@/components/ui/button';
import {leadOriginChannelDetailSchema,type LeadOriginChannel} from '@/lib/pro/lead-origins';
import {LEAD_ORIGIN_CHANGED,leadOriginApi,leadOriginChannelName,useLeadOriginChannels} from './lead-origin-editor';

/** Secondary filter: query the channel catalogue without trimming the lead page locally. */
export function LeadOriginFilter({actor,value,blocked,onChange}:{actor:string;value:string;blocked:boolean;onChange:(value:string)=>void}){
 const en=useLocale()==='en',[epoch,setEpoch]=useState(0),[open,setOpen]=useState(false),[query,setQuery]=useState(''),[selected,setSelected]=useState<{key:string;channel:LeadOriginChannel|null}>({key:'',channel:null}),sequence=useRef(0),visible=open||!!value;
 const catalog=useLeadOriginChannels(actor,'active',query,visible),items=catalog.page?.items??[],key=actor+':'+value,selectedChannel=selected.key===key?selected.channel:null;
 useEffect(()=>{const refresh=()=>setEpoch(n=>n+1);window.addEventListener(LEAD_ORIGIN_CHANGED,refresh);return()=>window.removeEventListener(LEAD_ORIGIN_CHANGED,refresh);},[]);
 useEffect(()=>{const n=++sequence.current;if(!value||value==='unspecified')return;let active=true;void(async()=>{try{const response=await fetch(leadOriginApi+'?'+new URLSearchParams({view:'channel',channelId:value}),{cache:'no-store',headers:{'X-Pro-Expected-Actor':actor}});if(!response.ok)throw Error();const result=leadOriginChannelDetailSchema.parse(await response.json());if(result.channel.id!==value)throw Error();if(active&&n===sequence.current)setSelected({key,channel:result.channel});}catch{if(active&&n===sequence.current)setSelected({key,channel:null});}})();return()=>{active=false;};},[actor,value,key,epoch]);
 if(!visible)return <Button type="button" variant="ghost" disabled={blocked} onClick={()=>setOpen(true)}>{en?'Filter by channel':'Filtrar por canal'}</Button>;
 return <div data-lead-origin-filter className="space-y-2 rounded-xl border border-[#d7e1ea] p-3">
  <label className="block text-sm font-semibold">{en?'Marketing channel':'Canal comercial'}<select aria-label={en?'Marketing channel':'Canal comercial'} value={value} disabled={blocked} onChange={event=>onChange(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-[#d7e1ea] bg-white px-3 font-normal"><option value="">{en?'All channels':'Todos los canales'}</option><option value="unspecified">{en?'Not specified':'Sin especificar'}</option>{!!value&&value!=='unspecified'&&!items.some(item=>item.id===value)&&<option value={value}>{selectedChannel?leadOriginChannelName(selectedChannel,en)+(selectedChannel.archived?' · '+(en?'Archived':'Archivado'):''):(en?'Selected channel':'Canal seleccionado')}</option>}{items.map(item=><option key={item.id} value={item.id}>{leadOriginChannelName(item,en)}</option>)}</select></label>
  <label className="block text-sm">{en?'Find a channel':'Buscar un canal'}<input aria-label={en?'Find a channel':'Buscar un canal'} maxLength={100} value={query} disabled={blocked} onChange={event=>setQuery(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-[#d7e1ea] px-3 py-2"/></label>
  {catalog.error?<p role="alert" className="text-sm">{catalog.changed?(en?'Channels changed. Refresh the list.':'Los canales cambiaron. Actualice la lista.'):(en?'Could not load channels.':'No se pudieron cargar los canales.')}<Button type="button" variant="ghost" disabled={blocked||catalog.loading} onClick={()=>void catalog.load()}>{en?'Retry':'Reintentar'}</Button></p>:catalog.loading&&!catalog.page?<p role="status" className="text-sm">{en?'Loading channels…':'Cargando canales…'}</p>:null}
  {catalog.page?.nextCursor&&<Button type="button" variant="outline" disabled={blocked||catalog.loading} onClick={()=>void catalog.load(catalog.page!.nextCursor!)}>{en?'More channels':'Más canales'}</Button>}
  <div className="flex flex-wrap gap-2">{!!value&&<Button type="button" variant="ghost" disabled={blocked} onClick={()=>onChange('')}>{en?'Clear channel filter':'Quitar filtro de canal'}</Button>}{!value&&<Button type="button" variant="ghost" disabled={blocked} onClick={()=>setOpen(false)}>{en?'Close filter':'Cerrar filtro'}</Button>}</div>
 </div>;
}
