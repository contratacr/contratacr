'use client';

import {useCallback,useEffect,useLayoutEffect,useRef,useState,type FormEvent,type ReactNode} from 'react';
import {useLocale} from 'next-intl';
import {useAuth} from '@/hooks/use-auth';
import {useAppDialog} from '@/hooks/use-app-dialog';
import {Button} from '@/components/ui/button';
import {proMoney} from '@/lib/pro/money';
import {
 ALLOWANCE_NOTES_MAX,allowanceCommitmentState,allowanceDetailSchema,allowanceMutationSchema,allowanceResultSchema,centsToInput,clientAllowancesSchema,colonesToCents,parseQuantity,
 type AllowanceChangeStatus,type AllowanceCommitment,type AllowanceDetail,type AllowanceHistoryEntry,type AllowanceItem,type AllowanceMutation,type ClientAllowances,
} from '@/lib/pro/allowances';
import {workChangeMutation,type WorkChangesPage} from '@/lib/pro/work-changes';
import {PRO_SERVICE_REFRESH,useProChildGuard} from './use-pro-child-guard';
import {CatalogSelect} from './catalog-select';
import {AllowanceSurcharge} from './allowance-surcharge';

/**
 * Montos previstos para materiales por elegir (family 75). Owner list per job plus
 * the opt-in customer read. Amounts are CRC; nothing here charges or invoices.
 */
const api='/api/pro/allowances',field='mt-1 block min-h-11 w-full min-w-0 rounded-xl border border-[#d7e1ea] bg-white px-3 text-base font-normal';
type StateCallback={onStateChange?:(state:{dirty:boolean;busy:boolean})=>void};
type DetailsDraft={name:string;category:string;planned:string;dueDate:string;notes:string};
type ChoiceDraft={description:string;supplier:string;quantity:string;actual:string};
type Form={mode:'create'|'edit';item:AllowanceItem|null;draft:DetailsDraft;initial:DetailsDraft}|{mode:'decide';item:AllowanceItem;draft:ChoiceDraft;initial:ChoiceDraft};
type PendingChange={item:AllowanceItem;body:string;changeId:string;linkActionId:string};
const money=(cents:number)=>proMoney(cents/100);
const signed=(cents:number)=>cents>0?'+'+money(cents):cents<0?'−'+money(-cents):money(0);
const day=(value:string,en:boolean)=>new Intl.DateTimeFormat(en?'en-US':'es-CR',{dateStyle:'medium',timeZone:'UTC'}).format(new Date(value+'T12:00:00Z'));
const stamp=(value:string,en:boolean)=>new Intl.DateTimeFormat(en?'en-US':'es-CR',{dateStyle:'medium',timeStyle:'short',timeZone:'America/Costa_Rica'}).format(new Date(value));
const quantityText=(value:number,en:boolean)=>new Intl.NumberFormat(en?'en-US':'es-CR',{maximumFractionDigits:2}).format(value);

function copy(en:boolean){
 return en?{
  title:'Allowances',intro:'Set aside an amount for materials or fixtures your customer still has to choose. When the choice is made, record it and compare it with the allowance.',
  add:'New allowance',planned:'Planned',actual:'Defined (actual)',difference:'Difference on defined items',pending:'Still to choose',overdue:'Past due',projected:(value:string)=>`Projected total with current choices: ${value}`,
  name:'Name',namePlaceholder:'E.g. Kitchen faucet',category:'Area or category (optional)',categoryPlaceholder:'E.g. Kitchen',amount:'Allowance amount (₡)',due:'Decision deadline (optional)',notes:'Internal notes (optional)',notesHelp:'Only you can see these notes.',notesLabel:'Internal notes',dueLabel:'Deadline',
  create:'Save allowance',saveEdit:'Save changes',cancel:'Cancel',saving:'Saving…',edit:'Edit',decide:'Define choice',reopen:'Reopen',archive:'Archive',restore:'Restore',
  choice:'What was chosen',choicePlaceholder:'E.g. Single-handle faucet, brushed steel',fromCatalog:'Fill from the catalog (optional)',fromCatalogHelp:'Fills the name and the actual total (price × quantity). You can edit both before saving.',supplier:'Supplier or product (optional)',quantity:'Quantity',actualAmount:'Actual total (₡)',saveChoice:'Save choice',
  previewOver:(v:string)=>`Above the allowance by ${v}`,previewUnder:(v:string)=>`Below the allowance by ${v}`,previewEqual:'Same as the allowance',
  open:'Open',decided:'Defined',reopened:'Reopened',archived:'Archived',pastDue:'Past due',dueOn:(v:string)=>`Decide by ${v}`,noDue:'No deadline',
  over:(v:string)=>`Above the allowance: ${v}`,under:(v:string)=>`Below the allowance: ${v}`,equal:'Same as the allowance',
  chosen:'Chosen',qty:(v:string)=>`Quantity: ${v}`,actualLabel:'Actual',plannedLabel:'Allowance',
  empty:'There are no allowances for this project yet.',emptyHelp:'Create one for each material your customer still has to choose, for example tiles or a faucet.',
  showArchived:(n:number)=>`Show archived (${n})`,hideArchived:'Hide archived',
  loading:'Loading allowances…',loadError:'Could not load the allowances.',retry:'Retry',reload:'Reload',
  conflict:'This allowance changed in another window. Reload before trying again.',uncertain:'We could not confirm whether it was saved. Retry the same operation; it will not be applied twice.',retrySame:'Retry the same operation',
  failed:'Could not save. Review the information and try again.',invalid:'Enter a name and a valid amount. The date must be a real day.',invalidChoice:'Describe what was chosen, a quantity greater than zero and a valid actual total.',
  saved:'Allowance saved.',decidedNotice:'Choice saved.',reopenedNotice:'Allowance reopened. The previous choice stays in the history.',archivedNotice:'Allowance archived.',restoredNotice:'Allowance restored.',
  leave:'Save or cancel the allowance you are editing before leaving.',
  reopenTitle:'Reopen this allowance?',reopenText:'The current choice is removed from the totals and kept in the history. You can define a new one later.',
  archiveTitle:'Archive this allowance?',archiveText:'It no longer counts in the totals or the customer view. You can restore it.',back:'Back',
  extra:'Propose extra for the difference',extraTitle:'Propose an extra for the difference?',extraText:(v:string)=>`An extra of ${v} is proposed in Extras and changes. Your customer has to accept it; no charge or invoice is created.`,
  extraNoAgreement:'To propose an extra, first set the agreed amount for this job in Costs & payments.',extraPending:'There is already an extra or change awaiting approval. Resolve it in Extras and changes first.',
  extraConflict:'The agreed amount or payments changed. Try again.',extraFailed:'Could not propose the extra. Review the job agreement and try again.',extraDone:'Extra proposed in Extras and changes. Your customer has to accept it; nothing was charged.',
  extraStatus:{proposed:'Extra proposed for this difference. Waiting for your customer.',accepted:'The extra for this difference was accepted.',declined:'Your customer declined the extra for this difference. To propose another, reopen and define the allowance again.',withdrawn:'The extra for this difference was withdrawn. To propose another, reopen and define the allowance again.'} as Record<AllowanceChangeStatus,string>,extraUnknown:'Linked extra. Its status could not be checked.',reopenPendingExtra:'The proposed extra stays pending in Extras and changes. Withdraw it there if it no longer applies.',clientLoadError:'Could not load the allowances.',openChanges:'View Extras and changes',extraReason:(name:string)=>`Difference on allowance: ${name}`,
  history:'Change history',historyEmpty:'No changes yet.',
  actions:{create:'Created',update:'Edited',decide:'Choice defined',reopen:'Reopened',archive:'Archived',restore:'Restored',link_change:'Extra proposed'} as Record<AllowanceHistoryEntry['action'],string>,
  previous:(v:string)=>`Previous choice: ${v}`,
  commitTitle:'Purchase orders',commitTotals:(committed:string,draft:string,received:string)=>`Committed in issued purchase orders: ${committed} · In draft orders: ${draft} · Received: ${received}`,
  committed:(v:string)=>`Committed in issued orders: ${v}`,draftOrders:(v:string)=>`In draft orders (not committed yet): ${v}`,received:(v:string)=>`Received so far: ${v}`,
  commitRemaining:(v:string,ref:string)=>`Still uncommitted: ${v} of ${ref}`,commitOver:(v:string,ref:string)=>`The issued orders exceed ${ref} by ${v}`,
  orderCode:(n:number)=>'OC-'+String(n).padStart(4,'0'),orderStatus:{draft:'Draft',issued:'Issued',partial:'Partially received',received:'Received'} as Record<AllowanceCommitment['orders'][number]['status'],string>,
 }:{
  title:'Montos previstos',intro:'Reserve un monto para materiales o acabados que su cliente todavía debe elegir. Cuando se elija, regístrelo y compárelo con lo previsto.',
  add:'Nuevo monto previsto',planned:'Previsto',actual:'Definido (real)',difference:'Diferencia en lo definido',pending:'Por elegir',overdue:'Vencidas',projected:(value:string)=>`Total proyectado con las elecciones actuales: ${value}`,
  name:'Nombre',namePlaceholder:'Ej.: Grifería de cocina',category:'Área o categoría (opcional)',categoryPlaceholder:'Ej.: Cocina',amount:'Monto previsto (₡)',due:'Fecha límite para decidir (opcional)',notes:'Notas internas (opcional)',notesHelp:'Solo usted ve estas notas.',notesLabel:'Notas internas',dueLabel:'Fecha límite',
  create:'Guardar monto previsto',saveEdit:'Guardar cambios',cancel:'Cancelar',saving:'Guardando…',edit:'Editar',decide:'Definir elección',reopen:'Reabrir',archive:'Archivar',restore:'Restaurar',
  choice:'Qué se eligió',choicePlaceholder:'Ej.: Grifo monomando, acero cepillado',fromCatalog:'Completar desde el catálogo (opcional)',fromCatalogHelp:'Completa el nombre y el total real (precio × cantidad). Puede editar ambos antes de guardar.',supplier:'Proveedor o producto (opcional)',quantity:'Cantidad',actualAmount:'Total real (₡)',saveChoice:'Guardar elección',
  previewOver:(v:string)=>`Por encima de lo previsto en ${v}`,previewUnder:(v:string)=>`Por debajo de lo previsto en ${v}`,previewEqual:'Igual a lo previsto',
  open:'Abierta',decided:'Definida',reopened:'Reabierta',archived:'Archivada',pastDue:'Vencida',dueOn:(v:string)=>`Decidir antes del ${v}`,noDue:'Sin fecha límite',
  over:(v:string)=>`Por encima de lo previsto: ${v}`,under:(v:string)=>`Por debajo de lo previsto: ${v}`,equal:'Igual a lo previsto',
  chosen:'Elegido',qty:(v:string)=>`Cantidad: ${v}`,actualLabel:'Real',plannedLabel:'Previsto',
  empty:'Todavía no hay montos previstos en este proyecto.',emptyHelp:'Cree uno por cada material que su cliente aún debe elegir, por ejemplo cerámica o grifería.',
  showArchived:(n:number)=>`Mostrar archivadas (${n})`,hideArchived:'Ocultar archivadas',
  loading:'Cargando montos previstos…',loadError:'No se pudieron cargar los montos previstos.',retry:'Reintentar',reload:'Recargar',
  conflict:'Esta partida cambió en otra ventana. Recárguela antes de volver a intentarlo.',uncertain:'No pudimos confirmar si se guardó. Reintente la misma operación; no se aplicará dos veces.',retrySame:'Reintentar la misma operación',
  failed:'No se pudo guardar. Revise los datos y vuelva a intentarlo.',invalid:'Indique un nombre y un monto válido. La fecha debe ser un día real.',invalidChoice:'Describa lo elegido, una cantidad mayor que cero y un total real válido.',
  saved:'Monto previsto guardado.',decidedNotice:'Elección guardada.',reopenedNotice:'Partida reabierta. La elección anterior queda en el historial.',archivedNotice:'Partida archivada.',restoredNotice:'Partida restaurada.',
  leave:'Guarde o cancele la partida que está editando antes de salir.',
  reopenTitle:'¿Reabrir esta partida?',reopenText:'La elección actual sale de los totales y queda en el historial. Luego puede definir otra.',
  archiveTitle:'¿Archivar esta partida?',archiveText:'Deja de contar en los totales y en la vista del cliente. Puede restaurarla.',back:'Volver',
  extra:'Proponer extra por la diferencia',extraTitle:'¿Proponer un extra por la diferencia?',extraText:(v:string)=>`Se propone un extra de ${v} en Extras y cambios. Su cliente debe aceptarlo; no se crea ningún cobro ni factura.`,
  extraNoAgreement:'Para proponer un extra, defina primero el importe acordado del trabajo en Costos y pagos.',extraPending:'Ya hay un extra o cambio por aprobar. Resuélvalo primero en Extras y cambios.',
  extraConflict:'El importe acordado o los pagos cambiaron. Vuelva a intentarlo.',extraFailed:'No se pudo proponer el extra. Revise el acuerdo del trabajo y vuelva a intentarlo.',extraDone:'Extra propuesto en Extras y cambios. Su cliente debe aceptarlo; no se cobró nada.',
  extraStatus:{proposed:'Extra propuesto por esta diferencia. Espere la respuesta de su cliente.',accepted:'El extra por esta diferencia fue aceptado.',declined:'Su cliente rechazó el extra por esta diferencia. Para proponer otro, reabra y vuelva a definir la partida.',withdrawn:'El extra por esta diferencia se retiró. Para proponer otro, reabra y vuelva a definir la partida.'} as Record<AllowanceChangeStatus,string>,extraUnknown:'Extra vinculado. No se pudo consultar su estado.',reopenPendingExtra:'El extra propuesto sigue pendiente en Extras y cambios. Retírelo allí si ya no aplica.',clientLoadError:'No se pudieron cargar los montos previstos.',openChanges:'Ver Extras y cambios',extraReason:(name:string)=>`Diferencia de monto previsto: ${name}`,
  history:'Historial de cambios',historyEmpty:'Todavía no hay cambios.',
  actions:{create:'Creada',update:'Editada',decide:'Elección definida',reopen:'Reabierta',archive:'Archivada',restore:'Restaurada',link_change:'Extra propuesto'} as Record<AllowanceHistoryEntry['action'],string>,
  previous:(v:string)=>`Elección anterior: ${v}`,
  commitTitle:'Órdenes de compra',commitTotals:(committed:string,draft:string,received:string)=>`Comprometido en órdenes de compra emitidas: ${committed} · En órdenes en borrador: ${draft} · Recibido: ${received}`,
  committed:(v:string)=>`Comprometido en órdenes emitidas: ${v}`,draftOrders:(v:string)=>`En órdenes en borrador (aún no comprometido): ${v}`,received:(v:string)=>`Recibido hasta ahora: ${v}`,
  commitRemaining:(v:string,ref:string)=>`Sin comprometer: ${v} de ${ref}`,commitOver:(v:string,ref:string)=>`Las órdenes emitidas superan ${ref} en ${v}`,
  orderCode:(n:number)=>'OC-'+String(n).padStart(4,'0'),orderStatus:{draft:'Borrador',issued:'Emitida',partial:'Recibida en parte',received:'Recibida'} as Record<AllowanceCommitment['orders'][number]['status'],string>,
 };
}
type Copy=ReturnType<typeof copy>;

const emptyDetails:DetailsDraft={name:'',category:'',planned:'',dueDate:'',notes:''};
const detailsOf=(item:AllowanceItem):DetailsDraft=>({name:item.name,category:item.category??'',planned:centsToInput(item.plannedCents),dueDate:item.dueDate??'',notes:item.notes??''});
const sameDraft=(a:object,b:object)=>JSON.stringify(a)===JSON.stringify(b);

export function WorkAllowances({workId,onStateChange,onOpenChanges}:{workId:string;onOpenChanges?:()=>void}&StateCallback){
 const {user,loading}=useAuth();if(loading||!user)return null;
 return <AllowancesSession key={user.id+':'+workId} accountId={user.id} workId={workId} onStateChange={onStateChange} onOpenChanges={onOpenChanges}/>;
}

function AllowancesSession({accountId,workId,onStateChange,onOpenChanges}:{accountId:string;workId:string;onOpenChanges?:()=>void}&StateCallback){
 const en=useLocale()==='en',c=copy(en),{confirm,dialogNode}=useAppDialog();
 const [detail,setDetail]=useState<AllowanceDetail|null>(null),[loading,setLoading]=useState(true),[loadError,setLoadError]=useState(false);
 const [form,setForm]=useState<Form|null>(null),[saving,setSaving]=useState(false),[uncertain,setUncertain]=useState(false),[conflict,setConflict]=useState(false);
 const [error,setError]=useState(''),[notice,setNotice]=useState(''),[showArchived,setShowArchived]=useState(false),[extraNotice,setExtraNotice]=useState(false);
 const active=useRef(true),sequence=useRef(0),lock=useRef(false),pending=useRef<{input:AllowanceMutation;notice:string}|null>(null),pendingChange=useRef<PendingChange|null>(null);
 const dirty=!!form&&!sameDraft(form.draft,form.initial),busy=saving||uncertain;
 useProChildGuard(!onStateChange&&(dirty||busy),useCallback(()=>setError(c.leave),[c.leave]));
 useLayoutEffect(()=>{onStateChange?.({dirty,busy});return()=>onStateChange?.({dirty:false,busy:false});},[dirty,busy,onStateChange]);
 const load=useCallback(async()=>{
  const id=++sequence.current;setLoading(true);setLoadError(false);
  try{
   const response=await fetch(api+'?'+new URLSearchParams({workId}),{cache:'no-store',headers:{'X-Pro-Expected-Actor':accountId}});if(!response.ok)throw Error();
   const body=allowanceDetailSchema.parse(await response.json());if(body.workId!==workId)throw Error();
   if(active.current&&id===sequence.current){setDetail(body);setConflict(false);}
   return true;
  }catch{if(active.current&&id===sequence.current)setLoadError(true);return false;}
  finally{if(active.current&&id===sequence.current)setLoading(false);}
 },[accountId,workId]);
 const invalidate=useCallback(()=>{sequence.current++;},[]);
 useEffect(()=>{active.current=true;const timer=setTimeout(()=>void load(),0);return()=>{active.current=false;invalidate();clearTimeout(timer);};},[load,invalidate]);

 async function send(input:AllowanceMutation,success:string){
  if(lock.current)return false;lock.current=true;pending.current={input,notice:success};setSaving(true);setError('');setNotice('');setExtraNotice(false);
  try{
   const response=await fetch(api,{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json','X-Pro-Expected-Actor':accountId},body:JSON.stringify(input)});
   if(response.status===409){pending.current=null;setUncertain(false);setConflict(true);setError(c.conflict);return false;}
   if(response.status>=500||response.status===429){setUncertain(true);setError(c.uncertain);return false;}
   if(!response.ok){pending.current=null;setUncertain(false);setError(input.action==='decide'?c.invalidChoice:c.failed);return false;}
   const body=allowanceResultSchema.parse(await response.json());if(body.item.id!==input.id||body.item.workId!==workId)throw Error();
   pending.current=null;setUncertain(false);
   if(active.current){setForm(null);setNotice(success);}
   lock.current=false;await load();return true;
  }catch{setUncertain(true);setError(c.uncertain);return false;}
  finally{lock.current=false;if(active.current)setSaving(false);}
 }

 function submit(event:FormEvent){
  event.preventDefault();if(!form||busy||conflict)return;
  if(form.mode==='decide'){
   const quantity=parseQuantity(form.draft.quantity,en),actual=colonesToCents(form.draft.actual);
   const parsed=allowanceMutationSchema.safeParse({action:'decide',actionId:crypto.randomUUID(),workId,id:form.item.id,revision:form.item.revision,choiceDescription:form.draft.description,supplier:form.draft.supplier.trim()||null,quantity,actualCents:actual});
   if(!parsed.success){setError(c.invalidChoice);return;}
   void send(parsed.data,c.decidedNotice);return;
  }
  const planned=colonesToCents(form.draft.planned),base={workId,actionId:crypto.randomUUID(),name:form.draft.name,category:form.draft.category.trim()||null,plannedCents:planned,dueDate:form.draft.dueDate||null,notes:form.draft.notes.trim()||null};
  const parsed=allowanceMutationSchema.safeParse(form.mode==='create'?{action:'create',id:crypto.randomUUID(),...base}:{action:'update',id:form.item!.id,revision:form.item!.revision,...base});
  if(!parsed.success){setError(c.invalid);return;}
  void send(parsed.data,c.saved);
 }
 function open(next:Form){if(busy)return;setForm(next);setError('');setNotice('');setExtraNotice(false);}
 function cancel(){setForm(null);setError('');setConflict(false);}
 async function act(item:AllowanceItem,action:'reopen'|'archive'|'restore'){
  if(busy||form)return;
  if(action!=='restore'){const answer=await confirm({title:action==='reopen'?c.reopenTitle:c.archiveTitle,description:`${item.name} · ${money(item.plannedCents)}`,detail:(action==='reopen'?c.reopenText:c.archiveText)+(item.changeId&&detail?.changeStatuses[item.changeId]==='proposed'?' '+c.reopenPendingExtra:''),confirmLabel:action==='reopen'?c.reopen:c.archive,cancelLabel:c.back,tone:action==='archive'?'danger':'default'});if(!answer.confirmed)return;}
  void send({action,actionId:crypto.randomUUID(),workId,id:item.id,revision:item.revision},action==='reopen'?c.reopenedNotice:action==='archive'?c.archivedNotice:c.restoredNotice);
 }

 // Positive difference → optional proposal through the existing extras/changes API.
 // The customer still has to accept it there; nothing is charged or invoiced here.
 async function proposeExtra(item:AllowanceItem,resume=false){
  if(lock.current)return;
  let attempt=resume?pendingChange.current:null;
  if(!attempt){
   const difference=item.differenceCents??0;if(difference<=0||item.changeId||form||busy)return;
   const answer=await confirm({title:c.extraTitle,description:item.name,detail:c.extraText(money(difference)),confirmLabel:c.extra,cancelLabel:c.back});if(!answer.confirmed)return;
  }
  lock.current=true;setSaving(true);setError('');setNotice('');setExtraNotice(false);
  try{
   if(!attempt){
    const read=await fetch('/api/pro/work-changes?'+new URLSearchParams({workId}),{cache:'no-store',headers:{'X-Pro-Expected-Actor':accountId}});
    if(!read.ok)throw Error('read');
    const page=await read.json() as WorkChangesPage;
    if(page.account?.agreedCents==null||!page.canPropose){setError(c.extraNoAgreement);return;}
    if(page.items.some(row=>row.status==='proposed')){setError(c.extraPending);return;}
    const changeId=crypto.randomUUID(),choice=item.choice?.description??'';
    const proposal=workChangeMutation.parse({action:'propose',id:changeId,actionId:crypto.randomUUID(),workId,baseCents:page.account.agreedCents,reason:c.extraReason(item.name).slice(0,500),lines:[{description:(item.name+': '+choice).slice(0,160),amountCents:item.differenceCents}]});
    attempt={item,body:JSON.stringify(proposal),changeId,linkActionId:crypto.randomUUID()};pendingChange.current=attempt;
   }
   const response=await fetch('/api/pro/work-changes',{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json','X-Pro-Expected-Actor':accountId},body:attempt.body});
   if(response.status>=500||response.status===429){setUncertain(true);setError(c.uncertain);return;}
   if(!response.ok){pendingChange.current=null;setUncertain(false);setError(response.status===409?c.extraConflict:c.extraFailed);return;}
   window.dispatchEvent(new Event(PRO_SERVICE_REFRESH));
   const link={action:'link_change' as const,actionId:attempt.linkActionId,workId,id:attempt.item.id,revision:attempt.item.revision,changeId:attempt.changeId};
   const linked=await fetch(api,{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json','X-Pro-Expected-Actor':accountId},body:JSON.stringify(link)});
   if(linked.status>=500||linked.status===429){setUncertain(true);setError(c.uncertain);return;}
   pendingChange.current=null;setUncertain(false);
   if(!linked.ok){setConflict(linked.status===409);setError(linked.status===409?c.conflict:c.failed);return;}
   if(active.current){setNotice(c.extraDone);setExtraNotice(true);}
   lock.current=false;await load();
  }catch{if(pendingChange.current){setUncertain(true);setError(c.uncertain);}else setError(c.extraFailed);}
  finally{lock.current=false;if(active.current)setSaving(false);}
 }
 function retrySame(){if(pendingChange.current)void proposeExtra(pendingChange.current.item,true);else if(pending.current)void send(pending.current.input,pending.current.notice);}

 if(loading&&!detail)return <p role="status" className="text-sm text-[#52627a]">{c.loading}</p>;
 if(!detail)return <div role="alert" data-allowances-load-error className="space-y-2 rounded-2xl border border-[#d7e1ea] p-4"><p className="text-sm">{c.loadError}</p><Button type="button" variant="secondary" disabled={loading} onClick={()=>void load()}>{c.retry}</Button></div>;
 const visible=detail.items.filter(item=>!item.archived),archived=detail.items.filter(item=>item.archived),t=detail.totals;
 const editingId=form&&form.mode!=='create'?form.item?.id:null;
 return <section data-allowances className="space-y-5">
  {dialogNode}
  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
   <div className="min-w-0"><h3 className="text-lg font-bold text-[#162543]">{c.title}</h3><p className="mt-1 text-sm text-[#52627a]">{c.intro}</p></div>
   <div className="flex shrink-0 flex-wrap gap-2">
    {visible.length>0&&<a data-allowances-print href={'/api/pro/allowances-print?'+new URLSearchParams({workId,lang:en?'en':'es'})} target="_blank" rel="noopener" className="inline-flex min-h-11 items-center rounded-xl border border-[#d7e1ea] bg-white px-4 text-sm font-semibold text-[#162543] hover:border-[#008bb5]">{en?'Print allowances':'Imprimir montos previstos'}</a>}{visible.some(i=>i.status==='decided')&&<a data-allowances-reconciliation-print href={'/api/pro/allowances-print?'+new URLSearchParams({workId,lang:en?'en':'es',kind:'reconciliation'})} target="_blank" rel="noopener" className="inline-flex min-h-11 items-center rounded-xl border border-[#d7e1ea] bg-white px-4 text-sm font-semibold text-[#162543] hover:border-[#008bb5]">{en?'Reconciliation (PDF)':'Conciliación (PDF)'}</a>}
    <Button type="button" className="min-h-11 shrink-0" disabled={busy||conflict||!!form} onClick={()=>open({mode:'create',item:null,draft:emptyDetails,initial:emptyDetails})}>{c.add}</Button>
   </div>
  </div>
  <dl data-allowance-totals className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
   <Stat label={c.planned} value={money(t.plannedCents)} id="planned"/>
   <Stat label={c.actual} value={money(t.actualCents)} id="actual"/>
   <Stat label={c.difference} value={signed(t.differenceCents)} id="difference" tone={t.differenceCents>0?'over':t.differenceCents<0?'under':undefined}/>
   <Stat label={c.pending} value={String(t.pendingCount)} id="pending"/>
   <Stat label={c.overdue} value={String(t.overdueCount)} id="overdue" tone={t.overdueCount>0?'over':undefined} wide/>
  </dl>
  {t.count>0&&<p data-allowance-projected className="text-sm text-[#52627a]">{c.projected(money(t.projectedCents))}</p>}
  {(detail.commitmentTotals.committedCents>0||detail.commitmentTotals.draftCents>0)&&<p data-allowance-commitment-totals className="break-words text-sm text-[#52627a]">{c.commitTotals(money(detail.commitmentTotals.committedCents),money(detail.commitmentTotals.draftCents),money(detail.commitmentTotals.receivedCents))}</p>}
  {notice&&<div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#eef8f4] p-3 text-sm text-[#18573a]"><p>{notice}</p>{extraNotice&&onOpenChanges&&<Button type="button" variant="secondary" onClick={onOpenChanges}>{c.openChanges}</Button>}</div>}
  {loadError&&<div role="alert" className="space-y-2 text-sm"><p>{c.loadError}</p><Button type="button" variant="secondary" disabled={loading||saving} onClick={()=>void load()}>{c.retry}</Button></div>}
  {error&&<div role="alert" data-allowance-error className="space-y-2 rounded-xl bg-[#fff4f2] p-3 text-sm text-[#8a2a1b]"><p>{error}</p>
   {uncertain&&<Button type="button" variant="secondary" disabled={saving} onClick={retrySame}>{c.retrySame}</Button>}
   {conflict&&<Button type="button" variant="secondary" disabled={loading||saving} onClick={()=>{setForm(null);setError('');void load();}}>{c.reload}</Button>}</div>}
  {form?.mode==='create'&&<DetailsForm c={c} form={form} busy={busy||conflict} saving={saving} onChange={draft=>setForm({...form,draft})} onSubmit={submit} onCancel={cancel}/>}
  {!visible.length&&!form&&<div data-allowances-empty className="rounded-2xl border border-dashed border-[#d7e1ea] bg-[#f7f9fc] p-5 text-center"><p className="font-semibold text-[#162543]">{c.empty}</p><p className="mt-1 text-sm text-[#52627a]">{c.emptyHelp}</p></div>}
  {!!visible.length&&<ul className="space-y-3">{visible.map(item=><li key={item.id}>
   {editingId===item.id&&form?.mode==='edit'?<DetailsForm c={c} form={form} busy={busy||conflict} saving={saving} onChange={draft=>setForm({...form,draft})} onSubmit={submit} onCancel={cancel}/>:
    <ItemCard c={c} en={en} item={item} commitment={detail.commitments[item.id]} changeStatus={item.changeId?detail.changeStatuses[item.changeId]??null:null} disabled={busy||conflict||!!form} canOpenChanges={!!onOpenChanges} onOpenChanges={onOpenChanges}
     onEdit={()=>open({mode:'edit',item,draft:detailsOf(item),initial:detailsOf(item)})}
     onDecide={()=>{const initial={description:'',supplier:'',quantity:'1',actual:''};open({mode:'decide',item,draft:initial,initial});}}
     onReopen={()=>void act(item,'reopen')} onArchive={()=>void act(item,'archive')} onExtra={()=>void proposeExtra(item)} surcharge={item.status==='decided'&&(item.differenceCents??0)>0?<AllowanceSurcharge accountId={accountId} workId={workId} item={item} disabled={busy||conflict||!!form}/>:null}
     decide={editingId===item.id&&form?.mode==='decide'?<ChoiceForm c={c} item={item} draft={form.draft} busy={busy||conflict} saving={saving} onChange={draft=>setForm({...form,draft})} onSubmit={submit} onCancel={cancel}/>:null}/>}
  </li>)}</ul>}
  {!!archived.length&&<div className="space-y-2">
   <Button type="button" variant="secondary" aria-expanded={showArchived} onClick={()=>setShowArchived(value=>!value)}>{showArchived?c.hideArchived:c.showArchived(archived.length)}</Button>
   {showArchived&&<ul data-allowances-archived className="space-y-2">{archived.map(item=><li key={item.id} data-allowance-item={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#d7e1ea] bg-[#f7f9fc] p-3 text-sm">
    <span className="min-w-0 break-words"><strong className="text-[#162543]">{item.name}</strong> · {money(item.plannedCents)} · <span className="text-[#52627a]">{c.archived}</span></span>
    <Button type="button" variant="secondary" disabled={busy||conflict||!!form} onClick={()=>void act(item,'restore')}>{c.restore}</Button>
   </li>)}</ul>}
  </div>}
  <details data-allowance-history className="rounded-xl border border-[#d7e1ea] p-3">
   <summary className="min-h-11 cursor-pointer content-center font-semibold text-[#162543]">{c.history}</summary>
   {detail.history.length?<ol className="mt-2 space-y-2">{detail.history.map(entry=><li key={entry.actionId} className="rounded-xl border border-[#e5e7eb] p-3 text-sm">
    <p className="text-xs text-[#68778d]">{stamp(entry.at,en)}</p>
    <p className="mt-1 break-words"><strong>{c.actions[entry.action]}</strong> · {entry.after.name}{entry.action==='decide'&&entry.after.choice?` · ${entry.after.choice.description} · ${money(entry.after.choice.actualCents)}`:''}</p>
    {entry.action==='reopen'&&entry.before?.choice&&<p className="mt-1 break-words text-[#52627a]">{c.previous(`${entry.before.choice.description} · ${money(entry.before.choice.actualCents)}`)}</p>}
   </li>)}</ol>:<p className="mt-2 text-sm text-[#52627a]">{c.historyEmpty}</p>}
  </details>
 </section>;
}

function Stat({label,value,id,tone,wide}:{label:string;value:string;id:string;tone?:'over'|'under';wide?:boolean}){
 return <div data-allowance-total={id} className={`min-w-0 rounded-xl border border-[#d7e1ea] bg-[#f7f9fc] p-3 ${wide?'col-span-2 sm:col-span-1':''}`}>
  <dt className="text-xs font-semibold text-[#52627a]">{label}</dt>
  <dd className={`mt-1 whitespace-nowrap text-base font-bold tabular-nums ${tone==='over'?'text-[#a03c1f]':tone==='under'?'text-[#18573a]':'text-[#162543]'}`}>{value}</dd>
 </div>;
}

function StatusBadge({item,c}:{item:AllowanceItem;c:Copy}){
 const tone=item.status==='decided'?'bg-[#eef8f4] text-[#18573a]':item.status==='reopened'?'bg-[#fff6e5] text-[#7a4b00]':'bg-[#eaf5fb] text-[#006e90]';
 return <span data-allowance-status={item.status} className={`rounded-full px-2.5 py-1 text-xs font-semibold ${tone}`}>{c[item.status]}</span>;
}

function ItemCard({surcharge,commitment,c,en,item,changeStatus,disabled,decide,canOpenChanges,onOpenChanges,onEdit,onDecide,onReopen,onArchive,onExtra}:{surcharge?:ReactNode;commitment?:AllowanceCommitment;c:Copy;en:boolean;item:AllowanceItem;changeStatus:AllowanceChangeStatus|null;disabled:boolean;decide:ReactNode;canOpenChanges:boolean;onOpenChanges?:()=>void;onEdit:()=>void;onDecide:()=>void;onReopen:()=>void;onArchive:()=>void;onExtra:()=>void}){
 const decided=item.status==='decided'&&item.choice,diff=item.differenceCents??0;
 return <article data-allowance-item={item.id} className="space-y-3 rounded-2xl border border-[#d7e1ea] bg-white p-4">
  <div className="flex flex-wrap items-start justify-between gap-2">
   <div className="min-w-0"><h4 className="break-words font-bold text-[#162543]">{item.name}</h4>{item.category&&<p className="text-sm text-[#52627a]">{item.category}</p>}</div>
   <div className="flex flex-wrap gap-1.5"><StatusBadge item={item} c={c}/>{item.overdue&&<span data-allowance-overdue className="rounded-full bg-[#fff4f2] px-2.5 py-1 text-xs font-semibold text-[#8a2a1b]">{c.pastDue}</span>}</div>
  </div>
  <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
   <div><dt className="text-[#52627a]">{c.plannedLabel}</dt><dd className="font-semibold">{money(item.plannedCents)}</dd></div>
   {decided&&<div><dt className="text-[#52627a]">{c.actualLabel}</dt><dd className="font-semibold">{money(item.choice!.actualCents)}</dd></div>}
   {!decided&&<div><dt className="text-[#52627a]">{c.dueLabel}</dt><dd>{item.dueDate?c.dueOn(day(item.dueDate,en)):c.noDue}</dd></div>}
  </dl>
  {decided&&<div className="space-y-1 rounded-xl bg-[#f7f9fc] p-3 text-sm">
   <p className="break-words"><span className="text-[#52627a]">{c.chosen}: </span><strong>{item.choice!.description}</strong>{item.choice!.supplier?` · ${item.choice!.supplier}`:''}</p>
   <p className="text-[#52627a]">{c.qty(quantityText(item.choice!.quantity,en))}</p>
   <p data-allowance-variance={item.variance} className={`font-semibold ${item.variance==='over'?'text-[#a03c1f]':item.variance==='under'?'text-[#18573a]':'text-[#162543]'}`}>{item.variance==='over'?c.over(signed(diff)):item.variance==='under'?c.under(signed(diff)):c.equal}</p>
   {item.changeId&&<p data-allowance-linked-change={changeStatus??'unknown'} className={`flex flex-wrap items-center gap-2 ${changeStatus==='declined'||changeStatus==='withdrawn'?'text-[#7a4b00]':changeStatus==='accepted'?'text-[#18573a]':'text-[#006e90]'}`}><span className="min-w-0">{changeStatus?c.extraStatus[changeStatus]:c.extraUnknown}</span>{canOpenChanges&&<button type="button" className="min-h-11 font-semibold underline" onClick={onOpenChanges}>{c.openChanges}</button>}</p>}
  </div>}
  {commitment&&<Commitment c={c} item={item} commitment={commitment}/>}
  {item.notes&&<p className="whitespace-pre-wrap break-words text-sm text-[#52627a]"><span className="font-semibold">{c.notesLabel}: </span>{item.notes}</p>}
  {decide}
  {!decide&&surcharge}
  {!decide&&<div className="flex flex-wrap gap-2">
   {item.status!=='decided'&&<><Button type="button" disabled={disabled} onClick={onDecide}>{c.decide}</Button><Button type="button" variant="secondary" disabled={disabled} onClick={onEdit}>{c.edit}</Button></>}
   {item.status==='decided'&&<Button type="button" variant="secondary" disabled={disabled} onClick={onReopen}>{c.reopen}</Button>}
   {item.status==='decided'&&diff>0&&!item.changeId&&<Button type="button" variant="secondary" disabled={disabled} onClick={onExtra}>{c.extra}</Button>}
   <Button type="button" variant="ghost" disabled={disabled} onClick={onArchive}>{c.archive}</Button>
  </div>}
 </article>;
}

/** Row 75: purchase-order lines linked to this allowance (migration 562). Read only; the orders are edited in Purchase orders. */
function Commitment({c,item,commitment}:{c:Copy;item:AllowanceItem;commitment:AllowanceCommitment}){
 const state=allowanceCommitmentState(item,commitment);
 return <div data-allowance-commitment={state?.state??'none'} className="space-y-1 rounded-xl border border-[#e3eaf0] p-3 text-sm">
  <p className="font-semibold text-[#162543]">{c.commitTitle}</p>
  {commitment.committedCents>0&&<p data-allowance-committed>{c.committed(money(commitment.committedCents))}</p>}
  {commitment.draftCents>0&&<p data-allowance-draft-orders className="text-[#52627a]">{c.draftOrders(money(commitment.draftCents))}</p>}
  {commitment.committedCents>0&&<p data-allowance-received className="text-[#52627a]">{c.received(money(commitment.receivedCents))}</p>}
  {state&&<p data-allowance-commitment-state={state.state} className={`font-semibold ${state.state==='over'?'text-[#a03c1f]':'text-[#18573a]'}`}>{state.state==='over'?c.commitOver(money(-state.remainingCents),money(state.reference)):c.commitRemaining(money(state.remainingCents),money(state.reference))}</p>}
  <ul className="flex flex-wrap gap-1.5">{commitment.orders.map(order=><li key={order.id} data-allowance-order={order.status} className="rounded-full bg-[#f2f5f8] px-2.5 py-1 text-xs font-semibold text-[#334155]">{c.orderCode(order.number)} · {c.orderStatus[order.status]}</li>)}</ul>
 </div>;
}

function DetailsForm({c,form,busy,saving,onChange,onSubmit,onCancel}:{c:Copy;form:Extract<Form,{mode:'create'|'edit'}>;busy:boolean;saving:boolean;onChange:(draft:DetailsDraft)=>void;onSubmit:(event:FormEvent)=>void;onCancel:()=>void}){
 const d=form.draft,set=(next:Partial<DetailsDraft>)=>onChange({...d,...next});
 return <form data-allowance-form={form.mode} onSubmit={onSubmit} className="space-y-3 rounded-2xl border border-[#0089bb] bg-[#f7fbfd] p-4">
  <fieldset disabled={busy} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
   <label className="block text-sm font-semibold sm:col-span-2">{c.name}<input data-allowance-field="name" required maxLength={160} value={d.name} placeholder={c.namePlaceholder} onChange={e=>set({name:e.target.value})} className={field}/></label>
   <label className="block text-sm font-semibold">{c.category}<input data-allowance-field="category" maxLength={80} value={d.category} placeholder={c.categoryPlaceholder} onChange={e=>set({category:e.target.value})} className={field}/></label>
   <label className="block text-sm font-semibold">{c.amount}<input data-allowance-field="planned" required inputMode="decimal" value={d.planned} onChange={e=>set({planned:e.target.value})} className={field}/></label>
   <label className="block text-sm font-semibold">{c.due}<input data-allowance-field="due" type="date" value={d.dueDate} onChange={e=>set({dueDate:e.target.value})} className={field}/></label>
   <label className="block text-sm font-semibold sm:col-span-2">{c.notes}<textarea data-allowance-field="notes" rows={3} maxLength={ALLOWANCE_NOTES_MAX} value={d.notes} onChange={e=>set({notes:e.target.value})} className={field+' py-2'}/><span className="mt-1 block text-xs font-normal text-[#52627a]">{c.notesHelp}</span></label>
  </fieldset>
  <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="secondary" disabled={saving} onClick={onCancel}>{c.cancel}</Button><Button type="submit" disabled={busy}>{saving?c.saving:form.mode==='create'?c.create:c.saveEdit}</Button></div>
 </form>;
}

function ChoiceForm({c,item,draft,busy,saving,onChange,onSubmit,onCancel}:{c:Copy;item:AllowanceItem;draft:ChoiceDraft;busy:boolean;saving:boolean;onChange:(draft:ChoiceDraft)=>void;onSubmit:(event:FormEvent)=>void;onCancel:()=>void}){
 const set=(next:Partial<ChoiceDraft>)=>onChange({...draft,...next}),actual=colonesToCents(draft.actual),diff=actual===null?null:actual-item.plannedCents;
 return <form data-allowance-form="decide" onSubmit={onSubmit} className="space-y-3 rounded-2xl border border-[#0089bb] bg-[#f7fbfd] p-4">
  <fieldset disabled={busy} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
   <div data-allowance-catalog className="sm:col-span-2"><CatalogSelect kind="products" label={c.fromCatalog} value="" disabled={busy}
    onChange={row=>{if(!row)return;const qty=Number(draft.quantity.trim().replace(',','.'));const quantity=Number.isFinite(qty)&&qty>0?qty:1;set({description:row.name.slice(0,300),actual:centsToInput(Math.round(row.price*quantity*100))});}}/>
    <p className="mt-1 text-xs text-[#52627a]">{c.fromCatalogHelp}</p></div>
   <label className="block text-sm font-semibold sm:col-span-2">{c.choice}<input data-allowance-field="choice" required maxLength={300} value={draft.description} placeholder={c.choicePlaceholder} onChange={e=>set({description:e.target.value})} className={field}/></label>
   <label className="block text-sm font-semibold sm:col-span-2">{c.supplier}<input data-allowance-field="supplier" maxLength={160} value={draft.supplier} onChange={e=>set({supplier:e.target.value})} className={field}/></label>
   <label className="block text-sm font-semibold">{c.quantity}<input data-allowance-field="quantity" required inputMode="decimal" value={draft.quantity} onChange={e=>set({quantity:e.target.value})} className={field}/></label>
   <label className="block text-sm font-semibold">{c.actualAmount}<input data-allowance-field="actual" required inputMode="decimal" value={draft.actual} onChange={e=>set({actual:e.target.value})} className={field}/></label>
  </fieldset>
  {diff!==null&&<p data-allowance-preview aria-live="polite" className={`text-sm font-semibold ${diff>0?'text-[#a03c1f]':diff<0?'text-[#18573a]':'text-[#162543]'}`}>{diff>0?c.previewOver(money(diff)):diff<0?c.previewUnder(money(-diff)):c.previewEqual}</p>}
  <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="secondary" disabled={saving} onClick={onCancel}>{c.cancel}</Button><Button type="submit" disabled={busy}>{saving?c.saving:c.saveChoice}</Button></div>
 </form>;
}

/**
 * Customer side. Renders nothing unless the owner turned the section on for a
 * confirmed/completed request. While loading nothing is shown, so a section that
 * is off never flashes into view; a failed read shows an error with a retry.
 */
export function AppointmentAllowances({requestId}:{requestId:string}){
 const {user,loading}=useAuth();if(loading||!user)return null;
 return <ClientAllowancesSession key={user.id+':'+requestId} accountId={user.id} requestId={requestId}/>;
}

function ClientAllowancesSession({accountId,requestId}:{accountId:string;requestId:string}){
 const en=useLocale()==='en',c=copy(en);
 const [view,setView]=useState<ClientAllowances|null>(null),[error,setError]=useState(false),[loading,setLoading]=useState(true),active=useRef(true),sequence=useRef(0);
 // 404 means the request is not available to this account: same as a section that is off.
 // Any other failure is shown with a retry instead of silently hiding the section.
 const load=useCallback(async()=>{const id=++sequence.current;setLoading(true);setError(false);try{const response=await fetch(api+'?'+new URLSearchParams({requestId}),{cache:'no-store',headers:{'X-Pro-Expected-Actor':accountId}});if(response.status===404){if(active.current&&id===sequence.current)setView({visible:false});return;}if(!response.ok)throw Error();const body=clientAllowancesSchema.parse(await response.json());if(active.current&&id===sequence.current)setView(body);}catch{if(active.current&&id===sequence.current)setError(true);}finally{if(active.current&&id===sequence.current)setLoading(false);}},[accountId,requestId]);
 const invalidate=useCallback(()=>{sequence.current++;},[]);
 useEffect(()=>{active.current=true;const timer=setTimeout(()=>void load(),0);return()=>{active.current=false;invalidate();clearTimeout(timer);};},[load,invalidate]);
 if(error)return <div role="alert" data-client-allowances-error className="space-y-2 rounded-2xl border border-[#d7e1ea] p-4"><p className="text-sm">{c.clientLoadError}</p><Button type="button" variant="secondary" disabled={loading} onClick={()=>void load()}>{c.retry}</Button></div>;
 if(!view||!view.visible)return null;
 const t=view.totals;
 return <section data-client-allowances aria-label={c.title} className="space-y-3 rounded-2xl border border-[#d7e1ea] bg-white p-4">
  <h3 className="font-bold text-[#162543]">{c.title}</h3>
  <dl className="grid grid-cols-2 gap-2">
   <Stat label={c.planned} value={money(t.plannedCents)} id="planned"/>
   <Stat label={c.actual} value={money(t.actualCents)} id="actual"/>
   <Stat label={c.difference} value={signed(t.differenceCents)} id="difference" tone={t.differenceCents>0?'over':t.differenceCents<0?'under':undefined}/>
   <Stat label={c.pending} value={String(t.pendingCount)} id="pending"/>
  </dl>
  {view.items.length?<ul className="space-y-2">{view.items.map(item=><li key={item.id} data-client-allowance={item.id} className="space-y-1 rounded-xl border border-[#e5e7eb] p-3 text-sm">
   <div className="flex flex-wrap items-start justify-between gap-2"><p className="min-w-0 break-words font-semibold text-[#162543]">{item.name}{item.category?<span className="font-normal text-[#52627a]"> · {item.category}</span>:null}</p>
    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${item.status==='decided'?'bg-[#eef8f4] text-[#18573a]':'bg-[#eaf5fb] text-[#006e90]'}`}>{c[item.status]}</span></div>
   <p><span className="text-[#52627a]">{c.plannedLabel}: </span>{money(item.plannedCents)}{item.status!=='decided'&&item.dueDate?<span className="text-[#52627a]"> · {c.dueOn(day(item.dueDate,en))}</span>:null}</p>
   {item.choice&&<><p className="break-words"><span className="text-[#52627a]">{c.chosen}: </span>{item.choice.description}{item.choice.supplier?` · ${item.choice.supplier}`:''} · {c.qty(quantityText(item.choice.quantity,en))}</p>
    <p><span className="text-[#52627a]">{c.actualLabel}: </span>{money(item.choice.actualCents)} · <span className={`font-semibold ${item.variance==='over'?'text-[#a03c1f]':item.variance==='under'?'text-[#18573a]':''}`}>{item.variance==='over'?c.over(signed(item.differenceCents??0)):item.variance==='under'?c.under(signed(item.differenceCents??0)):c.equal}</span></p></>}
  </li>)}</ul>:<p className="text-sm text-[#52627a]">{c.empty}</p>}
 </section>;
}
