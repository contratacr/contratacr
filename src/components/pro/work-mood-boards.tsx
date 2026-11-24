'use client';

import {useCallback,useEffect,useLayoutEffect,useRef,useState,type FormEvent,type KeyboardEvent} from 'react';
import {useLocale} from 'next-intl';
import {useAuth} from '@/hooks/use-auth';
import {useAppDialog} from '@/hooks/use-app-dialog';
import {Button} from '@/components/ui/button';
import {proMoney} from '@/lib/pro/money';
import {WORK_FILE_MAX_BYTES,workFilesPageSchema,type WorkFile} from '@/lib/pro/work-files';
import {
 MOOD_BODY_MAX,MOOD_COMMENT_MAX,MOOD_LABEL_MAX,MOOD_MAX_BOARDS,MOOD_MAX_ELEMENTS,MOOD_MAX_PAGES,MOOD_NAME_MAX,MOOD_NOTE_MAX,MOOD_PAGE_NAME_MAX,
 clampBox,moodPageFormats,moodBoardDetailSchema,moodBoardListSchema,moodBoardMutationSchema,moodBoardResultSchema,moodElementInput,moodOwnerImageUrl,moodProductsSchema,nextRotation,
 type MoodBoard,type MoodBoardDetail,type MoodBoardList,type MoodBoardMutation,type MoodComment,type MoodDraftElement,type MoodHistoryEntry,type MoodPage,type MoodPageFormat,type MoodProduct,
} from '@/lib/pro/mood-boards';
import {moodTemplateElements,moodTemplateLabel,moodTemplates,type MoodTemplate} from '@/lib/pro/round12';
import {MoodImageLibrary} from './mood-board-image-library';
import {MoodTemplatesPanel} from './mood-board-templates-panel';
import {MoodCanvas,MoodPresenter,type Box,type CanvasItem} from './mood-board-canvas';
import {CatalogSpecsLine,useCatalogSpecs} from './catalog-specs-line';
import {useProChildGuard} from './use-pro-child-guard';

/**
 * Tableros de ideas (row 61): boards per job with fixed-size pages, images of the
 * job, items of My items, color swatches and notes. Publishing makes an immutable
 * copy that the linked customer sees in My projects (opt-in customer-view
 * section) and can comment on. Nothing here charges, invoices or notifies anyone.
 */
const api='/api/pro/mood-boards',field='mt-1 block min-h-11 w-full min-w-0 rounded-xl border border-[#d7e1ea] bg-white px-3 text-base font-normal text-[#162543]';
type StateCallback={onStateChange?:(state:{dirty:boolean;busy:boolean})=>void};
type Outcome={ok:true;data:unknown}|{ok:false;kind:'conflict'|'uncertain'|'failed'|'tooLarge'|'forbidden'};
type BoardDraft={name:string;room:string;pageFormat:MoodPageFormat;template?:MoodTemplate|'none'};
type BoardForm={board:MoodBoard|null;draft:BoardDraft;initial:BoardDraft};
type PageDraft={pageId:string;name:string;background:string;elements:MoodDraftElement[]};
type Panel='image'|'product'|'swatch'|'note'|'text'|'arrow'|'drawing'|null;
const stamp=(value:string,en:boolean)=>new Intl.DateTimeFormat(en?'en-US':'es-CR',{dateStyle:'medium',timeStyle:'short',timeZone:'America/Costa_Rica'}).format(new Date(value));
const percent=(value:number,en:boolean)=>new Intl.NumberFormat(en?'en-US':'es-CR',{minimumFractionDigits:1,maximumFractionDigits:1}).format(value/100);
const bytes=(text:string)=>new TextEncoder().encode(text).length;
const swatchPresets=['#ffffff','#f4efe6','#d9cbb4','#8c6e54','#2f3e46','#162543','#008bb5','#6a994e','#bc4749','#e9c46a'];
const backgroundPresets=['#ffffff','#f7f9fc','#f4efe6','#eef6fb','#1f2a37'];

function copy(en:boolean){
 return en?{
  title:'Idea boards',intro:'Gather photos, items, colors and notes on pages to agree on the look of each room. Share a copy with your customer when it is ready.',
  newBoard:'New board',active:'Active',archived:'Archived',empty:'No boards yet. Create the first one for a room or area of this job.',emptyArchived:'No archived boards.',
  loading:'Loading boards…',loadError:'Could not load the boards.',retry:'Retry',name:'Board name',room:'Room or area (optional)',roomHint:'For example: Kitchen, Main bathroom, Facade.',
  format:'Page size',formatWide:'Screen (16:9)',formatA4:'A4 landscape',formatStandard:'Presentation (4:3)',formatLetter:'US Letter landscape',formatTabloid:'US Tabloid landscape',formatA3:'A3 landscape',create:'Create board',saveBoard:'Save changes',cancel:'Cancel',editBoard:'Rename',
  open:'Open',duplicate:'Duplicate',archive:'Archive',restore:'Restore',back:'Back',modified:(d:string)=>`Modified ${d}`,pages:(n:number)=>n===1?'1 page':`${n} pages`,
  shared:(v:number)=>`Shared · version ${v}`,notShared:'Not shared',comments:(n:number)=>n===1?'1 comment':`${n} comments`,
  duplicateTitle:'Duplicate board',duplicateText:'The copy keeps the pages and starts private, without comments.',copyName:(name:string)=>`${name} (copy)`.slice(0,MOOD_NAME_MAX),
  archiveTitle:'Archive this board?',archiveText:'It leaves the active list. If it is shared, your customer stops seeing it. You can restore it later.',
  clientOff:'Shared boards appear in your customer’s view once you turn on the Idea boards section.',openClientView:'Open customer view',
  clientOn:'The Idea boards section is on in the customer view.',noRecipient:'There is no confirmed customer with an account linked to this job yet.',
  recipient:(name:string)=>`Linked customer: ${name}`,limitBoards:`You can have up to ${MOOD_MAX_BOARDS} active boards per job.`,
  saved:'Saved.',created:'Board created.',duplicated:'Copy created.',archivedDone:'Board archived.',restoredDone:'Board restored.',
  conflict:'This board changed in another window. Reload before saving again.',reload:'Reload',uncertain:'We could not confirm whether it was saved. Retry the same operation; it will not be applied twice.',
  retrySame:'Retry the same operation',failed:'Could not save. Check the data and try again.',forbidden:'This board is no longer available.',
  leave:'Save or discard the board changes before leaving.',invalidBoard:'Write a name of up to 80 characters.',
  // editor
  backToBoards:'Back to boards',present:'Present',publish:'Share with customer',republish:'Share changes',unpublish:'Stop sharing',
  publishTitle:'Share this board?',publishText:'Your customer will see a copy of every page as it is now, including its photos. Later edits stay private until you share again.',
  publishOff:'The Idea boards section is off in the customer view: turn it on so your customer can see it.',
  unpublishTitle:'Stop sharing this board?',unpublishText:'Your customer stops seeing it. Comments are kept.',
  publishedDone:'Board shared with your customer.',unpublishedDone:'Board no longer shared.',unpublishedChanges:'Changes not shared yet',sharedAt:(v:number,d:string)=>`Version ${v} shared on ${d}`,
  pageStrip:'Pages',pageN:(n:number)=>`Page ${n}`,addPage:'Add page',movePrev:'Move page left',moveNext:'Move page right',deletePage:'Delete page',
  deletePageTitle:'Delete this page?',deletePageText:'Its elements are deleted with it. Shared versions are not affected.',limitPages:`Up to ${MOOD_MAX_PAGES} pages per board.`,
  savePageFirst:'Save or discard the changes to this page first.',pageName:'Page name (optional)',background:'Page background',savePage:'Save page',autosavePending:'Saving automatically…',autosaved:'Changes are saved automatically.',saving:'Saving…',discard:'Discard changes',
  undo:'Undo',redo:'Redo',add:'Add',addImage:'Photo',addProduct:'Item',addSwatch:'Color',addNote:'Note',limitElements:`Up to ${MOOD_MAX_ELEMENTS} elements per page.`,
  tooLarge:'This page has too much content to save at once. Remove elements or shorten notes.',pageSaved:'Page saved.',pageConflict:'This page changed in another window. Reload it to see the latest version (your unsaved changes on this page will be lost).',reloadPage:'Reload page',
  readOnly:'Archived board: restore it to edit.',canvasLabel:(n:number)=>`Page ${n} canvas. Select an element and use the arrow keys to move it; Shift moves it further; Delete removes it.`,
  resize:'Resize',
  // panels
  photos:'Job photos',photosHelp:'Photos are kept privately in Updates › Job files.',upload:'Upload photo',uploading:'Uploading…',uploadHelp:'JPG, PNG or WebP up to 20 MB (PNG and WebP are saved as JPG).',
  uploadFailed:'Could not upload the photo. Try again with a JPG, PNG or WebP of up to 20 MB.',photosError:'Could not load the job photos.',noPhotos:'There are no photos in this job yet.',morePhotos:'Load more photos',
  usePhoto:(name:string)=>`Add ${name}`,searchItems:'Search My items',searchPlaceholder:'Name, code or category',noItems:'No matching active items.',itemsError:'Could not load My items.',
  showPrice:'Show the price',itemPhoto:'Photo for the item (optional)',noPhoto:'No photo',addItem:(name:string)=>`Add ${name}`,
  color:'Color',colorHex:'Color code (#rrggbb)',colorName:'Color name (optional)',addColor:'Add color',noteText:'Note text',addNoteBtn:'Add note',close:'Close',
  invalidColor:'Use a color code such as #008bb5.',noteRequired:'Write the note.',
  // inspector
  selected:'Selected element',elements:'Elements on this page',noElements:'This page is empty. Add a photo, an item, a color or a note.',
  x:'From left (%)',y:'From top (%)',w:'Width (%)',h:'Height (%)',rotate:'Rotate 90°',front:'Bring to front',backward:'Send to back',remove:'Remove',
  kind:{image:'Photo',product:'Item',swatch:'Color',note:'Note',text:'Text',arrow:'Arrow',drawing:'Drawing'},addText:'Text',addArrow:'Arrow',addDrawing:'Draw',textText:'Text',addTextBtn:'Add text',textRequired:'Write the text.',direction:'Direction',addArrowBtn:'Add arrow',drawHint:'Draw on the page with your finger, pen or mouse. Each stroke is one element; Undo removes the last one.',drawLayer:'Drawing area of the page',doneDrawing:'Done drawing',strokeColor:'Line color',rotation:(deg:number)=>`Rotation ${deg}°`,
  commentsTitle:'Customer comments',commentsEmpty:'No comments yet.',commentsHidden:'Comments open once you share the board.',you:'You',customer:'Customer',
  reply:'Reply',replyLabel:'Reply to your customer',send:'Send',replyDone:'Reply sent.',commentRequired:'Write a comment.',version:(v:number)=>`v${v}`,
  history:'Activity',historyAction:{board_create:'Board created',board_update:'Board renamed',board_duplicate:'Board duplicated',board_archive:'Archived',board_restore:'Restored',page_add:'Page added',page_reorder:'Pages reordered',page_delete:'Page deleted',page_save:'Page saved',publish:'Shared with customer',unpublish:'Sharing stopped',comment:'Comment'} as Record<MoodHistoryEntry['action'],string>,
 }:{
  title:'Tableros de ideas',intro:'Reúna fotos, artículos, colores y notas en páginas para acordar el estilo de cada espacio. Comparta una copia con su cliente cuando esté lista.',
  newBoard:'Nuevo tablero',active:'Activos',archived:'Archivados',empty:'Todavía no hay tableros. Cree el primero para una habitación o área de este trabajo.',emptyArchived:'No hay tableros archivados.',
  loading:'Cargando tableros…',loadError:'No se pudieron cargar los tableros.',retry:'Reintentar',name:'Nombre del tablero',room:'Habitación o área (opcional)',roomHint:'Por ejemplo: Cocina, Baño principal, Fachada.',
  format:'Tamaño de página',formatWide:'Pantalla (16:9)',formatA4:'A4 horizontal',formatStandard:'Presentación (4:3)',formatLetter:'Carta (US Letter) horizontal',formatTabloid:'Tabloide (US Tabloid) horizontal',formatA3:'A3 horizontal',create:'Crear tablero',saveBoard:'Guardar cambios',cancel:'Cancelar',editBoard:'Renombrar',
  open:'Abrir',duplicate:'Duplicar',archive:'Archivar',restore:'Restaurar',back:'Volver',modified:(d:string)=>`Modificado: ${d}`,pages:(n:number)=>n===1?'1 página':`${n} páginas`,
  shared:(v:number)=>`Compartido · versión ${v}`,notShared:'Sin compartir',comments:(n:number)=>n===1?'1 comentario':`${n} comentarios`,
  duplicateTitle:'Duplicar tablero',duplicateText:'La copia conserva las páginas y empieza privada, sin comentarios.',copyName:(name:string)=>`${name} (copia)`.slice(0,MOOD_NAME_MAX),
  archiveTitle:'¿Archivar este tablero?',archiveText:'Sale de la lista activa. Si está compartido, su cliente deja de verlo. Puede restaurarlo después.',
  clientOff:'Los tableros compartidos aparecen en la vista de su cliente cuando active la sección Tableros de ideas.',openClientView:'Abrir vista del cliente',
  clientOn:'La sección Tableros de ideas está activa en la vista del cliente.',noRecipient:'Todavía no hay un cliente confirmado con cuenta vinculado a este trabajo.',
  recipient:(name:string)=>`Cliente vinculado: ${name}`,limitBoards:`Puede tener hasta ${MOOD_MAX_BOARDS} tableros activos por trabajo.`,
  saved:'Guardado.',created:'Tablero creado.',duplicated:'Copia creada.',archivedDone:'Tablero archivado.',restoredDone:'Tablero restaurado.',
  conflict:'Este tablero cambió en otra ventana. Recárguelo antes de volver a guardar.',reload:'Recargar',uncertain:'No pudimos confirmar si se guardó. Reintente la misma operación; no se aplicará dos veces.',
  retrySame:'Reintentar la misma operación',failed:'No se pudo guardar. Revise los datos e intente de nuevo.',forbidden:'Este tablero ya no está disponible.',
  leave:'Guarde o descarte los cambios del tablero antes de salir.',invalidBoard:'Escriba un nombre de hasta 80 caracteres.',
  backToBoards:'Volver a los tableros',present:'Presentar',publish:'Compartir con el cliente',republish:'Compartir cambios',unpublish:'Dejar de compartir',
  publishTitle:'¿Compartir este tablero?',publishText:'Su cliente verá una copia de todas las páginas tal como están ahora, incluidas sus fotos. Lo que edite después queda privado hasta que vuelva a compartir.',
  publishOff:'La sección Tableros de ideas está apagada en la vista del cliente: actívela para que su cliente pueda verlo.',
  unpublishTitle:'¿Dejar de compartir este tablero?',unpublishText:'Su cliente deja de verlo. Los comentarios se conservan.',
  publishedDone:'Tablero compartido con su cliente.',unpublishedDone:'El tablero ya no se comparte.',unpublishedChanges:'Hay cambios sin compartir',sharedAt:(v:number,d:string)=>`Versión ${v} compartida el ${d}`,
  pageStrip:'Páginas',pageN:(n:number)=>`Página ${n}`,addPage:'Agregar página',movePrev:'Mover página a la izquierda',moveNext:'Mover página a la derecha',deletePage:'Eliminar página',
  deletePageTitle:'¿Eliminar esta página?',deletePageText:'Sus elementos se eliminan con ella. Las versiones compartidas no cambian.',limitPages:`Hasta ${MOOD_MAX_PAGES} páginas por tablero.`,
  savePageFirst:'Primero guarde o descarte los cambios de esta página.',pageName:'Nombre de la página (opcional)',background:'Fondo de la página',savePage:'Guardar página',autosavePending:'Se guardará automáticamente…',autosaved:'Los cambios se guardan automáticamente.',saving:'Guardando…',discard:'Descartar cambios',
  undo:'Deshacer',redo:'Rehacer',add:'Agregar',addImage:'Foto',addProduct:'Artículo',addSwatch:'Color',addNote:'Nota',limitElements:`Hasta ${MOOD_MAX_ELEMENTS} elementos por página.`,
  tooLarge:'Esta página tiene demasiado contenido para guardarla de una vez. Quite elementos o acorte las notas.',pageSaved:'Página guardada.',pageConflict:'Esta página cambió en otra ventana. Recárguela para ver la versión más reciente (se perderán los cambios sin guardar de esta página).',reloadPage:'Recargar página',
  readOnly:'Tablero archivado: restáurelo para editarlo.',canvasLabel:(n:number)=>`Lienzo de la página ${n}. Seleccione un elemento y use las flechas para moverlo; con Mayús se mueve más; Supr lo elimina.`,
  resize:'Cambiar tamaño',
  photos:'Fotos del trabajo',photosHelp:'Las fotos se guardan de forma privada en Avances › Archivos del trabajo.',upload:'Subir foto',uploading:'Subiendo…',uploadHelp:'JPG, PNG o WebP de hasta 20 MB (PNG y WebP se guardan como JPG).',
  uploadFailed:'No se pudo subir la foto. Intente de nuevo con un JPG, PNG o WebP de hasta 20 MB.',photosError:'No se pudieron cargar las fotos del trabajo.',noPhotos:'Este trabajo todavía no tiene fotos.',morePhotos:'Cargar más fotos',
  usePhoto:(name:string)=>`Agregar ${name}`,searchItems:'Buscar en Mis artículos',searchPlaceholder:'Nombre, código o categoría',noItems:'No hay artículos activos que coincidan.',itemsError:'No se pudieron cargar Mis artículos.',
  showPrice:'Mostrar el precio',itemPhoto:'Foto del artículo (opcional)',noPhoto:'Sin foto',addItem:(name:string)=>`Agregar ${name}`,
  color:'Color',colorHex:'Código del color (#rrggbb)',colorName:'Nombre del color (opcional)',addColor:'Agregar color',noteText:'Texto de la nota',addNoteBtn:'Agregar nota',close:'Cerrar',
  invalidColor:'Use un código de color como #008bb5.',noteRequired:'Escriba la nota.',
  selected:'Elemento seleccionado',elements:'Elementos de esta página',noElements:'Esta página está vacía. Agregue una foto, un artículo, un color o una nota.',
  x:'Desde la izquierda (%)',y:'Desde arriba (%)',w:'Ancho (%)',h:'Alto (%)',rotate:'Girar 90°',front:'Traer al frente',backward:'Enviar atrás',remove:'Quitar',
  kind:{image:'Foto',product:'Artículo',swatch:'Color',note:'Nota',text:'Texto',arrow:'Flecha',drawing:'Dibujo'},addText:'Texto',addArrow:'Flecha',addDrawing:'Dibujar',textText:'Texto',addTextBtn:'Agregar texto',textRequired:'Escriba el texto.',direction:'Dirección',addArrowBtn:'Agregar flecha',drawHint:'Dibuje sobre la página con el dedo, el lápiz o el mouse. Cada trazo es un elemento; Deshacer quita el último.',drawLayer:'Área de dibujo de la página',doneDrawing:'Terminar dibujo',strokeColor:'Color de la línea',rotation:(deg:number)=>`Giro ${deg}°`,
  commentsTitle:'Comentarios del cliente',commentsEmpty:'Todavía no hay comentarios.',commentsHidden:'Los comentarios se abren cuando comparte el tablero.',you:'Usted',customer:'Cliente',
  reply:'Responder',replyLabel:'Responder a su cliente',send:'Enviar',replyDone:'Respuesta enviada.',commentRequired:'Escriba un comentario.',version:(v:number)=>`v${v}`,
  history:'Actividad',historyAction:{board_create:'Tablero creado',board_update:'Tablero renombrado',board_duplicate:'Tablero duplicado',board_archive:'Archivado',board_restore:'Restaurado',page_add:'Página agregada',page_reorder:'Páginas reordenadas',page_delete:'Página eliminada',page_save:'Página guardada',publish:'Compartido con el cliente',unpublish:'Se dejó de compartir',comment:'Comentario'} as Record<MoodHistoryEntry['action'],string>,
 };
}
type Copy=ReturnType<typeof copy>;

/** POST with idempotent retry of the exact same body after an uncertain result. */
function useSender(accountId:string){
 const [saving,setSaving]=useState(false),[uncertain,setUncertain]=useState(false);
 const pending=useRef<string|null>(null),lock=useRef(false);
 const send=useCallback(async(body:string):Promise<Outcome>=>{
  if(lock.current)return {ok:false,kind:'failed'};
  if(bytes(body)>MOOD_BODY_MAX)return {ok:false,kind:'tooLarge'};
  lock.current=true;pending.current=body;setSaving(true);
  try{
   const response=await fetch(api,{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json','X-Pro-Expected-Actor':accountId},body});
   if(response.status===409){pending.current=null;setUncertain(false);return {ok:false,kind:'conflict'};}
   if(response.status===413){pending.current=null;setUncertain(false);return {ok:false,kind:'tooLarge'};}
   if(response.status===403){pending.current=null;setUncertain(false);return {ok:false,kind:'forbidden'};}
   if(response.status>=500||response.status===429){setUncertain(true);return {ok:false,kind:'uncertain'};}
   if(!response.ok){pending.current=null;setUncertain(false);return {ok:false,kind:'failed'};}
   const data:unknown=await response.json();pending.current=null;setUncertain(false);return {ok:true,data};
  }catch{setUncertain(true);return {ok:false,kind:'uncertain'};}
  finally{lock.current=false;setSaving(false);}
 },[accountId]);
 const retry=useCallback(()=>pending.current?send(pending.current):Promise.resolve<Outcome>({ok:false,kind:'failed'}),[send]);
 return {send,retry,saving,uncertain};
}
const outcomeText=(kind:Exclude<Outcome,{ok:true}>['kind'],c:Copy)=>({conflict:c.conflict,uncertain:c.uncertain,failed:c.failed,tooLarge:c.tooLarge,forbidden:c.forbidden})[kind];

function canvasItems(elements:MoodDraftElement[],c:Copy):CanvasItem[]{
 return elements.map(element=>{
  const base={id:element.id,kind:element.kind,x:element.x,y:element.y,w:element.w,h:element.h,rotation:element.rotation,src:null,title:null,subtitle:null,color:null,text:null};
  if(element.kind==='image')return {...base,src:moodOwnerImageUrl(element.fileId),label:c.kind.image};
  if(element.kind==='product'){const price=element.showPrice?proMoney(element.priceCents/100)+(element.unit?` / ${element.unit}`:''):null;
   return {...base,src:element.fileId?moodOwnerImageUrl(element.fileId):null,title:element.name,subtitle:price,label:`${c.kind.product}: ${element.name}${price?` · ${price}`:''}`};}
  if(element.kind==='swatch')return {...base,color:element.color,title:element.label,label:`${c.kind.swatch}: ${element.label?`${element.label} · `:''}${element.color}`};
  if(element.kind==='text')return {...base,text:element.text,color:element.color,label:`${c.kind.text}: ${element.text}`};
  if(element.kind==='arrow'||element.kind==='drawing')return {...base,color:element.color,points:element.points,label:c.kind[element.kind]};
  return {...base,text:element.text,label:`${c.kind.note}: ${element.text.slice(0,60)}`};
 });
}

export function WorkMoodBoards({workId,onStateChange,onOpenClientView}:{workId:string;onOpenClientView?:()=>void}&StateCallback){
 const {user,loading}=useAuth();if(loading||!user)return null;
 return <BoardsSession key={user.id+':'+workId} accountId={user.id} workId={workId} onStateChange={onStateChange} onOpenClientView={onOpenClientView}/>;
}

function BoardsSession({accountId,workId,onStateChange,onOpenClientView}:{accountId:string;workId:string;onOpenClientView?:()=>void}&StateCallback){
 const en=useLocale()==='en',c=copy(en),{confirm,dialogNode}=useAppDialog(),sender=useSender(accountId);
 const [list,setList]=useState<MoodBoardList|null>(null),[archivedView,setArchivedView]=useState(false),[loading,setLoading]=useState(true),[loadError,setLoadError]=useState(false);
 const [form,setForm]=useState<BoardForm|null>(null),[openId,setOpenId]=useState<string|null>(null),[editorState,setEditorState]=useState({dirty:false,busy:false});
 const [error,setError]=useState(''),[notice,setNotice]=useState(''),[conflict,setConflict]=useState(false);
 const active=useRef(true),sequence=useRef(0);
 const invalidate=useCallback(()=>{sequence.current++;},[]);
 const formDirty=!!form&&JSON.stringify(form.draft)!==JSON.stringify(form.initial);
 const dirty=formDirty||editorState.dirty,busy=sender.saving||sender.uncertain||editorState.busy;
 useProChildGuard(!onStateChange&&(dirty||busy),useCallback(()=>setError(c.leave),[c.leave]));
 useLayoutEffect(()=>{onStateChange?.({dirty,busy});return()=>onStateChange?.({dirty:false,busy:false});},[dirty,busy,onStateChange]);
 const load=useCallback(async(archived:boolean)=>{
  const id=++sequence.current;setLoading(true);setLoadError(false);
  try{
   const response=await fetch(api+'?'+new URLSearchParams(archived?{workId,archived:'1'}:{workId}),{cache:'no-store',headers:{'X-Pro-Expected-Actor':accountId}});if(!response.ok)throw Error();
   const body=moodBoardListSchema.parse(await response.json());if(body.workId!==workId||body.archived!==archived)throw Error();
   if(active.current&&id===sequence.current){setList(body);setConflict(false);}
  }catch{if(active.current&&id===sequence.current)setLoadError(true);}
  finally{if(active.current&&id===sequence.current)setLoading(false);}
 },[accountId,workId]);
 useEffect(()=>{active.current=true;const timer=setTimeout(()=>void load(archivedView),0);return()=>{active.current=false;invalidate();clearTimeout(timer);};},[load,archivedView,invalidate]);

 async function run(input:MoodBoardMutation,success:string,after?:(data:unknown)=>void){
  setError('');setNotice('');
  const outcome=await sender.send(JSON.stringify(input));
  if(!outcome.ok){setError(outcomeText(outcome.kind,c));if(outcome.kind==='conflict')setConflict(true);if(outcome.kind==='forbidden')void load(archivedView);return false;}
  moodBoardResultSchema.parse(outcome.data);setNotice(success);after?.(outcome.data);await load(archivedView);return true;
 }
 async function retry(){const outcome=await sender.retry();if(!outcome.ok){setError(outcomeText(outcome.kind,c));return;}setError('');setNotice(c.saved);setForm(null);await load(archivedView);}
 function submit(event:FormEvent){
  event.preventDefault();if(!form||busy)return;
  const d=form.draft,base={actionId:crypto.randomUUID(),workId,name:d.name,room:d.room.trim()||null,pageFormat:d.pageFormat};
  const parsed=moodBoardMutationSchema.safeParse(form.board?{action:'board_update',...base,id:form.board.id,revision:form.board.revision}:{action:'board_create',...base,id:crypto.randomUUID(),pageId:crypto.randomUUID()});
  if(!parsed.success){setError(c.invalidBoard);return;}
  const created=parsed.data.action==='board_create'?parsed.data.id:null,template=!form.board&&d.template&&d.template!=='none'?d.template:null;
  // Round 12 (row 61): a template fills the first page through the existing page writer, then the board opens.
  let result:unknown=null;
  void run(parsed.data,created?c.created:c.saved,data=>{result=data;if(!template){setForm(null);if(created)setOpenId(created);}}).then(async ok=>{
   if(!ok||!template||!created)return;const r=moodBoardResultSchema.safeParse(result);if(!r.success||!('pages' in r.data))return;
   const save=moodBoardMutationSchema.safeParse({action:'page_save',actionId:crypto.randomUUID(),workId,id:created,revision:r.data.board.revision,pageId:r.data.pages[0]!.id,name:null,background:r.data.pages[0]!.background,elements:moodTemplateElements(template,en)});
   if(save.success)await run(save.data,c.created);setForm(null);setOpenId(created);});
 }
 async function duplicate(board:MoodBoard){
  if(busy)return;
  const answer=await confirm({title:c.duplicateTitle,description:board.name,detail:c.duplicateText,confirmLabel:c.duplicate,cancelLabel:c.cancel,input:{label:c.name,defaultValue:c.copyName(board.name)}});
  if(!answer.confirmed)return;const name=(answer.value??'').trim();
  const parsed=moodBoardMutationSchema.safeParse({action:'board_duplicate',actionId:crypto.randomUUID(),workId,id:board.id,newId:crypto.randomUUID(),name});
  if(!parsed.success){setError(c.invalidBoard);return;}void run(parsed.data,c.duplicated);
 }
 async function archive(board:MoodBoard,restore:boolean){
  if(busy)return;
  if(!restore){const answer=await confirm({title:c.archiveTitle,description:board.name,detail:c.archiveText,confirmLabel:c.archive,cancelLabel:c.cancel,tone:'danger'});if(!answer.confirmed)return;}
  void run({action:restore?'board_restore':'board_archive',actionId:crypto.randomUUID(),workId,id:board.id,revision:board.revision},restore?c.restoredDone:c.archivedDone);
 }
 const onEditorState=useCallback((state:{dirty:boolean;busy:boolean})=>setEditorState(old=>old.dirty===state.dirty&&old.busy===state.busy?old:state),[]);

 if(openId&&list)return <BoardEditor key={openId} accountId={accountId} workId={workId} boardId={openId} c={c} en={en} clientVisible={list.clientVisible} onOpenClientView={onOpenClientView}
  onStateChange={onEditorState} onBack={()=>{setOpenId(null);setEditorState({dirty:false,busy:false});void load(archivedView);}}/>;
 if(loading&&!list)return <p role="status" className="text-sm text-[#52627a]">{c.loading}</p>;
 if(!list)return <div role="alert" data-mood-boards-load-error className="space-y-2 rounded-2xl border border-[#d7e1ea] p-4"><p className="text-sm">{c.loadError}</p><Button className="min-h-11" type="button" variant="secondary" disabled={loading} onClick={()=>void load(archivedView)}>{c.retry}</Button></div>;
 const locked=busy||conflict;
 return <section data-mood-boards className="space-y-5 text-[#162543]">
  {dialogNode}
  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
   <div className="min-w-0"><h3 className="text-lg font-bold">{c.title}</h3><p className="mt-1 text-sm text-[#52627a]">{c.intro}</p></div>
   <Button type="button" className="min-h-11 shrink-0" disabled={locked||!!form||list.counts.active>=MOOD_MAX_BOARDS} onClick={()=>{const initial={name:'',room:'',pageFormat:'wide' as const};setForm({board:null,draft:initial,initial});setError('');setNotice('');}}>{c.newBoard}</Button>
  </div>
  <div data-mood-client-visibility className="flex flex-col gap-2 rounded-xl bg-[#f7f9fc] p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
   <div className="min-w-0 space-y-0.5"><p>{list.clientVisible?c.clientOn:c.clientOff}</p><p className="text-[#52627a]">{list.recipientName?c.recipient(list.recipientName):c.noRecipient}</p></div>
   {!list.clientVisible&&onOpenClientView&&<Button type="button" variant="secondary" className="min-h-11 shrink-0" disabled={locked||dirty} onClick={onOpenClientView}>{c.openClientView}</Button>}
  </div>
  {notice&&<p role="status" className="rounded-xl bg-[#eef8f4] p-3 text-sm text-[#18573a]">{notice}</p>}
  {loadError&&<div role="alert" className="space-y-2 text-sm"><p>{c.loadError}</p><Button className="min-h-11" type="button" variant="secondary" disabled={loading} onClick={()=>void load(archivedView)}>{c.retry}</Button></div>}
  {error&&<div role="alert" className="space-y-2 rounded-xl bg-[#fff4f2] p-3 text-sm text-[#8a2a1b]"><p>{error}</p>
   {sender.uncertain&&<Button className="min-h-11" type="button" variant="secondary" disabled={sender.saving} onClick={()=>void retry()}>{c.retrySame}</Button>}
   {conflict&&<Button className="min-h-11" type="button" variant="secondary" disabled={loading} onClick={()=>{setForm(null);setError('');void load(archivedView);}}>{c.reload}</Button>}</div>}
  {form&&<BoardFormView c={c} form={form} busy={locked} saving={sender.saving} onChange={draft=>setForm({...form,draft})} onSubmit={submit} onCancel={()=>{setForm(null);setError('');}}/>}
  <div role="group" aria-label={c.title} className="flex flex-wrap gap-2">
   {([false,true] as const).map(value=><button key={String(value)} type="button" aria-pressed={archivedView===value} disabled={locked||dirty} onClick={()=>{if(archivedView!==value){setArchivedView(value);setList(old=>old?{...old,items:[]}:old);}}}
    className={`min-h-11 rounded-xl px-4 text-sm font-semibold ${archivedView===value?'bg-[#162543] text-white':'border border-[#d7e1ea] bg-white text-[#52627a]'}`}>{value?c.archived:c.active} ({value?list.counts.archived:list.counts.active})</button>)}
  </div>
  {list.items.length===0?<p data-mood-boards-empty className="rounded-2xl border border-dashed border-[#d7e1ea] p-6 text-center text-sm text-[#52627a]">{archivedView?c.emptyArchived:c.empty}</p>:
   <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{list.items.map(board=><li key={board.id} data-mood-board-card={board.id} className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-[#d7e1ea] bg-white">
    <div className="bg-[#f7f9fc] p-3">{board.cover?<MoodCanvas thumbnail format={board.pageFormat} background={board.cover.background} items={canvasItems(board.cover.elements,c)} label={board.name}/>:null}</div>
    <div className="flex flex-1 flex-col gap-2 p-4">
     <div className="min-w-0"><h4 className="truncate font-semibold">{board.name}</h4>{board.room&&<p className="truncate text-sm text-[#52627a]">{board.room}</p>}</div>
     <p className="text-xs text-[#52627a]">{c.modified(stamp(board.updatedAt,en))} · {c.pages(board.pageCount)}</p>
     <div className="flex flex-wrap gap-1.5 text-xs font-semibold">
      <span className={`rounded-full px-2 py-1 ${board.publishedVersion?'bg-[#e7f6fb] text-[#006f91]':'bg-[#eef2f6] text-[#52627a]'}`}>{board.publishedVersion?c.shared(board.publishedVersion):c.notShared}</span>
      {board.commentCount>0&&<span className="rounded-full bg-[#fff6e5] px-2 py-1 text-[#7a4b00]">{c.comments(board.commentCount)}</span>}
     </div>
     <div className="mt-auto flex flex-wrap gap-2 pt-2">
      <Button type="button" size="sm" className="min-h-11" disabled={locked||!!form} onClick={()=>{setError('');setNotice('');setOpenId(board.id);}}>{c.open}</Button>
      {!board.archived&&<Button type="button" size="sm" variant="secondary" className="min-h-11" disabled={locked||!!form} onClick={()=>{const initial={name:board.name,room:board.room??'',pageFormat:board.pageFormat};setForm({board,draft:initial,initial});}}>{c.editBoard}</Button>}
      {!board.archived&&<Button type="button" size="sm" variant="secondary" className="min-h-11" disabled={locked||!!form||list.counts.active>=MOOD_MAX_BOARDS} onClick={()=>void duplicate(board)}>{c.duplicate}</Button>}
      <Button type="button" size="sm" variant="secondary" className="min-h-11" disabled={locked||!!form} onClick={()=>void archive(board,board.archived)}>{board.archived?c.restore:c.archive}</Button>
     </div>
    </div>
   </li>)}</ul>}
  {list.counts.active>=MOOD_MAX_BOARDS&&<p className="text-xs text-[#52627a]">{c.limitBoards}</p>}
 </section>;
}

function BoardFormView({c,form,busy,saving,onChange,onSubmit,onCancel}:{c:Copy;form:BoardForm;busy:boolean;saving:boolean;onChange:(draft:BoardDraft)=>void;onSubmit:(event:FormEvent)=>void;onCancel:()=>void}){
 const d=form.draft,en=useLocale()==='en';
 return <form data-mood-board-form onSubmit={onSubmit} className="space-y-3 rounded-2xl border border-[#d7e1ea] bg-white p-4">
  <fieldset disabled={busy} className="grid gap-3 sm:grid-cols-2">
   <label className="block text-sm font-semibold sm:col-span-2">{c.name}<input data-mood-field="name" required maxLength={MOOD_NAME_MAX} value={d.name} onChange={e=>onChange({...d,name:e.target.value})} className={field}/></label>
   <label className="block text-sm font-semibold">{c.room}<input data-mood-field="room" maxLength={MOOD_NAME_MAX} value={d.room} onChange={e=>onChange({...d,room:e.target.value})} className={field}/><span className="mt-1 block text-xs font-normal text-[#52627a]">{c.roomHint}</span></label>
   {!form.board&&<label className="block text-sm font-semibold sm:col-span-2">{en?'Start with':'Empezar con'}<select data-mood-field="template" value={d.template??'none'} onChange={e=>onChange({...d,template:e.target.value as MoodTemplate|'none'})} className={field}>{(['none',...moodTemplates] as const).map(k=><option key={k} value={k}>{moodTemplateLabel(k,en)}</option>)}</select><span className="mt-1 block text-xs font-normal text-[#52627a]">{en?'A template adds a title, color swatches and notes you can edit or delete.':'Una plantilla agrega título, muestras de color y notas que puede editar o eliminar.'}</span></label>}
   <label className="block text-sm font-semibold">{c.format}<select data-mood-field="format" value={d.pageFormat} onChange={e=>onChange({...d,pageFormat:(moodPageFormats.find(v=>v===e.target.value)??'wide')})} className={field}><option value="wide">{c.formatWide}</option><option value="standard">{c.formatStandard}</option><option value="a4">{c.formatA4}</option><option value="a3">{c.formatA3}</option><option value="letter">{c.formatLetter}</option><option value="tabloid">{c.formatTabloid}</option></select></label>
  </fieldset>
  <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="secondary" className="min-h-11" disabled={saving} onClick={onCancel}>{c.cancel}</Button><Button type="submit" className="min-h-11" disabled={busy}>{saving?c.saving:form.board?c.saveBoard:c.create}</Button></div>
 </form>;
}

const draftOf=(page:MoodPage):PageDraft=>({pageId:page.id,name:page.name??'',background:page.background,elements:page.elements});
const draftKey=(draft:PageDraft)=>JSON.stringify({n:draft.name.trim()||null,b:draft.background,e:draft.elements.map(moodElementInput)});

function BoardEditor({accountId,workId,boardId,c,en,clientVisible,onOpenClientView,onStateChange,onBack}:{accountId:string;workId:string;boardId:string;c:Copy;en:boolean;clientVisible:boolean;onOpenClientView?:()=>void;onStateChange:(state:{dirty:boolean;busy:boolean})=>void;onBack:()=>void}){
 const {confirm,dialogNode}=useAppDialog(),sender=useSender(accountId);
 const [detail,setDetail]=useState<MoodBoardDetail|null>(null),[loading,setLoading]=useState(true),[loadError,setLoadError]=useState(false);
 const [index,setIndex]=useState(0),[draft,setDraft]=useState<PageDraft|null>(null),[past,setPast]=useState<PageDraft[]>([]),[future,setFuture]=useState<PageDraft[]>([]);
 const [drawColor,setDrawColor]=useState('#162543');
 const [selected,setSelected]=useState<string|null>(null),[panel,setPanel]=useState<Panel>(null),[presenting,setPresenting]=useState(false),[templatesOpen,setTemplatesOpen]=useState(false);
 const [error,setError]=useState(''),[notice,setNotice]=useState(''),[conflict,setConflict]=useState(false),[reply,setReply]=useState('');
 const active=useRef(true),sequence=useRef(0),merge=useRef<string|null>(null);
 const invalidate=useCallback(()=>{sequence.current++;},[]);
 const page=detail?.pages[index]??null,baseline=page?draftOf(page):null;
 const dirty=!!draft&&!!baseline&&draftKey(draft)!==draftKey(baseline)||reply.trim().length>0,busy=sender.saving||sender.uncertain;
 useLayoutEffect(()=>{onStateChange({dirty,busy});},[dirty,busy,onStateChange]);
 const load=useCallback(async(reset:boolean)=>{
  const id=++sequence.current;setLoading(true);setLoadError(false);
  try{
   const response=await fetch(api+'?'+new URLSearchParams({workId,boardId}),{cache:'no-store',headers:{'X-Pro-Expected-Actor':accountId}});if(!response.ok)throw Error();
   const body=moodBoardDetailSchema.parse(await response.json());if(body.board.id!==boardId)throw Error();
   if(active.current&&id===sequence.current){setDetail(body);setConflict(false);if(reset){setIndex(i=>Math.min(i,body.pages.length-1));setDraft(null);setPast([]);setFuture([]);setSelected(null);}}
  }catch{if(active.current&&id===sequence.current)setLoadError(true);}
  finally{if(active.current&&id===sequence.current)setLoading(false);}
 },[accountId,workId,boardId]);
 useEffect(()=>{active.current=true;const timer=setTimeout(()=>void load(true),0);return()=>{active.current=false;invalidate();clearTimeout(timer);};},[load,invalidate]);
 // The working copy of the current page starts from the saved page.
 const current:PageDraft|null=draft&&page&&draft.pageId===page.id?draft:baseline;
 const readOnly=!!detail?.board.archived;
 const locked=busy||conflict||readOnly;

 function change(next:PageDraft,mergeKey:string|null=null){
  if(!current||locked)return;
  if(!(mergeKey&&merge.current===mergeKey)){setPast(old=>[...old.slice(-49),current]);setFuture([]);}
  merge.current=mergeKey;setDraft(next);setNotice('');if(!sender.uncertain)setError('');
 }
 const setElements=(elements:MoodDraftElement[],mergeKey:string|null=null)=>{if(current)change({...current,elements},mergeKey);};
 const update=(id:string,patch:Partial<MoodDraftElement>,mergeKey:string|null=null)=>{if(current)setElements(current.elements.map(element=>element.id===id?{...element,...patch} as MoodDraftElement:element),mergeKey);};
 const commitBox=(id:string,box:Box)=>update(id,clampBox(box));
 const remove=(id:string)=>{if(!current)return;setElements(current.elements.filter(element=>element.id!==id));if(selected===id)setSelected(null);};
 const reorder=(id:string,front:boolean)=>{if(!current)return;const element=current.elements.find(e=>e.id===id);if(!element)return;const rest=current.elements.filter(e=>e.id!==id);setElements(front?[...rest,element]:[element,...rest]);};
 function add(element:MoodDraftElement){
  if(!current||current.elements.length>=MOOD_MAX_ELEMENTS)return;
  const offset=(current.elements.length%8)*300,box=clampBox({x:element.x+offset,y:element.y+offset,w:element.w,h:element.h});
  setElements([...current.elements,{...element,...box} as MoodDraftElement]);setSelected(element.id);setPanel(null);
 }
 // Round 7C: a freehand stroke keeps its drawn position and the drawing panel stays open.
 function addStroke(stroke:{x:number;y:number;w:number;h:number;points:[number,number][]}){if(!current||current.elements.length>=MOOD_MAX_ELEMENTS||locked)return;setElements([...current.elements,{kind:'drawing',id:crypto.randomUUID(),rotation:0,color:drawColor,...stroke}]);}
 function undo(){if(!current||!past.length||locked)return;const previous=past[past.length-1];setPast(past.slice(0,-1));setFuture([current,...future].slice(0,50));setDraft(previous);merge.current=null;}
 function redo(){if(!current||!future.length||locked)return;const next=future[0];setFuture(future.slice(1));setPast([...past,current].slice(-50));setDraft(next);merge.current=null;}
 function discard(){setDraft(null);setPast([]);setFuture([]);setSelected(null);setError('');merge.current=null;}

 function apply(data:unknown){
  const result=moodBoardResultSchema.parse(data);
  setDetail(old=>{
   if(!old)return old;
   if('page' in result)return {...old,board:result.board,pages:old.pages.map(p=>p.id===result.page.id?result.page:p)};
   if('pages' in result)return {...old,board:result.board,pages:result.pages};
   return {...old,comments:[...old.comments,result.comment]};
  });
 }
 async function run(input:MoodBoardMutation,success:string,afterOk?:()=>void){
  setError('');setNotice('');
  const outcome=await sender.send(JSON.stringify(input));
  if(!outcome.ok){setError(outcome.kind==='conflict'&&input.action==='page_save'?c.pageConflict:outcomeText(outcome.kind,c));if(outcome.kind==='conflict')setConflict(true);return false;}
  apply(outcome.data);setNotice(success);afterOk?.();void load(false);return true;
 }
 async function retry(){
  const outcome=await sender.retry();if(!outcome.ok){setError(outcomeText(outcome.kind,c));if(outcome.kind==='conflict')setConflict(true);return;}
  apply(outcome.data);setError('');setNotice(c.saved);setDraft(null);setPast([]);setFuture([]);setReply('');void load(false);
 }
 function savePage(automatic=false){
  // A save already in flight (for example the 4 s autosave) must not be raced by a second page_save on the same revision.
  if(!detail||!page||!current||!dirty||locked||sender.saving)return;
  const parsed=moodBoardMutationSchema.safeParse({action:'page_save',actionId:crypto.randomUUID(),workId,id:boardId,pageId:page.id,revision:page.revision,name:current.name.trim()||null,background:current.background,elements:current.elements.map(moodElementInput)});
  if(!parsed.success){setError(c.failed);return;}
  if(bytes(JSON.stringify(parsed.data))>MOOD_BODY_MAX){setError(c.tooLarge);return;}
  // An automatic save keeps undo/redo: undoing after it simply makes the page dirty again.
  void run(parsed.data,c.pageSaved,()=>{setDraft(null);if(!automatic){setPast([]);setFuture([]);}merge.current=null;});
 }
 const pageDirty=!!draft&&!!baseline&&draftKey(draft)!==draftKey(baseline);
 // Round 2: autosave. A page with changes is saved 4 s after the last edit (same CAS page_save as
 // the button); a failure or conflict stops it until the owner acts, so it never loops.
 const autosave=useRef(savePage);useLayoutEffect(()=>{autosave.current=savePage;});
 useEffect(()=>{if(!pageDirty||locked||error)return;const timer=setTimeout(()=>autosave.current(true),4000);return()=>clearTimeout(timer);},[draft,pageDirty,locked,error]);
 function goTo(next:number){if(next===index||!detail)return;if(pageDirty){setError(c.savePageFirst);return;}setIndex(next);setDraft(null);setPast([]);setFuture([]);setSelected(null);setPanel(null);setError('');}
 function structural(action:'page_add'|'page_delete',pageId:string){if(!detail)return;void run({action,actionId:crypto.randomUUID(),workId,id:boardId,revision:detail.board.revision,pageId},c.saved,()=>{if(action==='page_add')setIndex(detail.pages.length);else setIndex(i=>Math.max(0,Math.min(i,detail.pages.length-2)));});}
 function movePage(delta:-1|1){
  if(!detail||pageDirty)return;const ids=detail.pages.map(p=>p.id),target=index+delta;if(target<0||target>=ids.length)return;
  [ids[index],ids[target]]=[ids[target],ids[index]];
  void run({action:'page_reorder',actionId:crypto.randomUUID(),workId,id:boardId,revision:detail.board.revision,pageIds:ids},c.saved,()=>setIndex(target));
 }
 async function deletePage(){
  if(!detail||!page||pageDirty)return;
  const answer=await confirm({title:c.deletePageTitle,description:page.name??c.pageN(index+1),detail:c.deletePageText,confirmLabel:c.deletePage,cancelLabel:c.cancel,tone:'danger'});if(!answer.confirmed)return;
  structural('page_delete',page.id);
 }
 async function share(publish:boolean){
  if(!detail||pageDirty)return;
  const answer=await confirm(publish?{title:c.publishTitle,description:detail.board.name,detail:clientVisible?c.publishText:`${c.publishText} ${c.publishOff}`,confirmLabel:detail.board.publishedVersion?c.republish:c.publish,cancelLabel:c.cancel}
   :{title:c.unpublishTitle,description:detail.board.name,detail:c.unpublishText,confirmLabel:c.unpublish,cancelLabel:c.cancel,tone:'danger'});
  if(!answer.confirmed)return;
  void run({action:publish?'publish':'unpublish',actionId:crypto.randomUUID(),workId,id:boardId,revision:detail.board.revision},publish?c.publishedDone:c.unpublishedDone);
 }
 function sendReply(event:FormEvent){
  event.preventDefault();if(busy)return;const body=reply.trim();if(!body){setError(c.commentRequired);return;}
  void run({action:'comment',actionId:crypto.randomUUID(),workId,id:boardId,commentId:crypto.randomUUID(),body:body.slice(0,MOOD_COMMENT_MAX)},c.replyDone,()=>setReply(''));
 }
 function shortcuts(event:KeyboardEvent<HTMLElement>){
  const target=event.target as HTMLElement;if(['INPUT','TEXTAREA','SELECT'].includes(target.tagName)||!(event.ctrlKey||event.metaKey))return;
  const k=event.key.toLowerCase();if(k==='z'&&!event.shiftKey){event.preventDefault();undo();}else if(k==='y'||k==='z'&&event.shiftKey){event.preventDefault();redo();}
 }
 const items=current?canvasItems(current.elements,c):[];

 if(loading&&!detail)return <p role="status" className="text-sm text-[#52627a]">{c.loading}</p>;
 if(!detail||!page||!current)return <div role="alert" data-mood-board-load-error className="space-y-2 rounded-2xl border border-[#d7e1ea] p-4"><p className="text-sm">{c.loadError}</p><div className="flex flex-wrap gap-2"><Button className="min-h-11" type="button" variant="secondary" disabled={loading} onClick={()=>void load(true)}>{c.retry}</Button><Button className="min-h-11" type="button" variant="secondary" onClick={onBack}>{c.backToBoards}</Button></div></div>;
 const board=detail.board,selectedElement=current.elements.find(element=>element.id===selected)??null;
 const changedSinceShare=!!board.publishedAt&&new Date(board.updatedAt).getTime()>new Date(board.publishedAt).getTime();
 const presenterPages=detail.pages.map((p,i)=>({id:p.id,name:(i===index?current.name.trim()||null:p.name),background:i===index?current.background:p.background,items:canvasItems(i===index?current.elements:p.elements,c)}));
 return <section data-mood-board-editor={board.id} onKeyDown={shortcuts} className="space-y-4 text-[#162543]">
  {dialogNode}
  {presenting&&<MoodPresenter format={board.pageFormat} title={board.name} pages={presenterPages} start={index} en={en} onClose={()=>setPresenting(false)}/>}
  <nav aria-label={c.backToBoards} className="flex flex-wrap items-center gap-1 text-sm text-[#52627a]">
   <button type="button" className="min-h-11 font-semibold text-[#008bb5] underline-offset-2 hover:underline disabled:opacity-50" disabled={dirty||busy} onClick={onBack}>{c.title}</button>
   <span aria-hidden="true">›</span>{board.room&&<><span>{board.room}</span><span aria-hidden="true">›</span></>}<span aria-current="page" className="min-w-0 truncate font-semibold text-[#162543]">{board.name}</span>
  </nav>
  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
   <div className="min-w-0"><h3 className="break-words text-lg font-bold">{board.name}</h3>
    <p data-mood-share-status className="mt-1 text-sm text-[#52627a]">{board.publishedVersion&&board.publishedAt?c.sharedAt(board.publishedVersion,stamp(board.publishedAt,en)):c.notShared}{changedSinceShare&&<span className="ml-2 rounded-full bg-[#fff6e5] px-2 py-0.5 text-xs font-semibold text-[#7a4b00]">{c.unpublishedChanges}</span>}</p></div>
   <div className="flex flex-wrap gap-2">
    <Button type="button" variant="secondary" className="min-h-11" disabled={busy} onClick={()=>setPresenting(true)}>{c.present}</Button>
    {!readOnly&&<Button type="button" className="min-h-11" data-mood-publish disabled={locked||pageDirty} onClick={()=>void share(true)}>{board.publishedVersion?c.republish:c.publish}</Button>}
    {!readOnly&&board.publishedVersion&&<Button type="button" variant="secondary" className="min-h-11" disabled={locked||pageDirty} onClick={()=>void share(false)}>{c.unpublish}</Button>}
   </div>
  </div>
  {!clientVisible&&onOpenClientView&&!readOnly&&<p className="flex flex-wrap items-center gap-2 rounded-xl bg-[#f7f9fc] p-3 text-sm">{c.clientOff}<button type="button" className="min-h-11 font-semibold text-[#008bb5] underline disabled:opacity-50" disabled={dirty||busy} onClick={onOpenClientView}>{c.openClientView}</button></p>}
  {readOnly&&<p role="status" className="rounded-xl bg-[#f7f9fc] p-3 text-sm">{c.readOnly}</p>}
  {notice&&<p role="status" className="rounded-xl bg-[#eef8f4] p-3 text-sm text-[#18573a]">{notice}</p>}
  {loadError&&<div role="alert" className="space-y-2 text-sm"><p>{c.loadError}</p><Button className="min-h-11" type="button" variant="secondary" disabled={loading} onClick={()=>void load(false)}>{c.retry}</Button></div>}
  {error&&<div role="alert" data-mood-error className="space-y-2 rounded-xl bg-[#fff4f2] p-3 text-sm text-[#8a2a1b]"><p>{error}</p>
   {sender.uncertain&&<Button className="min-h-11" type="button" variant="secondary" disabled={sender.saving} onClick={()=>void retry()}>{c.retrySame}</Button>}
   {conflict&&<Button className="min-h-11" type="button" variant="secondary" disabled={loading} onClick={()=>{setError('');setConflict(false);void load(true);}}>{c.reloadPage}</Button>}</div>}

  <div data-mood-page-strip className="space-y-2">
   <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="text-sm font-semibold">{c.pageStrip}</h4>
    {!readOnly&&<div className="flex flex-wrap gap-2">
     <Button type="button" size="sm" variant="secondary" className="min-h-11" disabled={locked||pageDirty||index===0} onClick={()=>movePage(-1)} aria-label={c.movePrev}>←</Button>
     <Button type="button" size="sm" variant="secondary" className="min-h-11" disabled={locked||pageDirty||index>=detail.pages.length-1} onClick={()=>movePage(1)} aria-label={c.moveNext}>→</Button>
     <Button type="button" size="sm" variant="secondary" className="min-h-11" disabled={locked||pageDirty||detail.pages.length<=1} onClick={()=>void deletePage()}>{c.deletePage}</Button>
     <Button type="button" size="sm" className="min-h-11" disabled={locked||pageDirty||detail.pages.length>=MOOD_MAX_PAGES} onClick={()=>structural('page_add',crypto.randomUUID())}>{c.addPage}</Button>
    </div>}
   </div>
   <ol className="flex gap-2 overflow-x-auto pb-1">{detail.pages.map((p,i)=><li key={p.id} className="w-28 shrink-0 sm:w-32">
    <button type="button" aria-current={i===index?'page':undefined} data-mood-page-thumb={i+1} disabled={busy} onClick={()=>goTo(i)} className={`block w-full rounded-xl border-2 p-1 text-left ${i===index?'border-[#0089bb]':'border-transparent hover:border-[#d7e1ea]'}`}>
     <MoodCanvas thumbnail format={board.pageFormat} background={i===index?current.background:p.background} items={canvasItems(i===index?current.elements:p.elements,c)} label={c.pageN(i+1)}/>
     <span className="mt-1 block truncate px-1 text-xs font-semibold text-[#52627a]">{i+1}. {(i===index?current.name.trim():p.name)||c.pageN(i+1)}</span>
    </button>
   </li>)}</ol>
   {detail.pages.length>=MOOD_MAX_PAGES&&<p className="text-xs text-[#52627a]">{c.limitPages}</p>}
  </div>

  {!readOnly&&<div data-mood-toolbar role="toolbar" aria-label={c.add} className="flex flex-wrap items-center gap-2">
   {(['image','product','swatch','note','text','arrow','drawing'] as const).map(kind=><Button key={kind} type="button" size="sm" variant={panel===kind?'default':'secondary'} aria-expanded={panel===kind} className="min-h-11" data-mood-add={kind}
    disabled={locked||current.elements.length>=MOOD_MAX_ELEMENTS} onClick={()=>setPanel(panel===kind?null:kind)}>{{image:c.addImage,product:c.addProduct,swatch:c.addSwatch,note:c.addNote,text:c.addText,arrow:c.addArrow,drawing:c.addDrawing}[kind]}</Button>)}
   <Button type="button" size="sm" variant={templatesOpen?'default':'secondary'} aria-expanded={templatesOpen} className="min-h-11" data-mood-templates-toggle disabled={locked} onClick={()=>setTemplatesOpen(open=>!open)}>{en?'Templates':'Plantillas'}</Button>
   <span className="mx-1 hidden h-6 w-px bg-[#d7e1ea] sm:block" aria-hidden="true"/>
   <Button type="button" size="sm" variant="secondary" className="min-h-11" disabled={locked||!past.length} onClick={undo}>{c.undo}</Button>
   <Button type="button" size="sm" variant="secondary" className="min-h-11" disabled={locked||!future.length} onClick={redo}>{c.redo}</Button>
  </div>}
  {current.elements.length>=MOOD_MAX_ELEMENTS&&<p className="text-xs text-[#52627a]">{c.limitElements}</p>}
  {templatesOpen&&!readOnly&&<MoodTemplatesPanel accountId={accountId} page={current} pageFormat={board.pageFormat} disabled={locked} onClose={()=>setTemplatesOpen(false)} onApply={(background,elements)=>{change({...current,background,elements});setSelected(null);}}/>}
  {panel&&!readOnly&&<AddPanel kind={panel} c={c} accountId={accountId} workId={workId} disabled={locked} onAdd={add} onClose={()=>setPanel(null)} drawColor={drawColor} onDrawColor={setDrawColor}/>}

  <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_18rem]">
   <div className="min-w-0 space-y-3">
    <MoodCanvas format={board.pageFormat} background={current.background} items={items} label={c.canvasLabel(index+1)} selectedId={selected} editable={!locked}
     onSelect={setSelected} onCommit={commitBox} onRemove={remove} resizeLabel={c.resize} drawColor={panel==='drawing'&&!locked?drawColor:null} drawLabel={c.drawLayer} onDraw={addStroke}/>
    {!readOnly&&<div className="grid gap-3 sm:grid-cols-2">
     <label className="block text-sm font-semibold">{c.pageName}<input data-mood-field="page-name" maxLength={MOOD_PAGE_NAME_MAX} disabled={locked} value={current.name} onChange={e=>change({...current,name:e.target.value},'page-name')} className={field}/></label>
     <fieldset disabled={locked} className="min-w-0"><legend className="text-sm font-semibold">{c.background}</legend>
      <div className="mt-1 flex flex-wrap items-center gap-2">
       {backgroundPresets.map(color=><button key={color} type="button" aria-label={color} aria-pressed={current.background===color} onClick={()=>change({...current,background:color})} className={`h-11 w-11 rounded-xl border-2 ${current.background===color?'border-[#0089bb]':'border-[#d7e1ea]'}`} style={{background:color}}/>)}
       <input type="color" aria-label={c.background} data-mood-field="background" value={current.background} onChange={e=>change({...current,background:e.target.value.toLowerCase()},'background')} className="h-11 w-14 cursor-pointer rounded-xl border border-[#d7e1ea] bg-white p-1"/>
      </div>
     </fieldset>
    </div>}
    {!readOnly&&<div className="flex flex-wrap justify-end gap-2">
     {pageDirty&&<Button type="button" variant="secondary" className="min-h-11" disabled={busy} onClick={discard}>{c.discard}</Button>}
     <span data-mood-autosave className="self-center text-xs text-[#52627a]">{sender.saving?c.saving:pageDirty?c.autosavePending:c.autosaved}</span><Button type="button" className="min-h-11" data-mood-save-page disabled={!pageDirty||locked} onClick={()=>savePage()}>{sender.saving?c.saving:c.savePage}</Button>
    </div>}
   </div>
   <aside className="min-w-0 space-y-4">
    {selectedElement&&!readOnly&&<Inspector key={selectedElement.id} element={selectedElement} c={c} en={en} disabled={locked}
     onUpdate={(patch,mergeKey)=>update(selectedElement.id,patch,mergeKey??null)} onBox={box=>commitBox(selectedElement.id,box)} onRemove={()=>remove(selectedElement.id)}
     onFront={()=>reorder(selectedElement.id,true)} onBack={()=>reorder(selectedElement.id,false)}/>}
    <section data-mood-element-list className="space-y-2"><h4 className="text-sm font-semibold">{c.elements}</h4>
     {current.elements.length===0?<p className="text-sm text-[#52627a]">{c.noElements}</p>:
      <ol className="space-y-1.5">{[...items].reverse().map(item=><li key={item.id}>
       <button type="button" aria-pressed={item.id===selected} onClick={()=>setSelected(item.id)} className={`flex min-h-11 w-full min-w-0 flex-col rounded-xl border px-3 py-2 text-left text-sm ${item.id===selected?'border-[#0089bb] bg-[#eef6fb]':'border-[#d7e1ea] bg-white'}`}>
        <span className="truncate font-semibold">{item.label}</span>
        <span className="text-xs text-[#52627a]">X {percent(item.x,en)} % · Y {percent(item.y,en)} % · {percent(item.w,en)} × {percent(item.h,en)} %{item.rotation?` · ${c.rotation(item.rotation)}`:''}</span>
       </button>
      </li>)}</ol>}
    </section>
   </aside>
  </div>

  <CommentsPanel c={c} en={en} comments={detail.comments} published={!!board.publishedVersion} reply={reply} disabled={busy||readOnly} onReply={setReply} onSubmit={sendReply}/>
  {detail.history.length>0&&<details className="rounded-xl border border-[#d7e1ea] bg-white p-3 text-sm"><summary className="min-h-11 cursor-pointer content-center font-semibold">{c.history}</summary>
   <ol className="mt-2 space-y-1">{detail.history.map(entry=><li key={entry.actionId} className="flex flex-wrap justify-between gap-2"><span>{c.historyAction[entry.action]}{entry.side==='client'?` · ${c.customer}`:''}</span><span className="text-[#52627a]">{stamp(entry.at,en)}</span></li>)}</ol>
  </details>}
 </section>;
}

function Inspector({element,c,en,disabled,onUpdate,onBox,onRemove,onFront,onBack}:{element:MoodDraftElement;c:Copy;en:boolean;disabled:boolean;onUpdate:(patch:Partial<MoodDraftElement>,mergeKey?:string)=>void;onBox:(box:Box)=>void;onRemove:()=>void;onFront:()=>void;onBack:()=>void}){
 const number=(key:'x'|'y'|'w'|'h')=>{
  const value=element[key];
  return <label key={key} className="block text-xs font-semibold">{c[key]}
   <input key={key+value} type="number" inputMode="decimal" min={0} max={100} step={0.1} defaultValue={(value/100).toFixed(1)} disabled={disabled} data-mood-geometry={key}
    onBlur={e=>{const parsed=Number(e.target.value.replace(',','.'));if(!Number.isFinite(parsed)){e.target.value=(value/100).toFixed(1);return;}const box={x:element.x,y:element.y,w:element.w,h:element.h};box[key]=Math.round(parsed*100);const next=clampBox(box);if(next[key]!==value||next.x!==element.x||next.y!==element.y)onBox(next);else e.target.value=(value/100).toFixed(1);}}
    onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();(e.target as HTMLInputElement).blur();}}} className={field}/>
  </label>;
 };
 return <section data-mood-inspector={element.kind} aria-label={c.selected} className="space-y-3 rounded-2xl border border-[#d7e1ea] bg-white p-3">
  <h4 className="text-sm font-semibold">{c.selected}: {c.kind[element.kind]}</h4>
  {element.kind==='text'&&<><label className="block text-xs font-semibold">{c.textText}<textarea data-mood-field="text-edit" rows={2} maxLength={MOOD_NOTE_MAX} disabled={disabled} value={element.text} onChange={e=>onUpdate({text:e.target.value},'text:'+element.id)} className={field+' py-2'}/></label></>}
  {(element.kind==='text'||element.kind==='arrow'||element.kind==='drawing')&&<label className="flex items-center gap-2 text-xs font-semibold"><input type="color" aria-label={c.strokeColor} value={element.color} disabled={disabled} onChange={e=>onUpdate({color:e.target.value.toLowerCase()},'color:'+element.id)} className="h-11 w-14 rounded-xl border border-[#d7e1ea] bg-white p-1"/>{c.color}</label>}
  {element.kind==='note'&&<label className="block text-xs font-semibold">{c.noteText}<textarea data-mood-field="note-text" rows={3} maxLength={MOOD_NOTE_MAX} disabled={disabled} value={element.text} onChange={e=>onUpdate({text:e.target.value},'note:'+element.id)} className={field+' py-2'}/></label>}
  {element.kind==='swatch'&&<div className="grid grid-cols-[auto_minmax(0,1fr)] items-end gap-2">
   <input type="color" aria-label={c.color} value={element.color} disabled={disabled} onChange={e=>onUpdate({color:e.target.value.toLowerCase()},'color:'+element.id)} className="h-11 w-14 rounded-xl border border-[#d7e1ea] bg-white p-1"/>
   <label className="block text-xs font-semibold">{c.colorName}<input maxLength={MOOD_LABEL_MAX} value={element.label??''} disabled={disabled} onChange={e=>onUpdate({label:e.target.value||null},'label:'+element.id)} className={field}/></label>
  </div>}
  {element.kind==='product'&&<label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5 accent-[#0089bb]" checked={element.showPrice} disabled={disabled} onChange={e=>onUpdate({showPrice:e.target.checked})}/>{c.showPrice}{element.showPrice?` (${proMoney(element.priceCents/100)})`:''}</label>}
  <div className="grid grid-cols-2 gap-2">{(['x','y','w','h'] as const).map(number)}</div>
  <p className="text-xs text-[#52627a]">{c.rotation(element.rotation)} · X {percent(element.x,en)} %</p>
  <div className="flex flex-wrap gap-2">
   <Button type="button" size="sm" variant="secondary" className="min-h-11" disabled={disabled} onClick={()=>onUpdate({rotation:nextRotation(element.rotation)})}>{c.rotate}</Button>
   <Button type="button" size="sm" variant="secondary" className="min-h-11" disabled={disabled} onClick={onFront}>{c.front}</Button>
   <Button type="button" size="sm" variant="secondary" className="min-h-11" disabled={disabled} onClick={onBack}>{c.backward}</Button>
   <Button type="button" size="sm" variant="secondary" className="min-h-11 text-[#8a2a1b]" disabled={disabled} onClick={onRemove}>{c.remove}</Button>
  </div>
 </section>;
}

async function toBase64(file:File){
 const data=new Uint8Array(await file.arrayBuffer());let binary='';
 for(let i=0;i<data.length;i+=0x8000)binary+=String.fromCharCode.apply(null,Array.from(data.subarray(i,i+0x8000)));
 return btoa(binary);
}

function AddPanel({kind,c,accountId,workId,disabled,onAdd,onClose,drawColor,onDrawColor}:{kind:Exclude<Panel,null>;c:Copy;accountId:string;workId:string;disabled:boolean;onAdd:(element:MoodDraftElement)=>void;onClose:()=>void;drawColor:string;onDrawColor:(color:string)=>void}){
 const [photos,setPhotos]=useState<WorkFile[]|null>(null),[cursor,setCursor]=useState<string|null>(null),[photosError,setPhotosError]=useState(false),[uploading,setUploading]=useState(false),[uploadError,setUploadError]=useState('');
 const [search,setSearch]=useState(''),[products,setProducts]=useState<MoodProduct[]|null>(null),[productsError,setProductsError]=useState(false),[showPrice,setShowPrice]=useState(true),[productPhoto,setProductPhoto]=useState('');
 const [color,setColor]=useState('#008bb5'),[hex,setHex]=useState('#008bb5'),[label,setLabel]=useState(''),[note,setNote]=useState(''),[message,setMessage]=useState(''),[freeText,setFreeText]=useState(''),[textColor,setTextColor]=useState('#162543'),[arrowColor,setArrowColor]=useState('#d14343'),[direction,setDirection]=useState<'e'|'w'|'s'|'n'|'se'|'ne'>('e');
 const alive=useRef(true),productSeq=useRef(0),productSpecs=useCatalogSpecs(products?.map(item=>item.id)??[]);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 const loadPhotos=useCallback(async(after:string|null)=>{
  setPhotosError(false);
  try{const response=await fetch('/api/pro/work-files?'+new URLSearchParams(after?{workId,after}:{workId}),{cache:'no-store',headers:{'X-Pro-Expected-Actor':accountId}});if(!response.ok)throw Error();
   const body=workFilesPageSchema.parse(await response.json());if(!alive.current)return;
   const images=body.items.filter(file=>file.ready&&file.mimeType==='image/jpeg');setPhotos(old=>after&&old?[...old,...images]:images);setCursor(body.nextCursor);}
  catch{if(alive.current)setPhotosError(true);}
 },[accountId,workId]);
 const loadProducts=useCallback(async(query:string)=>{
  const id=++productSeq.current;setProductsError(false);
  try{const response=await fetch(api+'?'+new URLSearchParams({products:query.slice(0,80)}),{cache:'no-store',headers:{'X-Pro-Expected-Actor':accountId}});if(!response.ok)throw Error();
   const body=moodProductsSchema.parse(await response.json());if(alive.current&&id===productSeq.current)setProducts(body.items);}
  catch{if(alive.current&&id===productSeq.current)setProductsError(true);}
 },[accountId]);
 useEffect(()=>{const timer=setTimeout(()=>{if(kind==='image'||kind==='product')void loadPhotos(null);if(kind==='product')void loadProducts('');},0);return()=>clearTimeout(timer);},[kind,loadPhotos,loadProducts]);
 useEffect(()=>{if(kind!=='product')return;const timer=setTimeout(()=>void loadProducts(search),250);return()=>clearTimeout(timer);},[kind,search,loadProducts]);
 async function upload(file:File){
  setUploadError('');if(file.size<1||file.size>WORK_FILE_MAX_BYTES){setUploadError(c.uploadFailed);return;}
  setUploading(true);const fileId=crypto.randomUUID();
  try{
   const data=await toBase64(file);
   const response=await fetch('/api/pro/work-files',{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json','X-Pro-Expected-Actor':accountId},body:JSON.stringify({action:'upload',workId,fileId,name:file.name.slice(0,160)||'foto.jpg',data})});
   if(!response.ok)throw Error();
   if(!alive.current)return;
   onAdd({kind:'image',id:crypto.randomUUID(),x:3000,y:2000,w:3500,h:4500,rotation:0,fileId});
  }catch{if(alive.current)setUploadError(c.uploadFailed);}
  finally{if(alive.current)setUploading(false);}
 }
 const box={rotation:0 as const};
 const photoGrid=(pick:(file:WorkFile)=>void,chosen?:string)=><div className="space-y-2">
  {photosError&&<p role="alert" className="flex flex-wrap items-center gap-2 text-sm text-[#8a2a1b]">{c.photosError}<button type="button" className="min-h-11 font-semibold underline" onClick={()=>void loadPhotos(null)}>{c.retry}</button></p>}
  {photos&&photos.length===0&&<p className="text-sm text-[#52627a]">{c.noPhotos}</p>}
  {photos&&photos.length>0&&<ul className="grid grid-cols-3 gap-2 sm:grid-cols-5">{photos.map(file=><li key={file.id}>
   <button type="button" disabled={disabled} aria-pressed={chosen?chosen===file.id:undefined} aria-label={c.usePhoto(file.name)} data-mood-photo={file.id} onClick={()=>pick(file)} className={`block w-full overflow-hidden rounded-xl border-2 ${chosen===file.id?'border-[#0089bb]':'border-[#d7e1ea]'}`}>
    {/* eslint-disable-next-line @next/next/no-img-element -- private job file reauthorized on every request */}
    <img src={moodOwnerImageUrl(file.id)} alt="" loading="lazy" className="aspect-square w-full bg-[#f7f9fc] object-cover"/>
   </button></li>)}</ul>}
  {cursor&&<Button type="button" size="sm" variant="secondary" className="min-h-11" onClick={()=>void loadPhotos(cursor)}>{c.morePhotos}</Button>}
 </div>;
 return <section data-mood-add-panel={kind} className="space-y-3 rounded-2xl border border-[#d7e1ea] bg-[#f7f9fc] p-4">
  <div className="flex items-center justify-between gap-2"><h4 className="text-sm font-semibold">{{image:c.photos,product:c.searchItems,swatch:c.color,note:c.addNote,text:c.addText,arrow:c.addArrow,drawing:c.addDrawing}[kind]}</h4><Button type="button" size="sm" variant="ghost" className="min-h-11" onClick={onClose}>{c.close}</Button></div>
  {message&&<p role="alert" className="text-sm text-[#8a2a1b]">{message}</p>}
  {kind==='image'&&<>
   <div className="flex flex-wrap items-center gap-3">
    <label className={`inline-flex min-h-11 cursor-pointer items-center rounded-xl bg-[#009FD9] px-4 text-sm font-semibold text-white ${disabled||uploading?'pointer-events-none opacity-50':''}`}>{uploading?c.uploading:c.upload}
     <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" data-mood-upload disabled={disabled||uploading} onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)void upload(file);}}/></label>
    <span className="text-xs text-[#52627a]">{c.uploadHelp} {c.photosHelp}</span>
   </div>
   {uploadError&&<p role="alert" className="text-sm text-[#8a2a1b]">{uploadError}</p>}
   <MoodImageLibrary accountId={accountId} disabled={disabled||uploading} onPick={upload}/>
   {photoGrid(file=>onAdd({kind:'image',id:crypto.randomUUID(),x:3000,y:2000,w:3500,h:4500,...box,fileId:file.id}))}
  </>}
  {kind==='product'&&<>
   <label className="block text-sm font-semibold">{c.searchItems}<input type="search" data-mood-field="item-search" maxLength={80} placeholder={c.searchPlaceholder} value={search} onChange={e=>setSearch(e.target.value)} className={field}/></label>
   <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5 accent-[#0089bb]" checked={showPrice} onChange={e=>setShowPrice(e.target.checked)}/>{c.showPrice}</label>
   <details className="text-sm"><summary className="min-h-11 cursor-pointer content-center font-semibold">{c.itemPhoto}: {productPhoto?'✓':c.noPhoto}</summary>{photoGrid(file=>setProductPhoto(old=>old===file.id?'':file.id),productPhoto)}</details>
   {productsError&&<p role="alert" className="flex flex-wrap items-center gap-2 text-sm text-[#8a2a1b]">{c.itemsError}<button type="button" className="min-h-11 font-semibold underline" onClick={()=>void loadProducts(search)}>{c.retry}</button></p>}
   {products&&products.length===0&&<p className="text-sm text-[#52627a]">{c.noItems}</p>}
   {products&&products.length>0&&<ul className="space-y-1.5">{products.map(item=><li key={item.id}>
    <button type="button" disabled={disabled} data-mood-product={item.id} aria-label={c.addItem(item.name)} onClick={()=>onAdd({kind:'product',id:crypto.randomUUID(),x:3500,y:3000,w:2500,h:productPhoto?4000:2000,...box,productId:item.id,fileId:productPhoto||null,showPrice,name:item.name,unit:item.unit,priceCents:item.priceCents})}
     className="flex min-h-11 w-full min-w-0 items-center justify-between gap-3 rounded-xl border border-[#d7e1ea] bg-white px-3 py-2 text-left text-sm hover:border-[#0089bb]">
     <span className="min-w-0"><span className="block truncate font-semibold">{item.name}</span>{(item.sku||item.category)&&<span className="block truncate text-xs text-[#52627a]">{[item.sku,item.category].filter(Boolean).join(' · ')}</span>}<CatalogSpecsLine specs={productSpecs[item.id]} className="block truncate text-xs text-[#52627a]"/></span>
     <span className="shrink-0 text-[#52627a]">{proMoney(item.priceCents/100)}{item.unit?` / ${item.unit}`:''}</span>
    </button></li>)}</ul>}
  </>}
  {kind==='swatch'&&<form className="space-y-3" onSubmit={e=>{e.preventDefault();const value=hex.trim().toLowerCase();if(!/^#[0-9a-f]{6}$/.test(value)){setMessage(c.invalidColor);return;}onAdd({kind:'swatch',id:crypto.randomUUID(),x:4000,y:3500,w:1800,h:2600,...box,color:value,label:label.trim()||null});}}>
   <div className="flex flex-wrap gap-2">{swatchPresets.map(value=><button key={value} type="button" aria-label={value} aria-pressed={hex===value} onClick={()=>{setColor(value);setHex(value);setMessage('');}} className={`h-11 w-11 rounded-xl border-2 ${hex===value?'border-[#0089bb]':'border-[#d7e1ea]'}`} style={{background:value}}/>)}</div>
   <div className="grid gap-3 sm:grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)] sm:items-end">
    <input type="color" aria-label={c.color} value={color} onChange={e=>{setColor(e.target.value.toLowerCase());setHex(e.target.value.toLowerCase());setMessage('');}} className="h-11 w-14 rounded-xl border border-[#d7e1ea] bg-white p-1"/>
    <label className="block text-sm font-semibold">{c.colorHex}<input data-mood-field="swatch-hex" value={hex} maxLength={7} onChange={e=>{setHex(e.target.value);if(/^#[0-9a-fA-F]{6}$/.test(e.target.value))setColor(e.target.value.toLowerCase());setMessage('');}} className={field}/></label>
    <label className="block text-sm font-semibold">{c.colorName}<input data-mood-field="swatch-label" maxLength={MOOD_LABEL_MAX} value={label} onChange={e=>setLabel(e.target.value)} className={field}/></label>
   </div>
   <div className="flex justify-end"><Button type="submit" className="min-h-11" disabled={disabled}>{c.addColor}</Button></div>
  </form>}
  {kind==='note'&&<form className="space-y-3" onSubmit={e=>{e.preventDefault();const value=note.trim();if(!value){setMessage(c.noteRequired);return;}onAdd({kind:'note',id:crypto.randomUUID(),x:3000,y:3500,w:3200,h:2200,...box,text:value.slice(0,MOOD_NOTE_MAX)});}}>
   <label className="block text-sm font-semibold">{c.noteText}<textarea data-mood-field="note" rows={3} maxLength={MOOD_NOTE_MAX} value={note} onChange={e=>{setNote(e.target.value);setMessage('');}} className={field+' py-2'}/></label>
   <div className="flex justify-end"><Button type="submit" className="min-h-11" disabled={disabled}>{c.addNoteBtn}</Button></div>
  </form>}
  {kind==='text'&&<form data-mood-text-form className="space-y-3" onSubmit={e=>{e.preventDefault();const value=freeText.trim();if(!value){setMessage(c.textRequired);return;}onAdd({kind:'text',id:crypto.randomUUID(),x:2500,y:3000,w:5000,h:1200,...box,text:value.slice(0,MOOD_NOTE_MAX),color:textColor});}}>
   <label className="block text-sm font-semibold">{c.textText}<textarea data-mood-field="text" rows={2} maxLength={MOOD_NOTE_MAX} value={freeText} onChange={e=>{setFreeText(e.target.value);setMessage('');}} className={field+' py-2'}/></label>
   <label className="flex items-center gap-2 text-sm font-semibold"><input type="color" aria-label={c.color} value={textColor} onChange={e=>setTextColor(e.target.value.toLowerCase())} className="h-11 w-14 rounded-xl border border-[#d7e1ea] bg-white p-1"/>{c.color}</label>
   <div className="flex justify-end"><Button type="submit" className="min-h-11" disabled={disabled}>{c.addTextBtn}</Button></div>
  </form>}
  {kind==='arrow'&&<form data-mood-arrow-form className="space-y-3" onSubmit={e=>{e.preventDefault();const shape={e:{w:3000,h:600,points:[[0,500],[1000,500]]},w:{w:3000,h:600,points:[[1000,500],[0,500]]},s:{w:600,h:3000,points:[[500,0],[500,1000]]},n:{w:600,h:3000,points:[[500,1000],[500,0]]},se:{w:2500,h:2500,points:[[0,0],[1000,1000]]},ne:{w:2500,h:2500,points:[[0,1000],[1000,0]]}}[direction] as {w:number;h:number;points:[number,number][]};onAdd({kind:'arrow',id:crypto.randomUUID(),x:3500,y:3500,...box,...shape,color:arrowColor});}}>
   <fieldset><legend className="text-sm font-semibold">{c.direction}</legend><div className="mt-1 flex flex-wrap gap-2">{([['e','→'],['w','←'],['s','↓'],['n','↑'],['se','↘'],['ne','↗']] as const).map(([value,glyph])=><Button key={value} type="button" size="sm" variant={direction===value?'default':'secondary'} aria-pressed={direction===value} className="min-h-11 min-w-11 text-lg" onClick={()=>setDirection(value)}>{glyph}</Button>)}</div></fieldset>
   <label className="flex items-center gap-2 text-sm font-semibold"><input type="color" aria-label={c.strokeColor} value={arrowColor} onChange={e=>setArrowColor(e.target.value.toLowerCase())} className="h-11 w-14 rounded-xl border border-[#d7e1ea] bg-white p-1"/>{c.strokeColor}</label>
   <div className="flex justify-end"><Button type="submit" className="min-h-11" disabled={disabled}>{c.addArrowBtn}</Button></div>
  </form>}
  {kind==='drawing'&&<div data-mood-draw-panel className="space-y-3"><p className="text-sm text-[#52627a]">{c.drawHint}</p>
   <label className="flex items-center gap-2 text-sm font-semibold"><input type="color" aria-label={c.strokeColor} value={drawColor} onChange={e=>onDrawColor(e.target.value.toLowerCase())} className="h-11 w-14 rounded-xl border border-[#d7e1ea] bg-white p-1"/>{c.strokeColor}</label>
   <div className="flex justify-end"><Button type="button" className="min-h-11" onClick={onClose}>{c.doneDrawing}</Button></div>
  </div>}
 </section>;
}

function CommentsPanel({c,en,comments,published,reply,disabled,onReply,onSubmit}:{c:Copy;en:boolean;comments:MoodComment[];published:boolean;reply:string;disabled:boolean;onReply:(value:string)=>void;onSubmit:(event:FormEvent)=>void}){
 return <section data-mood-comments className="space-y-3 rounded-2xl border border-[#d7e1ea] bg-white p-4">
  <h4 className="font-semibold">{c.commentsTitle}</h4>
  {comments.length===0?<p className="text-sm text-[#52627a]">{published?c.commentsEmpty:c.commentsHidden}</p>:
   <ol className="space-y-2">{comments.map(comment=><li key={comment.id} data-mood-comment={comment.side} className={`rounded-xl p-3 text-sm ${comment.side==='client'?'bg-[#f7f9fc]':'bg-[#eef6fb]'}`}>
    <p className="flex flex-wrap justify-between gap-2 text-xs text-[#52627a]"><span className="font-semibold text-[#162543]">{comment.side==='owner'?c.you:comment.authorName??c.customer}</span><span>{stamp(comment.createdAt,en)} · {c.version(comment.version)}</span></p>
    <p className="mt-1 whitespace-pre-wrap break-words">{comment.body}</p>
   </li>)}</ol>}
  {published&&<form onSubmit={onSubmit} className="space-y-2">
   <label className="block text-sm font-semibold">{c.replyLabel}<textarea data-mood-field="reply" rows={2} maxLength={MOOD_COMMENT_MAX} disabled={disabled} value={reply} onChange={e=>onReply(e.target.value)} className={field+' py-2'}/></label>
   <div className="flex justify-end"><Button type="submit" className="min-h-11" disabled={disabled||!reply.trim()}>{c.send}</Button></div>
  </form>}
 </section>;
}
