'use client';
import {useCallback,useEffect,useMemo,useRef,useState,type PointerEvent as ReactPointerEvent} from 'react';
import {useLocale} from 'next-intl';
import {Button} from '@/components/ui/button';
import {useAppDialog} from '@/hooks/use-app-dialog';
import {areaLabel,bounds,centroid,distance,emptyFloorPlan,extrudedFaces,floorObjectCorners,floorObjectKinds,floorObjectLabel,floorObjectSize,floorPlanPdf,floorPlanSvg,lengthLabel,openingSegment,round3,snap,summarize,type FloorObjectKind,type FloorPlan,type FloorPlanContent,type Point} from '@/lib/pro/floor-plan';
import {SCAN_MAX_BYTES,scanFormatOf} from '@/lib/pro/room-scan';
import {nativeRoomScanAvailable,RoomScan} from '@/lib/pro/room-scan-native';
import {takeoffColors} from '@/lib/pro/takeoffs';

/**
 * Round 6D (rows 64/65): floor plans of the job, inside Measurements. 2D editor (walls, doors/windows, rooms with
 * live area/perimeter, dimension lines, grid snap and scale), rectangular-room helper for keyboard use, PNG/PDF
 * export, an extruded 3D view (canvas 2D, no dependency; drag or buttons to orbit), «send areas to Measurements»
 * through the existing takeoff writer, and room-scan import (JSON/RoomPlan, OBJ, USDZ simulated, native plugin).
 */
type Read={workId:string;plans:FloorPlan[];scans:{id:string;format:string;fileName:string;parser:string;createdAt:string}[];takeoffPlans:{id:string;title:string}[]};
type Tool='select'|'wall'|'door'|'window'|'room'|'dimension'|'object';
type Selection={kind:'wall'|'opening'|'room'|'dimension'|'object';id:string}|null;
const field='mt-1 block min-h-11 w-full min-w-0 rounded-xl border border-[#d7e1ea] bg-white px-3 text-base font-normal';
const newId=(prefix:string)=>prefix+Math.random().toString(36).slice(2,9);
function base64(bytes:Uint8Array){let s='';for(let i=0;i<bytes.length;i+=0x8000)s+=String.fromCharCode(...bytes.subarray(i,i+0x8000));return btoa(s);}
async function svgToBlob(svg:string,type:'image/png'|'image/jpeg'){
 const image=new Image(),url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'}));
 try{await new Promise<void>((resolve,reject)=>{image.onload=()=>resolve();image.onerror=()=>reject(Error('svg'));image.src=url;});
  const canvas=document.createElement('canvas');canvas.width=image.naturalWidth||1600;canvas.height=image.naturalHeight||1200;const ctx=canvas.getContext('2d');if(!ctx)throw Error('canvas');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0);
  return await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('blob')),type,0.9));}
 finally{URL.revokeObjectURL(url);}
}
function download(blob:Blob,name:string){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
/** Decimal field shown with the interface's decimal separator (2,4 in Spanish, 2.4 in English); accepts either while typing. */
function DecimalInput({value,onValue,locale,min,max,className,...rest}:{value:number;onValue:(value:number)=>void;locale:string;min:number;max:number;className:string;'data-floor-height'?:boolean}){
 const [text,setText]=useState<string|null>(null);
 return <input {...rest} inputMode="decimal" className={className} value={text??value.toLocaleString(locale,{maximumFractionDigits:3,useGrouping:false})}
  onChange={e=>{setText(e.target.value);const v=Number(e.target.value.trim().replace(',','.'));if(e.target.value.trim()!==''&&Number.isFinite(v)&&v>=min&&v<=max)onValue(v);}} onBlur={()=>setText(null)}/>;
}
export function WorkFloorPlans({workId}:{workId:string}){
 const en=useLocale()==='en',t=useCallback((es:string,english:string)=>en?english:es,[en]),{confirm,dialogNode}=useAppDialog();
 const [data,setData]=useState<Read|null>(null),[failed,setFailed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [planId,setPlanId]=useState<string|null>(null),[name,setName]=useState(''),[unit,setUnit]=useState<'m'|'ft'>('m'),[content,setContent]=useState<FloorPlanContent>(emptyFloorPlan),[dirty,setDirty]=useState(false);
 const [tool,setTool]=useState<Tool>('select'),[grid,setGrid]=useState(0.25),[zoom,setZoom]=useState(1),[pending,setPending]=useState<Point[]>([]),[selected,setSelected]=useState<Selection>(null),[view3d,setView3d]=useState(false),[thickness,setThickness]=useState(0.15);
 const [objectKind,setObjectKind]=useState<FloorObjectKind>('bed'),[rect,setRect]=useState({name:'',width:'4',depth:'3',x:'0',y:'0'}),[native,setNative]=useState(false),[scanNotes,setScanNotes]=useState<string[]>([]);
 // Closing round: every user edit bumps `edits`; a reload that started before an edit (e.g. the one that
 // follows «Guardar plano») refreshes the list but no longer replaces what the user is drawing now.
 const edits=useRef(0),markDirty=()=>{edits.current++;setDirty(true);};
 const history=useRef<FloorPlanContent[]>([]),seq=useRef(0),svgRef=useRef<SVGSVGElement|null>(null),sendIds=useRef<{fileId:string;planId:string;measurements:Record<string,string>;actions:Record<string,string>}|null>(null);
 const load=useCallback(async(select?:string)=>{const n=++seq.current,edited=edits.current;setFailed(false);
  try{const response=await fetch('/api/pro/floor-plans?'+new URLSearchParams({workId}),{cache:'no-store'});if(!response.ok)throw Error();const body=await response.json() as Read;if(n!==seq.current)return;setData(body);
   const active=body.plans.filter(p=>!p.archived),target=active.find(p=>p.id===select)??active[0]??null;
   if((select!==undefined||!planId)&&edited===edits.current){setPlanId(target?.id??null);if(target){setName(target.name);setUnit(target.unit);setContent(target.content);}else{setName('');setContent(emptyFloorPlan());}setDirty(false);history.current=[];}}
  catch{if(n===seq.current)setFailed(true);}
 // eslint-disable-next-line react-hooks/exhaustive-deps -- planId only decides whether the first load picks a plan
 },[workId]);
 useEffect(()=>{const counter=seq,timer=setTimeout(()=>void load(),0);return()=>{clearTimeout(timer);counter.current++;};},[load]);
 useEffect(()=>{let alive=true;void nativeRoomScanAvailable().then(v=>{if(alive)setNative(v);});return()=>{alive=false;};},[]);
 const plan=data?.plans.find(p=>p.id===planId)??null,summary=useMemo(()=>summarize(content),[content]);
 const change=(next:FloorPlanContent)=>{history.current=[...history.current.slice(-49),content];setContent(next);markDirty();};
 const undo=()=>{const previous=history.current.pop();if(previous){setContent(previous);markDirty();}};
 async function api(payload:Record<string,unknown>,done:string){
  setBusy(true);setError('');setNotice('');
  try{const response=await fetch('/api/pro/floor-plans',{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const json=await response.json().catch(()=>({}));
   if(!response.ok){setError(response.status===409?t('El plano cambió en otra pestaña. Recárguelo antes de guardar.','The plan changed in another tab. Reload it before saving.'):response.status===400?(json.error&&String(json.error).includes('Formato')?t('Formato no reconocido. Use JSON de plano o RoomPlan, OBJ o USDZ.','Unrecognized format. Use plan or RoomPlan JSON, OBJ or USDZ.'):t('Revise el plano: cada ambiente necesita 3 puntos y cada abertura una pared.','Check the plan: each room needs 3 points and each opening a wall.')):t('No se pudo guardar. Reintente.','Could not save. Retry.'));return null;}
   setNotice(done);return json as {plan:FloorPlan;notes?:string[]};
  }catch{setError(t('No se pudo guardar. Reintente.','Could not save. Retry.'));return null;}finally{setBusy(false);}
 }
 async function save(){
  if(!name.trim()){setError(t('Ponga un nombre al plano.','Give the plan a name.'));return;}
  const result=plan?await api({action:'save',actionId:crypto.randomUUID(),id:plan.id,revision:plan.revision,name:name.trim(),unit,content},t('Plano guardado.','Plan saved.'))
   :await api({action:'create',actionId:crypto.randomUUID(),id:crypto.randomUUID(),workId,name:name.trim(),unit,content},t('Plano creado.','Plan created.'));
  if(result){setDirty(false);await load(result.plan.id);}
 }
 async function newPlan(){if(dirty&&!(await confirm({title:t('¿Descartar cambios?','Discard changes?'),description:t('Los cambios sin guardar se perderán.','Unsaved changes will be lost.'),confirmLabel:t('Descartar','Discard'),cancelLabel:t('Cancelar','Cancel')})).confirmed)return;setPlanId(null);setName(t('Planta principal','Main floor'));setContent(emptyFloorPlan());markDirty();setSelected(null);history.current=[];}
 // ---- pointer editing in plan units
 const b=bounds(content),viewMin:Point=[Math.min(b.minX,0)-1,Math.min(b.minY,0)-1],viewSize:Point=[Math.max(b.maxX-viewMin[0]+1,12)/zoom,Math.max(b.maxY-viewMin[1]+1,8)/zoom];
 const toPlan=(event:ReactPointerEvent<SVGSVGElement>):Point=>{const svg=svgRef.current!,pt=svg.createSVGPoint();pt.x=event.clientX;pt.y=event.clientY;const m=svg.getScreenCTM();const p=m?pt.matrixTransform(m.inverse()):pt;return [round3(snap(p.x,grid)),round3(snap(p.y,grid))];};
 function nearestWall(p:Point){let best:{id:string;offset:number;d:number}|null=null;for(const w of content.walls){const len=distance(w.a,w.b);if(!len)continue;const ux=(w.b[0]-w.a[0])/len,uy=(w.b[1]-w.a[1])/len,s=Math.max(0,Math.min(len,(p[0]-w.a[0])*ux+(p[1]-w.a[1])*uy)),q:Point=[w.a[0]+ux*s,w.a[1]+uy*s],d=distance(p,q);if(!best||d<best.d)best={id:w.id,offset:s,d};}return best&&best.d<0.6?best:null;}
 function click(event:ReactPointerEvent<SVGSVGElement>){
  if(view3d)return;const p=toPlan(event);setError('');
  if(tool==='wall'){if(!pending.length){setPending([p]);return;}const a=pending[pending.length-1]!;if(distance(a,p)<0.05)return;change({...content,walls:[...content.walls,{id:newId('w'),a,b:p,thickness}]});setPending([p]);return;}
  if(tool==='dimension'){if(!pending.length){setPending([p]);return;}change({...content,dimensions:[...content.dimensions,{id:newId('d'),a:pending[0]!,b:p}]});setPending([]);return;}
  if(tool==='room'){if(pending.length>=3&&distance(pending[0]!,p)<0.3){finishRoom();return;}setPending([...pending,p]);return;}
  // Round 12 (row 63): furniture/fixture footprint centred on the tap, default size in the plan unit.
  if(tool==='object'){const [w,d]=floorObjectSize[objectKind],k=unit==='ft'?3.28084:1;const id=newId('o');change({...content,objects:[...(content.objects??[]),{id,kind:objectKind,x:p[0],y:p[1],w:round3(w*k),d:round3(d*k),rotation:0}]});setSelected({kind:'object',id});return;}
  if(tool==='door'||tool==='window'){const w=nearestWall(p);if(!w){setError(t('Haga clic sobre una pared.','Click on a wall.'));return;}const width=tool==='door'?0.9:1.2;change({...content,openings:[...content.openings,{id:newId(tool[0]!),wallId:w.id,kind:tool,offset:round3(Math.max(0,w.offset-width/2)),width}]});return;}
  setSelected(null);
 }
 function finishRoom(){if(pending.length<3){setError(t('Un ambiente necesita al menos 3 puntos.','A room needs at least 3 points.'));return;}change({...content,rooms:[...content.rooms,{id:newId('r'),name:t(`Ambiente ${content.rooms.length+1}`,`Room ${content.rooms.length+1}`),points:pending}]});setPending([]);}
 function addRectangle(){
  const w=Number(rect.width.replace(',','.')),d=Number(rect.depth.replace(',','.')),x=Number(rect.x.replace(',','.'))||0,y=Number(rect.y.replace(',','.'))||0;
  if(!(w>0&&d>0&&w<=1000&&d<=1000)){setError(t('Indique ancho y largo mayores que 0.','Enter width and depth greater than 0.'));return;}
  const pts:Point[]=[[x,y],[x+w,y],[x+w,y+d],[x,y+d]].map(p=>[round3(p[0]!),round3(p[1]!)] as Point);
  change({...content,rooms:[...content.rooms,{id:newId('r'),name:(rect.name.trim()||t(`Ambiente ${content.rooms.length+1}`,`Room ${content.rooms.length+1}`)).slice(0,80),points:pts}],walls:[...content.walls,...pts.map((a,i)=>({id:newId('w'),a,b:pts[(i+1)%4]!,thickness}))]});
  setRect(r=>({...r,name:'',x:String(round3(x+w)),y:r.y}));setNotice(t('Ambiente agregado. Guarde el plano para conservarlo.','Room added. Save the plan to keep it.'));
 }
 function remove(){if(!selected)return;change({...content,walls:selected.kind==='wall'?content.walls.filter(w=>w.id!==selected.id):content.walls,openings:content.openings.filter(o=>!(selected.kind==='opening'&&o.id===selected.id)&&!(selected.kind==='wall'&&o.wallId===selected.id)),rooms:content.rooms.filter(r=>!(selected.kind==='room'&&r.id===selected.id)),dimensions:content.dimensions.filter(d=>!(selected.kind==='dimension'&&d.id===selected.id)),...(content.objects?{objects:content.objects.filter(o=>!(selected.kind==='object'&&o.id===selected.id))}:{})});setSelected(null);}
 /** Round 12: start the next level (storey) from this plan: same outer walls and height, empty rooms. */
 async function newLevel(){if(dirty&&!(await confirm({title:t('¿Descartar cambios?','Discard changes?'),description:t('Los cambios sin guardar se perderán.','Unsaved changes will be lost.'),confirmLabel:t('Descartar','Discard'),cancelLabel:t('Cancelar','Cancel')})).confirmed)return;const order=(content.level?.order??0)+1;setPlanId(null);setContent({walls:content.walls.map(w=>({...w,id:newId('w')})),openings:[],rooms:[],dimensions:[],wallHeight:content.wallHeight,level:{name:order===1?t('Segundo piso','Second floor'):t(`Nivel ${order+1}`,`Level ${order+1}`),order},objects:[]});markDirty();setSelected(null);history.current=[];setNotice(t('Nivel nuevo con las mismas paredes. Dibuje sus ambientes y guárdelo.','New level with the same walls. Draw its rooms and save it.'));}
 // ---- exports
 const svgString=()=>floorPlanSvg({name:name||t('Plano','Plan'),unit,content},en);
 const fileBase=(name||'plano').normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^A-Za-z0-9]+/g,'-').replace(/^-|-$/g,'').toLowerCase()||'plano';
 async function exportPng(){try{download(await svgToBlob(svgString(),'image/png'),fileBase+'.png');}catch{setError(t('No se pudo exportar la imagen.','Could not export the image.'));}}
 function exportPdf(){const bytes=floorPlanPdf({name:name||t('Plano','Plan'),unit,content},en,t('Plano de referencia','Reference plan'));download(new Blob([bytes.slice().buffer],{type:'application/pdf'}),fileBase+'.pdf');}
 // ---- send room areas to Measurements (existing takeoff writer), then record the link
 async function sendToTakeoffs(){
  if(!plan||dirty){setError(t('Guarde el plano antes de enviarlo a Mediciones.','Save the plan before sending it to Measurements.'));return;}
  if(!plan.content.rooms.length){setError(t('El plano no tiene ambientes.','The plan has no rooms.'));return;}
  setBusy(true);setError('');setNotice('');
  try{
   sendIds.current??={fileId:crypto.randomUUID(),planId:crypto.randomUUID(),measurements:Object.fromEntries(plan.content.rooms.map(r=>[r.id,crypto.randomUUID()])),actions:Object.fromEntries(['plan',...plan.content.rooms.map(r=>r.id)].map(k=>[k,crypto.randomUUID()]))};const ids=sendIds.current;
   const jpeg=new Uint8Array(await (await svgToBlob(floorPlanSvg({name:plan.name,unit:plan.unit,content:plan.content},en,1400),'image/jpeg')).arrayBuffer());
   const post=(url:string,body:unknown)=>fetch(url,{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
   const up=await post('/api/pro/work-files',{action:'upload',workId,fileId:ids.fileId,name:('plano-'+fileBase).slice(0,150)+'.jpg',data:base64(jpeg)});if(!up.ok&&up.status!==409)throw Error('upload');
   const created=await post('/api/pro/takeoffs',{action:'plan_create',actionId:ids.actions.plan,workId,id:ids.planId,fileId:ids.fileId,title:(t('Plano: ','Plan: ')+plan.name).slice(0,160)});if(!created.ok)throw Error('plan');
   const factor=plan.unit==='ft'?0.09290304:1;
   for(const [index,room] of plan.content.rooms.entries()){
    const area=summarize(plan.content).rooms.find(r=>r.id===room.id)!.area*factor;
    const m=await post('/api/pro/takeoffs',{action:'measurement_create',actionId:ids.actions[room.id],workId,id:ids.measurements[room.id],planId:ids.planId,pageNumber:1,kind:'area',name:room.name.slice(0,120),categoryId:null,color:takeoffColors[index%takeoffColors.length],points:[],manualMilli:Math.max(1,Math.round(area*1000)),multiplierMode:'none',multiplierMilli:null,wasteBps:0,productId:null});
    if(!m.ok)throw Error('measurement');
   }
   const linked=await fetch('/api/pro/floor-plans',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'link_takeoffs',actionId:crypto.randomUUID(),id:plan.id,revision:plan.revision,link:{planId:ids.planId,measurements:plan.content.rooms.map(r=>({roomId:r.id,measurementId:ids.measurements[r.id]}))}})});
   if(!linked.ok)throw Error('link');
   sendIds.current=null;setNotice(t(`${plan.content.rooms.length===1?'1 área enviada':plan.content.rooms.length+' áreas enviadas'} a Mediciones (plano «${plan.name}»).`,`${plan.content.rooms.length===1?'1 area':plan.content.rooms.length+' areas'} sent to Measurements (plan “${plan.name}”).`));await load(plan.id);
   window.dispatchEvent(new Event('ccr:pro-takeoffs-changed'));
  }catch{setError(t('No se pudo completar el envío. Reintente: no se duplicará.','Could not complete the transfer. Retry: it will not be duplicated.'));}finally{setBusy(false);}
 }
 // ---- scan import
 async function importScan(file:File){
  const format=scanFormatOf(file.name);if(!format){setError(t('Use un archivo .json, .obj o .usdz.','Use a .json, .obj or .usdz file.'));return;}
  if(file.size>SCAN_MAX_BYTES){setError(t('El archivo supera 10 MB.','The file exceeds 10 MB.'));return;}
  const data=format==='usdz'?base64(new Uint8Array(await file.arrayBuffer())):await file.text();
  const result=await api({action:'import_scan',actionId:crypto.randomUUID(),id:crypto.randomUUID(),scanId:crypto.randomUUID(),workId,name:file.name.replace(/\.[^.]+$/,'').slice(0,120)||t('Escaneo','Scan'),unit:'m',fileName:file.name.slice(0,160),format,data,language:en?'en':'es'},t('Escaneo importado como plano nuevo.','Scan imported as a new plan.'));
  if(result){setScanNotes(result.notes??[]);await load(result.plan.id);}
 }
 async function nativeScan(){try{const scan=await RoomScan.startScan({unit,language:en?'en':'es'});const result=await api({action:'import_scan',actionId:crypto.randomUUID(),id:crypto.randomUUID(),scanId:crypto.randomUUID(),workId,name:t('Escaneo del dispositivo','Device scan'),unit,fileName:scan.fileName.slice(0,160)||'roomplan.json',format:'native',data:scan.data,language:en?'en':'es'},t('Escaneo importado.','Scan imported.'));if(result){setScanNotes(result.notes??[]);await load(result.plan.id);}}catch{setError(t('El escaneo se canceló o no está disponible.','The scan was cancelled or is not available.'));}}
 if(failed)return <section className="rounded-2xl border border-[#d7e1ea] bg-white p-4"><div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-red-700"><span>{t('No se pudieron cargar los planos.','Could not load the floor plans.')}</span><Button type="button" variant="secondary" onClick={()=>void load()}>{t('Reintentar','Retry')}</Button></div></section>;
 if(!data)return <p role="status" aria-busy="true" className="text-sm text-[#52627a]">{t('Cargando planos…','Loading floor plans…')}</p>;
 const active=data.plans.filter(p=>!p.archived),editing=planId!==null||dirty;
 const tools:[Tool,string][]=[['select',t('Seleccionar','Select')],['wall',t('Pared','Wall')],['door',t('Puerta','Door')],['window',t('Ventana','Window')],['room',t('Ambiente','Room')],['dimension',t('Cota','Dimension')],['object',t('Objeto','Object')]];
 const hint={select:t('Toque un elemento para seleccionarlo.','Tap an element to select it.'),wall:t('Toque el inicio y luego cada esquina. «Terminar» corta la pared.','Tap the start and then each corner. “Finish” ends the wall.'),door:t('Toque una pared para poner una puerta de 0,9.','Tap a wall to place a 0.9 door.'),window:t('Toque una pared para poner una ventana de 1,2.','Tap a wall to place a 1.2 window.'),room:t('Toque cada esquina; toque la primera (o «Cerrar ambiente») para terminar.','Tap each corner; tap the first one (or “Close room”) to finish.'),dimension:t('Toque los dos extremos de la cota.','Tap both ends of the dimension.'),object:t('Elija el objeto y toque donde va su centro.','Choose the object and tap where its centre goes.')}[tool];
 const sel=selected,selRoom=sel?.kind==='room'?content.rooms.find(r=>r.id===sel.id):undefined,selOpening=sel?.kind==='opening'?content.openings.find(o=>o.id===sel.id):undefined,selWall=sel?.kind==='wall'?content.walls.find(w=>w.id===sel.id):undefined,selObject=sel?.kind==='object'?content.objects?.find(o=>o.id===sel.id):undefined;
 const setObject=(patch:Partial<NonNullable<FloorPlanContent['objects']>[number]>)=>{if(selObject)change({...content,objects:(content.objects??[]).map(o=>o.id===selObject.id?{...o,...patch}:o)});};
 return <section data-floor-plans aria-labelledby="floor-plans-title" className="min-w-0 space-y-4 rounded-2xl border border-[#d7e1ea] bg-white p-4 sm:p-5">{dialogNode}
  <div className="flex flex-wrap items-center justify-between gap-2"><h2 id="floor-plans-title" className="text-lg font-bold text-[#162543]">{t('Planos de planta y vista 3D','Floor plans and 3D view')}</h2>
   <div className="flex flex-wrap gap-2">{active.length>0&&<label className="text-sm font-medium"><span className="sr-only">{t('Plano','Plan')}</span><select data-floor-select className={field+' mt-0'} value={planId??''} onChange={e=>void load(e.target.value)}>{active.toSorted((x,y)=>(x.content.level?.order??0)-(y.content.level?.order??0)).map(p=><option key={p.id} value={p.id}>{p.content.level?p.content.level.name+' · ':''}{p.name}{p.source==='scan'?t(' (escaneo)',' (scan)'):''}</option>)}</select></label>}
    <Button type="button" variant="secondary" data-floor-new disabled={busy} onClick={()=>void newPlan()}>{t('Plano nuevo','New plan')}</Button>
    <label className={'inline-flex min-h-11 cursor-pointer items-center rounded-full border border-[#d7e1ea] bg-white px-4 text-sm font-semibold '+(busy?'pointer-events-none opacity-50':'')}>{t('Importar escaneo','Import scan')}<input type="file" data-floor-scan-input accept=".json,.obj,.usdz,application/json,model/obj,model/vnd.usdz+zip" className="sr-only" disabled={busy} onChange={e=>{const f=e.target.files?.[0];e.target.value='';if(f)void importScan(f);}}/></label>
    {native&&<Button type="button" variant="secondary" data-floor-native-scan disabled={busy} onClick={()=>void nativeScan()}>{t('Escanear con el teléfono','Scan with the phone')}</Button>}</div></div>
  <p className="text-sm text-[#52627a]">{t('Dibuje paredes, puertas, ventanas y ambientes; el área y el perímetro se calculan solos. Es un dibujo de referencia para cotizar, no un plano estructural.','Draw walls, doors, windows and rooms; area and perimeter are computed automatically. It is a reference drawing for quoting, not a structural plan.')}</p>
  {scanNotes.map((n,i)=><p key={i} data-floor-scan-note className={'rounded-xl p-2 text-xs '+(/SIMUL/.test(n)?'bg-[#fff6e5] text-[#8a5300]':'bg-[#f3f8fb] text-[#38485f]')}>{n}</p>)}
  {notice&&<p role="status" data-floor-notice className="text-sm text-[#175b42]">{notice}</p>}{error&&<p role="alert" data-floor-error className="text-sm text-red-700">{error}</p>}
  {!editing?<p className="text-sm text-[#52627a]">{t('Este trabajo todavía no tiene planos.','This job has no plans yet.')}</p>:<>
   <div className="grid min-w-0 gap-2 sm:grid-cols-4">
    <label className="block text-sm font-medium sm:col-span-2">{t('Nombre del plano','Plan name')}<input data-floor-name className={field} maxLength={120} value={name} onChange={e=>{setName(e.target.value);markDirty();}}/></label>
    <label className="block text-sm font-medium">{t('Unidad','Unit')}<select data-floor-unit className={field} value={unit} onChange={e=>{setUnit(e.target.value as 'm'|'ft');markDirty();}}><option value="m">{t('Metros','Metres')}</option><option value="ft">{t('Pies','Feet')}</option></select></label>
    <label className="block text-sm font-medium">{t('Altura de paredes','Wall height')}<DecimalInput data-floor-height className={field} locale={en?'en-US':'es-CR'} value={content.wallHeight} min={1} max={20} onValue={v=>change({...content,wallHeight:v})}/></label>
   </div>
   <div data-floor-level className="grid min-w-0 gap-2 sm:grid-cols-4">
    <label className="block text-sm font-medium sm:col-span-2">{t('Nivel (piso)','Level (storey)')}<input data-floor-level-name className={field} maxLength={60} placeholder={t('Planta baja','Ground floor')} value={content.level?.name??''} onChange={e=>change({...content,level:e.target.value.trim()?{name:e.target.value.slice(0,60),order:content.level?.order??0}:undefined})}/></label>
    <label className="block text-sm font-medium">{t('Orden del nivel','Level order')}<input data-floor-level-order type="number" min={-5} max={50} step={1} className={field} value={content.level?.order??0} disabled={!content.level} onChange={e=>{const v=Math.trunc(Number(e.target.value));if(content.level&&Number.isFinite(v)&&v>=-5&&v<=50)change({...content,level:{...content.level,order:v}});}}/></label>
    <div className="flex items-end"><Button type="button" variant="secondary" data-floor-new-level disabled={busy||!content.walls.length} onClick={()=>void newLevel()}>{t('Nivel nuevo con estas paredes','New level from these walls')}</Button></div>
   </div>
   <div role="toolbar" aria-label={t('Herramientas del plano','Plan tools')} className="flex flex-wrap items-center gap-2">
    {tools.map(([id,label])=><button key={id} type="button" data-floor-tool={id} aria-pressed={tool===id} disabled={view3d} onClick={()=>{setTool(id);setPending([]);}} className={'min-h-11 rounded-xl px-3 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#008bb5] '+(tool===id?'bg-[#eaf7fb] text-[#007aa0]':'text-[#52627a] hover:bg-[#f3f8fb]')}>{label}</button>)}
    {tool==='object'&&<label className="text-sm">{t('Objeto','Object')} <select data-floor-object-kind className="min-h-11 rounded-xl border border-[#d7e1ea] px-2" value={objectKind} onChange={e=>setObjectKind(e.target.value as FloorObjectKind)}>{floorObjectKinds.map(k=><option key={k} value={k}>{floorObjectLabel(k,en)}</option>)}</select></label>}
    {tool==='wall'&&pending.length>0&&<Button type="button" variant="secondary" onClick={()=>setPending([])}>{t('Terminar','Finish')}</Button>}
    {tool==='room'&&pending.length>=3&&<Button type="button" variant="secondary" data-floor-close-room onClick={finishRoom}>{t('Cerrar ambiente','Close room')}</Button>}
    <Button type="button" variant="ghost" disabled={!history.current.length} onClick={undo}>{t('Deshacer','Undo')}</Button>
    <label className="text-sm">{t('Cuadrícula','Grid')} <select className="min-h-11 rounded-xl border border-[#d7e1ea] px-2" value={grid} onChange={e=>setGrid(Number(e.target.value))}>{[0.05,0.1,0.25,0.5,1].map(g=><option key={g} value={g}>{g.toLocaleString(en?'en-US':'es-CR')} {unit}</option>)}</select></label>
    <label className="text-sm">{t('Grosor de pared','Wall thickness')} <select className="min-h-11 rounded-xl border border-[#d7e1ea] px-2" value={thickness} onChange={e=>setThickness(Number(e.target.value))}>{[0.1,0.12,0.15,0.2,0.3].map(g=><option key={g} value={g}>{g.toLocaleString(en?'en-US':'es-CR')}</option>)}</select></label>
    <Button type="button" variant="ghost" aria-label={t('Alejar','Zoom out')} onClick={()=>setZoom(z=>Math.max(0.25,z/1.25))}>−</Button><Button type="button" variant="ghost" aria-label={t('Acercar','Zoom in')} onClick={()=>setZoom(z=>Math.min(4,z*1.25))}>+</Button>
    <Button type="button" variant={view3d?'default':'secondary'} data-floor-3d aria-pressed={view3d} onClick={()=>setView3d(v=>!v)}>{view3d?t('Ver en 2D','Show 2D'):t('Vista 3D','3D view')}</Button>
   </div>
   {!view3d&&<p className="text-xs text-[#52627a]" aria-live="polite">{hint}</p>}
   <div className="min-w-0 overflow-hidden rounded-xl border border-[#d7e1ea] bg-[#fbfdfe]">
    {view3d?<FloorPlan3D content={content} en={en}/>:
    <svg ref={svgRef} data-floor-canvas role="img" aria-label={t(`Plano ${name}: ${content.rooms.length} ambientes, ${content.walls.length} paredes`,`Plan ${name}: ${content.rooms.length} rooms, ${content.walls.length} walls`)} viewBox={`${viewMin[0]} ${viewMin[1]} ${viewSize[0]} ${viewSize[1]}`} className="block h-[360px] w-full touch-none sm:h-[460px]" onPointerDown={click}>
     <defs><pattern id="floor-grid" width={grid} height={grid} patternUnits="userSpaceOnUse"><path d={`M ${grid} 0 L 0 0 0 ${grid}`} fill="none" stroke="#e3edf3" strokeWidth={0.01}/></pattern></defs>
     <rect x={viewMin[0]} y={viewMin[1]} width={viewSize[0]} height={viewSize[1]} fill="url(#floor-grid)"/>
     {content.rooms.map(r=>{const c=centroid(r.points),on=sel?.kind==='room'&&sel.id===r.id;return <g key={r.id} data-floor-room={r.name} onPointerDown={e=>{if(tool==='select'){e.stopPropagation();setSelected({kind:'room',id:r.id});}}}><polygon points={r.points.map(p=>p.join(',')).join(' ')} fill={on?'#cdeefa':'#eaf7fb'} stroke="#9fc9da" strokeWidth={0.03}/><text x={c[0]} y={c[1]} fontSize={0.32} textAnchor="middle" fill="#162543">{r.name}</text><text x={c[0]} y={c[1]+0.4} fontSize={0.26} textAnchor="middle" fill="#52627a">{areaLabel(summary.rooms.find(x=>x.id===r.id)?.area??0,unit,en)}</text></g>;})}
     {(content.objects??[]).map(o=>{const c=floorObjectCorners(o),on=sel?.kind==='object'&&sel.id===o.id;return <g key={o.id} data-floor-object={o.kind} onPointerDown={e=>{if(tool==='select'){e.stopPropagation();setSelected({kind:'object',id:o.id});}}}><polygon points={c.map(p=>p.join(',')).join(' ')} fill={on?'#ffe8b8':'#fff7e6'} stroke={on?'#8a5300':'#b7791f'} strokeWidth={0.03}/><text x={o.x} y={o.y+0.08} textAnchor="middle" fontSize={0.2} fill="#7a4f0b">{floorObjectLabel(o.kind,en)}</text></g>;})}
     {content.walls.map(w=><line key={w.id} data-floor-wall={w.id} x1={w.a[0]} y1={w.a[1]} x2={w.b[0]} y2={w.b[1]} stroke={sel?.kind==='wall'&&sel.id===w.id?'#007aa0':'#162543'} strokeWidth={Math.max(0.06,w.thickness)} strokeLinecap="square" onPointerDown={e=>{if(tool==='select'){e.stopPropagation();setSelected({kind:'wall',id:w.id});}}}/>)}
     {content.openings.map(o=>{const seg=openingSegment(content,o);return seg?<line key={o.id} data-floor-opening={o.kind} x1={seg[0][0]} y1={seg[0][1]} x2={seg[1][0]} y2={seg[1][1]} stroke={o.kind==='door'?'#d9480f':'#1c7ed6'} strokeWidth={o.kind==='door'?0.12:0.09} onPointerDown={e=>{if(tool==='select'){e.stopPropagation();setSelected({kind:'opening',id:o.id});}}}/>:null;})}
     {content.dimensions.map(d=>{const m:Point=[(d.a[0]+d.b[0])/2,(d.a[1]+d.b[1])/2];return <g key={d.id} data-floor-dimension onPointerDown={e=>{if(tool==='select'){e.stopPropagation();setSelected({kind:'dimension',id:d.id});}}}><line x1={d.a[0]} y1={d.a[1]} x2={d.b[0]} y2={d.b[1]} stroke="#7048e8" strokeWidth={0.03} strokeDasharray="0.15 0.1"/><text x={m[0]} y={m[1]-0.12} fontSize={0.26} textAnchor="middle" fill="#7048e8">{lengthLabel(distance(d.a,d.b),unit,en)}</text></g>;})}
     {pending.length>0&&<polyline points={pending.map(p=>p.join(',')).join(' ')} fill="none" stroke="#0089bb" strokeWidth={0.04} strokeDasharray="0.1 0.08"/>}
     {pending.map((p,i)=><circle key={i} cx={p[0]} cy={p[1]} r={0.08} fill="#0089bb"/>)}
     <g aria-hidden="true"><line x1={viewMin[0]+0.4} y1={viewMin[1]+viewSize[1]-0.4} x2={viewMin[0]+1.4} y2={viewMin[1]+viewSize[1]-0.4} stroke="#162543" strokeWidth={0.05}/><text x={viewMin[0]+1.5} y={viewMin[1]+viewSize[1]-0.32} fontSize={0.25} fill="#162543">1 {unit}</text></g>
    </svg>}
   </div>
   {sel&&!view3d&&<div data-floor-selection={sel.kind} className="flex flex-wrap items-end gap-2 rounded-xl bg-[#f7fafc] p-3 text-sm">
    {selRoom&&<label className="block text-sm font-medium">{t('Nombre del ambiente','Room name')}<input data-floor-room-name className={field} maxLength={80} value={selRoom.name} onChange={e=>change({...content,rooms:content.rooms.map(r=>r.id===selRoom.id?{...r,name:e.target.value.slice(0,80)||r.name}:r)})}/></label>}
    {selOpening&&<label className="block text-sm font-medium">{t('Ancho','Width')}<input inputMode="decimal" className={field} defaultValue={selOpening.width} onBlur={e=>{const v=Number(e.target.value.replace(',','.'));if(v>=0.1&&v<=20)change({...content,openings:content.openings.map(o=>o.id===selOpening.id?{...o,width:v}:o)});}}/></label>}
    {selWall&&<p>{t('Largo','Length')}: {lengthLabel(distance(selWall.a,selWall.b),unit,en)}</p>}
    {selObject&&<><label className="block text-sm font-medium">{t('Objeto','Object')}<select data-floor-object-edit-kind className={field} value={selObject.kind} onChange={e=>setObject({kind:e.target.value as FloorObjectKind})}>{floorObjectKinds.map(k=><option key={k} value={k}>{floorObjectLabel(k,en)}</option>)}</select></label>
     <label className="block text-sm font-medium">{t('Ancho','Width')} ({unit})<DecimalInput className={field} locale={en?'en-US':'es-CR'} value={selObject.w} min={0.1} max={50} onValue={v=>setObject({w:round3(v)})}/></label>
     <label className="block text-sm font-medium">{t('Fondo','Depth')} ({unit})<DecimalInput className={field} locale={en?'en-US':'es-CR'} value={selObject.d} min={0.1} max={50} onValue={v=>setObject({d:round3(v)})}/></label>
     <Button type="button" variant="secondary" data-floor-object-rotate onClick={()=>setObject({rotation:((selObject.rotation+90)%360) as 0|90|180|270})}>{t('Girar 90°','Rotate 90°')}</Button></>}
    <Button type="button" variant="ghost" data-floor-delete onClick={remove}>{t('Eliminar','Delete')}</Button>
   </div>}
   <details className="rounded-xl border border-[#e3eaf0] p-3" open={!content.rooms.length}><summary className="cursor-pointer text-sm font-semibold text-[#007aa0]">{t('Agregar ambiente rectangular por medidas','Add a rectangular room by measurements')}</summary>
    <div className="mt-2 grid gap-2 sm:grid-cols-5">
     <label className="block text-sm font-medium sm:col-span-2">{t('Nombre','Name')}<input data-floor-rect="name" className={field} maxLength={80} value={rect.name} onChange={e=>setRect({...rect,name:e.target.value})}/></label>
     <label className="block text-sm font-medium">{t('Ancho','Width')} ({unit})<input data-floor-rect="width" inputMode="decimal" className={field} value={rect.width} onChange={e=>setRect({...rect,width:e.target.value})}/></label>
     <label className="block text-sm font-medium">{t('Largo','Depth')} ({unit})<input data-floor-rect="depth" inputMode="decimal" className={field} value={rect.depth} onChange={e=>setRect({...rect,depth:e.target.value})}/></label>
     <div className="flex items-end"><Button type="button" variant="secondary" data-floor-rect-add onClick={addRectangle}>{t('Agregar','Add')}</Button></div>
     <label className="block text-sm font-medium">X ({unit})<input data-floor-rect="x" inputMode="decimal" className={field} value={rect.x} onChange={e=>setRect({...rect,x:e.target.value})}/></label>
     <label className="block text-sm font-medium">Y ({unit})<input data-floor-rect="y" inputMode="decimal" className={field} value={rect.y} onChange={e=>setRect({...rect,y:e.target.value})}/></label>
    </div></details>
   <div className="grid min-w-0 gap-3 lg:grid-cols-2">
    <div data-floor-summary className="rounded-xl bg-[#f3f8fb] p-3 text-sm"><h3 className="font-bold">{t('Resumen','Summary')}</h3>
     {summary.rooms.length?<ul className="mt-1 space-y-1">{summary.rooms.map(r=><li key={r.id} data-floor-room-summary={r.name}><strong>{r.name}</strong>: <span data-floor-area>{areaLabel(r.area,unit,en)}</span> · {t('perímetro','perimeter')} <span data-floor-perimeter>{lengthLabel(r.perimeter,unit,en)}</span></li>)}</ul>:<p className="text-[#52627a]">{t('Sin ambientes todavía.','No rooms yet.')}</p>}
     <p className="mt-2 font-semibold" data-floor-total>{t('Área total','Total area')}: {areaLabel(summary.totalArea,unit,en)}</p>
     <p>{t('Paredes','Walls')}: {lengthLabel(summary.wallLength,unit,en)} · {t('Puertas','Doors')}: {summary.doors} · {t('Ventanas','Windows')}: {summary.windows} · {t('Objetos','Objects')}: <span data-floor-object-count>{content.objects?.length??0}</span></p>{content.level&&<p data-floor-level-summary>{t('Nivel','Level')}: {content.level.name}</p>}
     {plan?.takeoffLink&&<p data-floor-linked className="mt-2 text-xs text-[#175b42]">{t(`Áreas enviadas a Mediciones (${plan.takeoffLink.measurements.length}).`,`Areas sent to Measurements (${plan.takeoffLink.measurements.length}).`)}</p>}
    </div>
    <div className="flex flex-wrap content-start gap-2">
     <Button type="button" data-floor-save disabled={busy||!dirty} onClick={()=>void save()}>{busy?t('Guardando…','Saving…'):t('Guardar plano','Save plan')}</Button>
     <Button type="button" variant="secondary" data-floor-png disabled={busy} onClick={()=>void exportPng()}>{t('Exportar PNG','Export PNG')}</Button>
     <Button type="button" variant="secondary" data-floor-pdf disabled={busy} onClick={exportPdf}>{t('Exportar PDF','Export PDF')}</Button>
     <Button type="button" variant="secondary" data-floor-send disabled={busy||!plan||dirty||!content.rooms.length} onClick={()=>void sendToTakeoffs()}>{t('Enviar áreas a Mediciones','Send areas to Measurements')}</Button>
     {plan&&<Button type="button" variant="ghost" disabled={busy} onClick={()=>void (async()=>{if(!(await confirm({title:t('¿Archivar el plano?','Archive the plan?'),description:t('Se conserva con su historial.','It is kept with its history.'),confirmLabel:t('Archivar','Archive'),cancelLabel:t('Cancelar','Cancel')})).confirmed)return;if(await api({action:'archive',actionId:crypto.randomUUID(),id:plan.id,revision:plan.revision},t('Plano archivado.','Plan archived.')))await load('');})()}>{t('Archivar','Archive')}</Button>}
    </div>
   </div>
  </>}
  {data.plans.some(p=>p.archived)&&<details className="text-sm"><summary className="cursor-pointer font-semibold text-[#52627a]">{t('Planos archivados','Archived plans')}</summary><ul className="mt-1 space-y-1">{data.plans.filter(p=>p.archived).map(p=><li key={p.id} className="flex items-center gap-2">{p.name}<Button type="button" variant="ghost" disabled={busy} onClick={()=>void api({action:'restore',actionId:crypto.randomUUID(),id:p.id,revision:p.revision},t('Plano restaurado.','Plan restored.')).then(r=>{if(r)void load(p.id);})}>{t('Restaurar','Restore')}</Button></li>)}</ul></details>}
 </section>;
}
/** Extruded walls drawn on a 2D canvas (painter's algorithm). Drag to orbit; buttons for keyboard users. */
function FloorPlan3D({content,en}:{content:FloorPlanContent;en:boolean}){
 const ref=useRef<HTMLCanvasElement|null>(null),[angle,setAngle]=useState({yaw:0.6,pitch:0.9}),drag=useRef<{x:number;y:number;yaw:number;pitch:number}|null>(null);
 useEffect(()=>{const canvas=ref.current;if(!canvas)return;const ratio=window.devicePixelRatio||1,w=canvas.clientWidth||600,h=canvas.clientHeight||360;canvas.width=w*ratio;canvas.height=h*ratio;const ctx=canvas.getContext('2d');if(!ctx)return;ctx.setTransform(ratio,0,0,ratio,0,0);ctx.fillStyle='#f3f8fb';ctx.fillRect(0,0,w,h);
  for(const face of extrudedFaces(content,angle.yaw,angle.pitch,{w,h})){ctx.beginPath();face.points.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));ctx.closePath();
   if(face.kind==='floor'){ctx.fillStyle='rgba(0,139,181,0.16)';ctx.fill();ctx.strokeStyle='#9fc9da';ctx.stroke();continue;}
   const v=Math.round(255*face.shade);ctx.fillStyle=`rgb(${Math.round(v*0.86)},${Math.round(v*0.9)},${v})`;ctx.fill();ctx.strokeStyle='#162543';ctx.lineWidth=0.6;ctx.stroke();}
 },[content,angle]);
 const t=(es:string,english:string)=>en?english:es;
 return <div className="relative"><canvas ref={ref} data-floor-3d-canvas role="img" aria-label={t('Vista 3D de las paredes extruidas','3D view of the extruded walls')} className="block h-[360px] w-full touch-none sm:h-[460px]"
  onPointerDown={e=>{drag.current={x:e.clientX,y:e.clientY,...angle};(e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);}} onPointerMove={e=>{const d=drag.current;if(!d)return;setAngle({yaw:d.yaw+(e.clientX-d.x)*0.01,pitch:Math.max(0.15,Math.min(1.45,d.pitch+(e.clientY-d.y)*0.01))});}} onPointerUp={()=>{drag.current=null;}}/>
  <div className="absolute bottom-2 right-2 flex gap-1"><Button type="button" variant="secondary" aria-label={t('Girar a la izquierda','Rotate left')} onClick={()=>setAngle(a=>({...a,yaw:a.yaw-0.3}))}>⟲</Button><Button type="button" variant="secondary" aria-label={t('Girar a la derecha','Rotate right')} onClick={()=>setAngle(a=>({...a,yaw:a.yaw+0.3}))}>⟳</Button></div></div>;
}
