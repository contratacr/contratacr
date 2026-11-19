'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {useLocale} from 'next-intl';
import {useAuth} from '@/hooks/use-auth';
import {Button} from '@/components/ui/button';
const api='/api/pro/appointment-reminders';
type State={enabled:boolean;revision:number;available:boolean};
type Attempt={enabled:boolean;expectedRevision:number;actionId:string};
function stateOf(value:unknown):State{
 const s=value as State;
 if(!s||typeof s.enabled!=='boolean'||typeof s.available!=='boolean'||!Number.isSafeInteger(s.revision)||s.revision<0)throw Error();
 return {enabled:s.enabled,revision:s.revision,available:s.available};
}
function attemptOf(value:unknown):Attempt{
 const a=value as Attempt;
 if(!a||typeof a.enabled!=='boolean'||!Number.isSafeInteger(a.expectedRevision)||a.expectedRevision<0||typeof a.actionId!=='string'||! /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(a.actionId))throw Error();
 return {enabled:a.enabled,expectedRevision:a.expectedRevision,actionId:a.actionId};
}
export function AppointmentReminderPreference(){
 const {user}=useAuth();
 return user?<PersonalReminder key={user.id} accountId={user.id}/>:null;
}
function PersonalReminder({accountId}:{accountId:string}){
 const en=useLocale()==='en',t=useCallback((es:string,english:string)=>en?english:es,[en]);
 const [state,setState]=useState<State|null>(null),[busy,setBusy]=useState(false),[uncertain,setUncertain]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[storageBlocked,setStorageBlocked]=useState(false);
 const pending=useRef<Attempt|null>(null),lock=useRef(false),alive=useRef(true),loadSequence=useRef(0);
 const key='contratacr:appointment-reminder:'+accountId;
 const load=useCallback(async()=>{
  if(lock.current)return;const sequence=++loadSequence.current;setBusy(true);setError('');setState(null);setStorageBlocked(false);
  try{
   pending.current=null;setUncertain(false);
   let raw:string|null;
   try{raw=sessionStorage.getItem(key);}catch{setStorageBlocked(true);throw Error('storage');}
   try{pending.current=raw?attemptOf(JSON.parse(raw)):null;}catch{throw Error('receipt');}
   setUncertain(!!pending.current);
   const response=await fetch(api,{cache:'no-store'});
   if(!response.ok)throw Error();
   const next=stateOf(await response.json());if(alive.current&&sequence===loadSequence.current)setState(next);
  }catch(error){if(alive.current&&sequence===loadSequence.current)setError(error instanceof Error&&error.message==='storage'?t('No se puede conservar un intento seguro en este navegador. No se enviaron cambios.','This browser cannot keep a safe retry record. No changes were sent.'):error instanceof Error&&error.message==='receipt'?t('No se pudo leer el cambio pendiente. No se enviaron cambios; el registro se conserva.','The pending change could not be read. No changes were sent; the record is preserved.'):t('No se pudieron cargar los recordatorios. Intente nuevamente.','Could not load reminders. Please retry.'));}
  finally{if(alive.current&&sequence===loadSequence.current)setBusy(false);}
 },[key,t]);
 const invalidateLoad=useCallback(()=>{loadSequence.current++;},[]);
 useEffect(()=>{alive.current=true;const timer=setTimeout(()=>void load(),0);return()=>{alive.current=false;invalidateLoad();clearTimeout(timer);};},[load,invalidateLoad]);
 async function save(){
  if(lock.current||storageBlocked||!pending.current&&(!state||!state.available&&!state.enabled))return;
  lock.current=true;setBusy(true);setError('');setNotice('');
  const recovering=!!pending.current;
  let attempt=pending.current;
  try{
   if(!attempt){
    attempt={enabled:!state!.enabled,expectedRevision:state!.revision,actionId:crypto.randomUUID()};
    // Persist before sending so closing or reloading cannot turn a lost reply into a second toggle.
    try{sessionStorage.setItem(key,JSON.stringify(attempt));}catch{setStorageBlocked(true);throw Error('storage');}
    pending.current=attempt;
   }
   setUncertain(true);
   const response=await fetch(api,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(attempt)});
   if(!response.ok){
    if(!recovering&&(response.status===400||response.status===409)){sessionStorage.removeItem(key);pending.current=null;if(alive.current){setUncertain(false);setState(null);}}
    throw Error();
   }
   const next=stateOf(await response.json());
   sessionStorage.removeItem(key);pending.current=null;
   if(alive.current){setState(next);setUncertain(false);setNotice(next.enabled?t('Recordatorios activados.','Reminders enabled.'):t('Recordatorios desactivados.','Reminders disabled.'));}
  }catch(error){if(alive.current)setError(error instanceof Error&&error.message==='storage'?t('No se puede conservar un intento seguro en este navegador. No se enviaron cambios.','This browser cannot keep a safe retry record. No changes were sent.'):pending.current?t('No se pudo comprobar el guardado. Reintente para verificarlo.','Could not confirm the save. Retry to check it.'):t('No se guardó el cambio. Actualice los datos e intente nuevamente.','The change was not saved. Refresh the details and try again.'));}
  finally{lock.current=false;if(alive.current)setBusy(false);}
 }
 return <details data-appointment-reminder-preference className="mt-5 rounded-2xl border border-[#d7e1ea] p-4">
  <summary className="min-h-11 cursor-pointer font-semibold">{t('Recordatorios','Reminders')}</summary>
  {!state&&!error&&<p role="status">{t('Cargando…','Loading…')}</p>}
  {state&&!state.available&&!state.enabled?<p className="text-sm text-[#52627a]">{t('Los recordatorios todavía no están disponibles para esta cuenta.','Reminders are not yet available for this account.')}</p>:state&&<>
   <div className="flex items-center justify-between gap-3"><span className="text-sm font-semibold">{t('Recordarme mis citas','Remind me about my appointments')}</span><button type="button" role="switch" aria-label={t('Recordarme mis citas','Remind me about my appointments')} aria-checked={state.enabled} disabled={busy||uncertain||storageBlocked} onClick={()=>void save()} className="inline-flex min-h-11 min-w-16 shrink-0 items-center justify-center rounded-full border border-[#d7e1ea] px-3 text-sm font-semibold disabled:opacity-50">{state.enabled?t('Sí','On'):t('No','Off')}</button></div>
   <p className="mt-1 text-sm text-[#52627a]">{state.available?t('Aviso dentro de ContrataCR, 24 horas antes.','In-app reminder 24 hours before.'):t('Los recordatorios no están disponibles ahora. Puede desactivar su preferencia.','Reminders are currently unavailable. You can turn off your preference.')}</p>
  </>}
  {notice&&<p role="status" className="mt-2 text-sm">{notice}</p>}
  {(error||uncertain)&&<div role="alert" className="mt-2 text-sm"><p>{error||t('Hay un cambio pendiente de comprobar.','A pending change needs to be checked.')}</p><Button type="button" variant="secondary" disabled={busy} onClick={()=>void (pending.current?save():load())}>{uncertain?t('Comprobar guardado','Check saved result'):t('Actualizar','Refresh')}</Button></div>}
 </details>;
}
