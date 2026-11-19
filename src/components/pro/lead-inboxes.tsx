'use client';
import {ProFileInput} from './pro-file-input';
import {useCallback,useEffect,useRef,useState,type ReactNode} from 'react';
import {useLocale} from 'next-intl';
import {Button} from '@/components/ui/button';
import {Modal} from '@/components/ui/modal';
import {useAppDialog} from '@/hooks/use-app-dialog';
import {crTodayISO} from '@/lib/time-cr';
import type {RequestPipelineCatalog} from '@/lib/pro/request-pipeline';
import {leadImportPreviewSchema,leadImportResultSchema,leadImportsPageSchema,leadImportTemplateHeaders,leadInboxFunnelSchema,leadSnoozeReadSchema,leadSnoozeResultSchema,type LeadImport,type LeadImportErrorCode,type LeadImportPreview,type LeadInboxCounts,type LeadInboxFunnel,type LeadSnooze} from '@/lib/pro/lead-inboxes';
import {leadStageName} from './lead-stages-editor';
import {LeadOriginMetrics} from './lead-origin-metrics';
import {businessCsv,downloadFile} from './exports';

export const leadInboxApi='/api/pro/lead-inboxes';
export type LeadInboxValue='active'|'snoozed'|'archived'|'imports'|`stage:${string}`;
const pl=(n:number,one:string,many:string)=>`${n} ${n===1?one:many}`;
const field='mt-1 min-h-11 w-full min-w-0 rounded-xl border border-[#d7e1ea] bg-white px-3 font-normal';
const plusDays=(iso:string,days:number)=>new Date(Date.parse(iso+'T12:00:00Z')+days*86400000).toISOString().slice(0,10);
export const formatLeadDay=(iso:string,en:boolean)=>new Intl.DateTimeFormat(en?'en-US':'es-CR',{dateStyle:'medium',timeZone:'UTC'}).format(new Date(iso+'T12:00:00Z'));
const formatStamp=(value:string,en:boolean)=>new Intl.DateTimeFormat(en?'en-US':'es-CR',{dateStyle:'medium',timeStyle:'short',timeZone:'America/Costa_Rica'}).format(new Date(value));
async function post(actor:string,body:unknown){return fetch(leadInboxApi,{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json','X-Pro-Expected-Actor':actor},body:JSON.stringify(body)});}

/** Inbox sidebar on desktop and a single selector on phones. Counters come from the server. */
export function LeadInboxNav({counts,catalog,value,blocked,onSelect}:{counts:LeadInboxCounts|null;catalog:RequestPipelineCatalog|undefined;value:LeadInboxValue;blocked:boolean;onSelect:(value:LeadInboxValue)=>void}){
 const en=useLocale()==='en',stages=(catalog?.stages??[]).filter(stage=>!stage.hidden),count=(n:number|undefined)=>counts?String(n??0):'…';
 const stageCount=(stageId:string)=>counts?.stages.find(s=>s.stageId===stageId)?.count;
 const groups:{label:string;items:{value:LeadInboxValue;label:string;count:number|undefined}[]}[]=[
  {label:en?'Active leads':'Activas',items:[{value:'active',label:en?'All active':'Todas las activas',count:counts?.active},...stages.map(stage=>({value:`stage:${stage.id}` as LeadInboxValue,label:leadStageName(stage,en),count:stageCount(stage.id)}))]},
  {label:en?'Inactive leads':'Inactivas',items:[{value:'snoozed',label:en?'Snoozed':'Pospuestas',count:counts?.snoozed},{value:'archived',label:en?'Archived':'Archivadas',count:counts?.archived}]},
  {label:en?'Imported leads':'Importadas',items:[{value:'imports',label:en?'Import history':'Historial de importación',count:counts?.imports}]},
 ];
 return <>
  <label className="block text-sm font-semibold lg:hidden">{en?'Lead inbox':'Bandeja de solicitudes'}
   <select data-lead-inbox-select aria-label={en?'Lead inbox':'Bandeja de solicitudes'} value={value} disabled={blocked} onChange={event=>onSelect(event.target.value as LeadInboxValue)} className={field}>
    {groups.map(group=><optgroup key={group.label} label={group.label}>{group.items.map(item=><option key={item.value} value={item.value}>{item.label} ({count(item.count)})</option>)}</optgroup>)}
   </select>
  </label>
  <nav data-lead-inboxes aria-label={en?'Lead inboxes':'Bandejas de solicitudes'} className="hidden min-w-0 space-y-4 rounded-2xl border border-[#d7e1ea] bg-white p-3 lg:block">
   {groups.map(group=><div key={group.label} className="space-y-1">
    <p className="px-2 text-xs font-bold uppercase tracking-wide text-[#52627a]">{group.label}</p>
    {group.items.map(item=><button type="button" key={item.value} data-lead-inbox={item.value} disabled={blocked} aria-current={value===item.value?'page':undefined} onClick={()=>onSelect(item.value)} className={'flex min-h-11 w-full min-w-0 items-center justify-between gap-2 rounded-xl px-3 text-left text-sm '+(value===item.value?'bg-[#eaf7fb] font-semibold text-[#008bb5]':'text-[#162543] hover:bg-[#f7f9fc]')}>
     <span className="min-w-0 break-words">{item.label}</span><span data-lead-inbox-count className="shrink-0 rounded-lg bg-[#f7f9fc] px-2 py-0.5 text-xs font-semibold text-[#52627a]">{count(item.count)}</span>
    </button>)}
   </div>)}
  </nav>
 </>;
}

/** Snooze form with date (Costa Rica calendar), optional note and the private history. */
export function LeadSnoozeDialog({actor,kind,id,label,onClose,onChanged,onBusy}:{actor:string;kind:'manual'|'request';id:string;label:string;onClose:()=>void;onChanged:()=>void;onBusy:(busy:boolean)=>void}){
 const en=useLocale()==='en',today=crTodayISO(),[until,setUntil]=useState(plusDays(today,7)),[note,setNote]=useState(''),[state,setState]=useState<{snooze:LeadSnooze|null;history:ReturnType<typeof leadSnoozeReadSchema.parse>['history'];error:boolean}>({snooze:null,history:[],error:false}),[busy,setBusy]=useState(false),[error,setError]=useState(''),[done,setDone]=useState(false),attempt=useRef<{body:string;actionId:string}|null>(null);
 const load=useCallback(async()=>{try{const response=await fetch(leadInboxApi+'?'+new URLSearchParams({view:'snooze',kind,id}),{cache:'no-store',headers:{'X-Pro-Expected-Actor':actor}});if(!response.ok)throw Error();const value=leadSnoozeReadSchema.parse(await response.json());setState({snooze:value.snooze,history:value.history,error:false});}catch{setState(old=>({...old,error:true}));}},[actor,kind,id]);
 useEffect(()=>{const timer=setTimeout(()=>void load(),0);return()=>clearTimeout(timer);},[load]);
 useEffect(()=>{onBusy(busy);},[busy,onBusy]);
 const invalid=!until||until<=today||until>plusDays(today,366);
 async function submit(){if(busy||!state.snooze||invalid)return;setBusy(true);setError('');
  const body=JSON.stringify({until,note:note.trim()}),current=attempt.current?.body===body?attempt.current:{body,actionId:crypto.randomUUID()};attempt.current=current;
  try{const response=await post(actor,{action:'snooze',actionId:current.actionId,kind,id,revision:state.snooze.revision,until,note:note.trim()});
   if(response.status===409){attempt.current=null;setError(en?'This lead changed. Its current state was reloaded; review it and try again.':'La solicitud cambió. Se recargó su estado actual; revíselo e intente de nuevo.');await load();return;}
   if(response.status===400){attempt.current=null;setError(en?'Choose a date after today and within one year.':'Elija una fecha posterior a hoy y dentro de un año.');return;}
   if(!response.ok)throw Error();leadSnoozeResultSchema.parse(await response.json());attempt.current=null;setDone(true);onChanged();await load();
  }catch{setError(en?'Could not confirm the change. Retry: the same attempt will not be repeated.':'No se pudo confirmar el cambio. Reintente: no se repetirá el mismo intento.');}finally{setBusy(false);}}
 return <Modal manageFocus title={en?'Snooze lead':'Posponer solicitud'} subtitle={label} onClose={()=>{if(!busy)onClose();}} closeLabel={en?'Close':'Cerrar'} size="md" mobilePresentation="sheet-compact"
  footer={<div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={onClose}>{done?(en?'Done':'Listo'):(en?'Cancel':'Cancelar')}</Button>{!done&&<Button type="button" disabled={busy||invalid||!state.snooze} onClick={()=>void submit()}>{busy?(en?'Saving…':'Guardando…'):(en?'Snooze':'Posponer')}</Button>}</div>}>
  <div data-lead-snooze-dialog className="space-y-4">
   {done&&state.snooze?.snoozed?<p role="status" className="rounded-xl bg-[#eaf7fb] p-3 text-sm">{en?'Snoozed until':'Pospuesta hasta'} {formatLeadDay(state.snooze.until!,en)}. {en?'It will return to the active inbox on that date.':'Volverá a las activas ese día.'}</p>:<>
    <p className="text-sm text-[#52627a]">{en?'The lead leaves the active inbox and returns by itself on the chosen date (Costa Rica time). Nothing is sent to the customer.':'La solicitud sale de las activas y vuelve sola en la fecha elegida (hora de Costa Rica). No se envía nada al cliente.'}</p>
    <label className="block text-sm font-semibold">{en?'Snooze until':'Posponer hasta'}<input type="date" aria-label={en?'Snooze until':'Posponer hasta'} min={plusDays(today,1)} max={plusDays(today,366)} value={until} disabled={busy} onChange={event=>setUntil(event.target.value)} className={field}/></label>
    <div className="flex flex-wrap gap-2">{[[1,en?'Tomorrow':'Mañana'],[7,en?'In a week':'En una semana'],[30,en?'In a month':'En un mes']].map(([days,text])=><Button key={String(days)} type="button" variant="outline" size="sm" className="min-h-11" disabled={busy} onClick={()=>setUntil(plusDays(today,Number(days)))}>{text}</Button>)}</div>
    <label className="block text-sm font-semibold">{en?'Private note (optional)':'Nota privada (opcional)'}<textarea aria-label={en?'Private note (optional)':'Nota privada (opcional)'} maxLength={500} rows={3} value={note} disabled={busy} onChange={event=>setNote(event.target.value)} className="mt-1 w-full min-w-0 rounded-xl border border-[#d7e1ea] px-3 py-2 font-normal"/></label>
   </>}
   {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
   {state.error&&<p role="alert" className="text-sm">{en?'Could not load the snooze history.':'No se pudo cargar el historial de posposición.'} <Button type="button" variant="ghost" onClick={()=>void load()}>{en?'Retry':'Reintentar'}</Button></p>}
   <details data-lead-snooze-history><summary className="cursor-pointer py-2 text-sm font-semibold">{en?'Snooze history':'Historial de posposición'}</summary>
    {state.history.length===0?<p className="text-sm text-[#52627a]">{en?'No snoozes yet.':'Todavía no se ha pospuesto.'}</p>:<ul className="space-y-1 text-sm">{state.history.map(event=><li key={event.actionId} className="break-words">{event.action==='snooze'?(en?'Snoozed until ':'Pospuesta hasta ')+formatLeadDay(event.after.until!,en):(en?'Reactivated':'Reactivada')}{event.after.note?' · '+event.after.note:''} · <span className="text-[#52627a]">{formatStamp(event.at,en)}</span></li>)}</ul>}
   </details>
  </div>
 </Modal>;
}

/** Reactivates a snoozed lead. Returns 'ok', 'changed' (409) or 'error'. */
export async function wakeLead(actor:string,snooze:LeadSnooze){
 try{const response=await post(actor,{action:'wake',actionId:crypto.randomUUID(),kind:snooze.kind,id:snooze.id,revision:snooze.revision});if(response.status===409)return 'changed';if(!response.ok)return 'error';leadSnoozeResultSchema.parse(await response.json());return 'ok';}catch{return 'error';}
}

const errorText=(code:LeadImportErrorCode,en:boolean)=>({
 name_required:en?'Name is required':'Falta el nombre',name_too_long:en?'Name is too long':'El nombre es muy largo',service_required:en?'Service is required':'Falta el servicio',service_too_long:en?'Service is too long':'El servicio es muy largo',
 contact_required:en?'Add an email or phone':'Agregue correo o teléfono',email_invalid:en?'Invalid email':'Correo inválido',phone_invalid:en?'Invalid phone':'Teléfono inválido',project_type_too_long:en?'Project type is too long':'El tipo de proyecto es muy largo',
 address_too_long:en?'Address is too long':'La dirección es muy larga',description_too_long:en?'Description is too long':'La descripción es muy larga',invalid_characters:en?'Contains invalid characters':'Tiene caracteres no válidos',
 duplicate_in_file:en?'Repeated contact in this file':'Contacto repetido en el archivo',channel_unknown:en?'Channel not found among your active channels':'El canal no está entre sus canales activos',client_archived:en?'The matching customer is archived':'El cliente que coincide está archivado',
}[code]);
const fileErrorText=(code:string,column:string,en:boolean)=>code==='unknown_column'?(en?`Unrecognized column: ${column}. Use the template.`:`Columna no reconocida: ${column}. Use la plantilla.`):code==='duplicate_column'?(en?`Repeated column: ${column}.`:`Columna repetida: ${column}.`):code==='missing_column'?(en?'The file needs name, service and email or phone columns.':'El archivo necesita las columnas nombre, servicio y correo o teléfono.'):code==='too_many'?(en?'Import at most 200 leads per file.':'Importe como máximo 200 solicitudes por archivo.'):code==='empty'?(en?'The file has no rows to import.':'El archivo no tiene filas para importar.'):(en?'Could not read the CSV. Use the template.':'No se pudo leer el CSV. Use la plantilla.');

/** CSV import with server preview, per-row validation, duplicate detection and an idempotent commit. */
export function LeadImportDialog({actor,onClose,onImported,onBusy}:{actor:string;onClose:()=>void;onImported:()=>void;onBusy:(busy:boolean)=>void}){
 const en=useLocale()==='en',[file,setFile]=useState<{name:string;csv:string}|null>(null),[preview,setPreview]=useState<LeadImportPreview|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[result,setResult]=useState<LeadImport|null>(null),attempt=useRef<{key:string;actionId:string}|null>(null),sequence=useRef(0);
 useEffect(()=>{onBusy(busy);},[busy,onBusy]);
 async function choose(selected:File|undefined){const n=++sequence.current;setPreview(null);setError('');setResult(null);setFile(null);if(!selected)return;
  if(!selected.name.toLowerCase().endsWith('.csv')){setError(en?'Choose a CSV file.':'Elija un archivo CSV.');return;}
  if(selected.size>300_000){setError(en?'The file is larger than 300 KB.':'El archivo supera 300 KB.');return;}
  setBusy(true);try{const csv=await selected.text(),name=selected.name.slice(0,160);const response=await post(actor,{action:'preview',fileName:name,csv});
   if(n!==sequence.current)return;
   if(response.status===400){const body=await response.json().catch(()=>({}));setError(fileErrorText(String(body.fileError??''),String(body.column??''),en));return;}
   if(!response.ok)throw Error();setPreview(leadImportPreviewSchema.parse(await response.json()));setFile({name,csv});
  }catch{if(n===sequence.current)setError(en?'Could not check the file. Try again.':'No se pudo revisar el archivo. Intente de nuevo.');}finally{if(n===sequence.current)setBusy(false);}}
 const creatable=preview?preview.summary.new+preview.summary.existingClient:0;
 async function commit(){if(!file||!preview||busy||preview.summary.error>0||creatable===0)return;setBusy(true);setError('');
  const key=file.name+'\u0000'+file.csv,current=attempt.current?.key===key?attempt.current:{key,actionId:crypto.randomUUID()};attempt.current=current;
  try{const response=await post(actor,{action:'import',actionId:current.actionId,fileName:file.name,csv:file.csv});
   if(response.status===409||response.status===400){attempt.current=null;setError(en?'Your customers or channels changed. Review the updated preview.':'Sus clientes o canales cambiaron. Revise la vista previa actualizada.');const again=await post(actor,{action:'preview',fileName:file.name,csv:file.csv});if(again.ok)setPreview(leadImportPreviewSchema.parse(await again.json()));return;}
   if(!response.ok)throw Error();const value=leadImportResultSchema.parse(await response.json());if(value.action!=='import')throw Error();setResult(value.import);onImported();
  }catch{setError(en?'Could not confirm the import. Retry: the same import will not be duplicated.':'No se pudo confirmar la importación. Reintente: la misma importación no se duplicará.');}finally{setBusy(false);}}
 async function template(){try{const headers=leadImportTemplateHeaders[en?'en':'es'];await downloadFile(businessCsv([Object.fromEntries(headers.map(h=>[h,'']))]),en?'leads-template.csv':'plantilla-solicitudes.csv','text/csv;charset=utf-8');}catch{setError(en?'Could not download the template.':'No se pudo descargar la plantilla.');}}
 const status=(value:LeadImportPreview['rows'][number])=>value.status==='new'?(en?'New customer':'Cliente nuevo'):value.status==='existing_client'?(en?'Existing customer':'Cliente existente'):value.status==='duplicate'?(en?'Already exists · skipped':'Ya existe · se omite'):(en?'Fix before importing':'Corregir antes de importar');
 return <Modal manageFocus title={en?'Import leads from a file':'Importar solicitudes desde archivo'} onClose={()=>{if(!busy)onClose();}} closeLabel={en?'Close':'Cerrar'} size="lg"
  footer={<div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={onClose}>{result?(en?'Done':'Listo'):(en?'Cancel':'Cancelar')}</Button>{!result&&<Button type="button" disabled={busy||!preview||preview.summary.error>0||creatable===0} onClick={()=>void commit()}>{busy&&preview?(en?'Importing…':'Importando…'):en?`Import ${creatable} ${creatable===1?'lead':'leads'}`:`Importar ${creatable} ${creatable===1?'solicitud':'solicitudes'}`}</Button>}</div>}>
  <div data-lead-import-dialog className="min-w-0 space-y-4">
   {result?<div role="status" data-lead-import-result className="space-y-1 rounded-xl bg-[#eaf7fb] p-3 text-sm"><p className="font-semibold">{en?'Import saved':'Importación guardada'}</p><p>{en?`${pl(result.createdLeads,'lead','leads')} created (${pl(result.createdClients,'new customer','new customers')}, ${result.reusedClients} existing) · ${pl(result.skippedDuplicates,'duplicate','duplicates')} skipped.`:`${pl(result.createdLeads,'solicitud creada','solicitudes creadas')} (${pl(result.createdClients,'cliente nuevo','clientes nuevos')}, ${pl(result.reusedClients,'existente','existentes')}) · ${pl(result.skippedDuplicates,'duplicada omitida','duplicadas omitidas')}.`}</p><p>{en?'You can review or undo it in Import history.':'Puede revisarla o deshacerla en Historial de importación.'}</p></div>:<>
    <p className="text-sm text-[#52627a]">{en?'Use the template: name, email, phone, service, project type, channel, address and description. Name, service and an email or phone are required. Up to 200 rows. Contacts are matched only against your own customers.':'Use la plantilla: nombre, correo, teléfono, servicio, tipo de proyecto, canal, dirección y descripción. Son obligatorios el nombre, el servicio y un correo o teléfono. Hasta 200 filas. Los contactos se comparan solo con sus propios clientes.'}</p>
    <Button type="button" variant="outline" disabled={busy} onClick={()=>void template()}>{en?'Download template':'Descargar plantilla'}</Button>
    <label className="block text-sm font-semibold">{en?'CSV file':'Archivo CSV'}<ProFileInput accept=".csv,text/csv" aria-label={en?'CSV file':'Archivo CSV'} disabled={busy} onChange={event=>void choose(event.target.files?.[0])} className="mt-1"/></label>
    {busy&&!preview&&<p role="status" className="text-sm">{en?'Checking the file…':'Revisando el archivo…'}</p>}
    {preview&&<div data-lead-import-preview className="min-w-0 space-y-3">
     <p data-lead-import-summary className="text-sm font-semibold">{en?`${pl(preview.summary.total,'row','rows')} · ${pl(preview.summary.new,'new customer','new customers')} · ${pl(preview.summary.existingClient,'existing customer','existing customers')} · ${pl(preview.summary.duplicate,'duplicate','duplicates')} · ${preview.summary.error} with errors`:`${pl(preview.summary.total,'fila','filas')} · ${pl(preview.summary.new,'cliente nuevo','clientes nuevos')} · ${pl(preview.summary.existingClient,'cliente existente','clientes existentes')} · ${pl(preview.summary.duplicate,'duplicada','duplicadas')} · ${preview.summary.error} con errores`}</p>
     {preview.summary.error>0&&<p role="alert" className="text-sm text-red-700">{en?'Fix the rows with errors in your file and choose it again. Nothing was imported.':'Corrija en su archivo las filas con errores y vuelva a elegirlo. No se importó nada.'}</p>}
     <ol className="space-y-2">{preview.rows.map(row=><li key={row.row} data-lead-import-row={row.row} data-status={row.status} className={'min-w-0 rounded-xl border p-3 text-sm '+(row.status==='error'?'border-red-200 bg-red-50':'border-[#d7e1ea] bg-white')}>
      <p className="break-words font-semibold">{en?'Row':'Fila'} {row.row}: {row.name||(en?'(no name)':'(sin nombre)')} · {row.service||(en?'(no service)':'(sin servicio)')}</p>
      <p className="text-[#52627a]">{status(row)}{row.client&&row.status!=='error'?' · '+row.client.name:''}</p>
      {row.errors.length>0&&<ul className="mt-1 list-disc pl-5 text-red-700">{row.errors.map(code=><li key={code}>{errorText(code,en)}</li>)}</ul>}
     </li>)}</ol>
    </div>}
   </>}
   {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
  </div>
 </Modal>;
}

/** Import history with counts and a safe undo (archives the leads it created; never deletes). */
export function LeadImportHistory({actor,blocked,onChanged,onBusy}:{actor:string;blocked:boolean;onChanged:()=>void;onBusy:(busy:boolean)=>void}){
 const en=useLocale()==='en',{confirm,dialogNode}=useAppDialog(),[state,setState]=useState<{items:LeadImport[];next:string|null;loading:boolean;error:boolean}>({items:[],next:null,loading:true,error:false}),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
 useEffect(()=>{onBusy(busy);},[busy,onBusy]);
 const load=useCallback(async(after?:string)=>{setState(old=>({...old,loading:true,error:false}));try{const response=await fetch(leadInboxApi+'?'+new URLSearchParams({view:'imports',...after?{after}:{}}),{cache:'no-store',headers:{'X-Pro-Expected-Actor':actor}});if(!response.ok)throw Error();const value=leadImportsPageSchema.parse(await response.json());setState(old=>({items:after?[...old.items,...value.items.filter(i=>!old.items.some(o=>o.id===i.id))]:value.items,next:value.nextCursor,loading:false,error:false}));}catch{setState(old=>({...old,loading:false,error:true}));}},[actor]);
 useEffect(()=>{const timer=setTimeout(()=>void load(),0);return()=>clearTimeout(timer);},[load]);
 async function undo(item:LeadImport){if(busy||blocked)return;
  if(!(await confirm({title:en?'Undo this import?':'¿Deshacer esta importación?',description:en?`Leads from this import that are still active and unchanged will be archived (up to ${item.activeLeads}). Leads you already edited, scheduled for follow-up, snoozed or converted are kept. Nothing is deleted, customers are kept and you can restore leads from Archived.`:`Se archivarán las solicitudes de esta importación que siguen activas y sin cambios (hasta ${item.activeLeads}). Las que ya editó, tienen seguimiento, pospuso o convirtió se conservan. No se borra nada, los clientes se conservan y puede restaurarlas desde Archivadas.`,confirmLabel:en?'Undo import':'Deshacer importación',cancelLabel:en?'Keep':'Conservar',tone:'danger'})).confirmed)return;
  setBusy(true);setNotice('');try{const response=await post(actor,{action:'undo_import',actionId:crypto.randomUUID(),importId:item.id,revision:item.revision});
   if(response.status===409){setNotice(en?'The import changed. The history was refreshed.':'La importación cambió. Se actualizó el historial.');await load();return;}
   if(!response.ok)throw Error();const value=leadImportResultSchema.parse(await response.json());if(value.action!=='undo_import')throw Error();const kept=value.import.activeLeads;setNotice((en?`${pl(value.archived,'lead','leads')} archived.`:`${pl(value.archived,'solicitud archivada','solicitudes archivadas')}.`)+(kept>0?' '+(en?`${pl(kept,'lead was','leads were')} kept because ${kept===1?'it':'they'} already had changes.`:`Se ${kept===1?'conservó':'conservaron'} ${pl(kept,'solicitud','solicitudes')} porque ya ${kept===1?'tenía':'tenían'} cambios.`):''));onChanged();await load();
  }catch{setNotice(en?'Could not confirm the undo. Refresh the history.':'No se pudo confirmar la acción. Actualice el historial.');}finally{setBusy(false);}}
 return <section data-lead-import-history className="min-w-0 space-y-3">{dialogNode}
  <h3 className="text-lg font-semibold">{en?'Import history':'Historial de importación'}</h3>
  {notice&&<p role="status" className="text-sm">{notice}</p>}
  {state.error?<p role="alert" className="text-sm">{en?'Could not load the import history.':'No se pudo cargar el historial de importación.'} <Button type="button" variant="outline" onClick={()=>void load()}>{en?'Retry':'Reintentar'}</Button></p>:state.loading&&state.items.length===0?<p role="status" className="text-sm">{en?'Loading imports…':'Cargando importaciones…'}</p>:state.items.length===0?<p className="text-sm">{en?'No imports yet. Use “Import from file”.':'Todavía no hay importaciones. Use «Importar archivo».'}</p>:
   <div className="space-y-2">{state.items.map(item=><article key={item.id} data-lead-import={item.id} className="min-w-0 space-y-2 rounded-xl border border-[#d7e1ea] bg-white p-3">
    <div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><p className="break-words font-semibold">{item.fileName}</p><p className="text-xs text-[#52627a]">{formatStamp(item.createdAt,en)}</p></div>{item.undoneAt?<span className="rounded-lg bg-[#f7f9fc] px-2 py-1 text-xs font-semibold text-[#52627a]">{en?'Undone':'Deshecha'}</span>:<Button type="button" variant="outline" size="sm" disabled={busy||blocked} onClick={()=>void undo(item)}>{en?'Undo import':'Deshacer importación'}</Button>}</div>
    <dl data-lead-import-counts className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm sm:grid-cols-4">
     <div><dt className="text-[#52627a]">{en?'Rows':'Filas'}</dt><dd className="font-semibold">{item.totalRows}</dd></div>
     <div><dt className="text-[#52627a]">{en?'Leads created':'Solicitudes creadas'}</dt><dd className="font-semibold">{item.createdLeads}</dd></div>
     <div><dt className="text-[#52627a]">{en?'Duplicates skipped':'Duplicadas omitidas'}</dt><dd className="font-semibold">{item.skippedDuplicates}</dd></div>
     <div><dt className="text-[#52627a]">{en?'Still active':'Siguen activas'}</dt><dd className="font-semibold">{item.activeLeads}</dd></div>
    </dl>
    <p className="text-xs text-[#52627a]">{en?`${pl(item.createdClients,'new customer','new customers')} · ${pl(item.reusedClients,'existing customer','existing customers')}`:`${pl(item.createdClients,'cliente nuevo','clientes nuevos')} · ${pl(item.reusedClients,'cliente existente','clientes existentes')}`}{item.undoneAt?' · '+(en?`${item.archivedOnUndo??0} archived when undone`:`${pl(item.archivedOnUndo??0,'archivada','archivadas')} al deshacer`):''}</p>
   </article>)}</div>}
  {state.next&&<Button type="button" variant="outline" disabled={state.loading} onClick={()=>void load(state.next!)}>{en?'More imports':'Más importaciones'}</Button>}
 </section>;
}

const monthStart=(iso:string)=>iso.slice(0,8)+'01';
/** Lead insights: stage funnel and conversion to work in a Costa Rica period, plus channel metrics. */
export function LeadInsightsDialog({actor,onClose}:{actor:string;onClose:()=>void}){
 const en=useLocale()==='en',today=crTodayISO(),[from,setFrom]=useState(monthStart(today)),[to,setTo]=useState(today),[range,setRange]=useState({from:monthStart(today),to:today}),[state,setState]=useState<{key:string;value:LeadInboxFunnel|null;error:boolean}>({key:'',value:null,error:false}),key=range.from+':'+range.to,sequence=useRef(0);
 const load=useCallback(async()=>{const n=++sequence.current;setState(old=>({key,value:old.key===key?old.value:null,error:false}));try{const response=await fetch(leadInboxApi+'?'+new URLSearchParams({view:'funnel',from:range.from,to:range.to}),{cache:'no-store',headers:{'X-Pro-Expected-Actor':actor}});if(!response.ok)throw Error();const value=leadInboxFunnelSchema.parse(await response.json());if(n===sequence.current)setState({key,value,error:false});}catch{if(n===sequence.current)setState({key,value:null,error:true});}},[actor,key,range]);
 useEffect(()=>{const timer=setTimeout(()=>void load(),0);return()=>clearTimeout(timer);},[load]);
 const value=state.key===key?state.value:null,stages=value?.catalog.stages.filter(s=>!s.hidden)??[],percent=(n:number,total:number)=>total?Math.round(n*1000/total)/10:0,number=(n:number)=>new Intl.NumberFormat(en?'en-US':'es-CR',{maximumFractionDigits:1}).format(n),pct=(n:number)=>number(n)+(en?'%':' %');
 const tile=(label:string,content:ReactNode,attr:string)=><div data-lead-funnel-tile={attr} className="min-w-0 rounded-xl border border-[#d7e1ea] bg-white p-3"><p className="text-sm text-[#52627a]">{label}</p><strong className="mt-1 block text-2xl text-[#162543]">{content}</strong></div>;
 return <Modal manageFocus title={en?'Lead insights':'Métricas de solicitudes'} onClose={onClose} closeLabel={en?'Close':'Cerrar'} size="lg">
  <div data-lead-insights className="min-w-0 space-y-6">
   <section className="min-w-0 space-y-4">
    <form className="flex flex-wrap items-end gap-3" onSubmit={event=>{event.preventDefault();if(from&&to&&from<=to)setRange({from,to});}}>
     <label className="min-w-0 text-sm font-semibold">{en?'From':'Desde'}<input type="date" aria-label={en?'Period from':'Período desde'} min="1900-01-01" max="2100-12-31" value={from} onChange={e=>setFrom(e.target.value)} className={field}/></label>
     <label className="min-w-0 text-sm font-semibold">{en?'To':'Hasta'}<input type="date" aria-label={en?'Period to':'Período hasta'} min="1900-01-01" max="2100-12-31" value={to} onChange={e=>setTo(e.target.value)} className={field}/></label>
     <Button type="submit" disabled={!from||!to||from>to}>{en?'Apply period':'Aplicar período'}</Button>
    </form>
    <p className="text-xs text-[#52627a]">{en?'Leads received in the period (Costa Rica dates). Conversion counts only leads with a linked job that still exists and is not cancelled.':'Solicitudes recibidas en el período (fechas de Costa Rica). La conversión cuenta solo solicitudes con un trabajo vinculado que existe y no está cancelado.'}</p>
    {state.error?<p role="alert" className="text-sm">{en?'Could not load the funnel.':'No se pudo cargar el embudo.'} <Button type="button" variant="outline" onClick={()=>void load()}>{en?'Retry':'Reintentar'}</Button></p>:!value?<p role="status" className="text-sm">{en?'Loading insights…':'Cargando métricas…'}</p>:<>
     <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {tile(en?'Received':'Recibidas',value.received,'received')}{tile(en?'Open':'Abiertas',value.open,'open')}{tile(en?'Converted to job':'Convertidas en trabajo',value.converted,'converted')}{tile(en?'Conversion rate':'Tasa de conversión',value.conversionRate===null?'—':pct(value.conversionRate),'rate')}
     </div>
     {value.received===0?<p className="text-sm">{en?'No leads were received in this period.':'No se recibieron solicitudes en este período.'}</p>:<div data-lead-funnel className="space-y-2">
      <h3 className="font-semibold">{en?'Open leads by stage':'Solicitudes abiertas por etapa'}</h3>
      {stages.map(stage=>{const n=value.stages.find(s=>s.stageId===stage.id)?.count??0;return <div key={stage.id} data-lead-funnel-stage={stage.id} className="space-y-1"><div className="flex items-center justify-between gap-2 text-sm"><span className="min-w-0 break-words">{leadStageName(stage,en)}</span><span className="shrink-0 font-semibold"><span data-lead-funnel-count>{n}</span> · {pct(percent(n,value.open))}</span></div><div className="h-2 rounded-full bg-[#e9eff5]"><div className="h-2 rounded-full bg-[#008bb5]" style={{width:percent(n,value.open)+'%'}}/></div></div>;})}
      <p className="text-xs text-[#52627a]">{en?`${value.snoozed} snoozed and ${value.archived} archived · ${value.manual} manual, ${value.request} from ContrataCR.`:`${pl(value.snoozed,'pospuesta','pospuestas')} y ${pl(value.archived,'archivada','archivadas')} · ${pl(value.manual,'manual','manuales')}, ${value.request} desde ContrataCR.`}</p>
     </div>}
    </>}
   </section>
   <LeadOriginMetrics/>
  </div>
 </Modal>;
}

/** The public profile request form already creates leads here; this explains and links it. */
export function LeadContactFormDialog({slug,onClose,onOpenAgenda}:{slug:string|null;onClose:()=>void;onOpenAgenda:()=>void}){
 const en=useLocale()==='en',path=slug?(en?'/en':'')+'/profesionales/'+encodeURIComponent(slug):null;
 return <Modal manageFocus title={en?'Contact form':'Formulario de contacto'} onClose={onClose} closeLabel={en?'Close':'Cerrar'} size="md" mobilePresentation="sheet-compact">
  <div data-lead-contact-form className="space-y-3 text-sm">
   <p>{en?'Your public ContrataCR profile already has a request form. Every request a customer sends there arrives in this section as a ContrataCR lead, in the New stage, with its own history.':'Su perfil público de ContrataCR ya tiene un formulario de solicitud. Cada solicitud que un cliente envía ahí llega a esta sección como solicitud de ContrataCR, en la etapa Nueva y con su propio historial.'}</p>
   <p>{en?'Customers sign in with a free account to send it. To receive requests, turn on “Receive appointment requests” in Appointments → Calendar.':'El cliente inicia sesión con una cuenta gratuita para enviarla. Para recibir solicitudes, active «Recibir solicitudes de citas» en Citas → Calendario.'}</p>
   <div className="flex flex-wrap gap-2">
    {path?<a href={path} target="_blank" rel="noopener" className="inline-flex min-h-11 items-center rounded-xl border border-[#d7e1ea] px-4 font-semibold text-[#008bb5]">{en?'Open my public profile':'Abrir mi perfil público'}</a>:<p className="text-[#52627a]">{en?'You do not have a public profile yet. Leads you add or import still work.':'Todavía no tiene perfil público. Las solicitudes que agregue o importe funcionan igual.'}</p>}
    <Button type="button" variant="outline" onClick={onOpenAgenda}>{en?'Open Appointments':'Abrir Citas'}</Button>
   </div>
  </div>
 </Modal>;
}
