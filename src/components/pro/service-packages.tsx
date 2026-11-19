'use client';
import {useAuth} from '@/hooks/use-auth';
import {readServicePackageRecovery,writeServicePackageRecovery,clearServicePackageRecovery,verifyServicePackageCanonical,type ServicePackageAck} from '@/lib/pro/service-package-recovery';
import {StatusFilterTabs} from '@/components/dashboard/status-filter-tabs';
import {CardActionsMenu} from '@/components/dashboard/card-actions-menu';
import {ProSearchField} from './search-field';
import {useCallback,useEffect,useRef,useState} from 'react';
import {useLocale} from 'next-intl';
import {Button} from '@/components/ui/button';
import {ProModal as Modal} from '@/components/pro/modal';
import {useAppDialog} from '@/hooks/use-app-dialog';
import {closeProStep,currentProPath,PRO_PATH_CHANGED,pushProParams} from '@/lib/pro/navigation';
import {servicePackageSchema,servicePackageCatalogLine,type ServicePackage,type ServicePackageInput,type ServicePackageLine} from '@/lib/pro/service-packages';
import {proMoney} from '@/lib/pro/money';
import {CatalogSelect} from './catalog-select';
import {PagedSelect} from './paged-select';
import {registerProTraversalGuard,useProSearchParams} from './use-pro-search-params';
import {formatQuantity} from '@/lib/pro/allowances';

const field='mt-1 block min-h-11 w-full min-w-0 rounded-xl border border-[#d7e1ea] bg-white px-3 text-base font-normal';
const lineBlank=():ServicePackageLine=>({kind:'service',description:'',quantity:'1',unitPrice:'0',sku:'',unit:'Sp',cabys:''});
const blank=():ServicePackageInput=>({name:'',notes:'',lines:[lineBlank()]});
const changedEvent='ccr:pro-service-packages-changed';
const copyLines=(lines:ServicePackageLine[])=>lines.map(line=>({...line}));

export function ServicePackagePicker({onApply,disabled=false,priceLabel,previewPrice,note}:{onApply:(lines:ServicePackageLine[])=>boolean;disabled?:boolean;priceLabel?:string;previewPrice?:(line:ServicePackageLine)=>string;note?:string}){
 const en=useLocale()==='en',t=useCallback((es:string,english:string)=>en?english:es,[en]);
 const [expanded,setExpanded]=useState(false),[selected,setSelected]=useState<ServicePackage>(),[version,setVersion]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const sequence=useRef(0),lock=useRef(false),alive=useRef(true),latest=useRef({onApply,disabled});
 useEffect(()=>{latest.current={onApply,disabled};},[onApply,disabled]);
 const invalidate=useCallback(()=>{sequence.current++;},[]);
 useEffect(()=>{alive.current=true;const changed=()=>{sequence.current++;setSelected(undefined);setNotice('');setVersion(value=>value+1);};window.addEventListener(changedEvent,changed);return()=>{alive.current=false;invalidate();window.removeEventListener(changedEvent,changed);};},[invalidate]);
 async function apply(){
  if(disabled||lock.current||!selected)return;
  lock.current=true;setBusy(true);setError('');setNotice('');const request=++sequence.current;
  try{
   const response=await fetch('/api/pro/service-packages?'+new URLSearchParams({id:selected.id}),{cache:'no-store'}),body=await response.json();
   if(!response.ok)throw Error(response.status===404?'changed':'unavailable');const current=(body.items as ServicePackage[]|undefined)?.find(row=>row.id===selected.id&&!row.archived);
   if(!current||JSON.stringify(current)!==JSON.stringify(selected))throw Error('changed');
   if(!alive.current||request!==sequence.current)return;
   if(!latest.current.disabled&&latest.current.onApply(copyLines(current.lines))){setSelected(undefined);setVersion(value=>value+1);setNotice(t('Líneas agregadas. Puede ajustarlas para este cliente.','Lines added. You can adjust them for this customer.'));}
  }catch(reason){if(alive.current&&request===sequence.current){setError(reason instanceof Error&&reason.message==='changed'?t('El servicio frecuente cambió o está archivado. Selecciónelo de nuevo antes de agregarlo.','The frequent service changed or was archived. Select it again before adding it.'):t('No se pudo comprobar el servicio frecuente. Reintente antes de agregarlo.','Could not check the frequent service. Retry before adding it.'));if(reason instanceof Error&&reason.message==='changed'){setSelected(undefined);setVersion(value=>value+1);}}}
  finally{lock.current=false;if(alive.current)setBusy(false);}
 }
 return <details className="rounded-xl border border-[#d7e1ea] p-3" data-service-package-picker open={expanded}><summary className="cursor-pointer text-sm font-bold" onClick={event=>{event.preventDefault();setExpanded(value=>!value);}}>{t('Usar servicio frecuente','Use a frequent service')}</summary>{expanded&&<div className="mt-3 space-y-3">
  <p className="text-xs text-[#52627a]">{t('Agregue un servicio habitual o varias líneas juntas. Se copiarán para poder editarlas; los impuestos se revisan en este documento.','Add a regular service or several lines together. They are copied for editing; review taxes in this document.')}</p>
  {note&&<p className="text-xs text-[#52627a]">{note}</p>}
  <PagedSelect<ServicePackage> key={version} url="/api/pro/service-packages?filter=active" value={selected?.id??''} selected={selected} label={t('Servicio frecuente','Frequent service')} placeholder={t('Seleccione un servicio frecuente','Choose a frequent service')} searchLabel={t('Buscar servicios frecuentes','Search frequent services')} moreLabel={t('Ver más servicios frecuentes','Show more frequent services')} disabled={disabled||busy} optionLabel={row=>row.name} parse={body=>(body as {items:ServicePackage[]}).items} onChange={row=>{sequence.current++;setSelected(row);setError('');setNotice('');}}/>
  {selected&&<div className="space-y-2 rounded-xl bg-[#f3f8fb] p-3" data-service-package-preview><p className="break-words font-bold">{selected.name}</p>{priceLabel&&<p className="text-xs text-[#52627a]">{priceLabel}</p>}{selected.notes&&<p className="whitespace-pre-wrap break-words text-sm">{selected.notes}</p>}<ul className="space-y-2 text-sm">{selected.lines.map((line,index)=><li key={index} className="break-words">{formatQuantity(line.quantity,en)} × {line.description} · {previewPrice?previewPrice(line):proMoney(Number(line.unitPrice))}</li>)}</ul><Button type="button" disabled={disabled||busy} onClick={()=>void apply()}>{busy?t('Comprobando…','Checking…'):t('Agregar líneas','Add lines')}</Button></div>}
  {notice&&<p role="status" className="text-sm text-green-800">{notice}</p>}{error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
  <Button type="button" variant="secondary" disabled={disabled||busy} onClick={()=>pushProParams({plantillaServicios:'1'})}>{t('Administrar servicios frecuentes','Manage frequent services')}</Button>
 </div>}</details>;
}

export function ServicePackageManager(){const {user}=useAuth();return user?<AccountServicePackageManager key={user.id} accountId={user.id}/>:null;}
function AccountServicePackageManager({accountId}:{accountId:string}){
 const en=useLocale()==='en',t=useCallback((es:string,english:string)=>en?english:es,[en]),params=useProSearchParams(),open=params.get('plantillaServicios')==='1';
 const {confirm,dialogNode}=useAppDialog();
 const [recoveryTick,setRecoveryTick]=useState(0);
 const [recoveryReady,setRecoveryReady]=useState(false),[recoveryBlocked,setRecoveryBlocked]=useState(false);
 const confirmedAttempt=useRef<ServicePackageAck|null>(null);
 const [filter,setFilter]=useState<'active'|'archived'>('active'),[search,setSearch]=useState(''),[rows,setRows]=useState<ServicePackage[]>([]),[cursor,setCursor]=useState<string|null>(null),[revision,setRevision]=useState<number|null>(null),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[uncertain,setUncertain]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [draft,setDraft]=useState<ServicePackageInput>(blank),[editing,setEditing]=useState<string|null>(null),[formOpen,setFormOpen]=useState(false),[dirty,setDirty]=useState(false),[catalogVersion,setCatalogVersion]=useState(0);
 const sequence=useRef(0),revisionRef=useRef<number|null>(null),pageBusy=useRef(false),lock=useRef(false),alive=useRef(true),allowExit=useRef(false),pending=useRef<{signature:string;requestId:string;id:string;revision:number;action:'save'|'archive'|'restore';targetId?:string;body:string}|null>(null);
 const invalidate=useCallback(()=>{sequence.current++;pageBusy.current=false;},[]);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;invalidate();};},[invalidate]);
 useEffect(()=>{if(open)allowExit.current=false;},[open]);
 useEffect(()=>{if(!open)return;const timer=setTimeout(()=>{
  if(lock.current)return;
  setRecoveryReady(false);setRecoveryBlocked(false);
  try{const receipt=readServicePackageRecovery(accountId);if(receipt){
   const input=JSON.parse(receipt.body);confirmedAttempt.current=receipt.ack;
   pending.current={signature:'recovered',requestId:input.requestId,id:input.id,revision:input.revision,action:input.action,targetId:receipt.editing??undefined,body:receipt.body};
   setUncertain(true);if(input.action==='save'){setDraft(input.package);setEditing(receipt.editing);setFormOpen(true);setDirty(true);}
   setError(t('Hay un guardado pendiente de comprobar. Sus datos se conservan.','A save needs to be checked. Your details are preserved.'));
  }setRecoveryReady(true);}catch{setRecoveryBlocked(true);setError(t('No se pudo leer el intento guardado. No se enviarán cambios; sus datos se conservan.','The saved attempt could not be read. No changes will be sent; your data is preserved.'));}
 },0);return()=>clearTimeout(timer);},[open,accountId,t,recoveryTick]);
 const load=useCallback(async(after='')=>{
  if(after&&pageBusy.current)return;
  pageBusy.current=true;const request=++sequence.current;setLoading(true);if(!pending.current&&!recoveryBlocked)setError('');
  try{
   const response=await fetch('/api/pro/service-packages?'+new URLSearchParams({filter,q:search,after}),{cache:'no-store'}),body=await response.json();
   if(!response.ok)throw Error();if(request!==sequence.current)return;
   if(after&&revisionRef.current!==body.revision){setError(t('Los servicios frecuentes cambiaron. Actualice antes de continuar.','Frequent services changed. Refresh before continuing.'));setRevision(null);setCursor(null);return;}
   revisionRef.current=body.revision;setRevision(body.revision);setRows(old=>after?[...old,...body.items.filter((row:ServicePackage)=>!old.some(item=>item.id===row.id))]:body.items);setCursor(body.nextCursor);
  }catch{if(request===sequence.current){setError(t('No se pudieron cargar los servicios frecuentes.','Could not load frequent services.'));setRevision(null);}}
  finally{if(request===sequence.current){setLoading(false);pageBusy.current=false;}}
 },[filter,search,t,recoveryBlocked]);
 useEffect(()=>{if(!open)return;const timer=setTimeout(()=>void load(),150);return()=>{clearTimeout(timer);invalidate();};},[open,load,invalidate]);
 const discard=useCallback(async()=>!dirty||(await confirm({title:t('¿Salir sin guardar?','Leave without saving?'),description:t('Los cambios de este servicio frecuente no se han guardado.','Changes to this frequent service have not been saved.'),confirmLabel:t('Descartar cambios','Discard changes'),cancelLabel:t('Seguir editando','Keep editing')})).confirmed,[dirty,confirm,t]);
 useEffect(()=>{
  if(!open||(!dirty&&!saving&&!uncertain))return;
  const path=currentProPath(),state={...window.history.state};let asking=false;
  function unload(event:BeforeUnloadEvent){if(!allowExit.current){event.preventDefault();event.returnValue='';}}
  function back(event:PopStateEvent){if(allowExit.current)return false;event.stopImmediatePropagation();window.history.pushState(state,'',path);window.dispatchEvent(new Event(PRO_PATH_CHANGED));if(saving||uncertain||lock.current||asking)return true;asking=true;void discard().then(answer=>{asking=false;if(answer){allowExit.current=true;setDirty(false);setFormOpen(false);setDraft(blank());setEditing(null);window.history.back();}});return true;}
  const unregister=registerProTraversalGuard(back);window.addEventListener('beforeunload',unload);return()=>{unregister();window.removeEventListener('beforeunload',unload);};
 },[open,dirty,saving,uncertain,discard]);
 function change(patch:Partial<ServicePackageInput>){setDraft(old=>({...old,...patch}));setDirty(true);setError('');setNotice('');pending.current=null;}
 function changeLine(index:number,patch:Partial<ServicePackageLine>){change({lines:draft.lines.map((line,i)=>i===index?{...line,...patch}:line)});}
 async function close(){if(saving||uncertain||recoveryBlocked||lock.current||!await discard())return;allowExit.current=true;setDirty(false);setFormOpen(false);setDraft(blank());setEditing(null);pending.current=null;closeProStep('plantillaServicios');}
 async function edit(row?:ServicePackage){if(uncertain||!await discard())return;setDraft(row?{name:row.name,notes:row.notes,lines:copyLines(row.lines)}:blank());setEditing(row?.id??null);setDirty(false);setFormOpen(true);setCatalogVersion(value=>value+1);setError('');setNotice('');pending.current=null;}
 async function cancel(){if(uncertain||!await discard())return;setFormOpen(false);setDirty(false);setDraft(blank());setEditing(null);pending.current=null;setError('');}
 function resetPage(){invalidate();setRevision(null);revisionRef.current=null;setCursor(null);setRows([]);setLoading(true);}
 async function verifyConfirmed(){
  if(!alive.current)return;
  const attempt=pending.current;if(!attempt)throw Error('uncertain');
  let verified=false,newer=false;
  for(const candidate of ['active','archived']){
   const response=await fetch('/api/pro/service-packages?'+new URLSearchParams({id:attempt.id,filter:candidate}),{cache:'no-store'});
   if(!alive.current)return;
   if(response.status===404)continue;if(!response.ok)throw Error('uncertain');
   newer=verifyServicePackageCanonical({version:2,body:attempt.body,editing:attempt.action==='save'?(attempt.targetId??null):attempt.id,ack:confirmedAttempt.current},await response.json());verified=true;break;
  }
  if(!verified)throw Error('uncertain');
  if(!alive.current)return;
  clearServicePackageRecovery(accountId,attempt.body);pending.current=null;confirmedAttempt.current=null;setUncertain(false);setDirty(false);setFormOpen(false);setDraft(blank());setEditing(null);
  window.dispatchEvent(new Event(changedEvent));await load();
  setNotice(newer?t('Guardado comprobado. Se muestran los datos actuales.','Save verified. Current details are shown.'):attempt.action==='save'?t('Servicio frecuente guardado. Los documentos anteriores conservan sus líneas.','Frequent service saved. Previous documents keep their own lines.'):t('Disponibilidad actualizada. Los documentos anteriores se conservan.','Availability updated. Previous documents are preserved.'));
 }
 async function mutate(action:'save'|'archive'|'restore',targetId?:string){
  if(lock.current||!recoveryReady||recoveryBlocked||(!uncertain&&revision===null))return;
  const recovering=!!pending.current&&uncertain;
  let value:ServicePackageInput|undefined;
  if(!uncertain&&action==='save'){const result=servicePackageSchema.safeParse(draft);if(!result.success){setError(en?'Review the name, descriptions, quantities and prices. Use positive quantities with up to two decimals and prices in whole colones.':result.error.issues[0].message);return;}value=result.data;}
  const signature=JSON.stringify({action,targetId,value});
  if(!uncertain&&pending.current?.signature!==signature){const requestId=crypto.randomUUID(),id=targetId??crypto.randomUUID();pending.current={signature,requestId,id,revision:revision!,action,targetId,body:JSON.stringify({action,id,requestId,revision,...(value?{package:value}:{})})};}
  if(!pending.current)return;
  lock.current=true;setSaving(true);setError('');setNotice('');
  try{
   if(confirmedAttempt.current){await verifyConfirmed();return;}
   try{writeServicePackageRecovery(accountId,{version:2,body:pending.current.body,editing:pending.current.action==='save'?(pending.current.targetId??null):pending.current.id,ack:null});}catch{setRecoveryBlocked(true);throw Error('storage');}
   const response=await fetch('/api/pro/service-packages',{method:'POST',headers:{'Content-Type':'application/json'},body:pending.current.body});
   if(!response.ok){if(!recovering&&(response.status===400||response.status===409)){clearServicePackageRecovery(accountId,pending.current!.body);pending.current=null;setUncertain(false);if(response.status===409){setRevision(null);setCursor(null);throw Error('conflict');}throw Error('rejected');}throw Error('uncertain');}
   const result=await response.json();if(result.id!==pending.current.id||!Number.isSafeInteger(result.revision)||result.revision!==pending.current.revision+1)throw Error('uncertain');
   confirmedAttempt.current={id:result.id,revision:result.revision};
   writeServicePackageRecovery(accountId,{version:2,body:pending.current.body,editing:pending.current.action==='save'?(pending.current.targetId??null):pending.current.id,ack:confirmedAttempt.current});
   await verifyConfirmed();
  }catch(reason){if(alive.current){const definitive=reason instanceof Error&&['conflict','rejected'].includes(reason.message);setUncertain(!definitive);setError(reason instanceof Error&&reason.message==='storage'?(recovering||confirmedAttempt.current?t('No se pudo conservar o verificar el intento en este dispositivo. Compruebe el guardado antes de continuar.','The attempt could not be saved or verified on this device. Check the saved result before continuing.'):t('No se pudo conservar un intento seguro. No se enviaron cambios.','A safe retry record could not be kept. No changes were sent.')):reason instanceof Error&&reason.message==='conflict'?t('Los servicios frecuentes cambiaron. Actualice y revise antes de guardar; sus cambios siguen aquí.','Frequent services changed. Refresh and review before saving; your edits are still here.'):definitive?t('No se guardó. Revise los datos y actualice antes de continuar.','Not saved. Review the data and refresh before continuing.'):t('No pudimos confirmar el guardado. Reintente el mismo guardado antes de editar o salir para evitar duplicados.','We could not confirm the save. Retry this save before editing or leaving to avoid duplicates.'));}}
  finally{lock.current=false;if(alive.current)setSaving(false);}
 }
 if(!open)return null;
 return <><Modal title={t('Servicios frecuentes','Frequent services')} ariaLabel={t('Servicios frecuentes','Frequent services')} mobilePresentation="fullscreen" size="lg" closeLabel={t('Cerrar','Close')} onClose={()=>void close()} footer={formOpen?<><Button type="button" variant="secondary" disabled={!recoveryReady||recoveryBlocked||saving||uncertain} onClick={()=>void cancel()}>{t('Cancelar','Cancel')}</Button><Button type="submit" form="pro-service-package-form" disabled={!recoveryReady||recoveryBlocked||saving||uncertain||loading||revision===null}>{saving?t('Guardando…','Saving…'):t('Guardar','Save')}</Button></>:undefined}><div className="space-y-4" data-service-package-manager>
  <p className="text-sm text-[#52627a]">{t('Guarde servicios y materiales que suele cotizar juntos. Podrá ajustar cantidades y precios para cada cliente.','Save services and materials you often quote together. Adjust quantities and prices for each customer.')}</p>
  {!formOpen&&<Button type="button" size="crear" className="w-full" disabled={!recoveryReady||recoveryBlocked||saving||uncertain||loading||revision===null} onClick={()=>void edit()}>{t('Nuevo servicio frecuente','New frequent service')}</Button>}
  {formOpen?<form id="pro-service-package-form" className="space-y-4 rounded-xl border border-[#d7e1ea] p-3" onSubmit={event=>{event.preventDefault();void mutate('save',editing??undefined);}}><fieldset disabled={!recoveryReady||recoveryBlocked||saving||uncertain} className="space-y-4">
   <h3 className="font-bold">{editing?t('Editar servicio frecuente','Edit frequent service'):t('Nuevo servicio frecuente','New frequent service')}</h3>
   <label className="block text-sm font-semibold">{t('Nombre del servicio frecuente','Frequent service name')}<input className={field} aria-label={t('Nombre del servicio frecuente','Frequent service name')} value={draft.name} maxLength={80} required onChange={event=>change({name:event.target.value})}/></label>
   <details className="rounded-xl bg-[#f3f8fb] p-3"><summary className="cursor-pointer text-sm font-semibold">{t('Agregar desde productos y servicios','Add from products and services')}</summary><div className="mt-3"><CatalogSelect key={catalogVersion} kind="products" itemType="all" value="" label={t('Producto o servicio guardado','Saved product or service')} disabled={draft.lines.length>=20} onChange={item=>{if(!item)return;try{const line=servicePackageCatalogLine(item),replace=draft.lines.length===1&&!draft.lines[0].description&&draft.lines[0].quantity==='1'&&draft.lines[0].unitPrice==='0'&&draft.lines[0].kind==='service'&&!draft.lines[0].sku&&!draft.lines[0].cabys&&draft.lines[0].unit==='Sp';change({lines:replace?[line]:[...draft.lines,line]});setCatalogVersion(value=>value+1);if(!/^\d+$/.test(line.unitPrice))setNotice(t('El catálogo usa un precio con decimales. Revíselo y escriba el precio en colones enteros antes de guardar este servicio frecuente.','The catalog price has decimals. Review it and enter a whole-colón price before saving this frequent service.'));}catch{setError(t('Este registro no cabe en el servicio frecuente. Agregue una línea manual y revise su descripción, cantidad y precio.','This record does not fit the frequent service. Add a manual line and review its description, quantity and price.'));}}}/></div></details>
   <p className="text-xs text-[#52627a]">{t('Precios en colones enteros antes de impuestos; cantidades con hasta dos decimales. Guardar o usar un servicio frecuente no descuenta existencias.','Whole CRC prices before taxes; quantities support up to two decimals. Saving or using a frequent service does not reduce stock.')}</p>
   {draft.lines.map((line,index)=><div key={index} className="space-y-3 rounded-xl border border-[#e5e7eb] p-3" data-service-package-line>
    <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="font-bold">{t('Línea ','Line ')}{index+1}</h4><Button type="button" variant="secondary" disabled={draft.lines.length===1} aria-label={t('Quitar línea ','Remove line ')+(index+1)} onClick={()=>change({lines:draft.lines.filter((_,i)=>i!==index)})}>{t('Quitar','Remove')}</Button></div>
    <label className="block text-sm font-semibold">{t('Descripción','Description')}<input className={field} aria-label={t('Descripción de línea ','Line description ')+(index+1)} value={line.description} maxLength={140} required onChange={event=>changeLine(index,{description:event.target.value})}/></label>
    <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2"><label className="block min-w-0 text-sm font-semibold">{t('Cantidad','Quantity')}<input className={field} aria-label={t('Cantidad de línea ','Line quantity ')+(index+1)} inputMode="decimal" value={line.quantity} maxLength={16} required onChange={event=>changeLine(index,{quantity:event.target.value})}/></label><label className="block min-w-0 text-sm font-semibold">{t('Precio antes de impuestos (₡)','Price before taxes (CRC)')}<input className={field} aria-label={t('Precio de línea ','Line price ')+(index+1)} inputMode="decimal" value={line.unitPrice} maxLength={16} required onChange={event=>changeLine(index,{unitPrice:event.target.value})}/></label></div>
    <details><summary className="cursor-pointer text-sm text-[#52627a]">{t('Más detalles (opcional)','More details (optional)')}</summary><div className="mt-3 space-y-3"><label className="block text-sm font-semibold">{t('Tipo de línea','Line type')}<select className={field} aria-label={t('Tipo de línea ','Line type ')+(index+1)} value={line.kind} onChange={event=>changeLine(index,{kind:event.target.value as ServicePackageLine['kind']})}><option value="service">{t('Servicio','Service')}</option><option value="product">{t('Producto','Product')}</option></select></label><label className="block text-sm font-semibold">{t('Unidad','Unit')}<input className={field} aria-label={t('Unidad de línea ','Line unit ')+(index+1)} value={line.unit} maxLength={30} onChange={event=>changeLine(index,{unit:event.target.value})}/></label><label className="block text-sm font-semibold">SKU<input className={field} aria-label={'SKU '+(index+1)} value={line.sku} maxLength={160} onChange={event=>changeLine(index,{sku:event.target.value})}/></label></div></details>
   </div>)}
   <Button type="button" variant="secondary" disabled={draft.lines.length>=20} onClick={()=>change({lines:[...draft.lines,lineBlank()]})}>{t('Agregar línea manual','Add manual line')}</Button>
   <details><summary className="cursor-pointer text-sm text-[#52627a]">{t('Nota para recordar el alcance (opcional)','Scope reminder (optional)')}</summary><label className="mt-2 block text-sm font-semibold">{t('Nota del servicio frecuente','Frequent service note')}<textarea className={field+' py-2'} aria-label={t('Nota del servicio frecuente','Frequent service note')} value={draft.notes} maxLength={1000} onChange={event=>change({notes:event.target.value})}/></label></details>
  </fieldset></form>:<>
   <fieldset disabled={!recoveryReady||recoveryBlocked||saving||uncertain} className="min-w-0 space-y-4">
    <div role="group" aria-label={t('Mostrar servicios frecuentes','Show frequent services')}><StatusFilterTabs tabs={[{id:'active'},{id:'archived'}]} value={filter} onChange={value=>{resetPage();setFilter(value as 'active'|'archived');}} labelFor={value=>value==='archived'?t('Archivados','Archived'):t('Activos','Active')} variant="pills" limpiable={false}/></div>
    <ProSearchField label={t('Buscar servicios frecuentes','Search frequent services')} value={search} onChange={value=>{resetPage();setSearch(value);}}/>
   </fieldset>
   {rows.map(row=><article key={row.id} className="space-y-2 rounded-xl border border-[#e5e7eb] p-4"><h3 className="break-words font-bold">{row.name}</h3><p className="text-sm text-[#52627a]">{row.lines.length} {row.lines.length===1?t('línea','line'):t('líneas','lines')}</p><p className="break-words text-sm">{row.lines.map(line=>line.description).join(' · ')}</p><div className="flex flex-wrap gap-2"><Button type="button" variant="secondary" disabled={!recoveryReady||recoveryBlocked||loading||saving||uncertain||revision===null} onClick={()=>void edit(row)}>{t('Editar servicio frecuente','Edit frequent service')}</Button><CardActionsMenu keyboardNavigation itemClassName="min-h-11" label={t('Acciones del servicio frecuente','Frequent service actions')} triggerClassName="border-0 hover:border-transparent" actions={!recoveryReady||recoveryBlocked||loading||saving||uncertain||revision===null?[]:[{label:row.archived?t('Restaurar','Restore'):t('Archivar','Archive'),onClick:()=>void mutate(row.archived?'restore':'archive',row.id)}]}/></div></article>)}
   {!rows.length&&!error&&<p role="status">{loading?t('Cargando servicios frecuentes…','Loading frequent services…'):t('No hay servicios frecuentes en esta vista.','No frequent services in this view.')}</p>}
   {cursor&&<Button type="button" variant="secondary" disabled={loading||saving||uncertain} onClick={()=>void load(cursor)}>{t('Ver más servicios frecuentes','Show more frequent services')}</Button>}
  </>}
  {notice&&<p role="status" className="text-sm text-green-800">{notice}</p>}{error&&<div role="alert" className="space-y-2 text-sm text-red-700"><p>{error}</p>{uncertain&&!recoveryBlocked?<Button type="button" disabled={saving} onClick={()=>{const request=pending.current;if(request)void mutate(request.action,request.targetId);}}>{t('Reintentar guardado','Retry save')}</Button>:<Button type="button" variant="secondary" disabled={loading||saving} onClick={()=>{if(recoveryBlocked)setRecoveryTick(value=>value+1);else void load();}}>{t('Actualizar servicios frecuentes','Refresh frequent services')}</Button>}</div>}
 </div></Modal>{dialogNode}</>;
}
