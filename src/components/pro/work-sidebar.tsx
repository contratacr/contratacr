'use client';
import {useEffect,useState} from 'react';
import {useLocale} from 'next-intl';
import {Button} from '@/components/ui/button';
import {workSidebarSchema,type WorkSidebar as Data} from '@/lib/pro/round8';
import {WorkTimerControl} from './work-timer';

/**
 * Round 8: right column of the job page (Houzz-style): status, location, customer and
 * collaborators, upcoming meetings and key dates, tags and the person timer. Read only except the
 * timer; each link opens the section that edits it.
 */
const stageEs:Record<string,string>={pending:'Pendiente',confirmed:'Confirmado',in_progress:'En curso',completed:'Finalizado',cancelled:'Cancelado'};
const stageEn:Record<string,string>={pending:'Pending',confirmed:'Confirmed',in_progress:'In progress',completed:'Completed',cancelled:'Cancelled'};
const phaseEs:Record<string,string>={cancelled:'Cancelado',completed:'Finalizado',in_progress:'En curso',scheduled:'Agendado',contracted:'Contrato aceptado',estimate_accepted:'Cotización aceptada',contract_sent:'Contrato enviado',quoting:'En cotización',new:'Nuevo'};
const phaseEn:Record<string,string>={cancelled:'Cancelled',completed:'Completed',in_progress:'In progress',scheduled:'Scheduled',contracted:'Contract accepted',estimate_accepted:'Quote accepted',contract_sent:'Contract sent',quoting:'Quoting',new:'New'};
const roleEs:Record<string,string>={viewer:'Solo lectura',contributor:'Colaborador',subcontractor:'Subcontratista'};
const roleEn:Record<string,string>={viewer:'Read only',contributor:'Collaborator',subcontractor:'Subcontractor'};
export function WorkSidebar({workId,disabled,onOpen}:{workId:string;disabled?:boolean;onOpen:(view:'details'|'schedule'|'client'|'subs')=>void}){
 const en=useLocale()==='en',t=(es:string,english:string)=>en?english:es;
 const [data,setData]=useState<Data|null>(null),[failed,setFailed]=useState(false),[attempt,setAttempt]=useState(0),[plan,setPlan]=useState<{workId:string;start:string|null;end:string|null}|null>(null);
 // Fix 14: a job without its own dates still shows the planned period of its schedule (same reader as the header), not «Sin fechas».
 useEffect(()=>{let alive=true;const load=()=>fetch('/api/pro/work-header?'+new URLSearchParams({workId}),{cache:'no-store'}).then(r=>r.ok?r.json():null).then((body:{workId?:string;planStart?:string|null;planEnd?:string|null}|null)=>{if(alive&&body?.workId===workId)setPlan({workId,start:body.planStart??null,end:body.planEnd??null});}).catch(()=>{});void load();window.addEventListener('focus',load);window.addEventListener('ccr:pro-schedule-changed',load);return()=>{alive=false;window.removeEventListener('focus',load);window.removeEventListener('ccr:pro-schedule-changed',load);};},[workId,attempt]);
 useEffect(()=>{let alive=true;const load=()=>fetch('/api/pro/work-sidebar?'+new URLSearchParams({workId}),{cache:'no-store'}).then(r=>{if(!r.ok)throw Error();return r.json();}).then(body=>{const parsed=workSidebarSchema.parse(body);if(alive&&parsed.workId===workId){setData(parsed);setFailed(false);}}).catch(()=>{if(alive)setFailed(true);});
  load();window.addEventListener('focus',load);return()=>{alive=false;window.removeEventListener('focus',load);};},[workId,attempt]);
 const day=(value:string)=>/^\d{4}-\d{2}-\d{2}$/.test(value)?new Intl.DateTimeFormat(en?'en-US':'es-CR',{dateStyle:'medium',timeZone:'UTC'}).format(new Date(value+'T00:00:00Z')):new Intl.DateTimeFormat(en?'en-US':'es-CR',{dateStyle:'medium',timeStyle:'short',timeZone:'America/Costa_Rica'}).format(new Date(value));
 const block='space-y-2 border-b border-[#e5e7eb] pb-4 last:border-b-0 last:pb-0';const head='text-xs font-bold uppercase tracking-wide text-[#68778d]';
 const status=data?(data.status.cancelled?t('Cancelado','Cancelled'):(en?phaseEn:phaseEs)[data.status.phase??'']??(en?stageEn:stageEs)[data.status.stage??'']??data.status.stage??''):'';
 return <aside data-work-sidebar aria-label={t('Datos del trabajo','Job details')} className="space-y-4 rounded-2xl border border-[#d7e1ea] bg-white p-4">
  {!data?(failed?<div role="alert" className="space-y-2 text-sm"><p>{t('No se pudieron cargar los datos del trabajo.','Could not load the job details.')}</p><Button type="button" variant="secondary" onClick={()=>{setFailed(false);setAttempt(v=>v+1);}}>{t('Reintentar','Retry')}</Button></div>:<p role="status" className="text-sm text-[#68778d]">{t('Cargando…','Loading…')}</p>):<>
   <section className={block} data-work-sidebar-section="status"><h3 className={head}>{t('Estado','Status')}</h3>
    <p className="flex items-center gap-2 font-semibold"><span aria-hidden className={'inline-block h-2.5 w-2.5 rounded-full '+(data.status.cancelled?'bg-[#b42318]':data.status.phase==='completed'?'bg-[#1d8a52]':'bg-[#008bb5]')}/>{status}</p>
    <p data-work-sidebar-period className="text-sm text-[#52627a]">{data.status.start||data.status.end?`${data.status.start?day(data.status.start):'—'} – ${data.status.end?day(data.status.end):'—'}`:plan?.workId===workId&&plan.start&&plan.end?t(`Plan: ${day(plan.start)} – ${day(plan.end)}`,`Plan: ${day(plan.start)} – ${day(plan.end)}`):t('Sin fechas','No dates')}</p>
    {data.code&&<p className="text-sm text-[#52627a]">{t('Código: ','Code: ')}{data.code}</p>}
   </section>
   <section className={block} data-work-sidebar-section="location"><h3 className={head}>{t('Ubicación','Location')}</h3>
    {data.location.address||data.location.visit?<p className="break-words text-sm">{data.location.address??data.location.visit}</p>:<p className="text-sm text-[#68778d]">{t('Sin dirección.','No address.')}</p>}
    <Button type="button" variant="outline" className="min-h-11" disabled={disabled} onClick={()=>onOpen('details')}>{data.location.address?t('Editar detalles','Edit details'):t('Agregar dirección','Add address')}</Button>
   </section>
   <section className={block} data-work-sidebar-section="people"><h3 className={head}>{t('Cliente y colaboradores','Customer and collaborators')}</h3>
    <p className="text-sm"><span className="font-semibold">{data.customer.name??t('Sin cliente','No customer')}</span>{data.customer.name&&<span className="block text-xs text-[#52627a]">{data.customer.linked?t('Cuenta del cliente vinculada','Customer account linked'):t('Sin cuenta vinculada','No linked account')}</span>}</p>
    {data.collaborators.length?<ul className="space-y-1 text-sm">{data.collaborators.map((c,i)=><li key={i} className="flex justify-between gap-2"><span className="min-w-0 break-words">{c.name??'—'}</span><span className="shrink-0 text-xs text-[#52627a]">{(en?roleEn:roleEs)[c.role]??c.role}</span></li>)}</ul>:<p className="text-sm text-[#68778d]">{t('Sin colaboradores en este trabajo.','No collaborators on this job.')}</p>}
    <Button type="button" variant="outline" className="min-h-11" disabled={disabled} onClick={()=>onOpen('subs')}>{t('Subcontratistas','Subcontractors')}</Button>
   </section>
   <section className={block} data-work-sidebar-section="meetings"><h3 className={head}>{t('Próximas citas y fechas','Upcoming meetings and dates')}</h3>
    {data.meetings.length?<ul className="space-y-1 text-sm">{data.meetings.map(m=><li key={m.kind+m.id} data-work-sidebar-meeting={m.kind}><span className="block font-semibold break-words">{m.title??(m.kind==='appointment'?t('Cita','Meeting'):t('Fecha clave','Key date'))}</span><span className="text-xs text-[#52627a]">{day(m.at)}{m.kind==='appointment'&&m.status!=='confirmed'?' · '+t('por confirmar','to confirm'):''}</span></li>)}</ul>:<p className="text-sm text-[#68778d]">{t('Nada programado.','Nothing scheduled.')}</p>}
    <Button type="button" variant="outline" className="min-h-11" disabled={disabled} onClick={()=>onOpen('schedule')}>{t('Abrir cronograma','Open schedule')}</Button>
   </section>
   <section className={block} data-work-sidebar-section="tags"><h3 className={head}>{t('Etiquetas','Tags')}</h3>
    {data.tags.length?<ul className="flex flex-wrap gap-1.5">{data.tags.map(tag=><li key={tag} className="rounded-full bg-[#eef3f8] px-2.5 py-1 text-xs font-semibold text-[#3d5068]">{tag}</li>)}</ul>:<p className="text-sm text-[#68778d]">{t('Sin etiquetas.','No tags.')}</p>}
   </section>
  </>}
  <section className={block} data-work-sidebar-section="timer"><h3 className={head}>{t('Cronómetro','Timer')}</h3><WorkTimerControl workId={workId} disabled={disabled}/></section>
 </aside>;
}
