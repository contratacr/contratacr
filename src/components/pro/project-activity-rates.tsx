'use client';

import {useCallback,useEffect,useRef,useState} from 'react';
import {useLocale} from 'next-intl';
import {Button} from '@/components/ui/button';
import {centsToInput,colonesToCents} from '@/lib/pro/allowances';
import {bpsToPercent,percentToBps} from '@/lib/pro/time-activity-defaults';
import {timeActivitySchema,type TimeActivity} from '@/lib/pro/time-tracking';
import {activityExtrasSchema} from '@/lib/pro/project-extras';
import {ExtrasConflict,readExtras,saveExtras} from './use-project-extras';
import {z} from 'zod';

/**
 * Project "Activities and Rates": per-project override of the company activity rates (cost rate, markup %, billable
 * rate, taxable, billable). Stored in pro_work_extras kind 'activity' (key = activity id). Billable rate, billable and
 * the timer cost are applied by the database when a time entry of this project is created (migration 494); markup and
 * taxable start the "Record time" form. Blank money = use the company activity value.
 */
const field='block min-h-11 w-full min-w-0 rounded-xl border border-[#d7e1ea] bg-white px-3 py-2 text-base font-normal text-[#162543]';
type Row={cost:string;rate:string;markup:string;taxable:boolean;billable:boolean;revision:number};
const rowFrom=(data:z.infer<typeof activityExtrasSchema>|null,revision:number,a:TimeActivity):Row=>data?{cost:data.costCents===null?'':centsToInput(data.costCents),rate:data.rateCents===null?'':centsToInput(data.rateCents),markup:bpsToPercent(data.markupBps),taxable:data.taxable,billable:data.billable,revision}:{cost:'',rate:'',markup:'',taxable:false,billable:a.billable,revision:0};
const same=(a:Row,b:Row)=>a.cost===b.cost&&a.rate===b.rate&&a.markup===b.markup&&a.taxable===b.taxable&&a.billable===b.billable;
const copy=(en:boolean)=>en?{
 title:'Activities and rates',intro:'Adjust the rates of the company activities for this project only. Leave a rate blank to use the company value. New time entries of this project use these values.',
 filter:'Activity',all:'All',name:'Name',cost:'Cost rate',markup:'Markup (%)',rate:'Billable rate',taxable:'Taxable',billable:'Billable',company:'Company: ',save:'Save',saving:'Saving…',saved:'Saved.',
 empty:'Start creating activities',emptyText:'Create activities to track costs, markup and billing across your projects. Add them in the Time tab.',loading:'Loading activities…',loadError:'Could not load the activities.',retry:'Retry',
 invalid:'Check the amounts (up to two decimals) and a markup between 0 and 1000.',conflict:'These rates changed in another window. Reloaded; review and save again.',failed:'Could not save. Try again.',reset:'Use company rates',
}:{
 title:'Actividades y tarifas',intro:'Ajuste las tarifas de las actividades de la empresa solo para este proyecto. Deje una tarifa en blanco para usar el valor de la empresa. Las entradas de tiempo nuevas de este proyecto usan estos valores.',
 filter:'Actividad',all:'Todas',name:'Nombre',cost:'Costo por hora',markup:'Margen (%)',rate:'Tarifa facturable',taxable:'Gravable',billable:'Facturable',company:'Empresa: ',save:'Guardar',saving:'Guardando…',saved:'Guardado.',
 empty:'Empiece a crear actividades',emptyText:'Cree actividades para controlar costos, margen y facturación en sus proyectos. Agréguelas en la pestaña Tiempo.',loading:'Cargando actividades…',loadError:'No se pudieron cargar las actividades.',retry:'Reintentar',
 invalid:'Revise los montos (hasta dos decimales) y un margen entre 0 y 1000.',conflict:'Estas tarifas cambiaron en otra ventana. Se recargaron; revise y guarde de nuevo.',failed:'No se pudo guardar. Intente de nuevo.',reset:'Usar tarifas de la empresa',
};
export function ProjectActivityRates({workId,accountId}:{workId:string;accountId:string}){
 const en=useLocale()==='en',c=copy(en),[activities,setActivities]=useState<TimeActivity[]|null>(null),[rows,setRows]=useState<Record<string,Row>>({}),[saved,setSaved]=useState<Record<string,Row>>({}),[filter,setFilter]=useState('all'),[error,setError]=useState(''),[notice,setNotice]=useState(''),[loadError,setLoadError]=useState(false),[busy,setBusy]=useState<string|null>(null),alive=useRef(true);
 const load=useCallback(async()=>{
  try{
   const today=new Date().toISOString().slice(0,10);
   const response=await fetch('/api/pro/time-tracking?'+new URLSearchParams({workId,from:today,to:today}),{cache:'no-store',headers:{'X-Pro-Expected-Actor':accountId}});if(!response.ok)throw Error();
   const list=z.array(timeActivitySchema).parse((await response.json()).activities).filter(a=>!a.archived);
   const extras=list.length?await readExtras({scope:'work',workId,kind:'activity',keys:list.map(a=>a.id).join(',')}):{items:{}};
   const next:Record<string,Row>={};for(const a of list){const row=extras.items[a.id],parsed=row?activityExtrasSchema.safeParse(row.data):null;next[a.id]=rowFrom(parsed?.success?parsed.data:null,row?.revision??0,a);}
   if(alive.current){setActivities(list);setRows(next);setSaved(next);setLoadError(false);}
  }catch{if(alive.current)setLoadError(true);}
 },[workId,accountId]);
 useEffect(()=>{alive.current=true;const timer=setTimeout(()=>void load(),0);return()=>{alive.current=false;clearTimeout(timer);};},[load]);
 async function save(a:TimeActivity,override?:Row){
  const row=override??rows[a.id];if(!row||busy)return;setError('');setNotice('');
  const cost=row.cost.trim()?colonesToCents(row.cost):null,rate=row.rate.trim()?colonesToCents(row.rate):null,markup=percentToBps(row.markup);
  if(row.cost.trim()&&cost===null||row.rate.trim()&&rate===null||markup===null){setError(c.invalid);return;}
  setBusy(a.id);
  try{
   const item=await saveExtras({scope:'work',workId,kind:'activity',key:a.id,revision:row.revision,data:{costCents:cost,rateCents:rate,markupBps:markup,taxable:row.taxable,billable:row.billable}});
   const next={...row,revision:item.revision};setRows(old=>({...old,[a.id]:next}));setSaved(old=>({...old,[a.id]:next}));setNotice(c.saved);
  }catch(caught){if(caught instanceof ExtrasConflict){setError(c.conflict);await load();}else setError(c.failed);}
  finally{setBusy(null);}
 }
 const patch=(id:string,value:Partial<Row>)=>setRows(old=>({...old,[id]:{...old[id],...value}}));
 if(loadError&&!activities)return <div role="alert" className="space-y-2 text-sm"><p>{c.loadError}</p><Button className="min-h-11" type="button" variant="secondary" onClick={()=>void load()}>{c.retry}</Button></div>;
 if(!activities)return <p role="status" className="text-sm text-[#52627a]">{c.loading}</p>;
 const shown=activities.filter(a=>filter==='all'||a.id===filter);
 return <section data-project-activity-rates className="min-w-0 space-y-3 rounded-2xl border border-[#d7e1ea] bg-white p-4">
  <div><h3 className="text-base font-semibold text-[#162543]">{c.title}</h3><p className="mt-1 text-sm text-[#52627a]">{c.intro}</p></div>
  {notice&&<p role="status" className="rounded-xl bg-[#eef8f4] px-3 py-2 text-sm text-[#18573a]">{notice}</p>}
  {error&&<p role="alert" className="rounded-xl bg-[#fdf0f0] px-3 py-2 text-sm text-[#9b2c2c]">{error}</p>}
  {activities.length===0?<div data-project-activity-empty className="rounded-xl border border-dashed border-[#d7e1ea] p-4 text-sm"><p className="font-semibold text-[#162543]">{c.empty}</p><p className="mt-1 text-[#52627a]">{c.emptyText}</p></div>:<>
   <label className="block max-w-sm text-sm font-semibold text-[#162543]">{c.filter}<select data-activity-filter value={filter} onChange={e=>setFilter(e.target.value)} className={field+' mt-1'}><option value="all">{c.all}</option>{activities.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
   <ul className="space-y-3">{shown.map(a=>{const row=rows[a.id],base=saved[a.id],dirty=!!row&&!!base&&!same(row,base);return <li key={a.id} data-activity-row={a.id} className="min-w-0 space-y-2 rounded-xl border border-[#d7e1ea] p-3">
    <p className="break-words text-sm font-semibold text-[#162543]">{a.name}<span className="ml-2 text-xs font-normal text-[#52627a]">{c.company}{(a.costCents===null?'—':centsToInput(a.costCents))+' / '+centsToInput(a.rateCents)}</span></p>
    <div className="grid min-w-0 gap-2 sm:grid-cols-2 lg:grid-cols-3">
     <label className="min-w-0 text-sm font-semibold">{c.cost}<input data-activity-field="cost" inputMode="decimal" value={row.cost} placeholder={a.costCents===null?'':centsToInput(a.costCents)} onChange={e=>patch(a.id,{cost:e.target.value})} className={field+' mt-1'}/></label>
     <label className="min-w-0 text-sm font-semibold">{c.markup}<input data-activity-field="markup" inputMode="decimal" maxLength={7} value={row.markup} onChange={e=>patch(a.id,{markup:e.target.value})} className={field+' mt-1'}/></label>
     <label className="min-w-0 text-sm font-semibold">{c.rate}<input data-activity-field="rate" inputMode="decimal" value={row.rate} placeholder={centsToInput(a.rateCents)} onChange={e=>patch(a.id,{rate:e.target.value})} className={field+' mt-1'}/></label>
    </div>
    <div className="flex flex-wrap items-center gap-4">
     <label className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold"><input type="checkbox" data-activity-field="taxable" checked={row.taxable} onChange={e=>patch(a.id,{taxable:e.target.checked})} className="h-5 w-5 accent-[#0089bb]"/>{c.taxable}</label>
     <label className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold"><input type="checkbox" data-activity-field="billable" checked={row.billable} onChange={e=>patch(a.id,{billable:e.target.checked})} className="h-5 w-5 accent-[#0089bb]"/>{c.billable}</label>
     <Button className="min-h-11" type="button" data-activity-save disabled={!dirty||busy!==null} onClick={()=>void save(a)}>{busy===a.id?c.saving:c.save}</Button>
     {row.revision>0&&<Button className="min-h-11" type="button" variant="secondary" disabled={busy!==null} onClick={()=>void save(a,{...row,cost:'',rate:'',markup:'',taxable:false,billable:a.billable})}>{c.reset}</Button>}
    </div></li>;})}</ul></>}
 </section>;
}
