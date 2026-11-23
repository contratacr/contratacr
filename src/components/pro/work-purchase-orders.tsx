'use client';
import {projectVatInput} from '@/lib/pro/project-default-vat';
import {useProjectDefaultVat} from './use-project-default-vat';

import {useCallback,useEffect,useLayoutEffect,useRef,useState,type FormEvent,type ReactNode} from 'react';
import {useLocale} from 'next-intl';
import {useAuth} from '@/hooks/use-auth';
import {useAppDialog} from '@/hooks/use-app-dialog';
import {Button} from '@/components/ui/button';
import {proMoney} from '@/lib/pro/money';
import {centsToInput,colonesToCents,quantityToInput} from '@/lib/pro/allowances';
import {PoFromSources} from './round11-finance';
import {ProRoleCostNotice,useProInternalFinance} from './company-team';
import {
 poLineFigures,parsePoQuantity,parsePoTaxRate,poMethods,purchaseOrderBudgetSchema,purchaseOrderDetailSchema,purchaseOrderListSchema,purchaseOrderMutationSchema,purchaseOrderResultSchema,
 type PurchaseOrder,type PurchaseOrderBudget,type PurchaseOrderDetail,type PurchaseOrderHistoryEntry,type PurchaseOrderList,type PurchaseOrderMutation,type PurchaseOrderStatus,type PurchaseOrderSummary,
} from '@/lib/pro/purchase-orders';
import {useProChildGuard} from './use-pro-child-guard';
import {PurchaseOrderTracking} from './po-tracking';
import {pushProParams} from '@/lib/pro/navigation';

/**
 * Órdenes de compra por proyecto (families 51, 52 and 54). A purchase order is a
 * commitment to a supplier: nothing here sends e-mail, moves money or records an
 * expense. Payments and receipts are manual records.
 */
const api='/api/pro/purchase-orders',field='mt-1 block min-h-11 w-full min-w-0 rounded-xl border border-[#d7e1ea] bg-white px-3 text-base font-normal',label='block min-w-0 text-sm font-semibold text-[#162543]';
type StateCallback={onStateChange?:(state:{dirty:boolean;busy:boolean})=>void};
type Method=typeof poMethods[number];
type LineDraft={id:string;description:string;quantity:string;unit:string;price:string;tax:string;budgetCodeId:string;link:string};
type OrderDraft={supplierId:string;supplierName:string;supplierContact:string;title:string;issueDate:string;expectedDate:string;notes:string;lines:LineDraft[]};
type ReceiveDraft={receivedOn:string;note:string;quantities:Record<string,string>};
type PayDraft={amount:string;paidOn:string;method:Method;reference:string;note:string};
type Form={mode:'create'|'edit';order:PurchaseOrder|null;draft:OrderDraft;initial:OrderDraft}|{mode:'receive';order:PurchaseOrder;draft:ReceiveDraft;initial:ReceiveDraft}|{mode:'pay';order:PurchaseOrder;draft:PayDraft;initial:PayDraft}|{mode:'reverse';order:PurchaseOrder;paymentId:string;draft:{note:string};initial:{note:string}};
type Filters={status:string;supplier:string;overdue:boolean;from:string;to:string};
const noFilters:Filters={status:'all',supplier:'',overdue:false,from:'',to:''};
const money=(cents:number)=>proMoney(cents/100);
const day=(value:string|null,en:boolean)=>value?new Intl.DateTimeFormat(en?'en-US':'es-CR',{dateStyle:'medium',timeZone:'UTC'}).format(new Date(value+'T12:00:00Z')):'—';
const stamp=(value:string,en:boolean)=>new Intl.DateTimeFormat(en?'en-US':'es-CR',{dateStyle:'medium',timeStyle:'short',timeZone:'America/Costa_Rica'}).format(new Date(value));
const qty=(value:number,en:boolean)=>new Intl.NumberFormat(en?'en-US':'es-CR',{maximumFractionDigits:3}).format(value);
// Edit values use the language's decimal mark, so a Spanish «1.000» always means one thousand.
const qtyInput=(value:number,en:boolean)=>quantityToInput(value,en,3);
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);

function copy(en:boolean){
 return en?{
  title:'Purchase orders',intro:'Record what you order from each supplier for this project, track deliveries and the payments you make outside ContrataCR. An order is a commitment: it does not record an expense or send anything to the supplier.',
  add:'New purchase order',orders:'Orders',budget:'Budget',total:'Total',paid:'Paid',balance:'Balance',overdueStat:'Past due',count:(n:number)=>`${n} active ${n===1?'order':'orders'}`,
  status:'Status',supplier:'Supplier',allSuppliers:'All suppliers',onlyOverdue:'Past due only',from:'Issue date from',to:'Issue date to',clear:'Clear filters',
  statuses:{all:'All',open:'Open',draft:'Draft',issued:'Issued',partial:'Partially received',received:'Received',cancelled:'Cancelled'} as Record<string,string>,
  pastDue:'Past due',expected:'Expected',issued:'Issue date',lines:(n:number)=>`${n} ${n===1?'line':'lines'}`,open:'Open',prev:'Previous',next:'Next',page:(n:number)=>`Page ${n}`,
  empty:'There are no purchase orders for this project yet.',emptyHelp:'Create one for each supplier order, for example materials or fixtures already approved.',emptyFiltered:'No purchase orders match these filters.',
  loading:'Loading purchase orders…',loadError:'Could not load the purchase orders.',retry:'Retry',reload:'Reload',back:'Back to the list',cancel:'Cancel',saving:'Saving…',
  savedSupplier:'Saved supplier',otherSupplier:'Other supplier (type the name)',supplierName:'Supplier name',contact:'Contact (optional)',contactHelp:'Person, phone or e-mail for this order.',
  orderTitle:'Title',titlePlaceholder:'E.g. Kitchen cabinets',issueDate:'Issue date',expectedDate:'Expected delivery (optional)',notes:'Notes (optional)',
  line:(n:number)=>`Line ${n}`,description:'Description',quantity:'Quantity',unit:'Unit',unitPlaceholder:'unit, m², box…',price:'Unit cost (₡)',tax:'Tax %',taxShort:'Tax',taxHelp:'Tax is optional; leave it empty for 0 %. VAT in Costa Rica is usually 13 %.',
  budgetCode:'Budget code (optional)',noCode:'No budget code',link:'Linked to (optional)',noLink:'Nothing linked',staleLink:'Previous link (no longer available)',staleLinkHelp:'The selection is no longer approved or the allowance was archived. Choose another link or "Nothing linked" before saving.',staleLinkError:'A line keeps a link that is no longer available. Choose another link or "Nothing linked" and save again.',selectionPrefix:'Selection',allowancePrefix:'Allowance',
  addLine:'Add line',removeLine:'Remove line',lineTotal:(v:string)=>`Line total: ${v}`,subtotal:'Subtotal',taxes:'Taxes',orderTotal:'Order total',
  create:'Save purchase order',saveEdit:'Save changes',edit:'Edit',issue:'Mark as issued',receive:'Record delivery',pay:'Record payment',cancelOrder:'Cancel order',print:'Print or save as PDF',
  issueTitle:'Mark this order as issued?',issueText:'Use it once you sent the order to the supplier by your usual channel. ContrataCR does not send anything.',
  cancelTitle:'Cancel this purchase order?',cancelText:'It leaves the committed amount of the budget. The number is kept and the history stays.',cancelBlocked:'Reverse the recorded payments before cancelling.',
  received:'Received',ordered:'Ordered',remaining:'Pending',receivedOn:'Delivery date',receiveNote:'Note (optional)',receiveHelp:'Enter what arrived in this delivery for each line. Leave 0 for lines that did not arrive.',saveReceipt:'Save delivery',
  amount:'Amount (₡)',paidOn:'Payment date',method:'Method',reference:'Reference (optional)',payNote:'Note (optional)',payHelp:'Only records a payment you already made outside ContrataCR. No money is moved.',savePayment:'Save payment',
  methods:{transfer:'Bank transfer',sinpe:'SINPE Móvil',cash:'Cash',card:'Card',check:'Check',other:'Other'} as Record<Method,string>,
  payments:'Payments',noPayments:'No payments recorded.',reverse:'Reverse',reversed:'Reversed',reversal:'Reversal',reverseReason:'Reason for the reversal',saveReverse:'Save reversal',
  receipts:'Deliveries',noReceipts:'No deliveries recorded.',history:'Change history',historyEmpty:'No changes yet.',
  actions:{create:'Created',update:'Edited',issue:'Issued',receive:'Delivery recorded',pay:'Payment recorded',reverse_payment:'Payment reversed',cancel:'Cancelled'} as Record<PurchaseOrderHistoryEntry['action'],string>,
  invalid:'Complete the supplier, title, issue date and at least one line with description, quantity, unit and a valid cost. The expected date cannot be before the issue date.',
  invalidReceive:'Enter at least one quantity and do not exceed what is pending. The date cannot be before the issue date or in the future.',
  invalidPay:'Enter an amount greater than zero and not above the balance. The date cannot be before the issue date or in the future.',invalidReverse:'Write the reason for the reversal.',
  conflict:'This purchase order changed in another window. Reload before trying again.',uncertain:'We could not confirm whether it was saved. Retry the same operation; it will not be applied twice.',retrySame:'Retry the same operation',
  failed:'Could not save. Review the information and try again.',leave:'Save or cancel the purchase order you are editing before leaving.',
  saved:'Purchase order saved.',issuedNotice:'Purchase order marked as issued.',receivedNotice:'Delivery recorded.',paidNotice:'Payment recorded. No money was moved.',reversedNotice:'Payment reversed.',cancelledNotice:'Purchase order cancelled.',
  notesLabel:'Notes',contactLabel:'Contact',cancelReason:'Reason (optional)',readOnly:'This job is cancelled. Purchase orders can be viewed but not changed.',
  budgetTitle:'Budget with commitments',budgetIntro:'Per code: planned amount, committed in purchase orders that are not cancelled (tax included), actual costs already recorded, and the difference. Each code is projected with the larger of committed or actual, so an expense recorded later for the same purchase is not added twice.',
  planned:'Planned',committed:'Committed',actual:'Actual',variance:'Planned − projected',projected:'Projected',noCodes:'This project has no budget codes yet. Create them in Costs & payments › Budget.',openBudget:'Create the budget in Costs & payments',filters:'Filters',filtersActive:'active',uncoded:'Without budget code',incomplete:'Incomplete',budgetError:'Could not load the budget comparison.',group:'Group',
 }:{
  title:'Órdenes de compra',intro:'Registre lo que pide a cada proveedor para este proyecto, dé seguimiento a las entregas y a los pagos que hace fuera de ContrataCR. Una orden es un compromiso: no registra un gasto ni envía nada al proveedor.',
  add:'Nueva orden de compra',orders:'Órdenes',budget:'Presupuesto',total:'Total',paid:'Pagado',balance:'Saldo',overdueStat:'Vencidas',count:(n:number)=>`${n} ${n===1?'orden activa':'órdenes activas'}`,
  status:'Estado',supplier:'Proveedor',allSuppliers:'Todos los proveedores',onlyOverdue:'Solo vencidas',from:'Emisión desde',to:'Emisión hasta',clear:'Quitar filtros',
  statuses:{all:'Todas',open:'Abiertas',draft:'Borrador',issued:'Emitida',partial:'Recibida en parte',received:'Recibida',cancelled:'Cancelada'} as Record<string,string>,
  pastDue:'Vencida',expected:'Entrega esperada',issued:'Emisión',lines:(n:number)=>`${n} ${n===1?'línea':'líneas'}`,open:'Abrir',prev:'Anterior',next:'Siguiente',page:(n:number)=>`Página ${n}`,
  empty:'Todavía no hay órdenes de compra en este proyecto.',emptyHelp:'Cree una por cada pedido a un proveedor, por ejemplo materiales o acabados ya aprobados.',emptyFiltered:'Ninguna orden de compra coincide con estos filtros.',
  loading:'Cargando órdenes de compra…',loadError:'No se pudieron cargar las órdenes de compra.',retry:'Reintentar',reload:'Recargar',back:'Volver a la lista',cancel:'Cancelar',saving:'Guardando…',
  savedSupplier:'Proveedor guardado',otherSupplier:'Otro proveedor (escriba el nombre)',supplierName:'Nombre del proveedor',contact:'Contacto (opcional)',contactHelp:'Persona, teléfono o correo para esta orden.',
  orderTitle:'Título',titlePlaceholder:'Ej.: Muebles de cocina',issueDate:'Fecha de emisión',expectedDate:'Entrega esperada (opcional)',notes:'Notas (opcional)',
  line:(n:number)=>`Línea ${n}`,description:'Descripción',quantity:'Cantidad',unit:'Unidad',unitPlaceholder:'unidad, m², caja…',price:'Costo unitario (₡)',tax:'Impuesto %',taxShort:'Impuesto',taxHelp:'El impuesto es opcional; vacío equivale a 0 %. El IVA en Costa Rica suele ser 13 %.',
  budgetCode:'Código de presupuesto (opcional)',noCode:'Sin código de presupuesto',link:'Vinculada a (opcional)',noLink:'Sin vínculo',staleLink:'Vínculo anterior (ya no disponible)',staleLinkHelp:'La selección ya no está aprobada o el monto previsto se archivó. Elija otro vínculo o "Sin vínculo" antes de guardar.',staleLinkError:'Una línea conserva un vínculo que ya no está disponible. Elija otro vínculo o "Sin vínculo" y guarde de nuevo.',selectionPrefix:'Selección',allowancePrefix:'Monto previsto',
  addLine:'Agregar línea',removeLine:'Quitar línea',lineTotal:(v:string)=>`Total de la línea: ${v}`,subtotal:'Subtotal',taxes:'Impuestos',orderTotal:'Total de la orden',
  create:'Guardar orden de compra',saveEdit:'Guardar cambios',edit:'Editar',issue:'Marcar como emitida',receive:'Registrar entrega',pay:'Registrar pago',cancelOrder:'Cancelar orden',print:'Imprimir o guardar en PDF',
  issueTitle:'¿Marcar esta orden como emitida?',issueText:'Úselo cuando ya envió la orden al proveedor por su medio habitual. ContrataCR no envía nada.',
  cancelTitle:'¿Cancelar esta orden de compra?',cancelText:'Sale del monto comprometido del presupuesto. El número se conserva y el historial queda.',cancelBlocked:'Reverse los pagos registrados antes de cancelar.',
  received:'Recibido',ordered:'Pedido',remaining:'Pendiente',receivedOn:'Fecha de entrega',receiveNote:'Nota (opcional)',receiveHelp:'Indique lo que llegó en esta entrega para cada línea. Deje 0 en las líneas que no llegaron.',saveReceipt:'Guardar entrega',
  amount:'Monto (₡)',paidOn:'Fecha del pago',method:'Medio',reference:'Referencia (opcional)',payNote:'Nota (opcional)',payHelp:'Solo registra un pago que usted ya hizo fuera de ContrataCR. No se mueve dinero.',savePayment:'Guardar pago',
  methods:{transfer:'Transferencia',sinpe:'SINPE Móvil',cash:'Efectivo',card:'Tarjeta',check:'Cheque',other:'Otro'} as Record<Method,string>,
  payments:'Pagos',noPayments:'No hay pagos registrados.',reverse:'Reversar',reversed:'Reversado',reversal:'Reverso',reverseReason:'Motivo del reverso',saveReverse:'Guardar reverso',
  receipts:'Entregas',noReceipts:'No hay entregas registradas.',history:'Historial de cambios',historyEmpty:'Todavía no hay cambios.',
  actions:{create:'Creada',update:'Editada',issue:'Emitida',receive:'Entrega registrada',pay:'Pago registrado',reverse_payment:'Pago reversado',cancel:'Cancelada'} as Record<PurchaseOrderHistoryEntry['action'],string>,
  invalid:'Complete el proveedor, el título, la fecha de emisión y al menos una línea con descripción, cantidad, unidad y un costo válido. La entrega esperada no puede ser anterior a la emisión.',
  invalidReceive:'Indique al menos una cantidad y no supere lo pendiente. La fecha no puede ser anterior a la emisión ni futura.',
  invalidPay:'Indique un monto mayor que cero y que no supere el saldo. La fecha no puede ser anterior a la emisión ni futura.',invalidReverse:'Escriba el motivo del reverso.',
  conflict:'Esta orden de compra cambió en otra ventana. Recargue antes de volver a intentarlo.',uncertain:'No pudimos confirmar si se guardó. Reintente la misma operación; no se aplicará dos veces.',retrySame:'Reintentar la misma operación',
  failed:'No se pudo guardar. Revise los datos y vuelva a intentarlo.',leave:'Guarde o cancele la orden de compra que está editando antes de salir.',
  saved:'Orden de compra guardada.',issuedNotice:'Orden de compra marcada como emitida.',receivedNotice:'Entrega registrada.',paidNotice:'Pago registrado. No se movió dinero.',reversedNotice:'Pago reversado.',cancelledNotice:'Orden de compra cancelada.',
  notesLabel:'Notas',contactLabel:'Contacto',cancelReason:'Motivo (opcional)',readOnly:'Este trabajo está cancelado. Las órdenes se pueden consultar, pero no cambiar.',
  budgetTitle:'Presupuesto con compromisos',budgetIntro:'Por código: lo previsto, lo comprometido en órdenes de compra no canceladas (con impuesto), los costos reales ya registrados y la diferencia. Cada código se proyecta con el mayor entre comprometido y real, para que un gasto registrado después por la misma compra no se sume dos veces.',
  planned:'Previsto',committed:'Comprometido',actual:'Real',variance:'Previsto − proyectado',projected:'Proyectado',noCodes:'Este proyecto todavía no tiene códigos de presupuesto. Créelos en Costos y pagos › Presupuesto.',openBudget:'Crear el presupuesto en Costos y pagos',filters:'Filtros',filtersActive:'activos',uncoded:'Sin código de presupuesto',incomplete:'Incompleto',budgetError:'No se pudo cargar la comparación del presupuesto.',group:'Grupo',
 };
}
type Copy=ReturnType<typeof copy>;

/** A line link ("sel:"/"alw:") the current references no longer offer. */
const staleLink=(link:string,refs:PurchaseOrderList['references'])=>!!link&&!(link.startsWith('sel:')?refs.selectionOptions.some(option=>option.id===link.slice(4)):link.startsWith('alw:')&&refs.allowances.some(allowance=>allowance.id===link.slice(4)));
const newLine=(tax=''):LineDraft=>({id:crypto.randomUUID(),description:'',quantity:'1',unit:'',price:'',tax,budgetCodeId:'',link:''});
const draftOf=(order:PurchaseOrder,en:boolean):OrderDraft=>({supplierId:order.supplierId??'',supplierName:order.supplierId?'':order.supplierName,supplierContact:order.supplierContact??'',title:order.title,issueDate:order.issueDate,expectedDate:order.expectedDate??'',notes:order.notes??'',
 lines:order.lines.map(line=>({id:line.id,description:line.description,quantity:qtyInput(line.quantity,en),unit:line.unit,price:centsToInput(line.unitCents),tax:line.taxRate?quantityToInput(line.taxRate,en,2):'',budgetCodeId:line.budgetCodeId??'',link:line.selectionOptionId?'sel:'+line.selectionOptionId:line.allowanceId?'alw:'+line.allowanceId:''}))});

export function WorkPurchaseOrders({workId,onStateChange}:{workId:string}&StateCallback){
 const {user,loading}=useAuth(),finance=useProInternalFinance();if(loading||!user)return null;
 if(!finance.allowed)return <ProRoleCostNotice/>;
 return <PurchaseOrdersSession key={user.id+':'+workId} accountId={user.id} workId={workId} onStateChange={onStateChange}/>;
}

function PurchaseOrdersSession({accountId,workId,onStateChange}:{accountId:string;workId:string}&StateCallback){
 const en=useLocale()==='en',c=copy(en),{confirm,dialogNode}=useAppDialog();
 // New lines take the project's default VAT (Detalles del proyecto); saved orders are never changed.
 const defaultTax=projectVatInput(useProjectDefaultVat(workId,accountId),en);
 const [list,setList]=useState<PurchaseOrderList|null>(null),[loading,setLoading]=useState(true),[loadError,setLoadError]=useState(false);
 const [filters,setFilters]=useState<Filters>(noFilters),[cursors,setCursors]=useState<Array<number|null>>([null]),[filtersOpen,setFiltersOpen]=useState(false);
 const [tab,setTab]=useState<'orders'|'budget'>('orders'),[budgetKey,setBudgetKey]=useState(0);
 const [openId,setOpenId]=useState<string|null>(null),[detail,setDetail]=useState<Extract<PurchaseOrderDetail,{history:unknown}>|null>(null),[detailError,setDetailError]=useState(false);
 const [form,setForm]=useState<Form|null>(null),[saving,setSaving]=useState(false),[uncertain,setUncertain]=useState(false),[conflict,setConflict]=useState(false);
 const [error,setError]=useState(''),[notice,setNotice]=useState('');
 const [fromSources,setFromSources]=useState(false);
 const active=useRef(true),sequence=useRef(0),detailSequence=useRef(0),lock=useRef(false),pending=useRef<{input:PurchaseOrderMutation;notice:string}|null>(null);
 const dirty=!!form&&!same(form.draft,form.initial),busy=saving||uncertain;
 useProChildGuard(!onStateChange&&(dirty||busy),useCallback(()=>setError(c.leave),[c.leave]));
 useLayoutEffect(()=>{onStateChange?.({dirty,busy});return()=>onStateChange?.({dirty:false,busy:false});},[dirty,busy,onStateChange]);
 const cursor=cursors.at(-1)??null;
 const load=useCallback(async()=>{
  const id=++sequence.current;setLoading(true);setLoadError(false);
  try{
   const query:Record<string,string>={workId};if(filters.status!=='all')query.status=filters.status;if(filters.supplier)query.supplier=filters.supplier;if(filters.overdue)query.overdue='1';
   if(filters.from)query.from=filters.from;if(filters.to)query.to=filters.to;if(cursor!==null)query.after=String(cursor);
   const response=await fetch(api+'?'+new URLSearchParams(query),{cache:'no-store',headers:{'X-Pro-Expected-Actor':accountId}});if(!response.ok)throw Error();
   const body=purchaseOrderListSchema.parse(await response.json());if(body.workId!==workId)throw Error();
   if(active.current&&id===sequence.current){setList(body);setConflict(false);}
   return true;
  }catch{if(active.current&&id===sequence.current)setLoadError(true);return false;}
  finally{if(active.current&&id===sequence.current)setLoading(false);}
 },[accountId,workId,filters,cursor]);
 const loadDetail=useCallback(async(orderId:string)=>{
  const id=++detailSequence.current;setDetailError(false);
  try{
   const response=await fetch(api+'?'+new URLSearchParams({workId,view:'detail',id:orderId}),{cache:'no-store',headers:{'X-Pro-Expected-Actor':accountId}});if(!response.ok)throw Error();
   const body=purchaseOrderDetailSchema.parse(await response.json());if(!body.order||!('history' in body)||body.order.id!==orderId)throw Error();
   if(active.current&&id===detailSequence.current)setDetail(body);
  }catch{if(active.current&&id===detailSequence.current)setDetailError(true);}
 },[accountId,workId]);
 const invalidate=useCallback(()=>{sequence.current++;},[]),invalidateDetail=useCallback(()=>{detailSequence.current++;},[]);
 useEffect(()=>{active.current=true;const timer=setTimeout(()=>void load(),0);return()=>{active.current=false;invalidate();clearTimeout(timer);};},[load,invalidate]);
 useEffect(()=>{if(!openId)return;const timer=setTimeout(()=>void loadDetail(openId),0);return()=>{invalidateDetail();clearTimeout(timer);};},[openId,loadDetail,invalidateDetail]);

 async function send(input:PurchaseOrderMutation,success:string){
  if(lock.current)return false;lock.current=true;pending.current={input,notice:success};setSaving(true);setError('');setNotice('');
  try{
   const response=await fetch(api,{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json','X-Pro-Expected-Actor':accountId},body:JSON.stringify(input)});
   if(response.status===409){pending.current=null;setUncertain(false);setConflict(true);setError(c.conflict);return false;}
   if(response.status>=500||response.status===429){setUncertain(true);setError(c.uncertain);return false;}
   if(!response.ok){pending.current=null;setUncertain(false);setError(input.action==='receive'?c.invalidReceive:input.action==='pay'?c.invalidPay:input.action==='create'||input.action==='update'?c.invalid:c.failed);return false;}
   const body=purchaseOrderResultSchema.parse(await response.json());if(body.order.id!==input.id||body.order.workId!==workId)throw Error();
   pending.current=null;setUncertain(false);
   if(active.current){setForm(null);setNotice(success);setOpenId(body.order.id);setBudgetKey(key=>key+1);if(input.action==='create')setCursors([null]);}
   lock.current=false;await Promise.all([load(),loadDetail(body.order.id)]);return true;
  }catch{setUncertain(true);setError(c.uncertain);return false;}
  finally{lock.current=false;if(active.current)setSaving(false);}
 }
 const refs=list?.references;
 function submit(event:FormEvent){
  event.preventDefault();if(!form||busy||conflict)return;
  if(form.mode==='receive'){
   const entries:Array<{lineId:string;quantity:number}>=[];let bad=false;
   for(const line of form.order.lines){const raw=(form.draft.quantities[line.id]??'').trim();if(!raw||Number(raw.replace(',','.'))===0)continue;const value=parsePoQuantity(raw,en);if(value===null||value>line.quantity-line.receivedQuantity+1e-9){bad=true;break;}entries.push({lineId:line.id,quantity:value});}
   const parsed=purchaseOrderMutationSchema.safeParse({action:'receive',actionId:crypto.randomUUID(),workId,id:form.order.id,revision:form.order.revision,receivedOn:form.draft.receivedOn,note:form.draft.note.trim()||null,entries});
   if(bad||!parsed.success||list&&form.draft.receivedOn>list.today||form.draft.receivedOn<form.order.issueDate){setError(c.invalidReceive);return;}
   void send(parsed.data,c.receivedNotice);return;
  }
  if(form.mode==='pay'){
   const amount=colonesToCents(form.draft.amount);
   const parsed=purchaseOrderMutationSchema.safeParse({action:'pay',actionId:crypto.randomUUID(),workId,id:form.order.id,revision:form.order.revision,amountCents:amount,paidOn:form.draft.paidOn,method:form.draft.method,reference:form.draft.reference.trim()||null,note:form.draft.note.trim()||null});
   if(!parsed.success||amount===null||amount>form.order.balanceCents||list&&form.draft.paidOn>list.today||form.draft.paidOn<form.order.issueDate){setError(c.invalidPay);return;}
   void send(parsed.data,c.paidNotice);return;
  }
  if(form.mode==='reverse'){
   const parsed=purchaseOrderMutationSchema.safeParse({action:'reverse_payment',actionId:crypto.randomUUID(),workId,id:form.order.id,revision:form.order.revision,paymentId:form.paymentId,note:form.draft.note});
   if(!parsed.success){setError(c.invalidReverse);return;}
   void send(parsed.data,c.reversedNotice);return;
  }
  const d=form.draft;let bad=false;
  // A saved link that is no longer offered (selection unapproved, allowance archived) is never dropped silently: the user decides.
  if(refs&&d.lines.some(line=>staleLink(line.link,refs))){setError(c.staleLinkError);return;}
  const lines=d.lines.map(line=>{const quantity=parsePoQuantity(line.quantity,en),unitCents=colonesToCents(line.price),taxRate=parsePoTaxRate(line.tax);if(quantity===null||unitCents===null||taxRate===null)bad=true;
   return {id:line.id,description:line.description,quantity,unit:line.unit,unitCents,taxRate,budgetCodeId:line.budgetCodeId||null,selectionOptionId:line.link.startsWith('sel:')?line.link.slice(4):null,allowanceId:line.link.startsWith('alw:')?line.link.slice(4):null};});
  const base={workId,actionId:crypto.randomUUID(),supplierId:d.supplierId||null,supplierName:d.supplierId?null:d.supplierName.trim()||null,supplierContact:d.supplierContact.trim()||null,title:d.title,issueDate:d.issueDate,expectedDate:d.expectedDate||null,notes:d.notes.trim()||null,lines};
  const parsed=purchaseOrderMutationSchema.safeParse(form.mode==='create'?{action:'create',id:crypto.randomUUID(),...base}:{action:'update',id:form.order!.id,revision:form.order!.revision,...base});
  if(bad||!parsed.success){setError(c.invalid);return;}
  void send(parsed.data,c.saved);
 }
 function open(next:Form){if(busy)return;setForm(next);setError('');setNotice('');}
 function cancelForm(){setForm(null);setError('');setConflict(false);}
 function retrySame(){if(pending.current)void send(pending.current.input,pending.current.notice);}
 function setFilter(next:Partial<Filters>){setFilters(value=>({...value,...next}));setCursors([null]);}
 async function issue(order:PurchaseOrder){
  if(busy||form)return;const answer=await confirm({title:c.issueTitle,description:`${order.code} · ${order.title}`,detail:c.issueText,confirmLabel:c.issue,cancelLabel:c.cancel});if(!answer.confirmed)return;
  void send({action:'issue',actionId:crypto.randomUUID(),workId,id:order.id,revision:order.revision},c.issuedNotice);
 }
 async function cancelOrder(order:PurchaseOrder){
  if(busy||form)return;if(order.paidCents!==0){setError(c.cancelBlocked);return;}
  const answer=await confirm({title:c.cancelTitle,description:`${order.code} · ${order.title} · ${money(order.totalCents)}`,detail:c.cancelText,confirmLabel:c.cancelOrder,cancelLabel:c.back,tone:'danger'});if(!answer.confirmed)return;
  void send({action:'cancel',actionId:crypto.randomUUID(),workId,id:order.id,revision:order.revision,reason:null},c.cancelledNotice);
 }

 if(loading&&!list)return <p role="status" className="text-sm text-[#52627a]">{c.loading}</p>;
 if(!list)return <div role="alert" data-purchase-orders-load-error className="space-y-2 rounded-2xl border border-[#d7e1ea] p-4"><p className="text-sm">{c.loadError}</p><Button type="button" variant="secondary" disabled={loading} onClick={()=>void load()}>{c.retry}</Button></div>;
 const t=list.totals,canWrite=list.canWrite,order=openId&&detail?.order.id===openId?detail.order:null,filtered=!same(filters,noFilters);
 const messages=<>
  {notice&&<p role="status" className="rounded-xl bg-[#eef8f4] p-3 text-sm text-[#18573a]">{notice}</p>}
  {error&&<div role="alert" data-purchase-order-error className="space-y-2 rounded-xl bg-[#fff4f2] p-3 text-sm text-[#8a2a1b]"><p>{error}</p>
   {uncertain&&<Button type="button" variant="secondary" disabled={saving} onClick={retrySame}>{c.retrySame}</Button>}
   {conflict&&<Button type="button" variant="secondary" disabled={loading||saving} onClick={()=>{setForm(null);setError('');setConflict(false);void load();if(openId)void loadDetail(openId);}}>{c.reload}</Button>}</div>}
 </>;
 return <section data-purchase-orders className="min-w-0 space-y-5">
  {dialogNode}
  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
   <div className="min-w-0"><h3 className="text-lg font-bold text-[#162543]">{c.title}</h3><p className="mt-1 text-sm text-[#52627a]">{c.intro}</p></div>
   {tab==='orders'&&!form&&!openId&&canWrite&&<div className="flex shrink-0 flex-wrap gap-2"><Button type="button" variant="secondary" className="min-h-11" data-po-from-sources-open disabled={busy||conflict||fromSources} onClick={()=>setFromSources(true)}>{en?'From quote, selections or budget':'Desde cotización, selecciones o presupuesto'}</Button><Button type="button" className="min-h-11 shrink-0" disabled={busy||conflict} onClick={()=>{setFromSources(false);const draft={supplierId:'',supplierName:'',supplierContact:'',title:'',issueDate:list.today,expectedDate:'',notes:'',lines:[newLine(defaultTax)]};open({mode:'create',order:null,draft,initial:draft});}}>{c.add}</Button></div>}
  </div>
  {/* Segmented view switch (not ARIA tabs: there is no tabpanel/arrow-key model). */}
  <div role="group" aria-label={c.title} className="inline-flex rounded-xl bg-[#e9eff5] p-1">
   {(['orders','budget'] as const).map(value=><button key={value} type="button" aria-pressed={tab===value} data-purchase-orders-tab={value} disabled={busy||!!form} onClick={()=>setTab(value)} className={`min-h-11 rounded-lg px-4 text-sm font-semibold disabled:opacity-50 ${tab===value?'bg-white text-[#008bb5] shadow-sm':'text-[#52627a]'}`}>{value==='orders'?c.orders:c.budget}</button>)}
  </div>
  {!canWrite&&<p className="rounded-xl bg-[#fff6e5] p-3 text-sm text-[#7a4b00]">{c.readOnly}</p>}
  {tab==='budget'?<PurchaseOrderBudgetTable accountId={accountId} workId={workId} refreshKey={budgetKey}/>:<>
  {messages}
  {/* Round 11: prefill a new order from the accepted quote lines, approved selections or budget codes (same writer). */}
  {fromSources&&!form&&!openId&&canWrite&&list&&<PoFromSources actor={accountId} workId={workId} disabled={busy||conflict} onCancel={()=>setFromSources(false)} onUse={lines=>{setFromSources(false);const draft={supplierId:'',supplierName:'',supplierContact:'',title:en?'Order from the job':'Pedido del trabajo',issueDate:list.today,expectedDate:'',notes:'',lines:lines.map(line=>({...newLine(defaultTax),description:line.description,quantity:qtyInput(line.quantity,en),unit:line.unit,price:line.unitCents===null?'':centsToInput(line.unitCents),budgetCodeId:line.budgetCodeId??'',link:line.selectionOptionId?'sel:'+line.selectionOptionId:''}))};open({mode:'create',order:null,draft,initial:{...draft,lines:[]}});}}/>}
  {form&&(form.mode==='create'||form.mode==='edit')?<OrderForm c={c} defaultTax={defaultTax} form={form} refs={refs!} busy={busy||conflict} saving={saving} onChange={draft=>setForm({...form,draft})} onSubmit={submit} onCancel={cancelForm}/>:
  openId?<OrderDetail accountId={accountId} c={c} en={en} order={order} history={order&&detail?detail.history:[]} error={detailError} onRetry={()=>void loadDetail(openId)} onBack={()=>{setOpenId(null);setDetail(null);setNotice('');setError('');setForm(null);}}
   workId={workId} canWrite={canWrite} disabled={busy||conflict||!!form} form={form} saving={saving} today={list.today} refs={refs!}
   onEdit={o=>open({mode:'edit',order:o,draft:draftOf(o,en),initial:draftOf(o,en)})} onIssue={o=>void issue(o)} onCancel={o=>void cancelOrder(o)}
   onReceive={o=>{/* The suggested quantities are the starting point, not a user change: opening the form alone does not block navigation. */const initial={receivedOn:list.today,note:'',quantities:Object.fromEntries(o.lines.map(line=>[line.id,qtyInput(Math.max(0,line.quantity-line.receivedQuantity),en)]))};open({mode:'receive',order:o,draft:initial,initial});}}
   onPay={o=>{const initial={amount:centsToInput(o.balanceCents),paidOn:list.today,method:'transfer' as Method,reference:'',note:''};open({mode:'pay',order:o,draft:initial,initial});}}
   onReverse={(o,paymentId)=>open({mode:'reverse',order:o,paymentId,draft:{note:''},initial:{note:''}})}
   onFormChange={next=>setForm(next)} onSubmit={submit} onFormCancel={cancelForm}/>:<>
  <dl data-purchase-order-totals className="grid grid-cols-2 gap-2 sm:grid-cols-4">
   <Stat label={c.total} value={money(t.totalCents)} id="total"/>
   <Stat label={c.paid} value={money(t.paidCents)} id="paid"/>
   <Stat label={c.balance} value={money(t.balanceCents)} id="balance"/>
   <Stat label={c.overdueStat} value={String(t.overdueCount)} id="overdue" tone={t.overdueCount>0}/>
  </dl>
  <p className="text-sm text-[#52627a]" data-purchase-order-count>{c.count(t.count)}</p>
  {/* Round 2: on phones the filters start folded behind one button (they took a full screen). */}
  <Button type="button" variant="outline" className="min-h-11 w-full sm:hidden" data-po-filters-toggle aria-expanded={filtersOpen} onClick={()=>setFiltersOpen(value=>!value)}>{c.filters}{filtered?` · ${c.filtersActive}`:''}</Button>
  <div data-purchase-order-filters className={`${filtersOpen?'grid':'hidden'} grid-cols-1 gap-3 rounded-2xl sm:grid border border-[#d7e1ea] bg-[#f7f9fc] p-3 sm:grid-cols-2 lg:grid-cols-4`}>
   <label className={label}>{c.status}<select data-po-filter="status" className={field} value={filters.status} disabled={busy} onChange={event=>setFilter({status:event.target.value})}>{['all','open',...['draft','issued','partial','received','cancelled']].map(value=><option key={value} value={value}>{c.statuses[value]}</option>)}</select></label>
   <label className={label}>{c.supplier}<select data-po-filter="supplier" className={field} value={filters.supplier} disabled={busy} onChange={event=>setFilter({supplier:event.target.value})}><option value="">{c.allSuppliers}</option>{list.supplierNames.map(name=><option key={name} value={name}>{name}</option>)}</select></label>
   <label className={label}>{c.from}<input data-po-filter="from" type="date" className={field} value={filters.from} max={filters.to||undefined} disabled={busy} onChange={event=>setFilter({from:event.target.value})}/></label>
   <label className={label}>{c.to}<input data-po-filter="to" type="date" className={field} value={filters.to} min={filters.from||undefined} disabled={busy} onChange={event=>setFilter({to:event.target.value})}/></label>
   <label className="flex min-h-11 items-center gap-2 text-sm font-semibold text-[#162543]"><input data-po-filter="overdue" type="checkbox" className="h-5 w-5" checked={filters.overdue} disabled={busy} onChange={event=>setFilter({overdue:event.target.checked})}/>{c.onlyOverdue}</label>
   {filtered&&<Button type="button" variant="secondary" className="min-h-11" disabled={busy} onClick={()=>{setFilters(noFilters);setCursors([null]);}}>{c.clear}</Button>}
  </div>
  {loadError&&<div role="alert" className="space-y-2 text-sm"><p>{c.loadError}</p><Button type="button" variant="secondary" disabled={loading} onClick={()=>void load()}>{c.retry}</Button></div>}
  {!list.items.length?<div data-purchase-orders-empty className="rounded-2xl border border-dashed border-[#d7e1ea] bg-[#f7f9fc] p-5 text-center"><p className="font-semibold text-[#162543]">{filtered?c.emptyFiltered:c.empty}</p>{!filtered&&<p className="mt-1 text-sm text-[#52627a]">{c.emptyHelp}</p>}</div>:
   <ul data-purchase-order-list className="space-y-2">{list.items.map(item=><li key={item.id}><OrderRow c={c} en={en} item={item} disabled={busy} onOpen={()=>{setOpenId(item.id);setDetail(null);setNotice('');setError('');}}/></li>)}</ul>}
  {(cursors.length>1||list.nextCursor!==null)&&<nav data-purchase-order-pages className="flex flex-wrap items-center justify-between gap-2">
   <Button type="button" variant="secondary" disabled={busy||loading||cursors.length<=1} onClick={()=>setCursors(value=>value.slice(0,-1))}>{c.prev}</Button>
   <span className="text-sm text-[#52627a]">{c.page(cursors.length)}</span>
   <Button type="button" variant="secondary" disabled={busy||loading||list.nextCursor===null} onClick={()=>{const next=list.nextCursor;if(next!==null)setCursors(value=>[...value,next]);}}>{c.next}</Button>
  </nav>}
  </>}
  </>}
 </section>;
}

function Stat({label:text,value,id,tone,wide}:{label:string;value:string;id:string;tone?:boolean;wide?:boolean}){
 return <div data-po-total={id} className={`min-w-0 ${wide?'col-span-2 sm:col-span-1 ':''}rounded-xl border border-[#d7e1ea] bg-[#f7f9fc] p-3`}><dt className="text-xs font-semibold text-[#52627a]">{text}</dt><dd className={`mt-1 break-words text-base font-bold tabular-nums ${tone?'text-[#a03c1f]':'text-[#162543]'}`}>{value}</dd></div>;
}
function StatusBadge({status,c}:{status:PurchaseOrderStatus;c:Copy}){
 const tone=status==='received'?'bg-[#eef8f4] text-[#18573a]':status==='cancelled'?'bg-[#f1f3f6] text-[#52627a]':status==='partial'?'bg-[#fff6e5] text-[#7a4b00]':status==='issued'?'bg-[#eaf5fb] text-[#006e90]':'bg-white text-[#52627a] border border-[#d7e1ea]';
 return <span data-po-status={status} className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${tone}`}>{c.statuses[status]}</span>;
}
function OrderRow({c,en,item,disabled,onOpen}:{c:Copy;en:boolean;item:PurchaseOrderSummary;disabled:boolean;onOpen:()=>void}){
 return <article data-purchase-order={item.code} className="grid min-w-0 gap-3 rounded-2xl border border-[#d7e1ea] bg-white p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
  <div className="min-w-0 space-y-1">
   <div className="flex flex-wrap items-center gap-2"><strong className="text-[#008bb5]">{item.code}</strong><StatusBadge status={item.status} c={c}/>{item.overdue&&<span data-po-overdue className="rounded-full bg-[#fff4f2] px-2.5 py-1 text-xs font-semibold text-[#a03c1f]">{c.pastDue}</span>}</div>
   <p className="break-words font-semibold text-[#162543]">{item.title}</p>
   <p className="break-words text-sm text-[#52627a]">{item.supplierName} · {c.issued}: {day(item.issueDate,en)}{item.expectedDate?` · ${c.expected}: ${day(item.expectedDate,en)}`:''} · {c.lines(item.lineCount)}</p>
  </div>
  <div className="flex flex-wrap items-center justify-between gap-3 sm:justify-end">
   <dl className="grid grid-cols-2 gap-x-4 text-sm"><dt className="text-xs text-[#52627a]">{c.total}</dt><dt className="text-xs text-[#52627a]">{c.balance}</dt><dd data-po-row-total className="whitespace-nowrap font-bold tabular-nums">{money(item.totalCents)}</dd><dd data-po-row-balance className="whitespace-nowrap font-bold tabular-nums">{item.status==='cancelled'?'—':money(item.balanceCents)}</dd></dl>
   <Button type="button" variant="secondary" className="min-h-11" disabled={disabled} onClick={onOpen}>{c.open}</Button>
  </div>
 </article>;
}

function OrderForm({c,defaultTax='',form,refs,busy,saving,onChange,onSubmit,onCancel}:{c:Copy;defaultTax?:string;form:Extract<Form,{mode:'create'|'edit'}>;refs:PurchaseOrderList['references'];busy:boolean;saving:boolean;onChange:(draft:OrderDraft)=>void;onSubmit:(event:FormEvent)=>void;onCancel:()=>void}){
 const en=useLocale()==='en',d=form.draft,setLine=(index:number,next:Partial<LineDraft>)=>onChange({...d,lines:d.lines.map((line,i)=>i===index?{...line,...next}:line)});
 const figures=d.lines.map(line=>{const q=parsePoQuantity(line.quantity,en),u=colonesToCents(line.price),r=parsePoTaxRate(line.tax);return q===null||u===null||r===null?null:poLineFigures(q,u,r);});
 const sum=figures.reduce<{subtotal:number;tax:number;total:number}>((acc,value)=>value?{subtotal:acc.subtotal+value.subtotal,tax:acc.tax+value.tax,total:acc.total+value.total}:acc,{subtotal:0,tax:0,total:0});
 const supplierKnown=!d.supplierId||refs.suppliers.some(s=>s.id===d.supplierId);
 return <form data-purchase-order-form={form.mode} onSubmit={onSubmit} className="space-y-4 rounded-2xl border border-[#d7e1ea] bg-white p-4" noValidate>
  {form.order?<p className="font-semibold text-[#008bb5]">{form.order.code}</p>:null}
  <div className="grid gap-3 sm:grid-cols-2">
   <label className={label}>{c.supplier}<select data-po-field="supplier" className={field} value={d.supplierId} disabled={busy} onChange={event=>onChange({...d,supplierId:event.target.value,supplierName:event.target.value?'':d.supplierName})}>
    <option value="">{c.otherSupplier}</option>
    {!supplierKnown&&form.order&&<option value={d.supplierId}>{form.order.supplierName}</option>}
    {refs.suppliers.length>0&&<optgroup label={c.savedSupplier}>{refs.suppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</optgroup>}
   </select></label>
   {!d.supplierId&&<label className={label}>{c.supplierName}<input data-po-field="supplierName" className={field} maxLength={160} value={d.supplierName} disabled={busy} onChange={event=>onChange({...d,supplierName:event.target.value})}/></label>}
   <label className={label}>{c.contact}<input data-po-field="contact" className={field} maxLength={200} value={d.supplierContact} disabled={busy} onChange={event=>onChange({...d,supplierContact:event.target.value})}/><span className="mt-1 block text-xs font-normal text-[#52627a]">{c.contactHelp}</span></label>
   <label className={label}>{c.orderTitle}<input data-po-field="title" className={field} maxLength={160} placeholder={c.titlePlaceholder} value={d.title} disabled={busy} onChange={event=>onChange({...d,title:event.target.value})}/></label>
   <label className={label}>{c.issueDate}<input data-po-field="issueDate" type="date" className={field} value={d.issueDate} disabled={busy} onChange={event=>onChange({...d,issueDate:event.target.value})}/></label>
   <label className={label}>{c.expectedDate}<input data-po-field="expectedDate" type="date" className={field} min={d.issueDate||undefined} value={d.expectedDate} disabled={busy} onChange={event=>onChange({...d,expectedDate:event.target.value})}/></label>
  </div>
  <ol className="space-y-3">{d.lines.map((line,index)=>{const fig=figures[index];return <li key={line.id} data-po-line={index} className="space-y-3 rounded-xl border border-[#d7e1ea] bg-[#f7f9fc] p-3">
   <div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-sm text-[#162543]">{c.line(index+1)}</strong>{d.lines.length>1&&<Button type="button" variant="secondary" className="min-h-11" disabled={busy} onClick={()=>onChange({...d,lines:d.lines.filter((_,i)=>i!==index)})}>{c.removeLine}</Button>}</div>
   <label className={label}>{c.description}<input data-po-line-field="description" className={field} maxLength={300} value={line.description} disabled={busy} onChange={event=>setLine(index,{description:event.target.value})}/></label>
   <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
    <label className={label}>{c.quantity}<input data-po-line-field="quantity" inputMode="decimal" className={field} value={line.quantity} disabled={busy} onChange={event=>setLine(index,{quantity:event.target.value})}/></label>
    <label className={label}>{c.unit}<input data-po-line-field="unit" className={field} maxLength={20} placeholder={c.unitPlaceholder} value={line.unit} disabled={busy} onChange={event=>setLine(index,{unit:event.target.value})}/></label>
    <label className={label}>{c.price}<input data-po-line-field="price" inputMode="decimal" className={field} value={line.price} disabled={busy} onChange={event=>setLine(index,{price:event.target.value})}/></label>
    <label className={label}>{c.tax}<input data-po-line-field="tax" inputMode="decimal" className={field} placeholder="0" value={line.tax} disabled={busy} onChange={event=>setLine(index,{tax:event.target.value})}/></label>
   </div>
   <div className="grid gap-3 sm:grid-cols-2">
    <label className={label}>{c.budgetCode}<select data-po-line-field="budgetCode" className={field} value={line.budgetCodeId} disabled={busy} onChange={event=>setLine(index,{budgetCodeId:event.target.value})}><option value="">{c.noCode}</option>{refs.budgetCodes.map(code=><option key={code.id} value={code.id}>{code.code} · {code.title}</option>)}</select></label>
    <label className={label}>{c.link}<select data-po-line-field="link" className={field} value={line.link} disabled={busy} aria-invalid={staleLink(line.link,refs)||undefined} aria-describedby={staleLink(line.link,refs)?'po-stale-link-'+line.id:undefined} onChange={event=>setLine(index,{link:event.target.value})}><option value="">{c.noLink}</option>{staleLink(line.link,refs)&&<option value={line.link}>{c.staleLink}</option>}
     {refs.selectionOptions.map(option=><option key={option.id} value={'sel:'+option.id}>{c.selectionPrefix}: {option.itemName} · {option.name}</option>)}
     {refs.allowances.map(allowance=><option key={allowance.id} value={'alw:'+allowance.id}>{c.allowancePrefix}: {allowance.name}</option>)}</select></label>
    {staleLink(line.link,refs)&&<p id={'po-stale-link-'+line.id} data-po-stale-link className="rounded-xl bg-[#fff6e5] p-3 text-sm text-[#7a4b00] sm:col-span-2">{c.staleLinkHelp}</p>}
   </div>
   <p data-po-line-total className="text-sm font-semibold text-[#162543]">{c.lineTotal(fig?money(fig.total):'—')}{fig&&fig.tax>0?<span className="font-normal text-[#52627a]"> ({c.subtotal} {money(fig.subtotal)} + {c.taxes} {money(fig.tax)})</span>:null}</p>
  </li>;})}</ol>
  <p className="text-xs text-[#52627a]">{c.taxHelp}</p>
  <Button type="button" variant="secondary" className="min-h-11" disabled={busy||d.lines.length>=100} onClick={()=>onChange({...d,lines:[...d.lines,newLine(defaultTax)]})}>{c.addLine}</Button>
  <dl data-po-form-totals className="ml-auto grid max-w-sm grid-cols-2 gap-1 text-sm"><dt className="text-[#52627a]">{c.subtotal}</dt><dd className="text-right tabular-nums">{money(sum.subtotal)}</dd><dt className="text-[#52627a]">{c.taxes}</dt><dd className="text-right tabular-nums">{money(sum.tax)}</dd><dt className="font-bold">{c.orderTotal}</dt><dd data-po-form-total className="text-right font-bold tabular-nums">{money(sum.total)}</dd></dl>
  <label className={label}>{c.notes}<textarea data-po-field="notes" className={field+' min-h-24 py-2'} maxLength={2000} value={d.notes} disabled={busy} onChange={event=>onChange({...d,notes:event.target.value})}/></label>
  <div className="flex flex-wrap gap-2"><Button type="submit" className="min-h-11" disabled={busy}>{saving?c.saving:form.mode==='create'?c.create:c.saveEdit}</Button><Button type="button" variant="secondary" className="min-h-11" disabled={saving} onClick={onCancel}>{c.cancel}</Button></div>
 </form>;
}

function OrderDetail({accountId,c,en,order,history,error,onRetry,onBack,workId,canWrite,disabled,form,saving,today,refs,onEdit,onIssue,onCancel,onReceive,onPay,onReverse,onFormChange,onSubmit,onFormCancel}:{
 accountId:string;c:Copy;en:boolean;order:PurchaseOrder|null;history:PurchaseOrderHistoryEntry[];error:boolean;onRetry:()=>void;onBack:()=>void;workId:string;canWrite:boolean;disabled:boolean;form:Form|null;saving:boolean;today:string;refs:PurchaseOrderList['references'];
 onEdit:(o:PurchaseOrder)=>void;onIssue:(o:PurchaseOrder)=>void;onCancel:(o:PurchaseOrder)=>void;onReceive:(o:PurchaseOrder)=>void;onPay:(o:PurchaseOrder)=>void;onReverse:(o:PurchaseOrder,paymentId:string)=>void;onFormChange:(form:Form)=>void;onSubmit:(event:FormEvent)=>void;onFormCancel:()=>void}){
 const back=<Button type="button" variant="secondary" className="min-h-11" disabled={!!form&&saving} onClick={onBack}>{c.back}</Button>;
 if(!order)return <div className="space-y-3">{back}{error?<div role="alert" data-purchase-order-detail-error className="space-y-2 rounded-2xl border border-[#d7e1ea] p-4"><p className="text-sm">{c.loadError}</p><Button type="button" variant="secondary" onClick={onRetry}>{c.retry}</Button></div>:<p role="status" className="text-sm text-[#52627a]">{c.loading}</p>}</div>;
 const editable=canWrite&&(order.status==='draft'||order.status==='issued')&&order.receipts.length===0;
 const codeName=(id:string|null)=>{const code=id?refs.budgetCodes.find(item=>item.id===id):null;return code?code.code:null;};
 const linkName=(line:PurchaseOrder['lines'][number])=>{if(line.selectionOptionId){const o=refs.selectionOptions.find(item=>item.id===line.selectionOptionId);return o?`${c.selectionPrefix}: ${o.itemName} · ${o.name}`:c.selectionPrefix;}if(line.allowanceId){const a=refs.allowances.find(item=>item.id===line.allowanceId);return a?`${c.allowancePrefix}: ${a.name}`:c.allowancePrefix;}return null;};
 const lineDesc=(id:string)=>order.lines.find(line=>line.id===id)?.description??'';
 const inline=(mode:Form['mode'])=>!!form&&form.mode===mode&&form.order?.id===order.id;
 return <article data-purchase-order-detail={order.code} className="min-w-0 space-y-4">
  <div className="flex flex-wrap items-center justify-between gap-2">{back}<a data-po-print className="inline-flex min-h-11 items-center rounded-full border border-[#d7e1ea] px-4 text-sm font-semibold text-[#162543]" target="_blank" rel="noopener" href={'/api/pro/purchase-order-print?'+new URLSearchParams({workId,id:order.id,lang:en?'en':'es'})}>{c.print}</a></div>
  <header className="space-y-1 rounded-2xl border border-[#d7e1ea] bg-white p-4">
   <div className="flex flex-wrap items-center gap-2"><strong className="text-lg text-[#008bb5]">{order.code}</strong><StatusBadge status={order.status} c={c}/>{order.overdue&&<span data-po-overdue className="rounded-full bg-[#fff4f2] px-2.5 py-1 text-xs font-semibold text-[#a03c1f]">{c.pastDue}</span>}</div>
   <h4 className="break-words text-lg font-bold text-[#162543]">{order.title}</h4>
   <p className="break-words text-sm text-[#52627a]">{c.supplier}: <span className="font-semibold text-[#162543]">{order.supplierName}</span>{order.supplierContact?` · ${c.contactLabel}: ${order.supplierContact}`:''}</p>
   <p className="text-sm text-[#52627a]">{c.issued}: {day(order.issueDate,en)} · {c.expected}: {day(order.expectedDate,en)}</p>
   {order.notes&&<p className="whitespace-pre-wrap break-words text-sm text-[#162543]"><span className="font-semibold">{c.notesLabel}: </span>{order.notes}</p>}
  </header>
  <dl data-po-detail-totals className="grid grid-cols-2 gap-2 sm:grid-cols-5">
   <Stat label={c.subtotal} value={money(order.subtotalCents)} id="subtotal"/><Stat label={c.taxes} value={money(order.taxCents)} id="tax"/><Stat label={c.total} value={money(order.totalCents)} id="detail-total"/>
   <Stat label={c.paid} value={money(order.paidCents)} id="detail-paid"/><Stat label={c.balance} value={money(order.balanceCents)} id="detail-balance" wide/>
  </dl>
  {canWrite&&!form&&<div className="flex flex-wrap gap-2">
   {editable&&<Button type="button" variant="secondary" className="min-h-11" disabled={disabled} onClick={()=>onEdit(order)}>{c.edit}</Button>}
   {order.status==='draft'&&<Button type="button" className="min-h-11" disabled={disabled} onClick={()=>onIssue(order)}>{c.issue}</Button>}
   {(order.status==='issued'||order.status==='partial')&&<Button type="button" className="min-h-11" disabled={disabled} onClick={()=>onReceive(order)}>{c.receive}</Button>}
   {order.status!=='draft'&&order.status!=='cancelled'&&order.balanceCents>0&&<Button type="button" variant="secondary" className="min-h-11" disabled={disabled} onClick={()=>onPay(order)}>{c.pay}</Button>}
   {order.status!=='received'&&order.status!=='cancelled'&&<Button type="button" variant="secondary" className="min-h-11" disabled={disabled} onClick={()=>onCancel(order)}>{c.cancelOrder}</Button>}
  </div>}
  {inline('receive')&&form?.mode==='receive'&&<form data-po-receive-form onSubmit={onSubmit} noValidate className="space-y-3 rounded-2xl border border-[#d7e1ea] bg-white p-4">
   <p className="text-sm text-[#52627a]">{c.receiveHelp}</p>
   <ul className="space-y-2">{order.lines.map(line=>{const left=line.quantity-line.receivedQuantity;return <li key={line.id} className="grid gap-2 rounded-xl bg-[#f7f9fc] p-3 sm:grid-cols-[minmax(0,1fr)_10rem] sm:items-end">
    <p className="min-w-0 break-words text-sm"><strong>{line.description}</strong><br/><span className="text-[#52627a]">{c.ordered}: {qty(line.quantity,en)} {line.unit} · {c.received}: {qty(line.receivedQuantity,en)} · {c.remaining}: {qty(left,en)}</span></p>
    <label className={label}>{c.received}<input data-po-receive-line={line.position} aria-label={`${c.received}: ${line.description}`} inputMode="decimal" className={field} disabled={saving||left<=0} value={form.draft.quantities[line.id]??'0'} onChange={event=>onFormChange({...form,draft:{...form.draft,quantities:{...form.draft.quantities,[line.id]:event.target.value}}})}/></label>
   </li>;})}</ul>
   <div className="grid gap-3 sm:grid-cols-2">
    <label className={label}>{c.receivedOn}<input data-po-receive-field="date" type="date" className={field} min={order.issueDate} max={today} value={form.draft.receivedOn} disabled={saving} onChange={event=>onFormChange({...form,draft:{...form.draft,receivedOn:event.target.value}})}/></label>
    <label className={label}>{c.receiveNote}<input data-po-receive-field="note" className={field} maxLength={300} value={form.draft.note} disabled={saving} onChange={event=>onFormChange({...form,draft:{...form.draft,note:event.target.value}})}/></label>
   </div>
   <div className="flex flex-wrap gap-2"><Button type="submit" className="min-h-11" disabled={saving}>{saving?c.saving:c.saveReceipt}</Button><Button type="button" variant="secondary" className="min-h-11" disabled={saving} onClick={onFormCancel}>{c.cancel}</Button></div>
  </form>}
  {inline('pay')&&form?.mode==='pay'&&<form data-po-pay-form onSubmit={onSubmit} noValidate className="space-y-3 rounded-2xl border border-[#d7e1ea] bg-white p-4">
   <p className="text-sm text-[#52627a]">{c.payHelp}</p>
   <div className="grid gap-3 sm:grid-cols-2">
    <label className={label}>{c.amount}<input data-po-pay-field="amount" inputMode="decimal" className={field} value={form.draft.amount} disabled={saving} onChange={event=>onFormChange({...form,draft:{...form.draft,amount:event.target.value}})}/></label>
    <label className={label}>{c.paidOn}<input data-po-pay-field="date" type="date" className={field} min={order.issueDate} max={today} value={form.draft.paidOn} disabled={saving} onChange={event=>onFormChange({...form,draft:{...form.draft,paidOn:event.target.value}})}/></label>
    <label className={label}>{c.method}<select data-po-pay-field="method" className={field} value={form.draft.method} disabled={saving} onChange={event=>onFormChange({...form,draft:{...form.draft,method:event.target.value as Method}})}>{poMethods.map(method=><option key={method} value={method}>{c.methods[method]}</option>)}</select></label>
    <label className={label}>{c.reference}<input data-po-pay-field="reference" className={field} maxLength={160} value={form.draft.reference} disabled={saving} onChange={event=>onFormChange({...form,draft:{...form.draft,reference:event.target.value}})}/></label>
   </div>
   <label className={label}>{c.payNote}<input data-po-pay-field="note" className={field} maxLength={300} value={form.draft.note} disabled={saving} onChange={event=>onFormChange({...form,draft:{...form.draft,note:event.target.value}})}/></label>
   <div className="flex flex-wrap gap-2"><Button type="submit" className="min-h-11" disabled={saving}>{saving?c.saving:c.savePayment}</Button><Button type="button" variant="secondary" className="min-h-11" disabled={saving} onClick={onFormCancel}>{c.cancel}</Button></div>
  </form>}
  <section className="space-y-2"><h5 className="font-semibold text-[#162543]">{c.lines(order.lines.length)}</h5>
   <ul data-po-detail-lines className="space-y-2">{order.lines.map(line=><li key={line.id} data-po-detail-line={line.position} className="grid min-w-0 gap-2 rounded-xl border border-[#d7e1ea] bg-white p-3 sm:grid-cols-[minmax(0,1fr)_auto]">
    <div className="min-w-0 text-sm"><p className="break-words font-semibold text-[#162543]">{line.description}</p>
     <p className="text-[#52627a]">{qty(line.quantity,en)} {line.unit} × {money(line.unitCents)}{line.taxRate?` · ${c.taxShort} ${qty(line.taxRate,en)} %`:''}</p>
     {(codeName(line.budgetCodeId)||linkName(line))&&<p className="break-words text-xs text-[#52627a]">{[codeName(line.budgetCodeId),linkName(line)].filter(Boolean).join(' · ')}</p>}
     <p data-po-line-received className="text-xs text-[#52627a]">{c.received}: {qty(line.receivedQuantity,en)} / {qty(line.quantity,en)}</p></div>
    <p className="whitespace-nowrap text-right font-bold tabular-nums">{money(line.totalCents)}</p>
   </li>)}</ul>
  </section>
  {order.status!=='draft'&&order.status!=='cancelled'&&<PurchaseOrderTracking accountId={accountId} workId={workId} orderId={order.id} en={en} canWrite={canWrite} lines={order.lines.map(l=>({id:l.id,description:l.description}))}/>}
  <section data-po-receipts className="space-y-2"><h5 className="font-semibold text-[#162543]">{c.receipts}</h5>
   {order.receipts.length?<ul className="space-y-1 text-sm">{order.receipts.map(entry=><li key={entry.id+entry.lineId} className="break-words">{day(entry.receivedOn,en)} · {lineDesc(entry.lineId)}: {qty(entry.quantity,en)}{entry.note?` · ${entry.note}`:''}</li>)}</ul>:<p className="text-sm text-[#52627a]">{c.noReceipts}</p>}
  </section>
  <section data-po-payments className="space-y-2"><h5 className="font-semibold text-[#162543]">{c.payments}</h5>
   {order.payments.length?<ul className="space-y-2">{order.payments.map(payment=><li key={payment.id} data-po-payment={payment.kind} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#f7f9fc] p-3 text-sm">
    <span className="min-w-0 break-words">{payment.kind==='reverse'?`${c.reversal} · −`:''}{money(payment.amountCents)} · {day(payment.paidOn,en)} · {c.methods[payment.method]}{payment.reference?` · ${payment.reference}`:''}{payment.note?` · ${payment.note}`:''}{payment.reversed&&<span className="ml-1 font-semibold text-[#a03c1f]">· {c.reversed}</span>}</span>
    {canWrite&&payment.kind==='payment'&&!payment.reversed&&!form&&<Button type="button" variant="secondary" className="min-h-11" disabled={disabled} onClick={()=>onReverse(order,payment.id)}>{c.reverse}</Button>}
    {inline('reverse')&&form?.mode==='reverse'&&form.paymentId===payment.id&&<form data-po-reverse-form onSubmit={onSubmit} noValidate className="w-full space-y-2">
     <label className={label}>{c.reverseReason}<input data-po-reverse-field="note" className={field} maxLength={300} value={form.draft.note} disabled={saving} onChange={event=>onFormChange({...form,draft:{note:event.target.value}})}/></label>
     <div className="flex flex-wrap gap-2"><Button type="submit" className="min-h-11" disabled={saving}>{saving?c.saving:c.saveReverse}</Button><Button type="button" variant="secondary" className="min-h-11" disabled={saving} onClick={onFormCancel}>{c.cancel}</Button></div>
    </form>}
   </li>)}</ul>:<p className="text-sm text-[#52627a]">{c.noPayments}</p>}
  </section>
  <details data-po-history className="rounded-2xl border border-[#d7e1ea] p-3"><summary className="min-h-11 cursor-pointer py-2 font-semibold text-[#162543]">{c.history}</summary>
   {history.length?<ol className="mt-2 space-y-1 text-sm">{history.map(entry=><li key={entry.actionId} data-po-history-entry={entry.action} className="break-words"><span className="font-semibold">{c.actions[entry.action]}</span> · {stamp(entry.at,en)}{entry.action==='update'&&entry.before?` · ${c.total}: ${money(entry.before.totalCents)} → ${money(entry.after.totalCents)}`:''}</li>)}</ol>:<p className="mt-2 text-sm text-[#52627a]">{c.historyEmpty}</p>}
  </details>
 </article>;
}

/** Budget comparison per code (planned, committed, actual, variance). Also embedded in the job budget. */
export function PurchaseOrderBudgetTable({accountId,workId,refreshKey=0,format}:{accountId:string;workId:string;refreshKey?:string|number;format?:(cents:number)=>string}){
 const en=useLocale()==='en',c=copy(en),fmt=format??money;
 const [data,setData]=useState<PurchaseOrderBudget|null>(null),[failed,setFailed]=useState(false),[attempt,setAttempt]=useState(0);
 useEffect(()=>{let live=true;const timer=setTimeout(async()=>{
  try{const response=await fetch(api+'?'+new URLSearchParams({workId,view:'budget'}),{cache:'no-store',headers:{'X-Pro-Expected-Actor':accountId}});if(!response.ok)throw Error();
   const body=purchaseOrderBudgetSchema.parse(await response.json());if(live){setData(body);setFailed(false);}}catch{if(live)setFailed(true);}
 },0);return()=>{live=false;clearTimeout(timer);};},[accountId,workId,refreshKey,attempt]);
 const value=(cents:number|null,unknown=0)=>cents===null?(unknown>0?c.incomplete:'—'):fmt(cents);
 const signed=(cents:number|null,unknown=0)=>cents===null?(unknown>0?c.incomplete:'—'):cents<0?'−'+fmt(-cents):fmt(cents);
 let body:ReactNode;
 if(!data)body=failed?<div role="alert" className="space-y-2 text-sm"><p>{c.budgetError}</p><Button type="button" variant="secondary" onClick={()=>setAttempt(n=>n+1)}>{c.retry}</Button></div>:<p role="status" className="text-sm text-[#52627a]">{c.loading}</p>;
 else{
  const rows=data.rows.filter(row=>!row.archived||row.committedCents>0||row.actualCents>0),t=data.totals;
  body=<>
   <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
    <BudgetStat id="planned" label={c.planned} value={value(t.plannedCents)}/><BudgetStat id="committed" label={c.committed} value={fmt(t.committedCents)}/>
    <BudgetStat id="actual" label={c.actual} value={fmt(t.actualCents)}/><BudgetStat id="variance" label={c.variance} value={signed(t.varianceCents,t.unknownCount)} tone={t.varianceCents!==null&&t.varianceCents<0}/>
   </dl>
   {!rows.length?<div data-po-budget-empty className="space-y-2"><p className="text-sm text-[#52627a]">{c.noCodes}</p><Button type="button" variant="outline" className="min-h-11" data-po-budget-create onClick={()=>pushProParams({vistaTrabajo:'costs'})}>{c.openBudget}</Button></div>:<ul className="space-y-2">{rows.map(row=><li key={row.codeId} data-po-budget-row={row.code} className={`rounded-xl border border-[#d7e1ea] p-3 ${row.kind==='group'?'bg-[#f7f9fc]':'bg-white'} ${row.parentId?'sm:ml-6':''}`}>
    <p className="break-words text-sm font-semibold text-[#162543]">{row.kind==='group'?c.group+' · ':''}{row.code} · {row.title}</p>
    <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm sm:grid-cols-4">
     <div><dt className="text-xs text-[#52627a]">{c.planned}</dt><dd className="tabular-nums">{value(row.plannedCents)}</dd></div>
     <div><dt className="text-xs text-[#52627a]">{c.committed}</dt><dd data-po-budget-committed className="tabular-nums">{fmt(row.committedCents)}</dd></div>
     <div><dt className="text-xs text-[#52627a]">{c.actual}</dt><dd data-po-budget-actual className="tabular-nums">{fmt(row.actualCents)}</dd></div>
     <div><dt className="text-xs text-[#52627a]">{c.variance}</dt><dd data-po-budget-variance className={`tabular-nums font-semibold ${row.varianceCents!==null&&row.varianceCents<0?'text-[#a03c1f]':''}`}>{signed(row.varianceCents,row.unknownCount)}</dd></div>
    </dl>
   </li>)}</ul>}
   {(t.uncodedCommittedCents>0||t.unassignedActualCents>0)&&<p data-po-budget-uncoded className="text-sm text-[#52627a]">{c.uncoded}: {c.committed} {fmt(t.uncodedCommittedCents)} · {c.actual} {fmt(t.unassignedActualCents)}</p>}
  </>;
 }
 return <section data-po-budget className="min-w-0 space-y-3 rounded-2xl border border-[#d7e1ea] bg-white p-4"><h4 className="font-semibold text-[#162543]">{c.budgetTitle}</h4><p className="text-sm text-[#52627a]">{c.budgetIntro}</p>{body}</section>;
}
function BudgetStat({id,label:text,value,tone}:{id:string;label:string;value:string;tone?:boolean}){
 return <div data-po-budget-total={id} className="min-w-0 rounded-xl border border-[#d7e1ea] bg-[#f7f9fc] p-3"><dt className="text-xs font-semibold text-[#52627a]">{text}</dt><dd className={`mt-1 break-words font-bold tabular-nums ${tone?'text-[#a03c1f]':'text-[#162543]'}`}>{value}</dd></div>;
}
