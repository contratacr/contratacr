'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {useLocale} from 'next-intl';
import {Button} from '@/components/ui/button';
import {ProModal as Modal} from '@/components/pro/modal';
import {closeProStep,pushProParams} from '@/lib/pro/navigation';
import {proMoney} from '@/lib/pro/money';
import type {ClientStatementPage,ClientStatementEntry} from '@/lib/pro/client-statement';
import {useProSearchParams} from './use-pro-search-params';

export function ClientAccountStatement({clientId}:{clientId:string}){
 const en=useLocale()==='en',t=useCallback((es:string,english:string)=>en?english:es,[en]);
 const params=useProSearchParams(),open=params.get('estadoCuenta')==='1',workOpen=!!params.get('cuenta');
 const [data,setData]=useState<ClientStatementPage|null>(null),[loading,setLoading]=useState(false),[error,setError]=useState('');
 const sequence=useRef(0),busy=useRef(false),version=useRef<string|null>(null);
 const load=useCallback(async(after='')=>{
  if(after&&busy.current)return;
  const request=++sequence.current;busy.current=true;setLoading(true);setError('');
  if(!after){setData(null);version.current=null;}
  try{
   const response=await fetch('/api/pro/client-statement?'+new URLSearchParams({clientId,after}),{cache:'no-store'});
   if(!response.ok)throw Error();const body:ClientStatementPage=await response.json();
   if(request!==sequence.current)return;
   if(after&&version.current!==body.revision){setError(t('Los datos cambiaron. Actualice el estado de cuenta para continuar.','Data changed. Refresh the account statement to continue.'));return;}
   version.current=body.revision;
   setData(previous=>({...body,items:after&&previous?[...previous.items,...body.items.filter(item=>!previous.items.some(old=>old.id===item.id))]:body.items}));
  }catch{if(request===sequence.current)setError(t('No se pudo cargar el estado de cuenta.','Could not load the account statement.'));}
  finally{if(request===sequence.current){busy.current=false;setLoading(false);}}
 },[clientId,t]);
 const invalidate=useCallback(()=>{sequence.current++;busy.current=false;},[]);
 useEffect(()=>{
  if(!open||workOpen)return;
  const timer=setTimeout(()=>void load(),0);
  return()=>{clearTimeout(timer);invalidate();};
 },[open,workOpen,load,invalidate]);
 const money=(value:number)=>proMoney(value/100);
 const [copied,setCopied]=useState('');
 const printHref='/api/pro/client-statement-print?'+new URLSearchParams({clientId,lang:en?'en':'es'});
 async function copyLink(){try{await navigator.clipboard.writeText(new URL(printHref,window.location.origin).toString());setCopied(t('Enlace copiado.','Link copied.'));}catch{setCopied(t('No se pudo copiar el enlace. Use «Imprimir o guardar PDF».','Could not copy the link. Use “Print or save PDF”.'));}}
 const date=(value:string)=>new Date(value.length===10?value+'T12:00:00-06:00':value).toLocaleDateString(en?'en-US':'es-CR',{timeZone:'America/Costa_Rica',dateStyle:'medium'});
 const label=(entry:ClientStatementEntry)=>entry.kind==='credit_note'?t('Nota de crédito aplicada','Credit note applied'):entry.kind==='credit_note_reversal'?t('Nota de crédito revertida','Credit note reversed'):entry.kind==='agreement'?t('Importe acordado','Agreed amount'):entry.kind==='payment_void'?t('Anulación de abono','Payment reversal'):entry.kind==='direct_payment'?t('Pago directo','Direct payment'):t('Abono al trabajo','Job payment');
 const method=(value:string|null)=>({cash:t('Efectivo','Cash'),card:t('Tarjeta','Card'),transfer:t('Transferencia','Transfer'),sinpe:'SINPE',other:t('Otro','Other')} as Record<string,string>)[value??'']??t('Medio sin indicar','Method not specified');
 return <>
  <Button variant="secondary" onClick={()=>pushProParams({estadoCuenta:'1'})}>{t('Estado de cuenta','Account statement')}</Button>
  {open&&!workOpen&&<Modal title={t('Estado de cuenta','Account statement')} ariaLabel={t('Estado de cuenta','Account statement')} closeLabel={t('Cerrar','Close')} mobilePresentation="fullscreen" onClose={()=>closeProStep('estadoCuenta')}>
   <div className="space-y-4" data-client-statement="">
    {data&&<>
     <p className="break-words font-bold">{data.client.name}</p>
     <div data-client-statement-share className="space-y-2 rounded-xl border border-[#d7e1ea] p-3">
      <div className="flex flex-wrap gap-2">
       <a data-client-statement-print className="inline-flex min-h-11 items-center rounded-full border border-[#d7e1ea] px-4 text-sm font-semibold text-[#162543]" target="_blank" rel="noopener" href={printHref}>{t('Imprimir o guardar PDF','Print or save PDF')}</a>
       <Button type="button" variant="secondary" className="min-h-11" data-client-statement-copy onClick={()=>void copyLink()}>{t('Copiar enlace','Copy link')}</Button>
      </div>
      {copied&&<p role="status" className="text-sm text-[#18573a]">{copied}</p>}
      <p className="text-xs text-[#52627a]">{t('La copia imprimible muestra las mismas cifras y movimientos. El enlace solo abre con su sesión iniciada; para compartirlo con el cliente, imprímalo o guárdelo como PDF. No se envía nada.','The printable copy shows the same figures and entries. The link only opens while you are signed in; to share it with the customer, print it or save it as a PDF. Nothing is sent.')}</p>
     </div>
     <dl className="grid grid-cols-2 gap-3 rounded-2xl bg-[#f3f8fb] p-4">
      {[[t('Por cobrar en trabajos','Outstanding on jobs'),data.summary.balanceCents],[t('Abonos a trabajos','Job payments'),data.summary.paidCents],[t('Importes acordados','Agreed amounts'),data.summary.agreedCents]].map(([title,value])=><div key={title}><dt className="text-xs text-[#52627a]">{title}</dt><dd className="break-words text-lg font-bold">{money(value as number)}</dd></div>)}
      {data.summary.creditCents>0&&<div><dt className="text-xs">{t('A favor en trabajos','Credit on jobs')}</dt><dd className="font-bold">{money(data.summary.creditCents)}</dd></div>}
      {data.summary.creditNotesCents>0&&<div data-statement-credit-notes=""><dt className="text-xs text-[#52627a]">{t('Notas de crédito aplicadas','Applied credit notes')}</dt><dd className="break-words text-lg font-bold">{money(data.summary.creditNotesCents)}</dd></div>}
     </dl>
     {data.summary.creditNotesCents>0&&<p className="text-xs text-[#52627a]">{t('«Por cobrar» ya descuenta las notas de crédito aplicadas. No son dinero recibido ni dejan saldo a favor.','“Outstanding” already deducts applied credit notes. They are not money received and never leave a credit in favour.')}</p>}
     <p className="text-xs text-[#52627a]">{t('Saldo interno en colones: importe acordado menos abonos. Las cotizaciones y los borradores de factura no suman deuda aquí; Estadísticas › Reportes muestra aparte lo facturado pendiente de cobro. Los materiales ya incluidos en un acuerdo no se cobran otra vez.','Internal CRC balance: agreed amount minus payments. Quotes and invoice drafts do not add debt here; Statistics › Reports shows invoiced amounts still to collect separately. Materials included in an agreement are not charged again.')}</p>
     {data.summary.unpriced>0&&<p className="text-sm">{t('Trabajos sin importe acordado: ','Jobs without an agreed amount: ')}<strong>{data.summary.unpriced}</strong></p>}
     {data.summary.standaloneReceivedCents>0&&<div className="space-y-1 rounded-xl border border-[#d7e1ea] p-3 text-sm"><p>{t('Pagos directos recibidos: ','Direct payments received: ')}<strong>{money(data.summary.standaloneReceivedCents)}</strong></p><details><summary className="min-h-11 cursor-pointer font-semibold">{t('Detalle de borradores (opcional)','Draft details (optional)')}</summary><p>{t('Sin aplicar a borradores: ','Not applied to drafts: ')}{money(data.summary.standaloneAvailableCents)}</p></details><p className="text-xs text-[#52627a]">{t('Se muestran por separado porque no están vinculados a un trabajo. No reducen automáticamente su saldo.','Shown separately because they are not linked to a job. They do not automatically reduce its balance.')}</p></div>}
    </>}
    {error&&<div role="alert" className="space-y-2"><p>{error}</p><Button variant="secondary" disabled={loading} onClick={()=>void load()}>{t('Reintentar','Retry')}</Button></div>}
    {loading&&!data&&<p role="status">{t('Cargando estado de cuenta…','Loading account statement…')}</p>}
    {data&&<h3 className="font-bold">{t('Movimientos recientes','Recent entries')}</h3>}
    {data&&!data.items.length&&!error&&<p>{t('Todavía no hay importes acordados ni pagos registrados.','No agreed amounts or payments have been recorded yet.')}</p>}
    {data?.items.map(entry=><article key={entry.id} className="space-y-2 rounded-xl border border-[#e5e7eb] p-4 text-sm">
     <div className="flex flex-wrap justify-between gap-2"><h4 className="font-bold">{label(entry)}</h4><strong>{money(entry.amountCents)}</strong></div>
     {entry.workTitle&&<p className="break-words">{entry.workTitle}{entry.workCancelled?' · '+t('Trabajo cancelado','Cancelled job'):''}</p>}
     {entry.reversed&&<p className="font-semibold text-red-800">{entry.kind==='credit_note'?t('Aplicación revertida; se conserva en el historial','Application reversed; retained in history'):t('Abono anulado; se conserva en el historial','Voided payment; retained in history')}</p>}
     {entry.creditNote&&<div className="space-y-1" data-statement-credit-note={entry.creditNote.code}><p className="break-words font-semibold">{entry.creditNote.code}{entry.creditNote.draftTitle?' · '+t('Borrador: ','Draft: ')+entry.creditNote.draftTitle:''}</p>{entry.creditNote.reason&&<p className="whitespace-pre-wrap break-words">{entry.kind==='credit_note_reversal'?t('Motivo de la reversión: ','Reversal reason: '):t('Motivo: ','Reason: ')}{entry.creditNote.reason}</p>}</div>}
     {entry.superseded&&<p className="text-xs">{t('Importe anterior, sustituido por un acuerdo posterior','Previous amount, replaced by a later agreement')}</p>}
     {entry.kind==='agreement'&&entry.previousAgreementCents!==null&&<p>{t('Importe anterior: ','Previous amount: ')}{money(entry.previousAgreementCents)}</p>}
     {entry.kind!=='direct_payment'&&<p className="text-xs">{t('Cambio en el saldo al registrarse: ','Balance change when recorded: ')}{entry.balanceDeltaCents>0?'+':''}{money(entry.balanceDeltaCents)}</p>}
     {(entry.kind==='payment'||entry.kind==='direct_payment')&&<><p>{entry.receivedOn?t('Recibido el ','Received on ')+date(entry.receivedOn):t('Fecha del pago sin indicar','Payment date not specified')}</p><p className="break-words">{method(entry.method)}{entry.reference?' · '+entry.reference:''}</p></>}
     {entry.label&&entry.label!==entry.reference&&<p className="whitespace-pre-wrap break-words">{entry.label}</p>}
     <p className="text-xs text-[#52627a]">{t('Registrado el ','Recorded on ')}{date(entry.at)}</p>
     {entry.workId&&<Button variant="secondary" disabled={loading||!!error} onClick={()=>pushProParams({cuenta:entry.workId,registro:null,asiento:null})}>{t('Ver trabajo','View job')}</Button>}
    </article>)}
    {data?.nextCursor&&!error&&<Button variant="secondary" disabled={loading} onClick={()=>void load(data.nextCursor!)}>{t('Ver más movimientos','Show more entries')}</Button>}
    <Button variant="secondary" disabled={loading} onClick={()=>void load()}>{t('Actualizar estado de cuenta','Refresh account statement')}</Button>
   </div>
  </Modal>}
 </>;
}
