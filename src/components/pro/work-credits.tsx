'use client';

import {WorkCreditLedger} from './work-credit-ledger';
import {useCallback,useEffect,useLayoutEffect,useRef,useState,type FormEvent,type ReactNode} from 'react';
import {useLocale} from 'next-intl';
import {useAuth} from '@/hooks/use-auth';
import {Button} from '@/components/ui/button';
import {proMoney} from '@/lib/pro/money';
import {centsToInput,colonesToCents} from '@/lib/pro/allowances';
import {
 creditDetailSchema,creditListSchema,creditMethods,creditMutationSchema,creditResultSchema,
 type Credit,type CreditDetail,type CreditHistoryEntry,type CreditKind,type CreditList,type CreditMethod,type CreditMutation,type CreditRefund,type CreditStatus,type CreditSummary,type CreditTab,type RefundStatus,
} from '@/lib/pro/credits-retainers';
import {useProChildGuard} from './use-pro-child-guard';

/**
 * Créditos y anticipos por proyecto (family 50). Internal, non-fiscal records: nothing here
 * charges the customer, moves money or issues a Hacienda document. A received retainer or an
 * overpayment always points to a payment of the project ledger (Costs & payments), and its
 * use on an invoice draft is the same allocation that invoice payments shows.
 */
const api='/api/pro/credits-retainers',field='mt-1 block min-h-11 w-full min-w-0 rounded-xl border border-[#d7e1ea] bg-white px-3 text-base font-normal',label='block min-w-0 text-sm font-semibold text-[#162543]';
type StateCallback={onStateChange?:(state:{dirty:boolean;busy:boolean})=>void};
type CreateDraft={title:string;amount:string;requestedOn:string;reason:string;note:string;entryId:string;receivedOn:string;method:CreditMethod;reference:string};
type EditDraft={title:string;amount:string;reason:string;note:string};
type ReceiveDraft={source:'existing'|'manual';entryId:string;amount:string;receivedOn:string;method:CreditMethod;reference:string};
type ApplyDraft={draftId:string;amount:string};
type RefundDraft={amount:string;refundedOn:string;method:CreditMethod;reference:string;note:string};
type ReasonPurpose='unapply'|'void_refund'|'cancel';
type Form=
 |{mode:'create';kind:CreditKind;draft:CreateDraft;initial:CreateDraft}
 |{mode:'edit';credit:Credit;draft:EditDraft;initial:EditDraft}
 |{mode:'receive';credit:Credit;draft:ReceiveDraft;initial:ReceiveDraft}
 |{mode:'apply';credit:Credit;draft:ApplyDraft;initial:ApplyDraft}
 |{mode:'refund';credit:Credit;draft:RefundDraft;initial:RefundDraft}
 |{mode:'reason';credit:Credit;purpose:ReasonPurpose;targetId:string|null;draft:{reason:string};initial:{reason:string}};
const money=(cents:number)=>proMoney(cents/100);
const day=(value:string|null,en:boolean)=>value?new Intl.DateTimeFormat(en?'en-US':'es-CR',{dateStyle:'medium',timeZone:'UTC'}).format(new Date(value+'T12:00:00Z')):'—';
const created=(value:string,en:boolean)=>new Intl.DateTimeFormat(en?'en-US':'es-CR',{dateStyle:'medium',timeZone:'America/Costa_Rica'}).format(new Date(value));
const stamp=(value:string,en:boolean)=>new Intl.DateTimeFormat(en?'en-US':'es-CR',{dateStyle:'medium',timeStyle:'short',timeZone:'America/Costa_Rica'}).format(new Date(value));
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const nullable=(value:string)=>value.trim()||null;

function copy(en:boolean){
 return en?{
  title:'Credits & retainers',intro:'Keep track of retainers you ask for, credit notes you grant, payments above what was billed and the refunds you make, and use them on this project’s invoice drafts.',
  nonFiscal:'Internal record only. It does not charge the customer, move money or issue an electronic invoice or credit note with the Costa Rican tax authority (Hacienda).',
  tabs:{retainer:'Retainers',credit_note:'Credit notes',overpayment:'Overpayments',refund:'Refunds'} as Record<CreditTab,string>,
  add:{retainer:'New retainer',credit_note:'New credit note',overpayment:'Record overpayment'} as Record<CreditKind,string>,
  available:'Available',applied:'Applied',total:'Total',refunded:'Refunded',balance:'Balance',count:(n:number)=>`${n} ${n===1?'record':'records'}`,
  status:'Status',allStatuses:'All',
  statuses:{requested:'Requested',available:'Available: apply it to an invoice',partial:'Partly used',used:'Used',reversed:'Payment reversed',cancelled:'Cancelled',recorded:'Recorded',voided:'Voided'} as Record<CreditStatus|RefundStatus,string>,
  columns:{title:'Title',code:'Code',status:'Status',created:'Created',total:'Total',balance:'Balance',recipient:'Recipient',available:'Available',source:'From',date:'Refund date'},
  open:'Open',prev:'Previous',next:'Next',page:(n:number)=>`Page ${n}`,
  empty:{retainer:'There are no retainers for this project yet.',credit_note:'There are no credit notes for this project yet.',overpayment:'There are no overpayments recorded for this project.',refund:'There are no refunds recorded for this project.'} as Record<CreditTab,string>,
  emptyHelp:{retainer:'Ask for a retainer before starting and mark it received when the customer pays.',credit_note:'Use a credit note for an agreed discount or an amount you owe the customer.',overpayment:'When the project’s payments are above what was billed, you can record the difference here.',refund:'Record a refund from a retainer, credit note or overpayment.'} as Record<CreditTab,string>,
  emptyFiltered:'Nothing matches this status.',
  loading:'Loading credits…',loadError:'Could not load the credits.',retry:'Retry',reload:'Reload',back:'Back to the list',cancel:'Cancel',saving:'Saving…',
  detectionTitle:'Payments above what was billed',detected:(v:string)=>`The project’s payments are ${v} above what was billed and what retainers already hold.`,
  noExcess:'No overpayment detected: the project’s payments do not exceed what was billed plus the retainers that hold money.',
  detectionHelp:(paid:string,billed:string,held:string)=>`Paid ${paid} · billed in drafts ${billed} · held by retainers ${held}.`,
  readOnly:{cancelled:'This job is cancelled. Credits can be viewed and reverted, but not created or applied.',noClient:'Assign a customer to this job to use credits.',archivedClient:'The customer is archived. Restore it to create or apply credits.'},
  creditTitle:'Title',titlePlaceholder:{retainer:'E.g. Retainer to start',credit_note:'E.g. Discount for delay',overpayment:'E.g. Second payment above invoice'} as Record<CreditKind,string>,
  amount:'Amount (₡)',requestedOn:'Requested on',reason:'Reason',reasonHelp:'Explain why the customer receives this credit.',note:'Note (optional)',
  payment:'Payment of the project',choosePayment:'Choose a payment',paymentOption:(amount:string,free:string,label:string)=>`${amount} · unallocated ${free}${label?` · ${label}`:''}`,
  receivedOn:'Payment date',method:'Method',reference:'Reference (optional)',
  methods:{transfer:'Bank transfer',sinpe:'SINPE Móvil',cash:'Cash',card:'Card',other:'Other'} as Record<CreditMethod,string>,
  paymentHasDetails:(date:string,method:string)=>`Date and method come from the payment: ${date} · ${method}.`,
  noPayments:'This project has no payment with unallocated money. Record the payment in Costs & payments first.',
  receive:'Mark as received',receiveTitle:'Mark the retainer as received',sourceExisting:'Link a payment already recorded',sourceManual:'Record the payment now',
  manualHelp:'The payment is recorded once in the project’s ledger (Costs & payments) with this date, method and reference. No money is moved.',
  saveReceive:'Save receipt',apply:'Apply to invoice draft',applyTitle:'Apply to an invoice draft',draft:'Invoice draft',chooseDraft:'Choose a draft',
  draftOption:(title:string,balance:string)=>`${title} · balance ${balance}`,noDrafts:'There is no invoice draft of this project and customer with a balance. Prepare one in Invoices first.',
  applyHelp:'Only reduces the draft’s internal balance. It is not an electronic invoice or credit note.',saveApply:'Apply',
  refund:'Record refund',refundTitle:'Record a refund',refundedOn:'Refund date',refundHelp:'Only records money you already returned outside ContrataCR. No money is moved.',saveRefund:'Save refund',
  edit:'Edit',saveEdit:'Save changes',create:'Save',cancelCredit:'Cancel credit',revert:'Revert',voidRefund:'Void',
  reasonTitle:{unapply:'Why are you reverting this application?',void_refund:'Why are you voiding this refund?',cancel:'Why are you cancelling it? (optional)'} as Record<ReasonPurpose,string>,
  saveReason:{unapply:'Revert application',void_refund:'Void refund',cancel:'Cancel credit'} as Record<ReasonPurpose,string>,
  requested:'Requested',received:'Received',recipient:'Recipient',reasonLabel:'Reason',noteLabel:'Note',ledgerPayment:'Ledger payment',
  applications:'Applications',noApplications:'Not applied to any draft yet.',viaInvoice:'Shown in the draft’s payments',
  appStates:{active:'Active',reverted:'Reverted',voided_in_invoice:'Removed in the draft’s payments',source_reversed:'Payment reversed in the ledger'} as Record<string,string>,
  refunds:'Refunds',noRefunds:'No refunds recorded.',history:'Change history',historyEmpty:'No changes yet.',
  actions:{create:'Created',receive:'Received',update:'Edited',apply:'Applied',unapply:'Application reverted',refund:'Refund recorded',void_refund:'Refund voided',cancel:'Cancelled'} as Record<CreditHistoryEntry['action'],string>,
  boundNote:'Part of the payment was already used directly in invoice payments, so less is available.',reversedNote:'The payment behind this credit was reversed in the ledger. It is no longer available.',
  invalid:'Complete the title and an amount greater than zero.',invalidReason:'Write the reason.',invalidDate:'Choose a valid date that is not in the future.',
  invalidReceive:'Choose the payment (or enter date and method) and an amount that does not exceed what is unallocated or the job balance.',
  invalidApply:'Choose a draft and an amount that does not exceed the available credit or the draft balance.',invalidRefund:'Enter an amount that does not exceed what is available and a date that is not in the future.',
  invalidOverpayment:'Choose a payment and an amount that does not exceed the detected overpayment or the payment’s unallocated money.',
  conflict:'This credit changed in another window. Reload before trying again.',uncertain:'We could not confirm whether it was saved. Retry the same operation; it will not be applied twice.',retrySame:'Retry the same operation',
  failed:'Could not save. Review the information and try again.',leave:'Save or cancel the credit you are editing before leaving.',
  notices:{create:'Credit saved.',receive:'Retainer marked as received.',update:'Changes saved.',apply:'Applied to the invoice draft.',unapply:'Application reverted.',refund:'Refund recorded. No money was moved.',void_refund:'Refund voided.',cancel:'Credit cancelled.'} as Record<CreditHistoryEntry['action'],string>,
 }:{
  title:'Créditos y anticipos',intro:'Lleve el control de los anticipos que solicita, las notas de crédito que otorga, los pagos que superan lo facturado y los reembolsos que hace, y úselos en los borradores de factura de este proyecto.',
  nonFiscal:'Es solo un registro interno. No cobra al cliente, no mueve dinero y no emite factura ni nota de crédito electrónica ante Hacienda.',
  tabs:{retainer:'Anticipos',credit_note:'Notas de crédito',overpayment:'Sobrepagos',refund:'Reembolsos'} as Record<CreditTab,string>,
  add:{retainer:'Nuevo anticipo',credit_note:'Nueva nota de crédito',overpayment:'Registrar sobrepago'} as Record<CreditKind,string>,
  available:'Disponible',applied:'Aplicado',total:'Total',refunded:'Reembolsado',balance:'Saldo',count:(n:number)=>`${n} ${n===1?'registro':'registros'}`,
  status:'Estado',allStatuses:'Todos',
  statuses:{requested:'Solicitado',available:'Disponible: aplíquela a una factura',partial:'Usado en parte',used:'Usado',reversed:'Pago reversado',cancelled:'Cancelado',recorded:'Registrado',voided:'Anulado'} as Record<CreditStatus|RefundStatus,string>,
  columns:{title:'Título',code:'Código',status:'Estado',created:'Creado',total:'Total',balance:'Saldo',recipient:'Destinatario',available:'Disponible',source:'Origen',date:'Fecha del reembolso'},
  open:'Abrir',prev:'Anterior',next:'Siguiente',page:(n:number)=>`Página ${n}`,
  empty:{retainer:'Todavía no hay anticipos en este proyecto.',credit_note:'Todavía no hay notas de crédito en este proyecto.',overpayment:'No hay sobrepagos registrados en este proyecto.',refund:'No hay reembolsos registrados en este proyecto.'} as Record<CreditTab,string>,
  emptyHelp:{retainer:'Solicite un anticipo antes de empezar y márquelo como recibido cuando el cliente pague.',credit_note:'Use una nota de crédito para un descuento acordado o un monto que usted le debe al cliente.',overpayment:'Cuando los abonos del proyecto superan lo facturado, puede registrar la diferencia aquí.',refund:'Registre un reembolso desde un anticipo, una nota de crédito o un sobrepago.'} as Record<CreditTab,string>,
  emptyFiltered:'Nada coincide con este estado.',
  loading:'Cargando créditos…',loadError:'No se pudieron cargar los créditos.',retry:'Reintentar',reload:'Recargar',back:'Volver a la lista',cancel:'Cancelar',saving:'Guardando…',
  detectionTitle:'Abonos por encima de lo facturado',detected:(v:string)=>`Los abonos del proyecto superan en ${v} lo facturado y lo que ya reservan los anticipos.`,
  noExcess:'No se detecta sobrepago: los abonos del proyecto no superan lo facturado más lo que reservan los anticipos.',
  detectionHelp:(paid:string,billed:string,held:string)=>`Abonado ${paid} · facturado en borradores ${billed} · reservado por anticipos ${held}.`,
  readOnly:{cancelled:'Este trabajo está cancelado. Los créditos se pueden consultar y revertir, pero no crear ni aplicar.',noClient:'Asigne un cliente a este trabajo para usar créditos.',archivedClient:'El cliente está archivado. Restáurelo para crear o aplicar créditos.'},
  creditTitle:'Título',titlePlaceholder:{retainer:'Ej.: Anticipo para iniciar',credit_note:'Ej.: Descuento por atraso',overpayment:'Ej.: Segundo pago por encima de la factura'} as Record<CreditKind,string>,
  amount:'Monto (₡)',requestedOn:'Fecha de solicitud',reason:'Motivo',reasonHelp:'Explique por qué el cliente recibe este crédito.',note:'Nota (opcional)',
  payment:'Abono del proyecto',choosePayment:'Elija un abono',paymentOption:(amount:string,free:string,label:string)=>`${amount} · sin asignar ${free}${label?` · ${label}`:''}`,
  receivedOn:'Fecha del pago',method:'Medio',reference:'Referencia (opcional)',
  methods:{transfer:'Transferencia',sinpe:'SINPE Móvil',cash:'Efectivo',card:'Tarjeta',other:'Otro'} as Record<CreditMethod,string>,
  paymentHasDetails:(date:string,method:string)=>`La fecha y el medio vienen del abono: ${date} · ${method}.`,
  noPayments:'Este proyecto no tiene abonos con dinero sin asignar. Registre primero el abono en Costos y pagos.',
  receive:'Marcar como recibido',receiveTitle:'Marcar el anticipo como recibido',sourceExisting:'Vincular un abono ya registrado',sourceManual:'Registrar el pago ahora',
  manualHelp:'El pago se registra una sola vez en el libro de abonos del proyecto (Costos y pagos) con esta fecha, medio y referencia. No se mueve dinero.',
  saveReceive:'Guardar recepción',apply:'Aplicar a borrador de factura',applyTitle:'Aplicar a un borrador de factura',draft:'Borrador de factura',chooseDraft:'Elija un borrador',
  draftOption:(title:string,balance:string)=>`${title} · saldo ${balance}`,noDrafts:'No hay borradores de factura de este proyecto y cliente con saldo. Prepare uno primero en Facturas.',
  applyHelp:'Solo rebaja el saldo interno del borrador. No es una factura ni una nota de crédito electrónica.',saveApply:'Aplicar',
  refund:'Registrar reembolso',refundTitle:'Registrar un reembolso',refundedOn:'Fecha del reembolso',refundHelp:'Solo registra dinero que usted ya devolvió fuera de ContrataCR. No se mueve dinero.',saveRefund:'Guardar reembolso',
  edit:'Editar',saveEdit:'Guardar cambios',create:'Guardar',cancelCredit:'Cancelar crédito',revert:'Revertir',voidRefund:'Anular',
  reasonTitle:{unapply:'¿Por qué revierte esta aplicación?',void_refund:'¿Por qué anula este reembolso?',cancel:'¿Por qué lo cancela? (opcional)'} as Record<ReasonPurpose,string>,
  saveReason:{unapply:'Revertir aplicación',void_refund:'Anular reembolso',cancel:'Cancelar crédito'} as Record<ReasonPurpose,string>,
  requested:'Solicitado',received:'Recibido',recipient:'Destinatario',reasonLabel:'Motivo',noteLabel:'Nota',ledgerPayment:'Abono del libro',
  applications:'Aplicaciones',noApplications:'Todavía no se aplicó a ningún borrador.',viaInvoice:'Se ve en los pagos del borrador',
  appStates:{active:'Activa',reverted:'Revertida',voided_in_invoice:'Quitada en los pagos del borrador',source_reversed:'Abono reversado en el libro'} as Record<string,string>,
  refunds:'Reembolsos',noRefunds:'No hay reembolsos registrados.',history:'Historial de cambios',historyEmpty:'Todavía no hay cambios.',
  actions:{create:'Creado',receive:'Recibido',update:'Editado',apply:'Aplicado',unapply:'Aplicación revertida',refund:'Reembolso registrado',void_refund:'Reembolso anulado',cancel:'Cancelado'} as Record<CreditHistoryEntry['action'],string>,
  boundNote:'Parte del abono ya se usó directamente en los pagos de un borrador, así que hay menos disponible.',reversedNote:'El abono de este crédito se reversó en el libro. Ya no está disponible.',
  invalid:'Complete el título y un monto mayor que cero.',invalidReason:'Escriba el motivo.',invalidDate:'Elija una fecha válida que no sea futura.',
  invalidReceive:'Elija el abono (o indique fecha y medio) y un monto que no supere lo sin asignar ni el saldo del trabajo.',
  invalidApply:'Elija un borrador y un monto que no supere el crédito disponible ni el saldo del borrador.',invalidRefund:'Indique un monto que no supere lo disponible y una fecha que no sea futura.',
  invalidOverpayment:'Elija un abono y un monto que no supere el sobrepago detectado ni lo sin asignar del abono.',
  conflict:'Este crédito cambió en otra ventana. Recargue antes de volver a intentarlo.',uncertain:'No pudimos confirmar si se guardó. Reintente la misma operación; no se aplicará dos veces.',retrySame:'Reintentar la misma operación',
  failed:'No se pudo guardar. Revise los datos y vuelva a intentarlo.',leave:'Guarde o cancele el crédito que está editando antes de salir.',
  notices:{create:'Crédito guardado.',receive:'Anticipo marcado como recibido.',update:'Cambios guardados.',apply:'Aplicado al borrador de factura.',unapply:'Aplicación revertida.',refund:'Reembolso registrado. No se movió dinero.',void_refund:'Reembolso anulado.',cancel:'Crédito cancelado.'} as Record<CreditHistoryEntry['action'],string>,
 };
}
type Copy=ReturnType<typeof copy>;
const historyAction=(input:CreditMutation):CreditHistoryEntry['action']=>input.action.startsWith('create_')?'create':input.action==='receive_retainer'?'receive':input.action as CreditHistoryEntry['action'];

export function WorkCredits({workId,onStateChange}:{workId:string}&StateCallback){
 const {user,loading}=useAuth();if(loading||!user)return null;
 return <CreditsSession key={user.id+':'+workId} accountId={user.id} workId={workId} onStateChange={onStateChange}/>;
}

function CreditsSession({accountId,workId,onStateChange}:{accountId:string;workId:string}&StateCallback){
 const en=useLocale()==='en',c=copy(en);
 const [ledgerKey,setLedgerKey]=useState(0);
 const [list,setList]=useState<CreditList|null>(null),[listStatus,setListStatus]=useState('all'),[loading,setLoading]=useState(true),[loadError,setLoadError]=useState(false);
 const [tab,setTab]=useState<CreditTab>('retainer'),[status,setStatus]=useState('all'),[cursors,setCursors]=useState<Array<number|null>>([null]);
 const [openId,setOpenId]=useState<string|null>(null),[detail,setDetail]=useState<Extract<CreditDetail,{history:unknown}>|null>(null),[detailError,setDetailError]=useState(false);
 const [form,setForm]=useState<Form|null>(null),[saving,setSaving]=useState(false),[uncertain,setUncertain]=useState(false),[conflict,setConflict]=useState(false);
 const [error,setError]=useState(''),[notice,setNotice]=useState('');
 const active=useRef(true),sequence=useRef(0),detailSequence=useRef(0),lock=useRef(false),pending=useRef<{input:CreditMutation;invalid:string}|null>(null);
 const dirty=!!form&&!same(form.draft,form.initial),busy=saving||uncertain;
 useProChildGuard(!onStateChange&&(dirty||busy),useCallback(()=>setError(c.leave),[c.leave]));
 useLayoutEffect(()=>{onStateChange?.({dirty,busy});return()=>onStateChange?.({dirty:false,busy:false});},[dirty,busy,onStateChange]);
 const cursor=cursors.at(-1)??null;
 const load=useCallback(async()=>{
  const id=++sequence.current;setLoading(true);setLoadError(false);
  try{
   const query:Record<string,string>={workId,tab};if(status!=='all')query.status=status;if(cursor!==null)query.after=String(cursor);
   const response=await fetch(api+'?'+new URLSearchParams(query),{cache:'no-store',headers:{'X-Pro-Expected-Actor':accountId}});if(!response.ok)throw Error();
   const body=creditListSchema.parse(await response.json());if(body.workId!==workId||body.tab!==tab)throw Error();
   if(active.current&&id===sequence.current){setList(body);setListStatus(status);setConflict(false);}
   return true;
  }catch{if(active.current&&id===sequence.current)setLoadError(true);return false;}
  finally{if(active.current&&id===sequence.current)setLoading(false);}
 },[accountId,workId,tab,status,cursor]);
 const loadDetail=useCallback(async(creditId:string)=>{
  const id=++detailSequence.current;setDetailError(false);
  try{
   const response=await fetch(api+'?'+new URLSearchParams({workId,view:'detail',id:creditId}),{cache:'no-store',headers:{'X-Pro-Expected-Actor':accountId}});if(!response.ok)throw Error();
   const body=creditDetailSchema.parse(await response.json());if(!body.credit||!('history' in body)||body.credit.id!==creditId)throw Error();
   if(active.current&&id===detailSequence.current)setDetail(body);
  }catch{if(active.current&&id===detailSequence.current)setDetailError(true);}
 },[accountId,workId]);
 const invalidate=useCallback(()=>{sequence.current++;},[]),invalidateDetail=useCallback(()=>{detailSequence.current++;},[]);
 useEffect(()=>{active.current=true;const timer=setTimeout(()=>void load(),0);return()=>{active.current=false;invalidate();clearTimeout(timer);};},[load,invalidate]);
 useEffect(()=>{if(!openId)return;const timer=setTimeout(()=>void loadDetail(openId),0);return()=>{invalidateDetail();clearTimeout(timer);};},[openId,loadDetail,invalidateDetail]);

 async function send(input:CreditMutation,invalid:string){
  if(lock.current)return false;lock.current=true;pending.current={input,invalid};setSaving(true);setError('');setNotice('');
  try{
   const response=await fetch(api,{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json','X-Pro-Expected-Actor':accountId},body:JSON.stringify(input)});
   if(response.status===409){pending.current=null;setUncertain(false);setConflict(true);setError(c.conflict);return false;}
   if(response.status>=500||response.status===429){setUncertain(true);setError(c.uncertain);return false;}
   if(!response.ok){pending.current=null;setUncertain(false);setError(invalid);return false;}
   const body=creditResultSchema.parse(await response.json());if(body.credit.id!==input.id||body.credit.workId!==workId)throw Error();
   pending.current=null;setUncertain(false);
   if(active.current){setLedgerKey(k=>k+1);setForm(null);setNotice(c.notices[historyAction(input)]);setOpenId(body.credit.id);if(input.action.startsWith('create_'))setCursors([null]);}
   lock.current=false;await Promise.all([load(),loadDetail(body.credit.id)]);return true;
  }catch{setUncertain(true);setError(c.uncertain);return false;}
  finally{lock.current=false;if(active.current)setSaving(false);}
 }
 function submit(event:FormEvent){
  event.preventDefault();if(!form||busy||conflict||!list)return;
  const base={actionId:crypto.randomUUID(),workId};
  const fail=(message:string)=>{setError(message);return;};
  if(form.mode==='create'){
   const d=form.draft,amount=colonesToCents(d.amount);
   const input=form.kind==='retainer'?{action:'create_retainer',...base,id:crypto.randomUUID(),title:d.title,amountCents:amount,requestedOn:d.requestedOn,note:nullable(d.note)}
    :form.kind==='credit_note'?{action:'create_credit_note',...base,id:crypto.randomUUID(),title:d.title,amountCents:amount,reason:d.reason,note:nullable(d.note)}
    :{action:'create_overpayment',...base,id:crypto.randomUUID(),title:d.title,amountCents:amount,entryId:d.entryId,...paymentDetails(list,d.entryId,d),note:nullable(d.note)};
   const parsed=creditMutationSchema.safeParse(input),invalid=form.kind==='overpayment'?c.invalidOverpayment:form.kind==='credit_note'&&!d.reason.trim()?c.invalidReason:c.invalid;
   if(!parsed.success||amount===null)return fail(invalid);
   if(form.kind==='overpayment'){const p=list.references.payments.find(item=>item.entryId===d.entryId);if(!p||amount>Math.min(list.detection.excessCents,p.freeCents))return fail(invalid);}
   void send(parsed.data,invalid);return;
  }
  const credit=form.credit,target={...base,id:credit.id,revision:credit.revision};
  if(form.mode==='edit'){
   const d=form.draft,amount=colonesToCents(d.amount);
   const parsed=creditMutationSchema.safeParse({action:'update',...target,title:d.title,amountCents:amount,reason:credit.kind==='credit_note'?d.reason:null,note:nullable(d.note)});
   if(!parsed.success||amount===null)return fail(c.invalid);
   void send(parsed.data,c.invalid);return;
  }
  if(form.mode==='receive'){
   const d=form.draft,amount=colonesToCents(d.amount);
   const input=d.source==='existing'?{action:'receive_retainer',...target,source:'existing',entryId:d.entryId,amountCents:amount,...paymentDetails(list,d.entryId,d)}
    :{action:'receive_retainer',...target,source:'manual',entryId:null,amountCents:amount,receivedOn:d.receivedOn,method:d.method,reference:nullable(d.reference)};
   const parsed=creditMutationSchema.safeParse(input);
   if(!parsed.success||amount===null||d.source==='manual'&&d.receivedOn>list.today)return fail(c.invalidReceive);
   if(d.source==='existing'){const p=list.references.payments.find(item=>item.entryId===d.entryId);if(!p||amount>p.freeCents)return fail(c.invalidReceive);}
   void send(parsed.data,c.invalidReceive);return;
  }
  if(form.mode==='apply'){
   const amount=colonesToCents(form.draft.amount),draft=list.references.drafts.find(item=>item.id===form.draft.draftId);
   const parsed=creditMutationSchema.safeParse({action:'apply',...target,draftId:form.draft.draftId,amountCents:amount});
   if(!parsed.success||amount===null||!draft||amount>Math.min(credit.availableCents,draft.balanceCents))return fail(c.invalidApply);
   void send(parsed.data,c.invalidApply);return;
  }
  if(form.mode==='refund'){
   const d=form.draft,amount=colonesToCents(d.amount);
   const parsed=creditMutationSchema.safeParse({action:'refund',...target,amountCents:amount,refundedOn:d.refundedOn,method:d.method,reference:nullable(d.reference),note:nullable(d.note)});
   if(!parsed.success||amount===null||amount>credit.availableCents||d.refundedOn>list.today)return fail(c.invalidRefund);
   void send(parsed.data,c.invalidRefund);return;
  }
  const reason=form.draft.reason;
  const input=form.purpose==='unapply'?{action:'unapply',...target,applicationId:form.targetId,reason}:form.purpose==='void_refund'?{action:'void_refund',...target,refundId:form.targetId,reason}:{action:'cancel',...target,reason:nullable(reason)};
  const parsed=creditMutationSchema.safeParse(input);if(!parsed.success)return fail(c.invalidReason);
  void send(parsed.data,c.failed);
 }
 function open(next:Form){if(busy)return;setForm(next);setError('');setNotice('');}
 function cancelForm(){setForm(null);setError('');setConflict(false);}
 function retrySame(){if(pending.current)void send(pending.current.input,pending.current.invalid);}
 function chooseTab(next:CreditTab){if(busy||form)return;setTab(next);setStatus('all');setCursors([null]);setOpenId(null);setDetail(null);setNotice('');setError('');}

 if(loading&&!list)return <p role="status" className="text-sm text-[#52627a]">{c.loading}</p>;
 if(!list)return <div role="alert" data-credits-load-error className="space-y-2 rounded-2xl border border-[#d7e1ea] p-4"><p className="text-sm">{c.loadError}</p><Button className="min-h-11" type="button" variant="secondary" disabled={loading} onClick={()=>void load()}>{c.retry}</Button></div>;
 const t=list.totals,canWrite=list.canWrite,credit=openId&&detail?.credit.id===openId?detail.credit:null;
 const blankCreate=(kind:CreditKind):CreateDraft=>{const free=list.references.payments.find(p=>p.freeCents>0&&!p.creditCode);
  return {title:'',amount:kind==='overpayment'&&free?centsToInput(Math.min(list.detection.excessCents,free.freeCents)):'',requestedOn:list.today,reason:'',note:'',entryId:kind==='overpayment'&&free?free.entryId:'',receivedOn:list.today,method:'transfer',reference:''};};
 const messages=<>
  {notice&&<p role="status" className="rounded-xl bg-[#eef8f4] p-3 text-sm text-[#18573a]">{notice}</p>}
  {error&&<div role="alert" data-credits-error className="space-y-2 rounded-xl bg-[#fff4f2] p-3 text-sm text-[#8a2a1b]"><p>{error}</p>
   {uncertain&&<Button className="min-h-11" type="button" variant="secondary" disabled={saving} onClick={retrySame}>{c.retrySame}</Button>}
   {conflict&&<Button className="min-h-11" type="button" variant="secondary" disabled={loading||saving} onClick={()=>{setForm(null);setError('');setConflict(false);void load();if(openId)void loadDetail(openId);}}>{c.reload}</Button>}</div>}
 </>;
 return <section data-credits className="min-w-0 space-y-5">
  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
   <div className="min-w-0"><h3 className="text-lg font-bold text-[#162543]">{c.title}</h3><p className="mt-1 text-sm text-[#52627a]">{c.intro}</p></div>
   {tab!=='refund'&&tab!=='overpayment'&&!form&&!openId&&canWrite&&<Button type="button" data-credits-add={tab} className="min-h-11 shrink-0" disabled={busy||conflict} onClick={()=>{const draft=blankCreate(tab);open({mode:'create',kind:tab,draft,initial:draft});}}>{c.add[tab]}</Button>}
  </div>
  <p data-credits-nonfiscal className="rounded-xl border border-[#f1d9a6] bg-[#fff6e5] p-3 text-sm text-[#7a4b00]">{c.nonFiscal}</p>
  {/* Segmented view switch (not ARIA tabs: there is no tabpanel/arrow-key model). */}
  <div role="group" aria-label={c.title} className="grid grid-cols-2 gap-1 rounded-xl bg-[#e9eff5] p-1 sm:inline-grid sm:grid-cols-4">
   {(['retainer','credit_note','overpayment','refund'] as const).map(value=><button key={value} type="button" aria-pressed={tab===value} data-credits-tab={value} disabled={busy||!!form} onClick={()=>chooseTab(value)} className={`min-h-11 min-w-0 rounded-lg px-3 text-sm font-semibold disabled:opacity-50 ${tab===value?'bg-white text-[#008bb5] shadow-sm':'text-[#52627a]'}`}>{c.tabs[value]} <span className="tabular-nums text-xs">({list.tabCounts[value]})</span></button>)}
  </div>
  {!canWrite&&list.readOnlyReason&&<p data-credits-readonly className="rounded-xl bg-[#fff6e5] p-3 text-sm text-[#7a4b00]">{c.readOnly[list.readOnlyReason]}</p>}
  {messages}
  {form?.mode==='create'?<CreateForm c={c} en={en} form={form} list={list} busy={busy||conflict} saving={saving} onChange={draft=>setForm({...form,draft})} onSubmit={submit} onCancel={cancelForm}/>:
   openId?<CreditDetailView c={c} en={en} credit={credit} history={credit&&detail?detail.history:[]} error={detailError} list={list} form={form} saving={saving} disabled={busy||conflict||!!form}
    onRetry={()=>void loadDetail(openId)} onBack={()=>{setOpenId(null);setDetail(null);setNotice('');setError('');setForm(null);}} onOpen={open} onFormChange={next=>setForm(next)} onSubmit={submit} onFormCancel={cancelForm}/>:<>
   {list.tab==='refund'?<dl data-credits-totals className="grid grid-cols-2 gap-2 sm:grid-cols-3"><Stat id="refunded" label={c.refunded} value={money(t.refundedCents)}/><Stat id="count" label={c.count(t.count)} value={String(t.count)}/></dl>:
    <dl data-credits-totals className="grid grid-cols-2 gap-2 sm:grid-cols-3"><Stat id="available" label={c.available} value={money(t.availableCents)}/><Stat id="applied" label={c.applied} value={money(t.appliedCents)}/><Stat id="total" label={c.total} value={money(t.totalCents)} wide/></dl>}
   {list.tab==='overpayment'&&<div data-credits-detection className="space-y-2 rounded-2xl border border-[#d7e1ea] bg-white p-4">
    <h4 className="font-semibold text-[#162543]">{c.detectionTitle}</h4>
    <p className="text-sm text-[#162543]">{list.detection.excessCents>0?c.detected(money(list.detection.excessCents)):c.noExcess}</p>
    <p className="text-xs text-[#52627a]">{c.detectionHelp(money(list.detection.paidCents),money(list.detection.billedCents),money(list.detection.reservedCents))}</p>
    {canWrite&&list.detection.excessCents>0&&<Button type="button" data-credits-add="overpayment" className="min-h-11" disabled={busy||conflict} onClick={()=>{const draft=blankCreate('overpayment');open({mode:'create',kind:'overpayment',draft,initial:draft});}}>{c.add.overpayment}</Button>}
   </div>}
   <label className={label+' max-w-xs'}>{c.status}<select data-credits-filter="status" className={field} value={status} disabled={busy} onChange={event=>{setStatus(event.target.value);setCursors([null]);}}>
    <option value="all">{c.allStatuses}</option>
    {(list.tab==='refund'?['recorded','voided']:list.tab==='retainer'?['requested','available','partial','used','reversed','cancelled']:['available','partial','used','reversed','cancelled']).map(value=><option key={value} value={value}>{c.statuses[value as CreditStatus]}</option>)}
   </select></label>
   {loadError&&<div role="alert" className="space-y-2 text-sm"><p>{c.loadError}</p><Button className="min-h-11" type="button" variant="secondary" disabled={loading} onClick={()=>void load()}>{c.retry}</Button></div>}
   {/* While a new status filter loads, do not show the previous filter's (possibly empty) result under the new label. */}
   {loading&&listStatus!==status?<p role="status" data-credits-loading className="text-sm text-[#52627a]">{c.loading}</p>:!list.items.length?<div data-credits-empty className="rounded-2xl border border-dashed border-[#d7e1ea] bg-[#f7f9fc] p-5 text-center"><p className="font-semibold text-[#162543]">{listStatus!=='all'?c.emptyFiltered:c.empty[list.tab]}</p>{listStatus==='all'&&<p className="mt-1 text-sm text-[#52627a]">{c.emptyHelp[list.tab]}</p>}</div>:
    list.tab==='refund'?<RefundTable c={c} en={en} items={list.items} disabled={busy} onOpen={id=>{setOpenId(id);setDetail(null);setNotice('');setError('');}}/>:
    <CreditTable c={c} en={en} items={list.items} disabled={busy} onOpen={id=>{setOpenId(id);setDetail(null);setNotice('');setError('');}}/>}
   {(cursors.length>1||list.nextCursor!==null)&&<nav data-credits-pages className="flex flex-wrap items-center justify-between gap-2">
    <Button className="min-h-11" type="button" variant="secondary" disabled={busy||loading||cursors.length<=1} onClick={()=>setCursors(value=>value.slice(0,-1))}>{c.prev}</Button>
    <span className="text-sm text-[#52627a]">{c.page(cursors.length)}</span>
    <Button className="min-h-11" type="button" variant="secondary" disabled={busy||loading||list.nextCursor===null} onClick={()=>{const next=list.nextCursor;if(next!==null)setCursors(value=>[...value,next]);}}>{c.next}</Button>
   </nav>}
  </>}
  <WorkCreditLedger workId={workId} accountId={accountId} refreshKey={ledgerKey}/>
 </section>;
}

/** Payment details are sent only when the chosen ledger payment does not have them yet. */
function paymentDetails(list:CreditList,entryId:string,d:{receivedOn:string;method:CreditMethod;reference:string}){
 const p=list.references.payments.find(item=>item.entryId===entryId);
 return p?.hasMetadata?{receivedOn:null,method:null,reference:null}:{receivedOn:d.receivedOn,method:d.method,reference:nullable(d.reference)};
}

function Stat({label:text,value,id,tone,wide}:{label:string;value:string;id:string;tone?:boolean;wide?:boolean}){
 return <div data-credits-total={id} className={`min-w-0 ${wide?'col-span-2 sm:col-span-1 ':''}rounded-xl border border-[#d7e1ea] bg-[#f7f9fc] p-3`}><dt className="text-xs font-semibold text-[#52627a]">{text}</dt><dd className={`mt-1 break-words text-base font-bold tabular-nums ${tone?'text-[#a03c1f]':'text-[#162543]'}`}>{value}</dd></div>;
}
function StatusBadge({status,c}:{status:CreditStatus|RefundStatus;c:Copy}){
 const tone=status==='available'||status==='recorded'?'bg-[#eef8f4] text-[#18573a]':status==='partial'?'bg-[#eaf5fb] text-[#006e90]':status==='requested'?'bg-[#fff6e5] text-[#7a4b00]':status==='reversed'?'bg-[#fff4f2] text-[#a03c1f]':'bg-[#f1f3f6] text-[#52627a]';
 return <span data-credit-status={status} className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${tone}`}>{c.statuses[status]}</span>;
}
const th='px-3 py-2 text-left text-xs font-semibold text-[#52627a]',td='px-3 py-3 align-top text-sm';
function CreditTable({c,en,items,disabled,onOpen}:{c:Copy;en:boolean;items:CreditSummary[];disabled:boolean;onOpen:(id:string)=>void}){
 const k=c.columns;
 return <>
  <div className="hidden min-w-0 overflow-hidden rounded-2xl border border-[#d7e1ea] bg-white lg:block"><table data-credits-table className="w-full table-fixed">
   <thead className="bg-[#f7f9fc]"><tr><th className={th+' w-[22%]'}>{k.title}</th><th className={th}>{k.code}</th><th className={th}>{k.status}</th><th className={th}>{k.created}</th><th className={th+' text-right'}>{k.total}</th><th className={th+' text-right'}>{k.balance}</th><th className={th}>{k.recipient}</th><th className={th+' text-right'}>{k.available}</th></tr></thead>
   <tbody>{items.map(item=><tr key={item.id} data-credit={item.code} className="border-t border-[#d7e1ea]">
    <td className={td+' break-words'}><button type="button" className="min-h-11 text-left font-semibold text-[#162543] underline-offset-2 hover:underline disabled:opacity-50" disabled={disabled} onClick={()=>onOpen(item.id)}>{item.title}</button></td>
    <td className={td+' font-semibold text-[#008bb5]'}>{item.code}</td><td className={td}><StatusBadge status={item.status} c={c}/></td><td className={td}>{created(item.createdAt,en)}</td>
    <td className={td+' text-right tabular-nums'}>{money(item.amountCents)}</td><td className={td+' text-right tabular-nums'}>{money(item.balanceCents)}</td>
    <td className={td+' break-words'}>{item.recipient??'—'}</td><td data-credit-available className={td+' text-right font-bold tabular-nums'}>{money(item.availableCents)}</td>
   </tr>)}</tbody></table></div>
  <ul data-credits-cards className="space-y-2 lg:hidden">{items.map(item=><li key={item.id}><article data-credit={item.code} className="grid min-w-0 gap-3 rounded-2xl border border-[#d7e1ea] bg-white p-4">
   <div className="flex flex-wrap items-center gap-2"><strong className="text-[#008bb5]">{item.code}</strong><StatusBadge status={item.status} c={c}/></div>
   <p className="break-words font-semibold text-[#162543]">{item.title}</p>
   <p className="break-words text-sm text-[#52627a]">{item.recipient??'—'} · {c.columns.created}: {created(item.createdAt,en)}</p>
   <dl className="grid grid-cols-3 gap-2 text-sm"><div className="min-w-0"><dt className="text-xs text-[#52627a]">{k.total}</dt><dd className="break-words font-semibold tabular-nums">{money(item.amountCents)}</dd></div><div className="min-w-0"><dt className="text-xs text-[#52627a]">{k.balance}</dt><dd className="break-words font-semibold tabular-nums">{money(item.balanceCents)}</dd></div><div className="min-w-0"><dt className="text-xs text-[#52627a]">{k.available}</dt><dd data-credit-available className="break-words font-bold tabular-nums">{money(item.availableCents)}</dd></div></dl>
   <Button type="button" variant="secondary" className="min-h-11 justify-self-start" disabled={disabled} onClick={()=>onOpen(item.id)}>{c.open}</Button>
  </article></li>)}</ul>
 </>;
}
function RefundTable({c,en,items,disabled,onOpen}:{c:Copy;en:boolean;items:CreditRefund[];disabled:boolean;onOpen:(creditId:string)=>void}){
 const k=c.columns;
 return <>
  <div className="hidden min-w-0 overflow-hidden rounded-2xl border border-[#d7e1ea] bg-white lg:block"><table data-credits-table className="w-full table-fixed">
   <thead className="bg-[#f7f9fc]"><tr><th className={th+' w-[22%]'}>{k.title}</th><th className={th}>{k.code}</th><th className={th}>{k.status}</th><th className={th}>{k.created}</th><th className={th+' text-right'}>{k.total}</th><th className={th}>{k.source}</th><th className={th}>{k.recipient}</th><th className={th}>{k.date}</th></tr></thead>
   <tbody>{items.map(item=><tr key={item.id} data-refund={item.code} className="border-t border-[#d7e1ea]">
    <td className={td+' break-words'}><button type="button" className="min-h-11 text-left font-semibold text-[#162543] underline-offset-2 hover:underline disabled:opacity-50" disabled={disabled} onClick={()=>onOpen(item.creditId)}>{item.title}</button></td>
    <td className={td+' font-semibold text-[#008bb5]'}>{item.code}</td><td className={td}><StatusBadge status={item.status} c={c}/></td><td className={td}>{created(item.createdAt,en)}</td>
    <td className={td+' text-right font-bold tabular-nums'}>{money(item.amountCents)}</td><td className={td}>{item.creditCode}</td><td className={td+' break-words'}>{item.recipient??'—'}</td><td className={td}>{day(item.refundedOn,en)}</td>
   </tr>)}</tbody></table></div>
  <ul data-credits-cards className="space-y-2 lg:hidden">{items.map(item=><li key={item.id}><article data-refund={item.code} className="grid min-w-0 gap-2 rounded-2xl border border-[#d7e1ea] bg-white p-4">
   <div className="flex flex-wrap items-center gap-2"><strong className="text-[#008bb5]">{item.code}</strong><StatusBadge status={item.status} c={c}/><span className="text-sm text-[#52627a]">{k.source}: {item.creditCode}</span></div>
   <p className="break-words font-semibold text-[#162543]">{item.title}</p>
   <p className="break-words text-sm text-[#52627a]">{item.recipient??'—'} · {k.date}: {day(item.refundedOn,en)} · {c.methods[item.method]}</p>
   <p className="font-bold tabular-nums">{money(item.amountCents)}</p>
   <Button type="button" variant="secondary" className="min-h-11 justify-self-start" disabled={disabled} onClick={()=>onOpen(item.creditId)}>{c.open}</Button>
  </article></li>)}</ul>
 </>;
}

function PaymentFields({c,en,list,entryId,draft,saving,onChange}:{c:Copy;en:boolean;list:CreditList;entryId:string;draft:{receivedOn:string;method:CreditMethod;reference:string};saving:boolean;onChange:(next:Partial<{entryId:string;receivedOn:string;method:CreditMethod;reference:string}>)=>void}){
 const options=list.references.payments.filter(p=>p.freeCents>0&&!p.creditCode),chosen=options.find(p=>p.entryId===entryId);
 if(!options.length)return <p data-credits-no-payments className="rounded-xl bg-[#fff6e5] p-3 text-sm text-[#7a4b00] sm:col-span-2">{c.noPayments}</p>;
 return <>
  <label className={label+' sm:col-span-2'}>{c.payment}<select data-credit-field="entryId" className={field} value={entryId} disabled={saving} onChange={event=>onChange({entryId:event.target.value})}>
   <option value="">{c.choosePayment}</option>{options.map(p=><option key={p.entryId} value={p.entryId}>{c.paymentOption(money(p.amountCents),money(p.freeCents),p.reference||p.label)}</option>)}</select></label>
  {chosen?.hasMetadata?<p data-credit-payment-details className="text-sm text-[#52627a] sm:col-span-2">{c.paymentHasDetails(day(chosen.receivedOn,en),chosen.method?c.methods[chosen.method]:'—')}</p>:chosen&&<ManualFields c={c} list={list} draft={draft} saving={saving} onChange={onChange}/>}
 </>;
}
function ManualFields({c,list,draft,saving,onChange,dateLabel}:{c:Copy;list:CreditList;draft:{receivedOn:string;method:CreditMethod;reference:string};saving:boolean;onChange:(next:Partial<{receivedOn:string;method:CreditMethod;reference:string}>)=>void;dateLabel?:string}){
 return <>
  <label className={label}>{dateLabel??c.receivedOn}<input data-credit-field="receivedOn" type="date" className={field} max={list.today} value={draft.receivedOn} disabled={saving} onChange={event=>onChange({receivedOn:event.target.value})}/></label>
  <label className={label}>{c.method}<select data-credit-field="method" className={field} value={draft.method} disabled={saving} onChange={event=>onChange({method:event.target.value as CreditMethod})}>{creditMethods.map(method=><option key={method} value={method}>{c.methods[method]}</option>)}</select></label>
  <label className={label+' sm:col-span-2'}>{c.reference}<input data-credit-field="reference" className={field} maxLength={160} value={draft.reference} disabled={saving} onChange={event=>onChange({reference:event.target.value})}/></label>
 </>;
}
function Actions({c,saving,submit,onCancel}:{c:Copy;saving:boolean;submit:string;onCancel:()=>void}){
 return <div className="flex flex-wrap gap-2"><Button type="submit" className="min-h-11" disabled={saving}>{saving?c.saving:submit}</Button><Button type="button" variant="secondary" className="min-h-11" disabled={saving} onClick={onCancel}>{c.cancel}</Button></div>;
}

function CreateForm({c,en,form,list,busy,saving,onChange,onSubmit,onCancel}:{c:Copy;en:boolean;form:Extract<Form,{mode:'create'}>;list:CreditList;busy:boolean;saving:boolean;onChange:(draft:CreateDraft)=>void;onSubmit:(event:FormEvent)=>void;onCancel:()=>void}){
 const d=form.draft,set=(next:Partial<CreateDraft>)=>onChange({...d,...next});
 return <form data-credit-form={form.kind} onSubmit={onSubmit} noValidate className="space-y-4 rounded-2xl border border-[#d7e1ea] bg-white p-4">
  <h4 className="font-semibold text-[#162543]">{c.add[form.kind]} · <span className="text-[#008bb5]">{form.kind==='retainer'?'ANT':form.kind==='credit_note'?'NC':'SP'}-{String(list.nextNumbers[form.kind]).padStart(4,'0')}</span></h4>
  <div className="grid gap-3 sm:grid-cols-2">
   <label className={label+' sm:col-span-2'}>{c.creditTitle}<input data-credit-field="title" className={field} maxLength={160} placeholder={c.titlePlaceholder[form.kind]} value={d.title} disabled={busy} onChange={event=>set({title:event.target.value})}/></label>
   <label className={label}>{c.amount}<input data-credit-field="amount" inputMode="decimal" className={field} value={d.amount} disabled={busy} onChange={event=>set({amount:event.target.value})}/></label>
   {form.kind==='retainer'&&<label className={label}>{c.requestedOn}<input data-credit-field="requestedOn" type="date" className={field} value={d.requestedOn} disabled={busy} onChange={event=>set({requestedOn:event.target.value})}/></label>}
   {form.kind==='credit_note'&&<label className={label+' sm:col-span-2'}>{c.reason}<input data-credit-field="reason" className={field} maxLength={300} value={d.reason} disabled={busy} onChange={event=>set({reason:event.target.value})}/><span className="mt-1 block text-xs font-normal text-[#52627a]">{c.reasonHelp}</span></label>}
   {form.kind==='overpayment'&&<PaymentFields c={c} en={en} list={list} entryId={d.entryId} draft={d} saving={busy} onChange={next=>set(next)}/>}
   <label className={label+' sm:col-span-2'}>{c.note}<textarea data-credit-field="note" className={field+' min-h-24 py-2'} maxLength={2000} value={d.note} disabled={busy} onChange={event=>set({note:event.target.value})}/></label>
  </div>
  <Actions c={c} saving={saving} submit={c.create} onCancel={onCancel}/>
 </form>;
}

function CreditDetailView({c,en,credit,history,error,list,form,saving,disabled,onRetry,onBack,onOpen,onFormChange,onSubmit,onFormCancel}:{
 c:Copy;en:boolean;credit:Credit|null;history:CreditHistoryEntry[];error:boolean;list:CreditList;form:Form|null;saving:boolean;disabled:boolean;
 onRetry:()=>void;onBack:()=>void;onOpen:(form:Form)=>void;onFormChange:(form:Form)=>void;onSubmit:(event:FormEvent)=>void;onFormCancel:()=>void}){
 const back=<Button type="button" variant="secondary" className="min-h-11" disabled={!!form&&saving} onClick={onBack}>{c.back}</Button>;
 if(!credit)return <div className="space-y-3">{back}{error?<div role="alert" data-credit-detail-error className="space-y-2 rounded-2xl border border-[#d7e1ea] p-4"><p className="text-sm">{c.loadError}</p><Button className="min-h-11" type="button" variant="secondary" onClick={onRetry}>{c.retry}</Button></div>:<p role="status" className="text-sm text-[#52627a]">{c.loading}</p>}</div>;
 const canWrite=list.canWrite,activeCredit=credit.baseStatus==='active'&&!credit.sourceReversed,mine=form&&'credit' in form&&form.credit.id===credit.id?form:null;
 const drafts=list.references.drafts.filter(d=>d.balanceCents>0);
 const reasonForm=(purpose:ReasonPurpose,targetId:string|null)=>onOpen({mode:'reason',credit,purpose,targetId,draft:{reason:''},initial:{reason:''}});
 const inlineReason=(purpose:ReasonPurpose,targetId:string|null):ReactNode=>mine?.mode==='reason'&&mine.purpose===purpose&&mine.targetId===targetId?<form data-credit-reason-form={purpose} onSubmit={onSubmit} noValidate className="w-full space-y-2">
  <label className={label}>{c.reasonTitle[purpose]}<input data-credit-field="reason" className={field} maxLength={purpose==='unapply'?160:300} value={mine.draft.reason} disabled={saving} onChange={event=>onFormChange({...mine,draft:{reason:event.target.value}})}/></label>
  <Actions c={c} saving={saving} submit={c.saveReason[purpose]} onCancel={onFormCancel}/></form>:null;
 return <article data-credit-detail={credit.code} className="min-w-0 space-y-4">
  <div className="flex flex-wrap items-center justify-between gap-2">{back}</div>
  <header className="space-y-1 rounded-2xl border border-[#d7e1ea] bg-white p-4">
   <div className="flex flex-wrap items-center gap-2"><strong className="text-lg text-[#008bb5]">{credit.code}</strong><StatusBadge status={credit.status} c={c}/></div>
   <h4 className="break-words text-lg font-bold text-[#162543]">{credit.title}</h4>
   <p className="break-words text-sm text-[#52627a]">{c.recipient}: <span className="font-semibold text-[#162543]">{credit.recipient??'—'}</span> · {c.columns.created}: {created(credit.createdAt,en)}</p>
   {credit.requestedOn&&<p className="text-sm text-[#52627a]">{c.requested}: {day(credit.requestedOn,en)}</p>}
   {credit.receivedOn&&<p data-credit-ledger className="break-words text-sm text-[#52627a]">{c.ledgerPayment}: {day(credit.receivedOn,en)} · {credit.method?c.methods[credit.method]:'—'}{credit.reference?` · ${credit.reference}`:''}</p>}
   {credit.reason&&<p className="break-words text-sm text-[#162543]"><span className="font-semibold">{c.reasonLabel}: </span>{credit.reason}</p>}
   {credit.note&&<p className="whitespace-pre-wrap break-words text-sm text-[#162543]"><span className="font-semibold">{c.noteLabel}: </span>{credit.note}</p>}
  </header>
  <dl data-credit-detail-totals className="grid grid-cols-2 gap-2 sm:grid-cols-5">
   <Stat id="detail-total" label={c.total} value={money(credit.amountCents)}/><Stat id="detail-applied" label={c.applied} value={money(credit.appliedCents)}/><Stat id="detail-refunded" label={c.refunded} value={money(credit.refundedCents)}/>
   <Stat id="detail-balance" label={c.balance} value={money(credit.balanceCents)}/><Stat id="detail-available" label={c.available} value={money(credit.availableCents)} wide/>
  </dl>
  {credit.sourceReversed&&<p className="rounded-xl bg-[#fff4f2] p-3 text-sm text-[#a03c1f]">{c.reversedNote}</p>}
  {activeCredit&&credit.availableCents<credit.balanceCents&&<p data-credit-bound className="rounded-xl bg-[#eaf5fb] p-3 text-sm text-[#006e90]">{c.boundNote}</p>}
  {!form&&<div className="flex flex-wrap gap-2">
   {canWrite&&credit.baseStatus==='requested'&&<Button type="button" data-credit-action="receive" className="min-h-11" disabled={disabled} onClick={()=>{const p=list.references.payments.find(x=>x.freeCents>0&&!x.creditCode);const draft:ReceiveDraft={source:p?'existing':'manual',entryId:p?.entryId??'',amount:centsToInput(p?Math.min(credit.amountCents,p.freeCents):credit.amountCents),receivedOn:list.today,method:'transfer',reference:''};onOpen({mode:'receive',credit,draft,initial:draft});}}>{c.receive}</Button>}
   {canWrite&&activeCredit&&credit.availableCents>0&&<Button type="button" data-credit-action="apply" className="min-h-11" disabled={disabled} onClick={()=>{const first=drafts[0];const draft:ApplyDraft={draftId:first?.id??'',amount:first?centsToInput(Math.min(credit.availableCents,first.balanceCents)):''};onOpen({mode:'apply',credit,draft,initial:draft});}}>{c.apply}</Button>}
   {activeCredit&&credit.availableCents>0&&<Button type="button" variant="secondary" data-credit-action="refund" className="min-h-11" disabled={disabled} onClick={()=>{const draft:RefundDraft={amount:centsToInput(credit.availableCents),refundedOn:list.today,method:'transfer',reference:'',note:''};onOpen({mode:'refund',credit,draft,initial:draft});}}>{c.refund}</Button>}
   {credit.baseStatus!=='cancelled'&&<Button type="button" variant="secondary" data-credit-action="edit" className="min-h-11" disabled={disabled} onClick={()=>{const draft:EditDraft={title:credit.title,amount:centsToInput(credit.amountCents),reason:credit.reason??'',note:credit.note??''};onOpen({mode:'edit',credit,draft,initial:draft});}}>{c.edit}</Button>}
   {credit.baseStatus!=='cancelled'&&credit.appliedCents===0&&credit.refundedCents===0&&<Button type="button" variant="secondary" data-credit-action="cancel" className="min-h-11" disabled={disabled} onClick={()=>reasonForm('cancel',null)}>{c.cancelCredit}</Button>}
  </div>}
  {inlineReason('cancel',null)}
  {mine?.mode==='edit'&&<form data-credit-edit-form onSubmit={onSubmit} noValidate className="space-y-3 rounded-2xl border border-[#d7e1ea] bg-white p-4">
   <div className="grid gap-3 sm:grid-cols-2">
    <label className={label+' sm:col-span-2'}>{c.creditTitle}<input data-credit-field="title" className={field} maxLength={160} value={mine.draft.title} disabled={saving} onChange={event=>onFormChange({...mine,draft:{...mine.draft,title:event.target.value}})}/></label>
    <label className={label}>{c.amount}<input data-credit-field="amount" inputMode="decimal" className={field} value={mine.draft.amount} disabled={saving||credit.entryId!==null} onChange={event=>onFormChange({...mine,draft:{...mine.draft,amount:event.target.value}})}/></label>
    {credit.kind==='credit_note'&&<label className={label}>{c.reason}<input data-credit-field="reason" className={field} maxLength={300} value={mine.draft.reason} disabled={saving} onChange={event=>onFormChange({...mine,draft:{...mine.draft,reason:event.target.value}})}/></label>}
    <label className={label+' sm:col-span-2'}>{c.note}<textarea data-credit-field="note" className={field+' min-h-24 py-2'} maxLength={2000} value={mine.draft.note} disabled={saving} onChange={event=>onFormChange({...mine,draft:{...mine.draft,note:event.target.value}})}/></label>
   </div>
   <Actions c={c} saving={saving} submit={c.saveEdit} onCancel={onFormCancel}/>
  </form>}
  {mine?.mode==='receive'&&<form data-credit-receive-form onSubmit={onSubmit} noValidate className="space-y-3 rounded-2xl border border-[#d7e1ea] bg-white p-4">
   <h5 className="font-semibold text-[#162543]">{c.receiveTitle}</h5>
   <fieldset className="grid gap-2 sm:grid-cols-2"><legend className="sr-only">{c.receiveTitle}</legend>
    {(['existing','manual'] as const).map(source=><label key={source} className="flex min-h-11 items-center gap-2 rounded-xl border border-[#d7e1ea] px-3 text-sm font-semibold text-[#162543]"><input type="radio" name="credit-receive-source" data-credit-source={source} className="h-5 w-5" checked={mine.draft.source===source} disabled={saving} onChange={()=>onFormChange({...mine,draft:{...mine.draft,source}})}/>{source==='existing'?c.sourceExisting:c.sourceManual}</label>)}
   </fieldset>
   <div className="grid gap-3 sm:grid-cols-2">
    {mine.draft.source==='existing'?<PaymentFields c={c} en={en} list={list} entryId={mine.draft.entryId} draft={mine.draft} saving={saving} onChange={next=>onFormChange({...mine,draft:{...mine.draft,...next}})}/>:<>
     <p className="text-sm text-[#52627a] sm:col-span-2">{c.manualHelp}</p>
     <ManualFields c={c} list={list} draft={mine.draft} saving={saving} onChange={next=>onFormChange({...mine,draft:{...mine.draft,...next}})}/></>}
    <label className={label}>{c.amount}<input data-credit-field="amount" inputMode="decimal" className={field} value={mine.draft.amount} disabled={saving} onChange={event=>onFormChange({...mine,draft:{...mine.draft,amount:event.target.value}})}/></label>
   </div>
   <Actions c={c} saving={saving} submit={c.saveReceive} onCancel={onFormCancel}/>
  </form>}
  {mine?.mode==='apply'&&<form data-credit-apply-form onSubmit={onSubmit} noValidate className="space-y-3 rounded-2xl border border-[#d7e1ea] bg-white p-4">
   <h5 className="font-semibold text-[#162543]">{c.applyTitle}</h5><p className="text-sm text-[#52627a]">{c.applyHelp}</p>
   {!drafts.length?<p data-credits-no-drafts className="rounded-xl bg-[#fff6e5] p-3 text-sm text-[#7a4b00]">{c.noDrafts}</p>:<div className="grid gap-3 sm:grid-cols-2">
    <label className={label}>{c.draft}<select data-credit-field="draftId" className={field} value={mine.draft.draftId} disabled={saving} onChange={event=>onFormChange({...mine,draft:{...mine.draft,draftId:event.target.value}})}><option value="">{c.chooseDraft}</option>{drafts.map(d=><option key={d.id} value={d.id}>{c.draftOption(d.title,money(d.balanceCents))}</option>)}</select></label>
    <label className={label}>{c.amount}<input data-credit-field="amount" inputMode="decimal" className={field} value={mine.draft.amount} disabled={saving} onChange={event=>onFormChange({...mine,draft:{...mine.draft,amount:event.target.value}})}/></label>
   </div>}
   <Actions c={c} saving={saving} submit={c.saveApply} onCancel={onFormCancel}/>
  </form>}
  {mine?.mode==='refund'&&<form data-credit-refund-form onSubmit={onSubmit} noValidate className="space-y-3 rounded-2xl border border-[#d7e1ea] bg-white p-4">
   <h5 className="font-semibold text-[#162543]">{c.refundTitle}</h5><p className="text-sm text-[#52627a]">{c.refundHelp}</p>
   <div className="grid gap-3 sm:grid-cols-2">
    <label className={label}>{c.amount}<input data-credit-field="amount" inputMode="decimal" className={field} value={mine.draft.amount} disabled={saving} onChange={event=>onFormChange({...mine,draft:{...mine.draft,amount:event.target.value}})}/></label>
    <ManualFields c={c} list={list} dateLabel={c.refundedOn} draft={{receivedOn:mine.draft.refundedOn,method:mine.draft.method,reference:mine.draft.reference}} saving={saving} onChange={next=>onFormChange({...mine,draft:{...mine.draft,...(next.receivedOn!==undefined?{refundedOn:next.receivedOn}:{}),...(next.method?{method:next.method}:{}),...(next.reference!==undefined?{reference:next.reference}:{})}})}/>
    <label className={label+' sm:col-span-2'}>{c.note}<input data-credit-field="note" className={field} maxLength={300} value={mine.draft.note} disabled={saving} onChange={event=>onFormChange({...mine,draft:{...mine.draft,note:event.target.value}})}/></label>
   </div>
   <Actions c={c} saving={saving} submit={c.saveRefund} onCancel={onFormCancel}/>
  </form>}
  <section data-credit-applications className="space-y-2"><h5 className="font-semibold text-[#162543]">{c.applications}</h5>
   {credit.applications.length?<ul className="space-y-2">{credit.applications.map(app=><li key={app.id} data-credit-application={app.state} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#f7f9fc] p-3 text-sm">
    <span className="min-w-0 break-words"><span className="font-semibold">{money(app.amountCents)}</span> · {app.draftTitle??'—'} · {stamp(app.createdAt,en)} · {c.appStates[app.state]}{app.viaInvoicePayments&&app.state==='active'?` · ${c.viaInvoice}`:''}{app.reason?` · ${app.reason}`:''}</span>
    {app.state==='active'&&!form&&<Button type="button" variant="secondary" data-credit-action="unapply" className="min-h-11" disabled={disabled} onClick={()=>reasonForm('unapply',app.id)}>{c.revert}</Button>}
    {inlineReason('unapply',app.id)}
   </li>)}</ul>:<p className="text-sm text-[#52627a]">{c.noApplications}</p>}
  </section>
  <section data-credit-refunds className="space-y-2"><h5 className="font-semibold text-[#162543]">{c.refunds}</h5>
   {credit.refunds.length?<ul className="space-y-2">{credit.refunds.map(refund=><li key={refund.id} data-credit-refund={refund.status} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#f7f9fc] p-3 text-sm">
    <span className="min-w-0 break-words"><span className="font-semibold text-[#008bb5]">{refund.code}</span> · {money(refund.amountCents)} · {day(refund.refundedOn,en)} · {c.methods[refund.method]}{refund.reference?` · ${refund.reference}`:''}{refund.note?` · ${refund.note}`:''} · <StatusBadge status={refund.status} c={c}/>{refund.voidReason?` · ${refund.voidReason}`:''}</span>
    {refund.status==='recorded'&&!form&&<Button type="button" variant="secondary" data-credit-action="void_refund" className="min-h-11" disabled={disabled} onClick={()=>reasonForm('void_refund',refund.id)}>{c.voidRefund}</Button>}
    {inlineReason('void_refund',refund.id)}
   </li>)}</ul>:<p className="text-sm text-[#52627a]">{c.noRefunds}</p>}
  </section>
  <details data-credit-history className="rounded-2xl border border-[#d7e1ea] p-3"><summary className="min-h-11 cursor-pointer py-2 font-semibold text-[#162543]">{c.history}</summary>
   {history.length?<ol className="mt-2 space-y-1 text-sm">{history.map(entry=><li key={entry.actionId} data-credit-history-entry={entry.action} className="break-words"><span className="font-semibold">{c.actions[entry.action]}</span> · {stamp(entry.at,en)}{entry.before&&entry.before.availableCents!==entry.after.availableCents?` · ${c.available}: ${money(entry.before.availableCents)} → ${money(entry.after.availableCents)}`:''}</li>)}</ol>:<p className="mt-2 text-sm text-[#52627a]">{c.historyEmpty}</p>}
  </details>
 </article>;
}
