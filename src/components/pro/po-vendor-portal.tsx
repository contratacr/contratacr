'use client';

import {useCallback,useEffect,useRef,useState,type FormEvent,type ReactNode} from 'react';
import {useLocale} from 'next-intl';
import {ContrataCRLogo} from '@/components/brand/brand-logo';
import {Button} from '@/components/ui/button';
import {proMoney} from '@/lib/pro/money';
import {useReveal} from './use-reveal';
import {PO_PORTAL_LINK_PARAM,poVendorViewSchema,type PoVendorView} from '@/lib/pro/po-portal';

/**
 * Public vendor page of a purchase order link (row 51). The vendor has NO ContrataCR account: the single-use link token travels in the URL fragment, is removed
 * from the address bar right away and exchanged for a session cookie (one per link). The vendor only sees its own order (no internal notes or budget) and
 * confirms, declines or proposes a delivery date. Each answer carries an actionId, so a retry after a lost reply is never counted twice.
 */
const api='/api/pro/po-portal',field='mt-1 block min-h-11 w-full min-w-0 rounded-xl border border-[#d7e1ea] bg-white px-3 text-base font-normal text-[#162543]';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
let memoryDevice='';
function deviceId(){
 const fresh=()=>{const bytes=crypto.getRandomValues(new Uint8Array(32));return btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');};
 try{const saved=window.localStorage.getItem('ccr-po-portal-device');if(saved&&/^[A-Za-z0-9_-]{43}$/.test(saved))return saved;const next=fresh();window.localStorage.setItem('ccr-po-portal-device',next);return next;}
 catch{memoryDevice||=fresh();return memoryDevice;}
}
function linkFromAddress(){try{const value=new URLSearchParams(window.location.search).get(PO_PORTAL_LINK_PARAM);return value&&uuid.test(value)?value.toLowerCase():null;}catch{return null;}}
function copy(en:boolean){
 return en?{
  title:'Purchase order',opening:'Opening the order…',loading:'Loading the order…',from:(name:string)=>`Order from ${name}`,to:(name:string)=>`For: ${name}`,
  status:{draft:'Not issued yet',issued:'Issued',partial:'Partially received',received:'Received',cancelled:'Cancelled'} as Record<string,string>,
  issueDate:'Issue date',expected:'Expected delivery',address:'Delivery address',payTerms:'Payment terms',item:'Item',quantity:'Quantity',unitCost:'Unit cost',lineTotal:'Total',subtotal:'Subtotal',tax:'Tax',total:'Order total',
  intro:'Confirm the order, decline it, or propose another delivery date. You can answer again if you change your mind while the order is open.',
  confirm:'Confirm order',decline:'Decline order',propose:'Propose a delivery date',proposedDate:'Proposed delivery date',note:'Note (optional)',send:'Send',sending:'Sending…',
  answer:{confirm:'You confirmed this order.',decline:'You declined this order.',propose_date:'You proposed a delivery date.'} as Record<string,string>,answeredAt:'Answer sent',proposed:'Proposed date',
  stale:'The professional changed the order after your answer. Review it and answer again.',closed:'This order no longer accepts answers.',
  sent:'Answer received. The professional sees it in ContrataCR Pro. Nothing is charged.',
  invalidDate:'Choose a delivery date from today on.',invalid:'Review your answer and try again.',
  errors:{session:'This order is not available. Ask the professional for a new link.',used:'This link was already used. If it was not you, ask the professional for a new link.',expired:'This link expired. Ask the professional for a new one.',revoked:'This link was cancelled. Ask the professional for a new one.',unknown:'This link is not valid. Ask the professional for a new one.',unavailable:'Could not open the order. Check your connection and retry.',
   changed:'The order changed. It was reloaded; review it and answer again.',closed:'The order no longer accepts answers.',limit:'The maximum number of answers of this link was reached. Ask the professional for a new link.',uncertain:'We could not confirm the answer. Retry: it will not be counted twice.',busy:'Too many attempts. Wait a minute and retry.',invalid:'Review your answer and try again.'} as Record<string,string>,
  retry:'Retry',refresh:'Reload order',privacy:'Private link. Do not share this page. No e-mail or payment is processed here.',
 }:{
  title:'Orden de compra',opening:'Abriendo la orden…',loading:'Cargando la orden…',from:(name:string)=>`Orden de ${name}`,to:(name:string)=>`Para: ${name}`,
  status:{draft:'Todavía no emitida',issued:'Emitida',partial:'Recibida en parte',received:'Recibida',cancelled:'Cancelada'} as Record<string,string>,
  issueDate:'Fecha de emisión',expected:'Entrega esperada',address:'Dirección de entrega',payTerms:'Condiciones de pago',item:'Partida',quantity:'Cantidad',unitCost:'Costo unitario',lineTotal:'Total',subtotal:'Subtotal',tax:'Impuesto',total:'Total de la orden',
  intro:'Confirme la orden, rechácela o proponga otra fecha de entrega. Puede responder de nuevo si cambia de idea mientras la orden esté abierta.',
  confirm:'Confirmar orden',decline:'Rechazar orden',propose:'Proponer fecha de entrega',proposedDate:'Fecha de entrega propuesta',note:'Nota (opcional)',send:'Enviar',sending:'Enviando…',
  answer:{confirm:'Usted confirmó esta orden.',decline:'Usted rechazó esta orden.',propose_date:'Usted propuso una fecha de entrega.'} as Record<string,string>,answeredAt:'Respuesta enviada',proposed:'Fecha propuesta',
  stale:'El profesional cambió la orden después de su respuesta. Revísela y responda de nuevo.',closed:'Esta orden ya no recibe respuestas.',
  sent:'Respuesta recibida. El profesional la ve en ContrataCR Pro. No se cobra nada.',
  invalidDate:'Elija una fecha de entrega desde hoy.',invalid:'Revise su respuesta e intente de nuevo.',
  errors:{session:'Esta orden no está disponible. Pida un enlace nuevo al profesional.',used:'Este enlace ya se usó. Si no fue usted, pida un enlace nuevo al profesional.',expired:'Este enlace venció. Pida uno nuevo al profesional.',revoked:'Este enlace se anuló. Pida uno nuevo al profesional.',unknown:'Este enlace no es válido. Pida uno nuevo al profesional.',unavailable:'No se pudo abrir la orden. Revise su conexión y reintente.',
   changed:'La orden cambió. Ya se recargó; revísela y responda de nuevo.',closed:'La orden ya no recibe respuestas.',limit:'Se alcanzó el máximo de respuestas de este enlace. Pida un enlace nuevo al profesional.',uncertain:'No pudimos confirmar la respuesta. Reintente: no se contará dos veces.',busy:'Demasiados intentos. Espere un minuto y reintente.',invalid:'Revise su respuesta e intente de nuevo.'} as Record<string,string>,
  retry:'Reintentar',refresh:'Recargar orden',privacy:'Enlace privado. No comparta esta página. Aquí no se envían correos ni se procesan pagos.',
 };
}
const day=(value:string,en:boolean)=>new Intl.DateTimeFormat(en?'en-US':'es-CR',{dateStyle:'long',timeZone:'UTC'}).format(new Date(value+'T12:00:00Z'));
const stamp=(value:string,en:boolean)=>new Intl.DateTimeFormat(en?'en-US':'es-CR',{dateStyle:'medium',timeStyle:'short',timeZone:'America/Costa_Rica'}).format(new Date(value));
const quantity=(value:number,en:boolean)=>new Intl.NumberFormat(en?'en-US':'es-CR',{maximumFractionDigits:3}).format(value);
type Pending={actionId:string;body:string};
type Choice='confirm'|'decline'|'propose_date';

export function PoVendorPortal(){
 const en=useLocale()==='en',c=copy(en);
 const [view,setView]=useState<PoVendorView|null>(null),[phase,setPhase]=useState<'opening'|'loading'|'ready'|'error'>('loading'),[reason,setReason]=useState('unavailable');
 const [choice,setChoice]=useState<Choice>('confirm'),[date,setDate]=useState(''),[note,setNote]=useState(''),[saving,setSaving]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[uncertain,setUncertain]=useState(false);
 const errorRef=useReveal<HTMLParagraphElement>(error),noticeRef=useReveal<HTMLParagraphElement>(notice);
 const pending=useRef<Pending|null>(null),link=useRef<string|null>(null),claimToken=useRef<string|null>(null);
 const load=useCallback(async(keepNotice=false)=>{
  setPhase(current=>current==='opening'?current:'loading');
  try{
   const response=await fetch(api+(link.current?'?'+new URLSearchParams({link:link.current}):''),{cache:'no-store',credentials:'same-origin'});
   if(!response.ok){const body=await response.json().catch(()=>({}));setReason((body.reason as string)||'unavailable');setPhase('error');return false;}
   const body=poVendorViewSchema.parse(await response.json());setView(body);setReason('unavailable');setPhase('ready');if(!keepNotice)setNotice('');return true;
  }catch{setReason('unavailable');setPhase('error');return false;}
 },[]);
 const claim=useCallback(async(token:string)=>{
  setPhase('opening');pending.current=null;setUncertain(false);setError('');setNotice('');
  let claimReason:string|null=null,claimed:string|null=null;
  try{
   const response=await fetch(api,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'claim',token,device:deviceId()})});
   const body=await response.json().catch(()=>({}));
   if(!response.ok)claimReason=(body.reason as string)||'unavailable';
   claimed=typeof body.link==='string'&&uuid.test(body.link)?body.link.toLowerCase():null;
  }catch{claimReason='unavailable';}
  if(claimed){
   claimToken.current=null;link.current=claimed;
   window.history.replaceState(window.history.state,'',window.location.pathname+'?'+new URLSearchParams({[PO_PORTAL_LINK_PARAM]:claimed}));
   const opened=await load();if(!opened&&claimReason){setReason(claimReason);setPhase('error');}
   return;
  }
  claimToken.current=claimReason==='unavailable'?token:null;
  setReason(claimReason??'unavailable');setPhase('error');
 },[load]);
 useEffect(()=>{
  let timer:ReturnType<typeof setTimeout>|undefined;
  const open=()=>{
   clearTimeout(timer);
   const match=/(?:^#|&)acceso=([A-Za-z0-9_-]{43})(?:&|$)/.exec(window.location.hash);
   timer=setTimeout(async()=>{
    if(!match){link.current=linkFromAddress();await load();return;}
    window.history.replaceState(window.history.state,'',window.location.pathname);
    await claim(match[1]!);
   },0);
  };
  open();
  window.addEventListener('hashchange',open);
  return()=>{clearTimeout(timer);window.removeEventListener('hashchange',open);};
 },[load,claim]);
 async function post(body:string,actionId:string){
  if(saving)return;setSaving(true);setError('');setNotice('');pending.current={actionId,body};
  try{
   const response=await fetch(api,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body});
   if(response.status>=500){setUncertain(true);setError(c.errors.uncertain!);return;}
   const data=await response.json().catch(()=>({}));
   if(response.status===429&&data.reason!=='limit'){setUncertain(true);setError(c.errors.busy!);return;}
   if(!response.ok){pending.current=null;setUncertain(false);const why=(data.reason as string)||'invalid';setError(c.errors[why]??c.errors.invalid!);if(why==='session'){setReason('session');setPhase('error');}else if(why==='changed'||why==='closed')await load(true);return;}
   pending.current=null;setUncertain(false);setNote('');setDate('');await load(true);setNotice(c.sent);
  }catch{setUncertain(true);setError(c.errors.uncertain!);}
  finally{setSaving(false);}
 }
 function submit(event:FormEvent){
  event.preventDefault();if(!view||!view.canRespond||saving)return;
  if(pending.current){void post(pending.current.body,pending.current.actionId);return;}
  if(choice==='propose_date'&&(!date||date<view.today)){setError(c.invalidDate);return;}
  const actionId=crypto.randomUUID();
  void post(JSON.stringify({action:'respond',link:link.current??undefined,actionId,revision:view.order.revision,response:choice,proposedDate:choice==='propose_date'?date:null,note:note.trim()||null}),actionId);
 }
 function edit(apply:()=>void){apply();setError('');pending.current=null;setUncertain(false);}
 const shell=(children:ReactNode)=><main data-po-portal className="mx-auto min-h-screen w-full max-w-3xl space-y-5 bg-white px-4 py-6 text-[#162543] sm:px-6">
  <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e5e7eb] pb-4"><ContrataCRLogo/><p className="text-sm font-semibold text-[#52627a]">{c.title}</p></header>
  {children}
  <p className="text-xs text-[#52627a]">{c.privacy}</p>
 </main>;
 if(phase==='opening'||phase==='loading'&&!view)return shell(<p role="status" className="text-sm text-[#52627a]">{phase==='opening'?c.opening:c.loading}</p>);
 if(phase==='error'||!view)return shell(<div role="alert" data-po-portal-error={reason} className="space-y-3 rounded-2xl border border-[#f2c9c9] bg-[#fdf0f0] p-4 text-sm text-[#9b2c2c]"><p>{c.errors[reason]??c.errors.unknown}</p>
  {(reason==='unavailable')&&<Button type="button" variant="secondary" className="min-h-11" onClick={()=>{if(claimToken.current)void claim(claimToken.current);else void load();}}>{c.retry}</Button>}</div>);
 // Answers come oldest first (pro_po_vendor_view); the newest answer to this revision is the current one.
 const o=view.order,last=view.responses.findLast(r=>r.current)??null,answeredOld=!last&&view.responses.length>0;
 return shell(<>
  <section className="min-w-0 space-y-2 rounded-2xl border border-[#d7e1ea] bg-[#f7f9fc] p-4">
   {view.business&&<p className="break-words text-sm font-semibold text-[#52627a]">{c.from(view.business)}</p>}
   <div className="flex flex-wrap items-center gap-2"><span className="text-sm font-semibold text-[#52627a]">{o.code}</span><span data-po-portal-status={o.status} className="inline-flex min-h-7 items-center rounded-full border border-[#d7e1ea] bg-white px-2.5 text-xs font-semibold">{c.status[o.status]}</span></div>
   <h1 className="break-words text-xl font-bold">{o.title}</h1>
   <p className="text-sm">{c.to(view.vendor)}</p>
   <p className="text-sm text-[#52627a]">{c.issueDate}: {day(o.issueDate,en)} · {c.expected}: {o.expectedDate?day(o.expectedDate,en):'—'}</p>
   {o.deliveryAddress&&<p data-po-portal-address className="whitespace-pre-line break-words text-sm"><span className="font-semibold">{c.address}: </span>{o.deliveryAddress}</p>}
   {o.paymentTerms&&<p data-po-portal-terms className="whitespace-pre-line break-words text-sm"><span className="font-semibold">{c.payTerms}: </span>{o.paymentTerms}</p>}
  </section>
  <ol className="space-y-2">{o.lines.map(line=><li key={line.id} data-po-portal-line={line.position} className="grid min-w-0 gap-1 rounded-2xl border border-[#d7e1ea] p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
   <div className="min-w-0 text-sm"><p className="break-words font-semibold">{line.position}. {line.description}</p><p className="text-[#52627a]">{quantity(line.quantity,en)} {line.unit} × {proMoney(line.unitCents/100)}{line.taxRate?` · ${c.tax} ${quantity(line.taxRate,en)} %`:''}</p></div>
   <p className="whitespace-nowrap font-bold tabular-nums">{proMoney(line.totalCents/100)}</p></li>)}</ol>
  <dl className="grid grid-cols-3 gap-2 text-sm"><div><dt className="text-[#52627a]">{c.subtotal}</dt><dd className="font-semibold tabular-nums">{proMoney(o.subtotalCents/100)}</dd></div><div><dt className="text-[#52627a]">{c.tax}</dt><dd className="font-semibold tabular-nums">{proMoney(o.taxCents/100)}</dd></div><div><dt className="text-[#52627a]">{c.total}</dt><dd data-po-portal-total className="font-bold tabular-nums">{proMoney(o.totalCents/100)}</dd></div></dl>
  {last&&<p role="status" data-po-portal-current={last.response} className="rounded-xl bg-[#eef8f4] p-3 text-sm text-[#18573a]">{c.answer[last.response]} {last.proposedDate?`${c.proposed}: ${day(last.proposedDate,en)}. `:''}{c.answeredAt}: {stamp(last.respondedAt,en)}</p>}
  {answeredOld&&<p role="status" data-po-portal-stale className="rounded-xl bg-[#fff8e6] p-3 text-sm">{c.stale}</p>}
  {!view.canRespond&&<p role="status" data-po-portal-closed className="rounded-xl bg-[#fff8e6] p-3 text-sm">{c.closed}</p>}
  {view.canRespond&&<form data-po-portal-form className="min-w-0 space-y-3" onSubmit={submit} noValidate>
   <p className="text-sm">{c.intro}</p>
   <fieldset className="space-y-1"><legend className="sr-only">{c.title}</legend>
    {(['confirm','decline','propose_date'] as const).map(value=><label key={value} className="flex min-h-11 items-center gap-2 text-sm font-semibold"><input type="radio" name="po-answer" data-po-portal-choice={value} className="h-5 w-5" checked={choice===value} disabled={saving} onChange={()=>edit(()=>setChoice(value))}/>{value==='confirm'?c.confirm:value==='decline'?c.decline:c.propose}</label>)}</fieldset>
   {choice==='propose_date'&&<label className="block min-w-0 text-sm font-semibold">{c.proposedDate}<input data-po-portal-date className={field+' appearance-none'} type="date" min={view.today} value={date} disabled={saving} onChange={event=>edit(()=>setDate(event.target.value))}/></label>}
   <label className="block min-w-0 text-sm font-semibold">{c.note}<textarea data-po-portal-note className={field+' min-h-20 py-2'} maxLength={500} value={note} disabled={saving} onChange={event=>edit(()=>setNote(event.target.value))}/></label>
   {notice&&<p ref={noticeRef} role="status" data-po-portal-notice className="rounded-xl bg-[#eef8f4] p-3 text-sm text-[#18573a]">{notice}</p>}
   {error&&<p ref={errorRef} role="alert" data-po-portal-form-error className="rounded-xl bg-[#fff4f2] p-3 text-sm text-[#8a2a1b]">{error}</p>}
   <div className="flex flex-col gap-2 sm:flex-row">
    <Button type="submit" className="min-h-11" data-po-portal-send disabled={saving}>{saving?c.sending:uncertain?c.retry:c.send}</Button>
    <Button type="button" variant="secondary" className="min-h-11" disabled={saving} onClick={()=>{pending.current=null;setUncertain(false);setError('');void load();}}>{c.refresh}</Button>
   </div>
  </form>}
 </>);
}
