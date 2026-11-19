'use client';
import {createContext,useCallback,useContext,useEffect,useLayoutEffect,useRef,useState,type FormEvent,type ReactNode} from 'react';
import {proPhone} from '@/lib/pro/phone';
import {proMoney} from '@/lib/pro/money';
import {useLocale} from 'next-intl';
import {Button} from '@/components/ui/button';
import {Plus,ReceiptText,Truck} from 'lucide-react';
import {ProRecordCard} from './record-card';
import {SectionHeadline} from '@/components/dashboard/section-headline';
import {StatusFilterTabs} from '@/components/dashboard/status-filter-tabs';
import {ProSearchField} from './search-field';
import {ProModal as BaseModal} from '@/components/pro/modal';
import type {ComponentProps} from 'react';
function Modal(props:ComponentProps<typeof BaseModal>){return <BaseModal mobilePresentation="fullscreen" {...props} ariaLabel={props.ariaLabel??(typeof props.title==='string'?props.title:undefined)}/>;}
import {useAppDialog} from '@/hooks/use-app-dialog';
import {pushProParams,replaceProParams,closeProStep,currentProPath,PRO_PATH_CHANGED,PRO_BEFORE_PATH_CHANGE} from '@/lib/pro/navigation';
import {expenseCategories,expenseCategoryLabel,expenseAmount,expenseCents,expenseMethodLabel,expensePaymentMethods,expenseVatRates,expenseMutationSchema,type ExpenseSupplier,type InternalExpense,type ExpensePayment,type ExpensePage,type ExpenseMutation} from '@/lib/pro/expenses';
import {useProSearchParams,registerProTraversalGuard} from './use-pro-search-params';
import {PagedSelect} from './paged-select';
import {useAuth} from '@/hooks/use-auth';
import {ExpenseBilling} from './expense-billing';
import {AiExpenseCapture,type ExpensePrefill} from './ai-expense-capture';
import {createExpenseWrite,reviewRejectedExpenseWrite,readExpenseWrite,mergeExpenseWrite,clearExpenseWrite,continueExpenseWrite,expenseWriteInput,expenseRecoveryDay,ExpenseWriteFailure,type SavedExpenseWrite} from '@/lib/pro/expense-write-recovery';
const control='mt-1 min-w-0 max-w-full w-full rounded-xl border border-[#d7e1ea] bg-white px-3 py-2 text-base';
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Costa_Rica',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
function Field({label,name,value='',type='text',required=false,maxLength}:{label:string;name:string;value?:string;type?:string;required?:boolean;maxLength?:number}){return <label className="block text-sm font-medium">{label}<input className={control+(type==='date'?' block appearance-none':'')} name={name} defaultValue={value} type={type} autoCorrect={name==='name'?'off':undefined} spellCheck={name==='name'?false:undefined} inputMode={name==='amount'?'decimal':undefined} required={required} maxLength={maxLength}/></label>;}
function useCopy(){const en=useLocale()==='en';return useCallback((es:string,eng:string)=>en?eng:es,[en]);}
const api='/api/pro/expenses';
type RecoveryScope={accountId:string;ready:boolean;storageFailed:boolean;attempt:SavedExpenseWrite|null;resumed:boolean;warning:string;resolvedId:string;pending:boolean;identity:()=>string|undefined;publish:(attempt:SavedExpenseWrite|null)=>void;failStorage:()=>void;storageOkay:()=>void;restore:()=>void;warn:()=>void;finishRestore:()=>void;complete:(id:string)=>void};
const ExpenseRecoveryContext=createContext<RecoveryScope|null>(null);
function useExpenseScope(){const scope=useContext(ExpenseRecoveryContext);if(!scope)throw Error('Missing expense scope');return scope;}
function useExpenseRecovery(){
 const {user}=useAuth(),accountId=user?.id??'',t=useCopy(),identity=useRef(user?.id),active=useRef<SavedExpenseWrite|null>(null);
 useLayoutEffect(()=>{identity.current=user?.id;},[user?.id]);
 const [state,setState]=useState<{accountId:string;ready:boolean;storageFailed:boolean;attempt:SavedExpenseWrite|null;resumed:boolean;warning:string;resolvedId:string}>({accountId:'',ready:false,storageFailed:false,attempt:null,resumed:false,warning:'',resolvedId:''});
 const here=state.accountId===accountId?state:{accountId,ready:false,storageFailed:false,attempt:null,resumed:false,warning:'',resolvedId:''};
 const restore=useCallback(()=>{
  if(!accountId)return;
  try{
   const disk=readExpenseWrite(window.localStorage,accountId),retained=active.current?.accountId===accountId?active.current:null;
   const attempt=mergeExpenseWrite(disk,retained);active.current=attempt;
   if(identity.current===accountId)setState(old=>({accountId,ready:true,storageFailed:false,attempt,resumed:old.accountId===accountId&&old.attempt?old.resumed:!!disk,warning:'',resolvedId:''}));
  }catch{if(identity.current===accountId)setState(old=>old.accountId===accountId?{...old,ready:true,storageFailed:true}:{accountId,ready:true,storageFailed:true,attempt:null,resumed:false,warning:'',resolvedId:''});}
 },[accountId]);
 useEffect(()=>{const timer=setTimeout(restore,0);return()=>clearTimeout(timer);},[restore]);
 const publish=useCallback((attempt:SavedExpenseWrite|null)=>{if(identity.current!==accountId)return;active.current=attempt;setState(old=>({...old,accountId,attempt,warning:''}));},[accountId]);
 const warn=useCallback(()=>setState(old=>({...old,warning:t('Resuelva el guardado pendiente antes de salir. Sus datos se conservan.','Resolve the pending save before leaving. Your data is preserved.')})),[t]);
 const pending=!!here.attempt&&here.attempt.steps[here.attempt.index].phase!=='rejected';
 useEffect(()=>{
  if(!pending)return;
  const path=currentProPath(),history={...window.history.state};
  const blocked=()=>active.current?.accountId===accountId&&active.current.steps[active.current.index].phase!=='rejected';
  const unload=(event:BeforeUnloadEvent)=>{if(blocked()){event.preventDefault();event.returnValue='';}};
  const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'&&blocked()){event.preventDefault();event.stopImmediatePropagation();warn();}};
  const before=(event:Event)=>{if(blocked()){event.preventDefault();warn();}};
  const back=(event:PopStateEvent)=>{if(!blocked())return false;event.stopImmediatePropagation();window.history.pushState(history,'',path);window.dispatchEvent(new Event(PRO_PATH_CHANGED));warn();return true;};
  const remove=registerProTraversalGuard(back);window.addEventListener('beforeunload',unload);window.addEventListener('keydown',escape,true);window.addEventListener(PRO_BEFORE_PATH_CHANGE,before);
  return()=>{remove();window.removeEventListener('beforeunload',unload);window.removeEventListener('keydown',escape,true);window.removeEventListener(PRO_BEFORE_PATH_CHANGE,before);};
 },[pending,accountId,warn]);
 return {...here,accountId,pending,identity:()=>identity.current,publish,restore,warn,failStorage:()=>setState(old=>({...old,storageFailed:true})),storageOkay:()=>setState(old=>({...old,storageFailed:false})),finishRestore:()=>setState(old=>({...old,resumed:false,warning:'',resolvedId:''})),complete:(id:string)=>{if(identity.current!==accountId)return;active.current=null;setState(old=>({...old,attempt:null,storageFailed:false,warning:'',resolvedId:old.resumed?id:''}));}};
}
function useExpenseWriter(onSupplierSaved?:(supplier:Extract<ExpenseMutation,{action:'supplier'}>,revision:number)=>void,onConflict?:()=>Promise<boolean>){
 const scope=useExpenseScope(),t=useCopy(),[saving,setSaving]=useState(false),[error,setError]=useState(''),[done,setDone]=useState(''),lock=useRef(false);
 async function run(attempt:SavedExpenseWrite){
  if(lock.current||scope.identity()!==attempt.accountId)return;lock.current=true;setSaving(true);setError('');setDone('');scope.publish(attempt);
  try{
   const outcome=await continueExpenseWrite({store:window.localStorage,attempt,request:fetch,currentAccount:scope.identity,onCheckpoint:scope.publish,onSupplierSaved});
   if(scope.identity()!==attempt.accountId)return;
   if(outcome.status==='complete'){scope.complete(outcome.id);setDone(outcome.id);}
   else{
    const kept=outcome.attempt.steps[outcome.attempt.index].phase==='rejected';
    scope.storageOkay();scope.publish(kept?outcome.attempt:null);
    // A new record has nothing to overwrite: adopt the current revision so the
    // next «Save» can succeed with everything the user typed still in place.
    if(outcome.code===409&&!kept&&onConflict&&await onConflict().catch(()=>false)){setError(t('Los datos cambiaron mientras completaba el formulario. Ya se actualizaron; revise y pulse "Guardar" de nuevo.','Data changed while you were filling in the form. It has been refreshed; review it and select "Save" again.'));return;}
    setError(outcome.code===409?t('Los datos cambiaron. Actualice antes de volver a guardar; el proveedor y el borrador se conservan.','Data changed. Refresh before saving again; the supplier and draft are preserved.'):t('Revise las fechas, el proveedor, el importe y el saldo.','Check dates, supplier, amount and balance.'));
   }
  }catch(reason){
   if(scope.identity()!==attempt.accountId)return;
   if(reason instanceof ExpenseWriteFailure){scope.publish(reason.attempt);if(reason.kind==='storage')scope.failStorage();else if(reason.kind!=='scope')scope.storageOkay();
    setError(reason.kind==='storage'?t('No se puede acceder a la recuperación local. No se enviarán registros nuevos. Reintente sin borrar los datos del navegador.','Local recovery storage is unavailable. New entries will not be sent. Retry without clearing browser data.'):reason.kind==='read'?t('El guardado fue reconocido. Reintente la lectura para comprobar el registro; no se volverá a enviar.','The save was acknowledged. Retry reading to verify the entry; it will not be submitted again.'):t('No se pudo confirmar el guardado. Reintente sin cambiar los datos para evitar duplicados.','Could not confirm the save. Retry without changing the data to avoid duplicates.'));
   }else {scope.failStorage();setError(t('No se pudo conservar un intento seguro. No se enviaron cambios.','A safe retry record could not be kept. No changes were sent.'));}
  }finally{lock.current=false;setSaving(false);}
 }
 return {run,saving,error,setError,done};
}
const recoveryLabels:Record<string,[string,string]>={name:['Nombre del proveedor','Supplier name'],identification:['Identificación (opcional)','Identification (optional)'],email:['Correo (opcional)','Email (optional)'],phone:['Teléfono (opcional)','Phone (optional)'],archived:['Archivar proveedor','Archive supplier'],savedSupplierName:['Proveedor guardado','Saved supplier'],supplierName:['Nombre del proveedor','Supplier name'],supplierIdentification:['Identificación (opcional)','Identification (optional)'],supplierEmail:['Correo (opcional)','Email (optional)'],supplierPhone:['Teléfono (opcional)','Phone (optional)'],concept:['Concepto','Description'],amount:['Importe ₡','Amount ₡'],date:['Fecha','Date'],dueDate:['Vencimiento (opcional)','Due date (optional)'],method:['Medio de pago registrado','Recorded payment method'],reference:['Referencia (opcional)','Reference (optional)'],note:['Nota o motivo','Note or reason'],billable:['Facturable al cliente','Billable to the customer'],paymentMethod:['Medio de pago del gasto','Expense payment method'],vatRateBps:['IVA incluido en el importe','VAT included in the amount']};
function RestoredExpenseWrite(){
 const scope=useExpenseScope(),t=useCopy(),locale=useLocale(),writer=useExpenseWriter();
 const attempt=scope.attempt;if(!attempt)return null;
 const last=expenseWriteInput(attempt.steps.at(-1)!),title=last.action==='expense'?t('Gasto pendiente de comprobar','Expense awaiting verification'):last.action==='supplier'?t('Proveedor pendiente de comprobar','Supplier awaiting verification'):t('Pago pendiente de comprobar','Payment awaiting verification');
 return <Modal title={title} closeLabel={t('Cerrar','Close')} onClose={scope.warn} footer={<Button disabled={writer.saving} onClick={()=>void writer.run(attempt)}>{writer.saving?t('Comprobando…','Checking…'):attempt.steps[attempt.index].phase==='confirmed'?t('Reintentar lectura','Retry reading'):t('Reintentar guardado','Retry save')}</Button>}>
  <div className="space-y-4" data-expense-write-recovery>
   <p>{t('Hay un registro pendiente de comprobar en esta cuenta. Sus datos se conservan; no se enviará automáticamente.','An entry needs verification in this account. Your data is preserved; it will not be submitted automatically.')}</p>
   <fieldset disabled className="space-y-4 [&_input:not([type=checkbox])]:min-h-11 [&_select]:min-h-11">{Object.entries(attempt.fields).filter(([key])=>key!=='supplierId'&&!(last.action==='expense'&&attempt.steps.length===1&&['supplierName','supplierIdentification','supplierEmail','supplierPhone'].includes(key))).map(([key,value])=>{const label=recoveryLabels[key];if(key==='archived')return <label key={key} className="flex min-h-11 items-center gap-2"><input className="h-4 w-4" name={key} type="checkbox" checked={value==='on'} readOnly/>{t('Archivar proveedor','Archive supplier')}</label>;if(key==='method')return <label key={key} className="block text-sm font-medium">{t('Medio de pago registrado','Recorded payment method')}<select name={key} value={value} disabled className={control}>{[['transfer',t('Transferencia','Transfer')],['cash',t('Efectivo','Cash')],['card',t('Tarjeta','Card')],['other',t('Otro','Other')]].map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label>;return <Field key={key} label={label?t(...label):key} name={key} value={key==='date'||key==='dueDate'?expenseRecoveryDay(value,locale):value}/>;})}</fieldset>
   {(writer.error||scope.warning)&&<p role="alert">{writer.error||scope.warning}</p>}
  </div>
 </Modal>;
}

/** Internal expenses only: no fiscal acceptance, tax inference or bank interaction. */
export function ExpensesWorkspace(){
 const recovery=useExpenseRecovery();
 const t=useCopy(),params=useProSearchParams(),kind=params.get('gastosVista')==='suppliers'?'suppliers':'expenses',search=params.get('gastosQ')||'',archived=params.get('gastosArchivados')==='1';
 const [rows,setRows]=useState<(ExpenseSupplier|InternalExpense)[]>([]),[revision,setRevision]=useState(0),[cursor,setCursor]=useState<string|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[tick,setTick]=useState(0);
 const seq=useRef(0),busy=useRef(false),reading=useRef<AbortController|null>(null),[loadedKey,setLoadedKey]=useState(''),detail=params.get('gasto'),newExpense=params.get('gastoNuevo')==='1',supplierId=params.get('proveedor');
 const [supplierEdit,setSupplierEdit]=useState<ExpenseSupplier|null>(null);
 const query=api+'?'+new URLSearchParams({kind,q:search,archived:archived?'1':'0'}),listKey=query+'#'+tick;
 // «New» forms take the list revision: they stay disabled until the list for
 // the current view and refresh tick has loaded (closes the stale-revision 409).
 const listCurrent=loadedKey===listKey;
 async function load(after=''){if(busy.current&&after)return;const request=++seq.current,key=listKey,controller=new AbortController();reading.current?.abort();reading.current=controller;busy.current=true;setLoading(true);setError('');try{const r=await fetch(query+'&after='+encodeURIComponent(after),{cache:'no-store',signal:controller.signal});const b:ExpensePage=await r.json();if(!r.ok)throw Error();if(request!==seq.current)return;if(after&&b.revision!==revision)throw Error('revision');setRows(old=>after?[...old,...b.items.filter(row=>!old.some(value=>value.id===row.id))]:b.items);setRevision(b.revision);setCursor(b.nextCursor);setLoadedKey(key);}catch(e){if(request===seq.current&&!controller.signal.aborted)setError(e instanceof Error&&e.message==='revision'?t('Los datos cambiaron. Recargue la lista.','Data changed. Reload the list.'):t('No se pudieron cargar los registros.','Could not load records.'));}finally{if(request===seq.current){busy.current=false;setLoading(false);}}}
 const loadRef=useRef(load);useEffect(()=>{loadRef.current=load;});
 const invalidate=useCallback(()=>{seq.current++;busy.current=false;reading.current?.abort();reading.current=null;},[]);
 useEffect(()=>{invalidate();const timer=setTimeout(()=>void loadRef.current(),150);return()=>{clearTimeout(timer);invalidate();};},[query,tick,invalidate]);
 const refresh=()=>setTick(n=>n+1);
 useEffect(()=>{if(!recovery.resolvedId||recovery.attempt)return;const timer=setTimeout(()=>{setTick(n=>n+1);const current=new URLSearchParams(window.location.search);if(current.has('gastoNuevo')||current.has('proveedor'))closeProStep('gastoNuevo','proveedor');recovery.finishRestore();},0);return()=>clearTimeout(timer);},[recovery]);
 const changeKind=(value:string)=>{setSupplierEdit(null);replaceProParams({gastosVista:value,gastosQ:null,gastosArchivados:null});};
 const money=(value:number)=>proMoney(value/100);
 return <ExpenseRecoveryContext.Provider value={recovery}><section data-pro-expenses className="space-y-4">
 <SectionHeadline subtitulo={t('Controle los gastos de sus trabajos y sus proveedores.','Manage job expenses and suppliers.')}><Button data-pro-write="finance.write" size="crear" className="w-full" disabled={!recovery.ready||recovery.storageFailed||recovery.pending||loading||!!error||!listCurrent} onClick={()=>kind==='suppliers'?pushProParams({proveedor:'nuevo'}):pushProParams({gastoNuevo:'1'})}><Plus className="h-4 w-4"/>{kind==='suppliers'?t('Nuevo proveedor','New supplier'):t('Nuevo gasto','New expense')}</Button></SectionHeadline>
 <StatusFilterTabs tabs={[{id:'expenses'},{id:'suppliers'}]} value={kind} onChange={value=>changeKind(value==='suppliers'?'suppliers':'expenses')} labelFor={value=>value==='suppliers'?t('Proveedores','Suppliers'):t('Gastos','Expenses')} variant="pills" limpiable={false}/>
 {kind==='suppliers'&&<div role="group" aria-label={t('Mostrar proveedores','Show suppliers')}><StatusFilterTabs tabs={[{id:'active'},{id:'archived'}]} value={archived?'archived':'active'} onChange={value=>replaceProParams({gastosArchivados:value==='archived'?'1':null})} labelFor={value=>value==='archived'?t('Archivados','Archived'):t('Activos','Active')} variant="pills" limpiable={false}/></div>}
 <ProSearchField label={t('Buscar gastos o proveedores','Search expenses or suppliers')} placeholder={kind==='suppliers'?t('Buscar proveedor','Search suppliers'):t('Buscar gasto','Search expenses')} value={search} onChange={value=>replaceProParams({gastosQ:value})}/>
 {loading&&<p role="status">{t('Cargando…','Loading…')}</p>}{error&&<div role="alert">{error}<Button variant="secondary" onClick={refresh}>{t('Recargar lista','Reload list')}</Button></div>}
 {!loading&&!error&&rows.length===0&&<p>{search?t('No hay coincidencias. Cambie la búsqueda.','No matches. Change your search.'):kind==='suppliers'?(archived?t('No hay proveedores archivados.','No archived suppliers.'):t('Guarde un proveedor para registrar sus gastos.','Save a supplier before recording expenses.')):t('Todavía no hay gastos internos registrados.','No internal expenses recorded yet.')}</p>}
 <div className="grid gap-3">{rows.map(row=>{
  const open=()=>{if('concept' in row)pushProParams({gasto:row.id});else{setSupplierEdit(row);pushProParams({proveedor:row.id});}};
  return 'concept' in row?<ProRecordCard key={row.id} icon={ReceiptText} title={row.concept} subtitle={`${row.supplierName} · ${row.date}`}
   amount={<>{money(row.amountCents)} · {t('Saldo','Balance')}: {money(row.balanceCents)}</>}
   meta={<>{row.status==='paid'?t('Pagado','Paid'):row.status==='partial'?t('Pago parcial','Partially paid'):t('Pendiente','Pending')}{row.dueDate?' · '+t('Vence','Due')+' '+row.dueDate:''}{row.billable?' · '+t('Facturable','Billable'):''}{row.invoicedDraftId?' · '+t('En borrador de factura','In an invoice draft'):''}{row.receipt?' · '+t('Con comprobante','With receipt'):''}</>}
   onOpen={open} openLabel={t('Ver gasto','View expense')} disabled={loading||!!error}/>
  :<ProRecordCard key={row.id} icon={Truck} title={row.name} subtitle={[row.email,proPhone(row.phone)].filter(Boolean).join(' · ')} meta={row.identification||undefined} onOpen={open} openLabel={t('Editar proveedor','Edit supplier')} disabled={loading||!!error}/>;
 })}</div>
 {cursor&&<Button variant="secondary" disabled={loading||!!error} onClick={()=>void load(cursor)}>{t('Ver más registros','Show more records')}</Button>}
 {recovery.ready&&!recovery.resumed&&supplierId&&<SupplierForm key={supplierId} id={supplierId} selected={supplierEdit?.id===supplierId?supplierEdit:null} revision={revision} onSaved={refresh} onClose={()=>closeProStep('proveedor')}/>}
 {recovery.ready&&!recovery.resumed&&newExpense&&<ExpenseForm key="new-expense" revision={revision} onSaved={refresh} onClose={()=>closeProStep('gastoNuevo')}/>}
 {recovery.ready&&!recovery.resumed&&detail&&<ExpenseDetail key={detail} id={detail} onChanged={refresh} onClose={()=>closeProStep('gasto')}/>}
 {recovery.resumed&&(recovery.attempt?.steps[recovery.attempt.index].phase==='rejected'?
  !loading&&!error&&<ExpenseForm key={recovery.attempt.intentId} restore={recovery.attempt} revision={revision} onSaved={refresh} onClose={()=>{recovery.finishRestore();closeProStep('gastoNuevo','proveedor');}}/>:<RestoredExpenseWrite/>)}
 {recovery.storageFailed&&!recovery.resumed&&!supplierId&&!newExpense&&!detail&&<div role="alert"><p>{t('No se puede acceder a la recuperación local. No se enviarán registros nuevos.','Local recovery storage is unavailable. New entries will not be sent.')}</p><Button variant="secondary" onClick={recovery.restore}>{t('Reintentar recuperación','Retry recovery')}</Button></div>}
 </section></ExpenseRecoveryContext.Provider>;
}
function WriteForm({title,initial,children,onClose,onSaved,prepare,prepareSupplier,onSupplierSaved,editing=false,onReview,onConflict}:{title:string;initial:Record<string,unknown>;children:ReactNode;onClose:()=>void;onSaved:(id:string)=>void;prepare:(form:FormData)=>Record<string,unknown>|Promise<Record<string,unknown>>;prepareSupplier?:(form:FormData)=>ExpenseMutation|undefined;onSupplierSaved?:(supplier:Extract<ExpenseMutation,{action:'supplier'}>,revision:number)=>void;editing?:boolean;onReview?:()=>Promise<void>;onConflict?:()=>Promise<boolean>}){
 const scope=useExpenseScope(),t=useCopy(),writer=useExpenseWriter(onSupplierSaved,onConflict),[dirty,setDirty]=useState(false),[reviewedIntent,setReviewedIntent]=useState(''),[reviewing,setReviewing]=useState(false),{confirm,dialogNode}=useAppDialog(),allowExit=useRef(false);
 const rejected=scope.attempt?.steps[scope.attempt.index].phase==='rejected',reviewed=!!scope.attempt&&reviewedIntent===scope.attempt.intentId,blocked=writer.saving||scope.pending,locked=blocked||!scope.ready||scope.storageFailed||!!rejected&&!reviewed;
 useEffect(()=>{if(!writer.done||scope.attempt)return;allowExit.current=true;onSaved(writer.done);onClose();},[writer.done,scope.attempt,onSaved,onClose]);
 useEffect(()=>{
  if(!dirty&&!blocked)return;const path=currentProPath(),state={...window.history.state};let asking=false;
  function unload(event:BeforeUnloadEvent){if(!allowExit.current){event.preventDefault();event.returnValue='';}}
  function back(event:PopStateEvent){if(allowExit.current)return false;event.stopImmediatePropagation();window.history.pushState(state,'',path);window.dispatchEvent(new Event(PRO_PATH_CHANGED));if(blocked||asking){scope.warn();return true;}asking=true;void confirm({title:t('¿Descartar cambios?','Discard changes?'),description:t('Los cambios sin guardar se perderán.','Unsaved changes will be lost.'),confirmLabel:t('Descartar','Discard'),cancelLabel:t('Cancelar','Cancel')}).then(answer=>{asking=false;if(answer.confirmed){allowExit.current=true;window.history.back();}});return true;}
  const unregister=registerProTraversalGuard(back);window.addEventListener('beforeunload',unload);return()=>{unregister();window.removeEventListener('beforeunload',unload);};
 },[dirty,blocked,confirm,scope,t]);
 async function close(){
  if(blocked){scope.warn();return;}
  if(dirty||rejected){const answer=await confirm({cancelLabel:t('Cancelar','Cancel'),title:t('¿Descartar cambios?','Discard changes?'),description:t('Los cambios sin guardar se perderán. Los proveedores ya guardados se conservan.','Unsaved changes will be lost. Suppliers already saved are preserved.'),confirmLabel:t('Descartar','Discard')});if(!answer.confirmed)return;}
  if(rejected&&scope.attempt){try{clearExpenseWrite(window.localStorage,scope.attempt);scope.publish(null);}catch{scope.failStorage();return;}}
  allowExit.current=true;onClose();
 }
 async function save(event:FormEvent<HTMLFormElement>){
  event.preventDefault();
  if(scope.attempt&&!rejected){await writer.run(scope.attempt);return;}
  if(locked)return;
  const formElement=event.currentTarget,form=new FormData(formElement);writer.setError('');
  try{
   const raw={...initial,...await prepare(form),actionId:crypto.randomUUID()},input=expenseMutationSchema.parse(raw);
   const fields:Record<string,string>={};
   for(const element of Array.from(formElement.elements)){
    if(element instanceof HTMLInputElement||element instanceof HTMLSelectElement||element instanceof HTMLTextAreaElement){if(element.name)fields[element.name]=element instanceof HTMLInputElement&&element.type==='checkbox'?(element.checked?'on':''):element.value;}
   }
   const supplierInput=prepareSupplier?.(form);
   if(input.action==='expense'){fields.supplierId=input.supplierId;const selected=formElement.querySelector<HTMLSelectElement>('select');fields.savedSupplierName=supplierInput?.action==='supplier'?supplierInput.name:selected?.selectedOptions[0]?.textContent??'';}
   const previous=scope.attempt;
   const attempt=previous&&rejected?reviewRejectedExpenseWrite(previous,input,fields):createExpenseWrite(scope.accountId,input,fields,editing,supplierInput);
   await writer.run(attempt);
  }catch(reason){writer.setError(reason instanceof Error&&reason.name==='ZodError'?t('Revise los campos. El importe debe tener como máximo dos decimales.','Check the fields. Amounts must have at most two decimal places.'):t('No se pudo preparar un guardado seguro. Revise los datos y la recuperación local.','Could not prepare a safe save. Check the data and local recovery.'));}
 }
 const step=scope.attempt?.steps[scope.attempt.index];
 const read=step?.phase==='confirmed';
 const notice=writer.error||scope.warning||(scope.storageFailed?t('No se puede acceder a la recuperación local. No se enviarán registros nuevos.','Local recovery storage is unavailable. New entries will not be sent.'):'');
 return <><Modal closeLabel={t('Cerrar','Close')} title={title} onClose={()=>void close()} footer={<><Button variant="secondary" disabled={blocked} onClick={()=>void close()}>{t('Cancelar','Cancel')}</Button>{rejected&&!reviewed?<Button disabled={reviewing||scope.storageFailed} onClick={()=>{setReviewing(true);void onReview?.().then(()=>setReviewedIntent(scope.attempt?.intentId??'')).catch(()=>writer.setError(t('No se pudo actualizar el borrador. El proveedor guardado se conserva.','Could not refresh the draft. The saved supplier is preserved.'))).finally(()=>setReviewing(false));}}>{t('Revisar gasto','Review expense')}</Button>:<Button type="submit" form="pro-expense-write" disabled={writer.saving||!scope.ready||scope.storageFailed&&!scope.attempt}>{writer.saving?t('Guardando…','Saving…'):scope.attempt&&!rejected?(read?t('Reintentar lectura','Retry reading'):t('Reintentar guardado','Retry save')):t('Guardar','Save')}</Button>}</>}>
  <form id="pro-expense-write" onSubmit={save} onChange={()=>setDirty(true)} className="space-y-4"><fieldset disabled={locked} className="space-y-4">{children}</fieldset>{notice&&<p role="alert">{notice}</p>}{scope.storageFailed&&<Button type="button" variant="secondary" onClick={scope.restore}>{t('Reintentar recuperación','Retry recovery')}</Button>}</form>
 </Modal>{dialogNode}</>;
}
function SupplierForm(props:{id:string;selected:ExpenseSupplier|null;revision:number;onClose:()=>void;onSaved:()=>void}){
 const t=useCopy(),[record,setRecord]=useState<{supplier:ExpenseSupplier;revision:number}|null>(null),[error,setError]=useState(false),[retry,setRetry]=useState(0);
 useEffect(()=>{if(props.id==='nuevo')return;let alive=true;fetch(api+'?kind=suppliers&id='+props.id,{cache:'no-store'}).then(async response=>{const body:ExpensePage=await response.json();if(!response.ok||!body.items[0])throw Error();if(alive){setRecord({supplier:body.items[0] as ExpenseSupplier,revision:body.revision});setError(false);}}).catch(()=>{if(alive)setError(true);});return()=>{alive=false;};},[props.id,retry]);
 if(props.id==='nuevo')return <SupplierEditor {...props}/>;
 if(!record||error)return <Modal closeLabel={t('Cerrar','Close')} title={t('Proveedor','Supplier')} onClose={props.onClose}>{error?<p role="alert">{t('No se pudo cargar el proveedor.','Could not load supplier.')}<Button onClick={()=>setRetry(n=>n+1)}>{t('Reintentar','Retry')}</Button></p>:<p role="status">{t('Cargando…','Loading…')}</p>}</Modal>;
 return <SupplierEditor {...props} selected={record.supplier} revision={record.revision}/>;
}
function SupplierEditor({id,selected,revision,onClose,onSaved}:{id:string;selected:ExpenseSupplier|null;revision:number;onClose:()=>void;onSaved:()=>void}){
 const t=useCopy(),[uuid]=useState(()=>id==='nuevo'?crypto.randomUUID():id),[fresh,setFresh]=useState(0);
 // Same rule as a new expense: a new supplier overwrites nothing, so after a 409
 // it retries with the current revision; an edit keeps the conflict.
 async function refreshRevision(){if(id!=='nuevo')return false;const response=await fetch(api+'?'+new URLSearchParams({kind:'suppliers'}),{cache:'no-store'});const body:ExpensePage=await response.json();if(!response.ok||!Number.isSafeInteger(body.revision))return false;setFresh(body.revision);return true;}
 if(id!=='nuevo'&&!selected)return <Modal closeLabel={t('Cerrar','Close')} title={t('Proveedor','Supplier')} onClose={onClose}><p role="alert">{t('Abra el proveedor desde la lista actual para editarlo.','Open the supplier from the current list to edit it.')}</p></Modal>;
 return <WriteForm title={id==='nuevo'?t('Nuevo proveedor','New supplier'):t('Editar proveedor','Edit supplier')} editing={id!=='nuevo'} initial={{action:'supplier',id:uuid,revision:Math.max(revision,fresh)}} onConflict={refreshRevision} onClose={onClose} onSaved={onSaved} prepare={f=>({name:f.get('name'),identification:f.get('identification'),email:f.get('email'),phone:f.get('phone'),archived:f.get('archived')==='on'})}><Field label={t('Nombre del proveedor','Supplier name')} name="name" value={selected?.name} required maxLength={160}/><Field label={t('Identificación (opcional)','Identification (optional)')} name="identification" value={selected?.identification} maxLength={40}/><Field label={t('Correo (opcional)','Email (optional)')} name="email" type="email" value={selected?.email} maxLength={254}/><Field label={t('Teléfono (opcional)','Phone (optional)')} name="phone" value={selected?.phone} maxLength={40}/>{id!=='nuevo'&&<><label className="flex gap-2"><input name="archived" type="checkbox" defaultChecked={selected?.archived}/>{t('Archivar proveedor','Archive supplier')}</label><p className="text-sm">{t('Archivar conserva los gastos y su nombre histórico.','Archiving preserves expenses and their historical supplier name.')}</p></>}</WriteForm>;
}
function ExpenseForm({expense,revision,onClose,onSaved,restore}:{expense?:InternalExpense;revision:number;onClose:()=>void;onSaved:()=>void;restore?:SavedExpenseWrite}){
 const t=useCopy(),scope=useExpenseScope();
 const restored=restore?expenseWriteInput(restore.steps.at(-1)!):null;
 const priorSupplier=restore?.steps.length===2?expenseWriteInput(restore.steps[0]):null;
 const savedSupplier=priorSupplier?.action==='supplier'?priorSupplier:null;
 const [id]=useState(()=>expense?.id??(restored?.action==='expense'?restored.id:crypto.randomUUID()));
 const [supplier,setSupplier]=useState<ExpenseSupplier|undefined>(()=>expense?{id:expense.supplierId,name:expense.supplierName,identification:'',email:'',phone:'',archived:false}:savedSupplier?{id:savedSupplier.id,name:savedSupplier.name,identification:savedSupplier.identification,email:savedSupplier.email,phone:savedSupplier.phone,archived:savedSupplier.archived}:undefined);
 const [newSupplier,setNewSupplier]=useState(false),[createdSupplier,setCreatedSupplier]=useState(savedSupplier?.name??''),[supplierDraftId]=useState(()=>crypto.randomUUID());
 const supplierPending=scope.pending, supplierWasSaved=useRef(!!savedSupplier),expenseWasSaved=useRef(false),currentRevision=useRef(revision);
 // Round 6D: receipt photo read by the AI capture, attached to this expense once it is saved (Round 4B route).
 const aiReceipt=useRef<{file:File;receiptId:string}|null>(null),[receiptNotice,setReceiptNotice]=useState('');
 async function attachAiReceipt(){
  const pending=aiReceipt.current;if(!pending)return;
  try{const data=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onerror=()=>reject(reader.error);reader.onload=()=>{const value=String(reader.result);resolve(value.slice(value.indexOf(',')+1));};reader.readAsDataURL(pending.file);});
   const response=await fetch('/api/pro/expense-receipts',{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'attach',expenseId:id,receiptId:pending.receiptId,name:pending.file.name.slice(0,160)||'comprobante.jpg',data})});
   if(response.ok)aiReceipt.current=null;else setReceiptNotice(t('El gasto se guardó, pero la foto no se adjuntó. Adjúntela desde el detalle del gasto.','The expense was saved, but the photo was not attached. Attach it from the expense detail.'));
  }catch{setReceiptNotice(t('El gasto se guardó, pero la foto no se adjuntó. Adjúntela desde el detalle del gasto.','The expense was saved, but the photo was not attached. Attach it from the expense detail.'));}
 }
 function prepare(form:FormData){
  const values={supplierId:newSupplier?supplierDraftId:supplier?.id,date:form.get('date'),dueDate:form.get('dueDate')||null,concept:form.get('concept'),amountCents:expenseCents(String(form.get('amount'))),
   // Round 4B: billable flag, how it was paid and VAT included in the amount.
   billable:form.get('billable')==='on',paymentMethod:form.get('paymentMethod')||null,vatRateBps:form.get('vatRateBps')?Number(form.get('vatRateBps')):null,category:form.get('category')||null};
  expenseMutationSchema.parse({action:'expense',id,revision:currentRevision.current,currency:'CRC',actionId:crypto.randomUUID(),...values});
  return {...values,revision:currentRevision.current};
 }
 function prepareSupplier(form:FormData){return newSupplier?expenseMutationSchema.parse({action:'supplier',id:supplierDraftId,revision:currentRevision.current,actionId:crypto.randomUUID(),name:form.get('supplierName'),identification:form.get('supplierIdentification'),email:form.get('supplierEmail'),phone:form.get('supplierPhone'),archived:false}):undefined;}
 function supplierSaved(input:Extract<ExpenseMutation,{action:'supplier'}>,nextRevision:number){supplierWasSaved.current=true;currentRevision.current=nextRevision;setSupplier({id:input.id,name:input.name,identification:input.identification,email:input.email,phone:input.phone,archived:input.archived});setCreatedSupplier(input.name);setNewSupplier(false);}
 async function review(){if(!supplier)throw Error();const response=await fetch(api+'?'+new URLSearchParams({kind:'suppliers',id:supplier.id}),{cache:'no-store'});const body:ExpensePage=await response.json();if(!response.ok||!Number.isSafeInteger(body.revision)||!body.items.some(row=>row.id===supplier.id))throw Error();currentRevision.current=body.revision;}
 /** Round 6C: fills the (uncontrolled) form with the reviewed AI values; the owner still presses «Guardar». */
 function applyAi(values:ExpensePrefill){
  const form=document.getElementById('pro-expense-write') as HTMLFormElement|null;if(!form)return;
  const put=(name:string,value:string)=>{const element=form.elements.namedItem(name);if(!(element instanceof HTMLInputElement||element instanceof HTMLSelectElement))return;
   const setter=Object.getOwnPropertyDescriptor(element instanceof HTMLSelectElement?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value')?.set;setter?.call(element,value);
   element.dispatchEvent(new Event('input',{bubbles:true}));element.dispatchEvent(new Event('change',{bubbles:true}));};
  if(values.concept.trim())put('concept',values.concept.trim());if(values.amount.trim())put('amount',values.amount.trim());if(values.date)put('date',values.date);
  put('paymentMethod',values.paymentMethod);put('vatRateBps',values.vatRateBps);
  aiReceipt.current=values.receipt?{file:values.receipt,receiptId:crypto.randomUUID()}:null;
  if(values.newSupplier&&values.vendor.trim()){setNewSupplier(true);requestAnimationFrame(()=>put('supplierName',values.vendor.trim().slice(0,160)));}
 }
 // Only a brand-new expense (nothing confirmed yet in this form) may adopt the
 // current revision after a 409; edits keep the conflict so nothing is overwritten.
 const creating=!expense&&!restore?.editing;
 useEffect(()=>{if(creating&&!supplierWasSaved.current&&revision>currentRevision.current)currentRevision.current=revision;},[creating,revision]);
 async function refreshRevision(){if(!creating||supplierWasSaved.current)return false;const response=await fetch(api+'?'+new URLSearchParams({kind:'suppliers'}),{cache:'no-store'});const body:ExpensePage=await response.json();if(!response.ok||!Number.isSafeInteger(body.revision)||body.revision<currentRevision.current)return false;currentRevision.current=body.revision;return true;}
 return <WriteForm title={expense||restore?.editing?t('Editar gasto','Edit expense'):t('Nuevo gasto','New expense')} editing={!!expense||!!restore?.editing} initial={{action:'expense',id,revision,currency:'CRC'}} onClose={()=>{if(supplierWasSaved.current&&!expenseWasSaved.current)onSaved();onClose();}} onSaved={()=>{expenseWasSaved.current=true;void attachAiReceipt().finally(onSaved);}} prepare={prepare} prepareSupplier={prepareSupplier} onSupplierSaved={supplierSaved} onReview={review} onConflict={refreshRevision}>
  {!expense&&!restore&&<AiExpenseCapture onApply={applyAi} disabled={scope.pending}/>}
  {receiptNotice&&<p role="alert" className="text-sm text-[#8a4b00]">{receiptNotice}</p>}
  <div hidden={newSupplier} inert={newSupplier}><PagedSelect<ExpenseSupplier> url={api+'?kind=suppliers'} value={supplier?.id||''} selected={supplier} label={t('Proveedor guardado','Saved supplier')} placeholder={t('Seleccione un proveedor','Choose a supplier')} searchLabel={t('Buscar proveedor','Search suppliers')} moreLabel={t('Ver más proveedores','Show more suppliers')} optionLabel={row=>row.name} onChange={setSupplier} parse={body=>(body as ExpensePage).items as ExpenseSupplier[]} required={!newSupplier} disabled={newSupplier||scope.attempt?.steps.length===2}/></div>
  <Button type="button" variant="secondary" disabled={supplierPending||scope.attempt?.steps.length===2} aria-expanded={newSupplier} onClick={()=>setNewSupplier(value=>!value)}>{newSupplier?t('Elegir proveedor guardado','Choose saved supplier'):t('Nuevo proveedor','New supplier')}</Button>
  <fieldset hidden={!newSupplier} disabled={!newSupplier||supplierPending} className="space-y-4 rounded-xl border border-[#d7e1ea] p-3"><legend className="px-1 text-sm font-semibold">{t('Nuevo proveedor','New supplier')}</legend><Field label={t('Nombre del proveedor','Supplier name')} name="supplierName" required maxLength={160}/><details><summary className="min-h-11 cursor-pointer text-sm font-semibold">{t('Datos de contacto (opcionales)','Contact details (optional)')}</summary><div className="space-y-4"><Field label={t('Identificación (opcional)','Identification (optional)')} name="supplierIdentification" maxLength={40}/><Field label={t('Correo (opcional)','Email (optional)')} name="supplierEmail" type="email" maxLength={254}/><Field label={t('Teléfono (opcional)','Phone (optional)')} name="supplierPhone" maxLength={40}/></div></details></fieldset>
  {createdSupplier&&<p role="status" className="text-sm text-[#175b42]">{t('Proveedor guardado: ','Supplier saved: ')}{createdSupplier}</p>}
  <Field label={t('Concepto','Description')} name="concept" value={restore?.fields.concept??expense?.concept} required maxLength={300}/><Field label={t('Importe total ₡','Total amount ₡')} name="amount" value={restore?.fields.amount??(expense?expenseAmount(expense.amountCents):'')} required/><Field label={t('Fecha del gasto','Expense date')} name="date" type="date" value={restore?.fields.date??expense?.date??today()} required/><details open={!!(restore?.fields.dueDate??expense?.dueDate)} className="rounded-xl border border-[#d7e1ea] p-3"><summary className="min-h-11 cursor-pointer text-sm font-semibold">{t('Agregar vencimiento (opcional)','Add due date (optional)')}</summary><Field label={t('Vencimiento (opcional)','Due date (optional)')} name="dueDate" type="date" value={restore?.fields.dueDate??expense?.dueDate??''}/></details>
  <ExpenseBillingFields expense={expense} restore={restore?.fields}/>
  {!expense&&<label className="block text-sm font-medium">{t('Comprobante (JPEG o PDF, opcional)','Receipt (JPEG or PDF, optional)')}<input data-cost-field="receipt" type="file" accept="image/jpeg,application/pdf" className={control} onChange={event=>{const file=event.target.files?.[0];aiReceipt.current=file?{file,receiptId:crypto.randomUUID()}:null;}}/></label>}
 </WriteForm>;
}
function ExpenseBillingFields({expense,restore}:{expense?:InternalExpense;restore?:Record<string,string>}){
 const t=useCopy(),en=useLocale()==='en',category=restore?.category??expense?.category??'',billable=restore?restore.billable==='on':!!expense?.billable,method=restore?.paymentMethod??expense?.paymentMethod??'',vat=restore?.vatRateBps??(expense?.vatRateBps?String(expense.vatRateBps):'');
 return <fieldset data-expense-billing-fields className="space-y-3 rounded-xl border border-[#d7e1ea] p-3"><legend className="px-1 text-sm font-semibold">{t('Detalles del costo (opcional)','Cost details (optional)')}</legend>
  <label className="block text-sm font-medium">{t('Categoría','Category')}<select data-cost-field="category" aria-label={t('Categoría del costo','Cost category')} className={control} name="category" defaultValue={category}><option value="">{t('Sin indicar','Not stated')}</option>{expenseCategories.map(value=><option key={value} value={value}>{expenseCategoryLabel(value,en)}</option>)}</select></label>
  <label className="flex min-h-11 items-center gap-3 text-sm font-medium"><input type="checkbox" name="billable" defaultChecked={billable} className="h-5 w-5 shrink-0 accent-[#0089bb]"/>{t('Facturable al cliente','Billable to the customer')}</label>
  <p className="text-xs text-[#52627a]">{t('Un gasto facturable vinculado a un trabajo aparece en "Facturar desde el trabajo".','A billable expense linked to a job appears in "Bill from job".')}</p>
  <label className="block text-sm font-medium">{t('Medio de pago del gasto','Expense payment method')}<select aria-label={t('Medio de pago del gasto','Expense payment method')} className={control} name="paymentMethod" defaultValue={method}><option value="">{t('Sin indicar','Not stated')}</option>{expensePaymentMethods.map(value=><option key={value} value={value}>{expenseMethodLabel(value,en)}</option>)}</select></label>
  <label className="block text-sm font-medium">{t('IVA incluido en el importe','VAT included in the amount')}<select aria-label={t('IVA incluido en el importe','VAT included in the amount')} className={control} name="vatRateBps" defaultValue={vat}><option value="">{t('No separar','Do not split')}</option>{expenseVatRates.map(rate=><option key={rate} value={rate}>{(rate/100).toLocaleString(en?'en-US':'es-CR')+(en?'%':' %')}</option>)}</select></label>
 </fieldset>;
}
function ExpenseDetail({id,onClose:closeParent,onChanged}:{id:string;onClose:()=>void;onChanged:()=>void}){
 const scope=useExpenseScope();const onClose=()=>{if(scope.pending)scope.warn();else closeParent();};
 const t=useCopy(),[data,setData]=useState<ExpensePage|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[mode,setMode]=useState<'edit'|'payment'|ExpensePayment|null>(null),[tick,setTick]=useState(0),sequence=useRef(0);
 async function load(after=''){const request=++sequence.current;setLoading(true);setError('');try{const r=await fetch(api+'?id='+id+'&after='+after,{cache:'no-store'}),body:ExpensePage=await r.json();if(!r.ok||!body.expense)throw Error();if(sequence.current!==request)return;setData(old=>{if(after&&old&&body.revision!==old.revision)return old;return after?{...body,payments:[...(old?.payments??[]),...(body.payments??[])]}:body;});if(after&&data&&body.revision!==data.revision)setError(t('Los datos cambiaron. Recargue el gasto.','Data changed. Reload the expense.'));}catch{if(sequence.current===request)setError(t('No se pudo cargar el gasto.','Could not load the expense.'));}finally{if(sequence.current===request)setLoading(false);}}
 const loadRef=useRef(load);useEffect(()=>{loadRef.current=load;});const invalidate=useCallback(()=>{sequence.current++;},[]);useEffect(()=>{const timer=setTimeout(()=>void loadRef.current(),0);return()=>{clearTimeout(timer);invalidate();};},[id,tick,invalidate]);
 const changed=()=>{setMode(null);setTick(n=>n+1);onChanged();};const expense=data?.expense;
 const money=(value:number)=>proMoney(value/100);
 return <><Modal closeLabel={t('Cerrar','Close')} title={t('Gasto interno','Internal expense')} onClose={onClose} footer={<Button variant="secondary" onClick={onClose}>{t('Cerrar','Close')}</Button>}><div className="space-y-4">{loading&&<p role="status">{t('Cargando…','Loading…')}</p>}{error&&<p role="alert">{error}<Button onClick={()=>setTick(n=>n+1)}>{t('Recargar gasto','Reload expense')}</Button></p>}{expense&&<><h3 className="font-semibold break-words">{expense.concept}</h3><p>{expense.supplierName} · {expense.date}{expense.dueDate?' · '+t('Vence','Due')+' '+expense.dueDate:''}</p><p>{t('Importe','Amount')}: {money(expense.amountCents)} · {t('Pagado','Paid')}: {money(expense.paidCents)} · {t('Saldo','Balance')}: {money(expense.balanceCents)}</p><ExpenseBilling expense={expense} disabled={scope.pending||loading||!!error} onChanged={()=>setTick(n=>n+1)}/><div className="flex flex-wrap gap-2"><Button disabled={scope.pending||loading||!!error} variant="secondary" onClick={()=>setMode('edit')}>{t('Editar gasto','Edit expense')}</Button><Button disabled={loading||!!error||expense.balanceCents===0} onClick={()=>setMode('payment')}>{t('Registrar pago interno','Record internal payment')}</Button></div><h4 className="font-semibold">{t('Historial de pagos y reversos','Payment and reversal history')}</h4>{data?.payments?.length===0&&<p>{t('Sin pagos registrados.','No payments recorded.')}</p>}{data?.payments?.map(payment=><article key={payment.id} className="rounded-xl border p-3 space-y-2"><p>{payment.kind==='reverse'?t('Reverso','Reversal'):t('Pago','Payment')} · {payment.date} · {money(payment.amountCents)}{payment.reversed?' · '+t('Reversado','Reversed'):''}</p><p className="break-words">{payment.method==='transfer'?t('Transferencia','Transfer'):payment.method==='cash'?t('Efectivo','Cash'):payment.method==='card'?t('Tarjeta','Card'):t('Otro','Other')} {payment.reference} {payment.note}</p>{payment.kind==='payment'&&!payment.reversed&&<Button disabled={scope.pending||loading||!!error} variant="secondary" onClick={()=>setMode(payment)}>{t('Reversar pago','Reverse payment')}</Button>}</article>)}{data?.nextCursor&&<Button disabled={scope.pending||loading||!!error} variant="secondary" onClick={()=>void load(data.nextCursor!)}>{t('Ver más movimientos','Show more entries')}</Button>}</>}</div></Modal>
 {expense&&data&&mode==='edit'&&<ExpenseForm expense={expense} revision={data.revision} onClose={()=>setMode(null)} onSaved={changed}/>}
 {expense&&data&&mode==='payment'&&<WriteForm title={t('Registrar pago interno','Record internal payment')} initial={{action:'payment',expenseId:id,revision:data.revision}} onClose={()=>setMode(null)} onSaved={changed} prepare={f=>({amountCents:expenseCents(String(f.get('amount'))),date:f.get('date'),method:f.get('method'),reference:f.get('reference'),note:f.get('note')})}><Field name="amount" label={t('Importe del pago ₡','Payment amount ₡')} required/><Field name="date" label={t('Fecha del pago','Payment date')} type="date" value={today()} required/><label className="block">{t('Medio de pago registrado','Recorded payment method')}<select aria-label={t('Medio de pago registrado','Recorded payment method')} className={control} name="method"><option value="transfer">{t('Transferencia','Transfer')}</option><option value="cash">{t('Efectivo','Cash')}</option><option value="card">{t('Tarjeta','Card')}</option><option value="other">{t('Otro','Other')}</option></select></label><Field name="reference" label={t('Referencia (opcional)','Reference (optional)')} maxLength={160}/><Field name="note" label={t('Nota (opcional)','Note (optional)')} maxLength={300}/><p>{t('Esto registra un pago que ya realizó; no ejecuta una transferencia.','This records a payment you already made; it does not execute a transfer.')}</p></WriteForm>}
 {expense&&data&&mode&&typeof mode==='object'&&<WriteForm title={t('Reversar pago','Reverse payment')} initial={{action:'reverse',expenseId:id,paymentId:mode.id,revision:data.revision}} onClose={()=>setMode(null)} onSaved={changed} prepare={f=>({date:f.get('date'),note:f.get('note')})}><p>{t('Se conservará el pago original y se registrará el reverso completo.','The original payment is preserved and a complete reversal is recorded.')}</p><Field name="date" label={t('Fecha del reverso','Reversal date')} type="date" value={today()} required/><Field name="note" label={t('Motivo del reverso','Reversal reason')} required maxLength={300}/></WriteForm>}
 </>;
}
