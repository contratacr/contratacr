'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {useLocale} from 'next-intl';
import {Bell} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {navigatePro,openProSection} from '@/lib/pro/navigation';
import {proMoney} from '@/lib/pro/money';
import {proCount} from '@/lib/pro/plural';
import {notificationEvents,notificationPageSchema,type NotificationEvent,type NotificationItem,type NotificationSettings} from '@/lib/pro/round9';

/**
 * Round 9: in-app notification center (Avisos) per person, with preferences per event type, a
 * reminder schedule and an email channel that only stores mock drafts (never sent).
 */
export const PRO_NOTIFICATIONS_CHANGED='ccr:pro-notifications-changed';
const eventLabels:Record<NotificationEvent,[string,string]>={task_assigned:['Tarea asignada','Task assigned'],task_due:['Tarea por vencer o vencida','Task due soon or overdue'],client_message:['Mensaje del cliente','Customer message'],quote_accepted:['Cotización aceptada','Quote accepted'],quote_changes:['Cambios pedidos a una cotización','Quote changes requested'],invoice_paid:['Pago registrado en una factura','Invoice payment recorded'],invoice_overdue:['Cuota vencida','Installment overdue'],bid_received:['Oferta de proveedor recibida','Vendor bid received'],daily_log_missing:['Falta la bitácora de ayer','Yesterday’s daily log is missing'],payment_plan_due:['Cuota del plan de pagos por vencer','Payment plan installment due soon']};
async function send(body:object){const r=await fetch('/api/pro/notifications',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await r.json().catch(()=>({}));if(!r.ok)throw Object.assign(Error(data.error||'error'),{status:r.status});window.dispatchEvent(new Event(PRO_NOTIFICATIONS_CHANGED));return data;}
function openLink(item:NotificationItem,en:boolean){
 const link=item.link,tab=typeof link.tab==='string'?link.tab:'pro_tools',extra:Record<string,string>={};
 for(const key of ['cita','vistaTrabajo','estimacionPrivada'])if(typeof link[key]==='string')extra[key]=link[key] as string;
 openProSection(tab,extra,en);
}
export function NotificationCenter(){
 const en=useLocale()==='en',t=(es:string,english:string)=>en?english:es;
 const [view,setView]=useState<'unread'|'all'>('unread'),[items,setItems]=useState<NotificationItem[]>([]),[next,setNext]=useState<{at:string;id:string}|null>(null);
 const [unread,setUnread]=useState(0),[settings,setSettings]=useState<NotificationSettings|null>(null),[draft,setDraft]=useState<NotificationSettings|null>(null);
 const [loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),sequence=useRef(0);
 const load=useCallback(async(after:{at:string;id:string}|null=null)=>{
  const request=++sequence.current;setLoading(true);setError('');
  try{const r=await fetch('/api/pro/notifications?'+new URLSearchParams({view,...(after?{afterAt:after.at,afterId:after.id}:{})}),{cache:'no-store'});const body=await r.json();if(!r.ok)throw Error(body.error);const page=notificationPageSchema.parse(body);
   if(request!==sequence.current)return;setItems(old=>after?[...old,...page.items]:page.items);setNext(page.next);setUnread(page.unread);setSettings(page.settings);setDraft(old=>old&&old.revision===page.settings.revision?old:page.settings);}
  catch{if(request===sequence.current)setError(t('No se pudieron cargar los avisos.','Notifications could not be loaded.'));}
  finally{if(request===sequence.current)setLoading(false);}
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[view]);
 useEffect(()=>{const timer=setTimeout(()=>void load(),0);return()=>clearTimeout(timer);},[load]);
 async function mark(ids:string[],action:'read'|'unread'|'read_all'){
  setBusy(true);setNotice('');try{await send(action==='read_all'?{action,actionId:crypto.randomUUID()}:{action,actionId:crypto.randomUUID(),ids});await load();}catch{setError(t('No se pudo actualizar. Intente de nuevo.','Could not update. Retry: it will not duplicate.'));}finally{setBusy(false);}
 }
 async function open(item:NotificationItem){if(!item.read){try{await send({action:'read',actionId:crypto.randomUUID(),ids:[item.id]});}catch{}}openLink(item,en);}
 async function save(){
  if(!draft)return;setBusy(true);setNotice('');setError('');
  try{const result=await send({action:'settings',actionId:crypto.randomUUID(),revision:draft.revision,dueSoonDays:draft.dueSoonDays,overdueGraceDays:draft.overdueGraceDays,prefs:draft.prefs});setSettings(result.settings);setDraft(result.settings);setNotice(t('Preferencias guardadas.','Preferences saved.'));await load();}
  catch(e){setError((e as {status?:number}).status===409?t('Sus preferencias cambiaron en otra pestaña. Recargue antes de guardar.','Your preferences changed in another tab. Reload before saving.'):t('No se pudieron guardar las preferencias.','Preferences could not be saved.'));}
  finally{setBusy(false);}
 }
 const date=(value:string)=>new Intl.DateTimeFormat(en?'en-US':'es-CR',{dateStyle:'medium',timeStyle:'short',timeZone:'America/Costa_Rica'}).format(new Date(value));
 const detail=(item:NotificationItem)=>{
  if(item.event==='invoice_paid'&&/^\d+$/.test(item.body))return proMoney(Number(item.body)/100,en);
  if(item.event==='daily_log_missing'){const logDay=typeof item.link.date==='string'?item.link.date:'';return [item.title,logDay?t('Hubo trabajo el ','There was work on ')+new Intl.DateTimeFormat(en?'en-US':'es-CR',{dateStyle:'medium',timeZone:'UTC'}).format(new Date(logDay+'T12:00:00Z'))+t(' y no hay entrada en la bitácora.',' and there is no daily log entry.'):''].filter(Boolean).join(' · ');}
  if(item.event==='task_due'){const due=typeof item.link.due==='string'?item.link.due:'';const label=due?new Intl.DateTimeFormat(en?'en-US':'es-CR',{dateStyle:'medium',timeZone:'UTC'}).format(new Date(due+'T12:00:00Z')):'';return [item.body,item.link.overdue?t('Vencida','Overdue')+(label?' · '+label:''):t('Vence','Due')+(label?' '+label:'')].filter(Boolean).join(' · ');}
  if(item.event==='payment_plan_due'){const cents=typeof item.link.amountCents==='number'?item.link.amountCents:null;const due=typeof item.link.due==='string'?item.link.due:'';return [item.title,t('Vence','Due')+(due?' '+new Intl.DateTimeFormat(en?'en-US':'es-CR',{dateStyle:'medium',timeZone:'UTC'}).format(new Date(due+'T12:00:00Z')):''),cents!==null?proMoney(cents/100,en):null].filter(Boolean).join(' · ');}
  if(item.event==='invoice_overdue'){const cents=typeof item.link.amountCents==='number'?item.link.amountCents:null;return [t('Vencida','Overdue'),item.body,cents!==null?proMoney(cents/100,en):null].filter(Boolean).join(' · ');}
  return item.body;
 };
 const changed=!!draft&&!!settings&&JSON.stringify(draft)!==JSON.stringify(settings);
 return <section data-notification-center className="min-w-0 space-y-6">
  <div className="flex flex-wrap items-center justify-between gap-3">
   <div role="group" aria-label={t('Mostrar avisos','Show notifications')} className="flex gap-1 rounded-2xl bg-[#e9eff5] p-1.5">{(['unread','all'] as const).map(value=><button key={value} type="button" aria-pressed={view===value} onClick={()=>setView(value)} className={`min-h-11 rounded-xl px-4 text-sm font-semibold ${view===value?'bg-white text-[#008bb5] shadow-sm':'text-[#52627a]'}`}>{value==='unread'?t('Sin leer','Unread')+(unread?` (${unread})`:''):t('Todos','All')}</button>)}</div>
   <Button type="button" variant="secondary" disabled={busy||!unread} onClick={()=>void mark([],'read_all')}>{t('Marcar todo como leído','Mark all as read')}</Button>
  </div>
  {error&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error} <Button type="button" variant="secondary" onClick={()=>void load()}>{t('Reintentar','Retry')}</Button></p>}
  {loading&&!items.length&&<p role="status">{t('Cargando avisos…','Loading notifications…')}</p>}
  {!loading&&!items.length&&!error&&<p data-notification-empty className="rounded-2xl border border-dashed border-[#d7e1ea] bg-white p-6 text-center text-[#52627a]">{view==='unread'?t('No tiene avisos sin leer.','You have no unread notifications.'):t('Todavía no hay avisos.','No notifications yet.')}</p>}
  <ul data-notification-list className="min-w-0 space-y-2">{items.map(item=><li key={item.id} data-notification={item.event} data-notification-read={item.read?'':undefined} className={`flex min-w-0 flex-wrap items-start gap-3 rounded-2xl border p-4 ${item.read?'border-[#e5e7eb] bg-white':'border-[#9fd9ea] bg-[#f3fbfe]'}`}>
   <span aria-hidden="true" className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${item.read?'bg-transparent':'bg-[#008bb5]'}`}/>
   <button type="button" onClick={()=>void open(item)} className="min-w-0 flex-1 text-left"><span className="block text-xs font-bold uppercase tracking-wide text-[#68778d]">{eventLabels[item.event][en?1:0]}</span><span className="block break-words font-semibold text-[#162543]">{item.title}</span>{detail(item)&&<span className="block break-words text-sm text-[#52627a]">{detail(item)}</span>}<span className="mt-1 block text-xs text-[#68778d]">{date(item.createdAt)}{item.emailDraft?' · '+t('Borrador de correo guardado (no enviado)','Email draft saved (not sent)'):''}</span></button>
   <Button type="button" variant="secondary" disabled={busy} onClick={()=>void mark([item.id],item.read?'unread':'read')}>{item.read?t('Marcar sin leer','Mark unread'):t('Marcar como leído','Mark as read')}</Button>
  </li>)}</ul>
  {next&&<Button type="button" variant="secondary" disabled={loading} onClick={()=>void load(next)}>{t('Ver más','Show more')}</Button>}
  {draft&&<section data-notification-settings className="min-w-0 space-y-4 rounded-2xl border border-[#e5e7eb] bg-white p-4 sm:p-5">
   <div><h2 className="text-lg font-bold">{t('Preferencias de avisos','Notification preferences')}</h2><p className="text-sm text-[#52627a]">{t('Son solo suyas. El correo solo guarda un borrador para que usted lo revise: ContrataCR no envía correos ni notificaciones push desde aquí.','They are yours only. Email only saves a draft for you to review: ContrataCR does not send email or push notifications from here.')}</p></div>
   <div className="min-w-0 divide-y divide-[#eef2f6]">{notificationEvents.map(event=><div key={event} data-notification-pref={event} className="flex min-w-0 flex-wrap items-center justify-between gap-2 py-2">
    <span className="min-w-0 break-words text-sm font-semibold">{eventLabels[event][en?1:0]}</span>
    <span className="flex flex-wrap gap-4 text-sm">{(['inApp','email'] as const).map(channel=><label key={channel} className="flex min-h-11 items-center gap-2"><input type="checkbox" className="h-5 w-5" checked={draft.prefs[event]?.[channel]??channel==='inApp'} onChange={e=>setDraft({...draft,prefs:{...draft.prefs,[event]:{...(draft.prefs[event]??{inApp:true,email:false}),[channel]:e.target.checked}}})}/>{channel==='inApp'?t('En la app','In app'):t('Borrador de correo','Email draft')}</label>)}</span>
   </div>)}</div>
   <div className="grid min-w-0 gap-3 sm:grid-cols-2">
    <label className="text-sm font-semibold">{t('Recordar tareas antes del vencimiento','Remind me about tasks before they are due')}<select aria-label={t('Recordar tareas antes del vencimiento','Remind me about tasks before they are due')} className="mt-1 min-h-11 w-full rounded-xl border border-[#d7e1ea] bg-white px-3 text-base" value={draft.dueSoonDays} onChange={e=>setDraft({...draft,dueSoonDays:Number(e.target.value)})}>{[0,1,2,3,5,7,14].map(days=><option key={days} value={days}>{days===0?t('El mismo día','On the due date'):proCount(days,en,['día antes','días antes'],['day before','days before'])}</option>)}</select></label>
    <label className="text-sm font-semibold">{t('Avisar cuotas vencidas después de','Notify overdue installments after')}<select aria-label={t('Avisar cuotas vencidas después de','Notify overdue installments after')} className="mt-1 min-h-11 w-full rounded-xl border border-[#d7e1ea] bg-white px-3 text-base" value={draft.overdueGraceDays} onChange={e=>setDraft({...draft,overdueGraceDays:Number(e.target.value)})}>{[0,1,3,7,15,30].map(days=><option key={days} value={days}>{days===0?t('El día siguiente al vencimiento','The day after it is due'):proCount(days,en,['día de gracia','días de gracia'],['grace day','grace days'])}</option>)}</select></label>
   </div>
   {notice&&<p role="status" className="text-sm text-[#0f7a3d]">{notice}</p>}
   <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="secondary" disabled={busy||!changed} onClick={()=>setDraft(settings)}>{t('Descartar cambios','Discard changes')}</Button><Button type="button" disabled={busy||!changed} onClick={()=>void save()}>{busy?t('Guardando…','Saving…'):t('Guardar preferencias','Save preferences')}</Button></div>
  </section>}
 </section>;
}
/** Header bell of the Pro space: unread count (polled every 60 s and on focus); opens Avisos. */
export function NotificationBell(){
 const en=useLocale()==='en',[unread,setUnread]=useState<number|null>(null);
 useEffect(()=>{let alive=true;const load=()=>fetch('/api/pro/notifications?view=count',{cache:'no-store'}).then(r=>r.ok?r.json():null).then(body=>{if(alive&&body&&typeof body.unread==='number')setUnread(body.unread);}).catch(()=>{});
  void load();const timer=setInterval(load,60000);window.addEventListener('focus',load);window.addEventListener(PRO_NOTIFICATIONS_CHANGED,load);
  return()=>{alive=false;clearInterval(timer);window.removeEventListener('focus',load);window.removeEventListener(PRO_NOTIFICATIONS_CHANGED,load);};},[]);
 const label=en?(unread?`Notifications, ${unread} unread`:'Notifications'):(unread?`Avisos, ${unread} sin leer`:'Avisos');
 return <button type="button" data-pro-notification-bell aria-label={label} onClick={()=>navigatePro('pro_notifications')} className="relative flex h-11 w-11 items-center justify-center rounded-xl border border-[#d7e1ea] bg-white text-[#162543] hover:bg-[#f3f8fb]"><Bell className="h-5 w-5"/>{!!unread&&<span data-pro-notification-count className="absolute -right-1.5 -top-1.5 min-w-5 rounded-full bg-[#e5484d] px-1.5 text-center text-xs font-bold leading-5 text-white">{unread>99?'99+':unread}</span>}</button>;
}
