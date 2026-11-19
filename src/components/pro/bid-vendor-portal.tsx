'use client';

import {useCallback,useEffect,useRef,useState,type FormEvent,type ReactNode} from 'react';
import {useLocale} from 'next-intl';
import {ContrataCRLogo} from '@/components/brand/brand-logo';
import {Button} from '@/components/ui/button';
import {inputCents} from '@/lib/pro/client-operations';
import {proMoney} from '@/lib/pro/money';
import {useReveal} from './use-reveal';
import {BID_PORTAL_FILE_MAX_BYTES,BID_PORTAL_LINK_PARAM,bidPortalViewSchema,type BidPortalFile,type BidPortalView} from '@/lib/pro/bid-portal';

/**
 * Public vendor page of a bid invitation (row 53). Opens with a single-use link whose token
 * travels in the URL fragment; it is removed from the address bar right away and exchanged
 * for a vendor session cookie (one per link). The address keeps only the link id
 * (?invitacion=…, not secret) so a reload opens the same invitation. The vendor only sees its
 * invitation and the offer it sent itself.
 */
const api='/api/pro/bid-portal',field='mt-1 block min-h-11 w-full min-w-0 rounded-xl border border-[#d7e1ea] bg-white px-3 text-base font-normal text-[#162543]';
type Draft={prices:Record<string,string>;lead:string;valid:string;notes:string};
type Pending={actionId:string;body:string};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
let memoryDevice='';
/** Random id of this browser (not secret on its own): lets it re-claim its link within 2 minutes if the reply was lost. */
function deviceId(){
 const fresh=()=>{const bytes=crypto.getRandomValues(new Uint8Array(32));return btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');};
 try{const saved=window.localStorage.getItem('ccr-bid-portal-device');if(saved&&/^[A-Za-z0-9_-]{43}$/.test(saved))return saved;const next=fresh();window.localStorage.setItem('ccr-bid-portal-device',next);return next;}
 catch{memoryDevice||=fresh();return memoryDevice;}
}
function linkFromAddress(){try{const value=new URLSearchParams(window.location.search).get(BID_PORTAL_LINK_PARAM);return value&&uuid.test(value)?value.toLowerCase():null;}catch{return null;}}
function copy(en:boolean){
 return en?{
  title:'Bid invitation',opening:'Opening the invitation…',loading:'Loading the invitation…',from:(name:string)=>`Invitation from ${name}`,to:(name:string)=>`For: ${name}`,
  due:'Offers until',noDue:'No date',status:{draft:'Not open yet',open:'Open for offers',closed:'Closed',awarded:'Closed',cancelled:'Cancelled'},
  intro:'Enter your unit price (₡, before tax) for each item you quote. Leave an item empty if you do not quote it. You can update your offer until the bid closes.',
  item:'Item',quantity:'Quantity',unitPrice:(unit:string)=>`Unit price ₡ per ${unit}`,lineTotal:'Line total',notQuoted:'Not quoted',total:'Offer total (before tax)',
  lead:'Lead time in days (optional)',valid:'Offer valid until (optional)',notes:'Notes (optional)',send:'Send offer',update:'Update offer',sending:'Sending…',
  sent:(day:string)=>`Offer received on ${day}. The professional sees it in ContrataCR Pro. Nothing is charged.`,yourOffer:'Your current offer',sentCount:(n:number)=>n===1?'Sent once from this link.':`Sent ${n} times from this link.`,
  closedHelp:'This bid no longer accepts offers. Your last offer is kept.',draftHelp:'The bid is not open yet. Try again later.',
  invalid:'Check the prices: use up to two decimals, and quote at least one item.',invalidDate:'Use a validity date from today on.',
  errors:{session:'This invitation is not available. Ask the professional for a new link.',used:'This link was already used. If it was not you, ask the professional for a new link.',expired:'This link expired. Ask the professional for a new one.',revoked:'This link was cancelled. Ask the professional for a new one.',unknown:'This link is not valid. Check that you copied it whole.',unavailable:'Could not load the invitation. Try again.',changed:'Your offer changed in another window. Refresh before sending again.',closed:'The bid has closed; offers are no longer accepted.',invalid:'Check the prices and offer details.',uncertain:'Could not confirm the offer. Retry: the same offer is not duplicated.',limit:'This link reached its maximum number of offers. Ask the professional for a new link.',busy:'Too many attempts. Wait a minute and retry: the same offer is not duplicated.'},
  files:'Attachments (optional)',filesHelp:'Add your quote, data sheets or photos: PDF up to 20 MB, or JPG, PNG or WebP photos (PNG and WebP are saved as JPG). Only the professional who invited you sees them.',
  addFile:'Add attachment',uploading:'Uploading…',noFiles:'No attachments yet.',download:'Download',removeFile:'Remove',fileAdded:'Attachment added.',fileRemoved:'Attachment removed.',
  fileTooLarge:'The file is larger than 20 MB.',fileInvalid:'Use a PDF up to 20 MB or a JPG, PNG or WebP photo.',fileLimit:'You reached the maximum of 10 attachments. Remove one first.',fileClosed:'The bid has closed; attachments can no longer be added or removed.',fileUncertain:'Could not confirm the attachment. Retry: the same file is not duplicated.',retryFile:'Retry attachment',
  filesClosed:'The bid no longer accepts attachments. Your files are kept.',
  outcome:{won:'You were awarded this bid.',partial:(n:number,total:number)=>`You were awarded ${n} of ${total} items.`,not_selected:'Your offer was not selected this time. Thank you for taking part.',cancelled:'The professional cancelled this bid.'},
  awardTotal:'Awarded total (before tax)',awardNote:'The professional will contact you to coordinate. ContrataCR sends no e-mail or payment.',
  retry:'Retry',refresh:'Reload request',privacy:'Private invitation. Do not share this page. No e-mail or payment is processed here.',
 }:{
  title:'Invitación a licitar',opening:'Abriendo la invitación…',loading:'Cargando la invitación…',from:(name:string)=>`Invitación de ${name}`,to:(name:string)=>`Para: ${name}`,
  due:'Ofertas hasta',noDue:'Sin fecha',status:{draft:'Todavía no abierta',open:'Abierta a ofertas',closed:'Cerrada',awarded:'Cerrada',cancelled:'Cancelada'},
  intro:'Indique su precio unitario (₡, sin impuestos) para cada partida que cotice. Deje vacía la partida que no cotiza. Puede actualizar su oferta hasta el cierre.',
  item:'Partida',quantity:'Cantidad',unitPrice:(unit:string)=>`Precio unitario ₡ por ${unit}`,lineTotal:'Total de la partida',notQuoted:'Sin cotizar',total:'Total de la oferta (sin impuestos)',
  lead:'Plazo de entrega en días (opcional)',valid:'Oferta válida hasta (opcional)',notes:'Notas (opcional)',send:'Enviar oferta',update:'Actualizar oferta',sending:'Enviando…',
  sent:(day:string)=>`Oferta recibida el ${day}. El profesional la ve en ContrataCR Pro. No se cobra nada.`,yourOffer:'Su oferta actual',sentCount:(n:number)=>n===1?'Enviada una vez desde este enlace.':`Enviada ${n} veces desde este enlace.`,
  closedHelp:'Esta licitación ya no recibe ofertas. Se conserva su última oferta.',draftHelp:'La licitación todavía no está abierta. Vuelva a intentarlo más tarde.',
  invalid:'Revise los precios: use hasta dos decimales y cotice al menos una partida.',invalidDate:'Use una fecha de validez desde hoy.',
  errors:{session:'Esta invitación no está disponible. Pida un enlace nuevo al profesional.',used:'Este enlace ya se usó. Si no fue usted, pida un enlace nuevo al profesional.',expired:'Este enlace venció. Pida uno nuevo al profesional.',revoked:'Este enlace se anuló. Pida uno nuevo al profesional.',unknown:'Este enlace no es válido. Revise que lo copió completo.',unavailable:'No se pudo cargar la invitación. Reintente.',changed:'Su oferta cambió en otra ventana. Actualice antes de enviar de nuevo.',closed:'La licitación ya cerró; no se aceptan más ofertas.',invalid:'Revise los precios y los datos de la oferta.',uncertain:'No se pudo confirmar la oferta. Reintente: la misma oferta no se duplica.',limit:'Este enlace alcanzó el máximo de envíos. Pida un enlace nuevo al profesional.',busy:'Demasiados intentos. Espere un minuto y reintente: la misma oferta no se duplica.'},
  files:'Adjuntos (opcional)',filesHelp:'Agregue su cotización, fichas técnicas o fotos: PDF de hasta 20 MB, o fotos JPG, PNG o WebP (PNG y WebP se guardan como JPG). Solo los ve el profesional que lo invitó.',
  addFile:'Agregar adjunto',uploading:'Subiendo…',noFiles:'Todavía no hay adjuntos.',download:'Descargar',removeFile:'Quitar',fileAdded:'Adjunto agregado.',fileRemoved:'Adjunto quitado.',
  fileTooLarge:'El archivo pesa más de 20 MB.',fileInvalid:'Use un PDF de hasta 20 MB o una foto JPG, PNG o WebP.',fileLimit:'Llegó al máximo de 10 adjuntos. Quite uno primero.',fileClosed:'La licitación ya cerró; ya no se pueden agregar ni quitar adjuntos.',fileUncertain:'No se pudo confirmar el adjunto. Reintente: el mismo archivo no se duplica.',retryFile:'Reintentar adjunto',
  filesClosed:'La licitación ya no recibe adjuntos. Sus archivos se conservan.',
  outcome:{won:'Se le adjudicó esta licitación.',partial:(n:number,total:number)=>`Se le adjudicaron ${n} de ${total} partidas.`,not_selected:'Esta vez su oferta no fue seleccionada. Gracias por participar.',cancelled:'El profesional canceló esta licitación.'},
  awardTotal:'Total adjudicado (sin impuestos)',awardNote:'El profesional se pondrá en contacto para coordinar. ContrataCR no envía correos ni procesa pagos.',
  retry:'Reintentar',refresh:'Recargar solicitud',privacy:'Invitación privada. No comparta esta página. Aquí no se envían correos ni se procesan pagos.',
 };
}
type Copy=ReturnType<typeof copy>;
type Reason=keyof Copy['errors'];
const decimal=(cents:number,en:boolean)=>{const value=cents%100===0?String(cents/100):(cents/100).toFixed(2);return en?value:value.replace('.',',');};
const quantity=(value:number,en:boolean)=>new Intl.NumberFormat(en?'en-US':'es-CR',{maximumFractionDigits:3}).format(value);
const day=(value:string,en:boolean)=>new Intl.DateTimeFormat(en?'en-US':'es-CR',{dateStyle:'long',timeZone:'UTC'}).format(new Date(value+'T12:00:00Z'));
const size=(bytes:number,en:boolean)=>bytes<1024*1024?`${Math.max(1,Math.round(bytes/1024))} KB`:`${new Intl.NumberFormat(en?'en-US':'es-CR',{maximumFractionDigits:1}).format(bytes/1024/1024)} MB`;
function base64(file:File){return new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onerror=()=>reject(reader.error);reader.onload=()=>{const value=String(reader.result??'');const comma=value.indexOf(',');if(comma<0)reject(Error('read'));else resolve(value.slice(comma+1));};reader.readAsDataURL(file);});}
function draftOf(view:BidPortalView,en:boolean):Draft{
 const prices:Record<string,string>={};for(const line of view.package.lines){const price=view.offer?.prices.find(p=>p.lineId===line.id);prices[line.id]=price?decimal(price.unitCents,en):'';}
 return {prices,lead:view.offer?.leadDays==null?'':String(view.offer.leadDays),valid:view.offer?.validUntil??'',notes:view.offer?.notes??''};
}

export function BidVendorPortal(){
 const en=useLocale()==='en',c=copy(en);
 const [view,setView]=useState<BidPortalView|null>(null),[phase,setPhase]=useState<'opening'|'loading'|'ready'|'error'>('loading'),[reason,setReason]=useState<Reason|null>(null);
 const [draft,setDraft]=useState<Draft|null>(null),[saving,setSaving]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[uncertain,setUncertain]=useState(false);
 const errorRef=useReveal<HTMLParagraphElement>(error),noticeRef=useReveal<HTMLParagraphElement>(notice);
 const [fileBusy,setFileBusy]=useState(false),[fileError,setFileError]=useState(''),[fileNotice,setFileNotice]=useState(''),[pendingFile,setPendingFile]=useState<string|null>(null),[viewLink,setViewLink]=useState<string|null>(null);
 const fileErrorRef=useReveal<HTMLParagraphElement>(fileError),fileNoticeRef=useReveal<HTMLParagraphElement>(fileNotice);
 const pending=useRef<Pending|null>(null),link=useRef<string|null>(null),claimToken=useRef<string|null>(null);
 const load=useCallback(async(keepNotice=false)=>{
  setPhase(current=>current==='opening'?current:'loading');
  try{
   const response=await fetch(api+(link.current?'?'+new URLSearchParams({link:link.current}):''),{cache:'no-store',credentials:'same-origin'});
   if(!response.ok){const body=await response.json().catch(()=>({}));setReason((body.reason as Reason)||'unavailable');setPhase('error');return false;}
   const body=bidPortalViewSchema.parse(await response.json());setViewLink(link.current);setView(body);setDraft(draftOf(body,en));setReason(null);setPhase('ready');if(!keepNotice)setNotice('');return true;
  }catch{setReason('unavailable');setPhase('error');return false;}
 },[en]);
 const claim=useCallback(async(token:string)=>{
  setPhase('opening');pending.current=null;setUncertain(false);setError('');setNotice('');
  let claimReason:Reason|null=null,claimed:string|null=null;
  try{
   const response=await fetch(api,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'claim',token,device:deviceId()})});
   const body=await response.json().catch(()=>({}));
   if(!response.ok)claimReason=(body.reason as Reason)||'unavailable';
   // The server names the link when it opened, or when this browser already holds its session (reopened link).
   claimed=typeof body.link==='string'&&uuid.test(body.link)?body.link.toLowerCase():null;
  }catch{claimReason='unavailable';}
  if(claimed){
   claimToken.current=null;link.current=claimed;
   window.history.replaceState(window.history.state,'',window.location.pathname+'?'+new URLSearchParams({[BID_PORTAL_LINK_PARAM]:claimed}));
   const opened=await load();if(!opened&&claimReason){setReason(claimReason);setPhase('error');}
   return;
  }
  // Uncertain reply: keep the token in memory only, so «Retry» claims again from this browser.
  claimToken.current=claimReason==='unavailable'?token:null;
  setReason(claimReason??'unavailable');setPhase('error');
 },[load,setPhase,setUncertain,setError,setNotice,setReason]);
 useEffect(()=>{
  // Strict mode mounts twice: the first timer is cleared before it runs, so the link is claimed once.
  let timer:ReturnType<typeof setTimeout>|undefined;
  const open=()=>{
   clearTimeout(timer);
   const match=/(?:^#|&)acceso=([A-Za-z0-9_-]{43})(?:&|$)/.exec(window.location.hash);
   timer=setTimeout(async()=>{
    if(!match){link.current=linkFromAddress();await load();return;}
    // Drop the token from the address bar and history before using it.
    window.history.replaceState(window.history.state,'',window.location.pathname);
    await claim(match[1]!);
   },0);
  };
  open();
  // A new link pasted into the same tab only changes the fragment.
  window.addEventListener('hashchange',open);
  return()=>{clearTimeout(timer);window.removeEventListener('hashchange',open);};
 },[load,claim]);
 const canSend=view?.package.status==='open';
 const totals=view&&draft?view.package.lines.map(line=>{const raw=draft.prices[line.id]?.trim()??'',cents=raw?inputCents(raw):null;return {line,raw,cents,total:cents==null?null:Math.round(line.quantity*cents)};}):[];
 const offerTotal=totals.reduce((sum,row)=>sum+(row.total??0),0);
 async function post(body:string,actionId:string){
  if(saving)return;setSaving(true);setError('');setNotice('');pending.current={actionId,body};
  try{
   const response=await fetch(api,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body});
   if(response.status>=500){setUncertain(true);setError(c.errors.uncertain);return;}
   const data=await response.json().catch(()=>({}));
   // Rate limited before it was processed: the same offer can be retried as is.
   if(response.status===429&&data.reason!=='limit'){setUncertain(true);setError(c.errors.busy);return;}
   if(!response.ok){pending.current=null;setUncertain(false);const why=(data.reason as Reason)||'invalid';setError(c.errors[why]??c.errors.invalid);if(why==='session'){setReason('session');setPhase('error');}return;}
   pending.current=null;setUncertain(false);await load(true);setNotice(c.sent(day(data.submittedOn,en)));
  }catch{setUncertain(true);setError(c.errors.uncertain);}
  finally{setSaving(false);}
 }
 async function sendFile(body:string){
  setFileBusy(true);setFileError('');setFileNotice('');setPendingFile(body);
  try{
   const response=await fetch(api+'/files',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body});
   const data=await response.json().catch(()=>({}));
   if(response.status>=500||response.status===429&&data.reason!=='limit'){setFileError(c.fileUncertain);return;}
   setPendingFile(null);
   if(!response.ok){const why=data.reason as string;setFileError(why==='limit'?c.fileLimit:why==='closed'?c.fileClosed:why==='session'?c.errors.session:c.fileInvalid);if(why==='session'){setReason('session');setPhase('error');}else await load(true);return;}
   const removed=JSON.parse(body).action==='remove';await load(true);setFileNotice(removed?c.fileRemoved:c.fileAdded);
  }catch{setFileError(c.fileUncertain);}
  finally{setFileBusy(false);}
 }
 async function addFile(file:File|undefined){
  if(!file||fileBusy||!view?.attachments.canAttach)return;
  if(file.size>BID_PORTAL_FILE_MAX_BYTES){setFileNotice('');setFileError(c.fileTooLarge);return;}
  let data:string;try{data=await base64(file);}catch{setFileError(c.fileInvalid);return;}
  void sendFile(JSON.stringify({action:'upload',link:link.current??undefined,fileId:crypto.randomUUID(),name:file.name.slice(0,160)||'archivo',data}));
 }
 function removeFile(file:BidPortalFile){if(fileBusy||!view?.attachments.canAttach)return;void sendFile(JSON.stringify({action:'remove',link:link.current??undefined,fileId:file.id}));}
 const fileHref=(file:BidPortalFile)=>api+'/files?'+new URLSearchParams({fileId:file.id,...viewLink?{link:viewLink}:{}});
 function submit(event:FormEvent){
  event.preventDefault();if(!view||!draft||!canSend||saving)return;
  if(pending.current){void post(pending.current.body,pending.current.actionId);return;}
  const prices=totals.filter(row=>row.raw!=='').map(row=>({lineId:row.line.id,unitCents:row.cents}));
  if(!prices.length||prices.some(p=>p.unitCents==null)){setError(c.invalid);return;}
  const lead=draft.lead.trim();if(lead&&!/^\d{1,4}$/.test(lead)){setError(c.invalid);return;}
  if(draft.valid&&draft.valid<view.today){setError(c.invalidDate);return;}
  const actionId=crypto.randomUUID();
  void post(JSON.stringify({action:'submit',link:link.current??undefined,actionId,revision:view.revision,leadDays:lead?Number(lead):null,validUntil:draft.valid||null,notes:draft.notes.trim()||null,prices}),actionId);
 }
 function edit(next:Draft){setDraft(next);setError('');pending.current=null;setUncertain(false);}
 const shell=(children:ReactNode)=><main data-bid-portal className="mx-auto min-h-screen w-full max-w-3xl space-y-5 bg-white px-4 py-6 text-[#162543] sm:px-6">
  <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e5e7eb] pb-4"><ContrataCRLogo/><p className="text-sm font-semibold text-[#52627a]">{c.title}</p></header>
  {children}
  <p className="text-xs text-[#52627a]">{c.privacy}</p>
 </main>;
 if(phase==='opening'||phase==='loading'&&!view)return shell(<p role="status" className="text-sm text-[#52627a]">{phase==='opening'?c.opening:c.loading}</p>);
 if(phase==='error'||!view||!draft)return shell(<div role="alert" data-bid-portal-error={reason??'unavailable'} className="space-y-3 rounded-2xl border border-[#f2c9c9] bg-[#fdf0f0] p-4 text-sm text-[#9b2c2c]"><p>{c.errors[reason??'unavailable']}</p>{(reason==='unavailable'||!reason)&&<Button type="button" variant="secondary" className="min-h-11" onClick={()=>{const token=claimToken.current;void(token?claim(token):load());}}>{c.retry}</Button>}</div>);
 const pkg=view.package,status=pkg.status;
 return shell(<>
  <section className="min-w-0 space-y-2 rounded-2xl border border-[#d7e1ea] bg-[#f7f9fc] p-4">
   {view.business&&<p className="break-words text-sm font-semibold text-[#52627a]">{c.from(view.business)}</p>}
   <div className="flex flex-wrap items-center gap-2"><span className="text-sm font-semibold text-[#52627a]">{pkg.code}</span><span data-bid-portal-status={status} className="inline-flex min-h-7 items-center rounded-full border border-[#d7e1ea] bg-white px-2.5 text-xs font-semibold">{c.status[status]}</span></div>
   <h1 className="break-words text-xl font-bold">{pkg.title}</h1>
   <p className="text-sm">{c.to(view.vendor)}</p>
   <p className="text-sm text-[#52627a]">{c.due}: {pkg.dueDate?day(pkg.dueDate,en):c.noDue}</p>
   {pkg.scope&&<p className="whitespace-pre-line break-words text-sm">{pkg.scope}</p>}
  </section>
  {status==='draft'&&<p role="status" className="text-sm">{c.draftHelp}</p>}
  {(status==='closed'||status==='awarded'||status==='cancelled')&&<p role="status" data-bid-portal-closed className="rounded-xl bg-[#fff8e6] p-3 text-sm">{c.closedHelp}</p>}
  {view.attachments.outcome&&<section role="status" data-bid-portal-outcome={view.attachments.outcome.status} className={'min-w-0 space-y-2 rounded-2xl border p-4 text-sm '+(view.attachments.outcome.status==='won'||view.attachments.outcome.status==='partial'?'border-[#9fd8bd] bg-[#eef8f4] text-[#18573a]':'border-[#d7e1ea] bg-[#f7f9fc]')}>
   <p className="font-semibold">{view.attachments.outcome.status==='partial'?c.outcome.partial(view.attachments.outcome.lineCount,view.attachments.outcome.totalLineCount):c.outcome[view.attachments.outcome.status]}</p>
   {view.attachments.outcome.lines.length>0&&view.attachments.outcome.status==='partial'&&<ul className="space-y-1">{view.attachments.outcome.lines.map(line=><li key={line.lineId} className="flex flex-wrap justify-between gap-2"><span className="min-w-0 break-words">{line.position}. {line.description}</span><strong>{proMoney(line.totalCents/100)}</strong></li>)}</ul>}
   {view.attachments.outcome.wonCents!=null&&<p>{c.awardTotal}: <strong data-bid-portal-outcome-total>{proMoney(view.attachments.outcome.wonCents/100)}</strong></p>}
   {(view.attachments.outcome.status==='won'||view.attachments.outcome.status==='partial')&&<p className="text-xs">{c.awardNote}</p>}
  </section>}
  {view.offer&&<p className="text-sm text-[#52627a]">{c.yourOffer}: {proMoney(view.offer.prices.reduce((s,p)=>s+p.totalCents,0)/100)} · {c.sentCount(view.submissions)}</p>}
  <form className="min-w-0 space-y-4" onSubmit={submit} noValidate>
   <p className="text-sm">{c.intro}</p>
   <ol className="space-y-3">{totals.map(({line,raw,cents,total})=><li key={line.id} data-bid-portal-line={line.position} className="min-w-0 rounded-2xl border border-[#d7e1ea] p-4">
    <p className="break-words font-semibold">{line.position}. {line.description}</p>
    <p className="text-sm text-[#52627a]">{c.quantity}: {quantity(line.quantity,en)} {line.unit}</p>
    <div className="mt-2 grid gap-3 sm:grid-cols-2 sm:items-end">
     <label className="block min-w-0 text-sm font-semibold">{c.unitPrice(line.unit)}<input className={field} inputMode="decimal" autoComplete="off" value={raw} disabled={!canSend||saving} aria-invalid={raw!==''&&cents==null} onChange={event=>edit({...draft,prices:{...draft.prices,[line.id]:event.target.value}})}/></label>
     <p className="text-sm"><span className="text-[#52627a]">{c.lineTotal}: </span><strong data-bid-portal-line-total>{total==null?c.notQuoted:proMoney(total/100)}</strong></p>
    </div>
   </li>)}</ol>
   <p className="text-base"><span className="text-[#52627a]">{c.total}: </span><strong data-bid-portal-total>{proMoney(offerTotal/100)}</strong></p>
   <div className="grid gap-3 sm:grid-cols-2">
    <label className="block min-w-0 text-sm font-semibold">{c.lead}<input className={field} inputMode="numeric" value={draft.lead} disabled={!canSend||saving} onChange={event=>edit({...draft,lead:event.target.value})}/></label>
    <label className="block min-w-0 text-sm font-semibold">{c.valid}<input className={field+' appearance-none'} type="date" min={view.today} value={draft.valid} disabled={!canSend||saving} onChange={event=>edit({...draft,valid:event.target.value})}/></label>
   </div>
   <label className="block min-w-0 text-sm font-semibold">{c.notes}<textarea className={field+' min-h-24 py-2'} maxLength={2000} value={draft.notes} disabled={!canSend||saving} onChange={event=>edit({...draft,notes:event.target.value})}/></label>
   {notice&&<p ref={noticeRef} role="status" data-bid-portal-notice className="rounded-xl bg-[#eef8f4] p-3 text-sm text-[#18573a]">{notice}</p>}
   {error&&<p ref={errorRef} role="alert" data-bid-portal-form-error className="rounded-xl bg-[#fff4f2] p-3 text-sm text-[#8a2a1b]">{error}</p>}
   <div className="flex flex-col gap-2 sm:flex-row">
    {canSend&&<Button type="submit" className="min-h-11" disabled={saving}>{saving?c.sending:uncertain?c.retry:view.offer?c.update:c.send}</Button>}
    <Button type="button" variant="secondary" className="min-h-11" disabled={saving} onClick={()=>{pending.current=null;setUncertain(false);setError('');void load();}}>{c.refresh}</Button>
   </div>
  </form>
  <section data-bid-portal-files className="min-w-0 space-y-3 rounded-2xl border border-[#d7e1ea] p-4">
   <h2 className="text-base font-semibold">{c.files}</h2>
   <p className="text-sm text-[#52627a]">{view.attachments.canAttach?c.filesHelp:c.filesClosed}</p>
   {view.attachments.files.length===0?<p className="text-sm text-[#52627a]">{c.noFiles}</p>:<ul className="space-y-2">{view.attachments.files.map(file=><li key={file.id} data-bid-portal-file={file.name} className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-xl border border-[#e5e7eb] p-3">
    <span className="min-w-0 break-all text-sm"><span className="font-semibold">{file.name}</span> <span className="text-[#52627a]">· {file.mimeType==='application/pdf'?'PDF':'JPG'} · {size(file.sizeBytes,en)}</span></span>
    <span className="flex flex-wrap gap-2"><a href={fileHref(file)} download className="inline-flex min-h-11 items-center rounded-full border border-[#d7e1ea] bg-white px-4 text-sm font-semibold text-[#162543] hover:bg-[#f6f9fb]" aria-label={`${c.download}: ${file.name}`}>{c.download}</a>
     {view.attachments.canAttach&&<Button type="button" variant="ghost" className="min-h-11" disabled={fileBusy} aria-label={`${c.removeFile}: ${file.name}`} onClick={()=>removeFile(file)}>{c.removeFile}</Button>}</span>
   </li>)}</ul>}
   {view.attachments.canAttach&&view.attachments.files.length<10&&<label data-bid-portal-file-picker className="relative inline-flex min-h-11 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-[#d7e1ea] bg-white px-4 text-sm font-semibold text-[#162543] focus-within:ring-2 focus-within:ring-[#009FD9] focus-within:ring-offset-2 hover:bg-[#f6f9fb]">{fileBusy?c.uploading:c.addFile}
    {/* The real file control covers the whole 44 px target, border included (not a 1 px visually hidden input). */}
    <input type="file" aria-label={c.addFile} className="absolute -left-px -top-px h-[calc(100%+2px)] w-[calc(100%+2px)] cursor-pointer opacity-0 disabled:cursor-not-allowed" accept="application/pdf,image/jpeg,image/png,image/webp" disabled={fileBusy} onChange={event=>{const picked=event.target.files?.[0];event.target.value='';void addFile(picked);}}/></label>}
   {fileNotice&&<p ref={fileNoticeRef} role="status" data-bid-portal-file-notice className="rounded-xl bg-[#eef8f4] p-3 text-sm text-[#18573a]">{fileNotice}</p>}
   {fileError&&<div className="space-y-2"><p ref={fileErrorRef} role="alert" data-bid-portal-file-error className="rounded-xl bg-[#fff4f2] p-3 text-sm text-[#8a2a1b]">{fileError}</p>{pendingFile&&<Button type="button" variant="secondary" className="min-h-11" disabled={fileBusy} onClick={()=>{if(pendingFile)void sendFile(pendingFile);}}>{c.retryFile}</Button>}</div>}
  </section>
 </>);
}
