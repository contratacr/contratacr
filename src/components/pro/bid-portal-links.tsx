'use client';

import {useCallback,useEffect,useRef,useState} from 'react';
import {Button} from '@/components/ui/button';
import {useAppDialog} from '@/hooks/use-app-dialog';
import {bidPortalOwnerFilesSchema,bidPortalOwnerResultSchema,bidPortalOwnerSchema,bidPortalUrl,type BidPortalLink,type BidPortalOwner,type BidPortalOwnerFiles,type BidPortalOwnerMutation} from '@/lib/pro/bid-portal';
import type {BidPackage} from '@/lib/pro/bids';
import {BidOwnerQuestions} from './bid-owner-questions';

/**
 * Owner side of the vendor portal (row 53): one single-use invitation link per invited vendor.
 * The owner copies the link and sends it through their usual channel; ContrataCR sends nothing.
 */
const api='/api/pro/bid-portal-links';
function copy(en:boolean){
 return en?{
  title:'Vendor portal',intro:'Create a private link for each vendor and send it yourself (WhatsApp, e-mail…). The vendor sees only its invitation, without your budget or other offers, and can send or update its offer until the bid closes. ContrataCR does not send anything.',
  loading:'Loading links…',loadError:'Could not load the links.',retry:'Retry',refresh:'Refresh links',none:'No link yet',
  status:{active:'Link ready, not opened yet',claimed:'Opened by the vendor',expired:'Link expired',revoked:'Link cancelled'},expires:'Expires',days:'Valid for',dayOptions:(n:number)=>n===1?'1 day':`${n} days`,
  create:'Create link',replace:'Create new link',revoke:'Cancel link',copyLink:'Copy link',copied:'Link copied.',copyFailed:'Could not copy automatically. Select the link and copy it.',
  linkLabel:(name:string)=>`Invitation link for ${name}`,once:'Shown only now. If you lose it, create a new link: the previous one stops working. Each link opens once, on one device.',
  submissions:(n:number,when:string)=>n===1?`1 offer sent from the portal · ${when}`:`${n} offers sent from the portal · last ${when}`,
  confirmReplace:'Create a new link?',confirmReplaceText:'The current link stops working right away. Offers already sent are kept.',confirmRevoke:'Cancel this link?',confirmRevokeText:'The vendor can no longer open or update its offer with it. Offers already sent are kept.',
  keep:'Keep it',changed:'The link changed. Refreshed; try again.',failed:'Could not save the link. Try again.',uncertain:'Could not confirm. Retry the same action; it is not duplicated.',closedNote:'Links can only be created while the bid is a draft or open.',
  replacesNote:'An offer sent from the portal replaces the offer you typed by hand for that vendor. The vendor only sees what it sent itself, never your notes.',
  config:'The vendor portal is not configured on this server (PRO_BID_PORTAL_SECRET is missing). No link was created.',
  replayed:'The link had already been created, but for security it cannot be shown again. Create a new link to replace it.',
  files:'Attachments from the vendor',download:'Download',filesError:'Could not load the attachments.',
 }:{
  title:'Portal de proveedores',intro:'Cree un enlace privado para cada proveedor y envíelo usted mismo (WhatsApp, correo…). El proveedor solo ve su invitación, sin su presupuesto ni otras ofertas, y puede enviar o actualizar su oferta hasta el cierre. ContrataCR no envía nada.',
  loading:'Cargando enlaces…',loadError:'No se pudieron cargar los enlaces.',retry:'Reintentar',refresh:'Actualizar enlaces',none:'Sin enlace todavía',
  status:{active:'Enlace listo, sin abrir',claimed:'Abierto por el proveedor',expired:'Enlace vencido',revoked:'Enlace anulado'},expires:'Vence',days:'Vigencia',dayOptions:(n:number)=>n===1?'1 día':`${n} días`,
  create:'Crear enlace',replace:'Crear enlace nuevo',revoke:'Anular enlace',copyLink:'Copiar enlace',copied:'Enlace copiado.',copyFailed:'No se pudo copiar automáticamente. Seleccione el enlace y cópielo.',
  linkLabel:(name:string)=>`Enlace de invitación para ${name}`,once:'Solo se muestra ahora. Si lo pierde, cree un enlace nuevo: el anterior deja de funcionar. Cada enlace se abre una sola vez, en un dispositivo.',
  submissions:(n:number,when:string)=>n===1?`1 oferta enviada desde el portal · ${when}`:`${n} ofertas enviadas desde el portal · la última ${when}`,
  confirmReplace:'¿Crear un enlace nuevo?',confirmReplaceText:'El enlace actual deja de funcionar de inmediato. Las ofertas ya enviadas se conservan.',confirmRevoke:'¿Anular este enlace?',confirmRevokeText:'El proveedor ya no podrá abrir ni actualizar su oferta con él. Las ofertas ya enviadas se conservan.',
  keep:'Conservarlo',changed:'El enlace cambió. Ya se actualizó; vuelva a intentarlo.',failed:'No se pudo guardar el enlace. Vuelva a intentarlo.',uncertain:'No se pudo confirmar. Reintente la misma acción; no se duplica.',closedNote:'Los enlaces solo se crean mientras la licitación está en borrador o abierta.',
  replacesNote:'Una oferta enviada desde el portal reemplaza la que usted haya registrado a mano para ese proveedor. El proveedor solo ve lo que él mismo envió, nunca sus notas.',
  config:'El portal de proveedores no está configurado en este servidor (falta PRO_BID_PORTAL_SECRET). No se creó ningún enlace.',
  replayed:'El enlace ya se había creado, pero por seguridad no se puede mostrar de nuevo. Cree un enlace nuevo para reemplazarlo.',
  files:'Adjuntos del proveedor',download:'Descargar',filesError:'No se pudieron cargar los adjuntos.',
 };
}
const stamp=(value:string,en:boolean)=>new Intl.DateTimeFormat(en?'en-US':'es-CR',{dateStyle:'medium',timeStyle:'short',timeZone:'America/Costa_Rica'}).format(new Date(value));
const field='mt-1 block min-h-11 w-full min-w-0 rounded-xl border border-[#d7e1ea] bg-white px-3 text-base font-normal text-[#162543]';

export function BidPortalLinks({accountId,workId,pkg,en,readOnly,onSubmissions}:{accountId:string;workId:string;pkg:BidPackage;en:boolean;readOnly:boolean;onSubmissions:()=>void}){
 const c=copy(en),{confirm,dialogNode}=useAppDialog();
 const [files,setFiles]=useState<BidPortalOwnerFiles|null>(null),[filesError,setFilesError]=useState(false);
 const [data,setData]=useState<BidPortalOwner|null>(null),[loadError,setLoadError]=useState(false),[saving,setSaving]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [fresh,setFresh]=useState<{supplierId:string;url:string}|null>(null),[days,setDays]=useState<Record<string,number>>({}),[retryable,setRetryable]=useState(false);
 const sequence=useRef(0),pending=useRef<BidPortalOwnerMutation|null>(null),seen=useRef<number|null>(null);
 const load=useCallback(async()=>{
  const id=++sequence.current;setLoadError(false);
  try{
   const [response,attached]=await Promise.all([fetch(api+'?'+new URLSearchParams({workId,id:pkg.id}),{cache:'no-store',headers:{'X-Pro-Expected-Actor':accountId}}),
    fetch(api+'?'+new URLSearchParams({view:'files',workId,id:pkg.id}),{cache:'no-store',headers:{'X-Pro-Expected-Actor':accountId}}).catch(()=>null)]);
   if(!response.ok)throw Error();
   const body=bidPortalOwnerSchema.parse(await response.json());if(id!==sequence.current)return;setData(body);
   // Round 4B: vendor attachments; a failure here never hides the links.
   try{if(!attached?.ok)throw Error();const parsed=bidPortalOwnerFilesSchema.parse(await attached.json());if(id===sequence.current){setFiles(parsed);setFilesError(false);}}catch{if(id===sequence.current)setFilesError(true);}
   const total=body.vendors.reduce((sum,row)=>sum+row.portalSubmissions,0);if(seen.current!==null&&total!==seen.current)onSubmissions();seen.current=total;
  }catch{if(id===sequence.current)setLoadError(true);}
 },[accountId,workId,pkg.id,onSubmissions]);
 // Reload when the package changes (status, vendors or offers recorded elsewhere).
 const invalidate=useCallback(()=>{sequence.current++;},[]);
 useEffect(()=>{const timer=setTimeout(()=>void load(),0);return()=>{invalidate();clearTimeout(timer);};},[load,invalidate,pkg.revision]);
 async function send(input:BidPortalOwnerMutation){
  if(saving)return;setSaving(true);setError('');setNotice('');pending.current=input;
  try{
   const response=await fetch(api,{method:'POST',headers:{'Content-Type':'application/json','X-Pro-Expected-Actor':accountId},body:JSON.stringify(input)});
   if(response.status>=500){const failure=await response.json().catch(()=>({}));if(failure?.reason==='config'){pending.current=null;setRetryable(false);setError(c.config);return;}setRetryable(true);setError(c.uncertain);return;}
   if(!response.ok){pending.current=null;setRetryable(false);setError(response.status===409?c.changed:c.failed);if(response.status===409)await load();return;}
   const body=bidPortalOwnerResultSchema.parse(await response.json());pending.current=null;setRetryable(false);
   setFresh(body.token?{supplierId:input.supplierId,url:bidPortalUrl(window.location.origin,en?'en':'es',body.token)}:null);
   // A retried create whose first answer was lost: the token is never shown twice.
   if(input.action==='create_link'&&body.replayed&&!body.token)setError(c.replayed);
   await load();
  }catch{setRetryable(true);setError(c.uncertain);}
  finally{setSaving(false);}
 }
 async function create(supplierId:string,link:BidPortalLink|null){
  if(link&&link.status!=='revoked'&&link.status!=='expired'&&!(await confirm({title:c.confirmReplace,description:c.confirmReplaceText,confirmLabel:c.replace,cancelLabel:c.keep})).confirmed)return;
  const active=link&&link.status!=='revoked'?link.id:null;
  void send({action:'create_link',actionId:crypto.randomUUID(),id:crypto.randomUUID(),workId,packageId:pkg.id,supplierId,replacesLinkId:active,expiresInDays:days[supplierId]??14});
 }
 async function revoke(link:BidPortalLink){
  if(!(await confirm({title:c.confirmRevoke,description:c.confirmRevokeText,confirmLabel:c.revoke,cancelLabel:c.keep,tone:'danger'})).confirmed)return;
  void send({action:'revoke_link',actionId:crypto.randomUUID(),id:link.id,workId,packageId:pkg.id,supplierId:link.supplierId,revision:link.revision});
 }
 async function copyLink(url:string){try{await navigator.clipboard.writeText(url);setNotice(c.copied);}catch{setNotice(c.copyFailed);}}
 const writable=!readOnly&&(pkg.status==='draft'||pkg.status==='open');
 return <section data-bid-portal-links className="min-w-0 space-y-3 rounded-2xl border border-[#d7e1ea] bg-white p-4">
  {dialogNode}
  <div className="flex flex-wrap items-start justify-between gap-2"><h4 className="text-base font-semibold">{c.title}</h4><Button type="button" variant="secondary" className="min-h-11" disabled={saving} onClick={()=>{setFresh(null);void load();}}>{c.refresh}</Button></div>
  <p className="text-sm text-[#52627a]">{c.intro}</p>
  <p data-bid-portal-replaces-note className="text-xs text-[#52627a]">{c.replacesNote}</p>
  {!writable&&!readOnly&&<p className="text-xs text-[#52627a]">{c.closedNote}</p>}
  {error&&<div role="alert" data-bid-portal-links-error className="space-y-2 rounded-xl bg-[#fff4f2] p-3 text-sm text-[#8a2a1b]"><p>{error}</p>{retryable&&<Button type="button" variant="secondary" className="min-h-11" disabled={saving} onClick={()=>{const last=pending.current;if(last)void send(last);}}>{c.retry}</Button>}</div>}
  {notice&&<p role="status" className="text-sm text-[#18573a]">{notice}</p>}
  {filesError&&data&&<p role="alert" className="text-sm text-[#8a2a1b]">{c.filesError}</p>}
  {loadError&&!data?<div role="alert" className="space-y-2 text-sm"><p>{c.loadError}</p><Button type="button" variant="secondary" className="min-h-11" onClick={()=>void load()}>{c.retry}</Button></div>
  :!data?<p role="status" className="text-sm text-[#52627a]">{c.loading}</p>
  :<ul className="grid min-w-0 gap-3 md:grid-cols-2">{pkg.vendors.map(vendor=>{const row=data.vendors.find(v=>v.supplierId===vendor.supplierId),link=row?.link??null,shown=fresh?.supplierId===vendor.supplierId?fresh:null;
   return <li key={vendor.supplierId} data-bid-portal-vendor={vendor.name} className="min-w-0 space-y-2 rounded-xl border border-[#d7e1ea] p-3">
    <p className="break-words font-semibold">{vendor.name}</p>
    <p data-bid-portal-link-status={link?.status??'none'} className="text-sm">{link?c.status[link.status]:c.none}{link&&(link.status==='active'||link.status==='claimed')?` · ${c.expires}: ${stamp(link.expiresAt,en)}`:''}</p>
    {row&&row.portalSubmissions>0&&row.lastPortalSubmissionAt&&<p data-bid-portal-submissions={row.portalSubmissions} className="text-xs text-[#52627a]">{c.submissions(row.portalSubmissions,stamp(row.lastPortalSubmissionAt,en))}</p>}
    {(()=>{const own=files?.files.filter(file=>file.supplierId===vendor.supplierId)??[];return own.length>0&&<div data-bid-portal-owner-files={own.length} className="space-y-1"><p className="text-sm font-semibold">{c.files}</p><ul className="space-y-1">{own.map(file=><li key={file.id} className="flex min-w-0 flex-wrap items-center justify-between gap-2 text-sm"><span className="min-w-0 break-all">{file.name}</span><a href={api+'?'+new URLSearchParams({fileId:file.id})} download className="inline-flex min-h-11 items-center rounded-full border border-[#d7e1ea] bg-white px-3 text-sm font-semibold text-[#162543] hover:bg-[#f6f9fb]" aria-label={`${c.download}: ${file.name}`}>{c.download}</a></li>)}</ul></div>;})()}
    {shown&&<div className="space-y-2 rounded-xl bg-[#f3f8fb] p-3"><label className="block min-w-0 text-sm font-semibold">{c.linkLabel(vendor.name)}<input data-bid-portal-url className={field+' text-sm'} readOnly value={shown.url} onFocus={event=>event.currentTarget.select()}/></label>
     <Button type="button" className="min-h-11" onClick={()=>void copyLink(shown.url)}>{c.copyLink}</Button><p className="text-xs text-[#52627a]">{c.once}</p></div>}
    {writable&&<div className="flex flex-wrap items-end gap-2">
     <label className="block text-sm font-semibold">{c.days}<select className={field+' w-32'} value={days[vendor.supplierId]??14} disabled={saving} onChange={event=>setDays({...days,[vendor.supplierId]:Number(event.target.value)})}>{[1,3,7,14,30].map(n=><option key={n} value={n}>{c.dayOptions(n)}</option>)}</select></label>
     <Button type="button" variant={link&&link.status!=='revoked'&&link.status!=='expired'?'secondary':'default'} className="min-h-11" disabled={saving} onClick={()=>void create(vendor.supplierId,link)}>{link&&link.status!=='revoked'&&link.status!=='expired'?c.replace:c.create}</Button>
     {link&&(link.status==='active'||link.status==='claimed')&&<Button type="button" variant="ghost" className="min-h-11" disabled={saving} onClick={()=>void revoke(link)}>{c.revoke}</Button>}
    </div>}
   </li>;})}</ul>}
  {data&&<BidOwnerQuestions accountId={accountId} workId={workId} pkg={pkg} en={en} readOnly={readOnly}/>}
 </section>;
}
