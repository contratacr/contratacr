'use client';
import {ClientBulkApprove} from './round10-selections';

import {useCallback,useEffect,useLayoutEffect,useMemo,useRef,useState,type FormEvent,type ReactNode} from 'react';
import {useLocale} from 'next-intl';
import {useAuth} from '@/hooks/use-auth';
import {useAppDialog} from '@/hooks/use-app-dialog';
import {Button} from '@/components/ui/button';
import {CatalogSpecsLine,useCatalogSpecs} from './catalog-specs-line';
import {proMoney} from '@/lib/pro/money';
import {allowanceMutationSchema,centsToInput,colonesToCents,parseQuantity,quantityToInput} from '@/lib/pro/allowances';
import {workFilesPageSchema,type WorkFile} from '@/lib/pro/work-files';
import {
 SELECTION_NOTES_MAX,SELECTION_URL_MAX,clientSelectionResultSchema,clientSelectionsSchema,isSelectionUrl,selectionDetailSchema,selectionMutationSchema,selectionResultSchema,
 type ClientSelectionItem,type ClientSelections,type SelectionArea,type SelectionDetail,type SelectionHistoryEntry,type SelectionItem,type SelectionMutation,type SelectionOption,type SelectionState,
} from '@/lib/pro/selections';
import {useProChildGuard} from './use-pro-child-guard';

/**
 * Selecciones (family 62): board per area with options, the tracker table, and
 * the customer's approval inside My projects. Amounts are CRC; nothing here
 * charges, invoices or notifies anyone.
 */
const api='/api/pro/selections',field='mt-1 block min-h-11 w-full min-w-0 rounded-xl border border-[#d7e1ea] bg-white px-3 text-base font-normal';
type StateCallback={onStateChange?:(state:{dirty:boolean;busy:boolean})=>void};
type AreaDraft={name:string};
type ItemDraft={areaId:string;name:string;dueDate:string;notes:string;allowanceId:string};
type OptionDraft={name:string;brand:string;url:string;quantity:string;unit:string;clientNotes:string;imageFileId:string};
type Form=
 |{kind:'area';area:SelectionArea|null;draft:AreaDraft;initial:AreaDraft}
 |{kind:'item';item:SelectionItem|null;draft:ItemDraft;initial:ItemDraft}
 |{kind:'option';item:SelectionItem;option:SelectionOption|null;draft:OptionDraft;initial:OptionDraft};
type Pending={url:string;body:string;notice:string};
const money=(cents:number)=>proMoney(cents/100);
const day=(value:string,en:boolean)=>new Intl.DateTimeFormat(en?'en-US':'es-CR',{dateStyle:'medium',timeZone:'UTC'}).format(new Date(value+'T12:00:00Z'));
const stamp=(value:string,en:boolean)=>new Intl.DateTimeFormat(en?'en-US':'es-CR',{dateStyle:'medium',timeStyle:'short',timeZone:'America/Costa_Rica'}).format(new Date(value));
const quantityText=(value:number,en:boolean)=>new Intl.NumberFormat(en?'en-US':'es-CR',{maximumFractionDigits:2}).format(value);
const quantityInput=(value:number,en:boolean)=>quantityToInput(value,en,2);
const same=(a:object,b:object)=>JSON.stringify(a)===JSON.stringify(b);
const imageUrl=(optionId:string)=>api+'?'+new URLSearchParams({image:optionId});

function copy(en:boolean){
 return en?{
  title:'Selections',intro:'Organize by area what your customer still has to choose, offer options with price and photo, and publish each item when it is ready for approval.',
  board:'Board',tracker:'Tracker',newArea:'New area',areaName:'Area name',areaPlaceholder:'E.g. Kitchen',saveArea:'Save area',rename:'Rename',
  newItem:'New item',itemName:'What has to be chosen',itemPlaceholder:'E.g. Faucet',area:'Area',due:'Decision deadline (optional)',notes:'Internal notes (optional)',notesHelp:'Only you can see these notes.',
  allowance:'Linked allowance (optional)',noAllowance:'No allowance',saveItem:'Save item',saveChanges:'Save changes',cancel:'Cancel',saving:'Saving…',
  addOption:'Add option',optionName:'Option name',optionPlaceholder:'E.g. Single-handle faucet, brushed steel',brand:'Supplier or brand (optional)',url:'Product link (optional)',urlHelp:'Only https:// links.',
  quantity:'Quantity',unit:'Unit price (₡)',clientNotes:'Notes for the customer (optional)',clientNotesHelp:'Your customer sees these notes.',image:'Photo (optional)',noImage:'No photo',
  imageHelp:'Choose a photo already uploaded to this job. Upload photos in Updates › Job files.',imageLoadError:'Could not load the job photos.',saveOption:'Save option',
  total:'Total',each:(q:string,u:string)=>`${q} × ${u}`,viewProduct:'View product',recommend:'Mark as recommended',unrecommend:'Remove recommendation',recommended:'Recommended',approvedOption:'Approved',
  edit:'Edit',remove:'Remove',publish:'Publish to customer',unpublish:'Unpublish',reopen:'Reopen',archive:'Archive',restore:'Restore',
  states:{no_options:'No options',draft:'Not published',pending_client:'Waiting for customer',approved:'Approved',changes_requested:'Changes requested',archived:'Archived'} as Record<SelectionState,string>,
  published:'Published',pastDue:'Past due',dueOn:(v:string)=>`Decide by ${v}`,noDue:'No deadline',clientComment:'Customer comment',approvedOn:(v:string)=>`Approved on ${v}`,
  emptyAreas:'There are no areas yet.',emptyAreasHelp:'Create one area per space, for example Kitchen or Main bathroom, and add the items to choose.',emptyItems:'No items in this area yet.',noOptions:'Add at least one option before publishing.',
  archiveAreaHint:'Archive or move its items to archive this area.',showArchived:(n:number)=>`Show archived (${n})`,hideArchived:'Hide archived',archivedAreas:'Archived areas',archivedItems:'Archived items',
  loading:'Loading selections…',loadError:'Could not load the selections.',retry:'Retry',reload:'Reload',
  conflict:'This selection changed in another window or was answered by your customer. Reload before trying again.',uncertain:'We could not confirm whether it was saved. Retry the same operation; it will not be applied twice.',retrySame:'Retry the same operation',
  failed:'Could not save. Review the information and try again.',invalidArea:'Enter an area name.',invalidItem:'Enter what has to be chosen. The date must be a real day.',
  invalidOption:'Enter a name, a quantity greater than zero and a valid unit price. The link must start with https://.',
  saved:'Saved.',published_:'Item published. Your customer can now approve it.',unpublished_:'Item unpublished.',reopened_:'Item reopened.',archived_:'Item archived.',restored_:'Restored.',
  leave:'Save or cancel the selection you are editing before leaving.',back:'Back',
  publishTitle:'Publish this item to your customer?',publishText:'Your customer will see its options (never your internal notes) and can approve one or ask for changes. No notification is sent.',
  publishPhotos:'The photos of its options also become visible to your customer, even if you have not shared them in Job files.',
  reopenTitle:'Reopen this item?',reopenText:'The current answer is cleared and kept in the history. If it is still published, it goes back to waiting for your customer.',
  archiveTitle:'Archive this item?',archiveText:'It leaves the board, the tracker and the customer view. You can restore it.',removeTitle:'Remove this option?',removeText:'It is kept in the history.',
  clientOff:'The Selections section is off in the Customer view: published items are not visible to your customer yet.',openClientView:'Open Customer view',
  linkedAllowance:(v:string)=>`Allowance: ${v}`,applyAllowance:'Use this total in the allowance',applyTitle:'Use the approved total in the allowance?',
  applyText:(v:string)=>`The allowance is defined with the approved option and a total of ${v}. Nothing is charged or invoiced; you can reopen it in Allowances.`,
  applied:'Allowance defined with the approved option.',allowanceDecided:(v:string)=>`The allowance is already defined (${v}). Reopen it in Allowances to change it.`,allowanceFailed:'Could not define the allowance. Reload and try again.',
  summary:{total:'Items',pending:'Waiting for customer',approved:'Approved',changes:'Changes requested',overdue:'Past due'},
  filterState:'Status',filterArea:'Area',all:'All',onlyOverdue:'Only past due',noRows:'No items match these filters.',
  col:{area:'Area',item:'Item',state:'Status',option:'Approved option',total:'Total',due:'Deadline'},none:'—',
  history:'Change history',historyEmpty:'No changes yet.',byCustomer:'Customer',
  actions:{area_create:'Area created',area_update:'Area renamed',area_archive:'Area archived',area_restore:'Area restored',item_create:'Item created',item_update:'Item edited',option_add:'Option added',option_update:'Option edited',option_remove:'Option removed',recommend:'Recommendation changed',publish:'Published',unpublish:'Unpublished',reopen:'Reopened',archive:'Archived',restore:'Restored',approve:'Approved by the customer',request_changes:'Changes requested by the customer'} as Record<SelectionHistoryEntry['action'],string>,
  // Customer side
  clientTitle:'Selections',clientIntro:'Review the options your professional prepared and approve one, or ask for changes.',approve:'Approve this option',approveTitle:'Approve this option?',
  approveText:'Your professional will see your approval in the project. You can ask them to reopen it if you change your mind.',requestChanges:'Ask for changes',comment:'What would you like to change?',sendComment:'Send comment',
  youApproved:(v:string)=>`You approved: ${v}`,youAsked:'You asked for changes',waitingPro:'Your professional will review your comment.',recommendedByPro:'Recommended by your professional',
  approvedDone:'Option approved.',commentDone:'Comment sent to your professional.',clientConflict:'This item changed. We reloaded it; review it before answering.',clientFailed:'Could not save your answer. Try again.',
  clientLoadError:'Could not load the selections.',commentRequired:'Write a comment.',clientEmpty:'There are no selections to review yet.',photo:(v:string)=>`Photo of ${v}`,
 }:{
  title:'Selecciones',intro:'Organice por área lo que su cliente aún debe elegir, ofrezca opciones con precio y foto, y publique cada ítem cuando esté listo para aprobar.',
  board:'Tablero',tracker:'Seguimiento',newArea:'Nueva área',areaName:'Nombre del área',areaPlaceholder:'Ej.: Cocina',saveArea:'Guardar área',rename:'Renombrar',
  newItem:'Nuevo ítem',itemName:'Qué se debe elegir',itemPlaceholder:'Ej.: Grifería',area:'Área',due:'Fecha límite para decidir (opcional)',notes:'Notas internas (opcional)',notesHelp:'Solo usted ve estas notas.',
  allowance:'Monto previsto vinculado (opcional)',noAllowance:'Sin monto previsto',saveItem:'Guardar ítem',saveChanges:'Guardar cambios',cancel:'Cancelar',saving:'Guardando…',
  addOption:'Agregar opción',optionName:'Nombre de la opción',optionPlaceholder:'Ej.: Grifo monomando, acero cepillado',brand:'Proveedor o marca (opcional)',url:'Enlace del producto (opcional)',urlHelp:'Solo enlaces https://.',
  quantity:'Cantidad',unit:'Precio unitario (₡)',clientNotes:'Notas para el cliente (opcional)',clientNotesHelp:'Su cliente ve estas notas.',image:'Foto (opcional)',noImage:'Sin foto',
  imageHelp:'Elija una foto ya subida a este trabajo. Las fotos se suben en Avances › Archivos del trabajo.',imageLoadError:'No se pudieron cargar las fotos del trabajo.',saveOption:'Guardar opción',
  total:'Total',each:(q:string,u:string)=>`${q} × ${u}`,viewProduct:'Ver producto',recommend:'Marcar como recomendada',unrecommend:'Quitar recomendación',recommended:'Recomendada',approvedOption:'Aprobada',
  edit:'Editar',remove:'Quitar',publish:'Publicar al cliente',unpublish:'Retirar publicación',reopen:'Reabrir',archive:'Archivar',restore:'Restaurar',
  states:{no_options:'Sin opciones',draft:'Sin publicar',pending_client:'Pendiente del cliente',approved:'Aprobado',changes_requested:'Cambios solicitados',archived:'Archivado'} as Record<SelectionState,string>,
  published:'Publicado',pastDue:'Vencido',dueOn:(v:string)=>`Decidir antes del ${v}`,noDue:'Sin fecha límite',clientComment:'Comentario del cliente',approvedOn:(v:string)=>`Aprobado el ${v}`,
  emptyAreas:'Todavía no hay áreas.',emptyAreasHelp:'Cree un área por espacio, por ejemplo Cocina o Baño principal, y agregue los ítems por elegir.',emptyItems:'Todavía no hay ítems en esta área.',noOptions:'Agregue al menos una opción antes de publicar.',
  archiveAreaHint:'Archive o mueva sus ítems para archivar esta área.',showArchived:(n:number)=>`Mostrar archivados (${n})`,hideArchived:'Ocultar archivados',archivedAreas:'Áreas archivadas',archivedItems:'Ítems archivados',
  loading:'Cargando selecciones…',loadError:'No se pudieron cargar las selecciones.',retry:'Reintentar',reload:'Recargar',
  conflict:'Esta selección cambió en otra ventana o su cliente ya respondió. Recargue antes de volver a intentarlo.',uncertain:'No pudimos confirmar si se guardó. Reintente la misma operación; no se aplicará dos veces.',retrySame:'Reintentar la misma operación',
  failed:'No se pudo guardar. Revise los datos y vuelva a intentarlo.',invalidArea:'Indique el nombre del área.',invalidItem:'Indique qué se debe elegir. La fecha debe ser un día real.',
  invalidOption:'Indique un nombre, una cantidad mayor que cero y un precio unitario válido. El enlace debe empezar con https://.',
  saved:'Guardado.',published_:'Ítem publicado. Su cliente ya puede aprobarlo.',unpublished_:'Publicación retirada.',reopened_:'Ítem reabierto.',archived_:'Ítem archivado.',restored_:'Restaurado.',
  leave:'Guarde o cancele la selección que está editando antes de salir.',back:'Volver',
  publishTitle:'¿Publicar este ítem a su cliente?',publishText:'Su cliente verá sus opciones (nunca sus notas internas) y podrá aprobar una o pedir cambios. No se envía ninguna notificación.',
  publishPhotos:'Las fotos de sus opciones también quedan visibles para su cliente, aunque no las haya compartido en Archivos del trabajo.',
  reopenTitle:'¿Reabrir este ítem?',reopenText:'La respuesta actual se quita y queda en el historial. Si sigue publicado, vuelve a quedar pendiente del cliente.',
  archiveTitle:'¿Archivar este ítem?',archiveText:'Sale del tablero, del seguimiento y de la vista del cliente. Puede restaurarlo.',removeTitle:'¿Quitar esta opción?',removeText:'Queda en el historial.',
  clientOff:'La sección Selecciones está apagada en la Vista del cliente: su cliente todavía no ve los ítems publicados.',openClientView:'Abrir Vista del cliente',
  linkedAllowance:(v:string)=>`Monto previsto: ${v}`,applyAllowance:'Usar este total en el monto previsto',applyTitle:'¿Usar el total aprobado en el monto previsto?',
  applyText:(v:string)=>`El monto previsto se define con la opción aprobada y un total de ${v}. No se cobra ni se factura nada; puede reabrirlo en Montos previstos.`,
  applied:'Monto previsto definido con la opción aprobada.',allowanceDecided:(v:string)=>`El monto previsto ya está definido (${v}). Reábralo en Montos previstos para cambiarlo.`,allowanceFailed:'No se pudo definir el monto previsto. Recargue y vuelva a intentarlo.',
  summary:{total:'Ítems',pending:'Pendientes del cliente',approved:'Aprobados',changes:'Cambios solicitados',overdue:'Vencidos'},
  filterState:'Estado',filterArea:'Área',all:'Todos',onlyOverdue:'Solo vencidos',noRows:'Ningún ítem coincide con estos filtros.',
  col:{area:'Área',item:'Ítem',state:'Estado',option:'Opción aprobada',total:'Total',due:'Fecha límite'},none:'—',
  history:'Historial de cambios',historyEmpty:'Todavía no hay cambios.',byCustomer:'Cliente',
  actions:{area_create:'Área creada',area_update:'Área renombrada',area_archive:'Área archivada',area_restore:'Área restaurada',item_create:'Ítem creado',item_update:'Ítem editado',option_add:'Opción agregada',option_update:'Opción editada',option_remove:'Opción quitada',recommend:'Recomendación cambiada',publish:'Publicado',unpublish:'Publicación retirada',reopen:'Reabierto',archive:'Archivado',restore:'Restaurado',approve:'Aprobado por el cliente',request_changes:'Cambios pedidos por el cliente'} as Record<SelectionHistoryEntry['action'],string>,
  clientTitle:'Selecciones',clientIntro:'Revise las opciones que preparó su profesional y apruebe una, o pida cambios.',approve:'Aprobar esta opción',approveTitle:'¿Aprobar esta opción?',
  approveText:'Su profesional verá su aprobación en el proyecto. Si cambia de idea, puede pedirle que la reabra.',requestChanges:'Pedir cambios',comment:'¿Qué le gustaría cambiar?',sendComment:'Enviar comentario',
  youApproved:(v:string)=>`Usted aprobó: ${v}`,youAsked:'Usted pidió cambios',waitingPro:'Su profesional revisará su comentario.',recommendedByPro:'Recomendada por su profesional',
  approvedDone:'Opción aprobada.',commentDone:'Comentario enviado a su profesional.',clientConflict:'Este ítem cambió. Lo recargamos; revíselo antes de responder.',clientFailed:'No se pudo guardar su respuesta. Vuelva a intentarlo.',
  clientLoadError:'No se pudieron cargar las selecciones.',commentRequired:'Escriba un comentario.',clientEmpty:'Todavía no hay selecciones para revisar.',photo:(v:string)=>`Foto de ${v}`,
 };
}
type Copy=ReturnType<typeof copy>;

const stateTone:Record<SelectionState,string>={no_options:'bg-[#f1f4f8] text-[#52627a]',draft:'bg-[#f1f4f8] text-[#52627a]',pending_client:'bg-[#eaf5fb] text-[#006e90]',approved:'bg-[#eef8f4] text-[#18573a]',changes_requested:'bg-[#fff6e5] text-[#7a4b00]',archived:'bg-[#f1f4f8] text-[#52627a]'};
function StateBadge({state,c,wrap}:{state:SelectionState;c:Copy;wrap?:boolean}){return <span data-selection-state={state} className={`${wrap?'inline-block max-w-full whitespace-normal':'whitespace-nowrap'} rounded-full px-2.5 py-1 text-xs font-semibold ${stateTone[state]}`}>{c.states[state]}</span>;}
const itemDraftOf=(item:SelectionItem):ItemDraft=>({areaId:item.areaId,name:item.name,dueDate:item.dueDate??'',notes:item.notes??'',allowanceId:item.allowanceId??''});
const optionDraftOf=(option:SelectionOption,en:boolean):OptionDraft=>({name:option.name,brand:option.brand??'',url:option.url??'',quantity:quantityInput(option.quantity,en),unit:centsToInput(option.unitCents),clientNotes:option.clientNotes??'',imageFileId:option.imageFileId??''});
const emptyOption:OptionDraft={name:'',brand:'',url:'',quantity:'1',unit:'',clientNotes:'',imageFileId:''};

export function WorkSelections({workId,onStateChange,onOpenClientView}:{workId:string;onOpenClientView?:()=>void}&StateCallback){
 const {user,loading}=useAuth();if(loading||!user)return null;
 return <SelectionsSession key={user.id+':'+workId} accountId={user.id} workId={workId} onStateChange={onStateChange} onOpenClientView={onOpenClientView}/>;
}

function SelectionsSession({accountId,workId,onStateChange,onOpenClientView}:{accountId:string;workId:string;onOpenClientView?:()=>void}&StateCallback){
 const en=useLocale()==='en',c=copy(en),{confirm,dialogNode}=useAppDialog();
 const [detail,setDetail]=useState<SelectionDetail|null>(null),[loading,setLoading]=useState(true),[loadError,setLoadError]=useState(false);
 const [form,setForm]=useState<Form|null>(null),[saving,setSaving]=useState(false),[uncertain,setUncertain]=useState(false),[conflict,setConflict]=useState(false);
 const [error,setError]=useState(''),[notice,setNotice]=useState(''),[mode,setMode]=useState<'board'|'tracker'>('board'),[showArchived,setShowArchived]=useState(false);
 const [files,setFiles]=useState<WorkFile[]|null>(null),[filesError,setFilesError]=useState(false);
 const active=useRef(true),sequence=useRef(0),lock=useRef(false),pending=useRef<Pending|null>(null);
 const dirty=!!form&&!same(form.draft,form.initial),busy=saving||uncertain;
 useProChildGuard(!onStateChange&&(dirty||busy),useCallback(()=>setError(c.leave),[c.leave]));
 useLayoutEffect(()=>{onStateChange?.({dirty,busy});return()=>onStateChange?.({dirty:false,busy:false});},[dirty,busy,onStateChange]);
 const load=useCallback(async()=>{
  const id=++sequence.current;setLoading(true);setLoadError(false);
  try{
   const response=await fetch(api+'?'+new URLSearchParams({workId}),{cache:'no-store',headers:{'X-Pro-Expected-Actor':accountId}});if(!response.ok)throw Error();
   const body=selectionDetailSchema.parse(await response.json());if(body.workId!==workId)throw Error();
   if(active.current&&id===sequence.current){setDetail(body);setConflict(false);}
  }catch{if(active.current&&id===sequence.current)setLoadError(true);}
  finally{if(active.current&&id===sequence.current)setLoading(false);}
 },[accountId,workId]);
 const invalidate=useCallback(()=>{sequence.current++;},[]);
 useEffect(()=>{active.current=true;const timer=setTimeout(()=>void load(),0);return()=>{active.current=false;invalidate();clearTimeout(timer);};},[load,invalidate]);
 const loadFiles=useCallback(async()=>{
  setFilesError(false);
  try{const response=await fetch('/api/pro/work-files?'+new URLSearchParams({workId}),{cache:'no-store',headers:{'X-Pro-Expected-Actor':accountId}});if(!response.ok)throw Error();const body=workFilesPageSchema.parse(await response.json());if(active.current)setFiles(body.items.filter(file=>file.ready&&file.mimeType==='image/jpeg'));}
  catch{if(active.current)setFilesError(true);}
 },[accountId,workId]);

 async function post(url:string,body:string,success:string){
  if(lock.current)return false;lock.current=true;pending.current={url,body,notice:success};setSaving(true);setError('');setNotice('');
  try{
   const response=await fetch(url,{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json','X-Pro-Expected-Actor':accountId},body});
   if(response.status===409){pending.current=null;setUncertain(false);setConflict(true);setError(c.conflict);return false;}
   if(response.status>=500||response.status===429){setUncertain(true);setError(c.uncertain);return false;}
   if(!response.ok){pending.current=null;setUncertain(false);setError(url===api?c.failed:c.allowanceFailed);return false;}
   if(url===api)selectionResultSchema.parse(await response.json());
   pending.current=null;setUncertain(false);
   if(active.current){setForm(null);setNotice(success);}
   lock.current=false;await load();return true;
  }catch{setUncertain(true);setError(c.uncertain);return false;}
  finally{lock.current=false;if(active.current)setSaving(false);}
 }
 const send=(input:SelectionMutation,success:string)=>post(api,JSON.stringify(input),success);
 // Round 9: options from the company catalog (name, price, preferred vendor, private copy of the image).
 const [catalogSources,setCatalogSources]=useState<Map<string,boolean>>(new Map());
 const loadSources=useCallback(async()=>{try{const r=await fetch(api+'?'+new URLSearchParams({catalogSources:workId}),{cache:'no-store',headers:{'X-Pro-Expected-Actor':accountId}});if(!r.ok)return;const body=await r.json() as {sources:{optionId:string;hasImage:boolean}[]};setCatalogSources(new Map(body.sources.map(row=>[row.optionId,row.hasImage])));}catch{}},[accountId,workId]);
 useEffect(()=>{const timer=setTimeout(()=>void loadSources(),0);return()=>clearTimeout(timer);},[loadSources]);
 async function catalogOption(item:SelectionItem,productId:string,quantity:number){if(busy||form)return;if(await post(api,JSON.stringify({action:'option_from_catalog',actionId:crypto.randomUUID(),workId,id:item.id,revision:item.revision,productId,quantity}),c.saved))void loadSources();}

 function submit(event:FormEvent){
  event.preventDefault();if(!form||busy||conflict)return;
  const base={workId,actionId:crypto.randomUUID()};
  if(form.kind==='area'){
   const parsed=selectionMutationSchema.safeParse(form.area?{action:'area_update',...base,id:form.area.id,revision:form.area.revision,name:form.draft.name}:{action:'area_create',...base,id:crypto.randomUUID(),name:form.draft.name});
   if(!parsed.success){setError(c.invalidArea);return;}void send(parsed.data,c.saved);return;
  }
  if(form.kind==='item'){
   const d=form.draft,fields={areaId:d.areaId,name:d.name,dueDate:d.dueDate||null,notes:d.notes.trim()||null,allowanceId:d.allowanceId||null};
   const parsed=selectionMutationSchema.safeParse(form.item?{action:'item_update',...base,id:form.item.id,revision:form.item.revision,...fields}:{action:'item_create',...base,id:crypto.randomUUID(),...fields});
   if(!parsed.success){setError(c.invalidItem);return;}void send(parsed.data,c.saved);return;
  }
  const d=form.draft,url=d.url.trim();
  if(url&&!isSelectionUrl(url)){setError(c.invalidOption);return;}
  const parsed=selectionMutationSchema.safeParse({action:form.option?'option_update':'option_add',...base,id:form.item.id,revision:form.item.revision,optionId:form.option?.id??crypto.randomUUID(),
   name:d.name,brand:d.brand.trim()||null,url:url||null,quantity:parseQuantity(d.quantity,en),unitCents:colonesToCents(d.unit),clientNotes:d.clientNotes.trim()||null,imageFileId:d.imageFileId||null});
  if(!parsed.success){setError(c.invalidOption);return;}void send(parsed.data,c.saved);
 }
 function open(next:Form){if(busy||conflict)return;setForm(next);setError('');setNotice('');if(next.kind==='option'&&files===null)void loadFiles();}
 function cancel(){setForm(null);setError('');}
 async function itemAction(item:SelectionItem,action:'publish'|'unpublish'|'reopen'|'archive'|'restore'){
  if(busy||form)return;
  if(action==='publish'||action==='reopen'||action==='archive'){
   // Publishing also serves the options' photos to the customer (not through Share with customer): say so.
   const text={publish:[c.publishTitle,item.options.some(option=>option.imageFileId)?`${c.publishText} ${c.publishPhotos}`:c.publishText,c.publish],reopen:[c.reopenTitle,c.reopenText,c.reopen],archive:[c.archiveTitle,c.archiveText,c.archive]}[action];
   const answer=await confirm({title:text[0],description:item.name,detail:text[1],confirmLabel:text[2],cancelLabel:c.back,tone:action==='archive'?'danger':'default'});if(!answer.confirmed)return;
  }
  void send({action,actionId:crypto.randomUUID(),workId,id:item.id,revision:item.revision},{publish:c.published_,unpublish:c.unpublished_,reopen:c.reopened_,archive:c.archived_,restore:c.restored_}[action]);
 }
 async function optionAction(item:SelectionItem,option:SelectionOption,action:'recommend'|'unrecommend'|'remove'){
  if(busy||form)return;
  if(action==='remove'){const answer=await confirm({title:c.removeTitle,description:option.name,detail:c.removeText,confirmLabel:c.remove,cancelLabel:c.back,tone:'danger'});if(!answer.confirmed)return;
   void send({action:'option_remove',actionId:crypto.randomUUID(),workId,id:item.id,revision:item.revision,optionId:option.id},c.saved);return;}
  void send({action:'recommend',actionId:crypto.randomUUID(),workId,id:item.id,revision:item.revision,optionId:action==='recommend'?option.id:null},c.saved);
 }
 function areaAction(area:SelectionArea,action:'area_archive'|'area_restore'){if(busy||form)return;void send({action,actionId:crypto.randomUUID(),workId,id:area.id,revision:area.revision},action==='area_archive'?c.saved:c.restored_);}
 // Explicit owner action through the existing allowances API (no automatic link).
 async function applyAllowance(item:SelectionItem,option:SelectionOption){
  const allowance=detail?.allowances.find(row=>row.id===item.allowanceId);if(!allowance||allowance.status==='decided'||busy||form)return;
  const answer=await confirm({title:c.applyTitle,description:`${allowance.name} · ${option.name}`,detail:c.applyText(money(option.totalCents)),confirmLabel:c.applyAllowance,cancelLabel:c.back});if(!answer.confirmed)return;
  const parsed=allowanceMutationSchema.safeParse({action:'decide',actionId:crypto.randomUUID(),workId,id:allowance.id,revision:allowance.revision,choiceDescription:option.name.slice(0,300),supplier:option.brand,quantity:option.quantity,actualCents:option.totalCents});
  if(!parsed.success){setError(c.allowanceFailed);return;}
  void post('/api/pro/allowances',JSON.stringify(parsed.data),c.applied);
 }

 if(loading&&!detail)return <p role="status" className="text-sm text-[#52627a]">{c.loading}</p>;
 if(!detail)return <div role="alert" data-selections-load-error className="space-y-2 rounded-2xl border border-[#d7e1ea] p-4"><p className="text-sm">{c.loadError}</p><Button type="button" variant="secondary" disabled={loading} onClick={()=>void load()}>{c.retry}</Button></div>;
 const areas=detail.areas.filter(area=>!area.archived),archivedAreas=detail.areas.filter(area=>area.archived);
 const items=detail.items.filter(item=>!item.archived),archivedItems=detail.items.filter(item=>item.archived);
 const locked=busy||conflict||!!form;
 const formNode=(target:'area'|'item'|'option',id:string|null)=>{
  if(!form||form.kind!==target)return null;
  if(form.kind==='area'&&(form.area?.id??null)===id)return <AreaForm c={c} form={form} busy={busy||conflict} saving={saving} onChange={draft=>setForm({...form,draft})} onSubmit={submit} onCancel={cancel}/>;
  if(form.kind==='item'&&(form.item?form.item.id:'new:'+form.initial.areaId)===id)return <ItemForm c={c} form={form} areas={areas} allowances={detail.allowances} busy={busy||conflict} saving={saving} onChange={draft=>setForm({...form,draft})} onSubmit={submit} onCancel={cancel}/>;
  if(form.kind==='option'&&(form.option?form.option.id:'new:'+form.item.id)===id)return <OptionForm c={c} form={form} files={files} filesError={filesError} onRetryFiles={()=>void loadFiles()} busy={busy||conflict} saving={saving} onChange={draft=>setForm({...form,draft})} onSubmit={submit} onCancel={cancel}/>;
  return null;
 };
 const counts={total:items.length,pending:items.filter(i=>i.state==='pending_client').length,approved:items.filter(i=>i.state==='approved').length,changes:items.filter(i=>i.state==='changes_requested').length,overdue:items.filter(i=>i.overdue).length};
 return <section data-selections className="space-y-5">
  {dialogNode}
  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
   <div className="min-w-0"><h3 className="text-lg font-bold text-[#162543]">{c.title}</h3><p className="mt-1 text-sm text-[#52627a]">{c.intro}</p></div>
   <Button type="button" className="min-h-11 shrink-0" disabled={locked} onClick={()=>open({kind:'area',area:null,draft:{name:''},initial:{name:''}})}>{c.newArea}</Button>
  </div>
  <dl data-selection-summary className="grid grid-cols-2 gap-2 sm:grid-cols-5">
   {(['total','pending','approved','changes','overdue'] as const).map(key=><div key={key} data-selection-count={key} className={`flex min-w-0 flex-col justify-between rounded-xl border border-[#d7e1ea] bg-[#f7f9fc] p-3 ${key==='total'?'col-span-2 sm:col-span-1':''}`}>
    <dt className="text-xs font-semibold text-[#52627a]">{c.summary[key]}</dt><dd className={`mt-1 text-base font-bold tabular-nums ${key==='overdue'&&counts.overdue>0?'text-[#a03c1f]':'text-[#162543]'}`}>{counts[key]}</dd></div>)}
  </dl>
  {!detail.clientVisible&&items.some(item=>item.published)&&<div data-selections-client-off className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#fff6e5] p-3 text-sm text-[#7a4b00]"><p className="min-w-0">{c.clientOff}</p>{onOpenClientView&&<Button type="button" variant="secondary" disabled={locked} onClick={onOpenClientView}>{c.openClientView}</Button>}</div>}
  {/* Segmented view switch (not ARIA tabs: there is no tabpanel/arrow-key model). */}
  <div role="group" aria-label={c.title} className="inline-flex rounded-xl bg-[#e9eff5] p-1">
   {(['board','tracker'] as const).map(value=><button key={value} type="button" aria-pressed={mode===value} data-selections-mode={value} onClick={()=>setMode(value)} className={`min-h-11 rounded-lg px-4 text-sm font-semibold ${mode===value?'bg-white text-[#008bb5] shadow-sm':'text-[#52627a]'}`}>{value==='board'?c.board:c.tracker}</button>)}
  </div>
  {notice&&<p role="status" className="rounded-xl bg-[#eef8f4] p-3 text-sm text-[#18573a]">{notice}</p>}
  {loadError&&<div role="alert" className="space-y-2 text-sm"><p>{c.loadError}</p><Button type="button" variant="secondary" disabled={loading||saving} onClick={()=>void load()}>{c.retry}</Button></div>}
  {error&&<div role="alert" data-selection-error className="space-y-2 rounded-xl bg-[#fff4f2] p-3 text-sm text-[#8a2a1b]"><p>{error}</p>
   {uncertain&&<Button type="button" variant="secondary" disabled={saving} onClick={()=>pending.current&&void post(pending.current.url,pending.current.body,pending.current.notice)}>{c.retrySame}</Button>}
   {conflict&&<Button type="button" variant="secondary" disabled={loading||saving} onClick={()=>{setForm(null);setError('');void load();}}>{c.reload}</Button>}</div>}
  {mode==='tracker'?<Tracker c={c} en={en} areas={detail.areas} items={items}/>:<div data-selections-board className="space-y-5">
   {formNode('area',null)}
   {!areas.length&&!(form?.kind==='area')&&<div data-selections-empty className="rounded-2xl border border-dashed border-[#d7e1ea] bg-[#f7f9fc] p-5 text-center"><p className="font-semibold text-[#162543]">{c.emptyAreas}</p><p className="mt-1 text-sm text-[#52627a]">{c.emptyAreasHelp}</p></div>}
   {areas.map(area=>{const areaItems=items.filter(item=>item.areaId===area.id);return <section key={area.id} data-selection-area={area.id} aria-label={area.name} className="space-y-3 rounded-2xl border border-[#d7e1ea] bg-[#f7f9fc] p-3 sm:p-4">
    {form?.kind==='area'&&form.area?.id===area.id?formNode('area',area.id):<div className="flex flex-wrap items-center justify-between gap-2">
     <h4 className="min-w-0 break-words text-base font-bold text-[#162543]">{area.name} <span className="font-normal text-[#52627a]">({areaItems.length})</span></h4>
     <div className="flex flex-wrap gap-2">
      <Button type="button" size="sm" className="min-h-11" disabled={locked} onClick={()=>{const initial={areaId:area.id,name:'',dueDate:'',notes:'',allowanceId:''};open({kind:'item',item:null,draft:initial,initial});}}>{c.newItem}</Button>
      <Button type="button" size="sm" variant="secondary" className="min-h-11" disabled={locked} onClick={()=>open({kind:'area',area,draft:{name:area.name},initial:{name:area.name}})}>{c.rename}</Button>
      {!areaItems.length&&<Button type="button" size="sm" variant="ghost" className="min-h-11" disabled={locked} onClick={()=>areaAction(area,'area_archive')}>{c.archive}</Button>}
     </div>
    </div>}
    {formNode('item','new:'+area.id)}
    {!areaItems.length&&!(form?.kind==='item'&&!form.item&&form.initial.areaId===area.id)&&<p className="text-sm text-[#52627a]">{c.emptyItems}</p>}
    {areaItems.map(item=>form?.kind==='item'&&form.item?.id===item.id?<div key={item.id}>{formNode('item',item.id)}</div>:
     <ItemCard key={item.id} c={c} en={en} item={item} allowance={detail.allowances.find(row=>row.id===item.allowanceId)??null} disabled={locked}
      optionForm={id=>formNode('option',id)}
      onEdit={()=>open({kind:'item',item,draft:itemDraftOf(item),initial:itemDraftOf(item)})}
      onAddOption={()=>open({kind:'option',item,option:null,draft:emptyOption,initial:emptyOption})}
      onEditOption={option=>open({kind:'option',item,option,draft:optionDraftOf(option,en),initial:optionDraftOf(option,en)})}
      onOption={(option,action)=>void optionAction(item,option,action)} onAction={action=>void itemAction(item,action)} onApply={option=>void applyAllowance(item,option)}
      catalogSources={catalogSources} onCatalog={(productId,quantity)=>void catalogOption(item,productId,quantity)}/>)}
   </section>;})}
   {(!!archivedItems.length||!!archivedAreas.length)&&<div className="space-y-2">
    <Button type="button" variant="secondary" className="min-h-11" aria-expanded={showArchived} onClick={()=>setShowArchived(value=>!value)}>{showArchived?c.hideArchived:c.showArchived(archivedItems.length+archivedAreas.length)}</Button>
    {showArchived&&<div data-selections-archived className="space-y-2">
     {!!archivedAreas.length&&<p className="text-sm font-semibold text-[#162543]">{c.archivedAreas}</p>}
     {archivedAreas.map(area=><div key={area.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#d7e1ea] bg-[#f7f9fc] p-3 text-sm"><span className="min-w-0 break-words font-semibold">{area.name}</span><Button type="button" variant="secondary" disabled={locked} onClick={()=>areaAction(area,'area_restore')}>{c.restore}</Button></div>)}
     {!!archivedItems.length&&<p className="text-sm font-semibold text-[#162543]">{c.archivedItems}</p>}
     {archivedItems.map(item=>{const area=detail.areas.find(row=>row.id===item.areaId);return <div key={item.id} data-selection-archived-item={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#d7e1ea] bg-[#f7f9fc] p-3 text-sm">
      <span className="min-w-0 break-words"><strong className="text-[#162543]">{item.name}</strong>{area?` · ${area.name}`:''}</span>
      <Button type="button" variant="secondary" disabled={locked||!!area?.archived} onClick={()=>void itemAction(item,'restore')}>{c.restore}</Button></div>;})}
    </div>}
   </div>}
  </div>}
  <details data-selection-history className="rounded-xl border border-[#d7e1ea] p-3">
   <summary className="min-h-11 cursor-pointer content-center font-semibold text-[#162543]">{c.history}</summary>
   {detail.history.length?<ol className="mt-2 space-y-2">{detail.history.map(entry=><li key={entry.actionId} data-selection-history-entry={entry.action} className="rounded-xl border border-[#e5e7eb] p-3 text-sm">
    <p className="text-xs text-[#68778d]">{stamp(entry.at,en)}{entry.side==='client'?` · ${c.byCustomer}`:''}</p>
    <p className="mt-1 break-words"><strong>{c.actions[entry.action]}</strong> · {String(entry.after.name??'')}</p>
    {entry.action==='request_changes'&&typeof entry.after.clientComment==='string'&&<p className="mt-1 whitespace-pre-wrap break-words text-[#52627a]">&quot;{entry.after.clientComment}&quot;</p>}
   </li>)}</ol>:<p className="mt-2 text-sm text-[#52627a]">{c.historyEmpty}</p>}
  </details>
 </section>;
}

function ItemCard({c,en,item,allowance,disabled,optionForm,onEdit,onAddOption,onEditOption,onOption,onAction,onApply,catalogSources,onCatalog}:{catalogSources:Map<string,boolean>;onCatalog:(productId:string,quantity:number)=>void;c:Copy;en:boolean;item:SelectionItem;allowance:SelectionDetail['allowances'][number]|null;disabled:boolean;optionForm:(id:string)=>ReactNode;
 onEdit:()=>void;onAddOption:()=>void;onEditOption:(option:SelectionOption)=>void;onOption:(option:SelectionOption,action:'recommend'|'unrecommend'|'remove')=>void;onAction:(action:'publish'|'unpublish'|'reopen'|'archive')=>void;onApply:(option:SelectionOption)=>void}){
 const approved=item.options.find(option=>option.id===item.approvedOptionId)??null,lockedOptions=item.status==='approved';
 return <article data-selection-item={item.id} className="space-y-3 rounded-2xl border border-[#d7e1ea] bg-white p-3 sm:p-4">
  <div className="flex flex-wrap items-start justify-between gap-2">
   <div className="min-w-0"><h5 className="break-words font-bold text-[#162543]">{item.name}</h5>
    <p className="text-sm text-[#52627a]">{item.dueDate?c.dueOn(day(item.dueDate,en)):c.noDue}</p></div>
   <div className="flex flex-wrap gap-1.5"><StateBadge state={item.state} c={c}/>{item.published&&item.state!=='pending_client'&&<span data-selection-published className="rounded-full bg-[#eaf5fb] px-2.5 py-1 text-xs font-semibold text-[#006e90]">{c.published}</span>}{item.overdue&&<span data-selection-overdue className="rounded-full bg-[#fff4f2] px-2.5 py-1 text-xs font-semibold text-[#8a2a1b]">{c.pastDue}</span>}</div>
  </div>
  {item.state==='changes_requested'&&item.clientComment&&<div data-selection-client-comment className="rounded-xl bg-[#fff6e5] p-3 text-sm text-[#7a4b00]"><p className="font-semibold">{c.clientComment}</p><p className="mt-1 whitespace-pre-wrap break-words">{item.clientComment}</p></div>}
  {approved&&item.approvedAt&&<p data-selection-approved className="text-sm font-semibold text-[#18573a]">{c.approvedOn(stamp(item.approvedAt,en))} · {approved.name} · {money(approved.totalCents)}</p>}
  {allowance&&<div data-selection-allowance className="flex flex-wrap items-center gap-2 rounded-xl bg-[#f7f9fc] p-3 text-sm">
   <span className="min-w-0 break-words text-[#162543]">{c.linkedAllowance(`${allowance.name} · ${money(allowance.plannedCents)}`)}</span>
   {approved&&allowance.status!=='decided'&&<Button type="button" variant="secondary" size="sm" className="min-h-11" disabled={disabled} onClick={()=>onApply(approved)}>{c.applyAllowance}</Button>}
   {approved&&allowance.status==='decided'&&<span data-selection-allowance-decided className="text-[#52627a]">{c.allowanceDecided(money(allowance.actualCents??0))}</span>}
   {/* Round 9: allowance vs each option (the approved one first): over / under / equal, shown only — the amount is recorded only by «define allowance». */}
   {!!item.options.length&&<ul data-selection-allowance-diff className="w-full space-y-1">{[...item.options].sort((a,b)=>(b.id===item.approvedOptionId?1:0)-(a.id===item.approvedOptionId?1:0)).map(option=>{const diff=option.totalCents-allowance.plannedCents;return <li key={option.id} data-selection-diff={diff>0?'over':diff<0?'under':'equal'} className="flex flex-wrap justify-between gap-2 text-xs"><span className="min-w-0 break-words text-[#52627a]">{option.name}{option.id===item.approvedOptionId?(en?' (approved)':' (aprobada)'):''}</span><span className={diff>0?'font-semibold text-[#a34919]':diff<0?'font-semibold text-[#18573a]':'font-semibold text-[#52627a]'}>{diff===0?(en?'Equal to the allowance':'Igual al monto previsto'):(diff>0?(en?'Over by ':'Excede en '):(en?'Under by ':'Queda por debajo en '))+(diff===0?'':money(Math.abs(diff)))}</span></li>;})}</ul>}
  </div>}
  {item.notes&&<p className="whitespace-pre-wrap break-words text-sm text-[#52627a]"><span className="font-semibold">{c.notes.replace(/ \(.*\)$/,'')}: </span>{item.notes}</p>}
  {!!item.options.length&&<ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">{item.options.map(option=>form(option.id)??<li key={option.id}><OptionCard c={c} en={en} option={catalogSources.get(option.id)&&!option.imageFileId?{...option,imageFileId:option.id}:option} recommended={item.recommendedOptionId===option.id} approved={item.approvedOptionId===option.id}>
   {catalogSources.has(option.id)&&<span data-selection-catalog-option className="inline-flex w-fit rounded-full bg-[#eaf5fb] px-2.5 py-1 text-xs font-semibold text-[#006e90]">{en?'From the catalog':'Del catálogo'}</span>}
   {!lockedOptions&&<div className="flex flex-wrap gap-1.5">
    <Button type="button" size="sm" variant="secondary" className="min-h-11" disabled={disabled} onClick={()=>onOption(option,item.recommendedOptionId===option.id?'unrecommend':'recommend')}>{item.recommendedOptionId===option.id?c.unrecommend:c.recommend}</Button>
    <Button type="button" size="sm" variant="secondary" className="min-h-11" disabled={disabled} onClick={()=>onEditOption(option)}>{c.edit}</Button>
    <Button type="button" size="sm" variant="ghost" className="min-h-11" disabled={disabled} onClick={()=>onOption(option,'remove')}>{c.remove}</Button>
   </div>}
  </OptionCard></li>)}</ul>}
  {optionForm('new:'+item.id)}
  {!item.options.length&&<p className="text-sm text-[#52627a]">{c.noOptions}</p>}
  <div className="flex flex-wrap gap-2">
   {!lockedOptions&&item.options.length<12&&<Button type="button" className="min-h-11" disabled={disabled} onClick={onAddOption}>{c.addOption}</Button>}
   {!lockedOptions&&item.options.length<12&&<CatalogOptionPicker en={en} disabled={disabled} onPick={onCatalog}/>}
   {!item.published&&item.status!=='approved'&&<Button type="button" variant="secondary" className="min-h-11" disabled={disabled||!item.options.length} onClick={()=>onAction('publish')}>{c.publish}</Button>}
   {item.published&&<Button type="button" variant="secondary" className="min-h-11" disabled={disabled} onClick={()=>onAction('unpublish')}>{c.unpublish}</Button>}
   {item.status!=='open'&&<Button type="button" variant="secondary" className="min-h-11" disabled={disabled} onClick={()=>onAction('reopen')}>{c.reopen}</Button>}
   <Button type="button" variant="secondary" className="min-h-11" disabled={disabled} onClick={onEdit}>{c.edit}</Button>
   <Button type="button" variant="ghost" className="min-h-11" disabled={disabled} onClick={()=>onAction('archive')}>{c.archive}</Button>
  </div>
 </article>;
 function form(id:string){const node=optionForm(id);return node?<li key={id} className="sm:col-span-2 xl:col-span-3">{node}</li>:null;}
}

function OptionCard({c,en,option,recommended,approved,children}:{c:Copy;en:boolean;option:SelectionOption|ClientSelectionItem['options'][number];recommended:boolean;approved:boolean;children?:ReactNode}){
 const hasImage='hasImage' in option?option.hasImage:!!option.imageFileId;
 return <div data-selection-option={option.id} className={`flex h-full flex-col overflow-hidden rounded-xl border bg-white ${approved?'border-[#18573a] ring-1 ring-[#18573a]':'border-[#d7e1ea]'}`}>
  {/* eslint-disable-next-line @next/next/no-img-element -- private image route reauthorized on every request */}
  {hasImage&&<img data-selection-image src={imageUrl(option.id)} alt={c.photo(option.name)} loading="lazy" className="aspect-[4/3] w-full bg-[#f7f9fc] object-cover"/>}
  <div className="flex flex-1 flex-col gap-2 p-3 text-sm">
   <div className="flex flex-wrap gap-1.5">{approved&&<span data-selection-option-approved className="rounded-full bg-[#eef8f4] px-2 py-0.5 text-xs font-semibold text-[#18573a]">{c.approvedOption}</span>}{recommended&&<span data-selection-recommended className="rounded-full bg-[#eaf5fb] px-2 py-0.5 text-xs font-semibold text-[#006e90]">{c.recommended}</span>}</div>
   <p className="break-words font-semibold text-[#162543]">{option.name}</p>
   {option.brand&&<p className="break-words text-[#52627a]">{option.brand}</p>}
   {option.unitCents===null||option.totalCents===null?<p data-selection-option-price-hidden className="text-[#52627a]">{quantityText(option.quantity,en)} · {en?'Price shared by the professional separately':'El profesional le indicará el precio aparte'}</p>:<>
   <p className="text-[#52627a]">{c.each(quantityText(option.quantity,en),money(option.unitCents))}</p>
   <p data-selection-option-total className="font-bold tabular-nums text-[#162543]">{c.total}: {money(option.totalCents)}</p></>}
   {option.clientNotes&&<p className="whitespace-pre-wrap break-words text-[#52627a]">{option.clientNotes}</p>}
   {option.url&&<a href={option.url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex min-h-11 items-center font-semibold text-[#008bb5] underline">{c.viewProduct}</a>}
   <div className="mt-auto">{children}</div>
  </div>
 </div>;
}

function Tracker({c,en,areas,items}:{c:Copy;en:boolean;areas:SelectionArea[];items:SelectionItem[]}){
 const [state,setState]=useState<SelectionState|'all'>('all'),[area,setArea]=useState('all'),[overdue,setOverdue]=useState(false);
 const areaName=useMemo(()=>new Map(areas.map(row=>[row.id,row.name])),[areas]);
 const rows=items.filter(item=>(state==='all'||item.state===state)&&(area==='all'||item.areaId===area)&&(!overdue||item.overdue));
 const approvedOf=(item:SelectionItem)=>item.options.find(option=>option.id===item.approvedOptionId)??null;
 const usedAreas=areas.filter(row=>items.some(item=>item.areaId===row.id));
 return <div data-selections-tracker className="space-y-3">
  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 sm:items-end">
   <label className="block text-sm font-semibold">{c.filterState}<select data-tracker-filter="state" value={state} onChange={e=>setState(e.target.value as SelectionState|'all')} className={field}><option value="all">{c.all}</option>{(['no_options','draft','pending_client','approved','changes_requested'] as const).map(value=><option key={value} value={value}>{c.states[value]}</option>)}</select></label>
   <label className="block text-sm font-semibold">{c.filterArea}<select data-tracker-filter="area" value={area} onChange={e=>setArea(e.target.value)} className={field}><option value="all">{c.all}</option>{usedAreas.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
   <label className="flex min-h-11 items-center gap-2 text-sm font-semibold"><input type="checkbox" data-tracker-filter="overdue" checked={overdue} onChange={e=>setOverdue(e.target.checked)} className="h-5 w-5 accent-[#0089bb]"/>{c.onlyOverdue}</label>
  </div>
  {!rows.length?<p data-tracker-empty className="rounded-2xl border border-dashed border-[#d7e1ea] bg-[#f7f9fc] p-5 text-center text-sm text-[#52627a]">{c.noRows}</p>:<>
   <div className="hidden overflow-hidden rounded-2xl border border-[#d7e1ea] md:block">
    <table className="w-full table-fixed text-left text-sm">
     <thead className="bg-[#f7f9fc] text-xs font-bold uppercase tracking-wide text-[#52627a]"><tr><th className="w-[16%] px-3 py-2">{c.col.area}</th><th className="w-[20%] px-3 py-2">{c.col.item}</th><th className="w-[17%] px-3 py-2">{c.col.state}</th><th className="w-[19%] px-3 py-2">{c.col.option}</th><th className="w-[13%] px-3 py-2 text-right">{c.col.total}</th><th className="w-[15%] px-3 py-2">{c.col.due}</th></tr></thead>
     <tbody>{rows.map(item=>{const approved=approvedOf(item);return <tr key={item.id} data-tracker-row={item.id} className="border-t border-[#e5e7eb] align-top">
      <td className="break-words px-3 py-2 text-[#52627a]">{areaName.get(item.areaId)??c.none}</td><td className="break-words px-3 py-2 font-semibold text-[#162543]">{item.name}</td>
      <td className="px-3 py-2"><StateBadge state={item.state} c={c} wrap/></td><td className="break-words px-3 py-2">{approved?.name??c.none}</td>
      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{approved?money(approved.totalCents):c.none}</td>
      <td className="px-3 py-2">{item.dueDate?day(item.dueDate,en):c.none}{item.overdue&&<span data-tracker-overdue className="mt-1 block text-xs font-semibold text-[#8a2a1b]">{c.pastDue}</span>}</td>
     </tr>;})}</tbody>
    </table>
   </div>
   <ul className="space-y-2 md:hidden">{rows.map(item=>{const approved=approvedOf(item);return <li key={item.id} data-tracker-card={item.id} className="space-y-1 rounded-xl border border-[#d7e1ea] bg-white p-3 text-sm">
    <div className="flex flex-wrap items-start justify-between gap-2"><p className="min-w-0 break-words font-semibold text-[#162543]">{item.name}<span className="font-normal text-[#52627a]"> · {areaName.get(item.areaId)??c.none}</span></p><StateBadge state={item.state} c={c}/></div>
    <p className="break-words"><span className="text-[#52627a]">{c.col.option}: </span>{approved?`${approved.name} · ${money(approved.totalCents)}`:c.none}</p>
    <p><span className="text-[#52627a]">{c.col.due}: </span>{item.dueDate?day(item.dueDate,en):c.none}{item.overdue&&<span data-tracker-overdue className="font-semibold text-[#8a2a1b]"> · {c.pastDue}</span>}</p>
   </li>;})}</ul>
  </>}
 </div>;
}

function AreaForm({c,form,busy,saving,onChange,onSubmit,onCancel}:{c:Copy;form:Extract<Form,{kind:'area'}>;busy:boolean;saving:boolean;onChange:(draft:AreaDraft)=>void;onSubmit:(event:FormEvent)=>void;onCancel:()=>void}){
 return <form data-selection-form="area" onSubmit={onSubmit} className="space-y-3 rounded-2xl border border-[#0089bb] bg-[#f7fbfd] p-4">
  <fieldset disabled={busy}><label className="block text-sm font-semibold">{c.areaName}<input data-selection-field="areaName" required maxLength={80} value={form.draft.name} placeholder={c.areaPlaceholder} onChange={e=>onChange({name:e.target.value})} className={field}/></label></fieldset>
  <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="secondary" disabled={saving} onClick={onCancel}>{c.cancel}</Button><Button type="submit" disabled={busy}>{saving?c.saving:form.area?c.saveChanges:c.saveArea}</Button></div>
 </form>;
}

function ItemForm({c,form,areas,allowances,busy,saving,onChange,onSubmit,onCancel}:{c:Copy;form:Extract<Form,{kind:'item'}>;areas:SelectionArea[];allowances:SelectionDetail['allowances'];busy:boolean;saving:boolean;onChange:(draft:ItemDraft)=>void;onSubmit:(event:FormEvent)=>void;onCancel:()=>void}){
 const d=form.draft,set=(next:Partial<ItemDraft>)=>onChange({...d,...next});
 return <form data-selection-form="item" onSubmit={onSubmit} className="space-y-3 rounded-2xl border border-[#0089bb] bg-[#f7fbfd] p-4">
  <fieldset disabled={busy} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
   <label className="block text-sm font-semibold sm:col-span-2">{c.itemName}<input data-selection-field="itemName" required maxLength={160} value={d.name} placeholder={c.itemPlaceholder} onChange={e=>set({name:e.target.value})} className={field}/></label>
   <label className="block text-sm font-semibold">{c.area}<select data-selection-field="area" value={d.areaId} onChange={e=>set({areaId:e.target.value})} className={field}>{areas.map(area=><option key={area.id} value={area.id}>{area.name}</option>)}</select></label>
   <label className="block text-sm font-semibold">{c.due}<input data-selection-field="due" type="date" value={d.dueDate} onChange={e=>set({dueDate:e.target.value})} className={field}/></label>
   <label className="block text-sm font-semibold sm:col-span-2">{c.allowance}<select data-selection-field="allowance" value={d.allowanceId} onChange={e=>set({allowanceId:e.target.value})} className={field}><option value="">{c.noAllowance}</option>{allowances.map(row=><option key={row.id} value={row.id}>{row.name} · {money(row.plannedCents)}</option>)}</select></label>
   <label className="block text-sm font-semibold sm:col-span-2">{c.notes}<textarea data-selection-field="notes" rows={3} maxLength={SELECTION_NOTES_MAX} value={d.notes} onChange={e=>set({notes:e.target.value})} className={field+' py-2'}/><span className="mt-1 block text-xs font-normal text-[#52627a]">{c.notesHelp}</span></label>
  </fieldset>
  <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="secondary" disabled={saving} onClick={onCancel}>{c.cancel}</Button><Button type="submit" disabled={busy}>{saving?c.saving:form.item?c.saveChanges:c.saveItem}</Button></div>
 </form>;
}

function OptionForm({c,form,files,filesError,onRetryFiles,busy,saving,onChange,onSubmit,onCancel}:{c:Copy;form:Extract<Form,{kind:'option'}>;files:WorkFile[]|null;filesError:boolean;onRetryFiles:()=>void;busy:boolean;saving:boolean;onChange:(draft:OptionDraft)=>void;onSubmit:(event:FormEvent)=>void;onCancel:()=>void}){
 const en=useLocale()==='en',d=form.draft,set=(next:Partial<OptionDraft>)=>onChange({...d,...next}),qty=parseQuantity(d.quantity,en),unit=colonesToCents(d.unit);
 const choices=files??[],current=d.imageFileId&&!choices.some(file=>file.id===d.imageFileId)?[{id:d.imageFileId,name:c.image}]:[];
 return <form data-selection-form="option" onSubmit={onSubmit} className="space-y-3 rounded-2xl border border-[#0089bb] bg-[#f7fbfd] p-4">
  <fieldset disabled={busy} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
   <label className="block text-sm font-semibold sm:col-span-2">{c.optionName}<input data-selection-field="optionName" required maxLength={160} value={d.name} placeholder={c.optionPlaceholder} onChange={e=>set({name:e.target.value})} className={field}/></label>
   <label className="block text-sm font-semibold">{c.brand}<input data-selection-field="brand" maxLength={160} value={d.brand} onChange={e=>set({brand:e.target.value})} className={field}/></label>
   <label className="block text-sm font-semibold">{c.url}<input data-selection-field="url" type="url" inputMode="url" maxLength={SELECTION_URL_MAX} value={d.url} placeholder="https://" onChange={e=>set({url:e.target.value})} className={field}/><span className="mt-1 block text-xs font-normal text-[#52627a]">{c.urlHelp}</span></label>
   <label className="block text-sm font-semibold">{c.quantity}<input data-selection-field="quantity" required inputMode="decimal" value={d.quantity} onChange={e=>set({quantity:e.target.value})} className={field}/></label>
   <label className="block text-sm font-semibold">{c.unit}<input data-selection-field="unit" required inputMode="decimal" value={d.unit} onChange={e=>set({unit:e.target.value})} className={field}/></label>
   {qty!==null&&unit!==null&&<p data-selection-option-preview aria-live="polite" className="text-sm font-semibold text-[#162543] sm:col-span-2">{c.total}: {money(Math.round(qty*unit))}</p>}
   <label className="block text-sm font-semibold sm:col-span-2">{c.clientNotes}<textarea data-selection-field="clientNotes" rows={2} maxLength={SELECTION_NOTES_MAX} value={d.clientNotes} onChange={e=>set({clientNotes:e.target.value})} className={field+' py-2'}/><span className="mt-1 block text-xs font-normal text-[#52627a]">{c.clientNotesHelp}</span></label>
   <div className="sm:col-span-2">
    <label className="block text-sm font-semibold">{c.image}<select data-selection-field="image" value={d.imageFileId} onChange={e=>set({imageFileId:e.target.value})} className={field}><option value="">{c.noImage}</option>{[...current,...choices].map(file=><option key={file.id} value={file.id}>{file.name}</option>)}</select></label>
    <p className="mt-1 text-xs text-[#52627a]">{c.imageHelp}</p>
    {filesError&&<p role="alert" className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[#8a2a1b]">{c.imageLoadError}<button type="button" className="min-h-11 font-semibold underline" onClick={onRetryFiles}>{c.retry}</button></p>}
    {/* eslint-disable-next-line @next/next/no-img-element -- private job file preview, reauthorized by the work-files route */}
    {d.imageFileId&&<img data-selection-image-preview src={'/api/pro/work-files?'+new URLSearchParams({fileId:d.imageFileId})} alt="" className="mt-2 aspect-[4/3] w-full max-w-xs rounded-xl border border-[#d7e1ea] object-cover"/>}
   </div>
  </fieldset>
  <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="secondary" disabled={saving} onClick={onCancel}>{c.cancel}</Button><Button type="submit" disabled={busy}>{saving?c.saving:c.saveOption}</Button></div>
 </form>;
}

/**
 * Customer side, inside My projects. Renders nothing while loading or when the
 * owner has not turned the section on; a failed read shows an error with retry.
 */
export function AppointmentSelections({requestId}:{requestId:string}){
 const {user,loading}=useAuth();if(loading||!user)return null;
 return <ClientSelectionsSession key={user.id+':'+requestId} accountId={user.id} requestId={requestId}/>;
}

function ClientSelectionsSession({accountId,requestId}:{accountId:string;requestId:string}){
 const en=useLocale()==='en',c=copy(en),{confirm,dialogNode}=useAppDialog();
 const [view,setView]=useState<ClientSelections|null>(null),[error,setError]=useState(false),[loading,setLoading]=useState(true);
 const [commentFor,setCommentFor]=useState<string|null>(null),[comment,setComment]=useState(''),[saving,setSaving]=useState(false),[uncertain,setUncertain]=useState(false),[message,setMessage]=useState(''),[notice,setNotice]=useState('');
 const active=useRef(true),sequence=useRef(0),lock=useRef(false),pending=useRef<{body:string;notice:string}|null>(null);
 const dirty=!!commentFor&&comment.trim().length>0,busy=saving||uncertain;
 useProChildGuard(dirty||busy,useCallback(()=>setMessage(c.leave),[c.leave]));
 const load=useCallback(async()=>{const id=++sequence.current;setLoading(true);setError(false);try{const response=await fetch(api+'?'+new URLSearchParams({requestId}),{cache:'no-store',headers:{'X-Pro-Expected-Actor':accountId}});if(response.status===404){if(active.current&&id===sequence.current)setView({visible:false});return;}if(!response.ok)throw Error();const body=clientSelectionsSchema.parse(await response.json());if(active.current&&id===sequence.current)setView(body);}catch{if(active.current&&id===sequence.current)setError(true);}finally{if(active.current&&id===sequence.current)setLoading(false);}},[accountId,requestId]);
 const invalidate=useCallback(()=>{sequence.current++;},[]);
 useEffect(()=>{active.current=true;const timer=setTimeout(()=>void load(),0);return()=>{active.current=false;invalidate();clearTimeout(timer);};},[load,invalidate]);
 async function send(body:string,success:string){
  if(lock.current)return;lock.current=true;pending.current={body,notice:success};setSaving(true);setMessage('');setNotice('');
  try{
   const response=await fetch(api,{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json','X-Pro-Expected-Actor':accountId},body});
   // 403: the professional unpublished or archived the item (or turned the section off) meanwhile; reload instead of keeping a stale item.
   if(response.status===409||response.status===403){pending.current=null;setUncertain(false);setMessage(c.clientConflict);setCommentFor(null);setComment('');lock.current=false;await load();return;}
   if(response.status>=500||response.status===429){setUncertain(true);setMessage(c.uncertain);return;}
   if(!response.ok){pending.current=null;setUncertain(false);setMessage(c.clientFailed);return;}
   clientSelectionResultSchema.parse(await response.json());
   pending.current=null;setUncertain(false);setCommentFor(null);setComment('');setNotice(success);
   // Fix 13: show the approval at once (the reload below confirms it from the server).
   const sent=JSON.parse(body) as {action?:string;id?:string;optionId?:string};
   if(sent.action==='approve'&&sent.id&&sent.optionId){invalidate();setView(v=>v&&'areas' in v?{...v,areas:v.areas.map(a=>({...a,items:a.items.map(i=>i.id===sent.id?{...i,state:'approved' as const,approvedOptionId:sent.optionId!,approvedAt:new Date().toISOString()}:i)}))}:v);}
   lock.current=false;await load();
  }catch{setUncertain(true);setMessage(c.uncertain);}
  finally{lock.current=false;if(active.current)setSaving(false);}
 }
 async function approve(item:ClientSelectionItem,optionId:string,name:string){
  if(busy)return;const answer=await confirm({title:c.approveTitle,description:`${item.name} · ${name}`,detail:c.approveText,confirmLabel:c.approve,cancelLabel:c.back});if(!answer.confirmed)return;
  void send(JSON.stringify({action:'approve',actionId:crypto.randomUUID(),requestId,id:item.id,revision:item.revision,optionId}),c.approvedDone);
 }
 function submitComment(event:FormEvent,item:ClientSelectionItem){
  event.preventDefault();if(busy)return;const text=comment.trim();if(!text){setMessage(c.commentRequired);return;}
  void send(JSON.stringify({action:'request_changes',actionId:crypto.randomUUID(),requestId,id:item.id,revision:item.revision,comment:text.slice(0,SELECTION_NOTES_MAX)}),c.commentDone);
 }
 if(error)return <div role="alert" data-client-selections-error className="space-y-2 rounded-2xl border border-[#d7e1ea] p-4"><p className="text-sm">{c.clientLoadError}</p><Button type="button" variant="secondary" disabled={loading} onClick={()=>void load()}>{c.retry}</Button></div>;
 if(!view||!view.visible)return null;
 return <section data-client-selections aria-label={c.clientTitle} className="space-y-4 rounded-2xl border border-[#d7e1ea] bg-white p-4">
  {dialogNode}
  <div><h3 className="font-bold text-[#162543]">{c.clientTitle}</h3><p className="mt-1 text-sm text-[#52627a]">{c.clientIntro}</p></div>
  {notice&&<p role="status" className="rounded-xl bg-[#eef8f4] p-3 text-sm text-[#18573a]">{notice}</p>}
  {message&&<div role="alert" data-client-selection-error className="space-y-2 rounded-xl bg-[#fff4f2] p-3 text-sm text-[#8a2a1b]"><p>{message}</p>{uncertain&&<Button type="button" variant="secondary" disabled={saving} onClick={()=>pending.current&&void send(pending.current.body,pending.current.notice)}>{c.retrySame}</Button>}</div>}
  <ClientBulkApprove actor={accountId} requestId={requestId} disabled={busy} items={view.areas.flatMap(area=>area.items.filter(item=>item.state==='pending_client'&&!!item.recommendedOptionId&&item.options.some(o=>o.id===item.recommendedOptionId)).map(item=>({id:item.id,name:item.name,optionId:item.recommendedOptionId!,revision:item.revision})))} onDone={(ok,text)=>{if(ok){setNotice(text);setMessage('');}else setMessage(text);void load();}}/>
  {!view.areas.length&&<p className="text-sm text-[#52627a]">{c.clientEmpty}</p>}
  {view.areas.map(area=><section key={area.id} aria-label={area.name} className="space-y-3">
   <h4 className="break-words text-sm font-bold uppercase tracking-wide text-[#52627a]">{area.name}</h4>
   {area.items.map(item=>{const approved=item.options.find(option=>option.id===item.approvedOptionId),canAnswer=item.state!=='approved',overdue=item.state!=='approved'&&!!item.dueDate&&item.dueDate<view.today;
    return <article key={item.id} data-client-selection-item={item.id} className="space-y-3 rounded-xl border border-[#e5e7eb] p-3">
     <div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><p className="break-words font-semibold text-[#162543]">{item.name}</p>{item.dueDate&&<p className="text-sm text-[#52627a]">{c.dueOn(day(item.dueDate,en))}{overdue?` · ${c.pastDue}`:''}</p>}</div><StateBadge state={item.state} c={c}/></div>
     {approved&&<p data-client-selection-approved className="text-sm font-semibold text-[#18573a]">{c.youApproved(approved.totalCents===null?approved.name:`${approved.name} · ${money(approved.totalCents)}`)}</p>}
     {item.state==='changes_requested'&&item.clientComment&&<div className="rounded-xl bg-[#fff6e5] p-3 text-sm text-[#7a4b00]"><p className="font-semibold">{c.youAsked}</p><p className="mt-1 whitespace-pre-wrap break-words">{item.clientComment}</p><p className="mt-1">{c.waitingPro}</p></div>}
     <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">{item.options.map(option=><li key={option.id}><OptionCard c={c} en={en} option={option} recommended={item.recommendedOptionId===option.id} approved={item.approvedOptionId===option.id}>
      {item.recommendedOptionId===option.id&&<p className="mb-2 text-xs text-[#006e90]">{c.recommendedByPro}</p>}
      {canAnswer&&<Button type="button" className="min-h-11 w-full" disabled={busy} onClick={()=>void approve(item,option.id,option.name)}>{c.approve}</Button>}
     </OptionCard></li>)}</ul>
     {item.state==='pending_client'&&(commentFor===item.id?<form data-client-selection-comment onSubmit={event=>submitComment(event,item)} className="space-y-2">
      <label className="block text-sm font-semibold">{c.comment}<textarea data-client-selection-field="comment" rows={3} maxLength={SELECTION_NOTES_MAX} value={comment} disabled={busy} onChange={e=>setComment(e.target.value)} className={field+' py-2'}/></label>
      <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="secondary" disabled={saving} onClick={()=>{setCommentFor(null);setComment('');setMessage('');}}>{c.cancel}</Button><Button type="submit" disabled={busy}>{saving?c.saving:c.sendComment}</Button></div>
     </form>:<Button type="button" variant="secondary" className="min-h-11" disabled={busy||!!commentFor} onClick={()=>{setCommentFor(item.id);setComment('');setMessage('');}}>{c.requestChanges}</Button>)}
    </article>;})}
  </section>)}
 </section>;
}

/** Round 9: add an option from the company catalog (search by name or SKU; quantity). */
function CatalogOptionPicker({en,disabled,onPick}:{en:boolean;disabled:boolean;onPick:(productId:string,quantity:number)=>void}){
 const [open,setOpen]=useState(false),[q,setQ]=useState(''),[rows,setRows]=useState<{id:string;name:string;sku:string;price:number;unit?:string|null}[]|null>(null),[quantity,setQuantity]=useState('1'),[error,setError]=useState('');
 useEffect(()=>{if(!open)return;let alive=true;const timer=setTimeout(()=>{fetch('/api/pro/catalog?'+new URLSearchParams({kind:'products',q:q.trim(),filter:'all',after:'',itemType:'all'}),{cache:'no-store'}).then(r=>r.ok?r.json():Promise.reject()).then((body:{items?:unknown[]})=>{if(!alive)return;const list=(body.items??[]).map(row=>row as {id:string;name:string;sku:string;price:number;unit?:string|null;archived?:boolean}).filter(row=>row&&typeof row.id==='string'&&!row.archived).slice(0,20);setRows(list);setError('');}).catch(()=>{if(alive)setError(en?'The catalog could not be loaded.':'No se pudo cargar el catálogo.');});},250);return()=>{alive=false;clearTimeout(timer);};},[open,q,en]);
 const specs=useCatalogSpecs(rows?.map(r=>r.id)??[]);
 const qty=Number(quantity.replace(',','.'));const validQty=Number.isFinite(qty)&&qty>0&&qty<=1000000;
 if(!open)return <Button type="button" variant="secondary" className="min-h-11" disabled={disabled} onClick={()=>setOpen(true)}>{en?'Add from catalog':'Agregar desde el catálogo'}</Button>;
 return <div data-selection-catalog-picker className="w-full space-y-2 rounded-xl border border-[#d7e1ea] bg-[#f7f9fc] p-3">
  <div className="flex flex-wrap gap-2"><input type="search" aria-label={en?'Search the catalog':'Buscar en el catálogo'} placeholder={en?'Search by name or SKU':'Buscar por nombre o código'} value={q} maxLength={100} onChange={e=>setQ(e.target.value)} className="min-h-11 min-w-0 flex-1 rounded-xl border border-[#d7e1ea] bg-white px-3 text-base"/><label className="flex items-center gap-2 text-sm font-semibold">{en?'Quantity':'Cantidad'}<input inputMode="decimal" aria-label={en?'Quantity':'Cantidad'} value={quantity} onChange={e=>setQuantity(e.target.value)} className="min-h-11 w-24 rounded-xl border border-[#d7e1ea] bg-white px-3 text-base"/></label><Button type="button" variant="ghost" className="min-h-11" onClick={()=>setOpen(false)}>{en?'Close':'Cerrar'}</Button></div>
  {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
  {rows&&!rows.length&&<p className="text-sm text-[#52627a]">{en?'No catalog items match. You can add products in Inventory, or type the option by hand.':'Ningún artículo del catálogo coincide. Puede agregarlos en Inventario o escribir la opción a mano.'}</p>}
  <ul className="max-h-72 space-y-1 overflow-y-auto">{rows?.map(row=><li key={row.id}><button type="button" data-selection-catalog-product={row.id} disabled={disabled||!validQty} onClick={()=>{onPick(row.id,qty);setOpen(false);}} className="flex min-h-11 w-full min-w-0 items-center justify-between gap-3 rounded-lg bg-white px-3 py-2 text-left text-sm hover:bg-[#eaf5fb] disabled:opacity-50"><span className="min-w-0 break-words font-semibold">{row.name}<span className="block text-xs font-normal text-[#68778d]">{row.sku}{row.unit?' · '+row.unit:''}</span><CatalogSpecsLine specs={specs[row.id]} className="block text-xs font-normal text-[#52627a]"/></span><span className="shrink-0 font-semibold">{proMoney(row.price,en)}</span></button></li>)}</ul>
 </div>;
}
