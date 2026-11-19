'use client';
import {proPhone} from '@/lib/pro/phone';
import {JobCustomerBalance} from './job-customer-balance';
import {useCallback,useEffect,useRef,useState,useSyncExternalStore,type FormEvent} from 'react';
import {useLocale,useTranslations} from 'next-intl';
import {Button} from '@/components/ui/button';
import {Modal} from '@/components/ui/modal';
import {useAppDialog} from '@/hooks/use-app-dialog';
import {InvoicePayments} from './invoice-payments';
import {InvoiceEinvoice} from './invoice-einvoice';
import {InvoicePaymentLinkStep} from './payment-link-panel';
import {InvoiceDetailEditor} from './invoice-detail-editor';
import {InvoiceArchiveGate} from './invoice-archive-gate';
import {InvoiceReceiverFields} from './invoice-receiver-fields';
import {InvoicePreparationFields} from './invoice-preparation-fields';
import {emptyInvoicePreparation,invoicePreparationSchema} from '@/lib/pro/invoice-preparation';
import {CatalogSelect} from './catalog-select';
import {useProSearchParams} from './use-pro-search-params';
import {closeProStep,pushProParams,replaceProParams} from '@/lib/pro/navigation';
import {inputCents} from '@/lib/pro/client-operations';
import {proMoney} from '@/lib/pro/money';
import type {Client} from '@/lib/pro/business';
import {invoiceReceiverSchema} from '@/lib/pro/invoice-drafts';
import type {InvoiceDraft,InvoiceSource,InvoiceSourceKind,InvoiceReceiver} from '@/lib/pro/invoice-drafts';
import {formatQuantity} from '@/lib/pro/allowances';

// Several «Prepare invoice draft» actions can be mounted at once (job dialog,
// customer card, each connected quote). Only one may render the URL's editor:
// the action named by `facturaOrigen`, or, for an existing draft opened without
// an origin (billing, payment plan), the first action mounted. Round 7B bug 6.
const editorClaims:symbol[]=[];const claimListeners=new Set<()=>void>();
function claimEditor(token:symbol){editorClaims.push(token);for(const listener of claimListeners)listener();return()=>{const index=editorClaims.indexOf(token);if(index>=0)editorClaims.splice(index,1);for(const listener of claimListeners)listener();};}
function subscribeClaims(listener:()=>void){claimListeners.add(listener);return()=>{claimListeners.delete(listener);};}
export function invoiceOrigin(kind:InvoiceSourceKind,sourceId:string){return kind+':'+sourceId;}
export function InvoiceDraftAction({kind,sourceId,disabled=false,secondary=true}:{kind:InvoiceSourceKind;sourceId:string;disabled?:boolean;secondary?:boolean}){
 const [token]=useState(()=>Symbol('invoice-action'));
 useEffect(()=>claimEditor(token),[token]);
 const first=useSyncExternalStore(subscribeClaims,()=>editorClaims[0]===token,()=>false);
 const en=useLocale()==='en',params=useProSearchParams(),simple=useTranslations('ProSimple');
 // On a deep reload the parent portal is appended after its children. Mount
 // the editor on the next task so it stays above the quote/job dialog.
 const [parentMounted,setParentMounted]=useState(false);
 useEffect(()=>{const timer=setTimeout(()=>setParentMounted(true),0);return()=>clearTimeout(timer);},[]);
 const origin=invoiceOrigin(kind,sourceId),requestedOrigin=params.get('facturaOrigen'),mine=requestedOrigin?requestedOrigin===origin:first;
 const trigger=<Button variant="secondary" disabled={disabled} onClick={()=>pushProParams({factura:'nueva',facturaOrigen:origin})}>{en?'Prepare invoice draft':'Preparar factura'}</Button>;
 return <>{secondary?<details data-invoice-options className="rounded-xl border border-[#d7e1ea] p-3"><summary className="cursor-pointer text-sm font-semibold">{simple('invoiceOptional')}</summary><div className="mt-3">{trigger}</div></details>:trigger}
 {parentMounted&&mine&&params.get('factura')&&<InvoiceDraftEditor key={kind+':'+sourceId} kind={kind} sourceId={sourceId}/>}</>;
}
type DraftEditorProps={kind?:InvoiceSourceKind;sourceId?:string;onSaved?:(draft:InvoiceDraft)=>void};
export function InvoiceDraftEditor(props:DraftEditorProps){const params=useProSearchParams(),id=params.get('factura')??'nueva';if(id!=='nueva'&&params.get('pagosFactura')===id)return <InvoicePayments id={id}/>;if(id!=='nueva'&&params.get('fiscalFactura')===id)return <InvoiceEinvoice id={id}/>;if(id!=='nueva'&&params.get('cobroFactura')===id)return <InvoicePaymentLinkStep id={id}/>;return <InvoiceArchiveGate id={params.get('factura')??'nueva'}>{onCreated=>params.get('detalleFactura')==='1'?<InvoiceDetailEditor onSaved={props.onSaved}/>:<InvoiceDraftForm {...props} onCreated={onCreated}/>}</InvoiceArchiveGate>;}
function InvoiceDraftForm({kind='work',sourceId='',onSaved,onCreated}:DraftEditorProps&{onCreated:(id:string)=>Promise<void>}){
 const en=useLocale()==='en',params=useProSearchParams(),id=params.get('factura')||'nueva';
 const t=useCallback((es:string,eng:string)=>en?eng:es,[en]);
 const {confirm,dialogNode}=useAppDialog();
 const [source,setSource]=useState<InvoiceSource|null>(null),[draft,setDraft]=useState<InvoiceDraft|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[saving,setSaving]=useState(false),[dirty,setDirty]=useState(false),[notice,setNotice]=useState('');
 const [receiver,setReceiver]=useState<InvoiceReceiver>({name:'',identification:'',email:'',phone:'',address:''}),[title,setTitle]=useState(''),[notes,setNotes]=useState(''),[client,setClient]=useState<Client>();
 const [preparation,setPreparation]=useState(emptyInvoicePreparation),[preparationError,setPreparationError]=useState('');
 const request=useRef(0),lock=useRef(false),revision=useRef(0),clientRequest=useRef(0);
 const [receiverLoading,setReceiverLoading]=useState(false);
 async function chooseClient(row:Client|undefined){const token=++clientRequest.current;setClient(row);setDirty(true);setError('');if(!row){setReceiverLoading(false);return;}setReceiverLoading(true);try{const response=await fetch('/api/pro/client-fiscal?'+new URLSearchParams({clientId:row.id}),{cache:'no-store'}),body=await response.json();if(!response.ok)throw Error(t('No se pudieron cargar los datos para facturas del cliente. Vuelva a seleccionarlo.','Could not load customer invoice details. Select the customer again.'));if(token===clientRequest.current)setReceiver({...body.receiver,phone:proPhone(body.receiver.phone)});}catch(e){if(token===clientRequest.current){setClient(undefined);setError((e as Error).message);}}finally{if(token===clientRequest.current)setReceiverLoading(false);}}
 const invalidate=useCallback(()=>{request.current++;},[]);
 const load=useCallback(async(after='')=>{
  const sequence=++request.current;setLoading(true);setError('');
  try{
   const query=id==='nueva'?new URLSearchParams({kind,sourceId}):new URLSearchParams({id,after});
   const response=await fetch('/api/pro/invoice-drafts?'+query,{cache:'no-store'}),body=await response.json();if(!response.ok)throw Error(t('No se pudo abrir el borrador. Revise que el origen y el cliente sigan disponibles.','Could not open the draft. Check that the source and customer are available.'));if(sequence!==request.current)return;
   if(body.source){
    if(body.existingId){replaceProParams({factura:body.existingId});return;}
    setPreparation({...emptyInvoicePreparation(),...body.issuerDefaults,...body.preparationDefaults});setPreparationError('');setSource(body.source);setReceiver({...body.source.receiver,phone:proPhone(body.source.receiver.phone)});setTitle(body.source.title);setNotes(body.defaultNotes??'');setDirty(false);
   }else{
    const next:InvoiceDraft=body.draft;
    if(after&&revision.current!==next.revision)throw Error(t('El borrador cambió. Vuelva a abrirlo para ver sus registros.','The draft changed. Reopen it to see its records.'));
    revision.current=next.revision;
    setDraft(old=>after&&old?{...next,materials:[...old.materials,...next.materials.filter(row=>!old.materials.some(item=>item.entryId===row.entryId))]}:next);
    if(!after){setPreparation(next.preparation??emptyInvoicePreparation());setPreparationError('');setReceiver({...next.receiver,phone:proPhone(next.receiver.phone)});setTitle(next.title);setNotes(next.notes);setDirty(false);}
    return next;
   }
  }catch(e){if(sequence===request.current)setError((e as Error).message);}
  finally{if(sequence===request.current)setLoading(false);}
 },[id,kind,sourceId,t]);
 useEffect(()=>{const timer=setTimeout(()=>void load(),0);return()=>{clearTimeout(timer);invalidate();};},[load,invalidate]);
 async function close(){
  if(saving)return;
  if(dirty){const answer=await confirm({title:t('¿Salir sin guardar?','Leave without saving?'),description:t('Los cambios de este formulario todavía no se han guardado.','Changes in this form have not been saved yet.'),confirmLabel:t('Salir sin guardar','Leave without saving')});if(!answer.confirmed)return;}
  closeProStep('factura','facturaOrigen');
 }
 async function save(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(lock.current||loading||receiverLoading||error||!source&&!draft)return;
  const recipient=invoiceReceiverSchema.safeParse(receiver);if(!recipient.success){setPreparationError(t('Revise los datos del receptor.','Check recipient details.'));const key=String(recipient.error.issues[0].path[0]??'name'),field=document.querySelector<HTMLInputElement>(`#pro-invoice-draft [data-receiver-field="${key}"]`);for(let node=field?.parentElement;node;node=node.parentElement)if(node instanceof HTMLDetailsElement)node.open=true;field?.focus();return;}
  const checked=invoicePreparationSchema.safeParse(preparation);
  if(!checked.success){setPreparationError(t('Revise las condiciones: una fecha válida y, para crédito, un plazo de 1 a 3650 días. Compruebe también correo y código de actividad del emisor.','Check the terms: a valid date and, for credit, a term of 1–3650 days. Also check issuer email and activity code.'));return;}
  setPreparationError('');
  const values=new FormData(event.currentTarget);
  const payload:Record<string,unknown>=draft?{action:'update',id:draft.id,revision:draft.revision}:{action:'create',kind,sourceId,clientId:source?.clientId??client?.id,fingerprint:source?.fingerprint};
  if(!draft&&source?.totalCents===null){const amount=inputCents(String(values.get('total')||''));if(amount===null){setError(t('Defina un total válido para este borrador.','Set a valid total for this draft.'));return;}payload.manualTotalCents=amount;}
  await mutate({...payload,title,notes,receiver:recipient.data,preparation:checked.data});
 }
 async function mutate(payload:Record<string,unknown>){
  if(lock.current)return;lock.current=true;setSaving(true);setError('');setNotice('');
  try{
   const response=await fetch('/api/pro/invoice-drafts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}),body=await response.json();
   if(!response.ok)throw Error(response.status===409?t('El borrador o su origen cambiaron. Vuelva a abrirlo antes de guardar.','The draft or source changed. Reopen it before saving.'):body.reason==='credit_notes'?t('El total no puede quedar por debajo de los pagos y las notas de crédito aplicados. Revierta primero la aplicación que desea corregir.','The total cannot be lower than applied payments and credit notes. Revert the application you want to correct first.'):body.reason==='emitted'?t('Este borrador ya se emitió como comprobante electrónico y quedó bloqueado. Para corregirlo emita una nota de crédito.','This draft was already issued as an electronic document and is locked. Issue a credit note to correct it.'):body.reason==='applied_payments'?t('El total no puede ser menor que los pagos aplicados. Revise las aplicaciones antes de reducirlo.','The total cannot be lower than applied payments. Review applications before reducing it.'):t('No se pudo guardar. Revise el cliente y los datos del borrador.','Could not save. Check the customer and draft details.'));
   setDirty(false);setNotice(t('Borrador guardado. No se ha emitido ninguna factura.','Draft saved. No invoice has been issued.'));
   if(id==='nueva'){await onCreated(body.id);replaceProParams({factura:body.id});}else {const saved=await load();if(saved)onSaved?.(saved);}
  }catch(e){setError(e instanceof TypeError?t('No pudimos confirmar el resultado. Reabra este origen para recuperar su borrador.','We could not confirm the result. Reopen this source to recover its draft.'):(e as Error).message);}finally{lock.current=false;setSaving(false);}
 }
 const content=draft??source;
 const money=(cents:number)=>proMoney(cents/100);
 function receiverField(key:keyof InvoiceReceiver,label:string,type='text',required=false){
  return <label className="block text-sm font-bold">{label}<input autoCorrect="off" autoCapitalize="none" spellCheck={false} aria-label={label} type={type} required={required} maxLength={key==='address'?500:key==='phone'?30:key==='identification'?40:key==='email'?254:160} value={receiver[key]} onChange={e=>{setReceiver(old=>({...old,[key]:e.target.value}));setError('');setPreparationError('');setDirty(true);}} className="mt-1 min-h-11 w-full min-w-0 rounded-xl border border-[#e5e7eb] px-3 text-base font-normal"/></label>;
 }
 return <><Modal title={t('Borrador de factura','Invoice draft')} ariaLabel={t('Borrador de factura','Invoice draft')} onClose={()=>void close()} closeLabel={t('Cerrar','Close')} mobilePresentation="fullscreen" footer={content&&!source?.multipleWorks?<Button type="submit" form="pro-invoice-draft" disabled={loading||receiverLoading||saving||!!error||!draft&&!source?.clientId&&!client}>{saving?t('Guardando…','Saving…'):t('Guardar borrador','Save draft')}</Button>:undefined} footerNotice={error?<p role="alert" className="text-sm text-red-700">{error}</p>:undefined}>
  <div className="space-y-4" data-invoice-draft="">
   <p className="rounded-xl bg-[#f3f8fb] p-3 text-sm text-[#52627a]">{t('Solo borrador. No tiene validez fiscal, no genera deuda ni realiza cobros.','Draft only. It has no fiscal validity and does not create debt or charge payments.')}</p>
   {loading&&!content&&<p role="status">{t('Preparando datos…','Preparing details…')}</p>}
   {error&&<Button variant="secondary" disabled={loading||saving} onClick={()=>void load()}>{t('Volver a cargar','Reload')}</Button>}
   {receiverLoading&&<p role="status">{t('Cargando datos para facturas…','Loading invoice details…')}</p>}{notice&&<p role="status" className="text-sm text-green-800">{notice}</p>}
   {content&&<>
    {source?.multipleWorks?<p role="alert">{t('Esta cotización tiene varios trabajos. Prepare el borrador desde el trabajo correspondiente para elegir su importe y sus materiales.','This quote has several jobs. Prepare the draft from the relevant job to choose its amount and materials.')}</p>:null}
    {draft?.sourceChanged&&<div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm">
     <p>{draft.sourceAvailable?t('El origen cambió. Este borrador conserva los datos guardados; actualícelo para revisar los nuevos importes, materiales y abonos.','The source changed. This draft retains its saved data; refresh to review new amounts, materials and payments.'):t('El origen ya no está disponible. Los datos del borrador se conservan.','The source is no longer available. Draft data is retained.')}</p>
     {draft.sourceAvailable&&<Button variant="secondary" disabled={saving||loading||dirty||!!error||draft.sourceNeedsAmount} onClick={()=>void mutate({action:'refresh',id:draft.id,revision:draft.revision,fingerprint:draft.currentFingerprint})}>{t('Actualizar desde el origen','Refresh from source')}</Button>}
     {draft.sourceNeedsAmount&&<p>{t('Defina el importe acordado de este trabajo antes de actualizar el borrador. No se reutilizará automáticamente el total de una cotización compartida.','Set this job’s agreed amount before refreshing the draft. A shared quote’s full amount will not be reused automatically.')}</p>}
     {dirty&&<p>{t('Guarde sus cambios antes de actualizar el origen.','Save your changes before refreshing the source.')}</p>}
    </div>}
    <dl className="space-y-2 rounded-2xl bg-[#f3f8fb] p-4 text-sm">
     <div>{t('Total del borrador: ','Draft total: ')}<strong>{content.totalCents===null?t('Por definir','To be set'):money(content.totalCents)}</strong></div>
     <div className="text-xs text-[#52627a]">{draft?.kind==='direct'?t('Factura directa preparada con el cliente y las líneas guardadas.','Direct invoice prepared with the saved customer and lines.'):draft?.editedDetail?t('Importe calculado del detalle editado. El acuerdo y el saldo del trabajo se conservan.','Amount calculated from edited details. The job agreement and balance are retained.'):content.basis==='agreement'?t('Se usa el importe acordado del trabajo, incluidos sus materiales.','Uses the agreed job amount, including its materials.'):content.basis==='quote'?t('Importes copiados de la cotización; requieren revisión fiscal.','Amounts copied from the quote; fiscal review is required.'):t('Importe preparado manualmente; requiere revisión fiscal.','Manually prepared amount; fiscal review is required.')}</div>
     {content.paidCents!==null&&<div>{t('Abonos del trabajo al preparar: ','Job payments when prepared: ')}{money(content.paidCents)}</div>}
     {content.balanceCents!==null&&<div>{t('Saldo del trabajo al preparar el borrador: ','Job balance when the draft was prepared: ')}{money(content.balanceCents)}</div>}{(()=>{const job='workId' in content&&content.workId?content.workId:content.kind==='work'?content.sourceId:null;return job?<JobCustomerBalance key={job} workId={job}/>:null;})()}
     {content.materialCount>0&&<div>{t('Materiales utilizados: ','Used materials: ')}{content.materialCount} · {t('Costo: ','Cost: ')}{proMoney(content.materialCost)}</div>}
    </dl>
    {draft&&<div className="space-y-2"><Button variant="secondary" disabled={dirty||loading||saving} onClick={()=>pushProParams({detalleFactura:'1'})}>{t('Editar detalle de factura','Edit invoice details')}</Button><Button variant="secondary" disabled={dirty||loading||saving} onClick={()=>pushProParams({pagosFactura:draft.id})}>{t('Pagos del borrador','Draft payments')}</Button><Button variant="secondary" data-invoice-einvoice-open disabled={dirty||loading||saving} onClick={()=>pushProParams({fiscalFactura:draft.id})}>{t('Comprobante electrónico','Electronic document')}</Button><Button variant="secondary" data-invoice-payment-link-open disabled={dirty||loading||saving} onClick={()=>pushProParams({cobroFactura:draft.id})}>{t('Cobro en línea','Online payment')}</Button>{dirty&&<p className="text-xs text-[#68778d]">{t('Guarde estos cambios antes de editar las líneas.','Save these changes before editing lines.')}</p>}{draft.editedDetail&&draft.kind!=='direct'&&<p className="text-xs text-[#68778d]">{t('Importe del origen guardado: ','Saved source amount: ')}{money(draft.editedDetail.sourceTotalCents)} · {t('El detalle editado se conserva al actualizar el origen.','Edited details are retained when refreshing the source.')}</p>}</div>}
    <p className="text-xs text-[#68778d]">{draft?.kind==='direct'?t('Editar estas líneas no modifica el inventario ni registra cobros.','Editing these lines does not change inventory or record payments.'):t('Los materiales no se suman otra vez al total. Los abonos mostrados son una referencia histórica; consulte las aplicaciones vigentes en Pagos del borrador.','Materials are not added to the total again. Saved job payments are a historical reference; use Draft payments to review current applications.')}</p>
    {!source?.multipleWorks&&<form id="pro-invoice-draft" onSubmit={save} className="space-y-4">
     <fieldset disabled={saving||loading||receiverLoading} className="space-y-4">
      <InvoicePreparationFields value={preparation} onChange={value=>{setPreparation(value);setPreparationError('');setDirty(true);}} error={preparationError} receiverId={receiver.identification}/>
      {!draft&&source&&!source.clientId&&<CatalogSelect kind="clients" value={client?.id??''} selected={client} label={t('Cliente guardado','Saved customer')} required onChange={row=>void chooseClient(row)}/>}
      <label className="block text-sm font-bold">{t('Concepto de la factura','Invoice description')}<input aria-label={t('Concepto de la factura','Invoice description')} required maxLength={160} value={title} onChange={e=>{setTitle(e.target.value);setDirty(true);}} className="mt-1 min-h-11 w-full rounded-xl border border-[#e5e7eb] px-3 text-base font-normal"/></label>
      {receiverField('name',t('Nombre del receptor','Recipient name'),'text',true)}
      {!draft&&source?.totalCents===null&&<label className="block text-sm font-bold">{t('Total previsto en colones','Expected total in CRC')}<input aria-label={t('Total previsto en colones','Expected total in CRC')} name="total" type="number" inputMode="decimal" min="0" max="100000000" step="0.01" required onChange={()=>setDirty(true)} className="mt-1 min-h-11 w-full rounded-xl border border-[#e5e7eb] px-3 text-base font-normal"/>{source.sharedQuote&&<span className="mt-1 block text-xs font-normal">{t('El presupuesto abarca varios trabajos. Indique solo el importe de este trabajo.','The quote covers several jobs. Enter only this job’s amount.')}</span>}</label>}
      <details className="rounded-xl border border-[#e5e7eb] p-3"><summary className="min-h-8 cursor-pointer text-sm font-semibold">{t('Datos fiscales y contacto','Fiscal and contact details')}</summary><div className="mt-3 space-y-3"><InvoiceReceiverFields value={receiver} onChange={value=>{setReceiver(old=>({...old,...value}));setError('');setPreparationError('');setDirty(true);}}/><p className="text-xs text-[#68778d]">{t('Se guardan solo en este borrador; la ficha del cliente no se modifica. La revisión fiscal sigue pendiente.','Saved only in this draft; the customer record is unchanged. Fiscal review is still pending.')}</p></div></details>
      <label className="block text-sm font-bold">{t('Notas del borrador (opcional)','Draft notes (optional)')}<textarea aria-label={t('Notas del borrador (opcional)','Draft notes (optional)')} maxLength={2000} value={notes} onChange={e=>{setNotes(e.target.value);setDirty(true);}} className="mt-1 min-h-24 w-full rounded-xl border border-[#e5e7eb] p-3 text-base font-normal"/></label>
     </fieldset>
    </form>}
    {draft?.editedDetail&&<details className="rounded-xl border border-[#e5e7eb] p-3"><summary className="min-h-8 cursor-pointer text-sm font-semibold">{t('Detalle de factura','Invoice details')} ({draft.editedDetail.lines.length})</summary><div className="mt-3 space-y-3">{draft.editedDetail.lines.map((line,index)=><p key={index} className="break-words text-sm">{line.description}<span className="block text-xs text-[#68778d]">{formatQuantity(line.quantity,en)} × {(()=>{const price=Number(line.unitPrice);return Math.abs(price*100-Math.round(price*100))<1e-6?proMoney(price,en):new Intl.NumberFormat(en?'en-US':'es-CR',{style:'currency',currency:'CRC',maximumFractionDigits:5}).format(price);})()} · CABYS: {line.cabys||t('pendiente','pending')}</span></p>)}</div></details>}
    {!!draft?.charges?.length&&<details className="rounded-xl border border-[#e5e7eb] p-3"><summary className="min-h-8 cursor-pointer text-sm font-semibold">{t('Otros cargos','Other charges')} ({draft.charges.length})</summary><div className="mt-3 space-y-3">{draft.charges.map((charge,index)=><p key={index} className="break-words text-sm">{charge.description}<span className="block text-xs text-[#68778d]">{charge.mode==='amount'?proMoney(Number(charge.value)):charge.value+'% '+t('sobre ','of ')+proMoney(Number(charge.base))}{charge.thirdParty?' · '+charge.thirdParty.name:''}</span></p>)}<p className="text-xs text-[#68778d]">{t('Incluidos en el total. Puede modificarlos en Editar detalle de factura.','Included in the total. Change them in Edit invoice details.')}</p></div></details>}
    {content.lines.length>0&&<details className="rounded-xl border border-[#e5e7eb] p-3"><summary className="min-h-8 cursor-pointer text-sm font-semibold">{draft?.editedDetail?t('Detalle del origen','Source details'):t('Detalle reutilizado','Reused details')} ({content.lines.length})</summary><div className="mt-3 space-y-3">{content.lines.map((line,index)=><p key={index} className="break-words text-sm">{line.description}<span className="block text-[#52627a]">{formatQuantity(line.quantity,en)} × {proMoney(line.unitAmount)}</span></p>)}<p className="text-xs text-[#68778d]">{t('Detalle comercial del origen, pendiente de clasificación e impuestos para una futura factura fiscal.','Commercial source details, pending classification and taxes for a future fiscal invoice.')}</p></div></details>}
    {draft&&draft.materialCount>0&&<details className="rounded-xl border border-[#e5e7eb] p-3"><summary className="min-h-8 cursor-pointer text-sm font-semibold">{t('Materiales del borrador','Draft materials')} ({draft.materialCount})</summary><div className="mt-3 space-y-3">{draft.materials.map(material=><p key={material.entryId} className="break-words text-sm">{material.name} · {formatQuantity(material.quantity,en)}<span className="block text-xs text-[#68778d]">{t('Costo unitario: ','Unit cost: ')}{proMoney(material.unitCost)}</span></p>)}{draft.nextCursor&&<Button variant="secondary" disabled={loading||saving} onClick={()=>void load(draft.nextCursor!)}>{t('Ver más materiales','Show more materials')}</Button>}</div></details>}
   </>}
  </div>
 </Modal>{dialogNode}</>;
}
