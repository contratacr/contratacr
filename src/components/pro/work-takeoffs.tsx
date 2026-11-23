'use client';

import {useCallback,useEffect,useLayoutEffect,useMemo,useRef,useState,type FormEvent,type MouseEvent as ReactMouseEvent,type PointerEvent as ReactPointerEvent,type ReactNode} from 'react';
import {useLocale} from 'next-intl';
import {useAuth} from '@/hooks/use-auth';
import {useAppDialog} from '@/hooks/use-app-dialog';
import {Button} from '@/components/ui/button';
import {currentProPath,navigatePro} from '@/lib/pro/navigation';
import {
 formatMilli,formatQuantity,milliToInput,parseMilli,previewTakeoff,roundCoordinate,takeoffColors,takeoffDetailSchema,takeoffMutationResultSchema,takeoffMutationSchema,unitLabel,
 type TakeoffDetail,type TakeoffHistoryEntry,type TakeoffKind,type TakeoffMeasurement,type TakeoffMultiplierMode,type TakeoffMutation,type TakeoffDeduction,type TakeoffPage,type TakeoffPlan,type TakeoffPoint,
 type TakeoffResultUnit,type TakeoffSendResult,type TakeoffUnit,
} from '@/lib/pro/takeoffs';
import {CatalogSelect} from './catalog-select';
import {privateEstimateMoney} from './private-estimate-preview';
import {useProChildGuard} from './use-pro-child-guard';
import {useReveal} from './use-reveal';
import {AiTakeoffSuggestions,type TakeoffDraftItem} from './ai-takeoff-suggestions';
import {workFilesPageSchema,type WorkFile} from '@/lib/pro/work-files';
import {isPdfFile,openTakeoffPdf,renderTakeoffPdfPage,takeoffPdfCanvasJpeg,takeoffPdfPageName,TakeoffPdfError,type TakeoffPdfDocument,type TakeoffPdfErrorCode} from '@/lib/pro/takeoff-pdf';
import {PRO_FILE_MAX_BYTES} from '@/lib/pro/file-limit';
import {detectRoom,toNormalized} from '@/lib/pro/takeoff-detect';

/**
 * Mediciones sobre planos (row 66): plans of the job, a viewer with per-page
 * scale, area/length/count tools, a grouped measurement panel and «Send to
 * estimate». Private to the professional; nothing is shared or notified.
 */
const api='/api/pro/takeoffs',field='mt-1 block min-h-11 w-full min-w-0 rounded-xl border border-[#d7e1ea] bg-white px-3 text-base font-normal text-[#162543]';
const IMAGE_MAX_BYTES=PRO_FILE_MAX_BYTES;
type StateCallback={onStateChange?:(state:{dirty:boolean;busy:boolean})=>void};
type Tool='pan'|'scale'|'detect'|TakeoffKind;
type MeasurementDraft={kind:TakeoffKind;name:string;categoryId:string;color:string;manual:string;multiplierMode:TakeoffMultiplierMode;multiplier:string;waste:string;productId:string;productName:string;points:TakeoffPoint[]};
type Form=
 |{kind:'measurement';measurement:TakeoffMeasurement|null;draft:MeasurementDraft;initial:MeasurementDraft}
 |{kind:'calibration';draft:{unit:TakeoffUnit;length:string;points:TakeoffPoint[]};initial:{unit:TakeoffUnit;length:string;points:TakeoffPoint[]}}
 |{kind:'plan';plan:TakeoffPlan;draft:{title:string};initial:{title:string}};
type Pending={url:string;body:string;notice:string;then?:'upload'};
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const day=(value:string,en:boolean)=>new Intl.DateTimeFormat(en?'en-US':'es-CR',{dateStyle:'medium',timeZone:'UTC'}).format(new Date(value+'T12:00:00Z'));
const stamp=(value:string,en:boolean)=>new Intl.DateTimeFormat(en?'en-US':'es-CR',{dateStyle:'medium',timeStyle:'short',timeZone:'America/Costa_Rica'}).format(new Date(value));
const bytes=(value:number,en:boolean)=>{const f=new Intl.NumberFormat(en?'en-US':'es-CR',{maximumFractionDigits:1});return value>=1048576?`${f.format(value/1048576)} MB`:`${f.format(Math.max(1,Math.round(value/1024)))} KB`;};
const minPoints=(kind:TakeoffKind)=>kind==='area'?3:kind==='length'?2:1;
/** Percent typed as "10" or "7,5" → basis points. */
function parsePercent(value:string){const clean=value.trim();if(!clean)return 0;if(!/^\d{1,3}([.,]\d{1,2})?$/.test(clean))return null;const [w,f='']=clean.split(/[.,]/),bps=Number(w)*100+Number((f+'00').slice(0,2));return bps<=10000?bps:null;}
const percentInput=(bps:number,en:boolean)=>bps?milliToInput(bps*10,en):'';
function readBase64(file:File){return new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>{const value=String(reader.result??'');const comma=value.indexOf(',');if(comma>0)resolve(value.slice(comma+1));else reject(Error('empty'));};reader.onerror=()=>reject(reader.error);reader.readAsDataURL(file);});}

function copy(en:boolean){
 return en?{
  title:'Plan measurements',intro:'Upload the plans of this project, set the scale of each page and measure areas, lengths and counts. Only you can see them; send the totals to a draft quote when you are ready.',
  upload:'Upload plan',uploading:'Uploading plan…',uploadHelp:'JPG or PNG images up to 20 MB (PNG is saved as JPG), or a PDF of up to 25 MB and 200 pages: choose the page to use as the plan.',pdf:{title:'Choose the PDF page',summary:(name:string,pages:number)=>`${name} · ${pages} ${pages===1?'page':'pages'}`,page:'Page to use as the plan',previous:'Previous page',next:'Next page',preview:(n:number,total:number)=>`Preview of page ${n} of ${total}`,rendering:'Preparing the page…',opening:'Opening the PDF…',use:'Use this page',cancel:'Cancel',help:'The PDF is not uploaded: only the chosen page is saved as the plan image. Then set its scale as usual.',errors:{size:'Use a PDF of up to 25 MB.',invalid:'This PDF could not be read. Check the file or export the page as an image.',pages:'Use a PDF with 1 to 200 pages and choose an existing page.',password:'Password-protected PDFs are not supported. Remove the password and try again.',load:'The PDF reader could not be loaded. Reload the page and try again.',render:'This page could not be prepared. Try another page or export it as an image.'}},
  uploadInvalid:'Use a JPG or PNG image of up to 20 MB.',uploadFailed:'Could not upload the plan. Review the file and try again.',uploaded:'Plan uploaded. Open it to set the scale and measure.',
  plans:'Plans',col:{title:'Title',date:'Uploaded',type:'Type',size:'Size',pages:'Pages',measurements:'Measurements'},imageType:'JPG image',pdfType:'PDF',
  empty:'There are no plans yet.',emptyHelp:'Upload a floor plan or elevation to start measuring. It is also kept in this job’s files, without sharing it.',
  open:'Open',close:'Close plan',rename:'Rename',archive:'Archive',restore:'Restore',planTitle:'Plan title',savePlan:'Save title',
  showArchived:(n:number)=>`Show archived (${n})`,hideArchived:'Hide archived',archivedPlans:'Archived plans',archivedMeasurements:'Archived measurements',
  viewer:'Plan viewer',page:(n:number,t:number)=>`Page ${n} of ${t}`,tools:'Measuring tools',
  toolNames:{pan:'Pan',scale:'Scale',detect:'Detect room',area:'Area',length:'Length',count:'Count'} as Record<Tool,string>,
  toolHelp:{pan:'Drag or scroll to move around the plan.',detect:'Tap inside a room. The outline is proposed as an area you can review, adjust and save. It is an aid: check it against the plan.',scale:'Click both ends of a dimension you know, then type its real length.',area:'Click each corner of the area. Finish when the outline is closed.',length:'Click each point of the line. Finish at the last point.',count:'Click each item to count it.'} as Record<Tool,string>,
  zoomOut:'Zoom out',zoomIn:'Zoom in',fit:'Fit to width',points:(n:number)=>n===1?'1 point':`${n} points`,undo:'Undo last point',finish:'Finish',cancel:'Cancel',
  scaleSet:(v:string)=>`Scale set: the reference line measures ${v}.`,scaleMissing:'No scale yet: set it to measure areas and lengths. Counts and typed values do not need it.',
  calibrationTitle:'Page scale',realLength:'Real length of the line',unit:'Unit',meters:'Meters (m)',feet:'Feet (ft)',saveScale:'Save scale',clearScale:'Remove scale',
  scaleInvalid:'Draw a reference line and type a length greater than zero (up to 1,000).',scaleSaved:'Scale saved. Measurements on this page were recalculated.',redraw:'Draw the line again',
  manual:'Add a typed value',manualHelp:'Without drawing: type a quantity you already know.',measurementTitle:'Measurement',newMeasurement:'New measurement',
  name:'Name',kind:'Type',kinds:{area:'Area',length:'Length',count:'Count'} as Record<TakeoffKind,string>,quantity:'Quantity',
  category:'Category',noCategory:'No category',categoryHelp:'Categories come from Company › Categories.',color:'Color',
  colorNames:['Teal','Orange','Green','Violet','Raspberry','Amber','Blue','Gray'],
  multiplier:'Multiplier (optional)',modes:{none:'No multiplier',height:'Wall height (length × height = area)',factor:'Factor (for example, 2 sides)'} as Record<TakeoffMultiplierMode,string>,
  height:(u:string)=>`Height (${u})`,factor:'Factor',waste:'Waste (%)',item:'Item from My items (optional)',removeItem:'Remove item',
  result:'Result',total:'Total',needsScale:'Needs scale',preview:(r:string,t:string)=>`Result: ${r} · Total: ${t}`,
  saveMeasurement:'Save measurement',saving:'Saving…',measurementInvalid:'Enter a name and valid numbers. Multipliers and quantities must be greater than zero; waste goes from 0 to 100.',
  saved:'Saved.',archived_:'Measurement archived. It stays in the history.',restored:'Restored.',planArchived:'Plan archived. Its measurements stay in the history.',
  panel:'Measurements',panelEmpty:'No measurements on this plan yet. Choose a tool and click on the plan, or add a typed value.',
  uncategorized:'No category',subtotal:'Subtotal',hide:'Hide on plan',edit:'Edit',showArchivedMeasurements:(n:number)=>`Show archived (${n})`,include:'Include in the quote',
  typed:'Typed value',heightNote:(v:string)=>`× ${v} height`,factorNote:(v:string)=>`× ${v}`,wasteNote:(v:string)=>`+${v} % waste`,linkedItem:(v:string)=>`Item: ${v}`,
  archiveTitle:'Archive this measurement?',archiveText:'It leaves the plan and the panel, and stays in the history. You can restore it.',archivePlanTitle:'Archive this plan?',archivePlanText:'The plan and its measurements leave the list and stay in the history. The image stays in the job files. You can restore it.',back:'Back',
  send:'Send to quote',sendIntro:'Each selected measurement becomes a quote line with its total as the quantity. Sending it again updates the same line instead of adding another. You can send it to a draft quote of this project that you have not shared yet, or to a new one.',
  target:'Quote',newEstimate:'New draft quote',lines:(n:number)=>n===1?'1 line':`${n} lines`,sendButton:(n:number)=>n===1?'Send 1 measurement':`Send ${n} measurements`,
  sendNeedsScale:'Some selected measurements need a scale. Set it or uncheck them.',cannotQuote:'To quote, the job needs an active customer and must not be cancelled.',
  sent:(n:number,t:string)=>n===1?`1 line sent to "${t}".`:`${n} lines sent to "${t}".`,openEstimate:'Open quote',sendFailed:'Could not send to the quote. Review the measurements and try again.',
  history:'Change history',historyEmpty:'No changes yet.',
  actions:{plan_create:'Plan uploaded',plan_update:'Plan renamed',plan_archive:'Plan archived',plan_restore:'Plan restored',page_calibrate:'Scale changed',measurement_create:'Measurement added',measurement_update:'Measurement edited',measurement_visibility:'Visibility changed',measurement_archive:'Measurement archived',measurement_restore:'Measurement restored',send_estimate:'Sent to a quote'} as Record<TakeoffHistoryEntry['action'],string>,
  loading:'Loading measurements…',loadError:'Could not load the measurements.',retry:'Retry',reload:'Reload',
  conflict:'This information changed in another window. Reload before trying again.',uncertain:'We could not confirm whether it was saved. Retry the same operation; it will not be applied twice.',retrySame:'Retry the same operation',
  failed:'Could not save. Review the information and try again.',leave:'Save or cancel the measurement you are working on before leaving.',canvas:(t:string)=>`Plan ${t} with its measurements`,imageError:'Could not open the plan image.',
 }:{
  title:'Mediciones sobre planos',intro:'Suba los planos de este proyecto, defina la escala de cada página y mida áreas, longitudes y cantidades. Solo usted las ve; cuando esté listo, envíe los totales a una cotización en borrador.',
  upload:'Subir plano',uploading:'Subiendo plano…',uploadHelp:'Imágenes JPG o PNG de hasta 20 MB (PNG se guarda como JPG), o un PDF de hasta 25 MB y 200 páginas: elija la página que usará como plano.',pdf:{title:'Elegir la página del PDF',summary:(name:string,pages:number)=>`${name} · ${pages} ${pages===1?'página':'páginas'}`,page:'Página que usará como plano',previous:'Página anterior',next:'Página siguiente',preview:(n:number,total:number)=>`Vista previa de la página ${n} de ${total}`,rendering:'Preparando la página…',opening:'Abriendo el PDF…',use:'Usar esta página',cancel:'Cancelar',help:'El PDF no se sube: solo se guarda la página elegida como imagen del plano. Después defina su escala como siempre.',errors:{size:'Use un PDF de hasta 25 MB.',invalid:'No se pudo leer este PDF. Revise el archivo o exporte la página como imagen.',pages:'Use un PDF de 1 a 200 páginas y elija una página existente.',password:'No se admiten PDF protegidos con contraseña. Quite la contraseña y vuelva a intentarlo.',load:'No se pudo cargar el lector de PDF. Recargue la página y vuelva a intentarlo.',render:'No se pudo preparar esta página. Pruebe otra página o expórtela como imagen.'}},
  uploadInvalid:'Use una imagen JPG o PNG de hasta 20 MB.',uploadFailed:'No se pudo subir el plano. Revise el archivo y vuelva a intentarlo.',uploaded:'Plano subido. Ábralo para definir la escala y medir.',
  plans:'Planos',col:{title:'Título',date:'Subido',type:'Tipo',size:'Tamaño',pages:'Páginas',measurements:'Mediciones'},imageType:'Imagen JPG',pdfType:'PDF',
  empty:'Todavía no hay planos.',emptyHelp:'Suba una planta o una elevación para empezar a medir. También queda en los archivos de este trabajo, sin compartirse.',
  open:'Abrir',close:'Cerrar plano',rename:'Renombrar',archive:'Archivar',restore:'Restaurar',planTitle:'Título del plano',savePlan:'Guardar título',
  showArchived:(n:number)=>`Mostrar archivados (${n})`,hideArchived:'Ocultar archivados',archivedPlans:'Planos archivados',archivedMeasurements:'Mediciones archivadas',
  viewer:'Visor del plano',page:(n:number,t:number)=>`Página ${n} de ${t}`,tools:'Herramientas de medición',
  toolNames:{pan:'Mover',scale:'Escala',detect:'Detectar ambiente',area:'Área',length:'Longitud',count:'Conteo'} as Record<Tool,string>,
  toolHelp:{pan:'Arrastre o desplace para recorrer el plano.',detect:'Toque dentro de un ambiente. El contorno se propone como un área que usted puede revisar, ajustar y guardar. Es una ayuda: verifíquelo contra el plano.',scale:'Haga clic en los dos extremos de una medida conocida y luego escriba su longitud real.',area:'Haga clic en cada esquina del área. Termine cuando el contorno esté cerrado.',length:'Haga clic en cada punto de la línea. Termine en el último punto.',count:'Haga clic sobre cada elemento para contarlo.'} as Record<Tool,string>,
  zoomOut:'Alejar',zoomIn:'Acercar',fit:'Ajustar al ancho',points:(n:number)=>n===1?'1 punto':`${n} puntos`,undo:'Deshacer último punto',finish:'Terminar',cancel:'Cancelar',
  scaleSet:(v:string)=>`Escala definida: la línea de referencia mide ${v}.`,scaleMissing:'Aún no hay escala: defínala para medir áreas y longitudes. Los conteos y los valores escritos no la necesitan.',
  calibrationTitle:'Escala de la página',realLength:'Longitud real de la línea',unit:'Unidad',meters:'Metros (m)',feet:'Pies (ft)',saveScale:'Guardar escala',clearScale:'Quitar escala',
  scaleInvalid:'Dibuje una línea de referencia y escriba una longitud mayor que cero (hasta 1000).',scaleSaved:'Escala guardada. Las mediciones de esta página se recalcularon.',redraw:'Volver a dibujar la línea',
  manual:'Agregar un valor escrito',manualHelp:'Sin dibujar: escriba una cantidad que ya conoce.',measurementTitle:'Medición',newMeasurement:'Nueva medición',
  name:'Nombre',kind:'Tipo',kinds:{area:'Área',length:'Longitud',count:'Conteo'} as Record<TakeoffKind,string>,quantity:'Cantidad',
  category:'Categoría',noCategory:'Sin categoría',categoryHelp:'Las categorías vienen de Empresa › Categorías.',color:'Color',
  colorNames:['Celeste','Naranja','Verde','Violeta','Frambuesa','Ámbar','Azul','Gris'],
  multiplier:'Multiplicador (opcional)',modes:{none:'Sin multiplicador',height:'Altura de pared (longitud × altura = área)',factor:'Factor (por ejemplo, 2 caras)'} as Record<TakeoffMultiplierMode,string>,
  height:(u:string)=>`Altura (${u})`,factor:'Factor',waste:'Desperdicio (%)',item:'Artículo de Mis artículos (opcional)',removeItem:'Quitar artículo',
  result:'Resultado',total:'Total',needsScale:'Falta la escala',preview:(r:string,t:string)=>`Resultado: ${r} · Total: ${t}`,
  saveMeasurement:'Guardar medición',saving:'Guardando…',measurementInvalid:'Indique un nombre y números válidos. Los multiplicadores y las cantidades deben ser mayores que cero; el desperdicio va de 0 a 100.',
  saved:'Guardado.',archived_:'Medición archivada. Queda en el historial.',restored:'Restaurado.',planArchived:'Plano archivado. Sus mediciones quedan en el historial.',
  panel:'Mediciones',panelEmpty:'Este plano aún no tiene mediciones. Elija una herramienta y haga clic en el plano, o agregue un valor escrito.',
  uncategorized:'Sin categoría',subtotal:'Subtotal',hide:'Ocultar en el plano',edit:'Editar',showArchivedMeasurements:(n:number)=>`Mostrar archivadas (${n})`,include:'Incluir en la cotización',
  typed:'Valor escrito',heightNote:(v:string)=>`× ${v} de altura`,factorNote:(v:string)=>`× ${v}`,wasteNote:(v:string)=>`+${v} % de desperdicio`,linkedItem:(v:string)=>`Artículo: ${v}`,
  archiveTitle:'¿Archivar esta medición?',archiveText:'Sale del plano y del panel, y queda en el historial. Puede restaurarla.',archivePlanTitle:'¿Archivar este plano?',archivePlanText:'El plano y sus mediciones salen de la lista y quedan en el historial. La imagen sigue en los archivos del trabajo. Puede restaurarlo.',back:'Volver',
  send:'Enviar a cotización',sendIntro:'Cada medición seleccionada se convierte en una partida con su total como cantidad. Si la vuelve a enviar, se actualiza la misma partida en lugar de agregar otra. Puede enviarla a una cotización en borrador de este proyecto que todavía no haya compartido, o a una nueva.',
  target:'Cotización',newEstimate:'Nueva cotización en borrador',lines:(n:number)=>n===1?'1 partida':`${n} partidas`,sendButton:(n:number)=>n===1?'Enviar 1 medición':`Enviar ${n} mediciones`,
  sendNeedsScale:'Algunas mediciones seleccionadas necesitan escala. Defínala o desmárquelas.',cannotQuote:'Para cotizar, el trabajo debe tener un cliente activo y no estar cancelado.',
  sent:(n:number,t:string)=>n===1?`Se envió 1 partida a "${t}".`:`Se enviaron ${n} partidas a "${t}".`,openEstimate:'Abrir cotización',sendFailed:'No se pudo enviar a la cotización. Revise las mediciones y vuelva a intentarlo.',
  history:'Historial de cambios',historyEmpty:'Todavía no hay cambios.',
  actions:{plan_create:'Plano subido',plan_update:'Plano renombrado',plan_archive:'Plano archivado',plan_restore:'Plano restaurado',page_calibrate:'Escala cambiada',measurement_create:'Medición agregada',measurement_update:'Medición editada',measurement_visibility:'Visibilidad cambiada',measurement_archive:'Medición archivada',measurement_restore:'Medición restaurada',send_estimate:'Enviado a una cotización'} as Record<TakeoffHistoryEntry['action'],string>,
  loading:'Cargando mediciones…',loadError:'No se pudieron cargar las mediciones.',retry:'Reintentar',reload:'Recargar',
  conflict:'Esta información cambió en otra ventana. Recargue antes de volver a intentarlo.',uncertain:'No pudimos confirmar si se guardó. Reintente la misma operación; no se aplicará dos veces.',retrySame:'Reintentar la misma operación',
  failed:'No se pudo guardar. Revise los datos y vuelva a intentarlo.',leave:'Guarde o cancele la medición en curso antes de salir.',canvas:(t:string)=>`Plano ${t} con sus mediciones`,imageError:'No se pudo abrir la imagen del plano.',
 };
}
type Copy=ReturnType<typeof copy>;

export function WorkTakeoffs({workId,onStateChange}:{workId:string}&StateCallback){
 const {user,loading}=useAuth();if(loading||!user)return null;
 return <TakeoffsSession key={user.id+':'+workId} accountId={user.id} workId={workId} onStateChange={onStateChange}/>;
}

function TakeoffsSession({accountId,workId,onStateChange}:{accountId:string;workId:string}&StateCallback){
 const en=useLocale()==='en',c=copy(en),{confirm,dialogNode}=useAppDialog();
 const [detail,setDetail]=useState<TakeoffDetail|null>(null),[loading,setLoading]=useState(true),[loadError,setLoadError]=useState(false);
 const [planId,setPlanId]=useState<string|null>(null),[tool,setTool]=useState<Tool>('pan'),[drawing,setDrawing]=useState<TakeoffPoint[]>([]),[zoom,setZoom]=useState(1);
 // Row 66: draw an opening directly inside an area; once saved it is subtracted from that area (the host id).
 const [openingOf,setOpeningOf]=useState<string|null>(null);
 // Row 66: assisted detection (tap inside a room). Settings are adjustable; the grey bitmap is cached per plan.
 const [detectOpts,setDetectOpts]=useState({threshold:140,closeRadius:3}),[detectBusy,setDetectBusy]=useState(false),[detectMsg,setDetectMsg]=useState('');
 const gray=useRef<{planId:string;data:Uint8ClampedArray;w:number;h:number}|null>(null),lastSeed=useRef<TakeoffPoint|null>(null);
 const [form,setForm]=useState<Form|null>(null),[saving,setSaving]=useState(false),[uncertain,setUncertain]=useState(false),[conflict,setConflict]=useState(false),[uploading,setUploading]=useState(false),[jobFiles,setJobFiles]=useState<WorkFile[]|'loading'|'error'|null>(null);
 const [error,setError]=useState(''),[notice,setNotice]=useState(''),[showArchived,setShowArchived]=useState(false),[sent,setSent]=useState<TakeoffSendResult|null>(null);
 const [selected,setSelected]=useState<Set<string>|null>(null),[target,setTarget]=useState('new');
 const active=useRef(true),sequence=useRef(0),lock=useRef(false),pending=useRef<Pending|null>(null),fileInput=useRef<HTMLInputElement>(null);
 // PDF plan: the document stays in the browser while the user picks a page (row 66).
 const [pdf,setPdf]=useState<{name:string;document:TakeoffPdfDocument;pages:number}|null>(null),[pdfPage,setPdfPage]=useState(1),[pdfInput,setPdfInput]=useState('1'),[pdfBusy,setPdfBusy]=useState<''|'opening'|'rendering'>('');
 const pdfCanvas=useRef<HTMLCanvasElement>(null),pdfRef=useRef<TakeoffPdfDocument|null>(null),pdfRender=useRef(0);
 const dirty=drawing.length>0||!!form&&!same(form.draft,form.initial)||!!pdf,busy=saving||uncertain||uploading||pdfBusy==='opening';
 useProChildGuard(!onStateChange&&(dirty||busy),useCallback(()=>setError(c.leave),[c.leave]));
 useLayoutEffect(()=>{onStateChange?.({dirty,busy});return()=>onStateChange?.({dirty:false,busy:false});},[dirty,busy,onStateChange]);
 const load=useCallback(async()=>{
  const id=++sequence.current;setLoading(true);setLoadError(false);
  try{
   const response=await fetch(api+'?'+new URLSearchParams({workId}),{cache:'no-store',headers:{'X-Pro-Expected-Actor':accountId}});if(!response.ok)throw Error();
   const body=takeoffDetailSchema.parse(await response.json());if(body.workId!==workId)throw Error();
   if(active.current&&id===sequence.current){setDetail(body);setConflict(false);}
  }catch{if(active.current&&id===sequence.current)setLoadError(true);}
  finally{if(active.current&&id===sequence.current)setLoading(false);}
 },[accountId,workId]);
 const invalidate=useCallback(()=>{sequence.current++;},[]);
 useEffect(()=>{active.current=true;const timer=setTimeout(()=>void load(),0);return()=>{active.current=false;invalidate();clearTimeout(timer);};},[load,invalidate]);
 // Round 6D: the floor plan editor sends room areas through this same writer; refresh when it finishes.
 useEffect(()=>{const refresh=()=>void load();window.addEventListener('ccr:pro-takeoffs-changed',refresh);return()=>window.removeEventListener('ccr:pro-takeoffs-changed',refresh);},[load]);

 /** One POST with the shared outcome model: 409 conflict, 5xx/network uncertain (retry the same body), 4xx invalid. */
 async function post(url:string,body:string,success:string,then?:'upload'):Promise<unknown>{
  if(lock.current)return null;lock.current=true;pending.current={url,body,notice:success,then};setSaving(true);setError('');setNotice('');
  try{
   const response=await fetch(url,{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json','X-Pro-Expected-Actor':accountId},body});
   if(response.status===409){pending.current=null;setUncertain(false);setConflict(true);setError(c.conflict);return null;}
   if(response.status>=500||response.status===429){setUncertain(true);setError(c.uncertain);return null;}
   if(!response.ok){pending.current=null;setUncertain(false);setError(url===api?(JSON.parse(body).action==='send_estimate'?c.sendFailed:c.failed):c.uploadFailed);return null;}
   const data=await response.json();
   pending.current=null;setUncertain(false);
   if(then==='upload'){lock.current=false;return data;}
   const parsed=takeoffMutationResultSchema.parse(data);
   if(active.current){setForm(null);setDrawing([]);setNotice(success);}
   lock.current=false;await load();return parsed;
  }catch{setUncertain(true);setError(c.uncertain);return null;}
  finally{lock.current=false;if(active.current)setSaving(false);}
 }
 const send=(input:TakeoffMutation|TakeoffDeduction,success:string)=>post(api,JSON.stringify(input),success);
 /** Round 6C: AI suggestions the owner kept become manual measurements through the same writer, one by one. */
 async function addAiItems(planIdValue:string,pageNumber:number,items:TakeoffDraftItem[],offset:number){
  for(const [index,item] of items.entries()){
   const quantity=Number(item.quantity.trim().replace(',','.')),manualMilli=Math.max(1,Math.round(quantity*1000));
   const done=await send({action:'measurement_create',workId,actionId:crypto.randomUUID(),id:crypto.randomUUID(),planId:planIdValue,pageNumber,kind:item.kind,name:item.name.trim().slice(0,120),categoryId:null,color:takeoffColors[(offset+index)%takeoffColors.length],points:[],manualMilli,multiplierMode:'none',multiplierMilli:null,wasteBps:0,productId:null},c.saved);
   if(!done)return false;
  }
  return true;
 }
 async function retrySame(){
  const p=pending.current;if(!p)return;
  if(p.then==='upload'){const done=await post(p.url,p.body,p.notice,'upload');if(done)await createPlan(JSON.parse(p.body));return;}
  await post(p.url,p.body,p.notice);
 }
 // Round 2: reuse an image already in the job's Files as a plan (no second upload).
 async function loadJobFiles(){
  setJobFiles('loading');
  try{const response=await fetch('/api/pro/work-files?'+new URLSearchParams({workId}),{cache:'no-store',headers:{'X-Pro-Expected-Actor':accountId}});if(!response.ok)throw Error();const body=workFilesPageSchema.parse(await response.json());if(body.workId!==workId)throw Error();if(active.current)setJobFiles(body.items);}
  catch{if(active.current)setJobFiles('error');}
 }
 async function chooseJobFile(id:string){if(!Array.isArray(jobFiles))return;const file=jobFiles.find(row=>row.id===id&&row.mimeType==='image/jpeg');if(!file)return;setJobFiles(null);await uploadFromFiles(file);}
 async function createPlan(upload:{fileId:string;name:string}){
  const title=upload.name.replace(/\.[^.]*$/u,'').trim().slice(0,160)||(en?'Plan':'Plano');
  const result=await send({action:'plan_create',actionId:crypto.randomUUID(),workId,id:crypto.randomUUID(),fileId:upload.fileId,title},c.uploaded);
  if(result&&typeof result==='object'&&'plan' in result&&active.current){setPlanId((result as {plan:TakeoffPlan}).plan.id);setTool('scale');}
 }
 async function upload(file:File){
  if(busy||conflict)return;setError('');setNotice('');
  if(isPdfFile(file)){await choosePdf(file);return;}
  await uploadImage(file);
 }
 const pdfMessage=(code:TakeoffPdfErrorCode)=>c.pdf.errors[code];
 const closePdf=useCallback(()=>{pdfRender.current++;const current=pdfRef.current;pdfRef.current=null;setPdf(null);setPdfBusy('');if(current)void current.destroy().catch(()=>{});},[]);
 useEffect(()=>()=>{pdfRender.current++;const current=pdfRef.current;pdfRef.current=null;if(current)void current.destroy().catch(()=>{});},[]);
 async function choosePdf(file:File){
  closePdf();setPdfBusy('opening');
  try{
   const document=await openTakeoffPdf(file);
   if(!active.current){void document.destroy().catch(()=>{});return;}
   pdfRef.current=document;setPdf({name:file.name.slice(0,160)||'plano.pdf',document,pages:document.numPages});setPdfPage(1);setPdfInput('1');setPdfBusy('');
  }catch(failure){if(active.current){setPdfBusy('');setError(pdfMessage(failure instanceof TakeoffPdfError?failure.code:'invalid'));}}
 }
 // Preview: re-render the chosen page whenever it changes (stale renders are ignored).
 useEffect(()=>{
  const canvas=pdfCanvas.current;if(!pdf||!canvas)return;const token=++pdfRender.current;
  const timer=setTimeout(()=>{setPdfBusy('rendering');renderTakeoffPdfPage(pdf.document,pdfPage,canvas).then(()=>{if(token===pdfRender.current)setPdfBusy('');}).catch(failure=>{if(token===pdfRender.current){setPdfBusy('');setError(pdfMessage(failure instanceof TakeoffPdfError?failure.code:'render'));}});},0);
  return()=>clearTimeout(timer);
 // eslint-disable-next-line react-hooks/exhaustive-deps -- pdfMessage only reads the current copy
 },[pdf,pdfPage]);
 function pickPdfPage(value:string){setPdfInput(value);const page=Number(value);if(pdf&&/^\d{1,3}$/.test(value)&&page>=1&&page<=pdf.pages){setError('');setPdfPage(page);}}
 async function applyPdfPage(){
  const canvas=pdfCanvas.current;if(!pdf||!canvas||pdfBusy||busy)return;
  if(Number(pdfInput)!==pdfPage){setError(pdfMessage('pages'));return;}
  try{
   const blob=await takeoffPdfCanvasJpeg(canvas),file=new File([blob],takeoffPdfPageName(pdf.name,pdfPage),{type:'image/jpeg'});
   closePdf();await uploadImage(file);
  }catch(failure){setError(pdfMessage(failure instanceof TakeoffPdfError?failure.code:'render'));}
 }
 async function uploadFromFiles(file:{id:string;name:string}){setError('');setNotice('');await createPlan({fileId:file.id,name:file.name});}
 async function uploadImage(file:File){
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size<1||file.size>IMAGE_MAX_BYTES){setError(c.uploadInvalid);return;}
  setUploading(true);
  try{
   const data=await readBase64(file),body={action:'upload',workId,fileId:crypto.randomUUID(),name:file.name.slice(0,160)||'plano.jpg',data};
   const done=await post('/api/pro/work-files',JSON.stringify(body),c.uploaded,'upload');
   if(done)await createPlan(body);
  }catch{setError(c.uploadInvalid);}
  finally{if(active.current)setUploading(false);}
 }

 const plans=detail?.plans.filter(plan=>!plan.archived)??[],archivedPlans=detail?.plans.filter(plan=>plan.archived)??[];
 const plan=plans.find(row=>row.id===planId)??null,page=plan?.pages[0]??null;
 const planMeasurements=useMemo(()=>detail&&plan?detail.measurements.filter(m=>m.planId===plan.id&&!m.archived):[],[detail,plan]);
 const archivedMeasurements=detail&&plan?detail.measurements.filter(m=>m.planId===plan.id&&m.archived):[];
 // Fix 14: an opening («hueco») is never quoted alone: its area is already taken off its parent.
 const chosen=new Set([...(selected??new Set(planMeasurements.filter(m=>m.result.totalMilli!==null).map(m=>m.id)))].filter(id=>!planMeasurements.find(m=>m.id===id)?.result.deductFrom));
 const locked=busy||conflict;
 const usedPlanFiles=new Set(detail?.plans.map(row=>row.fileId)??[]),jobFileOptions=Array.isArray(jobFiles)?jobFiles.filter(file=>file.mimeType==='image/jpeg'&&file.ready&&!usedPlanFiles.has(file.id)):[];

 function chooseTool(next:Tool){if(locked||form)return;setDrawing([]);setOpeningOf(null);setTool(next);setError('');}
 function startOpening(host:TakeoffMeasurement){if(locked||form)return;setDrawing([]);setOpeningOf(host.id);setTool('area');setError('');setNotice('');}
 function addPoint(point:TakeoffPoint){
  if(locked||form||!page||tool==='pan')return;
  if(tool==='detect'){void runDetect(point,detectOpts);return;}
  if(tool==='scale'){const next=[...drawing,point].slice(-2);setDrawing(next);if(next.length===2)openCalibration(next);return;}
  if(drawing.length>=400)return;setDrawing([...drawing,point]);
 }
 function openCalibration(points:TakeoffPoint[]){
  if(!page)return;const initial={unit:page.unit,length:page.calibration?milliToInput(page.calibration.lengthMilli,en):'',points:page.calibration?.points??[]};
  setForm({kind:'calibration',draft:{...initial,points},initial});
 }
 async function loadGray(planIdValue:string){
  if(gray.current?.planId===planIdValue)return gray.current;
  const response=await fetch(api+'?'+new URLSearchParams({image:planIdValue}),{cache:'no-store'});if(!response.ok)throw Error('image');
  const bitmap=await createImageBitmap(await response.blob()),scale=Math.min(1,1200/Math.max(bitmap.width,bitmap.height)),w=Math.max(1,Math.round(bitmap.width*scale)),h=Math.max(1,Math.round(bitmap.height*scale));
  const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;const ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)throw Error('canvas');
  ctx.fillStyle='#fff';ctx.fillRect(0,0,w,h);ctx.drawImage(bitmap,0,0,w,h);bitmap.close();
  const rgba=ctx.getImageData(0,0,w,h).data,data=new Uint8ClampedArray(w*h);for(let i=0;i<w*h;i++)data[i]=Math.round(0.299*rgba[i*4]!+0.587*rgba[i*4+1]!+0.114*rgba[i*4+2]!);
  gray.current={planId:planIdValue,data,w,h};return gray.current;
 }
 async function runDetect(point:TakeoffPoint,options:{threshold:number;closeRadius:number}){
  if(!plan)return;lastSeed.current=point;setDetectBusy(true);setDetectMsg('');setError('');
  try{
   const image=await loadGray(plan.id),result=detectRoom(image.data,image.w,image.h,[point[0]*image.w,point[1]*image.h],options);
   if(!result.ok){setDrawing([]);setDetectMsg(result.reason==='on_wall'?(en?'You tapped on a wall. Tap inside the room.':'Tocó una pared. Toque dentro del ambiente.'):result.reason==='leaks'?(en?'The room is not closed (an opening is too wide). Raise "Close doors" or draw the area by hand.':'El ambiente no está cerrado (una abertura es muy ancha). Suba "Cerrar puertas" o dibuje el área a mano.'):(en?'No room could be detected here. Adjust the settings or draw it by hand.':'No se pudo detectar un ambiente aquí. Ajuste la sensibilidad o dibújelo a mano.'));return;}
   setDrawing(toNormalized(result.polygon,image.w,image.h).slice(0,400) as TakeoffPoint[]);
   setDetectMsg(en?`Outline proposed with ${result.polygon.length} corners. Review it and press "Finish", or tap again.`:`Contorno propuesto con ${result.polygon.length} esquinas. Revíselo y pulse "Terminar", o toque de nuevo.`);
  }catch{setDrawing([]);setDetectMsg(en?'The plan image could not be analyzed. Draw the area by hand.':'No se pudo analizar la imagen del plano. Dibuje el área a mano.');}
  finally{setDetectBusy(false);}
 }
 function nextName(kind:TakeoffKind){return `${c.kinds[kind]} ${planMeasurements.filter(m=>m.kind===kind).length+1}`;}
 function finishDrawing(){
  if(tool==='pan'||tool==='scale')return;const kind:TakeoffKind=tool==='detect'?'area':tool;if(drawing.length<minPoints(kind))return;
  const host=openingOf?planMeasurements.find(m=>m.id===openingOf):null;
  const draft:MeasurementDraft={kind,name:host?(en?`Opening of ${host.name}`:`Hueco de ${host.name}`).slice(0,120):nextName(kind),categoryId:'',color:takeoffColors[planMeasurements.length%takeoffColors.length],manual:'',multiplierMode:'none',multiplier:'',waste:'',productId:'',productName:'',points:drawing};
  setForm({kind:'measurement',measurement:null,draft,initial:{...draft,points:[]}});
 }
 function openManual(){
  if(locked||form)return;setDrawing([]);
  const draft:MeasurementDraft={kind:'area',name:'',categoryId:'',color:takeoffColors[planMeasurements.length%takeoffColors.length],manual:'',multiplierMode:'none',multiplier:'',waste:'',productId:'',productName:'',points:[]};
  setForm({kind:'measurement',measurement:null,draft,initial:draft});setError('');setNotice('');
 }
 function openEdit(m:TakeoffMeasurement){
  if(locked||form)return;setDrawing([]);
  const draft:MeasurementDraft={kind:m.kind,name:m.name,categoryId:m.categoryId??'',color:m.color,manual:m.manualMilli!==null?milliToInput(m.manualMilli,en):'',multiplierMode:m.multiplierMode,
   multiplier:m.multiplierMilli!==null?milliToInput(m.multiplierMilli,en):'',waste:percentInput(m.wasteBps,en),productId:m.productId??'',productName:m.productName??'',points:m.points};
  setForm({kind:'measurement',measurement:m,draft,initial:draft});setError('');setNotice('');
 }
 function cancelForm(){if(form?.kind==='calibration'||form?.kind==='measurement'&&!form.measurement)setDrawing([]);setOpeningOf(null);setForm(null);setError('');}
 function measurementInput(draft:MeasurementDraft){
  const manual=draft.points.length===0;
  const manualMilli=manual?parseMilli(draft.manual,1000000000000,en):null,multiplierMilli=draft.multiplierMode==='none'?null:parseMilli(draft.multiplier,100000000,en),wasteBps=parsePercent(draft.waste);
  if(manual&&manualMilli===null||draft.multiplierMode!=='none'&&multiplierMilli===null||wasteBps===null)return null;
  return{name:draft.name,categoryId:draft.categoryId||null,color:draft.color,points:draft.points,manualMilli,multiplierMode:draft.multiplierMode,multiplierMilli,wasteBps,productId:draft.productId||null};
 }
 function submit(event:FormEvent){
  event.preventDefault();if(!form||locked)return;
  const base={workId,actionId:crypto.randomUUID()};
  if(form.kind==='plan'){
   const parsed=takeoffMutationSchema.safeParse({action:'plan_update',...base,id:form.plan.id,revision:form.plan.revision,title:form.draft.title});
   if(!parsed.success){setError(c.failed);return;}void send(parsed.data,c.saved);return;
  }
  if(!plan||!page)return;
  if(form.kind==='calibration'){
   const lengthMilli=parseMilli(form.draft.length,1000000,en);
   const parsed=takeoffMutationSchema.safeParse({action:'page_calibrate',...base,id:plan.id,revision:page.revision,pageNumber:page.pageNumber,unit:form.draft.unit,
    calibration:form.draft.points.length===2&&lengthMilli!==null?{points:form.draft.points,lengthMilli}:undefined});
   if(!parsed.success){setError(c.scaleInvalid);return;}
   void send(parsed.data,c.scaleSaved).then(result=>{if(result&&active.current)setTool('pan');});return;
  }
  const fields=measurementInput(form.draft);
  const parsed=fields&&takeoffMutationSchema.safeParse(form.measurement?{action:'measurement_update',...base,id:form.measurement.id,revision:form.measurement.revision,...fields}
   :{action:'measurement_create',...base,id:crypto.randomUUID(),planId:plan.id,pageNumber:page.pageNumber,kind:form.draft.kind,...fields});
  if(!parsed||!parsed.success){setError(c.measurementInvalid);return;}
  const hostId=!form.measurement&&form.draft.kind==='area'?openingOf:null;
  if(!hostId){void send(parsed.data,c.saved);return;}
  void send(parsed.data,c.saved).then(async result=>{
   setOpeningOf(null);
   const created=result&&typeof result==='object'&&'measurement' in result?(result as {measurement:TakeoffMeasurement}).measurement:null;
   if(created)await send({action:'deduction_set',workId,actionId:crypto.randomUUID(),id:created.id,revision:created.revision,parentId:hostId},c.saved);
  });
 }
 async function clearScale(){
  if(!plan||!page||locked)return;
  await send({action:'page_calibrate',workId,actionId:crypto.randomUUID(),id:plan.id,revision:page.revision,pageNumber:page.pageNumber,unit:form?.kind==='calibration'?form.draft.unit:page.unit,calibration:null},c.scaleSaved);
 }
 async function archiveMeasurement(m:TakeoffMeasurement){
  if(locked||form)return;
  const answer=await confirm({title:c.archiveTitle,description:m.name,detail:c.archiveText,confirmLabel:c.archive,cancelLabel:c.back,tone:'danger'});if(!answer.confirmed)return;
  void send({action:'measurement_archive',workId,actionId:crypto.randomUUID(),id:m.id,revision:m.revision},c.archived_);
 }
 async function archivePlan(row:TakeoffPlan){
  if(locked||form||drawing.length)return;
  const answer=await confirm({title:c.archivePlanTitle,description:row.title,detail:c.archivePlanText,confirmLabel:c.archive,cancelLabel:c.back,tone:'danger'});if(!answer.confirmed)return;
  if(planId===row.id)setPlanId(null);
  void send({action:'plan_archive',workId,actionId:crypto.randomUUID(),id:row.id,revision:row.revision},c.planArchived);
 }
 async function sendToEstimate(){
  if(!detail||locked||form)return;
  const ids=planMeasurements.filter(m=>chosen.has(m.id)).map(m=>m.id),estimate=detail.estimates.find(row=>row.id===target)??null;
  const parsed=takeoffMutationSchema.safeParse({action:'send_estimate',workId,actionId:crypto.randomUUID(),measurementIds:ids,estimateId:estimate?.id??null,estimateRevision:estimate?.revision??null,language:en?'en':'es'});
  if(!parsed.success){setError(c.sendFailed);return;}
  const result=await send(parsed.data,'');
  if(result&&typeof result==='object'&&'estimate' in result&&active.current){const value=(result as {estimate:TakeoffSendResult}).estimate;setSent(value);setNotice(c.sent(value.measurementIds.length,value.title));setTarget(value.estimateId);}
 }

 if(loading&&!detail)return <p role="status" className="text-sm text-[#52627a]">{c.loading}</p>;
 if(!detail)return <div role="alert" data-takeoffs-load-error className="space-y-2 rounded-2xl border border-[#d7e1ea] p-4"><p className="text-sm">{c.loadError}</p><Button type="button" variant="secondary" className="min-h-11" disabled={loading} onClick={()=>void load()}>{c.retry}</Button></div>;
 const countFor=(row:TakeoffPlan)=>detail.measurements.filter(m=>m.planId===row.id&&!m.archived).length;
 return <section data-takeoffs className="min-w-0 space-y-5">
  {dialogNode}
  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
   <div className="min-w-0"><h3 className="text-lg font-bold text-[#162543]">{c.title}</h3><p className="mt-1 text-sm text-[#52627a]">{c.intro}</p></div>
   <div className="shrink-0">
    <input ref={fileInput} data-takeoff-upload type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={event=>{const file=event.target.files?.[0];event.target.value='';if(file)void upload(file);}}/>
    <Button type="button" className="min-h-11 w-full sm:w-auto" disabled={locked||!!form||drawing.length>0} onClick={()=>fileInput.current?.click()}>{uploading?c.uploading:c.upload}</Button>
    <Button type="button" variant="outline" data-takeoff-from-files className="mt-2 min-h-11 w-full sm:ml-2 sm:mt-0 sm:w-auto" disabled={locked||!!form||drawing.length>0} aria-expanded={!!jobFiles} onClick={()=>jobFiles?setJobFiles(null):void loadJobFiles()}>{en?'Use a job file':'Usar un archivo del trabajo'}</Button>
   </div>
  </div>
  <p className="text-xs text-[#52627a]">{c.uploadHelp}</p>
  {jobFiles&&<div data-takeoff-job-files className="space-y-2 rounded-xl border border-dashed border-[#d7e1ea] p-3">{jobFiles==='loading'?<p role="status" className="text-sm text-[#52627a]">{en?'Loading job files…':'Cargando archivos del trabajo…'}</p>:jobFiles==='error'?<p role="alert" className="text-sm text-[#9b2c2c]">{en?'Could not load the job files.':'No se pudieron cargar los archivos del trabajo.'}</p>:jobFileOptions.length?<label className="block text-sm font-semibold text-[#162543]">{en?'Photo or plan image already in Files':'Foto o imagen de plano ya subida en Archivos'}<select data-takeoff-job-file className={field} value="" disabled={locked} onChange={event=>void chooseJobFile(event.target.value)}><option value="">{en?'Choose a file…':'Elija un archivo…'}</option>{jobFileOptions.map(file=><option key={file.id} value={file.id}>{file.name}</option>)}</select><span className="mt-1 block text-xs font-normal text-[#52627a]">{en?'JPG images of this job that are not a plan yet. For a PDF, use "Upload plan" and choose the page.':'Imágenes JPG de este trabajo que todavía no son un plano. Para un PDF use "Subir plano" y elija la página.'}</span></label>:<p className="text-sm text-[#52627a]">{en?'This job has no images in Files that can be used as a plan.':'Este trabajo no tiene imágenes en Archivos que se puedan usar como plano.'}</p>}</div>}
  {pdfBusy==='opening'&&<p role="status" className="text-sm text-[#52627a]">{c.pdf.opening}</p>}
  {pdf&&<section data-takeoff-pdf aria-labelledby="takeoff-pdf-title" className="min-w-0 space-y-3 rounded-2xl border border-[#d7e1ea] bg-[#f7f9fc] p-4">
   <div className="min-w-0"><h4 id="takeoff-pdf-title" className="font-bold text-[#162543]">{c.pdf.title}</h4><p data-takeoff-pdf-summary className="break-words text-sm text-[#52627a]">{c.pdf.summary(pdf.name,pdf.pages)}</p></div>
   <div className="flex flex-wrap items-end gap-2">
    <Button type="button" variant="secondary" className="min-h-11" disabled={pdfPage<=1||!!pdfBusy||uploading} onClick={()=>pickPdfPage(String(pdfPage-1))}>{c.pdf.previous}</Button>
    <label className="block min-w-0 text-sm font-semibold text-[#162543]">{c.pdf.page}<input data-takeoff-pdf-page className={field+' w-28'} type="number" inputMode="numeric" min={1} max={pdf.pages} step={1} value={pdfInput} disabled={uploading} onChange={event=>pickPdfPage(event.target.value)}/></label>
    <Button type="button" variant="secondary" className="min-h-11" disabled={pdfPage>=pdf.pages||!!pdfBusy||uploading} onClick={()=>pickPdfPage(String(pdfPage+1))}>{c.pdf.next}</Button>
   </div>
   {pdfBusy==='rendering'&&<p role="status" className="text-sm text-[#52627a]">{c.pdf.rendering}</p>}
   <div className="max-h-[60vh] overflow-auto rounded-xl border border-[#d7e1ea] bg-white"><canvas ref={pdfCanvas} data-takeoff-pdf-canvas role="img" aria-label={c.pdf.preview(pdfPage,pdf.pages)} className="block h-auto w-full max-w-full"/></div>
   <p className="text-xs text-[#52627a]">{c.pdf.help}</p>
   <div className="flex flex-col gap-2 sm:flex-row"><Button type="button" className="min-h-11" data-takeoff-pdf-use disabled={!!pdfBusy||uploading||busy||conflict} onClick={()=>void applyPdfPage()}>{c.pdf.use}</Button><Button type="button" variant="secondary" className="min-h-11" disabled={uploading} onClick={closePdf}>{c.pdf.cancel}</Button></div>
  </section>}
  {notice&&<div role="status" data-takeoff-notice className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#eef8f4] p-3 text-sm text-[#18573a]"><p className="min-w-0">{notice}</p>
   {sent&&notice===c.sent(sent.measurementIds.length,sent.title)&&<Button type="button" variant="secondary" className="min-h-11" data-takeoff-open-estimate onClick={()=>navigatePro('quotes',{estimacionPrivada:sent.estimateId,volverEstimacion:currentProPath()})}>{c.openEstimate}</Button>}</div>}
  {loadError&&<div role="alert" className="space-y-2 text-sm"><p>{c.loadError}</p><Button type="button" variant="secondary" className="min-h-11" disabled={loading||saving} onClick={()=>void load()}>{c.retry}</Button></div>}
  {error&&<div role="alert" data-takeoff-error className="space-y-2 rounded-xl bg-[#fff4f2] p-3 text-sm text-[#8a2a1b]"><p>{error}</p>
   {uncertain&&<Button type="button" variant="secondary" className="min-h-11" disabled={saving} onClick={()=>void retrySame()}>{c.retrySame}</Button>}
   {conflict&&<Button type="button" variant="secondary" className="min-h-11" disabled={loading||saving} onClick={()=>{setForm(null);setDrawing([]);setError('');void load();}}>{c.reload}</Button>}</div>}
  <PlanList c={c} en={en} plans={plans} archived={archivedPlans} showArchived={showArchived} openId={planId} locked={locked||!!form||drawing.length>0} countFor={countFor}
   form={form?.kind==='plan'?form:null} saving={saving} onToggleArchived={()=>setShowArchived(!showArchived)}
   onOpen={row=>{setPlanId(row.id);setTool(row.pages[0]?.calibration?'pan':'scale');setZoom(1);setSelected(null);setSent(null);setNotice('');}}
   onRename={row=>setForm({kind:'plan',plan:row,draft:{title:row.title},initial:{title:row.title}})} onArchive={row=>void archivePlan(row)}
   onRestore={row=>void send({action:'plan_restore',workId,actionId:crypto.randomUUID(),id:row.id,revision:row.revision},c.restored)}
   onFormChange={title=>form?.kind==='plan'&&setForm({...form,draft:{title}})} onSubmit={submit} onCancel={cancelForm}/>
  {plan&&page&&<section data-takeoff-viewer={plan.id} aria-label={c.viewer} className="min-w-0 space-y-4 rounded-2xl border border-[#d7e1ea] bg-[#f7f9fc] p-3 sm:p-4">
   <div className="flex flex-wrap items-center justify-between gap-2">
    <h4 className="min-w-0 break-words text-base font-bold text-[#162543]">{plan.title} <span className="font-normal text-[#52627a]">· {c.page(page.pageNumber,plan.pageCount)}</span></h4>
    <Button type="button" variant="secondary" className="min-h-11" disabled={locked||!!form||drawing.length>0} onClick={()=>{setPlanId(null);setTool('pan');}}>{c.close}</Button>
   </div>
   <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-start">
    <div className="min-w-0 space-y-3">
     <Toolbar c={c} tool={tool} zoom={zoom} disabled={locked||!!form} onTool={chooseTool} onZoom={setZoom}/>
     <p data-takeoff-scale-status={page.calibration?'set':'missing'} className={`rounded-xl p-3 text-sm ${page.calibration?'bg-white text-[#52627a]':'bg-[#fff6e5] text-[#7a4b00]'}`}>
      {page.calibration?c.scaleSet(`${formatMilli(page.calibration.lengthMilli,en)} ${page.unit}`):c.scaleMissing}</p>
     <p className="text-sm text-[#52627a]">{c.toolHelp[tool]}</p>
     {openingOf&&tool==='area'&&<p data-takeoff-opening-banner role="status" className="rounded-xl bg-[#fff6e5] p-3 text-sm text-[#7a4b00]">{en?`Draw the opening inside "${planMeasurements.find(m=>m.id===openingOf)?.name??'the area'}". When you save it, its area is subtracted from that area.`:`Dibuje el hueco dentro de "${planMeasurements.find(m=>m.id===openingOf)?.name??'el área'}". Al guardarlo, su área se resta de esa área.`}</p>}
     {tool==='detect'&&!form&&<div data-takeoff-detect className="grid min-w-0 gap-3 rounded-xl border border-[#d7e1ea] bg-white p-3 sm:grid-cols-2">
      <label className="block text-sm font-semibold text-[#162543]">{en?'Wall sensitivity':'Sensibilidad de paredes'}<input data-takeoff-detect-threshold type="range" min={60} max={220} step={5} value={detectOpts.threshold} disabled={detectBusy} className="mt-2 block min-h-11 w-full" onChange={event=>{const next={...detectOpts,threshold:Number(event.target.value)};setDetectOpts(next);if(lastSeed.current)void runDetect(lastSeed.current,next);}}/></label>
      <label className="block text-sm font-semibold text-[#162543]">{en?'Close doors (px)':'Cerrar puertas (px)'}: {detectOpts.closeRadius}<input data-takeoff-detect-close type="range" min={0} max={10} step={1} value={detectOpts.closeRadius} disabled={detectBusy} className="mt-2 block min-h-11 w-full" onChange={event=>{const next={...detectOpts,closeRadius:Number(event.target.value)};setDetectOpts(next);if(lastSeed.current)void runDetect(lastSeed.current,next);}}/></label>
      <p role="status" data-takeoff-detect-status className="text-sm text-[#52627a] sm:col-span-2">{detectBusy?(en?'Analyzing plan…':'Analizando el plano…'):detectMsg||(page.calibration?'':(en?'Define the scale first so the area comes out in real units.':'Defina primero la escala para que el área salga en unidades reales.'))}</p>
     </div>}
     {tool!=='pan'&&tool!=='scale'&&!form&&<div data-takeoff-drawing className="flex flex-wrap items-center gap-2">
      <span className="text-sm font-semibold text-[#162543]" aria-live="polite">{c.points(drawing.length)}</span>
      <Button type="button" variant="secondary" className="min-h-11" disabled={!drawing.length||locked} onClick={()=>setDrawing(drawing.slice(0,-1))}>{c.undo}</Button>
      <Button type="button" className="min-h-11" disabled={drawing.length<minPoints(tool==='detect'?'area':tool)||locked} onClick={finishDrawing}>{c.finish}</Button>
      <Button type="button" variant="ghost" className="min-h-11" disabled={!drawing.length||locked} onClick={()=>setDrawing([])}>{c.cancel}</Button>
     </div>}
     <PlanCanvas c={c} plan={plan} page={page} zoom={zoom} tool={tool} measurements={planMeasurements} drawing={form?.kind==='calibration'?form.draft.points:form?.kind==='measurement'?form.draft.points:drawing}
      drawingKind={form?.kind==='measurement'?form.draft.kind:form?.kind==='calibration'?'scale':tool==='detect'?'area':tool} drawingColor={form?.kind==='measurement'?form.draft.color:'#c2255c'} onPoint={addPoint}/>
     {form?.kind==='calibration'&&<CalibrationForm c={c} form={form} saving={saving} disabled={locked} canClear={!!page.calibration} onChange={draft=>setForm({...form,draft})} onSubmit={submit} onCancel={cancelForm} onClear={()=>void clearScale()}
      onRedraw={()=>{setForm(null);setDrawing([]);setTool('scale');}}/>}
     {form?.kind==='measurement'&&<MeasurementForm c={c} en={en} form={form} page={page} detail={detail} saving={saving} disabled={locked} onChange={draft=>setForm({...form,draft})} onSubmit={submit} onCancel={cancelForm}/>}
     <AiTakeoffSuggestions key={plan.id+':'+page.pageNumber} workId={workId} planId={plan.id} pageNumber={page.pageNumber} unit={page.unit} disabled={locked||!!form||drawing.length>0} onAdd={items=>addAiItems(plan.id,page.pageNumber,items,planMeasurements.length)}/>
    </div>
    <MeasurementPanel c={c} en={en} measurements={planMeasurements} archived={archivedMeasurements} chosen={chosen} locked={locked||!!form||drawing.length>0}
     onChoose={(id,on)=>{const next=new Set(chosen);if(on)next.add(id);else next.delete(id);setSelected(next);}}
     onManual={openManual} onEdit={openEdit} onArchive={m=>void archiveMeasurement(m)}
     onVisibility={m=>void send({action:'measurement_visibility',workId,actionId:crypto.randomUUID(),id:m.id,revision:m.revision,hidden:!m.hidden},c.saved)}
     onDrawOpening={startOpening} onDeduct={(m,parentId)=>void send(parentId?{action:'deduction_set',workId,actionId:crypto.randomUUID(),id:m.id,revision:m.revision,parentId}:{action:'deduction_clear',workId,actionId:crypto.randomUUID(),id:m.id,revision:m.revision},c.saved)}
     onRestore={m=>void send({action:'measurement_restore',workId,actionId:crypto.randomUUID(),id:m.id,revision:m.revision},c.restored)}
     send={<SendPanel c={c} en={en} detail={detail} measurements={planMeasurements} chosen={chosen} target={target} disabled={locked||!!form||drawing.length>0} saving={saving} onTarget={setTarget} onSend={()=>void sendToEstimate()}/>}/>
   </div>
  </section>}
  <details data-takeoff-history className="rounded-2xl border border-[#d7e1ea] bg-white p-3">
   <summary className="min-h-11 cursor-pointer py-2 font-semibold text-[#162543]">{c.history}</summary>
   {detail.history.length?<ol className="mt-2 space-y-1 text-sm">{detail.history.map(row=><li key={row.actionId} data-takeoff-history-entry={row.action} className="flex flex-wrap justify-between gap-x-3 border-t border-[#eef2f6] py-1.5 text-[#162543]"><span>{c.actions[row.action]}</span><span className="text-[#52627a]">{stamp(row.at,en)}</span></li>)}</ol>:<p className="mt-2 text-sm text-[#52627a]">{c.historyEmpty}</p>}
  </details>
 </section>;
}

function PlanList({c,en,plans,archived,showArchived,openId,locked,countFor,form,saving,onToggleArchived,onOpen,onRename,onArchive,onRestore,onFormChange,onSubmit,onCancel}:{
 c:Copy;en:boolean;plans:TakeoffPlan[];archived:TakeoffPlan[];showArchived:boolean;openId:string|null;locked:boolean;countFor:(row:TakeoffPlan)=>number;
 form:Extract<Form,{kind:'plan'}>|null;saving:boolean;onToggleArchived:()=>void;onOpen:(row:TakeoffPlan)=>void;onRename:(row:TakeoffPlan)=>void;onArchive:(row:TakeoffPlan)=>void;
 onRestore:(row:TakeoffPlan)=>void;onFormChange:(title:string)=>void;onSubmit:(event:FormEvent)=>void;onCancel:()=>void}){
 const cell=(label:string,value:string)=><p className="min-w-0 text-sm text-[#52627a]"><span className="font-semibold text-[#162543] sm:sr-only">{label}: </span>{value}</p>;
 const grid='sm:grid sm:grid-cols-[minmax(0,2.2fr)_repeat(5,minmax(0,1fr))] sm:items-center sm:gap-3';
 return <section aria-label={c.plans} className="space-y-2">
  <h4 className="text-sm font-bold uppercase tracking-wide text-[#52627a]">{c.plans} ({plans.length})</h4>
  {!plans.length?<div data-takeoffs-empty className="rounded-2xl border border-dashed border-[#d7e1ea] bg-[#f7f9fc] p-5 text-center"><p className="font-semibold text-[#162543]">{c.empty}</p><p className="mt-1 text-sm text-[#52627a]">{c.emptyHelp}</p></div>:<>
   <div aria-hidden="true" className={`hidden px-3 text-xs font-semibold uppercase tracking-wide text-[#68778d] ${grid}`}><span>{c.col.title}</span><span>{c.col.date}</span><span>{c.col.type}</span><span>{c.col.size}</span><span>{c.col.pages}</span><span>{c.col.measurements}</span></div>
   <ul className="space-y-2">{plans.map(row=><li key={row.id} data-takeoff-plan={row.id} className={`rounded-xl border bg-white p-3 ${openId===row.id?'border-[#008bb5]':'border-[#d7e1ea]'}`}>
    {form?.plan.id===row.id?<form data-takeoff-form="plan" onSubmit={onSubmit} className="space-y-3">
     <label className="block text-sm font-semibold text-[#162543]">{c.planTitle}<input data-takeoff-field="planTitle" className={field} maxLength={160} required value={form.draft.title} onChange={event=>onFormChange(event.target.value)}/></label>
     <div className="flex flex-wrap gap-2"><Button type="submit" className="min-h-11" disabled={saving||!form.draft.title.trim()}>{saving?c.saving:c.savePlan}</Button><Button type="button" variant="secondary" className="min-h-11" disabled={saving} onClick={onCancel}>{c.cancel}</Button></div>
    </form>:<div className="space-y-3">
     <div className={`space-y-1 ${grid}`}>
      <p className="min-w-0 break-words font-semibold text-[#162543]">{row.title}</p>
      {cell(c.col.date,day(row.uploadedOn,en))}{cell(c.col.type,row.mimeType==='application/pdf'?c.pdfType:c.imageType)}{cell(c.col.size,bytes(row.sizeBytes,en))}{cell(c.col.pages,String(row.pageCount))}{cell(c.col.measurements,String(countFor(row)))}
     </div>
     <div className="flex flex-wrap gap-2">
      <Button type="button" className="min-h-11" disabled={locked||openId===row.id} onClick={()=>onOpen(row)} aria-label={`${c.open}: ${row.title}`}>{c.open}</Button>
      <Button type="button" variant="secondary" className="min-h-11" disabled={locked} onClick={()=>onRename(row)} aria-label={`${c.rename}: ${row.title}`}>{c.rename}</Button>
      <Button type="button" variant="ghost" className="min-h-11" disabled={locked} onClick={()=>onArchive(row)} aria-label={`${c.archive}: ${row.title}`}>{c.archive}</Button>
     </div>
    </div>}
   </li>)}</ul></>}
  {archived.length>0&&<div className="space-y-2">
   <Button type="button" variant="ghost" className="min-h-11" onClick={onToggleArchived} aria-expanded={showArchived}>{showArchived?c.hideArchived:c.showArchived(archived.length)}</Button>
   {showArchived&&<ul aria-label={c.archivedPlans} className="space-y-2">{archived.map(row=><li key={row.id} data-takeoff-archived-plan={row.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-dashed border-[#d7e1ea] bg-[#f7f9fc] p-3">
    <span className="min-w-0 break-words text-sm text-[#52627a]">{row.title}</span><Button type="button" variant="secondary" className="min-h-11" disabled={locked} onClick={()=>onRestore(row)} aria-label={`${c.restore}: ${row.title}`}>{c.restore}</Button></li>)}</ul>}
  </div>}
 </section>;
}

function Toolbar({c,tool,zoom,disabled,onTool,onZoom}:{c:Copy;tool:Tool;zoom:number;disabled:boolean;onTool:(tool:Tool)=>void;onZoom:(zoom:number)=>void}){
 const tools:Tool[]=['pan','scale','detect','area','length','count'],levels=[1,1.5,2,3,4],index=levels.indexOf(zoom);
 return <div className="flex flex-wrap items-center justify-between gap-2">
  <div role="toolbar" aria-label={c.tools} className="flex flex-wrap gap-1 rounded-xl bg-[#e9eff5] p-1">
   {tools.map(value=><button key={value} type="button" data-takeoff-tool={value} aria-pressed={tool===value} disabled={disabled} onClick={()=>onTool(value)}
    className={`min-h-11 rounded-lg px-3 text-sm font-semibold disabled:opacity-50 ${tool===value?'bg-white text-[#008bb5] shadow-sm':'text-[#52627a] hover:bg-white/60'}`}>{c.toolNames[value]}</button>)}
  </div>
  <div className="flex items-center gap-1" role="group" aria-label={`${c.zoomOut} / ${c.zoomIn}`}>
   <button type="button" data-takeoff-zoom="out" aria-label={c.zoomOut} disabled={index<=0} onClick={()=>onZoom(levels[Math.max(0,index-1)])} className="min-h-11 min-w-11 rounded-lg border border-[#d7e1ea] bg-white text-lg font-bold text-[#162543] disabled:opacity-40">−</button>
   <span className="min-w-12 text-center text-sm tabular-nums text-[#52627a]" aria-live="polite">{Math.round(zoom*100)}%</span>
   <button type="button" data-takeoff-zoom="in" aria-label={c.zoomIn} disabled={index>=levels.length-1} onClick={()=>onZoom(levels[Math.min(levels.length-1,index+1)])} className="min-h-11 min-w-11 rounded-lg border border-[#d7e1ea] bg-white text-lg font-bold text-[#162543] disabled:opacity-40">+</button>
   <button type="button" data-takeoff-zoom="fit" disabled={zoom===1} onClick={()=>onZoom(1)} className="min-h-11 rounded-lg border border-[#d7e1ea] bg-white px-3 text-sm font-semibold text-[#162543] disabled:opacity-40">{c.fit}</button>
  </div>
 </div>;
}

function PlanCanvas({c,plan,page,zoom,tool,measurements,drawing,drawingKind,drawingColor,onPoint}:{c:Copy;plan:TakeoffPlan;page:TakeoffPage;zoom:number;tool:Tool;measurements:TakeoffMeasurement[];
 drawing:TakeoffPoint[];drawingKind:Tool;drawingColor:string;onPoint:(point:TakeoffPoint)=>void}){
 const scroller=useRef<HTMLDivElement>(null),[width,setWidth]=useState(0),[imageError,setImageError]=useState(false),drag=useRef<{x:number;y:number;left:number;top:number;moved:boolean}|null>(null);
 // ResizeObserver reports the initial size on observe, then every change.
 useLayoutEffect(()=>{const node=scroller.current;if(!node)return;const observer=new ResizeObserver(()=>setWidth(node.clientWidth));observer.observe(node);return()=>observer.disconnect();},[]);
 const W=page.widthPx,H=page.heightPx,displayW=Math.max(1,width*zoom),displayH=displayW*H/W,unit=W/displayW;// image pixels per CSS pixel
 const px=(p:TakeoffPoint)=>`${p[0]*W},${p[1]*H}`;
 function down(event:ReactPointerEvent<HTMLDivElement>){if(event.pointerType!=='mouse'||!scroller.current)return;drag.current={x:event.clientX,y:event.clientY,left:scroller.current.scrollLeft,top:scroller.current.scrollTop,moved:false};}
 function move(event:ReactPointerEvent<HTMLDivElement>){const d=drag.current;if(!d||!scroller.current||tool!=='pan')return;if(Math.abs(event.clientX-d.x)+Math.abs(event.clientY-d.y)>3)d.moved=true;scroller.current.scrollLeft=d.left-(event.clientX-d.x);scroller.current.scrollTop=d.top-(event.clientY-d.y);}
 function click(event:ReactMouseEvent<SVGSVGElement>){
  if(drag.current?.moved){drag.current=null;return;}drag.current=null;
  const rect=event.currentTarget.getBoundingClientRect();if(!rect.width||!rect.height)return;
  onPoint([roundCoordinate((event.clientX-rect.left)/rect.width),roundCoordinate((event.clientY-rect.top)/rect.height)]);
 }
 const shape=(kind:Tool,points:TakeoffPoint[],color:string,key:string,draft:boolean)=>{
  const dots=points.map((p,i)=><circle key={i} cx={p[0]*W} cy={p[1]*H} r={(kind==='count'?7:4)*unit} fill={kind==='count'?color:'#ffffff'} stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke"/>);
  if(kind==='area'&&points.length>=2)return <g key={key} data-takeoff-shape={key}>{points.length>=3&&!draft?<polygon points={points.map(px).join(' ')} fill={color} fillOpacity={0.22} stroke={color} strokeWidth={2.5} vectorEffect="non-scaling-stroke"/>
   :<polyline points={[...points,...(draft&&points.length>=3?[points[0]]:[])].map(px).join(' ')} fill={draft&&points.length>=3?color:'none'} fillOpacity={0.15} stroke={color} strokeWidth={2.5} strokeDasharray={draft?'6 4':undefined} vectorEffect="non-scaling-stroke"/>}{dots}</g>;
  if((kind==='length'||kind==='scale')&&points.length>=2)return <g key={key} data-takeoff-shape={key}><polyline points={points.map(px).join(' ')} fill="none" stroke={color} strokeWidth={kind==='scale'?2:3} strokeDasharray={kind==='scale'||draft?'6 4':undefined} vectorEffect="non-scaling-stroke"/>{dots}</g>;
  return <g key={key} data-takeoff-shape={key}>{dots}</g>;
 };
 return <div className="min-w-0">
  <div ref={scroller} data-takeoff-scroller onPointerDown={down} onPointerMove={move} onPointerUp={()=>{if(drag.current&&!drag.current.moved)drag.current=null;}}
   className={`relative max-h-[70vh] w-full overflow-auto overscroll-contain rounded-xl border border-[#d7e1ea] bg-[#eef2f6] ${tool==='pan'?'cursor-grab':'cursor-crosshair'}`}>
   {width>0&&<div className="relative" style={{width:displayW,height:displayH}}>
    {/* eslint-disable-next-line @next/next/no-img-element -- private plan image from an authenticated no-store endpoint */}
    <img src={api+'?'+new URLSearchParams({image:plan.id})} alt="" draggable={false} onError={()=>setImageError(true)} className="pointer-events-none absolute inset-0 h-full w-full select-none"/>
    <svg data-takeoff-canvas viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={c.canvas(plan.title)} onClick={click} className="absolute inset-0 h-full w-full touch-manipulation">
     {page.calibration&&shape('scale',page.calibration.points,'#c2255c','calibration',false)}
     {measurements.filter(m=>!m.hidden&&m.points.length).map(m=>shape(m.kind,m.points,m.color,m.id,false))}
     {drawing.length>0&&shape(drawingKind,drawing,drawingColor,'drawing',true)}
    </svg>
   </div>}
  </div>
  {imageError&&<p role="alert" className="mt-2 text-sm text-[#8a2a1b]">{c.imageError}</p>}
 </div>;
}

function CalibrationForm({c,form,saving,disabled,canClear,onChange,onSubmit,onCancel,onClear,onRedraw}:{c:Copy;form:Extract<Form,{kind:'calibration'}>;saving:boolean;disabled:boolean;canClear:boolean;
 onChange:(draft:Extract<Form,{kind:'calibration'}>['draft'])=>void;onSubmit:(event:FormEvent)=>void;onCancel:()=>void;onClear:()=>void;onRedraw:()=>void}){
 // Round 2: the form opens below a tall plan; bring it into view and put the cursor in «Real length».
 const formRef=useReveal<HTMLFormElement>(true),lengthRef=useRef<HTMLInputElement|null>(null);
 useEffect(()=>{const frame=requestAnimationFrame(()=>lengthRef.current?.focus({preventScroll:true}));return()=>cancelAnimationFrame(frame);},[]);
 return <form ref={formRef} data-takeoff-form="calibration" onSubmit={onSubmit} className="space-y-3 rounded-2xl border border-[#d7e1ea] bg-white p-3 sm:p-4">
  <h5 className="font-bold text-[#162543]">{c.calibrationTitle}</h5>
  <div className="grid gap-3 sm:grid-cols-2">
   <label className="block text-sm font-semibold text-[#162543]">{c.realLength}<input ref={lengthRef} data-takeoff-field="calibrationLength" inputMode="decimal" className={field} maxLength={16} value={form.draft.length} onChange={event=>onChange({...form.draft,length:event.target.value})}/></label>
   <label className="block text-sm font-semibold text-[#162543]">{c.unit}<select data-takeoff-field="calibrationUnit" className={field} value={form.draft.unit} onChange={event=>onChange({...form.draft,unit:event.target.value as TakeoffUnit})}><option value="m">{c.meters}</option><option value="ft">{c.feet}</option></select></label>
  </div>
  <div className="flex flex-wrap gap-2">
   <Button type="submit" className="min-h-11" disabled={disabled||form.draft.points.length!==2}>{saving?c.saving:c.saveScale}</Button>
   <Button type="button" variant="secondary" className="min-h-11" disabled={disabled} onClick={onRedraw}>{c.redraw}</Button>
   {canClear&&<Button type="button" variant="ghost" className="min-h-11" disabled={disabled} onClick={onClear}>{c.clearScale}</Button>}
   <Button type="button" variant="ghost" className="min-h-11" disabled={saving} onClick={onCancel}>{c.cancel}</Button>
  </div>
 </form>;
}

function MeasurementForm({c,en,form,page,detail,saving,disabled,onChange,onSubmit,onCancel}:{c:Copy;en:boolean;form:Extract<Form,{kind:'measurement'}>;page:TakeoffPage;detail:TakeoffDetail;saving:boolean;disabled:boolean;
 onChange:(draft:MeasurementDraft)=>void;onSubmit:(event:FormEvent)=>void;onCancel:()=>void}){
 const d=form.draft,manual=d.points.length===0,isNew=!form.measurement;
 const manualMilli=manual?parseMilli(d.manual,1000000000000,en):null,multiplierMilli=d.multiplierMode==='none'?null:parseMilli(d.multiplier,100000000,en),wasteBps=parsePercent(d.waste)??0;
 const preview=manual&&manualMilli===null?null:previewTakeoff(d.kind,{points:d.points,manualMilli,multiplierMode:d.multiplierMode,multiplierMilli:d.multiplierMode==='none'?null:multiplierMilli??1000,wasteBps},page);
 const text=(value:number|null,unit:TakeoffResultUnit)=>formatQuantity(value,unit,en)??c.needsScale;
 const categories=detail.categories.filter(row=>!row.archived||row.id===d.categoryId);
 const lengthUnit=page.unit;
 const formRef=useReveal<HTMLFormElement>(true);
 return <form ref={formRef} data-takeoff-form="measurement" onSubmit={onSubmit} className="space-y-3 rounded-2xl border border-[#d7e1ea] bg-white p-3 sm:p-4">
  <h5 className="font-bold text-[#162543]">{isNew?c.newMeasurement:c.measurementTitle}{!manual&&<span className="font-normal text-[#52627a]"> · {c.kinds[d.kind]}</span>}</h5>
  {manual&&isNew&&<p className="text-sm text-[#52627a]">{c.manualHelp}</p>}
  <label className="block text-sm font-semibold text-[#162543]">{c.name}<input data-takeoff-field="name" className={field} maxLength={120} value={d.name} onChange={event=>onChange({...d,name:event.target.value})}/></label>
  {manual&&<div className="grid gap-3 sm:grid-cols-2">
   <label className="block text-sm font-semibold text-[#162543]">{c.kind}<select data-takeoff-field="kind" className={field} disabled={!isNew} value={d.kind} onChange={event=>{const kind=event.target.value as TakeoffKind;onChange({...d,kind,multiplierMode:kind!=='length'&&d.multiplierMode==='height'?'none':d.multiplierMode});}}>
    {(['area','length','count'] as const).map(kind=><option key={kind} value={kind}>{c.kinds[kind]}</option>)}</select></label>
   <label className="block text-sm font-semibold text-[#162543]">{c.quantity} ({unitLabel(d.kind==='count'?'u':d.kind==='area'?`${lengthUnit}2`:lengthUnit,en)})<input data-takeoff-field="manual" inputMode="decimal" className={field} maxLength={20} value={d.manual} onChange={event=>onChange({...d,manual:event.target.value})}/></label>
  </div>}
  <label className="block text-sm font-semibold text-[#162543]">{c.category}<select data-takeoff-field="category" className={field} value={d.categoryId} onChange={event=>onChange({...d,categoryId:event.target.value})}>
   <option value="">{c.noCategory}</option>{categories.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select>
   <span className="mt-1 block text-xs font-normal text-[#52627a]">{c.categoryHelp}</span></label>
  <fieldset><legend className="text-sm font-semibold text-[#162543]">{c.color}</legend><div className="mt-1 flex flex-wrap gap-2">
   {takeoffColors.map((color,index)=><button key={color} type="button" data-takeoff-color={color} aria-pressed={d.color===color} aria-label={c.colorNames[index]} onClick={()=>onChange({...d,color})}
    className={`h-11 w-11 rounded-full border-2 ${d.color===color?'border-[#162543] ring-2 ring-[#008bb5] ring-offset-2':'border-white shadow'}`} style={{backgroundColor:color}}/>)}</div></fieldset>
  <div className="grid gap-3 sm:grid-cols-2">
   <label className="block text-sm font-semibold text-[#162543]">{c.multiplier}<select data-takeoff-field="multiplierMode" className={field} value={d.multiplierMode} onChange={event=>onChange({...d,multiplierMode:event.target.value as TakeoffMultiplierMode})}>
    {(['none',...(d.kind==='length'?['height' as const]:[]),'factor'] as TakeoffMultiplierMode[]).map(mode=><option key={mode} value={mode}>{c.modes[mode]}</option>)}</select></label>
   {d.multiplierMode!=='none'&&<label className="block text-sm font-semibold text-[#162543]">{d.multiplierMode==='height'?c.height(lengthUnit):c.factor}<input data-takeoff-field="multiplier" inputMode="decimal" className={field} maxLength={16} value={d.multiplier} onChange={event=>onChange({...d,multiplier:event.target.value})}/></label>}
   <label className="block text-sm font-semibold text-[#162543]">{c.waste}<input data-takeoff-field="waste" inputMode="decimal" className={field} maxLength={6} value={d.waste} onChange={event=>onChange({...d,waste:event.target.value})}/></label>
  </div>
  <div className="space-y-2">
   <CatalogSelect kind="products" value={d.productId} label={c.item} disabled={disabled} onChange={product=>{if(!product||product.archived)return;onChange({...d,productId:product.id,productName:product.name});}}/>
   {d.productId&&<div className="flex flex-wrap items-center gap-2 text-sm text-[#52627a]"><span data-takeoff-linked-item className="min-w-0 break-words">{c.linkedItem(d.productName||d.productId)}</span><Button type="button" variant="ghost" className="min-h-11" onClick={()=>onChange({...d,productId:'',productName:''})}>{c.removeItem}</Button></div>}
  </div>
  {preview&&<p data-takeoff-preview className="rounded-xl bg-[#f3f8fb] p-3 text-sm font-semibold text-[#162543]" aria-live="polite">{c.preview(text(preview.baseMilli,preview.baseUnit),text(preview.totalMilli,preview.unit))}</p>}
  <div className="flex flex-wrap gap-2">
   <Button type="submit" className="min-h-11" disabled={disabled}>{saving?c.saving:c.saveMeasurement}</Button>
   <Button type="button" variant="secondary" className="min-h-11" disabled={saving} onClick={onCancel}>{c.cancel}</Button>
  </div>
 </form>;
}

function MeasurementPanel({c,en,measurements,archived,chosen,locked,onChoose,onManual,onEdit,onArchive,onVisibility,onDrawOpening,onDeduct,onRestore,send}:{c:Copy;en:boolean;measurements:TakeoffMeasurement[];archived:TakeoffMeasurement[];
 chosen:Set<string>;locked:boolean;onChoose:(id:string,on:boolean)=>void;onManual:()=>void;onEdit:(m:TakeoffMeasurement)=>void;onArchive:(m:TakeoffMeasurement)=>void;
 onVisibility:(m:TakeoffMeasurement)=>void;onDrawOpening:(m:TakeoffMeasurement)=>void;onDeduct:(m:TakeoffMeasurement,parentId:string|null)=>void;onRestore:(m:TakeoffMeasurement)=>void;send:ReactNode}){
 const t=(es:string,english:string)=>en?english:es,nameOf=(id:string|null|undefined)=>measurements.find(x=>x.id===id)?.name??t('otra área','another area');
 // Fix 14 (row 66): areas of the same page that can receive an opening (not openings themselves).
 const hosts=(m:TakeoffMeasurement)=>measurements.filter(x=>x.id!==m.id&&x.kind==='area'&&x.pageNumber===m.pageNumber&&!x.result.deductFrom);
 const [showArchived,setShowArchived]=useState(false);
 const groups=new Map<string,TakeoffMeasurement[]>();
 for(const m of measurements){const key=m.categoryName??'';groups.set(key,[...(groups.get(key)??[]),m]);}
 const ordered=[...groups.entries()].sort(([a],[b])=>a===''?1:b===''?-1:a.localeCompare(b,en?'en':'es'));
 const notes=(m:TakeoffMeasurement)=>[m.manualMilli!==null?c.typed:null,
  m.multiplierMode==='height'&&m.multiplierMilli?c.heightNote(`${formatMilli(m.multiplierMilli,en)} ${m.result.unit.replace('2','')}`):null,
  m.multiplierMode==='factor'&&m.multiplierMilli?c.factorNote(formatMilli(m.multiplierMilli,en)):null,
  m.wasteBps?c.wasteNote(formatMilli(m.wasteBps*10,en)):null,m.productName?c.linkedItem(m.productName):null].filter(Boolean).join(' · ');
 return <section data-takeoff-panel aria-label={c.panel} className="min-w-0 space-y-3 rounded-2xl border border-[#d7e1ea] bg-white p-3">
  <div className="flex flex-wrap items-center justify-between gap-2"><h5 className="font-bold text-[#162543]">{c.panel} ({measurements.length})</h5>
   <Button type="button" variant="secondary" className="min-h-11" data-takeoff-manual disabled={locked} onClick={onManual}>{c.manual}</Button></div>
  {!measurements.length&&<p data-takeoff-panel-empty className="text-sm text-[#52627a]">{c.panelEmpty}</p>}
  {ordered.map(([name,rows])=>{
   const subtotals=new Map<TakeoffResultUnit,number>();for(const m of rows)if(m.result.totalMilli!==null&&!m.result.deductFrom)subtotals.set(m.result.unit,(subtotals.get(m.result.unit)??0)+m.result.totalMilli);
   return <section key={name||'none'} data-takeoff-group={name||'none'} aria-label={name||c.uncategorized} className="space-y-2">
    <h6 className="text-xs font-bold uppercase tracking-wide text-[#68778d]">{name||c.uncategorized} ({rows.length})</h6>
    <ul className="space-y-2">{rows.map(m=><li key={m.id} data-takeoff-measurement={m.id} data-takeoff-kind={m.kind} className={`space-y-2 rounded-xl border border-[#d7e1ea] p-3 ${m.hidden?'bg-[#f7f9fc]':'bg-white'}`}>
     <div className="flex items-start gap-2">
      {/* 44 × 44 touch target around the 20 px box; negative margins keep the card layout unchanged. */}
      <label className="-ml-3 -mt-2 flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center"><input type="checkbox" data-takeoff-include className="h-5 w-5 accent-[#008bb5]" aria-label={`${c.include}: ${m.name}`} disabled={locked||m.result.totalMilli===null||!!m.result.deductFrom} checked={chosen.has(m.id)} onChange={event=>onChoose(m.id,event.target.checked)}/></label>
      <span aria-hidden="true" className="mt-1.5 h-3 w-3 shrink-0 rounded-full" style={{backgroundColor:m.color}}/>
      <div className="min-w-0 flex-1">
       <p className="break-words font-semibold text-[#162543]">{m.name} <span className="font-normal text-[#52627a]">· {c.kinds[m.kind]}</span></p>
       {m.result.deductFrom?<p data-takeoff-opening-of={m.result.deductFrom} className="text-sm font-semibold text-[#8a5a00]">{t(`Hueco: se resta de "${nameOf(m.result.deductFrom)}"`,`Opening: subtracted from "${nameOf(m.result.deductFrom)}"`)}</p>:null}
       {m.result.openings&&m.result.grossMilli!==undefined&&m.result.deductedMilli!==undefined?<p data-takeoff-net className="text-sm text-[#52627a]">{t('Área bruta','Gross area')} {formatQuantity(m.result.grossMilli,m.result.baseUnit,en)} − {m.result.openings===1?t('1 hueco','1 opening'):t(`${m.result.openings} huecos`,`${m.result.openings} openings`)} {formatQuantity(m.result.deductedMilli,m.result.baseUnit,en)} = <strong className="text-[#162543]">{t('neto','net')} {formatQuantity(m.result.baseMilli,m.result.baseUnit,en)}</strong></p>:
       <p className="text-sm text-[#52627a]">{c.result}: <span data-takeoff-base>{formatQuantity(m.result.baseMilli,m.result.baseUnit,en)??c.needsScale}</span></p>}
       {notes(m)&&<p className="break-words text-xs text-[#52627a]">{notes(m)}</p>}
       <p className="text-sm text-[#162543]">{c.total}: <strong data-takeoff-total data-takeoff-total-milli={m.result.totalMilli??''}>{formatQuantity(m.result.totalMilli,m.result.unit,en)??c.needsScale}</strong></p>
      </div>
     </div>
     {m.kind==='area'&&!m.result.deductFrom&&!m.hidden&&!locked&&<Button type="button" variant="secondary" data-takeoff-draw-opening={m.id} className="min-h-11 w-full" onClick={()=>onDrawOpening(m)}>{t('Dibujar un hueco dentro de esta área','Draw an opening inside this area')}</Button>}
     {m.kind==='area'&&!m.result.openings&&(hosts(m).length>0||m.result.deductFrom)&&<label className="block text-xs font-semibold text-[#162543]">{t('Restar como hueco de','Subtract as an opening of')}
      <select data-takeoff-deduct={m.id} className="mt-1 min-h-11 w-full min-w-0 rounded-xl border border-[#d7e1ea] bg-white px-3 text-sm font-normal" disabled={locked} value={m.result.deductFrom??''} onChange={event=>onDeduct(m,event.target.value||null)}>
       <option value="">{t('No es un hueco','Not an opening')}</option>{hosts(m).map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select>
      <span className="mt-1 block font-normal text-[#52627a]">{t('Para ventanas, puertas o columnas: su área se descuenta del área elegida y no se cotiza sola.','For windows, doors or columns: its area is taken off the chosen area and is not quoted alone.')}</span></label>}
     <div className="flex flex-wrap gap-1">
      <Button type="button" variant="ghost" size="sm" className="min-h-11" data-takeoff-visibility aria-pressed={m.hidden} disabled={locked||m.points.length===0} onClick={()=>onVisibility(m)} aria-label={`${c.hide}: ${m.name}`}>{c.hide}</Button>
      <Button type="button" variant="ghost" size="sm" className="min-h-11" disabled={locked} onClick={()=>onEdit(m)} aria-label={`${c.edit}: ${m.name}`}>{c.edit}</Button>
      <Button type="button" variant="ghost" size="sm" className="min-h-11" disabled={locked} onClick={()=>onArchive(m)} aria-label={`${c.archive}: ${m.name}`}>{c.archive}</Button>
     </div>
    </li>)}</ul>
    {subtotals.size>0&&<p data-takeoff-subtotal className="text-right text-sm text-[#52627a]">{c.subtotal}: <strong className="text-[#162543]">{[...subtotals.entries()].map(([unit,value])=>formatQuantity(value,unit,en)).join(' · ')}</strong></p>}
   </section>;
  })}
  {archived.length>0&&<div className="space-y-2">
   <Button type="button" variant="ghost" className="min-h-11" aria-expanded={showArchived} onClick={()=>setShowArchived(!showArchived)}>{showArchived?c.hideArchived:c.showArchivedMeasurements(archived.length)}</Button>
   {showArchived&&<ul aria-label={c.archivedMeasurements} className="space-y-2">{archived.map(m=><li key={m.id} data-takeoff-archived-measurement={m.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-dashed border-[#d7e1ea] bg-[#f7f9fc] p-2">
    <span className="min-w-0 break-words text-sm text-[#52627a]">{m.name}</span><Button type="button" variant="secondary" size="sm" className="min-h-11" disabled={locked} onClick={()=>onRestore(m)} aria-label={`${c.restore}: ${m.name}`}>{c.restore}</Button></li>)}</ul>}
  </div>}
  {send}
 </section>;
}

function SendPanel({c,en,detail,measurements,chosen,target,disabled,saving,onTarget,onSend}:{c:Copy;en:boolean;detail:TakeoffDetail;measurements:TakeoffMeasurement[];chosen:Set<string>;target:string;disabled:boolean;saving:boolean;
 onTarget:(value:string)=>void;onSend:()=>void}){
 const picked=measurements.filter(m=>chosen.has(m.id)),needsScale=picked.some(m=>m.result.totalMilli===null);
 return <section data-takeoff-send aria-label={c.send} className="space-y-2 border-t border-[#eef2f6] pt-3">
  <h6 className="font-bold text-[#162543]">{c.send}</h6>
  {!detail.canQuote?<p className="text-sm text-[#52627a]">{c.cannotQuote}</p>:<>
   <p className="text-sm text-[#52627a]">{c.sendIntro}</p>
   <label className="block text-sm font-semibold text-[#162543]">{c.target}<select data-takeoff-target className={field} value={detail.estimates.some(row=>row.id===target)?target:'new'} disabled={disabled} onChange={event=>onTarget(event.target.value)}>
    <option value="new">{c.newEstimate}</option>{detail.estimates.map(row=><option key={row.id} value={row.id}>{`${row.title} · ${c.lines(row.lineCount)} · ${privateEstimateMoney(row.totalCents,row.currency,en)}`}</option>)}</select></label>
   {needsScale&&<p className="text-sm text-[#7a4b00]">{c.sendNeedsScale}</p>}
   <Button type="button" className="min-h-11 w-full" data-takeoff-send-button disabled={disabled||!picked.length||needsScale} onClick={onSend}>{saving?c.saving:c.sendButton(picked.length)}</Button>
  </>}
 </section>;
}
