'use client';
import {ProFileInput} from './pro-file-input';
/* eslint-disable @next/next/no-img-element -- Private report photos use authenticated no-store binary endpoints. */
import {useCallback,useEffect,useRef,useState} from 'react';
import {createDeliveryAcknowledgeWrite,readDeliveryAcknowledgeWrite,saveDeliveryAcknowledgeWrite,mergeDeliveryAcknowledgeWrite,continueDeliveryAcknowledgeWrite,clearDeliveryAcknowledgeWrite,DeliveryAcknowledgeFailure,type DeliveryAcknowledgeWrite} from '@/lib/pro/delivery-acknowledge-recovery';
import {deliveryPhotoIndexedDB} from '@/lib/pro/delivery-photo-idb';
import {createDeliveryPhotoWrite,continueDeliveryPhotoWrite,mergeDeliveryPhotoWrite,DeliveryPhotoFailure,DELIVERY_PHOTO_LIMIT,type DeliveryPhotoWrite} from '@/lib/pro/delivery-photo-recovery';
import {useAuth} from '@/hooks/use-auth';
import {createDeliveryWrite,readDeliveryWrite,saveDeliveryWrite,mergeDeliveryWrite,continueDeliveryWrite,clearDeliveryWrite,deliveryWriteInputSchema,DeliveryWriteFailure,type DeliveryWrite} from '@/lib/pro/delivery-write-recovery';
import {useLocale} from 'next-intl';
import {useProServiceRefresh} from './use-pro-child-guard';
import {Button} from '@/components/ui/button';
import {useAppDialog} from '@/hooks/use-app-dialog';
import {deliveryContentSchema,emptyDelivery,type DeliveryContent,type DeliveryMutation,type DeliveryVersion,type DeliveryView} from '@/lib/pro/work-delivery';
const api='/api/pro/work-delivery',field='mt-1 block min-h-11 w-full min-w-0 rounded-xl border border-[#d7e1ea] bg-white px-3 py-2 text-base';
export type WorkDeliveryState={dirty:boolean;busy:boolean};
type StateCallback={onStateChange?:(state:WorkDeliveryState)=>void};
export function WorkDelivery({workId,onStateChange}:{workId:string}&StateCallback){return <DeliveryPanel workId={workId} onStateChange={onStateChange}/>;}
export function AppointmentDelivery({requestId,onStateChange}:{requestId:string}&StateCallback){return <DeliveryPanel requestId={requestId} onStateChange={onStateChange}/>;}
function DeliveryPanel(props:{workId?:string;requestId?:string}&StateCallback){
 const {user,loading}=useAuth();
 if(loading||!user)return null;
 return <DeliverySession key={[user.id,props.workId,props.requestId].join(':')} {...props} accountId={user.id}/>;
}
function DeliverySession({workId,requestId,onStateChange,accountId}:{workId?:string;requestId?:string;accountId:string}&StateCallback){
 const english=useLocale()==='en',t=(es:string,en:string)=>english?en:es;
 const [view,setView]=useState<DeliveryView|null>(null),[content,setContent]=useState<DeliveryContent>(emptyDelivery),[internalNote,setInternalNote]=useState(''),[dirty,setDirty]=useState(false),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[preview,setPreview]=useState(false),[uncertain,setUncertain]=useState(false),[pendingRead,setPendingRead]=useState(false),[photoReading,setPhotoReading]=useState(false);
 const [editorOpen,setEditorOpen]=useState(false),[writeRecovery,setWriteRecovery]=useState(false),[photoRecovery,setPhotoRecovery]=useState(false),[ackRecovery,setAckRecovery]=useState(false);
 const ackAttempt=useRef<DeliveryAcknowledgeWrite|null>(null);
 const photoAttempt=useRef<DeliveryPhotoWrite|null>(null);
 const writeAttempt=useRef<DeliveryWrite|null>(null),active=useRef(true);
 useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
 const restoreAcknowledgement=useCallback(()=>{
  if(!requestId)return false;
  try{const tab=readDeliveryAcknowledgeWrite(sessionStorage,accountId,requestId),global=readDeliveryAcknowledgeWrite(localStorage,accountId,requestId);let saved=tab?(global?.body===tab.body?mergeDeliveryAcknowledgeWrite(tab,global):tab):global;
   if(ackAttempt.current&&(!saved||saved.body===ackAttempt.current.body))saved=mergeDeliveryAcknowledgeWrite(ackAttempt.current,saved);
   if(!saved)return false;
   ackAttempt.current=saved;setAckRecovery(true);setView(old=>old??{side:'client',workId:saved.workId,canPublish:false,revision:0,draft:null,photos:[],versions:[{...saved.snapshot,acknowledgedAt:null}],nextCursor:null});return true;
  }catch(error){setAckRecovery(true);throw error;}
 },[accountId,requestId]);
 const restorePhoto=useCallback(async(target:string)=>{
  try{const stored=await deliveryPhotoIndexedDB(indexedDB).read({accountId,workId:target});if(!active.current)return false;
   const memory=photoAttempt.current;
   const current=memory?.workId===target?await mergeDeliveryPhotoWrite(memory,stored):stored;
   if(!active.current)return false;
   if(current){photoAttempt.current=current;setPhotoRecovery(true);setEditorOpen(true);return true;}
   return false;
  }catch(error){if(active.current)setPhotoRecovery(true);throw error;}
 },[accountId]);
 const restoreWrite=useCallback((target:string)=>{
  try{
  const tab=readDeliveryWrite(sessionStorage,accountId,target),global=readDeliveryWrite(localStorage,accountId,target);
  let saved=tab?(global?.body===tab.body?mergeDeliveryWrite(tab,global):tab):global;
  if(writeAttempt.current?.workId===target&&(!saved||saved.body===writeAttempt.current.body))saved=mergeDeliveryWrite(writeAttempt.current,saved);
  if(!saved)return false;
  const input=deliveryWriteInputSchema.parse(JSON.parse(saved.body));writeAttempt.current=saved;setWriteRecovery(true);setEditorOpen(true);
  const recovered=input.action==='save'?input.content:saved.baseline.content,note=input.action==='save'?input.internalNote:saved.baseline.internalNote;
  setContent(recovered);setInternalNote(note);setView(old=>old??{side:'provider',workId:target,canPublish:false,revision:saved.baseline.revision,draft:recovered,internalNote:note,photos:[],versions:[],nextCursor:null});
  return true;
  }catch(error){setWriteRecovery(true);throw error;}
 },[accountId]);
 const pending=useRef<DeliveryMutation|null>(null),busy=useRef(false),sequence=useRef(0),{confirm,dialogNode}=useAppDialog();
 const draftKey=useCallback((target:string)=>'ccr:pro:delivery-draft:'+accountId+':'+encodeURIComponent(target),[accountId]);
 useEffect(()=>{if(!view||view.side!=='provider'||!dirty||writeRecovery||photoRecovery)return;let alive=true;queueMicrotask(()=>{if(!alive)return;try{sessionStorage.setItem(draftKey(view.workId),JSON.stringify({content,internalNote}));}catch{setError(english?'Could not retain your draft on this device.':'No se pudo conservar el borrador en este dispositivo.');}});return()=>{alive=false;};},[view,content,internalNote,dirty,writeRecovery,photoRecovery,draftKey,english]);
 const query=useCallback((after?:number)=>api+'?'+new URLSearchParams({...workId?{workId}:{requestId:requestId!},...after?{after:String(after)}:{}}),[workId,requestId]);
 const load=useCallback(async(after?:number)=>{const current=++sequence.current;setLoading(true);try{if(!after&&restoreAcknowledgement())return true;if(!after&&workId)await restorePhoto(workId);if(!after&&workId&&restoreWrite(workId))return true;const response=await fetch(query(after),{cache:'no-store',headers:{'X-Pro-Expected-Actor':accountId}}),body=await response.json() as DeliveryView;if(!response.ok||!Array.isArray(body.versions))throw Error();if(sequence.current!==current||!active.current)return false;if(!after&&body.side==='provider'){if(!workId)await restorePhoto(body.workId);if(restoreWrite(body.workId))return true;}setView(old=>({...body,versions:after&&old?[...old.versions,...body.versions.filter(v=>!old.versions.some(p=>p.version===v.version))]:body.versions}));if(!after){let restored=false;if(body.side==='provider'){const raw=sessionStorage.getItem(draftKey(body.workId));if(raw){const local=JSON.parse(raw);const localContent=deliveryContentSchema.parse(local.content);if(typeof local.internalNote!=='string'||local.internalNote.length>2000)throw Error();setContent(localContent);setInternalNote(local.internalNote);setDirty(true);restored=true;}}if(!restored){setContent(body.draft??emptyDelivery());setInternalNote(body.internalNote??'');setDirty(false);}setPendingRead(false);}return true;}catch{if(sequence.current===current){setError(english?'Could not load the report. Retry.':'No se pudo cargar el informe. Reintente.');}return false;}finally{if(sequence.current===current)setLoading(false);}},[query,english,restoreWrite,restorePhoto,restoreAcknowledgement,workId,draftKey,accountId]);
 const invalidate=useCallback(()=>{sequence.current++;},[]);
 useEffect(()=>{const timer=setTimeout(()=>void load(),0);return()=>{clearTimeout(timer);invalidate();};},[load,invalidate]);
 useEffect(()=>{if(!dirty&&!uncertain&&!saving&&!photoReading&&!writeRecovery&&!photoRecovery&&!ackRecovery)return;const guard=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue='';};window.addEventListener('beforeunload',guard);return()=>window.removeEventListener('beforeunload',guard);},[dirty,uncertain,saving,photoReading,writeRecovery,photoRecovery,ackRecovery]);
 const owner=view?.side==='provider',blocked=saving||uncertain||pendingRead||photoReading||writeRecovery||photoRecovery||ackRecovery,editorVisible=editorOpen||dirty||blocked;
 const hasDraft=!!(view?.draft&&(view.draft.summary||view.draft.checklist.length||view.draft.recommendations||view.draft.photoIds.length)||view?.internalNote||view?.photos.length);
 useProServiceRefresh(load,dirty||blocked);
 useEffect(()=>{onStateChange?.({dirty,busy:blocked});},[dirty,blocked,onStateChange]);
 useEffect(()=>()=>onStateChange?.({dirty:false,busy:false}),[onStateChange]);
 function update(value:Partial<DeliveryContent>){setContent(old=>({...old,...value}));setDirty(true);setError('');setNotice('');}
 async function writeReport(input?:Extract<DeliveryMutation,{action:'save'|'publish'}>){
  if(busy.current||!active.current||ackRecovery||photoRecovery&&!writeAttempt.current)return;
  busy.current=true;setSaving(true);setError('');setNotice('');let started=false;const fresh=!writeAttempt.current;
  try{
   let attempt=writeAttempt.current;
   if(!attempt&&!input){const target=workId??view?.workId;if(target&&restoreWrite(target))attempt=writeAttempt.current;}
   if(!attempt){if(!input||!view)throw Error();if(input.action==='save'){sessionStorage.setItem(draftKey(input.workId),JSON.stringify({content:input.content,internalNote:input.internalNote}));}if(restoreWrite(input.workId))return;attempt=createDeliveryWrite(accountId,input,view);const marker=JSON.stringify({body:attempt.body,rawDraft:input.action==='save'?sessionStorage.getItem(draftKey(input.workId)):null});sessionStorage.setItem(draftKey(input.workId)+':owner',marker);if(sessionStorage.getItem(draftKey(input.workId)+':owner')!==marker)throw Error();}
   const result=await continueDeliveryWrite({store:localStorage,attempt,request:(url,init)=>{if(init?.method==='POST')started=true;return fetch(url,init);},currentAccount:()=>active.current?accountId:undefined,currentWork:()=>active.current?attempt.workId:undefined,onCheckpoint:value=>{writeAttempt.current=value;if(active.current)setWriteRecovery(true);saveDeliveryWrite(sessionStorage,value);}});
   if(!active.current)return;
   if(result.status==='rejected'){clearDeliveryWrite(sessionStorage,result.attempt);writeAttempt.current=null;setWriteRecovery(false);setError(t('No se guardó el cambio. Revise el informe y reintente.','The change was not saved. Review the report and retry.'));return;}
   setView(result.view);setContent(result.view.draft??emptyDelivery());setInternalNote(result.view.internalNote??'');
   const ownKey=draftKey(result.attempt.workId),ownerRaw=sessionStorage.getItem(ownKey+':owner');if(ownerRaw){const marker=JSON.parse(ownerRaw);if(marker.body===result.attempt.body){if(typeof marker.rawDraft==='string'&&sessionStorage.getItem(ownKey)===marker.rawDraft)sessionStorage.removeItem(ownKey);sessionStorage.removeItem(ownKey+':owner');}}
   clearDeliveryWrite(localStorage,result.attempt);clearDeliveryWrite(sessionStorage,result.attempt);writeAttempt.current=null;setWriteRecovery(false);setDirty(false);setPendingRead(false);setUncertain(false);
   setNotice(result.newer?t('Guardado comprobado. Se muestra una versión más reciente.','Save confirmed. A more recent version is shown.'):result.publishedVersion!==null?t('Constancia compartida en la cuenta del cliente. No se envió ningún mensaje.','Report shared in the customer account. No message was sent.'):t('Cambio guardado.','Change saved.'));
  }catch(cause){
   if(!active.current)return;
   if(fresh&&!started&&cause instanceof DeliveryWriteFailure&&cause.kind==='storage'&&cause.attempt.phase!=='confirmed'){
    try{const other=readDeliveryWrite(localStorage,accountId,cause.attempt.workId);if(other&&other.body!==cause.attempt.body){clearDeliveryWrite(sessionStorage,cause.attempt);writeAttempt.current=null;restoreWrite(other.workId);}}catch{/* Preserve the attempt when storage cannot be verified. */}
   }
   if(writeAttempt.current)setWriteRecovery(true);setError(t('Compruebe el guardado antes de continuar.','Check the saved result before continuing.'));
  }finally{busy.current=false;if(active.current)setSaving(false);}
 }
 async function acknowledge(input?:Extract<DeliveryMutation,{action:'acknowledge'}>){
  if(busy.current||!active.current||writeRecovery||photoRecovery)return;
  busy.current=true;setSaving(true);setError('');setNotice('');let started=false;const fresh=!ackAttempt.current;
  try{
   let attempt=ackAttempt.current;
   if(!attempt){if(restoreAcknowledgement()){attempt=ackAttempt.current;if(input)return;}else{if(!input||!view)throw Error();attempt=createDeliveryAcknowledgeWrite(accountId,input,view);}}
   if(!attempt)throw Error();
   const result=await continueDeliveryAcknowledgeWrite({store:localStorage,attempt,request:(url,init)=>{if(init?.method==='POST')started=true;return fetch(url,init);},currentAccount:()=>active.current?accountId:undefined,currentRequest:()=>active.current?requestId:undefined,currentWork:()=>active.current?attempt.workId:undefined,onCheckpoint:value=>{ackAttempt.current=value;if(active.current)setAckRecovery(true);saveDeliveryAcknowledgeWrite(sessionStorage,value);}});
   if(!active.current)return;
   if(result.status==='rejected'){clearDeliveryAcknowledgeWrite(sessionStorage,result.attempt);ackAttempt.current=null;setAckRecovery(false);setError(t('No se confirmó el recibido. Revise la constancia y reintente.','Receipt was not confirmed. Review the report and retry.'));return;}
   setView(result.view);clearDeliveryAcknowledgeWrite(localStorage,result.attempt);clearDeliveryAcknowledgeWrite(sessionStorage,result.attempt);ackAttempt.current=null;setAckRecovery(false);setNotice(t('Recibido registrado.','Receipt recorded.'));
  }catch(cause){
   if(!active.current)return;
   if(fresh&&!started&&cause instanceof DeliveryAcknowledgeFailure&&cause.kind==='storage'&&cause.attempt.phase!=='confirmed'&&requestId){try{const other=readDeliveryAcknowledgeWrite(localStorage,accountId,requestId);if(other&&other.body!==cause.attempt.body){clearDeliveryAcknowledgeWrite(sessionStorage,cause.attempt);ackAttempt.current=null;restoreAcknowledgement();}}catch{/* Keep the original receipt attempt while storage is unavailable. */}}
   if(ackAttempt.current)setAckRecovery(true);setError(t('Compruebe el recibido antes de continuar.','Check the receipt before continuing.'));
  }finally{busy.current=false;if(active.current)setSaving(false);}
 }
 async function mutate(input:DeliveryMutation){if(input.action==='acknowledge'){await acknowledge(input);return;}if(input.action==='save'||input.action==='publish'){await writeReport(input);return;}if(busy.current||writeRecovery||photoRecovery||ackRecovery)return;busy.current=true;pending.current=input;setSaving(true);setError('');setNotice('');try{const response=await fetch(api,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});if(response.status>=500)throw Error();const body=await response.json();if(!response.ok){pending.current=null;setUncertain(false);setError(response.status===409?t('El informe cambió. Actualice antes de guardar.','The report changed. Refresh before saving.'):t('No se pudo completar. Revise el informe y su acceso.','Could not complete. Review the report and your access.'));return;}pending.current=null;setUncertain(false);setDirty(false);setPendingRead(true);setNotice(t('Cambio guardado.','Change saved.'));if(!await load())setError(t('El cambio se guardó. Reintente cargar el informe.','The change was saved. Retry loading the report.'));if(!body)throw Error();}catch{setUncertain(true);setError(t('No se pudo confirmar el guardado. Reintente el mismo cambio sin duplicarlo.','Could not confirm the save. Retry the same change without duplicating it.'));}finally{busy.current=false;setSaving(false);}}
 async function save(){if(!view||blocked)return;const parsed=deliveryContentSchema.safeParse(content);if(!parsed.success){setError(t('Revise los textos, la lista y las fotografías.','Review the text, checklist and photographs.'));return;}await mutate({action:'save',workId:view.workId,revision:view.revision,actionId:crypto.randomUUID(),content:parsed.data,internalNote:internalNote.trim()});}
 async function discard(){if(!view||blocked||loading||!dirty)return;const answer=await confirm({title:t('¿Descartar cambios de la constancia?','Discard report changes?'),description:t('Se restaurará el último borrador guardado. Las fotos que ya subió seguirán privadas y las versiones compartidas se conservan.','The last saved draft will be restored. Uploaded photos remain private and shared versions are preserved.'),confirmLabel:t('Descartar cambios','Discard changes'),cancelLabel:t('Seguir editando','Keep editing')});if(!answer.confirmed)return;sessionStorage.removeItem(draftKey(view.workId));setContent(view.draft??emptyDelivery());setInternalNote(view.internalNote??'');setDirty(false);setPreview(false);setError('');setNotice('');}
 async function publish(){if(!view||dirty||blocked||!view.canPublish)return;const answer=await confirm({title:t('¿Compartir esta constancia?','Share this report?'),description:t('El cliente verá una copia de esta versión. Sus notas internas y costos no se comparten. Las versiones anteriores se conservan.','The customer will see a copy of this version. Internal notes and costs are not shared. Previous versions are preserved.'),confirmLabel:t('Compartir constancia','Share report'),cancelLabel:t('Volver','Back')});if(answer.confirmed)await mutate({action:'publish',workId:view.workId,revision:view.revision,actionId:crypto.randomUUID()});}
 async function upload(file?:File){
  if(busy.current||!active.current||ackRecovery||file&&(!view||blocked||dirty))return;
  const target=photoAttempt.current?.workId??view?.workId??workId;if(!target)return;
  if(file&&(file.size>DELIVERY_PHOTO_LIMIT||file.size===0||!['image/jpeg','image/png','image/webp'].includes(file.type))){setError(t('Use JPG, PNG o WebP de hasta 3 MB.','Use JPG, PNG or WebP up to 3 MB.'));return;}
  busy.current=true;setPhotoReading(true);setError('');setNotice('');let started=false;const fresh=!photoAttempt.current;
  try{
   const store=deliveryPhotoIndexedDB(indexedDB);let attempt=photoAttempt.current;
   if(!attempt){const stored=await store.read({accountId,workId:target});if(!active.current)return;if(stored){photoAttempt.current=stored;setPhotoRecovery(true);setEditorOpen(true);attempt=stored;if(file)return;}else{if(!file)throw Error();attempt=await createDeliveryPhotoWrite({accountId,workId:target},{name:file.name,type:file.type,bytes:await file.arrayBuffer()},crypto.randomUUID());}}
   if(!active.current)return;
   const result=await continueDeliveryPhotoWrite({store,attempt,request:(url,init)=>{if(init?.method==='POST')started=true;return fetch(url,init);},currentAccount:()=>active.current?accountId:undefined,currentWork:()=>active.current?target:undefined,onCheckpoint:value=>{photoAttempt.current=value;if(active.current)setPhotoRecovery(true);}});
   if(!active.current)return;
   if(result.status==='rejected'){photoAttempt.current=null;setPhotoRecovery(false);setError(t('No se completó la subida. Revise la fotografía y reintente.','The upload was not completed. Review the photo and retry.'));return;}
   setView(result.view);
   await store.remove(result.attempt);if(!active.current)return;photoAttempt.current=null;setPhotoRecovery(false);
   setNotice(t('Foto privada guardada. Selecciónela y guarde la constancia para incluirla.','Private photo saved. Select it and save the report to include it.'));
  }catch(cause){
   if(!active.current)return;
   if(fresh&&!started&&cause instanceof DeliveryPhotoFailure&&cause.kind==='storage'&&cause.attempt.phase!=='confirmed'){
    try{const other=await deliveryPhotoIndexedDB(indexedDB).read({accountId,workId:target});if(active.current&&other&&other.actionId!==cause.attempt.actionId)photoAttempt.current=other;}catch{/* Retain in-memory identity until storage is available. */}
   }
   setPhotoRecovery(true);setError(t('Compruebe la subida antes de continuar.','Check the upload before continuing.'));
  }finally{busy.current=false;if(active.current)setPhotoReading(false);}
 }
 if(view?.side==='client'&&!view.versions.length&&!error&&!loading)return null;
 if(loading&&!view)return <p role="status">{t('Cargando constancia…','Loading report…')}</p>;
 return <section data-work-delivery className="space-y-4 rounded-2xl border border-[#d7e1ea] p-4">
  <h3 className="font-bold">{t('Constancia del trabajo','Work report')}</h3><p className="text-sm text-[#52627a]">{t('Resumen de lo realizado y recomendaciones para su próxima visita.','Work summary and recommendations for your next visit.')}</p>
  {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}{notice&&<p role="status" className="text-sm text-[#175b42]">{notice}</p>}
  {ackRecovery&&<div data-delivery-ack-recovery className="space-y-2"><p role="status">{t('Compruebe el recibido antes de continuar.','Check the receipt before continuing.')}</p><Button type="button" disabled={saving||loading||photoReading} onClick={()=>void acknowledge()}>{t('Comprobar recibido','Check receipt')}</Button></div>}
  {photoRecovery&&<div data-delivery-photo-recovery className="space-y-2"><p role="status">{t('Compruebe la subida antes de continuar.','Check the upload before continuing.')}</p><Button type="button" disabled={saving||loading||photoReading} onClick={()=>void upload()}>{t('Comprobar subida','Check upload')}</Button></div>}
  {writeRecovery&&<div data-delivery-write-recovery className="space-y-2"><p role="status">{t('Compruebe el guardado antes de continuar.','Check the saved result before continuing.')}</p><Button type="button" disabled={saving||loading||photoReading} onClick={()=>void writeReport()}>{t('Comprobar guardado','Check saved result')}</Button></div>}
  {uncertain&&!writeRecovery&&<Button type="button" disabled={saving} onClick={()=>void mutate(pending.current!)}>{t('Reintentar el mismo cambio','Retry the same change')}</Button>}
  {(pendingRead||!view)&&<Button type="button" variant="secondary" disabled={saving||loading} onClick={()=>void load()}>{t('Reintentar lectura','Retry reading')}</Button>}
  {view&&owner&&<Button type="button" variant="secondary" disabled={loading||editorVisible&&(dirty||blocked)} aria-expanded={editorVisible} onClick={()=>{if(dirty||blocked)return;setEditorOpen(!editorVisible);setPreview(false);}}>{editorVisible?t('Cerrar edición','Close editor'):hasDraft?t('Editar constancia','Edit report'):t('Crear constancia','Create report')}</Button>}
  {view&&owner&&editorVisible&&<>
   <p className="text-sm">{t('Borrador privado. El cliente solo ve las versiones que usted comparte.','Private draft. The customer only sees versions you share.')}</p>
   {!preview?<fieldset disabled={blocked||loading} className="min-w-0 space-y-3">
    <label className="block text-sm font-semibold">{t('Qué se realizó','What was done')}<textarea aria-label={t('Qué se realizó','What was done')} className={field} maxLength={2000} value={content.summary} onChange={e=>update({summary:e.target.value})}/></label>
    <div className="space-y-2"><h4 className="text-sm font-semibold">{t('Lista de trabajo (opcional)','Work checklist (optional)')}</h4>{content.checklist.map((item,index)=><div key={index} className="flex items-start gap-2"><input type="checkbox" className="mt-4 h-5 w-5" aria-label={t('Completado: ','Completed: ')+item.label} checked={item.done} onChange={e=>update({checklist:content.checklist.map((row,i)=>i===index?{...row,done:e.target.checked}:row)})}/><input aria-label={t('Tarea ','Task ')+(index+1)} className={field} maxLength={160} value={item.label} onChange={e=>update({checklist:content.checklist.map((row,i)=>i===index?{...row,label:e.target.value}:row)})}/><Button type="button" variant="secondary" aria-label={t('Quitar tarea ','Remove task ')+(index+1)} onClick={()=>update({checklist:content.checklist.filter((_,i)=>i!==index)})}>×</Button></div>)}{content.checklist.length<20&&<Button type="button" variant="secondary" onClick={()=>update({checklist:[...content.checklist,{label:'',done:false}]})}>{t('Agregar tarea','Add task')}</Button>}</div>
    <label className="block text-sm font-semibold">{t('Recomendaciones para el cliente (opcional)','Customer recommendations (optional)')}<textarea aria-label={t('Recomendaciones para el cliente (opcional)','Customer recommendations (optional)')} className={field} maxLength={2000} value={content.recommendations} onChange={e=>update({recommendations:e.target.value})}/></label>
    <label className="block rounded-xl bg-[#f3f8fb] p-3 text-sm font-semibold">{t('Nota interna: nunca se comparte','Internal note: never shared')}<textarea aria-label={t('Nota interna: nunca se comparte','Internal note: never shared')} className={field} maxLength={2000} value={internalNote} onChange={e=>{setInternalNote(e.target.value);setDirty(true);setNotice('');}}/></label>
    <div className="space-y-2"><p className="text-sm font-semibold">{t('Fotografías para compartir (opcional)','Photographs to share (optional)')}</p>{view.photos.map(photo=><label key={photo.id} className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" disabled={!photo.ready} checked={content.photoIds.includes(photo.id)} onChange={e=>update({photoIds:e.target.checked?[...content.photoIds,photo.id]:content.photoIds.filter(id=>id!==photo.id)})}/><span className="break-all">{photo.name}{!photo.ready?t(' · subida pendiente',' · upload pending'):''}</span></label>)}{view.photos.length<6&&<label className="block text-sm">{t('Subir foto privada (máximo 6)','Upload private photo (maximum 6)')}<ProFileInput aria-label={t('Subir foto privada','Upload private photo')} accept="image/jpeg,image/png,image/webp" disabled={dirty||blocked} className="mt-2" onChange={e=>{const file=e.target.files?.[0];e.target.value='';void upload(file);}}/></label>}<p className="text-xs text-[#52627a]">{t('Guarde los textos antes de subir. Seleccione las fotos y guarde para incluirlas. Se eliminan metadatos de ubicación.','Save text before uploading. Select photos and save to include them. Location metadata is removed.')}</p></div>
   </fieldset>:<ReportContent content={content} english={english}/>}
   <div className="flex flex-wrap justify-end gap-2">{dirty&&<Button type="button" variant="secondary" disabled={blocked||loading} onClick={()=>void discard()}>{t('Cancelar','Cancel')}</Button>}<Button type="button" disabled={blocked||loading||!dirty} onClick={()=>void save()}>{t('Guardar','Save')}</Button></div>
   <details data-delivery-options><summary className="min-h-11 cursor-pointer text-sm font-semibold">{t('Opciones de la constancia','Report options')}</summary><div className="mt-2 flex flex-wrap gap-2"><Button type="button" variant="secondary" disabled={blocked||loading} onClick={()=>setPreview(value=>!value)}>{preview?t('Volver a editar','Back to editing'):t('Ver como cliente','Preview as customer')}</Button><Button type="button" variant="secondary" disabled={dirty||blocked||loading||!view.canPublish||!content.summary.trim()} onClick={()=>void publish()}>{t('Compartir constancia','Share report')}</Button></div></details>
   {!view.canPublish&&<p className="text-xs text-[#52627a]">{t('Para compartir, complete el trabajo y vincúlelo a una cita de una cuenta de cliente. Puede conservar este borrador privado.','To share, complete the job and link it to an appointment with a customer account. You can keep this private draft.')}</p>}{dirty&&<p role="status" className="text-sm">{t('Tiene cambios sin guardar. Guarde antes de cerrar.','You have unsaved changes. Save before closing.')}</p>}
  </>}
  {view&&!owner&&!view.versions.length&&<p className="text-sm">{t('El profesional aún no ha compartido una constancia.','The professional has not shared a report yet.')}</p>}
  {view&&view.versions.map(version=><PublishedReport key={version.version} version={version} english={english} canAcknowledge={!owner&&!!requestId} disabled={blocked||loading} onAcknowledge={()=>void mutate({action:'acknowledge',requestId:requestId!,version:version.version,actionId:crypto.randomUUID()})}/>)}
  {view?.nextCursor&&<Button type="button" variant="secondary" disabled={loading||blocked||dirty} onClick={()=>void load(view.nextCursor!)}>{t('Ver versiones anteriores','View previous versions')}</Button>}{dialogNode}
 </section>;
}
function ReportContent({content,english}:{content:DeliveryContent;english:boolean}){return <div className="space-y-3 text-sm" data-delivery-client-preview><p className="whitespace-pre-wrap break-words">{content.summary}</p>{!!content.checklist.length&&<ul className="space-y-2">{content.checklist.map((item,index)=><li key={index} className="break-words">{item.done?'✓':'○'} {item.label}</li>)}</ul>}{content.recommendations&&<div><h5 className="font-semibold">{english?'Recommendations':'Recomendaciones'}</h5><p className="whitespace-pre-wrap break-words">{content.recommendations}</p></div>}<div className="grid grid-cols-2 gap-2">{content.photoIds.map((id,index)=><a key={id} href={api+'?photo='+encodeURIComponent(id)} target="_blank" rel="noreferrer"><img src={api+'?photo='+encodeURIComponent(id)} alt={(english?'Job photograph ':'Fotografía del trabajo ')+(index+1)} className="h-36 w-full rounded-xl object-cover"/></a>)}</div></div>;}
function PublishedReport({version,english,canAcknowledge,disabled,onAcknowledge}:{version:DeliveryVersion;english:boolean;canAcknowledge:boolean;disabled:boolean;onAcknowledge:()=>void}){const date=(value:string)=>new Date(value).toLocaleString(english?'en-US':'es-CR',{timeZone:'America/Costa_Rica',dateStyle:'medium',timeStyle:'short'});return <article className="space-y-3 rounded-xl border border-[#d7e1ea] p-3" data-delivery-version={version.version}><h4 className="font-semibold">{english?'Shared version ':'Versión compartida '}{version.version} · {version.service}</h4><p className="text-xs text-[#52627a]">{date(version.publishedAt)}</p><ReportContent content={version.content} english={english}/>{version.acknowledgedAt?<p className="text-sm text-[#175b42]">{english?'Receipt confirmed: ':'Recibido confirmado: '}{date(version.acknowledgedAt)}</p>:canAcknowledge&&<Button type="button" variant="secondary" disabled={disabled} onClick={onAcknowledge}>{english?'Confirm received':'Confirmar recibido'}</Button>}</article>;}
