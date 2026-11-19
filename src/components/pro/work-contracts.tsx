'use client';

import {crWallStamp} from '@/lib/pro/cr-stamp';
import {useCallback,useEffect,useId,useLayoutEffect,useRef,useState} from 'react';
import {useLocale} from 'next-intl';
import {useAuth} from '@/hooks/use-auth';
import {useAppDialog} from '@/hooks/use-app-dialog';
import {Button} from '@/components/ui/button';
import {
 CONTRACT_REASON_MAX,CONTRACT_TITLE_MAX,contractDetailSchema,contractFieldHelp,contractFieldLabels,contractLibrarySchema,contractListSchema,contractMoney,contractResultSchema,shortHash,
 type ContractDetail,type ContractList,type ContractMutation,type ContractStatus,type ContractSummary,type LibraryClause,
} from '@/lib/pro/contracts';
import {useProChildGuard} from './use-pro-child-guard';
import {useProSearchParams} from './use-pro-search-params';
import {replaceProParams} from '@/lib/pro/navigation';
import {contractStarterKeys} from '@/lib/pro/contracts';
import {EsignRequests} from './esign-requests';
import {ClauseListEditor,ContractText,card,contractsApi,field,label,postContract,type ContractState} from './contract-clauses';

type StateCallback={onStateChange?:(state:ContractState)=>void;onOpenClientView?:()=>void};
const stamp=(value:string,en:boolean)=>new Intl.DateTimeFormat(en?'en-US':'es-CR',{dateStyle:'medium',timeStyle:'short',timeZone:'America/Costa_Rica'}).format(new Date(value));
const statusTone:Record<ContractStatus,string>={draft:'bg-[#eef2f6] text-[#52627a]',shared:'bg-[#e6f6fb] text-[#00698c]',accepted:'bg-emerald-50 text-emerald-800',declined:'bg-amber-50 text-amber-900',voided:'bg-red-50 text-red-800'};

function copy(en:boolean){
 return en?{
  title:'Contracts',intro:'Prepare the agreement for this project from a template or from scratch, link it to its quote and share it with your customer to accept in My projects.',
  legal:'Acceptance here is an authenticated record (signed-in account, typed name, date and the exact version). It is not a certified digital signature. Review your contracts with a lawyer.',
  newContract:'New contract',loading:'Loading contracts…',loadError:'Could not load the contracts.',retry:'Retry',empty:'There are no contracts for this project yet.',
  status:{draft:'Draft',shared:'Shared',accepted:'Accepted',declined:'Declined',voided:'Voided'} as Record<ContractStatus,string>,
  hidden:'Your customer will not see contracts until you turn on the Contracts section in the customer view.',openClientView:'Open customer view',visible:'The Contracts section is on in the customer view.',
  noRecipient:'There is no confirmed customer with an account linked to this job yet. You can prepare the contract, but you can share it only after one is linked.',recipient:(n:string)=>`Linked customer: ${n}`,
  createTitle:'New contract',template:'Template',blank:'Blank contract',contractTitle:'Contract title',titleHelp:'If you leave it empty, the template title is used.',language:'Contract language',es:'Spanish',en:'English',
  estimate:'Quote',noEstimate:'No quote',estimateHelp:'Link an accepted, shared (awaiting a reply) or draft quote of this project. Its data fills the merge fields.',deposit:'Deposit (%)',depositHelp:'Optional. Used by the deposit fields.',
  create:'Create contract',creating:'Creating…',cancel:'Cancel',open:'Open',back:'All contracts',clauses:(n:number)=>n===1?'1 clause':`${n} clauses`,
  estimateStatus:{accepted:'accepted',draft:'draft',shared:'shared, awaiting a reply',other:'not linkable'},starters:'ContrataCR starter templates',starterNames:{renovation:'Renovation (deposit and stages)',service:'One-off service',maintenance:'Maintenance'},starterHelp:'The starter is saved in your templates, where you can edit it. Its title and deposit are used.',accountTemplates:'Your templates',details:'Contract details',saveDetails:'Save details',saving:'Saving…',discard:'Discard changes',saved:'Saved.',
  preview:'Preview with data',hidePreview:'Hide preview',missing:'Fields without data',missingHelp:'Fill them in before sharing. Each one shows where to complete it.',noMissing:'Every field used has data.',
  share:'Share with customer',shareTitle:'Share this contract?',shareBody:'The text is fixed as version {v} with a fingerprint. Nothing is sent: your customer sees it in My projects when the Contracts section is on. To change it later you must return it to draft and share again.',
  shareBlockedMissing:'Complete the fields without data before sharing.',shareBlockedClauses:'Add at least one clause before sharing.',shareBlockedRecipient:'Link a customer with an account before sharing.',
  withdraw:'Return to draft',withdrawTitle:'Return to draft?',withdrawBody:'Your customer will stop seeing this version until you share it again.',
  voidAction:'Void contract',voidTitle:'Void this contract?',voidBody:'The number is kept and the history stays. This cannot be undone.',voidReason:'Reason for voiding',voidRequired:'Write the reason.',
  print:'Print or PDF',versions:'Shared versions',version:(n:number)=>`Version ${n}`,fingerprint:'Fingerprint',sharedOn:'Shared',
  acceptedBy:(n:string,at:string)=>`Accepted by ${n} on ${at} (Costa Rica time)`,declinedBy:(at:string)=>`Declined on ${at} (Costa Rica time)`,reason:'Reason',voided:'Voided',
  history:'History',actions:{contract_create:'Created',contract_update:'Details changed',clause_put:'Clause saved',clause_remove:'Clause removed',clause_move:'Clause moved',clause_insert_library:'Clause added from library',share:'Shared',withdraw:'Returned to draft',void:'Voided',accept:'Accepted by the customer',decline:'Declined by the customer'} as Record<string,string>,
  conflict:'The contract changed in another window. It was reloaded; review it and try again.',uncertain:'We could not confirm the operation. Retry the same operation; it will not be applied twice.',retrySame:'Retry the same operation',failed:'Could not complete the operation.',rejected:'Review the contract information and try again.',tooLarge:'The contract is too large to save in one step. Shorten or split its clauses.',forbidden:'You no longer have access to this contract.',
  leave:'Save or discard the contract changes before leaving.',removeClause:'Remove this clause?',removeBody:'It is removed only from this contract.',remove:'Remove',titleRequired:'Write the contract title.',depositInvalid:'Use a percentage between 0.01 and 100 with up to two decimals.',
  readOnly:'Only drafts can be edited. Return it to draft to change the text.',
 }:{
  title:'Contratos',intro:'Prepare el acuerdo de este proyecto desde una plantilla o desde cero, vincúlelo a su cotización y compártalo para que su cliente lo acepte en Mis proyectos.',
  legal:'La aceptación aquí es una constancia autenticada (cuenta con sesión iniciada, nombre escrito, fecha y la versión exacta). No es una firma digital certificada. Revise sus contratos con un abogado.',
  newContract:'Nuevo contrato',loading:'Cargando contratos…',loadError:'No se pudieron cargar los contratos.',retry:'Reintentar',empty:'Todavía no hay contratos en este proyecto.',
  status:{draft:'Borrador',shared:'Compartido',accepted:'Aceptado',declined:'Rechazado',voided:'Anulado'} as Record<ContractStatus,string>,
  hidden:'Su cliente no verá los contratos hasta que active la sección Contratos en la vista del cliente.',openClientView:'Abrir vista del cliente',visible:'La sección Contratos está activa en la vista del cliente.',
  noRecipient:'Todavía no hay un cliente confirmado con cuenta vinculado a este trabajo. Puede preparar el contrato, pero solo podrá compartirlo cuando haya uno vinculado.',recipient:(n:string)=>`Cliente vinculado: ${n}`,
  createTitle:'Nuevo contrato',template:'Plantilla',blank:'Contrato en blanco',contractTitle:'Título del contrato',titleHelp:'Si lo deja vacío, se usa el título de la plantilla.',language:'Idioma del contrato',es:'Español',en:'Inglés',
  estimate:'Cotización',noEstimate:'Sin cotización',estimateHelp:'Vincule una cotización aceptada, compartida (esperando respuesta) o en borrador de este proyecto. Sus datos llenan los campos combinables.',deposit:'Anticipo (%)',depositHelp:'Opcional. Lo usan los campos de anticipo.',
  create:'Crear contrato',creating:'Creando…',cancel:'Cancelar',open:'Abrir',back:'Todos los contratos',clauses:(n:number)=>n===1?'1 cláusula':`${n} cláusulas`,
  estimateStatus:{accepted:'aceptada',draft:'borrador',shared:'compartida, esperando respuesta',other:'no vinculable'},starters:'Plantillas iniciales de ContrataCR',starterNames:{renovation:'Remodelación (anticipo y etapas)',service:'Servicio puntual',maintenance:'Mantenimiento'},starterHelp:'La plantilla inicial se guarda en sus plantillas, donde puede editarla. Se usan su título y su anticipo.',accountTemplates:'Sus plantillas',details:'Datos del contrato',saveDetails:'Guardar datos',saving:'Guardando…',discard:'Descartar cambios',saved:'Guardado.',
  preview:'Vista previa con datos',hidePreview:'Ocultar vista previa',missing:'Campos sin dato',missingHelp:'Complételos antes de compartir. Cada uno indica dónde completarlo.',noMissing:'Todos los campos usados tienen dato.',
  share:'Compartir con el cliente',shareTitle:'¿Compartir este contrato?',shareBody:'El texto queda fijo como versión {v} con una huella. No se envía nada: su cliente lo ve en Mis proyectos cuando la sección Contratos está activa. Para cambiarlo después deberá devolverlo a borrador y volver a compartirlo.',
  shareBlockedMissing:'Complete los campos sin dato antes de compartir.',shareBlockedClauses:'Agregue al menos una cláusula antes de compartir.',shareBlockedRecipient:'Vincule un cliente con cuenta antes de compartir.',
  withdraw:'Volver a borrador',withdrawTitle:'¿Volver a borrador?',withdrawBody:'Su cliente dejará de ver esta versión hasta que la vuelva a compartir.',
  voidAction:'Anular contrato',voidTitle:'¿Anular este contrato?',voidBody:'Se conserva el número y el historial. No se puede deshacer.',voidReason:'Motivo de la anulación',voidRequired:'Escriba el motivo.',
  print:'Imprimir o PDF',versions:'Versiones compartidas',version:(n:number)=>`Versión ${n}`,fingerprint:'Huella',sharedOn:'Compartida',
  acceptedBy:(n:string,at:string)=>`Aceptado por ${n} el ${at} (hora de Costa Rica)`,declinedBy:(at:string)=>`Rechazado el ${at} (hora de Costa Rica)`,reason:'Motivo',voided:'Anulado',
  history:'Historial',actions:{contract_create:'Creado',contract_update:'Datos modificados',clause_put:'Cláusula guardada',clause_remove:'Cláusula quitada',clause_move:'Cláusula movida',clause_insert_library:'Cláusula agregada desde la biblioteca',share:'Compartido',withdraw:'Devuelto a borrador',void:'Anulado',accept:'Aceptado por el cliente',decline:'Rechazado por el cliente'} as Record<string,string>,
  conflict:'El contrato cambió en otra ventana. Se recargó; revíselo e intente de nuevo.',uncertain:'No pudimos confirmar la operación. Reintente la misma operación; no se aplicará dos veces.',retrySame:'Reintentar la misma operación',failed:'No se pudo completar la operación.',rejected:'Revise los datos del contrato y vuelva a intentarlo.',tooLarge:'El contrato es demasiado grande para guardarlo de una vez. Acorte o divida sus cláusulas.',forbidden:'Ya no tiene acceso a este contrato.',
  leave:'Guarde o descarte los cambios del contrato antes de salir.',removeClause:'¿Quitar esta cláusula?',removeBody:'Se quita solo de este contrato.',remove:'Quitar',titleRequired:'Escriba el título del contrato.',depositInvalid:'Use un porcentaje entre 0,01 y 100 con hasta dos decimales.',
  readOnly:'Solo los borradores se pueden editar. Devuélvalo a borrador para cambiar el texto.',
 };
}
/** Accepts "12,5" or "12.5"; '' → null; undefined when invalid. */
function parsePercent(value:string):number|null|undefined{
 const text=value.trim().replace(',','.');if(!text)return null;if(!/^\d{1,3}(\.\d{1,2})?$/.test(text))return undefined;
 const n=Number(text);return n>0&&n<=100?n:undefined;
}
const percentText=(value:number|null,en:boolean)=>value===null?'':en?String(value):String(value).replace('.',',');

export function StatusBadge({status,en}:{status:ContractStatus;en:boolean}){return <span data-contract-status={status} className={'inline-flex min-h-7 items-center rounded-full px-3 text-xs font-bold '+statusTone[status]}>{copy(en).status[status]}</span>;}

/** Planning › Contracts inside the job workspace (independent Pro space only). */
export function WorkContracts({workId,onStateChange,onOpenClientView}:{workId:string}&StateCallback){
 const {user,loading}=useAuth();if(loading||!user)return null;
 return <ContractsSession key={user.id+':'+workId} accountId={user.id} workId={workId} onStateChange={onStateChange} onOpenClientView={onOpenClientView}/>;
}

function ContractsSession({accountId,workId,onStateChange,onOpenClientView}:{accountId:string;workId:string}&StateCallback){
 const en=useLocale()==='en',c=copy(en),{confirm,dialogNode}=useAppDialog();
 const params=useProSearchParams(),fromQuote=params.get('contratoCotizacion');
 const [list,setList]=useState<ContractList|null>(null),[loadError,setLoadError]=useState(false),[selected,setSelected]=useState<string|null>(null),[creating,setCreating]=useState(()=>!!fromQuote);
 const endCreate=()=>{setCreating(false);if(fromQuote)replaceProParams({contratoCotizacion:null});};
 const [createState,setCreateState]=useState<ContractState>({dirty:false,busy:false}),[detailState,setDetailState]=useState<ContractState>({dirty:false,busy:false});
 const [guardError,setGuardError]=useState('');
 const sequence=useRef(0),active=useRef(true);
 const dirty=createState.dirty||detailState.dirty,busy=createState.busy||detailState.busy;
 useProChildGuard(!onStateChange&&(dirty||busy),useCallback(()=>setGuardError(c.leave),[c.leave]));
 useLayoutEffect(()=>{onStateChange?.({dirty,busy});return()=>onStateChange?.({dirty:false,busy:false});},[dirty,busy,onStateChange]);
 const load=useCallback(async()=>{
  const id=++sequence.current;setLoadError(false);
  try{
   const response=await fetch(contractsApi+'?'+new URLSearchParams({workId}),{cache:'no-store',headers:{'X-Pro-Expected-Actor':accountId}});if(!response.ok)throw Error();
   const body=contractListSchema.parse(await response.json());if(body.workId!==workId)throw Error();
   if(active.current&&id===sequence.current)setList(body);
  }catch{if(active.current&&id===sequence.current)setLoadError(true);}
 },[accountId,workId]);
 useEffect(()=>{active.current=true;const timer=setTimeout(()=>void load(),0),counter=sequence,alive=active;return()=>{alive.current=false;counter.current++;clearTimeout(timer);};},[load]);

 if(loadError&&!list)return <section data-contracts-load-error className={card} role="alert"><p className="text-sm text-red-700">{c.loadError}</p><Button type="button" variant="secondary" className="min-h-11" onClick={()=>{setLoadError(false);void load();}}>{c.retry}</Button></section>;
 if(!list)return <p role="status" aria-busy="true" className="text-sm text-[#52627a]">{c.loading}</p>;
 const blocked=dirty||busy;
 return <section data-work-contracts aria-labelledby="work-contracts-title" className="min-w-0 space-y-4">
  {dialogNode}
  <div className={card}>
   <h2 id="work-contracts-title" className="text-lg font-bold text-[#162543]">{c.title}</h2>
   <p className="text-sm text-[#52627a]">{c.intro}</p>
   <p data-contracts-legal className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{c.legal}</p>
   <div data-contracts-client-visibility className="flex flex-wrap items-center gap-2 text-sm text-[#52627a]">
    <span>{list.clientVisible?c.visible:c.hidden}</span>
    {!list.clientVisible&&onOpenClientView&&<Button type="button" variant="secondary" className="min-h-11" disabled={blocked} onClick={onOpenClientView}>{c.openClientView}</Button>}
   </div>
   <p className="text-sm text-[#52627a]">{list.recipientName?c.recipient(list.recipientName):c.noRecipient}</p>
  </div>
  {guardError&&<p role="alert" className="text-sm text-red-700">{guardError}</p>}
  {selected
   ?<ContractEditor key={selected} accountId={accountId} workId={workId} contractId={selected} list={list} confirm={confirm} onBack={()=>{setSelected(null);setGuardError('');void load();}} onStateChange={setDetailState} onChanged={()=>void load()}/>
   :creating
    ?<CreateContract accountId={accountId} workId={workId} list={list} initialEstimate={fromQuote} onCancel={endCreate} onStateChange={setCreateState} onCreated={id=>{endCreate();setSelected(id);void load();}}/>
    :<div className="space-y-3">
      <Button type="button" className="min-h-11" onClick={()=>setCreating(true)}>{c.newContract}</Button>
      {list.items.length?<ul data-contracts-list className="grid min-w-0 gap-3 md:grid-cols-2">{list.items.map(item=><ContractCard key={item.id} item={item} en={en} onOpen={()=>setSelected(item.id)}/>)}</ul>
       :<p data-contracts-empty className="rounded-xl border border-dashed border-[#d7e1ea] p-4 text-sm text-[#52627a]">{c.empty}</p>}
     </div>}
 </section>;
}

function ContractCard({item,en,onOpen}:{item:ContractSummary;en:boolean;onOpen:()=>void}){
 const c=copy(en);
 return <li data-contract-card={item.code} className={card}>
  <div className="flex min-w-0 flex-wrap items-center justify-between gap-2"><span className="font-bold text-[#008bb5]">{item.code}</span><StatusBadge status={item.status} en={en}/></div>
  <p className="break-words font-semibold text-[#162543]">{item.title}</p>
  <p className="text-sm text-[#52627a]">{c.clauses(item.clauseCount)} · {stamp(item.updatedAt,en)}</p>
  {item.response?.action==='accept'&&<p className="text-sm text-emerald-800">{c.acceptedBy(item.response.typedName??'',crWallStamp(item.response.atCostaRica,en))}</p>}
  <Button type="button" variant="secondary" className="min-h-11" onClick={onOpen}>{c.open}</Button>
 </li>;
}

function EstimateOptions({list,en}:{list:ContractList;en:boolean}){
 const c=copy(en);
 return <>{list.estimates.map(e=><option key={e.id} value={e.id}>{e.code} · {e.title} · {contractMoney(e.totalCents,e.currency,en)} ({c.estimateStatus[e.status]})</option>)}</>;
}

function CreateContract({accountId,workId,list,initialEstimate,onCancel,onCreated,onStateChange}:{accountId:string;workId:string;list:ContractList;initialEstimate?:string|null;onCancel:()=>void;onCreated:(id:string)=>void;onStateChange:(s:ContractState)=>void}){
 const en=useLocale()==='en',c=copy(en),id=useId();
 // Round 7A: start from the quote it was opened from, else the project's accepted (or only shared) quote.
 const [initial]=useState(()=>list.estimates.find(e=>e.id===initialEstimate)?.id??list.estimates.find(e=>e.status==='accepted')?.id??(list.estimates.filter(e=>e.status==='shared').length===1?list.estimates.find(e=>e.status==='shared')!.id:''));
 const [template,setTemplate]=useState(''),[title,setTitle]=useState(''),[language,setLanguage]=useState<'es'|'en'>(en?'en':'es'),[estimate,setEstimate]=useState(initial),[deposit,setDeposit]=useState('');
 const starter=template.startsWith('starter:')?template.slice(8) as typeof contractStarterKeys[number]:null;
 const [saving,setSaving]=useState(false),[uncertain,setUncertain]=useState(false),[error,setError]=useState('');
 const pending=useRef<ContractMutation|null>(null),lock=useRef(false);
 const dirty=!!(template||title||deposit)||estimate!==initial||language!==(en?'en':'es');
 useLayoutEffect(()=>{onStateChange({dirty,busy:saving||uncertain});},[dirty,saving,uncertain,onStateChange]);
 useEffect(()=>()=>onStateChange({dirty:false,busy:false}),[onStateChange]);
 async function run(input:ContractMutation){
  if(lock.current)return;lock.current=true;pending.current=input;setSaving(true);setError('');
  try{
   const outcome=await postContract(accountId,input);
   if(outcome.kind==='uncertain'){setUncertain(true);setError(c.uncertain);return;}
   pending.current=null;setUncertain(false);
   if(outcome.kind!=='ok'){setError(outcome.kind==='conflict'?c.conflict:outcome.status===413?c.tooLarge:outcome.status===403?c.forbidden:c.rejected);return;}
   const body=contractResultSchema.parse(outcome.body);onStateChange({dirty:false,busy:false});onCreated(body.contract.id);
  }catch{setError(c.failed);}finally{lock.current=false;setSaving(false);}
 }
 function submit(){
  if(starter){void run({action:'starter_create',actionId:crypto.randomUUID(),workId,id:crypto.randomUUID(),starter,language,estimateId:estimate||null});return;}
  const pct=parsePercent(deposit);if(pct===undefined){setError(c.depositInvalid);return;}
  void run({action:'contract_create',actionId:crypto.randomUUID(),workId,id:crypto.randomUUID(),templateId:template||null,title:title.trim()||null,language,estimateId:estimate||null,depositPercent:pct});
 }
 const chosen=list.templates.find(t=>t.id===template);
 return <section data-contract-create className={card} aria-labelledby={id+'-h'}>
  <h3 id={id+'-h'} className="font-bold text-[#162543]">{c.createTitle}</h3>
  <div className="grid min-w-0 gap-3 md:grid-cols-2">
   <label className={label}>{c.template}<select data-contract-field="template" className={field} value={template} disabled={saving||uncertain} onChange={event=>{setTemplate(event.target.value);const t=list.templates.find(x=>x.id===event.target.value);if(t&&!deposit&&t.depositPercent!==null)setDeposit(percentText(t.depositPercent,en));}}>
    <option value="">{c.blank}</option>
    <optgroup label={c.starters}>{contractStarterKeys.map(key=><option key={key} value={'starter:'+key}>{c.starterNames[key]}</option>)}</optgroup>
    {list.templates.length>0&&<optgroup label={c.accountTemplates}>{list.templates.map(t=><option key={t.id} value={t.id}>{t.title} ({c.clauses(t.clauseCount)})</option>)}</optgroup>}
   </select>{starter&&<span data-contract-starter-help className="mt-1 block text-xs font-normal text-[#52627a]">{c.starterHelp}</span>}</label>
   <label className={label}>{c.contractTitle}<input data-contract-field="title" className={field} value={starter?'':title} maxLength={CONTRACT_TITLE_MAX} placeholder={starter?c.starterNames[starter]:chosen?.title??''} disabled={saving||uncertain||!!starter} onChange={event=>setTitle(event.target.value)}/><span className="mt-1 block text-xs font-normal text-[#52627a]">{c.titleHelp}</span></label>
   <label className={label}>{c.language}<select data-contract-field="language" className={field} value={language} disabled={saving||uncertain} onChange={event=>setLanguage(event.target.value as 'es'|'en')}><option value="es">{c.es}</option><option value="en">{c.en}</option></select></label>
   <label className={label}>{c.estimate}<select data-contract-field="estimate" className={field} value={estimate} disabled={saving||uncertain} onChange={event=>setEstimate(event.target.value)}><option value="">{c.noEstimate}</option><EstimateOptions list={list} en={en}/></select><span className="mt-1 block text-xs font-normal text-[#52627a]">{c.estimateHelp}</span></label>
   <label className={label}>{c.deposit}<input data-contract-field="deposit" inputMode="decimal" className={field} value={starter?'':deposit} disabled={saving||uncertain||!!starter} onChange={event=>setDeposit(event.target.value)}/><span className="mt-1 block text-xs font-normal text-[#52627a]">{c.depositHelp}</span></label>
  </div>
  {error&&<div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-red-700"><span>{error}</span>{uncertain&&<Button type="button" variant="secondary" className="min-h-11" onClick={()=>{if(pending.current)void run(pending.current);}}>{c.retrySame}</Button>}</div>}
  <div className="flex flex-wrap gap-2"><Button type="button" className="min-h-11" disabled={saving||uncertain} onClick={submit}>{saving?c.creating:c.create}</Button><Button type="button" variant="secondary" className="min-h-11" disabled={saving||uncertain} onClick={onCancel}>{c.cancel}</Button></div>
 </section>;
}

type Confirm=ReturnType<typeof useAppDialog>['confirm'];
function ContractEditor({accountId,workId,contractId,list,confirm,onBack,onStateChange,onChanged}:{accountId:string;workId:string;contractId:string;list:ContractList;confirm:Confirm;onBack:()=>void;onStateChange:(s:ContractState)=>void;onChanged:()=>void}){
 const en=useLocale()==='en',c=copy(en),labels=contractFieldLabels(en),id=useId();
 const [detail,setDetail]=useState<ContractDetail|null>(null),[loadError,setLoadError]=useState(false),[library,setLibrary]=useState<LibraryClause[]>([]);
 const [form,setForm]=useState<{title:string;language:'es'|'en';estimate:string;deposit:string}|null>(null),[saving,setSaving]=useState(false),[uncertain,setUncertain]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [clauseState,setClauseState]=useState<ContractState>({dirty:false,busy:false}),[showPreview,setShowPreview]=useState(false);
 const pending=useRef<ContractMutation|null>(null),lock=useRef(false),sequence=useRef(0);
 const toForm=(d:ContractDetail)=>({title:d.contract.title,language:d.contract.language,estimate:d.contract.estimateId??'',deposit:percentText(d.contract.depositPercent,en)});
 const load=useCallback(async()=>{
  const n=++sequence.current;setLoadError(false);
  try{
   const response=await fetch(contractsApi+'?'+new URLSearchParams({workId,contractId}),{cache:'no-store',headers:{'X-Pro-Expected-Actor':accountId}});if(!response.ok)throw Error();
   const body=contractDetailSchema.parse(await response.json());if(n!==sequence.current)return;setDetail(body);setForm(toForm(body));
  }catch{if(n===sequence.current)setLoadError(true);}
 // eslint-disable-next-line react-hooks/exhaustive-deps -- toForm only depends on the locale, which remounts the workspace
 },[accountId,workId,contractId]);
 useEffect(()=>{const timer=setTimeout(()=>void load(),0),counter=sequence;
  fetch(contractsApi+'?view=library',{cache:'no-store',headers:{'X-Pro-Expected-Actor':accountId}}).then(async r=>{if(r.ok)setLibrary(contractLibrarySchema.parse(await r.json()).clauses);}).catch(()=>{});
  return()=>{clearTimeout(timer);counter.current++;};},[load,accountId]);
 const formDirty=!!detail&&!!form&&JSON.stringify(form)!==JSON.stringify(toForm(detail));
 useLayoutEffect(()=>{onStateChange({dirty:formDirty||clauseState.dirty,busy:saving||uncertain||clauseState.busy});},[formDirty,clauseState,saving,uncertain,onStateChange]);
 useEffect(()=>()=>onStateChange({dirty:false,busy:false}),[onStateChange]);
 const applyResult=useCallback((body:unknown)=>{const result=contractResultSchema.parse(body);setNotice(c.saved);onChanged();void load();return result;},[c.saved,load,onChanged]);
 async function run(input:ContractMutation){
  if(lock.current)return;lock.current=true;pending.current=input;setSaving(true);setError('');setNotice('');
  try{
   const outcome=await postContract(accountId,input);
   if(outcome.kind==='uncertain'){setUncertain(true);setError(c.uncertain);return;}
   pending.current=null;setUncertain(false);
   if(outcome.kind==='conflict'){setError(c.conflict);void load();return;}
   if(outcome.kind==='rejected'){setError(outcome.status===413?c.tooLarge:outcome.status===403?c.forbidden:c.rejected);return;}
   applyResult(outcome.body);
  }catch{setError(c.failed);}finally{lock.current=false;setSaving(false);}
 }
 if(loadError&&!detail)return <div role="alert" data-contract-load-error className={card}><p className="text-sm text-red-700">{c.loadError}</p><Button type="button" variant="secondary" className="min-h-11" onClick={()=>void load()}>{c.retry}</Button></div>;
 if(!detail||!form)return <p role="status" aria-busy="true" className="text-sm text-[#52627a]">{c.loading}</p>;
 const k=detail.contract,draft=k.status==='draft',locked=saving||uncertain||clauseState.busy,missing=detail.preview.missingFields;
 const shareBlock=!k.clauseCount?c.shareBlockedClauses:missing.length?c.shareBlockedMissing:!list.recipientName?c.shareBlockedRecipient:'';
 const latest=detail.versions.find(v=>v.version===k.latestVersion)??null;
 function saveDetails(){
  if(!form||!detail)return;const pct=parsePercent(form.deposit);if(!form.title.trim()){setError(c.titleRequired);return;}if(pct===undefined){setError(c.depositInvalid);return;}
  void run({action:'contract_update',actionId:crypto.randomUUID(),id:k.id,revision:k.revision,title:form.title.trim(),language:form.language,estimateId:form.estimate||null,depositPercent:pct});
 }
 async function share(){
  const answer=await confirm({title:c.shareTitle,description:c.shareBody.replace('{v}',String((k.latestVersion??0)+1)),detail:c.legal,confirmLabel:c.share,cancelLabel:c.cancel});
  if(answer.confirmed)void run({action:'share',actionId:crypto.randomUUID(),id:k.id,revision:k.revision});
 }
 async function withdraw(){const answer=await confirm({title:c.withdrawTitle,description:c.withdrawBody,confirmLabel:c.withdraw,cancelLabel:c.cancel});if(answer.confirmed)void run({action:'withdraw',actionId:crypto.randomUUID(),id:k.id,revision:k.revision});}
 async function voidContract(){
  const answer=await confirm({title:c.voidTitle,description:c.voidBody,tone:'danger',confirmLabel:c.voidAction,cancelLabel:c.cancel,input:{label:c.voidReason}});
  if(!answer.confirmed)return;const reason=(answer.value??'').trim().slice(0,CONTRACT_REASON_MAX);if(!reason){setError(c.voidRequired);return;}
  void run({action:'void',actionId:crypto.randomUUID(),id:k.id,revision:k.revision,reason});
 }
 const printHref='/api/pro/contract-print?'+new URLSearchParams({workId,id:k.id,lang:en?'en':'es'});
 return <div data-contract-editor={k.code} className="min-w-0 space-y-4">
  <div className="flex flex-wrap items-center justify-between gap-2">
   <Button type="button" variant="secondary" className="min-h-11" disabled={formDirty||clauseState.dirty||locked} onClick={onBack}>← {c.back}</Button>
   <a data-contract-print className="inline-flex min-h-11 items-center rounded-full border border-[#d7e1ea] px-4 text-sm font-semibold text-[#162543]" target="_blank" rel="noopener" href={printHref}>{c.print}</a>
  </div>
  <div className={card}>
   <div className="flex min-w-0 flex-wrap items-center gap-2"><span className="text-lg font-bold text-[#008bb5]">{k.code}</span><StatusBadge status={k.status} en={en}/></div>
   <h3 className="break-words text-lg font-bold text-[#162543]">{k.title}</h3>
   {k.status==='voided'&&<p className="text-sm text-red-800">{c.voided}: {k.voidReason}</p>}
   {latest?.response&&<p data-contract-response className={'text-sm '+(latest.response.action==='accept'?'text-emerald-800':'text-amber-900')}>
    {latest.response.action==='accept'?c.acceptedBy(latest.response.typedName??'',crWallStamp(latest.response.atCostaRica,en)):c.declinedBy(crWallStamp(latest.response.atCostaRica,en))}
    {latest.response.reason&&<span className="block">{c.reason}: {latest.response.reason}</span>}
   </p>}
   {!draft&&<p className="text-sm text-[#52627a]">{c.readOnly}</p>}
   <div className="flex flex-wrap gap-2">
    {draft&&<Button type="button" data-contract-share className="min-h-11" disabled={locked||formDirty||clauseState.dirty||!!shareBlock} onClick={()=>void share()}>{c.share}</Button>}
    {(k.status==='shared'||k.status==='declined')&&<Button type="button" variant="secondary" className="min-h-11" disabled={locked} onClick={()=>void withdraw()}>{c.withdraw}</Button>}
    {k.status!=='voided'&&<Button type="button" variant="secondary" className="min-h-11 text-red-700" disabled={locked||formDirty||clauseState.dirty} onClick={()=>void voidContract()}>{c.voidAction}</Button>}
   </div>
   {draft&&shareBlock&&<p data-contract-share-blocked className="text-sm text-[#52627a]">{shareBlock}</p>}
   {notice&&<p role="status" className="text-sm text-emerald-800">{notice}</p>}
   {error&&<div role="alert" data-contract-error className="flex flex-wrap items-center gap-2 text-sm text-red-700"><span>{error}</span>{uncertain&&<Button type="button" variant="secondary" className="min-h-11" onClick={()=>{if(pending.current)void run(pending.current);}}>{c.retrySame}</Button>}</div>}
  </div>
  {(k.status==='shared'||k.status==='accepted')&&<EsignRequests key={k.id+':'+k.status} kind="contract" documentId={k.id}/>}
  {draft&&<section className={card} aria-labelledby={id+'-details'} data-contract-details>
   <h3 id={id+'-details'} className="font-bold text-[#162543]">{c.details}</h3>
   <div className="grid min-w-0 gap-3 md:grid-cols-2">
    <label className={label}>{c.contractTitle}<input data-contract-field="title" className={field} value={form.title} maxLength={CONTRACT_TITLE_MAX} disabled={locked} onChange={event=>setForm({...form,title:event.target.value})}/></label>
    <label className={label}>{c.language}<select data-contract-field="language" className={field} value={form.language} disabled={locked} onChange={event=>setForm({...form,language:event.target.value as 'es'|'en'})}><option value="es">{c.es}</option><option value="en">{c.en}</option></select></label>
    <label className={label}>{c.estimate}<select data-contract-field="estimate" className={field} value={form.estimate} disabled={locked} onChange={event=>setForm({...form,estimate:event.target.value})}>
     <option value="">{c.noEstimate}</option>{detail.estimate&&!list.estimates.some(e=>e.id===detail.estimate!.id)&&<option value={detail.estimate.id}>{detail.estimate.code} · {detail.estimate.title} ({c.estimateStatus[detail.estimate.status]})</option>}<EstimateOptions list={list} en={en}/>
    </select></label>
    <label className={label}>{c.deposit}<input data-contract-field="deposit" inputMode="decimal" className={field} value={form.deposit} disabled={locked} onChange={event=>setForm({...form,deposit:event.target.value})}/></label>
   </div>
   <div className="flex flex-wrap gap-2"><Button type="button" className="min-h-11" disabled={locked||!formDirty} onClick={saveDetails}>{saving?c.saving:c.saveDetails}</Button><Button type="button" variant="secondary" className="min-h-11" disabled={locked||!formDirty} onClick={()=>setForm(toForm(detail))}>{c.discard}</Button></div>
  </section>}
  {draft&&<div className={card}><ClauseListEditor aiWorkId={workId} accountId={accountId} scope="contract" targetId={k.id} revision={k.revision} clauses={k.clauses} library={library} disabled={saving||uncertain||formDirty}
   confirmRemove={async()=>(await confirm({title:c.removeClause,description:c.removeBody,tone:'danger',confirmLabel:c.remove,cancelLabel:c.cancel})).confirmed}
   onSaved={body=>applyResult(body)} onConflict={()=>void load()} onStateChange={setClauseState}/></div>}
  {draft&&<section className={card} data-contract-missing aria-labelledby={id+'-missing'}>
   <h3 id={id+'-missing'} className="font-bold text-[#162543]">{c.missing}</h3>
   {missing.length?<><p className="text-sm text-[#52627a]">{c.missingHelp}</p><ul className="space-y-1 text-sm">{missing.map(key=><li key={key} data-contract-missing-field={key}><span className="font-semibold">{labels[key]}</span> <code className="break-all text-xs text-[#52627a]">{`{{${key}}}`}</code><span className="block text-[#52627a]">{contractFieldHelp(key,en)}</span></li>)}</ul></>
    :<p className="text-sm text-emerald-800">{c.noMissing}</p>}
   <Button type="button" variant="secondary" className="min-h-11" aria-expanded={showPreview} onClick={()=>setShowPreview(value=>!value)}>{showPreview?c.hidePreview:c.preview}</Button>
   {showPreview&&<div data-contract-preview className="space-y-3 rounded-xl border border-[#d7e1ea] bg-[#f7f9fc] p-3">
    <ContractText text={detail.preview.title} className="font-bold text-[#162543]"/>
    {detail.preview.clauses.map((clause,index)=><div key={clause.id}><ContractText text={`${index+1}. ${clause.title}`} className="font-semibold text-[#162543]"/><ContractText text={clause.body} className="text-sm text-[#162543]"/></div>)}
   </div>}
  </section>}
  {!draft&&latest&&<section className={card} data-contract-shared-text aria-labelledby={id+'-text'}>
   <h3 id={id+'-text'} className="font-bold text-[#162543]">{c.version(latest.version)}</h3>
   {latest.content.clauses.map(clause=><div key={clause.position}><p className="font-semibold text-[#162543]">{clause.position}. {clause.title}</p><p className="whitespace-pre-wrap break-words text-sm text-[#162543]">{clause.body}</p></div>)}
  </section>}
  {detail.versions.length>0&&<section className={card} aria-labelledby={id+'-versions'} data-contract-versions>
   <h3 id={id+'-versions'} className="font-bold text-[#162543]">{c.versions}</h3>
   <ol className="space-y-2 text-sm">{detail.versions.map(v=><li key={v.id} className="min-w-0 break-words">
    <span className="font-semibold">{c.version(v.version)}</span> · {c.sharedOn} {stamp(v.sharedAt,en)} · {c.fingerprint} <code title={v.contentHash} className="text-xs">{shortHash(v.contentHash)}…</code>
    {' '}<a className="font-semibold text-[#00698c] underline" target="_blank" rel="noopener" href={'/api/pro/contract-print?'+new URLSearchParams({workId,id:k.id,version:String(v.version),lang:en?'en':'es'})}>{c.print}</a>
   </li>)}</ol>
  </section>}
  <section className={card} aria-labelledby={id+'-history'} data-contract-history>
   <h3 id={id+'-history'} className="font-bold text-[#162543]">{c.history}</h3>
   <ol className="space-y-1 text-sm text-[#52627a]">{detail.history.map(h=><li key={h.actionId}>{stamp(h.at,en)} · {c.actions[h.action]??h.action}</li>)}</ol>
  </section>
 </div>;
}
