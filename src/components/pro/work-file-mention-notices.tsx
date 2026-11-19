'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {useLocale} from 'next-intl';
import {useAuth} from '@/hooks/use-auth';
import {Button} from '@/components/ui/button';
import {fileMentionNoticeResultSchema,fileMentionNoticesPageSchema,type FileMentionNotice,type FileMentionNoticesPage} from '@/lib/pro/file-mentions';
import {fileMentionsApi} from './work-file-mention-picker';
/* Fila 30: isolated internal inbox of @mentions in job file comments, next to the task notices
   in Equipo. It never shows or links the file: collaborators have no access to job files. Only
   job, file name, author, an excerpt and the date. Nothing is sent (no e-mail/push/outbox). */
const card='rounded-2xl border border-[#d7e1ea] bg-white p-4 space-y-3';
const when=(value:string,en:boolean)=>new Intl.DateTimeFormat(en?'en-US':'es-CR',{dateStyle:'medium',timeStyle:'short',timeZone:'America/Costa_Rica'}).format(new Date(value));
/** `compact` (inside the Pro shell): the toggle only shows while there are unread mentions. */
export function WorkFileMentionNotices({compact=false}:{compact?:boolean}){const {user}=useAuth();if(!user)return null;return <Inbox key={user.id} accountId={user.id} compact={compact}/>;}
function Inbox({accountId,compact}:{accountId:string;compact:boolean}){
 const en=useLocale()==='en',t=(es:string,english:string)=>en?english:es;
 const [expanded,setExpanded]=useState(false),[status,setStatus]=useState<'unread'|'all'>('unread'),[page,setPage]=useState<{status:string;data:FileMentionNoticesPage}|null>(null),[loading,setLoading]=useState(true),[loadError,setLoadError]=useState(false);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),alive=useRef(true),sequence=useRef(0),pending=useRef<{noticeId:string;actionId:string}|null>(null);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 const invalidate=useCallback(()=>{sequence.current++;},[]);
 const load=useCallback(async(after?:string)=>{
  const id=++sequence.current;setLoading(true);
  try{const response=await fetch(fileMentionsApi+'?'+new URLSearchParams({view:'inbox',status,...after?{after}:{}}),{cache:'no-store',headers:{'X-Pro-Expected-Actor':accountId}});if(!response.ok)throw Error();
   const data=fileMentionNoticesPageSchema.parse(await response.json());
   if(alive.current&&id===sequence.current){setPage(old=>after&&old?.status===status?{status,data:{...data,items:[...old.data.items,...data.items.filter(item=>!old.data.items.some(prior=>prior.id===item.id))]}}:{status,data});setLoadError(false);}}
  catch{if(alive.current&&id===sequence.current)setLoadError(true);}
  finally{if(alive.current&&id===sequence.current)setLoading(false);}
 },[accountId,status]);
 useEffect(()=>{
  const timer=setTimeout(()=>void load(),0),poll=setInterval(()=>{if(document.visibilityState==='visible')void load();},60000),focus=()=>void load(),visible=()=>{if(document.visibilityState==='visible')void load();};
  window.addEventListener('focus',focus);document.addEventListener('visibilitychange',visible);
  return()=>{invalidate();clearTimeout(timer);clearInterval(poll);window.removeEventListener('focus',focus);document.removeEventListener('visibilitychange',visible);};
 },[load,invalidate]);
 /** Same notice -> same actionId until confirmed (idempotent retry after a lost response). */
 async function markRead(item:FileMentionNotice){
  if(busy)return;setBusy(true);setError('');setNotice('');
  if(pending.current?.noticeId!==item.id)pending.current={noticeId:item.id,actionId:crypto.randomUUID()};
  try{const response=await fetch(fileMentionsApi,{method:'POST',headers:{'Content-Type':'application/json','X-Pro-Expected-Actor':accountId},body:JSON.stringify({action:'mark_read',actionId:pending.current.actionId,noticeId:item.id})});
   if(!response.ok){if(response.status!==503)pending.current=null;throw response.status;}
   const result=fileMentionNoticeResultSchema.parse(await response.json());if(result.noticeId!==item.id)throw Error();pending.current=null;
   if(alive.current){setNotice(t('Mención marcada como leída.','Mention marked as read.'));await load();}}
  catch(cause){if(alive.current){setError(cause===403||cause===404?t('Esta mención ya no está disponible con su acceso actual.','This mention is no longer available with your current access.'):t('No se pudo confirmar el cambio. Reintente.','Could not confirm the change. Retry.'));if(cause===403||cause===404)await load();}}
  finally{if(alive.current)setBusy(false);}
 }
 const data=page?.status===status?page.data:null,unread=page?.data.unreadCount??0;
 if(compact&&!expanded&&!unread)return null;
 return <div data-file-mention-notices className="space-y-3">
  <Button type="button" data-file-mention-notices-toggle variant="outline" aria-expanded={expanded} className="min-h-11" onClick={()=>{setExpanded(!expanded);if(!expanded)void load();}}>
   {t('Menciones en archivos','File mentions')}{!!unread&&<span aria-label={t('Menciones sin leer','Unread mentions')} className="ml-2 rounded-full bg-[#00a3cf] px-2 py-0.5 text-sm text-white">{unread}</span>}</Button>
  {expanded&&<section data-file-mention-inbox aria-labelledby={accountId+'-file-mentions'} className={card}>
   <div className="flex min-w-0 flex-wrap items-center gap-2"><h2 id={accountId+'-file-mentions'} className="text-lg font-bold">{t('Menciones en archivos','File mentions')}</h2>
    {!!unread&&<span aria-hidden="true" className="rounded-full bg-[#00a3cf] px-2 py-0.5 text-sm font-bold text-white">{unread}</span>}</div>
   <p className="text-sm text-slate-600">{t('Avisos internos cuando alguien le menciona en un comentario de un archivo del trabajo. El archivo no se comparte con usted.','Internal notices when someone mentions you in a comment on a job file. The file is not shared with you.')}</p>
   {notice&&<p role="status" className="text-sm text-[#175b42]">{notice}</p>}{error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
   <div role="group" aria-label={t('Estado de menciones','Mention status')} className="flex rounded-2xl bg-[#e6edf5] p-1">{(['unread','all'] as const).map(value=><button type="button" key={value} disabled={busy} aria-pressed={status===value}
    className={'min-h-11 flex-1 rounded-xl px-3 py-2 font-semibold '+(status===value?'bg-white text-[#009fc7] shadow-sm':'text-slate-500')} onClick={()=>setStatus(value)}>{value==='unread'?t('Sin leer','Unread'):t('Todas','All')}</button>)}</div>
   {loadError?<div role="alert" className="space-y-2"><p className="text-sm">{t('No se pudieron cargar las menciones.','Could not load mentions.')}</p><Button type="button" variant="outline" className="min-h-11" onClick={()=>void load()}>{t('Reintentar','Retry')}</Button></div>
   :!data?<p role="status" className="text-sm text-slate-600">{t('Cargando menciones…','Loading mentions…')}</p>
   :!data.items.length?<p className="text-sm text-slate-600">{status==='unread'?t('No hay menciones sin leer.','No unread mentions.'):t('Aún no hay menciones.','No mentions yet.')}</p>
   :<ul className="min-w-0 space-y-2">{data.items.map(item=><li key={item.id} data-file-mention-notice={item.id} className={`min-w-0 space-y-2 rounded-xl border p-3 ${item.readAt?'border-[#d7e1ea]':'border-[#8fd3e8] bg-[#f4fbfd]'}`}>
    <p className="break-words font-semibold text-[#162543]">{t(`${item.authorName||'El equipo'} le mencionó en "${item.fileName}"`,`${item.authorName||'The team'} mentioned you on "${item.fileName}"`)}{item.versionNo?<span className="font-normal text-[#52627a]"> · v{item.versionNo}</span>:null}</p>
    <p className="break-words text-sm text-slate-600">{item.service||t('Trabajo','Job')} · <time dateTime={item.createdAt}>{when(item.createdAt,en)}</time>{!item.readAt&&<span className="ml-2 rounded-md bg-[#e6f6fb] px-2 py-0.5 text-xs font-semibold text-[#006e8f]">{t('Sin leer','Unread')}</span>}</p>
    <blockquote className="whitespace-pre-wrap break-words border-l-4 border-[#b9e3f0] pl-3 text-sm text-[#162543]">{item.excerpt}</blockquote>
    {!item.readAt&&<Button type="button" variant="outline" className="min-h-11" disabled={busy} onClick={()=>void markRead(item)}>{t('Marcar como leída','Mark as read')}</Button>}
   </li>)}</ul>}
   {data?.nextCursor&&<Button type="button" variant="outline" className="min-h-11" disabled={busy||loading} onClick={()=>void load(data.nextCursor!)}>{t('Ver más','Load more')}</Button>}
  </section>}
 </div>;
}
