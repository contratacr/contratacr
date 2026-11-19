'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {useTranslations} from 'next-intl';
import {Button} from '@/components/ui/button';
const api='/api/pro/appointment-preferences';
type State={enabled:boolean;revision:number};
export function AppointmentPreferences(){
 const t=useTranslations('AppointmentAvailability');
 const [state,setState]=useState<State|null>(null),[saving,setSaving]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[uncertain,setUncertain]=useState(false);
 const lock=useRef(false),pending=useRef<(State&{actionId:string})|null>(null);
 const load=useCallback(async(signal?:AbortSignal)=>{try{const r=await fetch(api,{cache:'no-store',signal}),body=await r.json();if(!r.ok||typeof body.enabled!=='boolean'||!Number.isInteger(body.revision))throw Error();if(!signal?.aborted){setState(body);setError('');}}catch{if(!signal?.aborted)setError(t('loadError'));}},[t]);
 useEffect(()=>{const controller=new AbortController();const timer=setTimeout(()=>void load(controller.signal),0);return()=>{clearTimeout(timer);controller.abort();};},[load]);
 async function save(){if(lock.current||!state)return;lock.current=true;setSaving(true);setError('');setNotice('');const input=pending.current??{...state,enabled:!state.enabled,actionId:crypto.randomUUID()};pending.current=input;
 try{const r=await fetch(api,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)}),body=await r.json();if(!r.ok){if(r.status<500){pending.current=null;setUncertain(false);}throw Error();}if(typeof body.enabled!=='boolean'||!Number.isInteger(body.revision))throw Error();pending.current=null;setUncertain(false);setState(body);setNotice(body.enabled?t('enabledNotice'):t('pausedNotice'));}
 catch{setUncertain(!!pending.current);setError(pending.current?t('uncertain'):t('saveError'));}finally{lock.current=false;setSaving(false);}}
 return <div data-appointment-preferences className="mb-3 border-b border-[#e5e7eb] pb-3">
  <div className="flex items-center justify-between gap-3"><span className="text-sm font-semibold">{t('label')}</span><button type="button" role="switch" aria-label={t('label')} aria-checked={state?.enabled??false} disabled={!state||saving||uncertain} onClick={()=>void save()} className="inline-flex min-h-11 min-w-16 shrink-0 items-center justify-center rounded-full border border-[#d7e1ea] px-3 text-sm font-semibold disabled:opacity-50">{state?.enabled?t('on'):t('off')}</button></div>
  <p className="mt-1 text-sm text-[#68778d]">{t('hint')}</p>
  {notice&&<p role="status" className="mt-2 text-sm">{notice}</p>}{error&&<div role="alert" className="mt-2 text-sm"><p>{error}</p><Button type="button" variant="secondary" disabled={saving} onClick={()=>{if(pending.current)void save();else void load();}}>{uncertain?t('retry'):t('refresh')}</Button></div>}
 </div>;
}
