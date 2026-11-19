'use client';

import {useCallback,useEffect,useLayoutEffect,useRef,useState,type FormEvent,type ReactNode} from 'react';
import {useLocale} from 'next-intl';
import {useAuth} from '@/hooks/use-auth';
import {useAppDialog} from '@/hooks/use-app-dialog';
import {Button} from '@/components/ui/button';
import {proMoney} from '@/lib/pro/money';
import {centsToInput,colonesToCents,formatQuantity,quantityToInput} from '@/lib/pro/allowances';
import {
 BID_BODY_MAX,bidBytes,bidDetailSchema,bidListSchema,bidMutationSchema,bidResultSchema,bidSourcesSchema,parseBidQuantity,
 type BidDetail,type BidLine,type BidList,type BidMutation,type BidPackage,type BidSources,type BidStatus,type BidVendor,
} from '@/lib/pro/bids';
import {useProChildGuard} from './use-pro-child-guard';
import {BidPortalLinks} from './bid-portal-links';
import {useReveal} from './use-reveal';
import {useProSearchParams} from './use-pro-search-params';
import {replaceProParams} from '@/lib/pro/navigation';

/**
 * Licitaciones por proyecto (row 53). The owner prepares a package of lines, invites
 * vendors of the directory, records the offers received through the usual channels,
 * compares them line by line and awards; awarded vendors get draft purchase orders.
 * ContrataCR never contacts the vendors.
 */
const api='/api/pro/bids',field='mt-1 block min-h-11 w-full min-w-0 rounded-xl border border-[#d7e1ea] bg-white px-3 text-base font-normal text-[#162543]',label='block min-w-0 text-sm font-semibold text-[#162543]';
type StateCallback={onStateChange?:(state:{dirty:boolean;busy:boolean})=>void};
type LineDraft={id:string;description:string;quantity:string;unit:string;budgetCodeId:string};
type PackageDraft={title:string;scope:string;dueDate:string;lines:LineDraft[]};
type ResponseDraft={supplierId:string;receivedOn:string;leadDays:string;validUntil:string;notes:string;prices:Record<string,string>};
type Form=
 |{mode:'create'|'edit';pkg:BidPackage|null;draft:PackageDraft;initial:PackageDraft}
 |{mode:'invite';pkg:BidPackage;draft:{ids:string[]};initial:{ids:string[]}}
 |{mode:'response';pkg:BidPackage;draft:ResponseDraft;initial:ResponseDraft}
 |{mode:'award';pkg:BidPackage;draft:{choice:Record<string,string>};initial:{choice:Record<string,string>}}
 |{mode:'reopen';pkg:BidPackage;draft:{dueDate:string};initial:{dueDate:string}};
const money=(cents:number)=>proMoney(cents/100);
const day=(value:string|null,en:boolean)=>value?new Intl.DateTimeFormat(en?'en-US':'es-CR',{dateStyle:'medium',timeZone:'UTC'}).format(new Date(value+'T12:00:00Z')):'—';
const stamp=(value:string,en:boolean)=>new Intl.DateTimeFormat(en?'en-US':'es-CR',{dateStyle:'medium',timeStyle:'short',timeZone:'America/Costa_Rica'}).format(new Date(value));
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const newLine=():LineDraft=>({id:crypto.randomUUID(),description:'',quantity:'1',unit:'',budgetCodeId:''});

function copy(en:boolean){
 return en?{
  title:'Bid requests',intro:'Ask several vendors to price the same list of items, compare their offers line by line and award the work. ContrataCR does not send anything to vendors: share the request through your usual channel and record each offer you receive.',
  add:'New bid request',empty:'There are no bid requests for this project yet.',emptyHelp:'Create one to compare prices for materials or subcontracted work before buying.',
  loading:'Loading bid requests…',loadError:'Could not load the bid requests.',staleError:'Could not refresh this bid request. What you see may be out of date.',retry:'Retry',reload:'Reload',back:'Back to the list',cancel:'Cancel',saving:'Saving…',open:'Open',
  statuses:{draft:'Draft',open:'Open',closed:'Closed',awarded:'Awarded',cancelled:'Cancelled'} as Record<BidStatus,string>,
  due:'Due date',pastDue:'Due date passed',lines:(n:number)=>`${n} ${n===1?'item':'items'}`,invited:(n:number)=>`${n} invited`,offers:(n:number)=>`${n} ${n===1?'offer':'offers'}`,
  packageTitle:'Title',titlePlaceholder:'E.g. Kitchen cabinets and countertop',scope:'Scope (optional)',scopeHelp:'What is included, site conditions, delivery or installation.',dueDate:'Due date for offers',dueHelp:'Costa Rica calendar day. Required to open the request.',
  items:'Items to quote',line:(n:number)=>`Item ${n}`,description:'Description',quantity:'Quantity',unit:'Unit',unitPlaceholder:'unit, m², m…',budgetItem:'Budget item (optional)',noBudget:'No budget item',
  addLine:'Add item',removeLine:'Remove item',fromBudget:'Add from the budget',fromEstimate:'Add from a quote',choose:'Choose…',defaultUnit:'ea',
  save:'Save bid request',saveEdit:'Save changes',edit:'Edit',invite:'Invite vendors',inviteHelp:'Choose vendors from your directory (Company › Vendors). Nothing is sent: contact them through your usual channel.',noVendors:'Your directory has no active vendors yet. Add them in Company › Vendors.',saveInvite:'Invite selected',
  openBid:'Open for offers',openTitle:'Open this bid request?',openText:'Lines can no longer change once offers are recorded. Share the request with the vendors through your usual channel.',
  close:'Close offers',closeTitle:'Close this bid request?',closeText:'You can still record late offers and award afterwards.',reopen:'Reopen',newDue:'New due date',saveReopen:'Reopen with this date',
  cancelBid:'Cancel bid request',cancelTitle:'Cancel this bid request?',cancelText:'The number is kept and the history stays. Offers remain visible.',reason:'Reason (optional)',
  vendors:'Invited vendors',noInvited:'No vendors invited yet.',remove:'Remove',removeTitle:'Remove this vendor from the request?',record:'Record offer',editOffer:'Edit bid',clearOffer:'Delete offer',clearTitle:'Delete this offer?',clearText:'The history keeps the previous version.',
  noOffer:'No offer yet',received:'Received',lead:'Lead time',leadDays:(n:number)=>`${n} ${n===1?'day':'days'}`,validUntil:'Valid until',expired:'Expired',notes:'Notes',kind:{supplier:'Supplier',subcontractor:'Subcontractor'},
  responseTitle:(name:string)=>`Offer from ${name}`,receivedOn:'Date received',leadInput:'Lead time in days (optional)',validInput:'Valid until (optional)',notesInput:'Notes (optional)',
  priceHelp:'Unit price before tax for each item. Leave empty the items the vendor did not quote.',unitPrice:'Unit price (₡)',saveResponse:'Save offer',
  comparison:'Comparison',comparisonHelp:'Line totals are quantity × unit price, before tax. The lowest price of each item is marked.',lowest:'Lowest',notQuoted:'Not quoted',vendorTotal:'Total quoted',missing:(n:number)=>n===0?'All items quoted':`${n} ${n===1?'item':'items'} not quoted`,
  best:'Lowest per item combined',unquoted:(n:number)=>`${n} ${n===1?'item has':'items have'} no offers`,noOffers:'Record at least one offer to compare.',item:'Item',
  award:'Award',awardHelp:'Choose a vendor for each item you award. Items left without a vendor are not awarded.',awardLowest:'Choose the lowest for every item',awardAll:(name:string)=>`Award everything to ${name}`,nobody:'Not awarded',saveAward:'Save award',
  awardedTo:'Awarded to',awarded:'Awarded amount',orders:'Purchase orders',generate:'Create draft purchase orders',generateHelp:'One draft per awarded vendor, with the awarded items and prices and no tax. Review and issue them in Finance › Purchase orders.',orderCreated:(code:string)=>`Draft ${code}`,
  history:'Change history',historyEmpty:'No changes yet.',actions:{create:'Created',update:'Edited',invite:'Vendors invited',uninvite:'Vendor removed',open:'Opened',record_response:'Offer recorded',clear_response:'Offer deleted',close:'Closed',reopen:'Reopened',award:'Awarded',generate_orders:'Purchase orders created',cancel:'Cancelled'} as Record<string,string>,
  invalid:'Check the title and every item: description, quantity greater than zero (up to 3 decimals) and unit.',invalidDue:'The due date cannot be in the past.',invalidResponse:'Enter at least one valid price. The date received cannot be in the future and the validity cannot be earlier.',invalidAward:'Choose a vendor for at least one item.',
  conflict:'This bid request changed in another window. Reload before trying again.',uncertain:'We could not confirm whether it was saved. Retry the same operation; it will not be applied twice.',retrySame:'Retry the same operation',
  failed:'Could not save. Check the data and try again.',portalKept:'This vendor sent offers from the vendor portal, so it cannot be removed: that record is kept. Cancel its link instead.',tooLarge:'The request is too large. Shorten the descriptions or split it in two.',leave:'Save or cancel the bid request you are editing before leaving.',
  saved:'Bid request saved.',invitedNotice:'Vendors invited. Nothing was sent.',openedNotice:'Bid request opened.',recordedNotice:'Offer recorded.',clearedNotice:'Offer deleted.',closedNotice:'Bid request closed.',reopenedNotice:'Bid request reopened.',
  awardedNotice:'Award saved.',ordersNotice:'Draft purchase orders created.',cancelledNotice:'Bid request cancelled.',removedNotice:'Vendor removed.',readOnly:'This job is cancelled. Bid requests can be viewed but not changed.',
  sourcesError:'Could not load the budget, quotes and vendors.',
 }:{
  title:'Licitaciones',intro:'Pida a varios proveedores que coticen la misma lista de partidas, compare sus ofertas partida por partida y adjudique el trabajo. ContrataCR no envía nada a los proveedores: comparta la solicitud por su medio habitual y registre cada oferta que reciba.',
  add:'Nueva licitación',empty:'Este proyecto todavía no tiene licitaciones.',emptyHelp:'Cree una para comparar precios de materiales o trabajos subcontratados antes de comprar.',
  loading:'Cargando licitaciones…',loadError:'No se pudieron cargar las licitaciones.',staleError:'No se pudo actualizar esta licitación. Lo que ve puede estar desactualizado.',retry:'Reintentar',reload:'Recargar',back:'Volver a la lista',cancel:'Cancelar',saving:'Guardando…',open:'Abrir',
  statuses:{draft:'Borrador',open:'Abierta',closed:'Cerrada',awarded:'Adjudicada',cancelled:'Cancelada'} as Record<BidStatus,string>,
  due:'Fecha límite',pastDue:'Fecha límite vencida',lines:(n:number)=>`${n} ${n===1?'partida':'partidas'}`,invited:(n:number)=>`${n} ${n===1?'invitado':'invitados'}`,offers:(n:number)=>`${n} ${n===1?'oferta':'ofertas'}`,
  packageTitle:'Título',titlePlaceholder:'Ej.: Muebles y sobre de cocina',scope:'Alcance (opcional)',scopeHelp:'Qué incluye, condiciones del sitio, entrega o instalación.',dueDate:'Fecha límite para ofertas',dueHelp:'Día calendario de Costa Rica. Es obligatoria para abrir la licitación.',
  items:'Partidas por cotizar',line:(n:number)=>`Partida ${n}`,description:'Descripción',quantity:'Cantidad',unit:'Unidad',unitPlaceholder:'unid., m², m…',budgetItem:'Partida de presupuesto (opcional)',noBudget:'Sin partida de presupuesto',
  addLine:'Agregar partida',removeLine:'Quitar partida',fromBudget:'Agregar desde el presupuesto',fromEstimate:'Agregar desde una cotización',choose:'Elija…',defaultUnit:'unid.',
  save:'Guardar licitación',saveEdit:'Guardar cambios',edit:'Editar',invite:'Invitar proveedores',inviteHelp:'Elija proveedores de su directorio (Empresa › Proveedores). No se envía nada: contáctelos por su medio habitual.',noVendors:'Su directorio todavía no tiene proveedores activos. Agréguelos en Empresa › Proveedores.',saveInvite:'Invitar a los seleccionados',
  openBid:'Abrir para ofertas',openTitle:'¿Abrir esta licitación?',openText:'Cuando haya ofertas registradas ya no se podrán cambiar las partidas. Comparta la solicitud con los proveedores por su medio habitual.',
  close:'Cerrar ofertas',closeTitle:'¿Cerrar esta licitación?',closeText:'Todavía podrá registrar ofertas tardías y adjudicar después.',reopen:'Reabrir',newDue:'Nueva fecha límite',saveReopen:'Reabrir con esta fecha',
  cancelBid:'Cancelar licitación',cancelTitle:'¿Cancelar esta licitación?',cancelText:'Se conserva el número y el historial. Las ofertas siguen visibles.',reason:'Motivo (opcional)',
  vendors:'Proveedores invitados',noInvited:'Todavía no hay proveedores invitados.',remove:'Quitar',removeTitle:'¿Quitar a este proveedor de la licitación?',record:'Registrar oferta',editOffer:'Editar oferta',clearOffer:'Eliminar oferta',clearTitle:'¿Eliminar esta oferta?',clearText:'El historial conserva la versión anterior.',
  noOffer:'Sin oferta todavía',received:'Recibida',lead:'Plazo',leadDays:(n:number)=>`${n} ${n===1?'día':'días'}`,validUntil:'Válida hasta',expired:'Vencida',notes:'Notas',kind:{supplier:'Proveedor',subcontractor:'Subcontratista'},
  responseTitle:(name:string)=>`Oferta de ${name}`,receivedOn:'Fecha de recepción',leadInput:'Plazo en días (opcional)',validInput:'Válida hasta (opcional)',notesInput:'Notas (opcional)',
  priceHelp:'Precio unitario sin impuestos de cada partida. Deje vacías las partidas que el proveedor no cotizó.',unitPrice:'Precio unitario (₡)',saveResponse:'Guardar oferta',
  comparison:'Comparación',comparisonHelp:'El total de cada partida es cantidad × precio unitario, sin impuestos. Se marca el precio más bajo de cada partida.',lowest:'Más bajo',notQuoted:'Sin cotizar',vendorTotal:'Total cotizado',missing:(n:number)=>n===0?'Cotizó todas las partidas':`${n} ${n===1?'partida':'partidas'} sin cotizar`,
  best:'Lo más bajo por partida, combinado',unquoted:(n:number)=>`${n} ${n===1?'partida no tiene':'partidas no tienen'} ofertas`,noOffers:'Registre al menos una oferta para comparar.',item:'Partida',
  award:'Adjudicar',awardHelp:'Elija un proveedor para cada partida que adjudique. Las partidas sin proveedor no se adjudican.',awardLowest:'Elegir el más bajo en cada partida',awardAll:(name:string)=>`Adjudicar todo a ${name}`,nobody:'Sin adjudicar',saveAward:'Guardar adjudicación',
  awardedTo:'Adjudicada a',awarded:'Monto adjudicado',orders:'Órdenes de compra',generate:'Crear órdenes de compra en borrador',generateHelp:'Un borrador por proveedor adjudicado, con las partidas y precios adjudicados y sin impuestos. Revíselos y emítalos en Finanzas › Órdenes de compra.',orderCreated:(code:string)=>`Borrador ${code}`,
  history:'Historial de cambios',historyEmpty:'Todavía no hay cambios.',actions:{create:'Creada',update:'Editada',invite:'Proveedores invitados',uninvite:'Proveedor quitado',open:'Abierta',record_response:'Oferta registrada',clear_response:'Oferta eliminada',close:'Cerrada',reopen:'Reabierta',award:'Adjudicada',generate_orders:'Órdenes de compra creadas',cancel:'Cancelada'} as Record<string,string>,
  invalid:'Revise el título y cada partida: descripción, cantidad mayor que cero (hasta 3 decimales) y unidad.',invalidDue:'La fecha límite no puede estar en el pasado.',invalidResponse:'Indique al menos un precio válido. La fecha de recepción no puede ser futura y la validez no puede ser anterior.',invalidAward:'Elija un proveedor para al menos una partida.',
  conflict:'Esta licitación cambió en otra ventana. Recargue antes de volver a intentarlo.',uncertain:'No pudimos confirmar si se guardó. Reintente la misma operación; no se aplicará dos veces.',retrySame:'Reintentar la misma operación',
  failed:'No se pudo guardar. Revise los datos y vuelva a intentarlo.',portalKept:'Este proveedor envió ofertas desde el portal de proveedores, así que no se puede quitar: ese registro se conserva. Anule su enlace en su lugar.',tooLarge:'La solicitud es demasiado grande. Acorte las descripciones o divídala en dos.',leave:'Guarde o cancele la licitación que está editando antes de salir.',
  saved:'Licitación guardada.',invitedNotice:'Proveedores invitados. No se envió nada.',openedNotice:'Licitación abierta.',recordedNotice:'Oferta registrada.',clearedNotice:'Oferta eliminada.',closedNotice:'Licitación cerrada.',reopenedNotice:'Licitación reabierta.',
  awardedNotice:'Adjudicación guardada.',ordersNotice:'Órdenes de compra en borrador creadas.',cancelledNotice:'Licitación cancelada.',removedNotice:'Proveedor quitado.',readOnly:'Este trabajo está cancelado. Las licitaciones se pueden consultar, pero no cambiar.',
  sourcesError:'No se pudieron cargar el presupuesto, las cotizaciones y los proveedores.',
 };
}
type Copy=ReturnType<typeof copy>;
const statusTone:Record<BidStatus,string>={draft:'bg-[#f7f9fc] text-[#52627a] border-[#d7e1ea]',open:'bg-[#e6f6fb] text-[#006c8f] border-[#b8e4f2]',closed:'bg-[#fff7e6] text-[#8a5a00] border-[#f3d9a4]',awarded:'bg-[#e9f7ef] text-[#1d6b3c] border-[#bfe5cd]',cancelled:'bg-[#fdf0f0] text-[#9b2c2c] border-[#f2c9c9]'};
function Status({status,c}:{status:BidStatus;c:Copy}){return <span className={'inline-flex min-h-7 items-center rounded-full border px-2.5 text-xs font-semibold '+statusTone[status]}>{c.statuses[status]}</span>;}
function Section({title,children,action}:{title:string;children:ReactNode;action?:ReactNode}){return <section className="min-w-0 rounded-2xl border border-[#d7e1ea] bg-white p-4"><div className="flex flex-wrap items-center justify-between gap-2"><h4 className="text-base font-semibold text-[#162543]">{title}</h4>{action}</div><div className="mt-3 min-w-0">{children}</div></section>;}

export function WorkBids({workId,onStateChange}:{workId:string}&StateCallback){
 const {user,loading}=useAuth();if(loading||!user)return null;
 return <BidsSession key={user.id+':'+workId} accountId={user.id} workId={workId} onStateChange={onStateChange}/>;
}

function BidsSession({accountId,workId,onStateChange}:{accountId:string;workId:string}&StateCallback){
 const en=useLocale()==='en',c=copy(en),{confirm,dialogNode}=useAppDialog();
 const [list,setList]=useState<BidList|null>(null),[loading,setLoading]=useState(true),[loadError,setLoadError]=useState(false);
 // Round 2: the open bid package lives in the URL (?licitacion=…), so reload, back and a shared
 // link reopen it.
 const params=useProSearchParams(),requestedId=params.get('licitacion'),openId=requestedId&&/^[0-9a-f-]{36}$/i.test(requestedId)?requestedId:null;
 // Replaced, not pushed: closing the job still leaves in one step.
 const setOpenId=useCallback((id:string|null)=>{if((new URLSearchParams(window.location.search).get('licitacion')??null)===id)return;replaceProParams({licitacion:id});},[]);
 const [detail,setDetail]=useState<BidDetail|null>(null),[detailError,setDetailError]=useState(false);
 const [sources,setSources]=useState<BidSources|null>(null),[sourcesError,setSourcesError]=useState(false);
 const [form,setForm]=useState<Form|null>(null),[saving,setSaving]=useState(false),[uncertain,setUncertain]=useState(false),[conflict,setConflict]=useState(false);
 const [error,setError]=useState(''),[notice,setNotice]=useState('');
 const errorRef=useReveal<HTMLDivElement>(error),noticeRef=useReveal<HTMLParagraphElement>(notice);
 const active=useRef(true),sequence=useRef(0),detailSequence=useRef(0),sourcesSequence=useRef(0),lock=useRef(false),pending=useRef<{input:BidMutation;notice:string}|null>(null);
 const dirty=!!form&&!same(form.draft,form.initial),busy=saving||uncertain,readOnly=!!list?.cancelledWork;
 useProChildGuard(!onStateChange&&(dirty||busy),useCallback(()=>setError(c.leave),[c.leave]));
 useLayoutEffect(()=>{onStateChange?.({dirty,busy});return()=>onStateChange?.({dirty:false,busy:false});},[dirty,busy,onStateChange]);
 const headers={'X-Pro-Expected-Actor':accountId};
 const load=useCallback(async()=>{
  const id=++sequence.current;setLoading(true);setLoadError(false);
  try{
   const response=await fetch(api+'?'+new URLSearchParams({view:'list',workId}),{cache:'no-store',headers:{'X-Pro-Expected-Actor':accountId}});if(!response.ok)throw Error();
   const body=bidListSchema.parse(await response.json());if(body.workId!==workId)throw Error();
   if(active.current&&id===sequence.current){setList(body);setConflict(false);}
  }catch{if(active.current&&id===sequence.current)setLoadError(true);}
  finally{if(active.current&&id===sequence.current)setLoading(false);}
 },[accountId,workId]);
 const loadDetail=useCallback(async(packageId:string)=>{
  const id=++detailSequence.current;setDetailError(false);
  try{
   const response=await fetch(api+'?'+new URLSearchParams({view:'detail',workId,id:packageId}),{cache:'no-store',headers:{'X-Pro-Expected-Actor':accountId}});if(!response.ok)throw Error();
   const body=bidDetailSchema.parse(await response.json());if(body.package.id!==packageId)throw Error();
   if(active.current&&id===detailSequence.current)setDetail(body);
  }catch{if(active.current&&id===detailSequence.current)setDetailError(true);}
 },[accountId,workId]);
 const loadSources=useCallback(async()=>{
  const id=++sourcesSequence.current;setSourcesError(false);
  try{
   const response=await fetch(api+'?'+new URLSearchParams({view:'sources',workId}),{cache:'no-store',headers:{'X-Pro-Expected-Actor':accountId}});if(!response.ok)throw Error();
   const body=bidSourcesSchema.parse(await response.json());if(active.current&&id===sourcesSequence.current)setSources(body);
  }catch{if(active.current&&id===sourcesSequence.current)setSourcesError(true);}
 },[accountId,workId]);
 const invalidate=useCallback(()=>{sequence.current++;},[]),invalidateDetail=useCallback(()=>{detailSequence.current++;},[]);
 // A vendor offer sent from the portal changes the package: reload the detail (and list) shown.
 const portalSubmissions=useCallback(()=>{if(!openId||busy)return;void loadDetail(openId);void load();},[openId,busy,loadDetail,load]);
 useEffect(()=>{active.current=true;const timer=setTimeout(()=>void load(),0);return()=>{active.current=false;invalidate();clearTimeout(timer);};},[load,invalidate]);
 useEffect(()=>{if(!openId)return;const timer=setTimeout(()=>void loadDetail(openId),0);return()=>{invalidateDetail();clearTimeout(timer);};},[openId,loadDetail,invalidateDetail]);

 async function send(input:BidMutation,success:string){
  if(lock.current)return false;lock.current=true;pending.current={input,notice:success};setSaving(true);setError('');setNotice('');
  try{
   if(bidBytes(input)>BID_BODY_MAX){pending.current=null;setUncertain(false);setError(c.tooLarge);return false;}
   const response=await fetch(api,{method:'POST',cache:'no-store',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify(input)});
   if(response.status===409){pending.current=null;setUncertain(false);setConflict(true);setError(c.conflict);return false;}
   if(response.status>=500||response.status===429){setUncertain(true);setError(c.uncertain);return false;}
   if(!response.ok){const failure=await response.json().catch(()=>({}));pending.current=null;setUncertain(false);setError(failure?.reason==='portal_submissions'?c.portalKept:response.status===413?c.tooLarge:input.action==='create'||input.action==='update'?c.invalid:input.action==='record_response'?c.invalidResponse:c.failed);return false;}
   const body=bidResultSchema.parse(await response.json());if(body.package.id!==input.id||body.package.workId!==workId)throw Error();
   pending.current=null;setUncertain(false);
   if(active.current){setForm(null);setNotice(success);setOpenId(body.package.id);}
   lock.current=false;await Promise.all([load(),loadDetail(body.package.id)]);return true;
  }catch{setUncertain(true);setError(c.uncertain);return false;}
  finally{lock.current=false;if(active.current)setSaving(false);}
 }
 function retrySame(){const last=pending.current;if(last)void send(last.input,last.notice);}
 function reloadAll(){setConflict(false);setError('');setForm(null);void load();if(openId)void loadDetail(openId);}
 function begin(next:Form){if(busy)return;setForm(next);setError('');setNotice('');if(next.mode==='create'||next.mode==='edit'||next.mode==='invite')void loadSources();}
 const target=(pkg:BidPackage)=>({actionId:crypto.randomUUID(),workId,id:pkg.id,revision:pkg.revision});
 async function simple(pkg:BidPackage,action:'open'|'close',title:string,text:string,label:string,success:string){
  if(busy||form)return;const answer=await confirm({title,description:`${pkg.code} · ${pkg.title}`,detail:text,confirmLabel:label,cancelLabel:c.cancel});if(!answer.confirmed)return;
  void send({action,...target(pkg)},success);
 }
 async function cancelPackage(pkg:BidPackage){
  if(busy||form)return;const answer=await confirm({title:c.cancelTitle,description:`${pkg.code} · ${pkg.title}`,detail:c.cancelText,confirmLabel:c.cancelBid,cancelLabel:c.cancel,tone:'danger',input:{label:c.reason}});if(!answer.confirmed)return;
  const parsed=bidMutationSchema.safeParse({action:'cancel',...target(pkg),reason:(answer.value??'').trim().slice(0,300)||null});if(parsed.success)void send(parsed.data,c.cancelledNotice);
 }
 async function vendorAction(pkg:BidPackage,vendor:BidVendor,action:'uninvite'|'clear_response'){
  if(busy||form)return;const answer=await confirm({title:action==='uninvite'?c.removeTitle:c.clearTitle,description:vendor.name,detail:action==='clear_response'?c.clearText:undefined,confirmLabel:action==='uninvite'?c.remove:c.clearOffer,cancelLabel:c.cancel,tone:'danger'});
  if(!answer.confirmed)return;void send({action,...target(pkg),supplierId:vendor.supplierId},action==='uninvite'?c.removedNotice:c.clearedNotice);
 }
 function submit(event:FormEvent){
  event.preventDefault();if(!form||busy||conflict)return;const today=list?.today??'';
  if(form.mode==='create'||form.mode==='edit'){
   const d=form.draft;let bad=false;
   const lines=d.lines.map(line=>{const quantity=parseBidQuantity(line.quantity,en);if(quantity===null)bad=true;return {id:line.id,description:line.description,quantity:quantity??0,unit:line.unit,budgetCodeId:line.budgetCodeId||null};});
   if(d.dueDate&&d.dueDate<today&&d.dueDate!==form.pkg?.dueDate){setError(c.invalidDue);return;}
   const base={workId,actionId:crypto.randomUUID(),title:d.title,scope:d.scope.trim()||null,dueDate:d.dueDate||null,lines};
   const parsed=bidMutationSchema.safeParse(form.mode==='create'?{action:'create',id:crypto.randomUUID(),...base}:{action:'update',id:form.pkg!.id,revision:form.pkg!.revision,...base});
   if(bad||!parsed.success){setError(c.invalid);return;}
   void send(parsed.data,c.saved);return;
  }
  if(form.mode==='invite'){if(form.draft.ids.length===0){setError(en?'Select at least one vendor, or add one and wait until it is selected.':'Seleccione al menos un proveedor, o agréguelo y espere a que quede seleccionado.');return;}const parsed=bidMutationSchema.safeParse({action:'invite',...target(form.pkg),supplierIds:form.draft.ids});if(!parsed.success){setError(c.failed);return;}void send(parsed.data,c.invitedNotice);return;}
  if(form.mode==='response'){
   const d=form.draft;let bad=false;const prices:Array<{lineId:string;unitCents:number}>=[];
   for(const line of form.pkg.lines){const raw=(d.prices[line.id]??'').trim();if(!raw)continue;const cents=colonesToCents(raw);if(cents===null){bad=true;break;}prices.push({lineId:line.id,unitCents:cents});}
   const lead=d.leadDays.trim()===''?null:/^\d{1,4}$/.test(d.leadDays.trim())?Number(d.leadDays.trim()):-1;
   const parsed=bidMutationSchema.safeParse({action:'record_response',...target(form.pkg),supplierId:d.supplierId,receivedOn:d.receivedOn,leadDays:lead,validUntil:d.validUntil||null,notes:d.notes.trim()||null,prices});
   if(bad||!parsed.success||d.receivedOn>today){setError(c.invalidResponse);return;}
   void send(parsed.data,c.recordedNotice);return;
  }
  if(form.mode==='award'){
   const awards=form.pkg.lines.filter(line=>form.draft.choice[line.id]).map(line=>({lineId:line.id,supplierId:form.draft.choice[line.id]}));
   const parsed=bidMutationSchema.safeParse({action:'award',...target(form.pkg),awards});if(!parsed.success){setError(c.invalidAward);return;}
   void send(parsed.data,c.awardedNotice);return;
  }
  if(form.mode!=='reopen')return;
  if(form.draft.dueDate<today){setError(c.invalidDue);return;}
  const parsed=bidMutationSchema.safeParse({action:'reopen',...target(form.pkg),dueDate:form.draft.dueDate});if(!parsed.success){setError(c.invalidDue);return;}
  void send(parsed.data,c.reopenedNotice);
 }
 const messages=<>
  {error&&<div ref={errorRef} role="alert" data-bid-message="error" className="rounded-xl border border-[#f2c9c9] bg-[#fdf0f0] p-3 text-sm text-[#9b2c2c]"><p>{error}</p>
   <div className="mt-2 flex flex-wrap gap-2">{uncertain&&<Button className="min-h-11" type="button" disabled={saving} onClick={retrySame}>{c.retrySame}</Button>}{conflict&&<Button className="min-h-11" type="button" variant="secondary" onClick={reloadAll}>{c.reload}</Button>}</div></div>}
  {notice&&<p ref={noticeRef} role="status" data-bid-message="notice" className="rounded-xl border border-[#bfe5cd] bg-[#e9f7ef] p-3 text-sm text-[#1d6b3c]">{notice}</p>}
 </>;
 return <section data-work-bids className="min-w-0 space-y-4 text-[#162543]">
  {dialogNode}
  <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0 max-w-3xl"><h3 className="text-lg font-semibold">{c.title}</h3><p className="mt-1 text-sm text-[#52627a]">{c.intro}</p></div>
   {!form&&!openId&&list&&!readOnly&&<Button type="button" className="min-h-11" disabled={busy} onClick={()=>{const draft={title:'',scope:'',dueDate:'',lines:[newLine()]};begin({mode:'create',pkg:null,draft,initial:draft});}}>{c.add}</Button>}</div>
  {readOnly&&<p className="rounded-xl border border-[#f3d9a4] bg-[#fff7e6] p-3 text-sm text-[#8a5a00]">{c.readOnly}</p>}
  {!form&&messages}
  {form?<FormView form={form} setForm={setForm} c={c} en={en} sources={sources} sourcesError={sourcesError} today={list?.today??''} saving={saving} busy={busy||conflict} onSubmit={submit} onCancel={()=>{setForm(null);setError('');}} onRetrySources={()=>void loadSources()} messages={messages} accountId={accountId} onVendorCreated={async id=>{setForm(old=>old&&old.mode==='invite'&&!old.draft.ids.includes(id)?{...old,draft:{ids:[...old.draft.ids,id].slice(0,30)}}:old);await loadSources();}}/>
  :openId?<DetailView c={c} en={en} detail={detail} error={detailError} busy={busy} readOnly={readOnly} portal={{accountId,workId,onSubmissions:portalSubmissions}} onBack={()=>{if(busy)return;setOpenId(null);setDetail(null);setNotice('');}} onRetry={()=>void loadDetail(openId)}
    onEdit={pkg=>{const draft:PackageDraft={title:pkg.title,scope:pkg.scope??'',dueDate:pkg.dueDate??'',lines:pkg.lines.map(line=>({id:line.id,description:line.description,quantity:quantityToInput(line.quantity,en),unit:line.unit,budgetCodeId:line.budgetCodeId??''}))};begin({mode:'edit',pkg,draft,initial:draft});}}
    onInvite={pkg=>begin({mode:'invite',pkg,draft:{ids:[]},initial:{ids:[]}})}
    onOpenBid={pkg=>void simple(pkg,'open',c.openTitle,c.openText,c.openBid,c.openedNotice)}
    onClose={pkg=>void simple(pkg,'close',c.closeTitle,c.closeText,c.close,c.closedNotice)}
    onReopen={pkg=>{const draft={dueDate:list?.today??''};begin({mode:'reopen',pkg,draft,initial:draft});}}
    onCancelBid={pkg=>void cancelPackage(pkg)}
    onRecord={(pkg,vendor)=>{const draft:ResponseDraft={supplierId:vendor.supplierId,receivedOn:vendor.response?.receivedOn??list?.today??'',leadDays:vendor.response?.leadDays==null?'':String(vendor.response.leadDays),validUntil:vendor.response?.validUntil??'',notes:vendor.response?.notes??'',
      prices:Object.fromEntries(pkg.lines.map(line=>{const offer=line.offers.find(o=>o.supplierId===vendor.supplierId);return [line.id,offer?centsToInput(offer.unitCents):''];}))};begin({mode:'response',pkg,draft,initial:draft});}}
    onVendorAction={(pkg,vendor,action)=>void vendorAction(pkg,vendor,action)}
    onAward={pkg=>{const choice=Object.fromEntries(pkg.lines.map(line=>[line.id,line.award?.supplierId??'']));begin({mode:'award',pkg,draft:{choice},initial:{choice}});}}
    onGenerate={pkg=>void send({action:'generate_orders',...target(pkg),locale:en?'en':'es'},c.ordersNotice)}/>
  :loading&&!list?<p role="status" className="text-sm text-[#52627a]">{c.loading}</p>
  :loadError&&!list?<div data-bids-load-error role="alert" className="rounded-xl border border-[#f2c9c9] bg-[#fdf0f0] p-3 text-sm text-[#9b2c2c]"><p>{c.loadError}</p><Button type="button" variant="secondary" className="mt-2 min-h-11" onClick={()=>void load()}>{c.retry}</Button></div>
  :list&&list.items.length===0?<div data-bids-empty className="rounded-2xl border border-dashed border-[#d7e1ea] bg-[#f7f9fc] p-5"><p className="font-semibold">{c.empty}</p><p className="mt-1 text-sm text-[#52627a]">{c.emptyHelp}</p></div>
  :list&&<ul data-bids-list className="grid min-w-0 gap-3 md:grid-cols-2">{list.items.map(item=><li key={item.id} data-bid-item={item.code} className="min-w-0 rounded-2xl border border-[#d7e1ea] bg-white p-4">
    <div className="flex flex-wrap items-center gap-2"><span className="text-sm font-semibold text-[#52627a]">{item.code}</span><Status status={item.status} c={c}/>{item.pastDue&&<span className="text-xs font-semibold text-[#9b2c2c]">{c.pastDue}</span>}</div>
    <p className="mt-1 break-words font-semibold">{item.title}</p>
    <p className="mt-1 text-sm text-[#52627a]">{c.due}: {day(item.dueDate,en)} · {c.lines(item.lineCount)} · {c.invited(item.invitedCount)} · {c.offers(item.responseCount)}</p>
    {item.awardedCents>0&&<p className="mt-1 text-sm">{c.awarded}: <strong>{money(item.awardedCents)}</strong></p>}
    <Button type="button" variant="secondary" className="mt-3 min-h-11" disabled={busy} aria-label={`${c.open} ${item.code}`} onClick={()=>{setOpenId(item.id);setDetail(null);setNotice('');}}>{c.open}</Button>
   </li>)}</ul>}
 </section>;
}

function DetailView({c,en,detail,error,busy,readOnly,portal,onBack,onRetry,onEdit,onInvite,onOpenBid,onClose,onReopen,onCancelBid,onRecord,onVendorAction,onAward,onGenerate}:{
 c:Copy;en:boolean;detail:BidDetail|null;error:boolean;busy:boolean;readOnly:boolean;portal:{accountId:string;workId:string;onSubmissions:()=>void};onBack:()=>void;onRetry:()=>void;onEdit:(p:BidPackage)=>void;onInvite:(p:BidPackage)=>void;onOpenBid:(p:BidPackage)=>void;onClose:(p:BidPackage)=>void;
 onReopen:(p:BidPackage)=>void;onCancelBid:(p:BidPackage)=>void;onRecord:(p:BidPackage,v:BidVendor)=>void;onVendorAction:(p:BidPackage,v:BidVendor,a:'uninvite'|'clear_response')=>void;onAward:(p:BidPackage)=>void;onGenerate:(p:BidPackage)=>void}){
 const back=<Button type="button" variant="secondary" className="min-h-11" disabled={busy} onClick={onBack}>{c.back}</Button>;
 if(!detail)return <div className="space-y-3">{back}{error?<div role="alert" className="rounded-xl border border-[#f2c9c9] bg-[#fdf0f0] p-3 text-sm text-[#9b2c2c]"><p>{c.loadError}</p><Button type="button" variant="secondary" className="mt-2 min-h-11" onClick={onRetry}>{c.retry}</Button></div>:<p role="status" className="text-sm text-[#52627a]">{c.loading}</p>}</div>;
 const pkg=detail.package,s=pkg.status,can=!readOnly&&!busy,responses=pkg.vendors.some(v=>v.response);
 const editable=s==='draft'||(s==='open'&&!responses),pendingOrders=s==='awarded'&&pkg.vendors.some(v=>v.awardedCents!=null&&!v.order);
 return <div data-bid-detail={pkg.code} className="min-w-0 space-y-4">
  {error&&<div role="alert" data-bid-detail-stale className="rounded-xl border border-[#f2c9c9] bg-[#fdf0f0] p-3 text-sm text-[#9b2c2c]"><p>{c.staleError}</p><Button type="button" variant="secondary" className="mt-2 min-h-11" onClick={onRetry}>{c.retry}</Button></div>}
  {back}
  <div className="min-w-0 rounded-2xl border border-[#d7e1ea] bg-[#f7f9fc] p-4">
   <div className="flex flex-wrap items-center gap-2"><span className="text-sm font-semibold text-[#52627a]">{pkg.code}</span><Status status={s} c={c}/>{pkg.pastDue&&<span className="text-xs font-semibold text-[#9b2c2c]">{c.pastDue}</span>}</div>
   <h4 className="mt-1 break-words text-lg font-semibold">{pkg.title}</h4>
   <p className="mt-1 text-sm text-[#52627a]">{c.due}: {day(pkg.dueDate,en)}</p>
   {pkg.scope&&<p className="mt-2 whitespace-pre-line break-words text-sm">{pkg.scope}</p>}
   {pkg.cancelReason&&<p className="mt-2 text-sm text-[#52627a]">{c.reason}: {pkg.cancelReason}</p>}
   {can&&<div className="mt-3 flex flex-wrap gap-2">
    {editable&&<Button type="button" variant="secondary" className="min-h-11" onClick={()=>onEdit(pkg)}>{c.edit}</Button>}
    {(s==='draft'||s==='open')&&<Button type="button" variant="secondary" className="min-h-11" onClick={()=>onInvite(pkg)}>{c.invite}</Button>}
    {s==='draft'&&<Button type="button" className="min-h-11" onClick={()=>onOpenBid(pkg)}>{c.openBid}</Button>}
    {s==='open'&&<Button type="button" variant="secondary" className="min-h-11" onClick={()=>onClose(pkg)}>{c.close}</Button>}
    {s==='closed'&&<Button type="button" variant="secondary" className="min-h-11" onClick={()=>onReopen(pkg)}>{c.reopen}</Button>}
    {(s==='open'||s==='closed')&&responses&&<Button type="button" className="min-h-11" onClick={()=>onAward(pkg)}>{c.award}</Button>}
    {pendingOrders&&<Button type="button" className="min-h-11" onClick={()=>onGenerate(pkg)}>{c.generate}</Button>}
    {(s==='draft'||s==='open'||s==='closed')&&<Button type="button" variant="destructive" className="min-h-11" onClick={()=>onCancelBid(pkg)}>{c.cancelBid}</Button>}
   </div>}
   {pendingOrders&&<p className="mt-2 text-sm text-[#52627a]">{c.generateHelp}</p>}
  </div>
  <Section title={c.vendors}>
   {pkg.vendors.length===0?<p className="text-sm text-[#52627a]">{c.noInvited}</p>:<ul className="grid min-w-0 gap-3 md:grid-cols-2">{pkg.vendors.map(v=><li key={v.supplierId} data-bid-vendor={v.name} className="min-w-0 rounded-xl border border-[#d7e1ea] p-3">
    <p className="break-words font-semibold">{v.name}</p><p className="text-xs text-[#52627a]">{c.kind[v.kind]}{v.trade?' · '+v.trade:''}</p>
    {v.response?<dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
      <dt className="text-[#52627a]">{c.received}</dt><dd>{day(v.response.receivedOn,en)}</dd>
      {v.response.leadDays!=null&&<><dt className="text-[#52627a]">{c.lead}</dt><dd>{c.leadDays(v.response.leadDays)}</dd></>}
      {v.response.validUntil&&<><dt className="text-[#52627a]">{c.validUntil}</dt><dd>{day(v.response.validUntil,en)}{v.response.expired&&<span className="ml-1 font-semibold text-[#9b2c2c]">({c.expired})</span>}</dd></>}
      <dt className="text-[#52627a]">{c.vendorTotal}</dt><dd className="font-semibold">{v.totalCents==null?'—':money(v.totalCents)}</dd>
     </dl>:<p className="mt-2 text-sm text-[#52627a]">{c.noOffer}</p>}
    {v.response&&<p className="mt-1 text-xs text-[#52627a]">{c.missing(v.missingCount)}</p>}
    {v.response?.notes&&<p className="mt-1 whitespace-pre-line break-words text-sm">{v.response.notes}</p>}
    {v.order&&<p className="mt-2 text-sm font-semibold text-[#006c8f]">{c.orderCreated(v.order.code)}</p>}
    {can&&(s==='open'||s==='closed')&&<div className="mt-3 flex flex-wrap gap-2"><Button type="button" variant="secondary" className="min-h-11" onClick={()=>onRecord(pkg,v)}>{v.response?c.editOffer:c.record}</Button>
     {v.response&&<Button type="button" variant="ghost" className="min-h-11" onClick={()=>onVendorAction(pkg,v,'clear_response')}>{c.clearOffer}</Button>}</div>}
    {can&&(s==='draft'||s==='open')&&!v.response&&<Button type="button" variant="ghost" className="mt-2 min-h-11" onClick={()=>onVendorAction(pkg,v,'uninvite')}>{c.remove}</Button>}
   </li>)}</ul>}
  </Section>
  {pkg.vendors.length>0&&<BidPortalLinks accountId={portal.accountId} workId={portal.workId} pkg={pkg} en={en} readOnly={readOnly} onSubmissions={portal.onSubmissions}/>}
  <div data-bid-comparison><Comparison pkg={pkg} c={c} en={en}/></div>
  <Section title={c.history}>{detail.history.length===0?<p className="text-sm text-[#52627a]">{c.historyEmpty}</p>:<ol className="space-y-1 text-sm">{detail.history.map(h=><li key={h.actionId} className="flex flex-wrap justify-between gap-2"><span>{c.actions[h.action]??h.action}</span><span className="text-[#52627a]">{stamp(h.at,en)}</span></li>)}</ol>}</Section>
 </div>;
}

/** Side by side: a table with its own horizontal scroll from md up; one card per item on phones. */
function Comparison({pkg,c,en}:{pkg:BidPackage;c:Copy;en:boolean}){
 const vendors=pkg.vendors.filter(v=>v.response);
 // Before any offer the comparison is empty, but the owner still needs to see what is being quoted.
 if(vendors.length===0)return <><Section title={c.items}><ul data-bid-lines className="space-y-2">{pkg.lines.map(line=><li key={line.id} className="min-w-0 rounded-xl border border-[#d7e1ea] p-3"><p className="break-words font-semibold">{line.description}</p><p className="text-xs text-[#52627a]">{formatQuantity(line.quantity,en)} {line.unit}</p></li>)}</ul></Section>
  <Section title={c.comparison}><p className="text-sm text-[#52627a]">{c.noOffers}</p></Section></>;
 const cell=(line:BidLine,v:BidVendor)=>{const offer=line.offers.find(o=>o.supplierId===v.supplierId),low=line.lowestSupplierIds.includes(v.supplierId),won=line.award?.supplierId===v.supplierId;
  return offer?<span className="block"><span className="block font-semibold">{money(offer.totalCents)}</span><span className="block text-xs text-[#52627a]">{money(offer.unitCents)} / {line.unit}</span>
   {low&&<span className="mt-1 inline-block rounded-full bg-[#e9f7ef] px-2 text-xs font-semibold text-[#1d6b3c]">{c.lowest}</span>}{won&&<span className="mt-1 ml-1 inline-block rounded-full bg-[#e6f6fb] px-2 text-xs font-semibold text-[#006c8f]">{c.awardedTo}</span>}</span>
   :<span className="text-sm text-[#52627a]">{c.notQuoted}</span>;};
 return <Section title={c.comparison}>
  <p className="text-sm text-[#52627a]">{c.comparisonHelp}</p>
  <div className="mt-3 hidden max-w-full overflow-x-auto rounded-xl border border-[#d7e1ea] md:block" role="region" aria-label={c.comparison} tabIndex={0}>
   <table className="min-w-full text-left text-sm"><caption className="sr-only">{pkg.code} · {c.comparison}</caption>
    <thead className="bg-[#f7f9fc]"><tr><th scope="col" className="sticky left-0 bg-[#f7f9fc] p-3 font-semibold">{c.item}</th>{vendors.map(v=><th key={v.supplierId} scope="col" className="min-w-40 p-3 font-semibold">{v.name}</th>)}</tr></thead>
    <tbody>{pkg.lines.map(line=><tr key={line.id} className="border-t border-[#d7e1ea] align-top"><th scope="row" className="sticky left-0 max-w-64 bg-white p-3 font-normal"><span className="block break-words font-semibold">{line.description}</span><span className="block text-xs text-[#52627a]">{formatQuantity(line.quantity,en)} {line.unit}</span></th>
     {vendors.map(v=><td key={v.supplierId} className={'p-3 '+(line.lowestSupplierIds.includes(v.supplierId)?'bg-[#f3fbf6]':'')}>{cell(line,v)}</td>)}</tr>)}</tbody>
    <tfoot className="border-t-2 border-[#d7e1ea] bg-[#f7f9fc]"><tr><th scope="row" className="sticky left-0 bg-[#f7f9fc] p-3">{c.vendorTotal}</th>{vendors.map(v=><td key={v.supplierId} className="p-3"><span className="block font-semibold">{v.totalCents==null?'—':money(v.totalCents)}</span><span className="block text-xs text-[#52627a]">{c.missing(v.missingCount)}</span></td>)}</tr></tfoot>
   </table>
  </div>
  <ul className="mt-3 space-y-3 md:hidden">{pkg.lines.map(line=><li key={line.id} className="min-w-0 rounded-xl border border-[#d7e1ea] p-3">
   <p className="break-words font-semibold">{line.description}</p><p className="text-xs text-[#52627a]">{formatQuantity(line.quantity,en)} {line.unit}</p>
   <dl className="mt-2 space-y-2">{vendors.map(v=><div key={v.supplierId} className={'flex min-w-0 items-start justify-between gap-3 rounded-lg p-2 '+(line.lowestSupplierIds.includes(v.supplierId)?'bg-[#f3fbf6]':'')}><dt className="min-w-0 break-words text-sm">{v.name}</dt><dd className="shrink-0 text-right text-sm">{cell(line,v)}</dd></div>)}</dl>
  </li>)}
   <li className="rounded-xl border border-[#d7e1ea] bg-[#f7f9fc] p-3"><p className="font-semibold">{c.vendorTotal}</p><dl className="mt-2 space-y-1">{vendors.map(v=><div key={v.supplierId} className="flex min-w-0 justify-between gap-3 text-sm"><dt className="min-w-0 break-words">{v.name}<span className="block text-xs text-[#52627a]">{c.missing(v.missingCount)}</span></dt><dd className="shrink-0 font-semibold">{v.totalCents==null?'—':money(v.totalCents)}</dd></div>)}</dl></li>
  </ul>
  <p className="mt-3 text-sm">{c.best}: <strong>{pkg.comparison.bestCombinedCents==null?'—':money(pkg.comparison.bestCombinedCents)}</strong>{pkg.comparison.unquotedLineCount>0&&<span className="ml-2 text-[#9b2c2c]">{c.unquoted(pkg.comparison.unquotedLineCount)}</span>}</p>
  {pkg.awardedCents>0&&<p className="mt-1 text-sm">{c.awarded}: <strong>{money(pkg.awardedCents)}</strong></p>}
 </Section>;
}

/** Round 2: add a supplier or subcontractor to the company directory without leaving the bid
 * (same /api/pro/company-vendors create as Company › Suppliers); it is selected right away. */
function InlineVendor({en,accountId,disabled,onCreated,onBusyChange}:{en:boolean;accountId:string;disabled:boolean;onCreated:(id:string)=>Promise<void>;onBusyChange?:(busy:boolean)=>void}){
 const [open,setOpen]=useState(false),[name,setName]=useState(''),[kind,setKind]=useState<'supplier'|'subcontractor'>('subcontractor'),[email,setEmail]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),attempt=useRef<{key:string;body:Record<string,unknown>}|null>(null);
 const errorRef=useReveal<HTMLParagraphElement>(error);
 async function create(){
  if(busy)return;const clean=name.trim(),mail=email.trim();
  if(!clean){setError(en?'Enter the name of the supplier or subcontractor.':'Escriba el nombre del proveedor o subcontratista.');return;}
  if(mail&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)){setError(en?'Check the email address.':'Revise el correo electrónico.');return;}
  const key=JSON.stringify([clean,kind,mail]);if(attempt.current?.key!==key)attempt.current={key,body:{action:'create',actionId:crypto.randomUUID(),id:crypto.randomUUID(),name:clean,kind,trade:null,contactName:null,email:mail,phone:'',identification:'',notes:null}};
  setBusy(true);onBusyChange?.(true);setError('');
  try{const response=await fetch('/api/pro/company-vendors',{method:'POST',headers:{'Content-Type':'application/json','X-Pro-Expected-Actor':accountId},body:JSON.stringify(attempt.current.body)});if(!response.ok)throw Error(String(response.status));
   const id=String(attempt.current.body.id);attempt.current=null;setName('');setEmail('');setOpen(false);await onCreated(id);
  }catch{setError(en?'Could not add it. Retry; it will not be added twice.':'No se pudo agregar. Reintente; no se agregará dos veces.');}
  finally{setBusy(false);onBusyChange?.(false);}
 }
 if(!open)return <Button type="button" variant="outline" className="mt-3 min-h-11" data-bid-vendor-add disabled={disabled} onClick={()=>setOpen(true)}>{en?'Add supplier or subcontractor':'Agregar proveedor o subcontratista'}</Button>;
 return <div data-bid-vendor-inline className="mt-3 min-w-0 space-y-3 rounded-xl border border-dashed border-[#d7e1ea] p-3">
  <p className="text-sm font-semibold">{en?'New supplier or subcontractor':'Nuevo proveedor o subcontratista'}</p>
  <div className="grid min-w-0 gap-3 md:grid-cols-3">
   <label className={label}>{en?'Name or company name':'Nombre o razón social'}<input className={field} value={name} maxLength={160} disabled={busy} onChange={e=>{setName(e.target.value);setError('');}}/></label>
   <label className={label}>{en?'Type':'Tipo'}<select className={field} value={kind} disabled={busy} onChange={e=>setKind(e.target.value as 'supplier'|'subcontractor')}><option value="subcontractor">{en?'Subcontractor':'Subcontratista'}</option><option value="supplier">{en?'Supplier':'Proveedor'}</option></select></label>
   <label className={label}>{en?'Email (optional)':'Correo (opcional)'}<input type="email" inputMode="email" className={field} value={email} maxLength={254} disabled={busy} onChange={e=>{setEmail(e.target.value);setError('');}}/></label>
  </div>
  {error&&<p ref={errorRef} role="alert" className="text-sm text-[#9b2c2c]">{error}</p>}
  <div className="flex flex-wrap gap-2"><Button type="button" className="min-h-11" disabled={busy||disabled} onClick={()=>void create()}>{busy?(en?'Adding…':'Agregando…'):(en?'Add and select':'Agregar y seleccionar')}</Button><Button type="button" variant="secondary" className="min-h-11" disabled={busy} onClick={()=>{setOpen(false);setError('');attempt.current=null;}}>{en?'Cancel':'Cancelar'}</Button></div>
  <p className="text-xs text-[#52627a]">{en?'It is saved in Company › Suppliers. Nothing is sent to it.':'Se guarda en Empresa › Proveedores. No se le envía nada.'}</p>
 </div>;
}
function FormView({form,setForm,c,en,sources,sourcesError,today,saving,busy,onSubmit,onCancel,onRetrySources,messages,accountId,onVendorCreated}:{form:Form;setForm:(f:Form)=>void;c:Copy;en:boolean;sources:BidSources|null;sourcesError:boolean;today:string;saving:boolean;busy:boolean;onSubmit:(e:FormEvent)=>void;onCancel:()=>void;onRetrySources:()=>void;messages?:ReactNode;accountId:string;onVendorCreated:(id:string)=>Promise<void>}){
 // Round 7B (bug 7): «Invite» stayed enabled while a vendor added in place was
 // still being saved, so a quick click sent an empty selection («Could not save»).
 const [creating,setCreating]=useState(false);
 const actions=(label:string)=><>{messages}<div className="flex flex-wrap gap-2"><Button type="submit" className="min-h-11" disabled={busy||creating}>{saving?c.saving:label}</Button><Button type="button" variant="secondary" className="min-h-11" disabled={saving} onClick={onCancel}>{c.cancel}</Button></div></>;
 const sourcesNote=sourcesError?<p role="alert" className="text-sm text-[#9b2c2c]">{c.sourcesError} <button type="button" className="min-h-11 font-semibold text-[#008bb5] underline" onClick={onRetrySources}>{c.retry}</button></p>:null;
 if(form.mode==='create'||form.mode==='edit'){
  const d=form.draft,set=(draft:PackageDraft)=>setForm({...form,draft});
  const setLine=(i:number,patch:Partial<LineDraft>)=>set({...d,lines:d.lines.map((line,j)=>j===i?{...line,...patch}:line)});
  const append=(line:LineDraft)=>set({...d,lines:(d.lines.length===1&&!d.lines[0].description.trim()?[]:d.lines).concat(line).slice(0,100)});
  return <form data-bid-form={form.mode} onSubmit={onSubmit} noValidate className="min-w-0 space-y-4 rounded-2xl border border-[#d7e1ea] bg-white p-4">
   <label className={label}>{c.packageTitle}<input className={field} value={d.title} maxLength={160} placeholder={c.titlePlaceholder} required onChange={e=>set({...d,title:e.target.value})}/></label>
   <label className={label}>{c.scope}<textarea className={field+' min-h-24 py-2'} value={d.scope} maxLength={4000} onChange={e=>set({...d,scope:e.target.value})}/><span className="mt-1 block text-xs font-normal text-[#52627a]">{c.scopeHelp}</span></label>
   <label className={label}>{c.dueDate}<input type="date" className={field} value={d.dueDate} min={today||undefined} onChange={e=>set({...d,dueDate:e.target.value})}/><span className="mt-1 block text-xs font-normal text-[#52627a]">{c.dueHelp}</span></label>
   <fieldset className="min-w-0 space-y-3"><legend className="text-base font-semibold">{c.items}</legend>
    {sourcesNote}
    {sources&&<div className="grid min-w-0 gap-3 md:grid-cols-2">
     {sources.budgetItems.length>0&&<label className={label}>{c.fromBudget}<select className={field} value="" onChange={e=>{const item=sources.budgetItems.find(b=>b.id===e.target.value);if(item)append({id:crypto.randomUUID(),description:item.title,quantity:'1',unit:c.defaultUnit,budgetCodeId:item.id});}}><option value="">{c.choose}</option>{sources.budgetItems.map(b=><option key={b.id} value={b.id}>{b.code} · {b.title}</option>)}</select></label>}
     {sources.estimateLines.length>0&&<label className={label}>{c.fromEstimate}<select className={field} value="" onChange={e=>{const item=sources.estimateLines.find(x=>x.estimateId+':'+x.lineId===e.target.value);if(item)append({id:crypto.randomUUID(),description:item.description,quantity:quantityToInput(item.quantity,en),unit:item.unit,budgetCodeId:''});}}><option value="">{c.choose}</option>{sources.estimateLines.map(x=><option key={x.estimateId+':'+x.lineId} value={x.estimateId+':'+x.lineId}>{x.estimateTitle} · {x.description}</option>)}</select></label>}
    </div>}
    {d.lines.map((line,i)=><div key={line.id} className="min-w-0 rounded-xl border border-[#d7e1ea] bg-[#f7f9fc] p-3"><p className="text-sm font-semibold">{c.line(i+1)}</p>
     <label className={label+' mt-2'}>{c.description}<input className={field} value={line.description} maxLength={300} onChange={e=>setLine(i,{description:e.target.value})}/></label>
     <div className="mt-2 grid min-w-0 grid-cols-2 gap-3 md:grid-cols-3"><label className={label}>{c.quantity}<input className={field} inputMode="decimal" value={line.quantity} onChange={e=>setLine(i,{quantity:e.target.value})}/></label>
      <label className={label}>{c.unit}<input className={field} value={line.unit} maxLength={20} placeholder={c.unitPlaceholder} onChange={e=>setLine(i,{unit:e.target.value})}/></label>
      {sources&&sources.budgetItems.length>0&&<label className={label+' col-span-2 md:col-span-1'}>{c.budgetItem}<select className={field} value={line.budgetCodeId} onChange={e=>setLine(i,{budgetCodeId:e.target.value})}><option value="">{c.noBudget}</option>{sources.budgetItems.map(b=><option key={b.id} value={b.id}>{b.code} · {b.title}</option>)}</select></label>}</div>
     {d.lines.length>1&&<Button type="button" variant="ghost" className="mt-2 min-h-11" onClick={()=>set({...d,lines:d.lines.filter((_,j)=>j!==i)})}>{c.removeLine}</Button>}
    </div>)}
    {d.lines.length<100&&<Button type="button" variant="secondary" className="min-h-11" onClick={()=>set({...d,lines:[...d.lines,newLine()]})}>{c.addLine}</Button>}
   </fieldset>
   {actions(form.mode==='create'?c.save:c.saveEdit)}
  </form>;
 }
 if(form.mode==='invite'){
  const invited=new Set(form.pkg.vendors.map(v=>v.supplierId)),options=(sources?.vendors??[]).filter(v=>!invited.has(v.id));
  return <form data-bid-form="invite" onSubmit={onSubmit} className="min-w-0 space-y-4 rounded-2xl border border-[#d7e1ea] bg-white p-4"><fieldset className="min-w-0"><legend className="text-base font-semibold">{c.invite}</legend><p className="mt-1 text-sm text-[#52627a]">{c.inviteHelp}</p>
   {sourcesNote}{sources&&options.length===0&&<p className="mt-3 text-sm text-[#52627a]">{c.noVendors}</p>}
   <ul className="mt-3 grid min-w-0 gap-2 md:grid-cols-2">{options.map(v=><li key={v.id}><label className="flex min-h-11 min-w-0 items-center gap-3 rounded-xl border border-[#d7e1ea] p-3"><input type="checkbox" className="size-5 shrink-0" checked={form.draft.ids.includes(v.id)} onChange={e=>setForm({...form,draft:{ids:e.target.checked?[...form.draft.ids,v.id].slice(0,30):form.draft.ids.filter(x=>x!==v.id)}})}/>
    <span className="min-w-0"><span className="block break-words font-semibold">{v.name}</span><span className="block text-xs text-[#52627a]">{c.kind[v.kind]}{v.trade?' · '+v.trade:''}</span></span></label></li>)}</ul>
   <InlineVendor en={en} accountId={accountId} disabled={saving||busy} onCreated={onVendorCreated} onBusyChange={setCreating}/></fieldset>
   {actions(c.saveInvite)}</form>;
 }
 if(form.mode==='response'){
  const d=form.draft,set=(draft:ResponseDraft)=>setForm({...form,draft}),vendor=form.pkg.vendors.find(v=>v.supplierId===d.supplierId);
  return <form data-bid-form="response" onSubmit={onSubmit} noValidate className="min-w-0 space-y-4 rounded-2xl border border-[#d7e1ea] bg-white p-4"><h4 className="text-base font-semibold">{c.responseTitle(vendor?.name??'')}</h4>
   <div className="grid min-w-0 gap-3 md:grid-cols-3"><label className={label}>{c.receivedOn}<input type="date" className={field} value={d.receivedOn} max={today||undefined} onChange={e=>set({...d,receivedOn:e.target.value})}/></label>
    <label className={label}>{c.leadInput}<input className={field} inputMode="numeric" value={d.leadDays} maxLength={4} onChange={e=>set({...d,leadDays:e.target.value})}/></label>
    <label className={label}>{c.validInput}<input type="date" className={field} value={d.validUntil} min={d.receivedOn||undefined} onChange={e=>set({...d,validUntil:e.target.value})}/></label></div>
   <fieldset className="min-w-0 space-y-2"><legend className="text-sm font-semibold">{c.unitPrice}</legend><p className="text-sm text-[#52627a]">{c.priceHelp}</p>
    {form.pkg.lines.map(line=><label key={line.id} className="grid min-w-0 gap-1 rounded-xl border border-[#d7e1ea] p-3 md:grid-cols-[1fr_12rem] md:items-center"><span className="min-w-0 break-words text-sm"><span className="font-semibold">{line.description}</span> <span className="text-[#52627a]">· {formatQuantity(line.quantity,en)} {line.unit}</span></span>
     <input className={field+' mt-0'} inputMode="decimal" aria-label={`${c.unitPrice} · ${line.description}`} value={d.prices[line.id]??''} onChange={e=>set({...d,prices:{...d.prices,[line.id]:e.target.value}})}/></label>)}</fieldset>
   <label className={label}>{c.notesInput}<textarea className={field+' min-h-20 py-2'} value={d.notes} maxLength={2000} onChange={e=>set({...d,notes:e.target.value})}/></label>
   {actions(c.saveResponse)}</form>;
 }
 if(form.mode==='award'){
  const d=form.draft,vendors=form.pkg.vendors.filter(v=>v.response),full=vendors.filter(v=>v.missingCount===0&&!v.archived);
  const pick=(choice:Record<string,string>)=>setForm({...form,draft:{choice}});
  return <form data-bid-form="award" onSubmit={onSubmit} className="min-w-0 space-y-4 rounded-2xl border border-[#d7e1ea] bg-white p-4"><h4 className="text-base font-semibold">{c.award}</h4><p className="text-sm text-[#52627a]">{c.awardHelp}</p>
   <div className="flex flex-wrap gap-2"><Button type="button" variant="secondary" className="min-h-11" onClick={()=>pick(Object.fromEntries(form.pkg.lines.map(line=>[line.id,line.lowestSupplierIds.find(id=>!vendors.find(v=>v.supplierId===id)?.archived)??''])))}>{c.awardLowest}</Button>
    {full.map(v=><Button key={v.supplierId} type="button" variant="secondary" className="min-h-11" onClick={()=>pick(Object.fromEntries(form.pkg.lines.map(line=>[line.id,v.supplierId])))}>{c.awardAll(v.name)}</Button>)}</div>
   {form.pkg.lines.map(line=><label key={line.id} className={label+' rounded-xl border border-[#d7e1ea] p-3'}><span className="block break-words">{line.description} <span className="font-normal text-[#52627a]">· {formatQuantity(line.quantity,en)} {line.unit}</span></span>
    <select className={field} value={d.choice[line.id]??''} onChange={e=>pick({...d.choice,[line.id]:e.target.value})}><option value="">{c.nobody}</option>
     {line.offers.map(o=>{const v=vendors.find(x=>x.supplierId===o.supplierId);return v&&!v.archived?<option key={o.supplierId} value={o.supplierId}>{v.name} · {money(o.totalCents)}{line.lowestSupplierIds.includes(o.supplierId)?' · '+c.lowest:''}</option>:null;})}</select></label>)}
   {actions(c.saveAward)}</form>;
 }
 if(form.mode!=='reopen')return null;
 return <form data-bid-form="reopen" onSubmit={onSubmit} className="min-w-0 space-y-4 rounded-2xl border border-[#d7e1ea] bg-white p-4"><label className={label}>{c.newDue}<input type="date" className={field} value={form.draft.dueDate} min={today||undefined} required onChange={e=>setForm({...form,draft:{dueDate:e.target.value}})}/></label>{actions(c.saveReopen)}</form>;
}
