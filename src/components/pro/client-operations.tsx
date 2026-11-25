'use client';
import {PRO_UI_ENABLED} from '@/lib/pro/enabled-client';
import {useCallback,useEffect,useLayoutEffect,useRef,useState,type FormEvent,type ComponentProps} from 'react';
import {PRO_UI_ENABLED} from '@/lib/pro/enabled-client';
import {useLocale} from 'next-intl';
import {Button} from '@/components/ui/button';
import {ProModal as Modal} from '@/components/pro/modal';
import {InvoiceDraftAction} from './invoice-draft';
import {PrivateEstimateAction} from './private-estimate-action';
import {PrivateEstimateRelated} from './private-estimate-related';
import {PaymentReceiptsWorkspace} from './payment-receipts';
import {WorkBudget} from './work-budget';
import {WorkCosts} from './work-costs';
import {ProRoleCostNotice,useProInternalFinance} from './company-team';
import {WorkBillingAction} from './work-billing';
import {WorkPaymentPlan} from './work-payment-plan';
import {CatalogSelect} from './catalog-select';
import {useProChildGuard} from './use-pro-child-guard';
import {useProSearchParams} from './use-pro-search-params';
import {backPro,proDashboardPath,closeProStep,pushProParams} from '@/lib/pro/navigation';
import {inputCents,operationSchema,type ClientOperationsPage,type ClientOperation,type ClientEntry} from '@/lib/pro/client-operations';
import type {Product} from '@/lib/pro/business';
import {proMoney} from '@/lib/pro/money';
import {readClientAttempt,saveClientAttempt,clearClientAttempt,type SavedClientAttempt} from '@/lib/pro/client-operation-recovery';

function WorkAccountSurface({inline,...props}:ComponentProps<typeof Modal>&{inline:boolean}){
 return inline?<section data-work-account className="space-y-4">{props.children}{props.footerNotice}</section>:<Modal {...props}/>;
}

export function ClientOperations({accountId,clientId,archived,onChanged,onQuote,onBlockedChange,embeddedWorkId}:{accountId:string;clientId:string;archived:boolean;onChanged:()=>void;onQuote:(id:string,legacy:boolean)=>void;onBlockedChange?:(blocked:boolean)=>void;embeddedWorkId?:string}){
 const en=useLocale()==='en',params=useProSearchParams(),action=params.get('registro')||'',entryId=params.get('asiento')||'';
 const t=useCallback((es:string,english:string)=>en?english:es,[en]);
 const finance=useProInternalFinance();
 const [data,setData]=useState<ClientOperationsPage|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[saving,setSaving]=useState(false),[formError,setFormError]=useState(''),[saved,setSaved]=useState(''),[uncertain,setUncertain]=useState(false),[pendingRead,setPendingRead]=useState(false),[confirmed,setConfirmed]=useState(false);
 const [recovery,setRecovery]=useState<SavedClientAttempt|null>(null),[storageReady,setStorageReady]=useState(false),[storageFailed,setStorageFailed]=useState(false);
 const budgetEnabled=PRO_UI_ENABLED;
 const [budgetState,setBudgetState]=useState({dirty:false,busy:false}),[costState,setCostState]=useState({dirty:false,busy:false});
 const baseBlocked=saving||uncertain||pendingRead,blocked=baseBlocked||budgetState.dirty||budgetState.busy||costState.dirty||costState.busy,confirmationHandled=useRef(false);
 const warnLeaving=useCallback(()=>setFormError(t('Resuelva el guardado pendiente antes de salir. Sus datos se conservan.','Resolve the pending save before leaving. Your data is preserved.')),[t]);
 useProChildGuard(blocked,warnLeaving);
 // The parent detail also closes through local state, before any URL change.
 useLayoutEffect(()=>{onBlockedChange?.(blocked);return()=>onBlockedChange?.(false);},[blocked,onBlockedChange]);
 // Nested Modal listeners all receive Escape. Stop it before a parent can
 // discard its local detail state and unmount this unresolved operation.
 useEffect(()=>{
  if(!blocked)return;
  const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();warnLeaving();}};
  window.addEventListener('keydown',escape,true);
  return()=>window.removeEventListener('keydown',escape,true);
 },[blocked,warnLeaving]);
 useEffect(()=>{if(!confirmed||blocked||confirmationHandled.current)return;confirmationHandled.current=true;closeProStep('registro','asiento');onChanged();},[confirmed,blocked,onChanged]);
 const [product,setProduct]=useState<Product>(),sequence=useRef(0),busy=useRef(false),lock=useRef(false);
 const version=useRef<number|null>(null);
 const [receiptBusy,setReceiptBusy]=useState(''),[receiptError,setReceiptError]=useState('');const receiptLock=useRef(false);
 async function prepareReceipt(entry:ClientEntry){if(receiptLock.current)return;receiptLock.current=true;setReceiptBusy(entry.id);setReceiptError('');try{const response=await fetch('/api/pro/payment-receipts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({entryId:entry.id})}),body=await response.json();if(!response.ok||body.receipt?.id!==entry.id||body.receipt?.clientId!==clientId)throw Error();pushProParams({recibo:body.receipt.id});}catch{setReceiptError(t('No se pudo preparar el recibo. Reintente el mismo abono: no se duplicará el pago ni el recibo.','Could not prepare the receipt. Retry the same payment: neither the payment nor the receipt will be duplicated.'));}finally{receiptLock.current=false;setReceiptBusy('');}}

 const invalidate=useCallback(()=>{sequence.current++;busy.current=false;},[]);
 const pending=useRef<SavedClientAttempt|null>(null);
 const storageMessage=t('No se puede acceder a la recuperación local. No se enviarán registros nuevos. Reintente la lectura; no borre los datos del navegador.','Local recovery storage is unavailable. New entries will not be sent. Retry reading; do not clear browser data.');
 const restore=useCallback(()=>{
  // The detail may resolve before the account-scoped list. Wait for its owner
  // instead of treating an incomplete recovery scope as a storage failure.
  if(!accountId||!clientId){setStorageReady(false);setStorageFailed(false);return;}
  try{
   const disk=readClientAttempt(window.localStorage,accountId,clientId);
   // An explicit reread must not discard an in-memory unresolved identity if
   // storage was temporarily unavailable before its first write.
   const retained=disk??(pending.current?.accountId===accountId&&pending.current.clientId===clientId?pending.current:null);
   pending.current=retained;setRecovery(retained);setUncertain(retained?.phase==='uncertain');setPendingRead(retained?.phase==='confirmed');setStorageFailed(false);
   if(retained)setFormError(t('Hay un registro pendiente de confirmar. Revíselo y reintente la misma acción; no se enviará automáticamente.','An entry needs confirmation. Review it and retry the same action; it will not be sent automatically.'));
  }catch{setStorageFailed(true);}
  finally{setStorageReady(true);}
 },[accountId,clientId,t]);
 useEffect(()=>{const timer=setTimeout(restore,0);return()=>clearTimeout(timer);},[restore]);
 const retained=recovery?.accountId===accountId&&recovery.clientId===clientId?recovery:null;
 const recoveredOperation=retained?operationSchema.parse(JSON.parse(retained.body)):null;
 // A pending entry may belong to another job of this same customer. Only its
 // explicit recovery route can temporarily override the embedded job context.
 const recoveringOther=!!embeddedWorkId&&!!recoveredOperation&&params.get('cuenta')===recoveredOperation.workId&&action===recoveredOperation.kind;
 const workId=recoveringOther?recoveredOperation!.workId:embeddedWorkId??params.get('cuenta')??'';
 const recoveryHere=!!recoveredOperation&&recoveredOperation.workId===workId&&recoveredOperation.kind===action&&(!('entryId' in recoveredOperation)||recoveredOperation.entryId===entryId);
 function resumeRecovery(){if(!recoveredOperation)return;pushProParams({cuenta:recoveredOperation.workId,registro:recoveredOperation.kind,asiento:'entryId' in recoveredOperation?recoveredOperation.entryId:null});}
 function forgetAttempt(attempt:SavedClientAttempt){clearClientAttempt(window.localStorage,attempt);pending.current=null;setRecovery(null);setStorageFailed(false);}

 const load=useCallback(async(after='',entriesAfter='')=>{
  if((after||entriesAfter)&&busy.current)return;
  const request=++sequence.current;busy.current=true;setLoading(true);setError('');
  try{
   const response=await fetch('/api/pro/client-operations?'+new URLSearchParams({clientId,workId,after,entriesAfter}),{cache:'no-store'});
   const body:ClientOperationsPage=await response.json();
   if(!response.ok)throw Error();if(request!==sequence.current)return false;
   if((after||entriesAfter)&&version.current!==body.revision){setError(t('Los datos cambiaron. Actualice antes de continuar.','Data changed. Refresh before continuing.'));return false;}
   version.current=body.revision;
   setData(old=>{
    return {...body,items:after&&old?[...old.items,...body.items.filter((row:{id:string})=>!old.items.some(item=>item.id===row.id))]:entriesAfter&&old?old.items:body.items,nextCursor:entriesAfter&&old?old.nextCursor:body.nextCursor,entries:entriesAfter&&old?[...old.entries,...body.entries.filter((row:{id:string})=>!old.entries.some(item=>item.id===row.id))]:body.entries};
   });return true;
  }catch{if(request===sequence.current)setError(t('No se pudieron cargar los trabajos y saldos.','Could not load jobs and balances.'));return false;}
  finally{if(request===sequence.current){busy.current=false;setLoading(false);}}
 },[clientId,workId,t]);
 useEffect(()=>{const timer=setTimeout(()=>void load(),0);return()=>{clearTimeout(timer);invalidate();};},[load,invalidate]);
 const work=data?.work?.id===workId?data.work:null,selectedEntry=data?.entries.find(row=>row.id===entryId);
 const money=(cents:number)=>proMoney(cents/100);
 const date=(value:string)=>Number.isFinite(Date.parse(value))?new Date(value).toLocaleDateString(en?'en-US':'es-CR',{timeZone:'America/Costa_Rica',dateStyle:'medium'}):'';
 function openForm(kind:ClientOperation['kind'],entry?:ClientEntry){if(blocked||lock.current)return;setConfirmed(false);confirmationHandled.current=false;setFormError('');setSaved('');setProduct(undefined);pending.current=null;pushProParams({registro:kind,asiento:entry?.id??null});}
 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(lock.current||blocked||!storageReady||storageFailed||loading||!data||!work)return;
  const values=new FormData(event.currentTarget),base={clientId,workId:work.id,kind:action};
  let payload:Record<string,unknown>;
  if(action==='agreement'||action==='payment'){
   const amount=inputCents(String(values.get('amount')||''));
   if(amount===null||action==='payment'&&amount===0){setFormError(t('Ingrese un monto válido con hasta dos decimales.','Enter a valid amount with up to two decimals.'));return;}
   payload={...base,amountCents:amount,...(action==='payment'?{note:String(values.get('note')||'')}:{})};
  }else if(action==='material'){
   if(!product){setFormError(t('Seleccione un producto.','Choose a product.'));return;}
   payload={...base,productId:product.id,quantity:Number(values.get('quantity'))};
  }else if(action==='material_return'||action==='payment_void')payload={...base,entryId,note:String(values.get('note')||'')};
  else return;
  const body=JSON.stringify({...payload,actionId:crypto.randomUUID(),revision:data.revision});
  if(!operationSchema.safeParse(JSON.parse(body)).success){setFormError(t('Revise los datos del registro.','Review the entry details.'));return;}
  await sendPending({version:1,accountId,clientId,body,phase:'uncertain',...(product?{productName:product.name}:{})});
 }
 async function completeRead(attempt:SavedClientAttempt){
  if(await load()){
   try{forgetAttempt(attempt);}catch{setStorageFailed(true);return;}
   setPendingRead(false);setConfirmed(true);setSaved(t('Registro guardado.','Entry saved.'));
  }
 }
 async function sendPending(attempt:SavedClientAttempt){
  const operation=operationSchema.parse(JSON.parse(attempt.body));
  if(lock.current||budgetState.busy||costState.busy||attempt.accountId!==accountId||attempt.clientId!==clientId||operation.workId!==workId||operation.kind!==action)return;
  lock.current=true;setSaving(true);setFormError('');
  pending.current=attempt;setRecovery(attempt);
  try{
   // No POST is allowed unless the exact recovery record is durably readable.
   try{saveClientAttempt(window.localStorage,attempt);setStorageFailed(false);}catch{setStorageFailed(true);throw Error('storage');}
   const response=await fetch('/api/pro/client-operations',{method:'POST',headers:{'Content-Type':'application/json'},body:attempt.body});
   if(!response.ok){
    if(response.status!==400&&response.status!==409)throw Error('uncertain');
    try{forgetAttempt(attempt);}catch{setStorageFailed(true);throw Error('storage');}
    setUncertain(false);setFormError(response.status===409?t('Los datos cambiaron. Cierre este formulario y actualice antes de guardar.','Data changed. Close this form and refresh before saving.'):t('No se guardó. Revise el monto, el saldo y las existencias.','Not saved. Check the amount, balance and available stock.'));return;
   }
   const result=await response.json();if(typeof result.revision!=='number')throw Error('uncertain');
   const acknowledged={...attempt,phase:'confirmed' as const};
   try{saveClientAttempt(window.localStorage,acknowledged);}catch{setStorageFailed(true);throw Error('storage');}
   pending.current=acknowledged;setRecovery(acknowledged);setUncertain(false);setPendingRead(true);
   await completeRead(acknowledged);
  }catch{setUncertain(true);setFormError(t('No pudimos confirmar el resultado. Reintente esta misma acción para evitar duplicados.','We could not confirm the result. Retry this same action to avoid duplicates.'));}finally{lock.current=false;setSaving(false);}
 }
 async function recoverRead(){
  const attempt=pending.current;if(lock.current||!pendingRead||!recoveryHere||!attempt||attempt.phase!=='confirmed')return;lock.current=true;
  try{await completeRead(attempt);}finally{lock.current=false;}
 }
 function closeWork(){
  if(blocked||lock.current){warnLeaving();return;}setFormError('');
  if(action){closeProStep('registro','asiento');return;}
  const target=proDashboardPath(params.get('volverTrabajo'));
  const origin=target?new URL(target,window.location.origin):null;
  const originTab=origin?.searchParams.get('tab');
  const fromAgenda=originTab==='pro_agenda'&&origin?.searchParams.get('cita')===workId;
  const fromPayment=(originTab==='pro_payments'||originTab==='pro_billing')&&!!origin?.searchParams.get('pago');
  if(target&&(fromAgenda||fromPayment)&&backPro(target))return;
  closeProStep('cuenta','registro','asiento','volverTrabajo');
 }
 const actionTitle=action==='agreement'?t('Importe acordado','Agreed amount'):action==='payment'?t('Registrar abono','Record payment'):action==='material'?t('Registrar material utilizado','Record used material'):action==='payment_void'?t('Anular abono','Void payment'):t('Devolver material','Return material');
 const kindLabel=(kind:ClientEntry['kind'])=>kind==='agreement'?t('Importe acordado','Agreed amount'):kind==='payment'?t('Abono registrado','Recorded payment'):kind==='material'?t('Material utilizado','Used material'):kind==='payment_void'?t('Abono anulado','Voided payment'):t('Material devuelto','Returned material');
 const active=!archived&&!work?.cancelled;
 return <section className="space-y-3" aria-label={t('Trabajos y saldos','Jobs and balances')} data-client-operations="">

  {storageFailed&&<div role="alert" className="space-y-2"><p>{storageMessage}</p><Button variant="secondary" disabled={saving} onClick={restore}>{t('Reintentar recuperación','Retry recovery')}</Button></div>}
  {retained&&!recoveryHere&&<div role="status" className="space-y-2"><p>{t('Tiene un registro pendiente de confirmar. No se enviará automáticamente.','An entry needs confirmation. It will not be sent automatically.')}</p><Button onClick={resumeRecovery}>{t('Revisar registro pendiente','Review pending entry')}</Button></div>}
  <div hidden={!!embeddedWorkId}><h3 className="font-bold">{t('Trabajos y saldos','Jobs and balances')}</h3>
  {!embeddedWorkId&&<PrivateEstimateAction actor={accountId} clientId={clientId} disabled={archived||blocked||loading||!!error}/>}
  <Button variant="secondary" disabled={blocked} onClick={()=>pushProParams({recibos:'1'})}>{t('Ver recibos de pagos','View payment receipts')}</Button>
  {receiptError&&!workId&&<p role="alert">{receiptError}</p>}
  {data&&<>
   <dl className="grid grid-cols-2 gap-3 rounded-2xl bg-[#f3f8fb] p-4">
    <div><dt className="text-xs text-[#52627a]">{t('Saldo pendiente','Outstanding balance')}</dt><dd data-client-balance className="break-words text-lg font-bold">{money(data.summary.customerBalanceCents??data.summary.balanceCents)}</dd></div>
    <div><dt className="text-xs text-[#52627a]">{t('Abonos registrados','Recorded payments')}</dt><dd className="break-words text-lg font-bold">{money(data.summary.paidCents)}</dd></div>
   </dl>
   <p className="text-xs text-[#68778d]">{t('Saldo del cliente: importes acordados menos abonos (los anticipos recibidos son abonos) y notas de crédito aplicadas. Es la misma cifra del estado de cuenta.','Customer balance: agreed amounts minus payments (retainers received are payments) and applied credit notes. It is the same figure as the statement.')}{(data.summary.creditNotesCents??0)>0&&t(` Notas de crédito aplicadas: ${money(data.summary.creditNotesCents??0)}.`,` Applied credit notes: ${money(data.summary.creditNotesCents??0)}.`)}</p>
   {data.summary.unpriced>0&&<p className="text-sm text-[#52627a]">{t(`${data.summary.unpriced} ${data.summary.unpriced===1?'trabajo sin importe acordado.':'trabajos sin importe acordado.'}`,`${data.summary.unpriced} ${data.summary.unpriced===1?'job':'jobs'} without an agreed amount.`)}</p>}
  </>}
  {loading&&!data&&<p role="status">{t('Cargando trabajos…','Loading jobs…')}</p>}
  {data&&!data.items.length&&!error&&<p className="text-sm text-[#68778d]">{t('Agende una cita para llevar aquí sus materiales y abonos.','Schedule an appointment to track its materials and payments here.')}</p>}
  {data?.items.map(item=><button key={item.id} type="button" disabled={loading||blocked||!!error} onClick={()=>{setSaved('');pushProParams({cuenta:item.id,registro:null,asiento:null});}} className="block min-h-11 w-full rounded-2xl border border-[#e5e7eb] p-4 text-left text-sm">
   <span className="block font-semibold break-words">{item.service}</span>
   <span className="block text-[#52627a]">{date(item.start)}{item.cancelled?' · '+t('Cancelada','Cancelled'):''}</span>
   <span className="block text-[#52627a]">{item.agreedCents===null?t('Sin importe acordado','No agreed amount'):t('Pendiente: ','Outstanding: ')+money(item.balanceCents)} · {t('Materiales','Materials')}: {item.materialCount}</span>
   <span className="mt-1 block font-semibold text-[#008bb5]">{t('Gestionar trabajo','Manage job')}</span>
  </button>)}
  {error&&<div><p role="alert" className="text-sm text-red-700">{error}</p><Button variant="secondary" disabled={loading} onClick={()=>void (pendingRead?recoverRead():load())}>{t('Actualizar trabajos','Refresh jobs')}</Button></div>}
  {data?.nextCursor&&!error&&<Button variant="secondary" disabled={loading} onClick={()=>void load(data.nextCursor!)}>{t('Ver más trabajos','Show more jobs')}</Button>}
  {!embeddedWorkId&&<PrivateEstimateRelated actor={accountId} clientId={clientId} blocked={blocked}/>}
  </div>
  {workId&&<WorkAccountSurface inline={!!embeddedWorkId&&!action} title={action?actionTitle:work?.service??t('Trabajo','Job')} ariaLabel={action?actionTitle:t('Gestionar trabajo','Manage job')} onClose={closeWork} closeLabel={t('Cerrar','Close')} mobilePresentation="fullscreen" footer={action&&work?<><Button type="button" variant="secondary" disabled={blocked} onClick={closeWork}>{t('Cancelar','Cancel')}</Button>{uncertain?<Button type="button" disabled={saving||!recoveryHere} onClick={()=>{if(pending.current)void sendPending(pending.current);}}>{saving?t('Guardando…','Saving…'):t('Reintentar la misma acción','Retry the same action')}</Button>:pendingRead?<Button type="button" disabled={loading||!recoveryHere} onClick={()=>void recoverRead()}>{t('Reintentar lectura','Retry reading')}</Button>:<Button type="submit" form="pro-client-operation" disabled={saving||loading||!!error||!storageReady||storageFailed}>{saving?t('Guardando…','Saving…'):t('Guardar','Save')}</Button>}</>:undefined} footerNotice={storageFailed?<div role="alert" className="space-y-2 text-sm text-red-700"><p>{storageMessage}</p><Button type="button" variant="secondary" disabled={saving} onClick={restore}>{t('Reintentar recuperación','Retry recovery')}</Button></div>:formError?<p role="alert" className="text-sm text-red-700">{formError}</p>:undefined}>
   {error?<div><p role="alert">{error}</p><Button variant="secondary" disabled={loading} onClick={()=>void (pendingRead?recoverRead():load())}>{t('Actualizar trabajos','Refresh jobs')}</Button></div>:!work?<p role="status">{t('Cargando trabajo…','Loading job…')}</p>:action?<form key={workId+action+entryId+(recoveredOperation?.actionId??'')} id="pro-client-operation" onSubmit={submit} className="space-y-4"><fieldset disabled={blocked||!storageReady||storageFailed} className="space-y-4">
    {embeddedWorkId&&<p className="font-semibold">{work.service}</p>}
    {(action==='agreement'||action==='payment')&&<>
     <p className="text-sm text-[#52627a]">{action==='agreement'?t('Total final del trabajo, incluidos los materiales que haya acordado. No se suma otra vez el costo del inventario.','Final job total, including any agreed materials. Inventory cost is not charged again.'):t('Anote un pago que ya recibió. Este registro no realiza cobros ni envía notificaciones.','Record a payment you already received. This entry does not charge or send notifications.')}</p>
     <label className="block text-sm font-bold">{t('Monto en colones','Amount in CRC')}<input name="amount" aria-label={t('Monto en colones','Amount in CRC')} type="number" inputMode="decimal" min={action==='agreement'?work.paidCents/100:0.01} max={action==='payment'?work.balanceCents/100:100000000} step="0.01" required defaultValue={recoveryHere&&recoveredOperation&&'amountCents' in recoveredOperation?(recoveredOperation.amountCents/100).toFixed(2):action==='agreement'&&work.agreedCents!==null?(work.agreedCents/100).toFixed(2):''} className="mt-1 min-h-11 w-full rounded-xl border border-[#e5e7eb] px-3"/></label>
     {action==='payment'&&<p className="text-sm">{t('Saldo disponible: ','Available balance: ')+money(work.balanceCents)}</p>}
    </>}
    {action==='material'&&<>
     <p className="text-sm text-[#52627a]">{t('Registre únicamente materiales utilizados. Se descontarán del inventario al guardar; el saldo acordado no cambia.','Record only used materials. Stock is deducted when saved; the agreed balance does not change.')}</p>
     {recoveryHere&&recoveredOperation?.kind==='material'&&<p>{t('Producto: ','Product: ')}{retained?.productName||recoveredOperation.productId}</p>}
     <CatalogSelect kind="products" itemType="product" value={product?.id??''} selected={product} label={t('Producto','Product')} required disabled={blocked} onChange={setProduct}/>
     {product&&<p className="text-sm">{t('Disponible: ','Available: ')}{product.stock} {product.unit??''}</p>}
     <label className="block text-sm font-bold">{t('Cantidad utilizada','Quantity used')}<input name="quantity" aria-label={t('Cantidad utilizada','Quantity used')} type="number" inputMode="decimal" min="0.001" max={product?.stock??100000} step="0.001" required defaultValue={recoveryHere&&recoveredOperation?.kind==='material'?recoveredOperation.quantity:1} className="mt-1 min-h-11 w-full rounded-xl border border-[#e5e7eb] px-3"/></label>
    </>}
    {(action==='material_return'||action==='payment_void')&&<p className="text-sm text-[#52627a]">{selectedEntry?.label} · {action==='material_return'?t('Se devolverá al inventario toda la cantidad de este registro. El historial se conservará.','The full quantity in this entry will return to stock. History is retained.'):t('El saldo aumentará por el monto de este abono. El historial se conservará.','The balance will increase by this payment amount. History is retained.')}</p>}
    {(action==='payment'||action==='material_return'||action==='payment_void')&&<label className="block text-sm font-bold">{action==='payment'?t('Referencia o nota (opcional)','Reference or note (optional)'):t('Motivo','Reason')}<input name="note" aria-label={action==='payment'?t('Referencia o nota (opcional)','Reference or note (optional)'):t('Motivo','Reason')} defaultValue={recoveryHere&&recoveredOperation&&'note' in recoveredOperation?recoveredOperation.note:''} maxLength={160} required={action!=='payment'} className="mt-1 min-h-11 w-full rounded-xl border border-[#e5e7eb] px-3"/></label>}
   </fieldset></form>:<div className="space-y-4">
    <dl className="space-y-2 rounded-2xl bg-[#f3f8fb] p-4 text-sm"><div data-work-agreed>{t('Importe acordado: ','Agreed amount: ')}<strong>{work.agreedCents===null?t('Sin definir','Not set'):money(work.agreedCents)}</strong>{work.agreedSource==='estimate'&&<span className="block text-xs text-[#52627a]">{t('Tomado de la cotización aceptada. Puede cambiarlo si acordaron otro importe.','Taken from the accepted quote. You can change it if you agreed on another amount.')}</span>}</div><div>{t('Abonado: ','Paid: ')}<strong>{money(work.paidCents)}</strong></div>{(work.creditNotesCents??0)>0&&<div>{t('Notas de crédito aplicadas: ','Applied credit notes: ')}<strong>{money(work.creditNotesCents??0)}</strong></div>}<div>{t('Saldo pendiente: ','Outstanding balance: ')}<strong data-work-balance>{money(work.customerBalanceCents??work.balanceCents)}</strong></div></dl>
    <p className="text-xs text-[#68778d]">{t('Control interno del trabajo. No es una factura ni un comprobante fiscal.','Internal job record. This is not an invoice or fiscal receipt.')}</p>
    {saved&&<p role="status" className="text-sm text-green-800">{saved}</p>}
    {receiptError&&<p role="alert" className="text-sm text-red-700">{receiptError}</p>}
    {work.cancelled&&<p>{t('Trabajo cancelado. Se conservan los registros; las devoluciones y anulaciones se hacen por separado.','Cancelled job. Records are retained; returns and voids are recorded separately.')}</p>}
    <div className="flex flex-wrap gap-2">
     <PrivateEstimateAction actor={accountId} clientId={clientId} workId={work.id} disabled={!active||loading||blocked||!!error}/>
     {active&&<Button variant="secondary" disabled={loading||blocked} onClick={()=>openForm('agreement')}>{work.agreedCents===null?t('Definir importe','Set amount'):t('Cambiar importe','Change amount')}</Button>}
     {active&&work.balanceCents>0&&<Button disabled={loading||blocked} onClick={()=>openForm('payment')}>{t('Registrar abono','Record payment')}</Button>}
     {active&&<Button variant="secondary" disabled={loading||blocked} onClick={()=>openForm('material')}>{t('Registrar material','Record material')}</Button>}
     <InvoiceDraftAction kind="work" sourceId={work.id} disabled={loading||blocked||!active}/>
     <WorkBillingAction accountId={accountId} workId={work.id} disabled={loading||blocked||!active}/>
     {(work.externalQuoteId||work.quoteId)&&<Button variant="secondary" onClick={()=>onQuote((work.externalQuoteId||work.quoteId)!,!work.externalQuoteId)}>{t('Ver cotización asociada','View linked quote')}</Button>}
    </div>
    <WorkPaymentPlan key={accountId+':'+work.id} accountId={accountId} workId={work.id} disabled={loading||blocked}/>
    <PrivateEstimateRelated actor={accountId} sourceKind="work" sourceId={work.id} statusClientId={clientId} blocked={blocked}/>
    {/* Costs render at once for the owner; the notice replaces them when the role is known to lack access. */!finance.allowed?<ProRoleCostNotice/>:<><WorkCosts key={work.id} clientId={clientId} workId={work.id} archived={archived} sourceRevision={data?.revision} onSetAgreement={()=>openForm('agreement')} parentBlocked={budgetEnabled&&(baseBlocked||budgetState.busy)} writeBlocked={budgetEnabled&&budgetState.dirty} onStateChange={budgetEnabled?setCostState:undefined}/>
    {budgetEnabled&&<WorkBudget key={accountId+":"+clientId+":"+work.id} actor={accountId} clientId={clientId} workId={work.id} blocked={saving||pendingRead||costState.busy} writeBlocked={uncertain||costState.dirty||!!action} onStateChange={setBudgetState}/>}</>}
    <h4 className="font-bold">{t('Materiales y movimientos del trabajo','Job materials and entries')}</h4>
    {!data?.entries.length&&<p className="text-sm text-[#68778d]">{t('Todavía no hay registros.','No entries yet.')}</p>}
    {data?.entries.map(entry=><div key={entry.id} className="space-y-1 rounded-xl border border-[#e5e7eb] p-3 text-sm">
     <p className="font-semibold">{kindLabel(entry.kind)}{entry.reversed?' · '+t('Revertido','Reversed'):''}</p>
     <p className="break-words">{entry.label}{entry.quantity!==null?' · '+entry.quantity:''}{entry.amountCents!==null?' · '+money(entry.amountCents):''}</p><p className="text-xs text-[#68778d]">{date(entry.at)}</p>
     {entry.kind==='payment'&&<Button variant="secondary" disabled={loading||saving||!!receiptBusy} onClick={()=>void prepareReceipt(entry)}>{receiptBusy===entry.id?t('Preparando recibo…','Preparing receipt…'):t('Preparar recibo','Prepare receipt')}</Button>}
     {!entry.reversed&&(entry.kind==='material'||entry.kind==='payment')&&<Button variant="secondary" disabled={loading||blocked} onClick={()=>openForm(entry.kind==='material'?'material_return':'payment_void',entry)}>{entry.kind==='material'?t('Devolver material','Return material'):t('Anular abono','Void payment')}</Button>}
    </div>)}
    {data?.nextEntryCursor&&<Button variant="secondary" disabled={loading} onClick={()=>void load('',data.nextEntryCursor!)}>{t('Ver más registros','Show more entries')}</Button>}
   </div>}
  </WorkAccountSurface>}
  <PaymentReceiptsWorkspace clientId={clientId}/>
 </section>;
}
