'use client';

import {useEffect,useRef,useState} from 'react';
import {useLocale} from 'next-intl';
import {Button} from '@/components/ui/button';
import {ProModal as Modal} from '@/components/pro/modal';
import {businessSchema,costaRicaDate,type Client} from '@/lib/pro/business';
import {agendaWallTime} from '@/lib/pro/agenda-time';
import {closeProStep,currentProPath,navigatePro,replaceProParams} from '@/lib/pro/navigation';
import {crTodayISO} from '@/lib/time-cr';
import {CatalogSelect} from './catalog-select';

/** Houzz "Create project": a job is created through the existing agenda writer
 * (PATCH /api/pro/agenda -> saveAppointment -> pro_patch_core), never a copy. */
type Draft={client:Client|null;service:string;start:string;end:string;workId:string|null};
const empty:Draft={client:null,service:'',start:'',end:'',workId:null};
const field='mt-1 block min-h-11 w-full min-w-0 rounded-xl border border-[#d7e1ea] bg-white px-3 py-2 text-base font-normal';
const storageKey=(account:string)=>'ccr:pro:project-create:v1:'+account;
function readDraft(account:string):Draft{
 try{const raw=JSON.parse(sessionStorage.getItem(storageKey(account))||'null');if(!raw||typeof raw!=='object')return empty;
  const client=raw.client?businessSchema.shape.clients.element.safeParse(raw.client):null;
  return{client:client?.success?client.data:null,service:typeof raw.service==='string'?raw.service.slice(0,160):'',start:typeof raw.start==='string'?raw.start:'',end:typeof raw.end==='string'?raw.end:'',workId:typeof raw.workId==='string'&&/^[0-9a-f-]{36}$/.test(raw.workId)?raw.workId:null};
 }catch{return empty;}
}
function writeDraft(account:string,draft:Draft|null){try{if(draft)sessionStorage.setItem(storageKey(account),JSON.stringify(draft));else sessionStorage.removeItem(storageKey(account));}catch{/* The form still works without browser storage. */}}
function copy(en:boolean){
 return en?{
  title:'Create project',intro:'The project appears in Projects and in Appointments. You can add dates now or later.',
  customer:'Customer',newCustomer:'Create a new customer',newCustomerHint:'Your answers here are kept while you add the customer.',
  service:'Project or service name',start:'Start (optional) · Costa Rica time',end:'End (optional) · Costa Rica time',datesHint:'Leave both dates blank if the job is not scheduled yet.',
  submit:'Create project',saving:'Creating project…',cancel:'Cancel',close:'Close',retry:'Retry',
  missingCustomer:'Choose a customer.',missingService:'Enter the project or service name.',
  dates:'Enter both the start and end, with the end after the start, or leave both blank.',
  conflict:'Your Pro data changed while saving. Nothing was duplicated. Retry to create the project with the latest data.',
  invalid:'Check the customer, name and dates. The time may overlap another job.',
  uncertain:'Could not confirm whether the project was created. Retry: it will not be duplicated.',
  failed:'Could not create the project. Retry.',
 }:{
  title:'Crear proyecto',intro:'El proyecto aparece en Proyectos y en Citas. Puede poner fechas ahora o después.',
  customer:'Cliente',newCustomer:'Crear un cliente nuevo',newCustomerHint:'Lo que escribió aquí se conserva mientras agrega el cliente.',
  service:'Nombre del proyecto o servicio',start:'Inicio (opcional) · hora de Costa Rica',end:'Fin (opcional) · hora de Costa Rica',datesHint:'Deje ambas fechas vacías si el trabajo aún no está programado.',
  submit:'Crear proyecto',saving:'Creando proyecto…',cancel:'Cancelar',close:'Cerrar',retry:'Reintentar',
  missingCustomer:'Seleccione un cliente.',missingService:'Escriba el nombre del proyecto o servicio.',
  dates:'Indique el inicio y el final, con el final después del inicio, o deje ambas fechas vacías.',
  conflict:'Sus datos de Pro cambiaron mientras guardaba. No se duplicó nada. Reintente para crear el proyecto con los datos actuales.',
  invalid:'Revise el cliente, el nombre y las fechas. El horario puede coincidir con otro trabajo.',
  uncertain:'No se pudo confirmar si el proyecto se creó. Reintente: no se duplicará.',
  failed:'No se pudo crear el proyecto. Reintente.',
 };
}

export function ProjectCreateDialog({accountId}:{accountId:string}){
 const en=useLocale()==='en',c=copy(en);
 const [draft,setDraft]=useState<Draft>(()=>readDraft(accountId)),[busy,setBusy]=useState(false),[error,setError]=useState(''),[retryable,setRetryable]=useState(false);
 const lock=useRef(false),active=useRef(true),form=useRef<HTMLFormElement>(null);
 useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
 const update=(patch:Partial<Draft>)=>{if(!retryable)setError('');change(patch);};
 const change=(patch:Partial<Draft>)=>setDraft(old=>{const next={...old,...patch};writeDraft(accountId,next);return next;});
 function close(){if(busy)return;writeDraft(accountId,null);closeProStep('crearProyecto');}
 function opened(id:string){
  writeDraft(accountId,null);window.dispatchEvent(new Event('contratacr:appointments-changed'));
  // Drop the dialog step first so "Back" from the project returns to the list itself.
  replaceProParams({crearProyecto:null});
  navigatePro('pro_agenda',{cita:id,volverProyectos:currentProPath()});
 }
 async function create(){
  if(lock.current)return;setError('');setRetryable(false);
  const service=draft.service.trim();
  if(!draft.client){setError(c.missingCustomer);return;}
  if(!service){setError(c.missingService);return;}
  const start=draft.start?costaRicaDate(draft.start):'',end=draft.end?costaRicaDate(draft.end):'';
  if(!!start!==!!end||start&&(!Number.isFinite(Date.parse(start))||!Number.isFinite(Date.parse(end))||Date.parse(end)<=Date.parse(start)||agendaWallTime(start)!==draft.start||agendaWallTime(end)!==draft.end)){setError(c.dates);return;}
  // One identity per attempt: a retry after a lost answer finds the saved job instead of creating another.
  const id=draft.workId??crypto.randomUUID();if(!draft.workId)change({workId:id});
  lock.current=true;setBusy(true);
  try{
   const existing=await fetch('/api/pro/agenda?'+new URLSearchParams({id}),{cache:'no-store'});
   if(existing.ok){const body=await existing.json();if(body.userId!==accountId)throw Error('account');businessSchema.shape.work.element.parse(body.work);if(active.current)opened(id);return;}
   if(existing.status!==404)throw Error('read');
   const day=crTodayISO(),page=await fetch('/api/pro/agenda?'+new URLSearchParams({day,month:day.slice(0,7),mode:'day'}),{cache:'no-store'});
   if(!page.ok)throw Error('read');const current=await page.json();if(current.userId!==accountId||!Number.isInteger(current.revision))throw Error('account');
   const work={id,client:draft.client.name,service,stage:start?'scheduled':'new',start,end,clientId:draft.client.id,cancelled:false};
   const saved=await fetch('/api/pro/agenda',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision:current.revision,work})});
   if(!active.current)return;
   if(saved.ok){opened(id);return;}
   if(saved.status===409){setError(c.conflict);setRetryable(true);return;}
   if(saved.status===400){change({workId:null});setError(c.invalid);return;}
   // A server failure after sending may still have saved it; the retry checks first.
   setError(saved.status>=500?c.uncertain:c.failed);setRetryable(true);
  }catch{if(active.current){setError(c.uncertain);setRetryable(true);}}
  finally{lock.current=false;if(active.current)setBusy(false);}
 }
 return <Modal title={c.title} onClose={close} closeLabel={c.close} size="md" mobilePresentation="fullscreen" footer={<div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="secondary" disabled={busy} onClick={close}>{c.cancel}</Button><Button type="button" data-project-create-submit disabled={busy} onClick={()=>form.current?.requestSubmit()}>{busy?c.saving:c.submit}</Button></div>}>
  <form ref={form} data-project-create noValidate className="space-y-4" onSubmit={event=>{event.preventDefault();void create();}}>
   <p className="text-sm text-[#52627a]">{c.intro}</p>
   <div className="space-y-2">
    <CatalogSelect kind="clients" label={c.customer} name="clientId" required disabled={busy} value={draft.client?.id??''} selected={draft.client??undefined} onChange={row=>update({client:row??null})}/>
    <Button type="button" variant="secondary" disabled={busy} onClick={()=>navigatePro('pro_clients',{editar:'new'})}>{c.newCustomer}</Button>
    <p className="text-xs text-[#52627a]">{c.newCustomerHint}</p>
   </div>
   <label className="block text-[13px] font-bold">{c.service}<input name="service" required maxLength={160} disabled={busy} value={draft.service} onChange={event=>update({service:event.target.value})} className={field}/></label>
   <div className="grid gap-4 sm:grid-cols-2">
    <label className="block min-w-0 text-[13px] font-bold">{c.start}<input name="start" type="datetime-local" disabled={busy} value={draft.start} onChange={event=>update({start:event.target.value})} className={field}/></label>
    <label className="block min-w-0 text-[13px] font-bold">{c.end}<input name="end" type="datetime-local" disabled={busy} value={draft.end} onChange={event=>update({end:event.target.value})} className={field}/></label>
   </div>
   <p className="text-sm text-[#68778d]">{c.datesHint}</p>
   {error&&<div role="alert" data-project-create-error className="space-y-2 rounded-xl border border-[#f3c2c2] bg-[#fff5f5] p-3"><p className="text-sm text-red-700">{error}</p>{retryable&&<Button type="button" variant="secondary" disabled={busy} onClick={()=>void create()}>{c.retry}</Button>}</div>}
  </form>
 </Modal>;
}
