'use client';

import {useCallback,useEffect,useRef,useState} from 'react';
import {useLocale} from 'next-intl';
import {UserPlus} from 'lucide-react';
import {useAuth} from '@/hooks/use-auth';
import {useAppDialog} from '@/hooks/use-app-dialog';
import {Button} from '@/components/ui/button';
import {endSentence} from "@/lib/text/sentence";
import {WORK_INVITE_DEFAULT_DAYS,workInviteLink,type WorkInvitationsDetail,type WorkInviteOwnerMutation} from '@/lib/pro/work-client-invitations';
import {parseTransactionalEmailView,transactionalEmailNotice,type TransactionalEmailView} from '@/lib/pro/transactional-email-copy';

/**
 * Round 1 (2026-11-12): "Invitar al cliente al proyecto". The owner creates a one-time link/code,
 * copies it and sends it by the channel of their choice (nothing is sent from here). When a signed-in
 * customer accepts it, that account becomes the linked customer of the job: customer view, contracts,
 * files and idea boards can then be shared. Shown in the job and in the customer record.
 */
const api='/api/pro/work-client-invitations',changedEvent='contratacr:work-client-link-changed';
type Fresh={token:string;invitationId:string;email?:TransactionalEmailView|null};
function copy(en:boolean){
 return en?{
  title:'Customer access',intro:'Invite your customer so they can follow this job from their account: customer view, contracts, files and idea boards you share.',
  invite:'Invite customer to the job',inviting:'Creating invitation…',newInvite:'Create a new invitation',
  linked:(name:string)=>`Customer account: ${name}`,linkedBooking:'Linked through an appointment booked by the customer.',
  unlink:'Unlink customer',unlinkTitle:'Unlink this customer?',unlinkHint:'The job leaves their account and nothing new can be shared with them. What you already shared stays in their history. You can invite someone again later.',unlinkConfirm:'Unlink',cancel:'Cancel',
  readyTitle:'Invitation ready',readyHint:(days:number)=>`Copy the link or the code and send it to your customer yourself (WhatsApp, e-mail…). It works once and expires in ${days} ${days===1?"day":"days"}. It is only shown now.`,
  readySentHint:(days:number)=>`It works once and expires in ${days} ${days===1?"day":"days"}. It is only shown now.`,
  link:'Invitation link',code:'Invitation code',copyLink:'Copy link',copyCode:'Copy code',copied:'Copied.',copyFailed:'Could not copy. Select the text and copy it.',
  pending:(date:string)=>endSentence(`Open invitation, expires ${date}`),revoke:'Cancel invitation',revoked:'Invitation cancelled.',
  replayed:'The invitation was created, but the link is only shown once. Create a new one.',
  profileMissing:'Complete your professional profile before inviting customers.',cancelledJob:'This job is cancelled; it cannot be shared.',
  loading:'Loading customer access…',loadError:'Could not load customer access.',retry:'Retry',conflict:'This changed in another window. It was updated.',uncertain:'Could not confirm the result. Retry the same action.',failed:'Could not complete the action.',
  unlinked:'Customer unlinked.',
 }:{
  title:'Acceso del cliente',intro:'Invite a su cliente para que siga este trabajo desde su cuenta: vista del cliente, contratos, archivos y tableros que usted comparta.',
  invite:'Invitar al cliente al proyecto',inviting:'Creando invitación…',newInvite:'Crear una invitación nueva',
  linked:(name:string)=>`Cuenta del cliente: ${name}`,linkedBooking:'Vinculado por una cita que reservó el cliente.',
  unlink:'Desvincular cliente',unlinkTitle:'¿Desvincular a este cliente?',unlinkHint:'El trabajo saldrá de su cuenta y no podrá compartirle nada nuevo. Lo que ya le compartió seguirá en su historial. Puede invitar de nuevo más adelante.',unlinkConfirm:'Desvincular',cancel:'Cancelar',
  readyTitle:'Invitación lista',readyHint:(days:number)=>`Copie el enlace o el código y envíeselo usted a su cliente (WhatsApp, correo…). Sirve una sola vez y vence en ${days} ${days===1?"día":"días"}. Solo se muestra ahora.`,
  readySentHint:(days:number)=>`Sirve una sola vez y vence en ${days} ${days===1?"día":"días"}. Solo se muestra ahora.`,
  link:'Enlace de invitación',code:'Código de invitación',copyLink:'Copiar enlace',copyCode:'Copiar código',copied:'Copiado.',copyFailed:'No se pudo copiar. Seleccione el texto y cópielo.',
  pending:(date:string)=>endSentence(`Invitación abierta, vence el ${date}`),revoke:'Anular invitación',revoked:'Invitación anulada.',
  replayed:'La invitación se creó, pero el enlace solo se muestra una vez. Cree una nueva.',
  profileMissing:'Complete su perfil profesional antes de invitar clientes.',cancelledJob:'Este trabajo está cancelado; no se puede compartir.',
  loading:'Cargando acceso del cliente…',loadError:'No se pudo cargar el acceso del cliente.',retry:'Reintentar',conflict:'Esto cambió en otra ventana. Se actualizó.',uncertain:'No se pudo confirmar el resultado. Reintente la misma acción.',failed:'No se pudo completar la acción.',
  unlinked:'Cliente desvinculado.',
 };
}
const day=(value:string,en:boolean)=>new Intl.DateTimeFormat(en?'en-US':'es-CR',{dateStyle:'medium',timeStyle:'short',timeZone:'America/Costa_Rica'}).format(new Date(value));

export function WorkClientInvite({workId,compact=false}:{workId:string;compact?:boolean}){const {user,loading}=useAuth();if(loading||!user)return null;return <InviteSession key={user.id+':'+workId} accountId={user.id} workId={workId} compact={compact}/>;}

function InviteSession({accountId,workId,compact}:{accountId:string;workId:string;compact:boolean}){
 const en=useLocale()==='en',c=copy(en),{confirm,dialogNode}=useAppDialog();
 const [detail,setDetail]=useState<WorkInvitationsDetail|null>(null),[loadError,setLoadError]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[fresh,setFresh]=useState<Fresh|null>(null),[copied,setCopied]=useState(''),[retry,setRetry]=useState<WorkInviteOwnerMutation|null>(null),[sending,setSending]=useState<string|null>(null);
 const sequence=useRef(0),lock=useRef(false);
 const load=useCallback(async()=>{const id=++sequence.current;setLoadError(false);try{const response=await fetch(api+'?'+new URLSearchParams({workId}),{cache:'no-store',headers:{'X-Pro-Expected-Actor':accountId}});if(!response.ok)throw Error();const body=await response.json() as WorkInvitationsDetail;if(body.workId!==workId)throw Error();if(id===sequence.current)setDetail(body);}catch{if(id===sequence.current)setLoadError(true);}},[accountId,workId]);
 useEffect(()=>{const timer=setTimeout(()=>void load(),0);const refresh=(event:Event)=>{const v=(event as CustomEvent<{workId:string}>).detail;if(v?.workId===workId&&!lock.current)void load();};window.addEventListener(changedEvent,refresh);const seq=sequence;return()=>{seq.current++;clearTimeout(timer);window.removeEventListener(changedEvent,refresh);};},[load,workId]);
 async function send(input:WorkInviteOwnerMutation){
  if(lock.current)return;lock.current=true;setRetry(input);setSending(input.action);setBusy(true);setError('');setNotice('');
  try{
   const response=await fetch(api,{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json','X-Pro-Expected-Actor':accountId},body:JSON.stringify(input)});
   const body=await response.json().catch(()=>null) as {error?:string;token?:string;replayed?:boolean;email?:unknown}|null;
   if(response.status>=500||response.status===429){setError(c.uncertain);return;}
   setRetry(null);
   if(response.status===409){setError(body?.error||c.conflict);await load();return;}
   if(!response.ok){setError(body?.error||c.failed);return;}
   if(input.action==='create'){if(body?.token)setFresh({token:body.token,invitationId:input.invitationId,email:parseTransactionalEmailView(body.email)});else if(body?.replayed)setNotice(c.replayed);}
   else{setFresh(null);setNotice(input.action==='revoke'?c.revoked:c.unlinked);}
   window.dispatchEvent(new CustomEvent(changedEvent,{detail:{workId}}));
   await load();
  }catch{setError(c.uncertain);}
  finally{lock.current=false;setBusy(false);setSending(null);}
 }
 const create=()=>void send({action:'create',actionId:crypto.randomUUID(),workId,invitationId:crypto.randomUUID(),expiresInDays:WORK_INVITE_DEFAULT_DAYS});
 async function unlink(requestId:string){const answer=await confirm({title:c.unlinkTitle,description:c.unlinkHint,confirmLabel:c.unlinkConfirm,cancelLabel:c.cancel,tone:'danger'});if(answer.confirmed)void send({action:'unlink',actionId:crypto.randomUUID(),workId,requestId});}
 async function copyText(kind:'link'|'code',text:string){try{await navigator.clipboard.writeText(text);setCopied(kind);}catch{setCopied('');setError(c.copyFailed);}}
 if(!detail&&!loadError)return <p role="status" className="text-sm text-[#52627a]">{c.loading}</p>;
 if(!detail)return <div role="alert" className="space-y-2"><p className="text-sm">{c.loadError}</p><Button type="button" variant="secondary" onClick={()=>void load()}>{c.retry}</Button></div>;
 const open=detail.invitations.find(item=>item.state==='active'),link=fresh?workInviteLink(window.location.origin,en?'en':'es',fresh.token):'';
 return <section data-work-client-invite className={compact?'space-y-3':'space-y-3 rounded-xl border border-[#d7e1ea] p-4'}>{dialogNode}
  {!compact&&<div><h3 className="font-semibold">{c.title}</h3><p className="mt-1 text-sm text-[#52627a]">{c.intro}</p></div>}
  {detail.linked?<div className="space-y-2"><p data-work-client-linked className="text-sm font-semibold">{c.linked(detail.linked.name)}</p>{detail.linked.origin==='booking'?<p className="text-sm text-[#52627a]">{c.linkedBooking}</p>:<Button type="button" variant="outline" disabled={busy} onClick={()=>void unlink(detail.linked!.requestId)}>{c.unlink}</Button>}</div>
  :detail.cancelled?<p className="text-sm text-[#52627a]">{c.cancelledJob}</p>
  :detail.profileMissing?<p className="text-sm text-[#52627a]">{c.profileMissing}</p>
  :<div className="space-y-3">
   {fresh?<div data-work-client-invite-ready className="space-y-3 rounded-xl bg-[#f3f8fb] p-3"><p className="font-semibold">{c.readyTitle}</p>{fresh.email&&<p role="status" data-transactional-email={fresh.email.mode+':'+fresh.email.status} className="text-sm font-semibold text-[#162543]">{transactionalEmailNotice(fresh.email,en,'customer')}</p>}<p className="text-sm text-[#52627a]">{fresh.email?c.readySentHint(WORK_INVITE_DEFAULT_DAYS):c.readyHint(WORK_INVITE_DEFAULT_DAYS)}</p>
    <label className="block text-sm font-semibold">{c.link}<input readOnly data-work-client-invite-link value={link} onFocus={event=>event.currentTarget.select()} className="mt-1 block min-h-11 w-full min-w-0 rounded-xl border border-[#d7e1ea] bg-white px-3 text-sm font-normal"/></label>
    <label className="block text-sm font-semibold">{c.code}<input readOnly data-work-client-invite-code value={fresh.token} onFocus={event=>event.currentTarget.select()} className="mt-1 block min-h-11 w-full min-w-0 rounded-xl border border-[#d7e1ea] bg-white px-3 font-mono text-sm font-normal"/></label>
    <div className="flex flex-wrap gap-2"><Button type="button" onClick={()=>void copyText('link',link)}>{c.copyLink}</Button><Button type="button" variant="outline" onClick={()=>void copyText('code',fresh.token)}>{c.copyCode}</Button></div>
    {copied&&<p role="status" className="text-sm">{c.copied}</p>}</div>
   :open&&<p data-work-client-invite-open className="text-sm text-[#52627a]">{c.pending(day(open.expiresAt,en))}</p>}
   <div className="flex flex-wrap gap-2"><Button type="button" data-work-client-invite-create variant={open||fresh?'outline':'default'} disabled={busy||!detail.canInvite} onClick={create}><UserPlus aria-hidden="true" className="h-4 w-4"/>{sending==='create'?c.inviting:open||fresh?c.newInvite:c.invite}</Button>
   {open&&<Button type="button" variant="ghost" disabled={busy} onClick={()=>{setFresh(null);void send({action:'revoke',actionId:crypto.randomUUID(),workId,invitationId:open.id});}}>{c.revoke}</Button>}</div>
  </div>}
  {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
  {error===c.uncertain&&retry&&<Button type="button" variant="secondary" disabled={busy} onClick={()=>void send(retry)}>{c.retry}</Button>}
  {notice&&<p role="status" className="text-sm">{notice}</p>}
 </section>;
}

type ClientJob={workId:string;service:string;stage:string;cancelled:boolean;linked:{name:string}|null};
/** Customer record: invite this customer to any of their jobs. */
export function ClientWorkAccess({clientId}:{clientId:string}){
 const en=useLocale()==='en',{user}=useAuth(),[items,setItems]=useState<ClientJob[]|null>(null),[open,setOpen]=useState<string|null>(null),[failed,setFailed]=useState(false);
 const load=useCallback(async()=>{if(!user)return;setFailed(false);try{const response=await fetch(api+'?'+new URLSearchParams({clientId}),{cache:'no-store',headers:{'X-Pro-Expected-Actor':user.id}});if(!response.ok)throw Error();const body=await response.json() as {clientId:string;items:ClientJob[]};if(body.clientId===clientId)setItems(body.items);}catch{setFailed(true);}},[clientId,user]);
 useEffect(()=>{const timer=setTimeout(()=>void load(),0);const refresh=()=>void load();window.addEventListener(changedEvent,refresh);return()=>{clearTimeout(timer);window.removeEventListener(changedEvent,refresh);};},[load]);
 if(!user)return null;
 return <section data-client-work-access className="space-y-3 rounded-xl border border-[#d7e1ea] p-4"><h3 className="font-semibold">{en?'Customer access to jobs':'Acceso del cliente a sus trabajos'}</h3>
  <p className="text-sm text-[#52627a]">{en?'Invite this customer to a job so they can follow it from their account.':'Invite a este cliente a un trabajo para que lo siga desde su cuenta.'}</p>
  {failed&&<div role="alert" className="space-y-2"><p className="text-sm">{en?'Could not load the jobs.':'No se pudieron cargar los trabajos.'}</p><Button type="button" variant="secondary" onClick={()=>void load()}>{en?'Retry':'Reintentar'}</Button></div>}
  {items&&items.length===0&&<p className="text-sm text-[#68778d]">{en?'This customer has no jobs yet.':'Este cliente todavía no tiene trabajos.'}</p>}
  {items?.map(item=><div key={item.workId} data-client-work-access-item={item.workId} className="space-y-2 rounded-xl border border-[#e5e7eb] p-3"><p className="font-semibold [overflow-wrap:anywhere]">{item.service}</p>
   <p className="text-sm text-[#52627a]">{item.linked?(en?`Linked customer: ${item.linked.name}`:`Cliente vinculado: ${item.linked.name}`):item.cancelled?(en?'Cancelled job':'Trabajo cancelado'):(en?'No linked account':'Sin cuenta vinculada')}</p>
   {open===item.workId?<WorkClientInvite workId={item.workId} compact/>:!item.cancelled&&<Button type="button" variant="outline" onClick={()=>setOpen(item.workId)}>{item.linked?(en?'Manage access':'Gestionar acceso'):(en?'Invite customer to the job':'Invitar al cliente al proyecto')}</Button>}</div>)}
 </section>;
}
