'use client';

import {useEffect,useState} from 'react';
import {useLocale} from 'next-intl';
import {z} from 'zod';
import {useAuth} from '@/hooks/use-auth';
import {Button} from '@/components/ui/button';
import {pushProParams} from '@/lib/pro/navigation';
import {deliveryContentSchema,type DeliveryContent} from '@/lib/pro/work-delivery';

const summarySchema=z.object({side:z.literal('provider'),workId:z.string().min(1).max(160),draft:deliveryContentSchema});
type Checklist=DeliveryContent['checklist'];

/** Read the existing private report checklist; never create a second task store. */
export function JobChecklistSummary({workId,blocked=false,hideEmpty=false}:{workId:string;blocked?:boolean;hideEmpty?:boolean}){
 const {user,loading}=useAuth();
 if(loading||!user)return null;
 return <ChecklistSession key={user.id+':'+workId} accountId={user.id} workId={workId} blocked={blocked} hideEmpty={hideEmpty}/>;
}
function ChecklistSession({accountId,workId,blocked,hideEmpty}:{accountId:string;workId:string;blocked:boolean;hideEmpty:boolean}){
 const en=useLocale()==='en';
 const [state,setState]=useState<{status:'loading'}|{status:'error'}|{status:'ready';checklist:Checklist}>({status:'loading'});
 const [attempt,setAttempt]=useState(0);
 useEffect(()=>{
  const controller=new AbortController();let alive=true;
  const timer=setTimeout(()=>{
   setState({status:'loading'});
   void (async()=>{
    try{
     const response=await fetch('/api/pro/work-delivery?'+new URLSearchParams({workId}),{cache:'no-store',headers:{'X-Pro-Expected-Actor':accountId},signal:controller.signal});
     if(!response.ok)throw Error('Checklist unavailable');
     const result=summarySchema.parse(await response.json());
     if(result.workId!==workId)throw Error('Checklist context changed');
     if(alive)setState({status:'ready',checklist:result.draft.checklist});
    }catch{if(alive)setState({status:'error'});}
   })();
  },0);
  return()=>{alive=false;clearTimeout(timer);controller.abort();};
 },[accountId,workId,attempt]);
 const list=state.status==='ready'?state.checklist:null,completed=list?.filter(item=>item.done).length??0,pending=list?.filter(item=>!item.done)??[];
 if(hideEmpty&&state.status==='ready'&&!state.checklist.length)return null;
 return <section data-job-checklist-summary className="space-y-3 rounded-xl border border-[#d7e1ea] bg-white p-4">
  <h3 className="font-semibold">{en?'Report checklist':'Lista de la constancia'}</h3>
  {state.status==='loading'&&<p role="status" className="text-sm text-[#52627a]">{en?'Loading work checklist…':'Cargando lista de trabajo…'}</p>}
  {state.status==='error'&&<><p role="alert" className="text-sm text-[#52627a]">{en?'Could not load the work checklist.':'No se pudo cargar la lista de trabajo.'}</p><Button type="button" variant="secondary" disabled={blocked} onClick={()=>setAttempt(value=>value+1)}>{en?'Retry':'Reintentar'}</Button></>}
  {list&&<>
   {list.length?<><p className="text-sm font-semibold text-[#52627a]">{completed}/{list.length} {en?'completed':(list.length===1?'completada':'completadas')}</p><div role="progressbar" aria-label={en?'Work checklist progress':'Avance de la lista de trabajo'} aria-valuemin={0} aria-valuemax={list.length} aria-valuenow={completed} className="h-2 overflow-hidden rounded-full bg-[#e9eff5]"><div className="h-full rounded-full bg-[#00a1ce]" style={{width:`${completed/list.length*100}%`}}/></div>{pending.length?<ul className="space-y-2 text-sm text-[#52627a]">{pending.slice(0,3).map((item,index)=><li key={index} className="break-words">{item.label}</li>)}</ul>:<p className="text-sm text-[#52627a]">{en?'All items are complete.':'Todas las tareas están completas.'}</p>}</>:<p className="text-sm text-[#52627a]">{en?'No checklist yet. You can prepare it before the visit.':'Todavía no hay una lista. Puede prepararla antes de la visita.'}</p>}
   <Button type="button" variant="secondary" disabled={blocked} onClick={()=>pushProParams({vistaTrabajo:'delivery'})}>{en?'View checklist and report':'Ver lista y constancia'}</Button>
  </>}
 </section>;
}
