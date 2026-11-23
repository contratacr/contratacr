'use client';
import {useCallback,useEffect,useRef,useState,type FormEvent} from 'react';
import {Button} from '@/components/ui/button';
import {useAppDialog} from '@/hooks/use-app-dialog';
import {poPortalUrl,poVendorOwnerResultSchema,poVendorOwnerSchema,type PoVendorOwner} from '@/lib/pro/po-portal';
import {poExportCsv,purchaseOrderExportSchema,purchaseOrderSelectionSyncSchema,purchaseOrderTermsSchema,parsePoQuantity,type PurchaseOrder,type PurchaseOrderSelectionSync,type PurchaseOrderSummary,type PurchaseOrderTerms} from '@/lib/pro/purchase-orders';

/**
 * Families 51 and 52, owner side: delivery address and payment terms, secure vendor link with the vendor answers (no ContrataCR account for the vendor),
 * receipt reversal and returns, selection tracking sync, flat CSV export and merge of draft orders. Nothing here sends e-mail or moves money.
 */
const tools='/api/pro/purchase-order-tools',links='/api/pro/purchase-order-vendor-links';
const field='mt-1 block min-h-11 w-full min-w-0 rounded-xl border border-[#d7e1ea] bg-white px-3 text-base font-normal text-[#162543]';
const label='block min-w-0 text-sm font-semibold text-[#162543]';
const stamp=(value:string,en:boolean)=>new Intl.DateTimeFormat(en?'en-US':'es-CR',{dateStyle:'medium',timeStyle:'short',timeZone:'America/Costa_Rica'}).format(new Date(value));
const day=(value:string,en:boolean)=>new Intl.DateTimeFormat(en?'en-US':'es-CR',{dateStyle:'medium',timeZone:'UTC'}).format(new Date(value+'T12:00:00Z'));
const qty=(value:number,en:boolean)=>new Intl.NumberFormat(en?'en-US':'es-CR',{maximumFractionDigits:3}).format(value);
const headers=(accountId:string)=>({'Content-Type':'application/json','X-Pro-Expected-Actor':accountId});

function copy(en:boolean){
 return en?{
  termsTitle:'Delivery address and payment terms',termsIntro:'Printed on the order and shown to the vendor on its secure link.',address:'Delivery address (optional)',payTerms:'Payment terms (optional)',saveTerms:'Save',editTerms:'Edit',cancel:'Cancel',saving:'Saving…',
  noTerms:'No address or terms recorded.',termsSaved:'Address and terms saved.',termsClosed:'The terms can no longer change on this order.',
  vendorTitle:'Vendor confirmation (secure link)',vendorIntro:'Create a private link and send it to the vendor yourself (WhatsApp, e-mail…). The vendor does not need an account: it confirms, declines or proposes a delivery date, and sees only this order. ContrataCR sends nothing.',
  vendorDraft:'Issue the order to create a vendor link.',vendorClosed:'This order no longer accepts vendor answers.',none:'No link yet',
  status:{active:'Link ready, not opened yet',claimed:'Opened by the vendor',expired:'Link expired',revoked:'Link cancelled'} as Record<string,string>,expires:'Expires',days:'Valid for',dayOptions:(n:number)=>n===1?'1 day':`${n} days`,
  createLink:'Create link',replaceLink:'Create new link',revoke:'Cancel link',copyLink:'Copy link',copied:'Link copied.',copyFailed:'Could not copy automatically. Select the link and copy it.',linkLabel:'Vendor link',
  once:'Shown only now. If you lose it, create a new link: the previous one stops working. Each link opens once, on one device.',
  confirmReplace:'Create a new link?',confirmReplaceText:'The current link stops working right away. Answers already sent are kept.',confirmRevoke:'Cancel this link?',confirmRevokeText:'The vendor can no longer open or answer with it. Answers already sent are kept.',keep:'Keep it',
  answers:'Vendor answers',noAnswers:'The vendor has not answered yet.',answer:{confirm:'Confirmed the order',decline:'Declined the order',propose_date:'Proposed a delivery date'} as Record<string,string>,proposed:'Proposed date',note:'Note',
  stale:'Answer to an earlier version of the order',current:'Current',changed:'The link changed. Refreshed; try again.',failed:'Could not save the link. Try again.',uncertain:'Could not confirm. Retry the same action; it is not duplicated.',
  config:'The vendor link is not configured on this server (PRO_BID_PORTAL_SECRET is missing). No link was created.',replayed:'The link had already been created, but for security it cannot be shown again. Create a new link to replace it.',
  loading:'Loading…',loadError:'Could not load this section.',retry:'Retry',refresh:'Refresh',
  fixTitle:'Corrections and returns',fixIntro:'Reverse a delivery recorded by mistake, or record goods you returned to the vendor. History is kept; nothing is deleted.',
  reverseReceipt:'Reverse delivery',reverseReason:'Reason',saveReverse:'Save reversal',returnTitle:'Record a return',line:'Line',quantity:'Quantity returned',returnedOn:'Return date',saveReturn:'Save return',
  noReceiptToReverse:'There are no deliveries to reverse.',noReturnable:'No delivered quantity to return.',reversedAdj:'Delivery reversed.',returnedAdj:'Return recorded.',invalidAdj:'Complete the reason and a valid quantity that does not exceed what was delivered.',
  kinds:{receipt:'Delivery',reverse:'Reversal of a delivery',return:'Return'} as Record<string,string>,reversedMark:'Reversed',
  syncTitle:'Selection tracking',syncIntro:'Approved selections linked to this order: where their tracking is versus what the deliveries say. Applying it only changes the status of the selection.',
  syncNone:'No approved selection is linked to this order.',syncCurrent:'Tracking',syncSuggested:'Suggested',syncApply:'Update tracking',syncApplied:'Selection tracking updated.',syncOk:'In sync',
  tracking:{not_ordered:'Not ordered',ordered:'Ordered',delivered:'Delivered',installed:'Installed'} as Record<string,string>,orderedQ:'Ordered',receivedQ:'Delivered',
  exportCsv:'Export CSV',exporting:'Preparing…',exportEmpty:'There are no orders to export.',exportError:'Could not export. Try again.',
  mergeTitle:'Combine draft orders',mergeIntro:'Select two or more draft orders of the same vendor to combine them into one new draft. The originals are cancelled and the history is kept.',
  mergeOpen:'Combine drafts',mergeName:'Title of the combined order',mergeDo:'Combine',mergeNeed:'Select at least two draft orders and write a title.',mergeDone:'Orders combined into a new draft.',noDrafts:'There are fewer than two draft orders.',
  changedPo:'This order changed in another window. Reload before trying again.',
 }:{
  termsTitle:'Dirección de entrega y condiciones de pago',termsIntro:'Se imprimen en la orden y se muestran al proveedor en su enlace seguro.',address:'Dirección de entrega (opcional)',payTerms:'Condiciones de pago (opcional)',saveTerms:'Guardar',editTerms:'Editar',cancel:'Cancelar',saving:'Guardando…',
  noTerms:'Sin dirección ni condiciones registradas.',termsSaved:'Dirección y condiciones guardadas.',termsClosed:'Las condiciones ya no se pueden cambiar en esta orden.',
  vendorTitle:'Confirmación del proveedor (enlace seguro)',vendorIntro:'Cree un enlace privado y envíelo usted mismo al proveedor (WhatsApp, correo…). El proveedor no necesita cuenta: confirma, rechaza o propone una fecha de entrega, y solo ve esta orden. ContrataCR no envía nada.',
  vendorDraft:'Emita la orden para crear un enlace de proveedor.',vendorClosed:'Esta orden ya no recibe respuestas del proveedor.',none:'Sin enlace todavía',
  status:{active:'Enlace listo, sin abrir',claimed:'Abierto por el proveedor',expired:'Enlace vencido',revoked:'Enlace anulado'} as Record<string,string>,expires:'Vence',days:'Vigencia',dayOptions:(n:number)=>n===1?'1 día':`${n} días`,
  createLink:'Crear enlace',replaceLink:'Crear enlace nuevo',revoke:'Anular enlace',copyLink:'Copiar enlace',copied:'Enlace copiado.',copyFailed:'No se pudo copiar automáticamente. Seleccione el enlace y cópielo.',linkLabel:'Enlace del proveedor',
  once:'Solo se muestra ahora. Si lo pierde, cree un enlace nuevo: el anterior deja de funcionar. Cada enlace se abre una sola vez, en un dispositivo.',
  confirmReplace:'¿Crear un enlace nuevo?',confirmReplaceText:'El enlace actual deja de funcionar de inmediato. Las respuestas ya enviadas se conservan.',confirmRevoke:'¿Anular este enlace?',confirmRevokeText:'El proveedor ya no podrá abrirlo ni responder con él. Las respuestas ya enviadas se conservan.',keep:'Conservarlo',
  answers:'Respuestas del proveedor',noAnswers:'El proveedor todavía no ha respondido.',answer:{confirm:'Confirmó la orden',decline:'Rechazó la orden',propose_date:'Propuso una fecha de entrega'} as Record<string,string>,proposed:'Fecha propuesta',note:'Nota',
  stale:'Respuesta a una versión anterior de la orden',current:'Vigente',changed:'El enlace cambió. Ya se actualizó; vuelva a intentarlo.',failed:'No se pudo guardar el enlace. Vuelva a intentarlo.',uncertain:'No se pudo confirmar. Reintente la misma acción; no se duplica.',
  config:'El enlace de proveedor no está configurado en este servidor (falta PRO_BID_PORTAL_SECRET). No se creó ningún enlace.',replayed:'El enlace ya se había creado, pero por seguridad no se puede mostrar de nuevo. Cree un enlace nuevo para reemplazarlo.',
  loading:'Cargando…',loadError:'No se pudo cargar esta sección.',retry:'Reintentar',refresh:'Actualizar',
  fixTitle:'Correcciones y devoluciones',fixIntro:'Reverse una entrega registrada por error o registre mercadería que devolvió al proveedor. El historial se conserva; no se borra nada.',
  reverseReceipt:'Reversar entrega',reverseReason:'Motivo',saveReverse:'Guardar reverso',returnTitle:'Registrar una devolución',line:'Línea',quantity:'Cantidad devuelta',returnedOn:'Fecha de la devolución',saveReturn:'Guardar devolución',
  noReceiptToReverse:'No hay entregas para reversar.',noReturnable:'No hay cantidad entregada para devolver.',reversedAdj:'Entrega reversada.',returnedAdj:'Devolución registrada.',invalidAdj:'Complete el motivo y una cantidad válida que no supere lo entregado.',
  kinds:{receipt:'Entrega',reverse:'Reverso de una entrega',return:'Devolución'} as Record<string,string>,reversedMark:'Reversada',
  syncTitle:'Seguimiento de selecciones',syncIntro:'Selecciones aprobadas vinculadas a esta orden: dónde está su seguimiento frente a lo que dicen las entregas. Aplicarlo solo cambia el estado de la selección.',
  syncNone:'Ninguna selección aprobada está vinculada a esta orden.',syncCurrent:'Seguimiento',syncSuggested:'Sugerido',syncApply:'Actualizar seguimiento',syncApplied:'Seguimiento de selecciones actualizado.',syncOk:'Al día',
  tracking:{not_ordered:'Sin pedir',ordered:'Pedido',delivered:'Entregado',installed:'Instalado'} as Record<string,string>,orderedQ:'Pedido',receivedQ:'Entregado',
  exportCsv:'Exportar CSV',exporting:'Preparando…',exportEmpty:'No hay órdenes para exportar.',exportError:'No se pudo exportar. Vuelva a intentarlo.',
  mergeTitle:'Combinar borradores',mergeIntro:'Seleccione dos o más órdenes en borrador del mismo proveedor para combinarlas en un borrador nuevo. Las originales se cancelan y el historial se conserva.',
  mergeOpen:'Combinar borradores',mergeName:'Título de la orden combinada',mergeDo:'Combinar',mergeNeed:'Seleccione al menos dos órdenes en borrador y escriba un título.',mergeDone:'Órdenes combinadas en un borrador nuevo.',noDrafts:'Hay menos de dos órdenes en borrador.',
  changedPo:'Esta orden cambió en otra ventana. Recargue antes de volver a intentarlo.',
 };
}
const useAlive=()=>{const alive=useRef(true);useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);return alive;};

/** Delivery address and payment terms (migration 410). The save moves the order revision, so the parent reloads the order. */
function TermsPanel({accountId,workId,order,en,canWrite,onChanged}:{accountId:string;workId:string;order:PurchaseOrder;en:boolean;canWrite:boolean;onChanged:(notice:string)=>void}){
 const c=copy(en),[terms,setTerms]=useState<PurchaseOrderTerms|null>(null),[failed,setFailed]=useState(false),[edit,setEdit]=useState<{address:string;terms:string}|null>(null),[saving,setSaving]=useState(false),[error,setError]=useState('');
 const alive=useAlive();
 const load=useCallback(async()=>{
  try{const r=await fetch(tools+'?'+new URLSearchParams({view:'terms',workId,id:order.id}),{cache:'no-store',headers:{'X-Pro-Expected-Actor':accountId}});if(!r.ok)throw Error();const body=purchaseOrderTermsSchema.parse(await r.json());if(alive.current){setTerms(body);setFailed(false);}}
  catch{if(alive.current)setFailed(true);}
 },[accountId,workId,order.id,alive]);
 useEffect(()=>{const timer=setTimeout(()=>void load(),0);return()=>clearTimeout(timer);},[load,order.revision]);
 const open=order.status==='draft'||order.status==='issued'||order.status==='partial';
 async function save(event:FormEvent){
  event.preventDefault();if(!edit||!terms||saving)return;setSaving(true);setError('');
  try{
   const r=await fetch(tools,{method:'POST',cache:'no-store',headers:headers(accountId),body:JSON.stringify({action:'terms',workId,id:order.id,revision:terms.revision,deliveryAddress:edit.address.trim()||null,paymentTerms:edit.terms.trim()||null})});
   if(r.status===409){setError(c.changedPo);await load();return;}if(!r.ok){setError(c.failed);return;}
   setEdit(null);onChanged(c.termsSaved);
  }catch{setError(c.uncertain);}finally{if(alive.current)setSaving(false);}
 }
 return <section data-po-terms className="min-w-0 space-y-2 rounded-2xl border border-[#d7e1ea] bg-white p-4">
  <h5 className="font-semibold text-[#162543]">{c.termsTitle}</h5>
  {failed&&!terms?<div role="alert" className="space-y-2 text-sm"><p>{c.loadError}</p><Button type="button" variant="secondary" className="min-h-11" onClick={()=>void load()}>{c.retry}</Button></div>:!terms?<p role="status" className="text-sm text-[#52627a]">{c.loading}</p>
  :edit?<form onSubmit={save} noValidate className="space-y-3">
   <p className="text-xs text-[#52627a]">{c.termsIntro}</p>
   <label className={label}>{c.address}<input data-po-terms-field="address" className={field} maxLength={300} value={edit.address} disabled={saving} onChange={event=>setEdit({...edit,address:event.target.value})}/></label>
   <label className={label}>{c.payTerms}<input data-po-terms-field="terms" className={field} maxLength={300} value={edit.terms} disabled={saving} onChange={event=>setEdit({...edit,terms:event.target.value})}/></label>
   {error&&<p role="alert" className="text-sm text-[#8a2a1b]">{error}</p>}
   <div className="flex flex-wrap gap-2"><Button type="submit" className="min-h-11" disabled={saving}>{saving?c.saving:c.saveTerms}</Button><Button type="button" variant="secondary" className="min-h-11" disabled={saving} onClick={()=>setEdit(null)}>{c.cancel}</Button></div>
  </form>
  :<div className="space-y-1 text-sm">
   {terms.deliveryAddress||terms.paymentTerms?<><p className="break-words" data-po-terms-address>{c.address.replace(/ \(.*\)$/,'')}: {terms.deliveryAddress??'—'}</p><p className="break-words" data-po-terms-payment>{c.payTerms.replace(/ \(.*\)$/,'')}: {terms.paymentTerms??'—'}</p></>:<p className="text-[#52627a]">{c.noTerms}</p>}
   {error&&<p role="alert" className="text-[#8a2a1b]">{error}</p>}
   {canWrite&&(open?<Button type="button" variant="secondary" className="min-h-11" data-po-terms-edit onClick={()=>setEdit({address:terms.deliveryAddress??'',terms:terms.paymentTerms??''})}>{c.editTerms}</Button>:<p className="text-xs text-[#52627a]">{c.termsClosed}</p>)}
  </div>}
 </section>;
}

/** Secure vendor link of the order and the answers the vendor gave. The token is shown once; only its keyed hash is stored. */
function VendorLinkPanel({accountId,workId,order,en,canWrite}:{accountId:string;workId:string;order:PurchaseOrder;en:boolean;canWrite:boolean}){
 const c=copy(en),{confirm,dialogNode}=useAppDialog(),alive=useAlive();
 const [data,setData]=useState<PoVendorOwner|null>(null),[failed,setFailed]=useState(false),[saving,setSaving]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[retryable,setRetryable]=useState(false);
 const [fresh,setFresh]=useState(''),[days,setDays]=useState(14),pending=useRef<Record<string,unknown>|null>(null);
 const load=useCallback(async()=>{
  try{const r=await fetch(links+'?'+new URLSearchParams({workId,id:order.id}),{cache:'no-store',headers:{'X-Pro-Expected-Actor':accountId}});if(!r.ok)throw Error();const body=poVendorOwnerSchema.parse(await r.json());if(alive.current){setData(body);setFailed(false);}}
  catch{if(alive.current)setFailed(true);}
 },[accountId,workId,order.id,alive]);
 useEffect(()=>{const timer=setTimeout(()=>void load(),0);return()=>clearTimeout(timer);},[load,order.revision,order.status]);
 async function send(input:Record<string,unknown>){
  if(saving)return;setSaving(true);setError('');setNotice('');pending.current=input;
  try{
   const r=await fetch(links,{method:'POST',cache:'no-store',headers:headers(accountId),body:JSON.stringify(input)});
   if(r.status>=500){const failure=await r.json().catch(()=>({}));if(failure?.reason==='config'){pending.current=null;setRetryable(false);setError(c.config);return;}setRetryable(true);setError(c.uncertain);return;}
   if(!r.ok){pending.current=null;setRetryable(false);setError(r.status===409?c.changed:c.failed);if(r.status===409)await load();return;}
   const body=poVendorOwnerResultSchema.parse(await r.json());pending.current=null;setRetryable(false);
   setFresh(body.token?poPortalUrl(window.location.origin,en?'en':'es',body.token):'');
   if(input.action==='create_link'&&body.replayed&&!body.token)setError(c.replayed);
   await load();
  }catch{setRetryable(true);setError(c.uncertain);}finally{if(alive.current)setSaving(false);}
 }
 const link=data?.link??null,live=link&&(link.status==='active'||link.status==='claimed');
 async function create(){
  if(live&&!(await confirm({title:c.confirmReplace,description:c.confirmReplaceText,confirmLabel:c.replaceLink,cancelLabel:c.keep})).confirmed)return;
  void send({action:'create_link',actionId:crypto.randomUUID(),id:crypto.randomUUID(),workId,orderId:order.id,replacesLinkId:link&&link.status!=='revoked'?link.id:null,expiresInDays:days});
 }
 async function revoke(){
  if(!link||!(await confirm({title:c.confirmRevoke,description:c.confirmRevokeText,confirmLabel:c.revoke,cancelLabel:c.keep,tone:'danger'})).confirmed)return;
  void send({action:'revoke_link',actionId:crypto.randomUUID(),id:link.id,workId,orderId:order.id,revision:link.revision});
 }
 async function copyLink(){try{await navigator.clipboard.writeText(fresh);setNotice(c.copied);}catch{setNotice(c.copyFailed);}}
 const writable=canWrite&&(order.status==='issued'||order.status==='partial');
 return <section data-po-vendor-link className="min-w-0 space-y-3 rounded-2xl border border-[#d7e1ea] bg-white p-4">
  {dialogNode}
  <div className="flex flex-wrap items-start justify-between gap-2"><h5 className="font-semibold text-[#162543]">{c.vendorTitle}</h5><Button type="button" variant="secondary" className="min-h-11" disabled={saving} onClick={()=>{setFresh('');void load();}}>{c.refresh}</Button></div>
  <p className="text-sm text-[#52627a]">{c.vendorIntro}</p>
  {error&&<div role="alert" data-po-vendor-link-error className="space-y-2 rounded-xl bg-[#fff4f2] p-3 text-sm text-[#8a2a1b]"><p>{error}</p>{retryable&&<Button type="button" variant="secondary" className="min-h-11" disabled={saving} onClick={()=>{if(pending.current)void send(pending.current);}}>{c.retry}</Button>}</div>}
  {notice&&<p role="status" className="text-sm text-[#18573a]">{notice}</p>}
  {failed&&!data?<div role="alert" className="space-y-2 text-sm"><p>{c.loadError}</p><Button type="button" variant="secondary" className="min-h-11" onClick={()=>void load()}>{c.retry}</Button></div>:!data?<p role="status" className="text-sm text-[#52627a]">{c.loading}</p>:<>
   <p data-po-vendor-link-status={link?.status??'none'} className="text-sm">{link?c.status[link.status]:c.none}{live?` · ${c.expires}: ${stamp(link.expiresAt,en)}`:''}</p>
   {fresh&&<div className="space-y-2 rounded-xl bg-[#f3f8fb] p-3"><label className={label}>{c.linkLabel}<input data-po-vendor-url className={field+' text-sm'} readOnly value={fresh} onFocus={event=>event.currentTarget.select()}/></label>
    <Button type="button" className="min-h-11" data-po-vendor-copy onClick={()=>void copyLink()}>{c.copyLink}</Button><p className="text-xs text-[#52627a]">{c.once}</p></div>}
   {writable?<div className="flex flex-wrap items-end gap-2">
    <label className={label}>{c.days}<select data-po-vendor-days className={field+' w-32'} value={days} disabled={saving} onChange={event=>setDays(Number(event.target.value))}>{[1,3,7,14,30].map(n=><option key={n} value={n}>{c.dayOptions(n)}</option>)}</select></label>
    <Button type="button" variant={live?'secondary':'default'} className="min-h-11" data-po-vendor-create disabled={saving} onClick={()=>void create()}>{live?c.replaceLink:c.createLink}</Button>
    {live&&<Button type="button" variant="ghost" className="min-h-11" data-po-vendor-revoke disabled={saving} onClick={()=>void revoke()}>{c.revoke}</Button>}
   </div>:canWrite&&<p className="text-xs text-[#52627a]">{order.status==='draft'?c.vendorDraft:c.vendorClosed}</p>}
   <div data-po-vendor-answers className="space-y-1"><p className="text-sm font-semibold">{c.answers}</p>
    {data.responses.length?<ul className="space-y-1 text-sm">{data.responses.map(answer=><li key={answer.id} data-po-vendor-answer={answer.response} className="break-words">
     <span className="font-semibold">{c.answer[answer.response]}</span> · {stamp(answer.respondedAt,en)}{answer.proposedDate?` · ${c.proposed}: ${day(answer.proposedDate,en)}`:''}{answer.note?` · ${c.note}: ${answer.note}`:''}
     {answer.stale&&<span data-po-vendor-stale className="ml-1 rounded-full bg-[#fff6e5] px-2 py-0.5 text-xs font-semibold text-[#7a4b00]">{c.stale}</span>}</li>)}</ul>:<p className="text-sm text-[#52627a]">{c.noAnswers}</p>}</div>
  </>}
 </section>;
}

/** Receipt reversal and returns (migration 411). Both keep the full history: a reversal or a return is a new record. */
function AdjustPanel({accountId,workId,order,en,canWrite,today,onChanged}:{accountId:string;workId:string;order:PurchaseOrder;en:boolean;canWrite:boolean;today:string;onChanged:(notice:string)=>void}){
 const c=copy(en),alive=useAlive();
 const [mode,setMode]=useState<null|{kind:'reverse';receiptId:string;reason:string}|{kind:'return';lineId:string;quantity:string;returnedOn:string;reason:string}>(null),[saving,setSaving]=useState(false),[error,setError]=useState(''),pending=useRef<Record<string,unknown>|null>(null);
 const net=(lineId:string)=>order.lines.find(l=>l.id===lineId)?.receivedQuantity??0;
 const reversible=order.receipts.filter(r=>r.kind==='receipt'&&!r.reversed),returnable=order.lines.filter(l=>l.receivedQuantity>0);
 const allowed=canWrite&&order.status!=='draft'&&order.status!=='cancelled';
 async function post(input:Record<string,unknown>,done:string){
  if(saving)return;setSaving(true);setError('');pending.current=input;
  try{
   const r=await fetch(tools,{method:'POST',cache:'no-store',headers:headers(accountId),body:JSON.stringify(input)});
   if(r.status===409){pending.current=null;setError(c.changedPo);return;}if(r.status>=500||r.status===429){setError(c.uncertain);return;}
   if(!r.ok){pending.current=null;setError(c.invalidAdj);return;}
   pending.current=null;setMode(null);onChanged(done);
  }catch{setError(c.uncertain);}finally{if(alive.current)setSaving(false);}
 }
 function submit(event:FormEvent){
  event.preventDefault();if(!mode||saving)return;
  if(pending.current){void post(pending.current,mode.kind==='reverse'?c.reversedAdj:c.returnedAdj);return;}
  const reason=mode.reason.trim();if(!reason){setError(c.invalidAdj);return;}
  if(mode.kind==='reverse'){const receipt=order.receipts.find(r=>r.id===mode.receiptId);if(!receipt){setError(c.invalidAdj);return;}
   void post({action:'reverse_receipt',actionId:crypto.randomUUID(),workId,id:order.id,revision:order.revision,lineId:receipt.lineId,receiptId:receipt.id,reason},c.reversedAdj);return;}
  const q=parsePoQuantity(mode.quantity,en);if(q===null||q>net(mode.lineId)+1e-9||mode.returnedOn>today||mode.returnedOn<order.issueDate){setError(c.invalidAdj);return;}
  void post({action:'return',actionId:crypto.randomUUID(),workId,id:order.id,revision:order.revision,lineId:mode.lineId,quantity:q,returnedOn:mode.returnedOn,reason},c.returnedAdj);
 }
 if(!allowed)return null;
 return <section data-po-adjust className="min-w-0 space-y-2 rounded-2xl border border-[#d7e1ea] bg-white p-4">
  <h5 className="font-semibold text-[#162543]">{c.fixTitle}</h5><p className="text-sm text-[#52627a]">{c.fixIntro}</p>
  {error&&<p role="alert" data-po-adjust-error className="rounded-xl bg-[#fff4f2] p-3 text-sm text-[#8a2a1b]">{error}</p>}
  {!mode?<div className="flex flex-wrap gap-2">
   <Button type="button" variant="secondary" className="min-h-11" data-po-reverse-receipt-open disabled={!reversible.length} onClick={()=>{setError('');setMode({kind:'reverse',receiptId:reversible[0]!.id,reason:''});}}>{c.reverseReceipt}</Button>
   <Button type="button" variant="secondary" className="min-h-11" data-po-return-open disabled={!returnable.length} onClick={()=>{setError('');setMode({kind:'return',lineId:returnable[0]!.id,quantity:'',returnedOn:today,reason:''});}}>{c.returnTitle}</Button>
   {!reversible.length&&<p className="w-full text-xs text-[#52627a]">{c.noReceiptToReverse}</p>}{!returnable.length&&<p className="w-full text-xs text-[#52627a]">{c.noReturnable}</p>}
  </div>
  :<form data-po-adjust-form={mode.kind} onSubmit={submit} noValidate className="space-y-3">
   {mode.kind==='reverse'?<label className={label}>{c.kinds.receipt}<select data-po-adjust-field="receipt" className={field} value={mode.receiptId} disabled={saving} onChange={event=>setMode({...mode,receiptId:event.target.value})}>
     {reversible.map(r=><option key={r.id} value={r.id}>{day(r.receivedOn,en)} · {order.lines.find(l=>l.id===r.lineId)?.description??''}: {qty(r.quantity,en)}</option>)}</select></label>
   :<div className="grid gap-3 sm:grid-cols-3">
    <label className={label}>{c.line}<select data-po-adjust-field="line" className={field} value={mode.lineId} disabled={saving} onChange={event=>setMode({...mode,lineId:event.target.value})}>{returnable.map(l=><option key={l.id} value={l.id}>{l.description} ({qty(l.receivedQuantity,en)})</option>)}</select></label>
    <label className={label}>{c.quantity}<input data-po-adjust-field="quantity" inputMode="decimal" className={field} value={mode.quantity} disabled={saving} onChange={event=>setMode({...mode,quantity:event.target.value})}/></label>
    <label className={label}>{c.returnedOn}<input data-po-adjust-field="date" type="date" className={field} min={order.issueDate} max={today} value={mode.returnedOn} disabled={saving} onChange={event=>setMode({...mode,returnedOn:event.target.value})}/></label>
   </div>}
   <label className={label}>{c.reverseReason}<input data-po-adjust-field="reason" className={field} maxLength={300} value={mode.reason} disabled={saving} onChange={event=>setMode({...mode,reason:event.target.value})}/></label>
   <div className="flex flex-wrap gap-2"><Button type="submit" className="min-h-11" disabled={saving}>{saving?c.saving:mode.kind==='reverse'?c.saveReverse:c.saveReturn}</Button><Button type="button" variant="secondary" className="min-h-11" disabled={saving} onClick={()=>{setMode(null);setError('');pending.current=null;}}>{c.cancel}</Button></div>
  </form>}
 </section>;
}

/** Where the selection tracking is versus what the order says. Applying it uses the selection tracking writer (bulk_track). */
function SelectionSyncPanel({accountId,workId,order,en,canWrite,onChanged}:{accountId:string;workId:string;order:PurchaseOrder;en:boolean;canWrite:boolean;onChanged:(notice:string)=>void}){
 const c=copy(en),alive=useAlive(),[data,setData]=useState<PurchaseOrderSelectionSync|null>(null),[failed,setFailed]=useState(false),[saving,setSaving]=useState(false),[error,setError]=useState('');
 const load=useCallback(async()=>{
  try{const r=await fetch(tools+'?'+new URLSearchParams({view:'sync',workId,id:order.id}),{cache:'no-store',headers:{'X-Pro-Expected-Actor':accountId}});if(!r.ok)throw Error();const body=purchaseOrderSelectionSyncSchema.parse(await r.json());if(alive.current){setData(body);setFailed(false);}}
  catch{if(alive.current)setFailed(true);}
 },[accountId,workId,order.id,alive]);
 useEffect(()=>{const timer=setTimeout(()=>void load(),0);return()=>clearTimeout(timer);},[load,order.revision]);
 const rank:Record<string,number>={not_ordered:0,ordered:1,delivered:2,installed:3};
 // Only moves forward: a selection already further along (e.g. installed by hand) is never taken back.
 const behind=(data?.items??[]).filter(item=>rank[item.suggested]!>rank[item.current]!);
 async function apply(){
  if(saving||!behind.length)return;setSaving(true);setError('');
  try{
   for(const status of ['ordered','delivered','installed'] as const){
    const items=behind.filter(item=>item.suggested===status).map(item=>({itemId:item.itemId,revision:item.trackingRevision}));if(!items.length)continue;
    const r=await fetch('/api/pro/selections-tracking',{method:'POST',cache:'no-store',headers:headers(accountId),body:JSON.stringify({action:'bulk_track',actionId:crypto.randomUUID(),workId,status,items})});
    if(!r.ok)throw Error();
   }
   await load();onChanged(c.syncApplied);
  }catch{setError(c.failed);await load();}finally{if(alive.current)setSaving(false);}
 }
 if(order.status==='draft'||order.status==='cancelled')return null;
 return <section data-po-selection-sync className="min-w-0 space-y-2 rounded-2xl border border-[#d7e1ea] bg-white p-4">
  <h5 className="font-semibold text-[#162543]">{c.syncTitle}</h5><p className="text-sm text-[#52627a]">{c.syncIntro}</p>
  {failed&&!data?<div role="alert" className="space-y-2 text-sm"><p>{c.loadError}</p><Button type="button" variant="secondary" className="min-h-11" onClick={()=>void load()}>{c.retry}</Button></div>:!data?<p role="status" className="text-sm text-[#52627a]">{c.loading}</p>
  :!data.items.length?<p className="text-sm text-[#52627a]">{c.syncNone}</p>
  :<ul className="space-y-2">{data.items.map(item=><li key={item.itemId} data-po-sync-item={item.name} className="rounded-xl bg-[#f7f9fc] p-3 text-sm"><p className="break-words font-semibold">{item.name}</p>
   <p className="text-[#52627a]">{c.orderedQ}: {qty(item.orderedQuantity,en)} · {c.receivedQ}: {qty(item.receivedQuantity,en)} · {c.syncCurrent}: <span data-po-sync-current>{c.tracking[item.current]}</span> · {rank[item.suggested]!>rank[item.current]!?<>{c.syncSuggested}: <span data-po-sync-suggested>{c.tracking[item.suggested]}</span></>:c.syncOk}</p></li>)}</ul>}
  {error&&<p role="alert" className="text-sm text-[#8a2a1b]">{error}</p>}
  {canWrite&&behind.length>0&&<Button type="button" className="min-h-11" data-po-sync-apply disabled={saving} onClick={()=>void apply()}>{saving?c.saving:c.syncApply}</Button>}
 </section>;
}

/** Everything the detail of an order adds in rows 51 and 52. */
export function PoDetailTools({accountId,workId,order,en,canWrite,today,onChanged}:{accountId:string;workId:string;order:PurchaseOrder;en:boolean;canWrite:boolean;today:string;onChanged:(notice:string)=>void}){
 return <div data-po-detail-tools className="space-y-4">
  <TermsPanel accountId={accountId} workId={workId} order={order} en={en} canWrite={canWrite} onChanged={onChanged}/>
  {order.status!=='cancelled'&&order.status!=='received'&&<VendorLinkPanel accountId={accountId} workId={workId} order={order} en={en} canWrite={canWrite}/>}
  <AdjustPanel accountId={accountId} workId={workId} order={order} en={en} canWrite={canWrite} today={today} onChanged={onChanged}/>
  <SelectionSyncPanel accountId={accountId} workId={workId} order={order} en={en} canWrite={canWrite} onChanged={onChanged}/>
 </div>;
}
/** Label of a receipt record (delivery, reversal or return) for the deliveries list. */
export const poReceiptKindLabel=(kind:'receipt'|'reverse'|'return',reversed:boolean,en:boolean)=>{const c=copy(en);return kind==='receipt'?(reversed?`${c.kinds.receipt} · ${c.reversedMark}`:c.kinds.receipt):c.kinds[kind]!;};

/** List level: flat CSV export of every order line (UTF-8 BOM) and merge of draft orders. */
export function PoListTools({accountId,workId,en,canWrite,items,disabled,onMerged}:{accountId:string;workId:string;en:boolean;canWrite:boolean;items:PurchaseOrderSummary[];disabled:boolean;onMerged:(notice:string)=>void}){
 const c=copy(en),alive=useAlive(),[busy,setBusy]=useState(false),[error,setError]=useState(''),[merge,setMerge]=useState<{picked:string[];title:string}|null>(null),pending=useRef<Record<string,unknown>|null>(null);
 const drafts=items.filter(item=>item.status==='draft');
 async function exportCsv(){
  if(busy)return;setBusy(true);setError('');
  try{
   const r=await fetch(tools+'?'+new URLSearchParams({view:'export',workId}),{cache:'no-store',headers:{'X-Pro-Expected-Actor':accountId}});if(!r.ok)throw Error();
   const body=purchaseOrderExportSchema.parse(await r.json());if(!body.rows.length){setError(c.exportEmpty);return;}
   const url=URL.createObjectURL(new Blob([poExportCsv(body.rows,en)],{type:'text/csv;charset=utf-8'}));
   const a=document.createElement('a');a.href=url;a.download=(en?'purchase-orders-':'ordenes-de-compra-')+new Date().toISOString().slice(0,10)+'.csv';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }catch{setError(c.exportError);}finally{if(alive.current)setBusy(false);}
 }
 async function doMerge(event:FormEvent){
  event.preventDefault();if(!merge||busy)return;
  let input=pending.current;
  if(!input){
   const title=merge.title.trim();if(merge.picked.length<2||!title){setError(c.mergeNeed);return;}
   input={action:'merge',actionId:crypto.randomUUID(),workId,id:crypto.randomUUID(),title,sources:merge.picked.map(id=>({id,revision:items.find(item=>item.id===id)!.revision}))};pending.current=input;
  }
  setBusy(true);setError('');
  try{
   const r=await fetch(tools,{method:'POST',cache:'no-store',headers:headers(accountId),body:JSON.stringify(input)});
   if(r.status===409){pending.current=null;setError(c.changedPo);return;}if(r.status>=500||r.status===429){setError(c.uncertain);return;}
   if(!r.ok){pending.current=null;setError(c.mergeNeed);return;}
   pending.current=null;setMerge(null);onMerged(c.mergeDone);
  }catch{setError(c.uncertain);}finally{if(alive.current)setBusy(false);}
 }
 return <div data-po-list-tools className="space-y-3">
  <div className="flex flex-wrap gap-2">
   <Button type="button" variant="secondary" className="min-h-11" data-po-export disabled={busy||disabled} onClick={()=>void exportCsv()}>{busy&&!merge?c.exporting:c.exportCsv}</Button>
   {canWrite&&<Button type="button" variant="secondary" className="min-h-11" data-po-merge-open disabled={busy||disabled||drafts.length<2||!!merge} onClick={()=>{setError('');pending.current=null;setMerge({picked:[],title:''});}}>{c.mergeOpen}</Button>}
  </div>
  {error&&<p role="alert" data-po-tools-error className="rounded-xl bg-[#fff4f2] p-3 text-sm text-[#8a2a1b]">{error}</p>}
  {canWrite&&drafts.length<2&&!merge&&<p className="text-xs text-[#52627a]">{c.noDrafts}</p>}
  {merge&&<form data-po-merge-form onSubmit={doMerge} noValidate className="space-y-3 rounded-2xl border border-[#d7e1ea] bg-white p-4">
   <h5 className="font-semibold text-[#162543]">{c.mergeTitle}</h5><p className="text-sm text-[#52627a]">{c.mergeIntro}</p>
   <ul className="space-y-1">{drafts.map(item=><li key={item.id}><label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" data-po-merge-pick={item.code} className="h-5 w-5" disabled={busy} checked={merge.picked.includes(item.id)}
    onChange={event=>setMerge({...merge,picked:event.target.checked?[...merge.picked,item.id]:merge.picked.filter(id=>id!==item.id)})}/>{item.code} · {item.supplierName} · {item.title}</label></li>)}</ul>
   <label className={label}>{c.mergeName}<input data-po-merge-title className={field} maxLength={160} value={merge.title} disabled={busy} onChange={event=>setMerge({...merge,title:event.target.value})}/></label>
   <div className="flex flex-wrap gap-2"><Button type="submit" className="min-h-11" data-po-merge-do disabled={busy}>{busy?c.saving:c.mergeDo}</Button><Button type="button" variant="secondary" className="min-h-11" disabled={busy} onClick={()=>{setMerge(null);pending.current=null;setError('');}}>{c.cancel}</Button></div>
  </form>}
 </div>;
}
