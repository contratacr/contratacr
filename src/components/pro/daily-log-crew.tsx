'use client';
import {useEffect,useRef,useState} from 'react';
import {useLocale} from 'next-intl';
import {Button} from '@/components/ui/button';
import {dailyLogCrewResultSchema,dailyLogCrewSchema,type DailyLogCrew} from '@/lib/pro/operations';

/**
 * Ronda F2-C (row 20): crew present in one daily log entry, chosen from the team (owner and active company
 * members), with optional hours per person. Saving also updates the entry's crew summary (people and total
 * hours) through the existing journal writer; the customer keeps seeing only that summary.
 */
type Row={key:string;name:string;on:boolean;hours:string};
const field='block min-h-11 w-24 min-w-0 rounded-xl border border-[#d7e1ea] bg-white px-3 text-base';
export function DailyLogCrewPicker({workId,logId,onSaved,onCancel}:{workId:string;logId:string;onSaved:(revision:number)=>void;onCancel:()=>void}){
 const en=useLocale()==='en',t=(es:string,english:string)=>en?english:es;
 const [data,setData]=useState<DailyLogCrew|null>(null),[rows,setRows]=useState<Row[]>([]),[failed,setFailed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),action=useRef<{key:string;id:string}|null>(null);
 async function load(){setFailed(false);try{const r=await fetch('/api/pro/daily-log-crew?'+new URLSearchParams({workId,logId}),{cache:'no-store'});if(!r.ok)throw Error();const d=dailyLogCrewSchema.parse(await r.json());setData(d);
  const saved=new Map(d.crew.map(c=>[c.personKey,c]));setRows([...d.people.map(p=>({key:p.key,name:p.name,on:saved.has(p.key),hours:saved.get(p.key)?.minutes==null?'':String(Math.round((saved.get(p.key)!.minutes as number)/6)/10)})),
   ...d.crew.filter(c=>!d.people.some(p=>p.key===c.personKey)).map(c=>({key:c.personKey,name:c.personName,on:false,hours:''}))]);}catch{setFailed(true);}}
 // eslint-disable-next-line react-hooks/exhaustive-deps
 useEffect(()=>{const timer=setTimeout(()=>void load(),0);return()=>clearTimeout(timer);},[workId,logId]);
 async function save(){
  if(!data||busy)return;const crew:{personKey:string;minutes:number|null}[]=[];for(const r of rows.filter(r=>r.on&&data.people.some(p=>p.key===r.key))){const h=r.hours.trim()===''?null:Number(r.hours.replace(',','.'));if(h!==null&&(!Number.isFinite(h)||h<0||h>24)){setError(t('Horas por persona: de 0 a 24.','Hours per person: 0 to 24.'));return;}crew.push({personKey:r.key,minutes:h===null?null:Math.round(h*60)});}
  const body={workId,logId,revision:data.revision,crew},key=JSON.stringify(body);if(action.current?.key!==key)action.current={key,id:crypto.randomUUID()};
  setBusy(true);setError('');
  try{const r=await fetch('/api/pro/daily-log-crew',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,actionId:action.current.id})});
   if(r.status===409){action.current=null;setError(t('La entrada o el equipo cambiaron. Se recargó; revise y guarde de nuevo.','The entry or the team changed. It was reloaded; review and save again.'));await load();return;}
   if(!r.ok)throw Error();onSaved(dailyLogCrewResultSchema.parse(await r.json()).revision);}
  catch{setError(t('No se pudo comprobar el guardado. Reintente: no se duplicará.','Could not confirm the save. Retry: it will not be duplicated.'));}finally{setBusy(false);}
 }
 return <div data-daily-log-crew className="min-w-0 space-y-2 rounded-xl border border-[#d7e1ea] bg-white p-3">
  <p className="font-semibold text-[#162543]">{t('Personal presente (del equipo)','Crew present (from the team)')}</p>
  <p className="text-xs text-[#52627a]">{t('Marque quién estuvo en la obra y, si quiere, sus horas. El resumen de personas y horas de la entrada se actualiza solo.','Tick who was on site and, if you want, their hours. The entry’s people and hours summary updates automatically.')}</p>
  {!data&&!failed&&<p role="status">{t('Cargando equipo…','Loading team…')}</p>}
  {failed&&<div role="alert" className="space-y-2"><p>{t('No se pudo cargar el equipo.','Could not load the team.')}</p><Button type="button" variant="secondary" onClick={()=>void load()}>{t('Reintentar','Retry')}</Button></div>}
  {data&&<ul className="min-w-0 divide-y divide-[#eef2f6]">{rows.map(r=>{const gone=!data.people.some(p=>p.key===r.key);return <li key={r.key} data-daily-log-crew-person={r.name} className="flex min-w-0 flex-wrap items-center justify-between gap-2 py-1.5">
   <label className="flex min-h-11 min-w-0 flex-1 items-center gap-2"><input type="checkbox" className="h-5 w-5" checked={r.on} disabled={busy||gone} onChange={e=>setRows(old=>old.map(x=>x.key===r.key?{...x,on:e.target.checked}:x))}/><span className="min-w-0 break-words">{r.name}{gone?' · '+t('ya no está en el equipo','no longer on the team'):''}</span></label>
   {r.on&&<label className="flex items-center gap-2 text-xs font-semibold text-[#52627a]">{t('Horas','Hours')}<input aria-label={t('Horas de ','Hours of ')+r.name} inputMode="decimal" className={field} value={r.hours} disabled={busy} onChange={e=>setRows(old=>old.map(x=>x.key===r.key?{...x,hours:e.target.value}:x))}/></label>}
  </li>;})}</ul>}
  {error&&<p role="alert" className="text-red-700">{error}</p>}
  <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={onCancel}>{t('Cancelar','Cancel')}</Button><Button type="button" data-daily-log-crew-save disabled={busy||!data} onClick={()=>void save()}>{busy?t('Guardando…','Saving…'):t('Guardar personal','Save crew')}</Button></div>
 </div>;
}
