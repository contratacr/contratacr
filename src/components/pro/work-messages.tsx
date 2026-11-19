'use client';
import {useCallback,useEffect,useRef,useState,type FormEvent} from 'react';
import {useLocale} from 'next-intl';
import {Button} from '@/components/ui/button';
import {workMessagePageSchema,workMessageSchema,workMessageThreadsSchema,type WorkMessage} from '@/lib/pro/work-messages';
import {z} from 'zod';
import {messageFileSchema,type MessageFile} from '@/lib/pro/round8';
import {PRO_FILE_MAX_BYTES,proFileLimitText} from '@/lib/pro/file-limit';
import {proFileSize} from '@/lib/pro/file-size';
import {CLIENT_SECTION_OPEN_EVENT} from '@/lib/pro/round12';

const field='block min-h-24 w-full min-w-0 rounded-xl border border-[#d7e1ea] bg-white px-3 py-2 text-base';
const stamp=(value:string,en:boolean)=>{const d=new Date(value);return Number.isFinite(d.getTime())?new Intl.DateTimeFormat(en?'en-US':'es-CR',{dateStyle:'medium',timeStyle:'short',timeZone:'America/Costa_Rica'}).format(d):'';};

/** Round 7C: unread messages of a job for the owner (tab badge). */
export function useWorkMessagesUnread(workId:string|undefined){
 const [count,setCount]=useState(0);
 useEffect(()=>{if(!workId)return;let alive=true;const load=async()=>{try{const response=await fetch('/api/pro/work-messages?'+new URLSearchParams({view:'threads',workId}),{cache:'no-store'});if(!response.ok)return;const body=workMessageThreadsSchema.parse(await response.json());if(alive)setCount(body.threads.reduce((sum,t)=>sum+t.unread,0));}catch{}};void load();const timer=setInterval(()=>{if(document.visibilityState==='visible')void load();},30000);return()=>{alive=false;clearInterval(timer);};},[workId]);
 return count;
}

/** One thread (owner or customer side is decided by the server). */
export function MessageThread({requestId,onUnread}:{requestId:string;onUnread?:(n:number)=>void}){
 const en=useLocale()==='en',[items,setItems]=useState<WorkMessage[]>([]),[side,setSide]=useState<'pro'|'client'|null>(null),[counterpart,setCounterpart]=useState(''),[hasMore,setHasMore]=useState(false),[error,setError]=useState(''),[loadError,setLoadError]=useState(false),[draft,setDraft]=useState(''),[busy,setBusy]=useState(false),pending=useRef<{actionId:string;body:string}|null>(null),list=useRef<HTMLDivElement>(null);
 // Round 8: attachments (photo or PDF ≤ 20 MiB) shown in the thread for both sides.
 const [files,setFiles]=useState<Record<string,MessageFile>>({}),[attachment,setAttachment]=useState<File|null>(null),fileInput=useRef<HTMLInputElement>(null),attachAction=useRef<{key:string;id:string}|null>(null);
 const loadFiles=useCallback(async()=>{try{const r=await fetch('/api/pro/work-message-files?'+new URLSearchParams({requestId}),{cache:'no-store'});if(!r.ok)return;const body=await r.json();const list=z.array(messageFileSchema).parse(body.files);setFiles(Object.fromEntries(list.map(f=>[f.messageId,f])));}catch{}},[requestId]);
 const load=useCallback(async(before?:string)=>{try{const response=await fetch('/api/pro/work-messages?'+new URLSearchParams({view:'thread',requestId,...before?{before}:{}}),{cache:'no-store'});if(!response.ok)throw Error();const page=workMessagePageSchema.parse(await response.json());setSide(page.side);setCounterpart(page.counterpart);setHasMore(page.hasMore);setItems(old=>before?[...page.items,...old.filter(m=>!page.items.some(n=>n.id===m.id))]:page.items);setLoadError(false);onUnread?.(page.unread);void loadFiles();
  if(!before&&page.unread>0){void fetch('/api/pro/work-messages',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'read',requestId})}).then(r=>{if(r.ok)onUnread?.(0);}).catch(()=>{});}}catch{setLoadError(true);}},[requestId,onUnread,loadFiles]);
 useEffect(()=>{const first=setTimeout(()=>void load(),0),timer=setInterval(()=>{if(document.visibilityState==='visible'&&!pending.current)void load();},20000);return()=>{clearTimeout(first);clearInterval(timer);};},[load]);
 useEffect(()=>{const node=list.current;if(node)node.scrollTop=node.scrollHeight;},[items.length]);
 async function sendAttachment(body:string){
  const file=attachment;if(!file)return;const key=JSON.stringify([file.name,file.size,file.lastModified,body]);if(attachAction.current?.key!==key)attachAction.current={key,id:crypto.randomUUID()};
  setBusy(true);setError('');
  try{const base64=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).replace(/^data:[^,]*,/,''));reader.onerror=()=>reject(Error());reader.readAsDataURL(file);});
   const response=await fetch('/api/pro/work-message-files',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requestId,actionId:attachAction.current.id,body,name:file.name.slice(-160),base64})});
   const data=await response.json().catch(()=>({}));
   if(!response.ok)throw Error(typeof data?.error==='string'?data.error:(en?'Could not confirm the upload. Retry: it will not be duplicated.':'No se pudo comprobar el envío. Reintente: no se duplicará.'));
   const message=workMessageSchema.parse(data.message),saved=messageFileSchema.parse(data.file);attachAction.current=null;setAttachment(null);if(fileInput.current)fileInput.current.value='';setDraft('');
   setItems(old=>old.some(m=>m.id===message.id)?old:[...old,message]);setFiles(old=>({...old,[saved.messageId]:saved}));}
  catch(caught){setError(caught instanceof Error&&caught.message?caught.message:(en?'Could not send the file.':'No se pudo enviar el archivo.'));}finally{setBusy(false);}
 }
 async function send(event:FormEvent){event.preventDefault();const body=draft.trim();if(attachment&&!busy){await sendAttachment(body);return;}if(!body||busy)return;const attempt=pending.current?.body===body?pending.current:{actionId:crypto.randomUUID(),body};pending.current=attempt;setBusy(true);setError('');
  try{const response=await fetch('/api/pro/work-messages',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'post',actionId:attempt.actionId,requestId,body})});
   if(response.status===429)throw Error(en?'Too many messages in a minute. Wait a moment.':'Demasiados mensajes en un minuto. Espere un momento.');if(response.status===403)throw Error(en?'You can no longer write in this conversation.':'Ya no puede escribir en esta conversación.');if(!response.ok)throw Error(en?'Not sent. Retry: it will not be duplicated.':'No se envió. Reintente: no se duplicará.');
   const message=workMessageSchema.parse((await response.json()).message);pending.current=null;setDraft('');setItems(old=>old.some(m=>m.id===message.id)?old:[...old,message]);}
  catch(caught){setError(caught instanceof Error?caught.message:String(caught));}finally{setBusy(false);}}
 if(loadError&&!side)return <p role="alert">{en?'Could not load the messages.':'No se pudieron cargar los mensajes.'} <Button variant="outline" onClick={()=>void load()}>{en?'Retry':'Reintentar'}</Button></p>;
 if(!side)return <p role="status">{en?'Loading messages…':'Cargando mensajes…'}</p>;
 return <div data-message-thread={requestId} className="min-w-0 space-y-3">
  <p className="text-sm text-[#52627a]">{(en?'Conversation with ':'Conversación con ')+counterpart+'. '}{en?'Messages stay in ContrataCR: nothing is sent by email or WhatsApp.':'Los mensajes quedan en ContrataCR: no se envían por correo ni WhatsApp.'}</p>
  {hasMore&&<Button type="button" variant="ghost" onClick={()=>void load(items[0]?.id)}>{en?'Earlier messages':'Mensajes anteriores'}</Button>}
  <div ref={list} role="log" aria-live="polite" aria-label={en?'Messages':'Mensajes'} className="max-h-[50dvh] min-h-24 space-y-2 overflow-y-auto rounded-2xl border border-[#d7e1ea] bg-[#f7f9fc] p-3">
   {items.length===0?<p className="text-sm text-[#52627a]">{en?'No messages yet. Write the first one.':'Todavía no hay mensajes. Escriba el primero.'}</p>:items.map(m=>{const mine=m.side===side;return <div key={m.id} data-message={m.id} data-message-side={m.side} className={'flex '+(mine?'justify-end':'justify-start')}><div className={'max-w-[85%] min-w-0 rounded-2xl px-3 py-2 text-sm shadow-sm '+(mine?'bg-[#00739a] text-white':'bg-white text-[#162543] ring-1 ring-[#d7e1ea]')}>{files[m.id]?<MessageAttachment file={files[m.id]} mine={mine} en={en}/>:null}{!(files[m.id]&&files[m.id].name===m.body)&&<p className="whitespace-pre-wrap break-words">{m.body}</p>}<p className={'mt-1 text-[11px] '+(mine?'text-white/80':'text-[#52627a]')}>{(mine?(en?'You':'Usted'):m.authorName||counterpart)+' · '+stamp(m.createdAt,en)}</p></div></div>;})}
  </div>
  <form data-message-form onSubmit={send} className="space-y-2"><label className="block text-sm font-semibold">{en?'Message':'Mensaje'}<textarea aria-label={en?'Message':'Mensaje'} maxLength={2000} value={draft} disabled={busy} onChange={event=>setDraft(event.target.value)} className={field}/></label><div className="flex flex-wrap items-center gap-2"><label className="inline-flex min-h-11 cursor-pointer items-center rounded-full border border-[#d7e1ea] bg-white px-4 text-sm font-semibold focus-within:ring-2 focus-within:ring-[#009FD9]">{en?'Attach photo or PDF':'Adjuntar foto o PDF'}<input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" aria-label={en?'Attach photo or PDF':'Adjuntar foto o PDF'} disabled={busy} className="sr-only" onChange={event=>{const f=event.target.files?.[0]??null;setError('');if(f&&f.size>PRO_FILE_MAX_BYTES){setError(proFileLimitText(en));event.target.value='';setAttachment(null);return;}setAttachment(f);}}/></label>{attachment&&<span data-message-attachment-pending className="min-w-0 break-all text-sm">{attachment.name} <button type="button" className="ml-1 min-h-11 underline" onClick={()=>{setAttachment(null);if(fileInput.current)fileInput.current.value='';}}>{en?'Remove':'Quitar'}</button></span>}</div><p className="text-xs text-[#52627a]">{proFileLimitText(en)} {en?'Only you and the other side of this conversation can open it.':'Solo usted y la otra parte de esta conversación pueden abrirlo.'}</p><div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs text-[#52627a]">{draft.length}/2000</span><Button type="submit" disabled={busy||!draft.trim()&&!attachment}>{busy?(en?'Sending…':'Enviando…'):(en?'Send':'Enviar')}</Button></div>{error&&<p role="alert" className="text-sm text-red-700">{error}</p>}</form>
 </div>;
}

/** Owner side inside the job: one thread per linked customer account. */
export function WorkMessages({workId,onUnread}:{workId:string;onUnread?:(n:number)=>void}){
 const en=useLocale()==='en',[threads,setThreads]=useState<{requestId:string;clientName:string;unread:number}[]|null>(null),[error,setError]=useState(false),[open,setOpen]=useState<string|null>(null);
 const load=useCallback(async()=>{try{const response=await fetch('/api/pro/work-messages?'+new URLSearchParams({view:'threads',workId}),{cache:'no-store'});if(!response.ok)throw Error();const body=workMessageThreadsSchema.parse(await response.json());setThreads(body.threads);setOpen(old=>old??body.threads[0]?.requestId??null);setError(false);}catch{setError(true);}},[workId]);
 useEffect(()=>{const timer=setTimeout(()=>void load(),0);return()=>clearTimeout(timer);},[load]);
 const markRead=useCallback((requestId:string,n:number)=>{setThreads(old=>{if(!old)return old;const next=old.map(t=>t.requestId===requestId?{...t,unread:n}:t);onUnread?.(next.reduce((s,t)=>s+t.unread,0));return next;});},[onUnread]);
 return <section data-work-messages className="min-w-0 space-y-3"><h3 className="font-bold">{en?'Messages with the customer':'Mensajes con el cliente'}</h3>
  {error?<p role="alert">{en?'Could not load the conversations.':'No se pudieron cargar las conversaciones.'} <Button variant="outline" onClick={()=>void load()}>{en?'Retry':'Reintentar'}</Button></p>:!threads?<p role="status">{en?'Loading…':'Cargando…'}</p>:threads.length===0?<p className="rounded-xl border border-[#d7e1ea] p-4 text-sm text-[#52627a]">{en?'Messages are available when the job has a customer with a ContrataCR account (a confirmed request or a project invitation).':'Los mensajes se habilitan cuando el trabajo tiene un cliente con cuenta de ContrataCR (una solicitud confirmada o una invitación al proyecto).'}</p>:<>
   {threads.length>1&&<div className="flex flex-wrap gap-2">{threads.map(t=><Button key={t.requestId} type="button" variant={open===t.requestId?'default':'secondary'} onClick={()=>setOpen(t.requestId)}>{t.clientName}{t.unread>0&&<span className="ml-2 rounded-full bg-[#d14343] px-2 text-xs text-white">{t.unread}</span>}</Button>)}</div>}
   {open&&<MessageThread key={open} requestId={open} onUnread={n=>markRead(open,n)}/>}
  </>}
 </section>;
}

/** Customer side in the project (and the owner's «Vista del cliente» preview). */
export function ClientMessages({requestId}:{requestId:string}){
 const en=useLocale()==='en',[unread,setUnread]=useState(0),[openThread,setOpenThread]=useState(false),[last,setLast]=useState<WorkMessage|null>(null),[probed,setProbed]=useState(false);
 const onProbe=useCallback((n:number,latest:WorkMessage|null)=>{setUnread(n);setLast(latest);setProbed(true);},[]);
 // Fix 13: «Open messages» in the project overview opens the conversation, not only scrolls to it.
 useEffect(()=>{const open=(event:Event)=>{const detail=(event as CustomEvent<{requestId?:string;section?:string}>).detail;if(detail?.requestId===requestId&&detail.section==='messages')setOpenThread(true);};window.addEventListener(CLIENT_SECTION_OPEN_EVENT,open);return()=>window.removeEventListener(CLIENT_SECTION_OPEN_EVENT,open);},[requestId]);
 return <section data-client-messages className="min-w-0 space-y-3 rounded-2xl border border-[#d7e1ea] bg-white p-4">
  <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">{en?'Messages':'Mensajes'}{unread>0&&<span data-client-messages-unread className="ml-2 rounded-full bg-[#d14343] px-2 py-0.5 text-xs font-bold text-white">{unread} {en?'new':(unread===1?'nuevo':'nuevos')}</span>}</h3>
   <Button type="button" variant="outline" aria-expanded={openThread} onClick={()=>setOpenThread(value=>!value)}>{openThread?(en?'Hide':'Ocultar'):(en?'Open conversation':'Abrir conversación')}</Button></div>
  {/* Fix 14: the only messages card of the customer's project: unread summary + last message, then the thread. */}
  {(probed||openThread)&&<p data-client-messages-summary className="text-sm">{unread===0?(en?'No unread messages.':'No tiene mensajes sin leer.'):unread===1?(en?'You have 1 unread message.':'Tiene 1 mensaje sin leer.'):(en?`You have ${unread} unread messages.`:`Tiene ${unread} mensajes sin leer.`)}</p>}
  {!openThread&&last&&<p data-client-messages-last className="break-words rounded-xl bg-[#f3f8fb] p-2 text-sm text-[#52627a]"><span className="font-semibold text-[#162543]">{last.side==='client'?(en?'You':'Usted'):last.authorName}:</span> {last.body}</p>}
  {openThread?<MessageThread requestId={requestId} onUnread={setUnread}/>:<UnreadProbe requestId={requestId} onProbe={onProbe}/>}
 </section>;
}
function UnreadProbe({requestId,onProbe}:{requestId:string;onProbe:(n:number,last:WorkMessage|null)=>void}){
 useEffect(()=>{let alive=true;void fetch('/api/pro/work-messages?'+new URLSearchParams({view:'thread',requestId}),{cache:'no-store'}).then(async r=>{if(!r.ok)return;const page=workMessagePageSchema.parse(await r.json());const latest=[...page.items].sort((a,b)=>a.createdAt<b.createdAt?-1:1).at(-1)??null;if(alive)onProbe(page.unread,latest);}).catch(()=>{});return()=>{alive=false;};},[requestId,onProbe]);
 return null;
}

/** Round 8: one attachment inside a message bubble (photo preview or PDF), private download. */
function MessageAttachment({file,mine,en}:{file:MessageFile;mine:boolean;en:boolean}){
 const href='/api/pro/work-message-files?'+new URLSearchParams({fileId:file.id});
 return <div data-message-file={file.id} className="mb-1 space-y-1">
  {/* eslint-disable-next-line @next/next/no-img-element -- authenticated same-origin JPEG of a private attachment. */}
  {file.mimeType==='image/jpeg'&&<img src={href} alt={file.name} loading="lazy" className="max-h-56 w-auto max-w-full rounded-lg bg-white object-contain"/>}
  <a href={href} download={file.name} className={'flex min-h-11 items-center gap-2 break-all font-semibold underline '+(mine?'text-white':'text-[#00739a]')}>{file.mimeType==='application/pdf'?'PDF':(en?'Photo':'Foto')} · {file.name} · {proFileSize(file.sizeBytes,en)}</a>
 </div>;
}
