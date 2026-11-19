'use client';

import {useCallback,useEffect,useRef,useState} from 'react';
import {useLocale} from 'next-intl';
import {Activity,CalendarCheck,CheckCircle2,FileText,FileX2,FolderUp,ListChecks,Mail,MessageSquareWarning,NotebookPen,Receipt,RefreshCw,Share2,Undo2,UserCheck,Wallet,XCircle,type LucideIcon} from 'lucide-react';
import {useAuth} from '@/hooks/use-auth';
import {Button} from '@/components/ui/button';
import {pushProParams} from '@/lib/pro/navigation';
import {proMoney} from '@/lib/pro/money';
import {workActivityPageSchema,type WorkActivityItem,type WorkActivityKind,type WorkActivityPage} from '@/lib/pro/work-activity';

const api='/api/pro/work-activity';
const when=(value:string,en:boolean)=>new Intl.DateTimeFormat(en?'en-US':'es-CR',{dateStyle:'medium',timeStyle:'short',timeZone:'America/Costa_Rica'}).format(new Date(value));
// Final round: the app's standard Pro money formatter (₡ in ES and EN); a signed amount keeps its sign glued to it.
const money=(cents:number,en:boolean,signed=false)=>((signed&&cents>0?'+':'')+proMoney(cents/100,en)).replace(/^([+\-\u2212])/u,'$1\u2060');

/** Label (ES with «usted» register / EN) and icon of each event kind. */
const kinds:Record<WorkActivityKind,{es:string;en:string;icon:LucideIcon;tone:string}>={
 quote_publish:{es:'Cotización compartida',en:'Quote shared',icon:Share2,tone:'text-[#008bb5]'},
 quote_claim:{es:'El cliente abrió la cotización',en:'Customer opened the quote',icon:Mail,tone:'text-[#008bb5]'},
 quote_accept:{es:'Cotización aceptada',en:'Quote accepted',icon:CheckCircle2,tone:'text-[#1f7a4d]'},
 quote_decline:{es:'Cotización rechazada',en:'Quote declined',icon:XCircle,tone:'text-[#b42318]'},
 quote_request_changes:{es:'El cliente pidió cambios a la cotización',en:'Customer requested quote changes',icon:MessageSquareWarning,tone:'text-[#a15c07]'},
 quote_respond_changes:{es:'Respuesta a los cambios pedidos',en:'Reply to requested changes',icon:MessageSquareWarning,tone:'text-[#52627a]'},
 quote_withdraw:{es:'Cotización retirada',en:'Quote withdrawn',icon:Undo2,tone:'text-[#52627a]'},
 change_propose:{es:'Cambio propuesto',en:'Change order proposed',icon:FileText,tone:'text-[#008bb5]'},
 change_accept:{es:'Cambio aceptado por el cliente',en:'Change order accepted by the customer',icon:CheckCircle2,tone:'text-[#1f7a4d]'},
 change_record_acceptance:{es:'Aprobación del cambio registrada',en:'Change order approval recorded',icon:CheckCircle2,tone:'text-[#1f7a4d]'},
 change_decline:{es:'Cambio rechazado',en:'Change order declined',icon:XCircle,tone:'text-[#b42318]'},
 change_withdraw:{es:'Cambio retirado',en:'Change order withdrawn',icon:Undo2,tone:'text-[#52627a]'},
 payment_recorded:{es:'Pago registrado',en:'Payment recorded',icon:Wallet,tone:'text-[#1f7a4d]'},
 payment_voided:{es:'Pago anulado',en:'Payment voided',icon:Undo2,tone:'text-[#b42318]'},
 invoice_prepared:{es:'Borrador de factura creado',en:'Invoice draft created',icon:Receipt,tone:'text-[#008bb5]'},
 invoice_payment_applied:{es:'Pago aplicado a la factura',en:'Payment applied to invoice',icon:Wallet,tone:'text-[#1f7a4d]'},
 invoice_payment_voided:{es:'Pago de factura revertido',en:'Invoice payment reversed',icon:Undo2,tone:'text-[#b42318]'},
 einvoice_signed:{es:'Factura electrónica firmada',en:'Electronic invoice signed',icon:Receipt,tone:'text-[#008bb5]'},
 einvoice_sent:{es:'Factura electrónica enviada a Hacienda',en:'Electronic invoice sent to Hacienda',icon:Receipt,tone:'text-[#008bb5]'},
 einvoice_accepted:{es:'Factura electrónica aceptada',en:'Electronic invoice accepted',icon:CheckCircle2,tone:'text-[#1f7a4d]'},
 einvoice_rejected:{es:'Factura electrónica rechazada',en:'Electronic invoice rejected',icon:XCircle,tone:'text-[#b42318]'},
 file_added:{es:'Archivo agregado',en:'File added',icon:FolderUp,tone:'text-[#008bb5]'},
 file_shared:{es:'Archivo compartido con el cliente',en:'File shared with the customer',icon:Share2,tone:'text-[#008bb5]'},
 file_trashed:{es:'Archivo enviado a la papelera',en:'File moved to trash',icon:FileX2,tone:'text-[#b42318]'},
 file_restored:{es:'Archivo restaurado',en:'File restored',icon:RefreshCw,tone:'text-[#52627a]'},
 task_created:{es:'Tarea creada',en:'Task created',icon:ListChecks,tone:'text-[#008bb5]'},
 task_completed:{es:'Tarea completada',en:'Task completed',icon:CheckCircle2,tone:'text-[#1f7a4d]'},
 task_reopened:{es:'Tarea reabierta',en:'Task reopened',icon:RefreshCw,tone:'text-[#a15c07]'},
 task_archived:{es:'Tarea archivada',en:'Task archived',icon:FileX2,tone:'text-[#52627a]'},
 daily_log_published:{es:'Bitácora publicada',en:'Daily log published',icon:NotebookPen,tone:'text-[#008bb5]'},
 update_published:{es:'Avance compartido',en:'Job update shared',icon:CalendarCheck,tone:'text-[#008bb5]'},
 client_invited:{es:'Cliente invitado al proyecto',en:'Customer invited to the project',icon:Mail,tone:'text-[#008bb5]'},
 client_invitation_accepted:{es:'El cliente aceptó la invitación',en:'Customer accepted the invitation',icon:UserCheck,tone:'text-[#1f7a4d]'},
};
const sectionLabel:Record<WorkActivityItem['section'],{es:string;en:string}>={estimates:{es:'Ver cotizaciones',en:'View quotes'},changes:{es:'Ver cambios',en:'View changes'},costs:{es:'Ver costos y pagos',en:'View costs & payments'},files:{es:'Ver archivos',en:'View files'},tasks:{es:'Ver tareas',en:'View tasks'},updates:{es:'Ver bitácora',en:'View daily log'},client:{es:'Ver vista del cliente',en:'View customer view'}};
const roleLabel={owner:{es:'Empresa',en:'Company'},team:{es:'Equipo',en:'Team'},client:{es:'Cliente',en:'Customer'}};

function useActivity(accountId:string,workId:string,limit:5|20){
 const [state,setState]=useState<{page:WorkActivityPage|null;loading:boolean;error:boolean}>({page:null,loading:true,error:false}),sequence=useRef(0),active=useRef(true),attempt=useRef<{before:string;beforeId:string}|null>(null);
 const load=useCallback(async(cursor?:{before:string;beforeId:string}|null)=>{
  const id=++sequence.current;attempt.current=cursor??null;setState(old=>({...old,loading:true,error:false}));
  try{
   const response=await fetch(api+'?'+new URLSearchParams({workId,...cursor?{before:cursor.before,beforeId:cursor.beforeId}:{},...limit===5?{limit:'5'}:{}}),{cache:'no-store',headers:{'X-Pro-Expected-Actor':accountId}});
   if(!response.ok)throw Error();const body=workActivityPageSchema.parse(await response.json());if(body.workId!==workId)throw Error();
   if(active.current&&id===sequence.current)setState(old=>({page:cursor&&old.page?{...body,items:[...old.page.items,...body.items.filter(item=>!old.page!.items.some(prior=>prior.id===item.id))]}:body,loading:false,error:false}));
  }catch{if(active.current&&id===sequence.current)setState(old=>({...old,loading:false,error:true}));}
 },[accountId,workId,limit]);
 const invalidate=useCallback(()=>{sequence.current++;},[]);
 useEffect(()=>{active.current=true;const timer=setTimeout(()=>void load(),0);return()=>{active.current=false;invalidate();clearTimeout(timer);};},[load,invalidate]);
 const retry=useCallback(()=>load(attempt.current),[load]);
 return {...state,load,retry};
}

function Entry({item,en,blocked}:{item:WorkActivityItem;en:boolean;blocked:boolean}){
 const k=kinds[item.kind],Icon=k.icon,t=(v:{es:string;en:string})=>en?v.en:v.es;
 const details=[item.data.title,item.data.version!=null?(en?'Version ':'Versión ')+item.data.version:null,item.data.number?(en?'No. ':'N.º ')+item.data.number:null,item.data.amountCents!=null?money(item.data.amountCents,en,item.kind.startsWith('change_')):null].filter(Boolean).join(' · ');
 return <li data-work-activity-item={item.kind} data-work-activity-id={item.id} className="flex gap-3 py-3">
  <span aria-hidden className={'mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-[#eef3f8] '+k.tone}><Icon className="size-4"/></span>
  <div className="min-w-0 flex-1 space-y-0.5">
   <p className="break-words text-sm font-semibold text-[#162543]">{t(k)}</p>
   {details&&<p data-work-activity-detail className="break-words text-sm text-[#33445c]">{details}</p>}
   <p className="text-xs text-[#52627a]"><time dateTime={item.at}>{when(item.at,en)}</time>{item.actorName&&<> · <span data-work-activity-actor>{item.actorName}</span> <span className="text-[#7a879a]">({t(roleLabel[item.actorRole])})</span></>}</p>
  </div>
  <button type="button" data-work-activity-link={item.section} disabled={blocked} onClick={()=>pushProParams({vistaTrabajo:item.section})} aria-label={t(sectionLabel[item.section])+': '+t(k)} className="min-h-11 shrink-0 self-center rounded-lg px-2 text-sm font-semibold text-[#008bb5] hover:underline disabled:opacity-50"><span className="hidden sm:inline">{t(sectionLabel[item.section])}</span><span aria-hidden className="sm:hidden">›</span></button>
 </li>;
}

/** Full «Actividad» section of a job: newest first, «Cargar más» (keyset pages of 20). */
export function WorkActivity({workId,blocked=false}:{workId:string;blocked?:boolean}){const {user,loading}=useAuth();if(loading||!user)return <p role="status" className="text-sm text-[#52627a]">…</p>;return <ActivitySession key={user.id+':'+workId} accountId={user.id} workId={workId} blocked={blocked}/>;}
function ActivitySession({accountId,workId,blocked}:{accountId:string;workId:string;blocked:boolean}){
 const en=useLocale()==='en',remote=useActivity(accountId,workId,20),items=remote.page?.items??[];
 return <section data-work-activity className="space-y-4 rounded-2xl border border-[#d7e1ea] bg-white p-4 sm:p-5">
  <header className="flex flex-wrap items-center justify-between gap-2">
   <div><h2 className="flex items-center gap-2 text-lg font-bold text-[#162543]"><Activity aria-hidden className="size-5 text-[#008bb5]"/>{en?'Activity':'Actividad'}</h2><p className="text-sm text-[#52627a]">{en?'Key events of this job, newest first. Taken from the records of each section; nothing here can be edited.':'Hechos clave de este trabajo, del más reciente al más antiguo. Se toman de los registros de cada sección; aquí no se puede editar nada.'}</p></div>
   <Button type="button" variant="secondary" disabled={blocked||remote.loading} onClick={()=>void remote.load()}>{en?'Refresh':'Actualizar'}</Button>
  </header>
  {remote.error&&<div role="alert" data-work-activity-error className="space-y-2 rounded-xl bg-[#fdf1f0] p-3"><p className="text-sm text-[#7a1d14]">{en?'Could not load the activity. Please try again.':'No se pudo cargar la actividad. Intente de nuevo.'}</p><Button type="button" variant="secondary" disabled={blocked||remote.loading} onClick={()=>void remote.retry()}>{en?'Retry':'Reintentar'}</Button></div>}
  {!remote.page&&remote.loading&&<p role="status" data-work-activity-loading className="text-sm text-[#52627a]">{en?'Loading activity…':'Cargando actividad…'}</p>}
  {remote.page&&items.length===0&&<p data-work-activity-empty className="rounded-xl bg-[#f5f8fb] p-4 text-sm text-[#52627a]">{en?'No activity yet. Quotes, changes, payments, files, tasks and daily logs of this job will appear here.':'Todavía no hay actividad. Aquí aparecerán las cotizaciones, cambios, pagos, archivos, tareas y bitácoras de este trabajo.'}</p>}
  {items.length>0&&<ol data-work-activity-list aria-label={en?'Job activity':'Actividad del trabajo'} className="divide-y divide-[#e6edf3]">{items.map(item=><Entry key={item.id} item={item} en={en} blocked={blocked}/>)}</ol>}
  {remote.page?.nextCursor&&<div className="flex justify-center"><Button type="button" variant="secondary" data-work-activity-more disabled={blocked||remote.loading} onClick={()=>void remote.load(remote.page!.nextCursor)}>{remote.loading?(en?'Loading…':'Cargando…'):(en?'Load more':'Cargar más')}</Button></div>}
 </section>;
}

/** Compact «Actividad reciente» card of the job summary (last 5). Hidden while there is nothing to show. */
export function WorkActivitySummary({workId,blocked=false}:{workId:string;blocked?:boolean}){const {user,loading}=useAuth();if(loading||!user)return null;return <SummarySession key={user.id+':'+workId} accountId={user.id} workId={workId} blocked={blocked}/>;}
function SummarySession({accountId,workId,blocked}:{accountId:string;workId:string;blocked:boolean}){
 const en=useLocale()==='en',remote=useActivity(accountId,workId,5);
 if(!remote.error&&!remote.page?.items.length)return null;
 return <section data-work-activity-summary className="space-y-2 rounded-xl border border-[#d7e1ea] bg-white p-4">
  <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">{en?'Recent activity':'Actividad reciente'}</h3><button type="button" disabled={blocked} onClick={()=>pushProParams({vistaTrabajo:'activity'})} className="min-h-11 rounded-lg px-2 text-sm font-semibold text-[#008bb5] hover:underline disabled:opacity-50">{en?'View all activity':'Ver toda la actividad'}</button></div>
  {remote.error?<div role="alert" className="space-y-2"><p className="text-sm">{en?'Could not load the activity.':'No se pudo cargar la actividad.'}</p><Button type="button" variant="secondary" disabled={blocked||remote.loading} onClick={()=>void remote.load()}>{en?'Retry':'Reintentar'}</Button></div>
  :<ol className="divide-y divide-[#e6edf3]">{remote.page!.items.slice(0,5).map(item=><Entry key={item.id} item={item} en={en} blocked={blocked}/>)}</ol>}
 </section>;
}
