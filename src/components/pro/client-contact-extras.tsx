'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {useLocale} from 'next-intl';
import {Button} from '@/components/ui/button';
import {Modal} from '@/components/ui/modal';
import {useAuth} from '@/hooks/use-auth';
import {proPhone} from '@/lib/pro/phone';
import {canonicalFieldValue,contactExtrasReadSchema,contactFieldKinds,contactFieldsReadSchema,type ContactExtrasRead,type ContactFieldDef,type ContactFieldKind,type ContactFieldsRead} from '@/lib/pro/contact-fields';

/**
 * Ronda F2-B (row 05): "Más datos" of a customer (company custom fields and additional phones/e-mails) in
 * the customer detail, and the company manager of custom-field definitions. SQL decides; every write keeps
 * its actionId until it is confirmed, so a retry never duplicates.
 */
const COPY={
 es:{title:'Más datos del cliente',makeMain:'Hacer principal',mainDone:'Ahora es el teléfono o correo principal.',edit:'Editar más datos',manage:'Campos personalizados',empty:'Sin datos adicionales. Agregue teléfonos, correos o los campos que su empresa usa.',noFields:'Su empresa aún no tiene campos personalizados.',
  phones:'Otros teléfonos',emails:'Otros correos',addPhone:'Agregar teléfono',addEmail:'Agregar correo',label:'Etiqueta',value:'Valor',remove:'Quitar',save:'Guardar',saving:'Guardando…',cancel:'Cancelar',saved:'Datos guardados.',
  loadError:'No se pudieron cargar los datos adicionales.',retry:'Reintentar',conflict:'El cliente cambió en otra pestaña. Se recargaron los datos; revise y vuelva a guardar.',invalid:'Revise los valores marcados.',repeated:'Ese teléfono o correo ya está en este cliente.',
  channelInvalid:'Revise los teléfonos y correos adicionales.',failed:'No se pudo guardar. Reintente: no se duplicará.',archived:'archivado',choose:'Elija…',none:'Sin dato',
  presets:['Móvil','Trabajo','Casa','WhatsApp','Facturación','Otro'],phone:'Teléfono',email:'Correo',history:'Historial',
  kinds:{text:'Texto',number:'Número',date:'Fecha',select:'Lista de opciones'} as Record<ContactFieldKind,string>,
  mTitle:'Campos personalizados de clientes',mIntro:'Defina los datos propios que su empresa guarda de cada cliente (por ejemplo, "Tipo de propiedad" o "Fecha de aniversario"). Se ven y se editan en la ficha del cliente y se pueden llenar al importar un archivo. Archivar no borra los datos guardados.',
  newField:'Nuevo campo',fieldName:'Nombre del campo',kind:'Tipo',options:'Opciones (una por línea, máximo 20)',create:'Crear campo',update:'Guardar cambios',archive:'Archivar',restore:'Restaurar',up:'Subir',down:'Bajar',editField:'Editar',
  usage:(n:number)=>n===1?'1 cliente con dato':`${n} clientes con dato`,active:(n:number)=>`${n} de 30 campos activos`,archivedList:'Archivados',
  capacity:'Ya hay 30 campos activos. Archive uno antes de crear otro.',kindInUse:'Ese campo ya tiene datos: no se puede cambiar su tipo.',optionInUse:'Hay clientes con esa opción: no se puede quitar.',fieldRepeated:'Ya existe un campo con ese nombre.',
  mConflict:'Los campos cambiaron en otra pestaña. Se recargó la lista.',roleDenied:'Solo la persona dueña, Administración o Gerencia pueden cambiar los campos.',close:'Cerrar',needName:'Escriba el nombre del campo.',fieldSaved:'Campo guardado.',order:'Orden guardado.',archivedOk:'Campo archivado. Sus datos se conservan.',restoredOk:'Campo restaurado.',needOptions:'Agregue al menos una opción.'},
 en:{title:'More customer details',makeMain:'Make main',mainDone:'It is now the main phone or e-mail.',edit:'Edit more details',manage:'Custom fields',empty:'No additional details. Add phones, e-mails or the fields your company uses.',noFields:'Your company has no custom fields yet.',
  phones:'Other phones',emails:'Other e-mails',addPhone:'Add phone',addEmail:'Add e-mail',label:'Label',value:'Value',remove:'Remove',save:'Save',saving:'Saving…',cancel:'Cancel',saved:'Details saved.',
  loadError:'Could not load the additional details.',retry:'Retry',conflict:'The customer changed in another tab. The details were reloaded; review them and save again.',invalid:'Check the highlighted values.',repeated:'That phone or e-mail is already on this customer.',
  channelInvalid:'Check the additional phones and e-mails.',failed:'Could not save. Try again: nothing will be duplicated.',archived:'archived',choose:'Choose…',none:'No value',
  presets:['Mobile','Work','Home','WhatsApp','Billing','Other'],phone:'Phone',email:'E-mail',history:'History',
  kinds:{text:'Text',number:'Number',date:'Date',select:'List of options'} as Record<ContactFieldKind,string>,
  mTitle:'Customer custom fields',mIntro:'Define the details your company keeps about each customer (for example, "Property type" or "Anniversary date"). They are shown and edited in the customer record and can be filled when importing a file. Archiving does not delete saved values.',
  newField:'New field',fieldName:'Field name',kind:'Type',options:'Options (one per line, 20 at most)',create:'Create field',update:'Save changes',archive:'Archive',restore:'Restore',up:'Move up',down:'Move down',editField:'Edit',
  usage:(n:number)=>n===1?'1 customer with a value':`${n} customers with a value`,active:(n:number)=>`${n} of 30 active fields`,archivedList:'Archived',
  capacity:'There are already 30 active fields. Archive one before creating another.',kindInUse:'That field already has values: its type cannot change.',optionInUse:'Some customers use that option: it cannot be removed.',fieldRepeated:'A field with that name already exists.',
  mConflict:'The fields changed in another tab. The list was reloaded.',roleDenied:'Only the owner, Administrator or Manager can change the fields.',close:'Close',needName:'Type the field name.',fieldSaved:'Field saved.',order:'Order saved.',archivedOk:'Field archived. Its values are kept.',restoredOk:'Field restored.',needOptions:'Add at least one option.'},
};
type Copy=typeof COPY.es;
function useCopy():[Copy,string]{const lang=useLocale();return [(COPY as Record<string,Copy>)[lang]??COPY.es,lang==='en'?'en-US':'es-CR'];}
const field='mt-1 min-h-11 w-full rounded-xl border border-[#d7e1ea] bg-white px-3 text-base text-[#162543]';
async function get(url:string,actor:string){const r=await fetch(url,{cache:'no-store',headers:{'X-Pro-Expected-Actor':actor}});if(!r.ok)throw Error(String(r.status));return r.json();}
async function post(body:unknown,actor:string){const r=await fetch('/api/pro/client-contacts/fields',{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json','X-Pro-Expected-Actor':actor},body:JSON.stringify(body)});let data:Record<string,unknown>|null=null;try{data=await r.json();}catch{}return {status:r.status,ok:r.ok,data};}
function display(f:ContactFieldDef,v:string,locale:string){if(f.kind==='date'){const d=new Date(v+'T12:00:00Z');return Number.isNaN(d.getTime())?v:new Intl.DateTimeFormat(locale,{dateStyle:'long',timeZone:'UTC'}).format(d);}if(f.kind==='number'){const n=Number(v);return Number.isFinite(n)?new Intl.NumberFormat(locale,{maximumFractionDigits:4}).format(n):v;}return v;}

type Channel={kind:'phone'|'email';value:string;label:string};
export function ClientContactExtras({clientId,disabled}:{clientId:string;disabled?:boolean}){
 const {user,loading}=useAuth();if(loading||!user)return null;return <ContactExtrasPanel actor={user.id} clientId={clientId} disabled={!!disabled}/>;
}
function ContactExtrasPanel({actor,clientId,disabled}:{actor:string;clientId:string;disabled:boolean}){
 const [c,locale]=useCopy();
 const [fields,setFields]=useState<ContactFieldsRead|null>(null),[extras,setExtras]=useState<ContactExtrasRead|null>(null),[loadError,setLoadError]=useState(false);
 const [editing,setEditing]=useState(false),[values,setValues]=useState<Record<string,string>>({}),[channels,setChannels]=useState<Channel[]>([]),[bad,setBad]=useState<Set<string>>(new Set());
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[manage,setManage]=useState(false),pending=useRef<{key:string;actionId:string}|null>(null);
 const load=useCallback(async()=>{try{setLoadError(false);const [f,e]=await Promise.all([get('/api/pro/client-contacts/fields?view=fields',actor),get('/api/pro/client-contacts/fields?'+new URLSearchParams({view:'extras',clientId}),actor)]);setFields(contactFieldsReadSchema.parse(f));setExtras(contactExtrasReadSchema.parse(e));}catch{setLoadError(true);}},[actor,clientId]);
 useEffect(()=>{const timer=setTimeout(()=>void load(),0);return()=>clearTimeout(timer);},[load]);
 const active=fields?.fields.filter(f=>!f.archived)??[],valueOf=(id:string)=>extras?.values.find(v=>v.fieldId===id)?.value??'';
 function startEdit(){if(!extras)return;setValues(Object.fromEntries(active.map(f=>[f.id,valueOf(f.id)])));setChannels(extras.channels.map(({kind,value,label})=>({kind,value,label})));setBad(new Set());setError('');setNotice('');pending.current=null;setEditing(true);}
 async function save(){if(!extras||busy)return;
  const wrong=new Set(active.filter(f=>canonicalFieldValue(f.kind,f.options,values[f.id]??'')===null).map(f=>f.id));setBad(wrong);if(wrong.size){setError(c.invalid);return;}
  const body={values:Object.fromEntries(active.map(f=>[f.id,(values[f.id]??'').trim()||null])),channels:channels.filter(x=>x.value.trim()).map(x=>({kind:x.kind,value:x.value.trim(),label:x.label.trim()}))},key=JSON.stringify([extras.revision,body]);
  if(pending.current?.key!==key)pending.current={key,actionId:crypto.randomUUID()};
  setBusy(true);setError('');setNotice('');
  try{const r=await post({action:'extras_save',actionId:pending.current.actionId,revision:extras.revision,clientId,...body},actor);
   if(r.status===409){pending.current=null;setError(c.conflict);await load();setEditing(false);return;}
   if(r.status===400){pending.current=null;const reason=r.data?.reason;if(reason==='field_value'&&typeof r.data?.fieldId==='string'){setBad(new Set([r.data.fieldId as string]));setError(c.invalid);}else setError(reason==='pro_contact_channel_repeated'?c.repeated:reason==='pro_contact_channel_invalid'?c.channelInvalid:c.invalid);return;}
   if(!r.ok)throw Error();pending.current=null;setEditing(false);setNotice(c.saved);await load();}
  catch{setError(c.failed);}finally{setBusy(false);}}

 async function promote(channelId:string){if(busy)return;setBusy(true);setError('');setNotice('');
  try{const r=await fetch('/api/pro/client-contacts/promote-channel',{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json','X-Pro-Expected-Actor':actor},body:JSON.stringify({action:'channel_promote',actionId:crypto.randomUUID(),clientId,channelId})});
   if(r.status===409){setError(c.conflict);await load();return;}if(!r.ok)throw Error(String(r.status));setNotice(c.mainDone);await load();}
  catch{setError(c.failed);}finally{setBusy(false);}}
 const archivedWithValue=(fields?.fields.filter(f=>f.archived&&valueOf(f.id))??[]);
 const phones=extras?.channels.filter(x=>x.kind==='phone')??[],emails=extras?.channels.filter(x=>x.kind==='email')??[];
 const nothing=extras&&!extras.values.length&&!extras.channels.length;
 return <section data-contact-extras aria-label={c.title} className="min-w-0 space-y-3 rounded-2xl border border-[#d7e1ea] bg-white p-4">
  <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold text-[#162543]">{c.title}</h3>
   <div className="flex flex-wrap gap-2">{!editing&&extras&&<Button type="button" size="sm" variant="secondary" data-pro-write="sales.write" data-contact-extras-edit disabled={disabled} onClick={startEdit}>{c.edit}</Button>}
    <Button type="button" size="sm" variant="ghost" data-contact-fields-manage onClick={()=>setManage(true)}>{c.manage}</Button></div></div>
  {loadError&&<p role="alert" className="text-sm">{c.loadError} <Button size="sm" variant="outline" onClick={()=>void load()}>{c.retry}</Button></p>}
  {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}{notice&&<p role="status" data-contact-extras-notice className="text-sm text-[#1f6f43]">{notice}</p>}
  {!editing&&extras&&fields&&<>
   {nothing&&<p className="text-sm text-[#52627a]">{c.empty}</p>}
   {(active.some(f=>valueOf(f.id))||archivedWithValue.length>0)&&<dl className="grid gap-x-4 gap-y-2 sm:grid-cols-2">{[...active.filter(f=>valueOf(f.id)),...archivedWithValue].map(f=><div key={f.id} data-contact-extras-value={f.id} className="min-w-0"><dt className="text-xs font-semibold uppercase tracking-wide text-[#68778d]">{f.label}{f.archived?` (${c.archived})`:''}</dt><dd className="break-words text-sm text-[#162543]">{display(f,valueOf(f.id),locale)}</dd></div>)}</dl>}
   {phones.length>0&&<div><p className="text-xs font-semibold uppercase tracking-wide text-[#68778d]">{c.phones}</p><ul className="mt-1 space-y-1">{phones.map(p=><li key={p.id} data-contact-extras-channel="phone" className="flex flex-wrap items-center gap-2 text-sm"><a className="text-[#00739c] underline-offset-2 hover:underline" href={'tel:'+p.value.replace(/[^0-9+]/g,'')}>{proPhone(p.value)||p.value}</a>{p.label&&<span className="ml-2 rounded-full bg-[#eef2f6] px-2 py-0.5 text-xs text-[#52627a]">{p.label}</span>}<Button type="button" size="sm" variant="ghost" data-pro-write="sales.write" data-contact-extras-promote={p.id} disabled={disabled||busy} onClick={()=>void promote(p.id)}>{c.makeMain}</Button></li>)}</ul></div>}
   {emails.length>0&&<div><p className="text-xs font-semibold uppercase tracking-wide text-[#68778d]">{c.emails}</p><ul className="mt-1 space-y-1">{emails.map(p=><li key={p.id} data-contact-extras-channel="email" className="flex flex-wrap items-center gap-2 break-all text-sm"><a className="text-[#00739c] underline-offset-2 hover:underline" href={'mailto:'+p.value}>{p.value}</a>{p.label&&<span className="ml-2 rounded-full bg-[#eef2f6] px-2 py-0.5 text-xs text-[#52627a]">{p.label}</span>}<Button type="button" size="sm" variant="ghost" data-pro-write="sales.write" data-contact-extras-promote={p.id} disabled={disabled||busy} onClick={()=>void promote(p.id)}>{c.makeMain}</Button></li>)}</ul></div>}
  </>}
  {editing&&fields&&<div className="space-y-4" data-contact-extras-form>
   {active.length===0?<p className="text-sm text-[#52627a]">{c.noFields}</p>:<div className="grid gap-3 sm:grid-cols-2">{active.map(f=><label key={f.id} className="block min-w-0 text-sm font-semibold text-[#162543]">{f.label}
    {f.kind==='select'?<select data-contact-extras-input={f.id} aria-invalid={bad.has(f.id)} className={field+(bad.has(f.id)?' border-red-500':'')} value={values[f.id]??''} disabled={busy} onChange={e=>{setValues({...values,[f.id]:e.target.value});if(bad.has(f.id)){const next=new Set(bad);next.delete(f.id);setBad(next);if(!next.size)setError('');}}}><option value="">{c.none}</option>{f.options.map(o=><option key={o} value={o}>{o}</option>)}{values[f.id]&&!f.options.includes(values[f.id])&&<option value={values[f.id]}>{values[f.id]}</option>}</select>
     :<input data-contact-extras-input={f.id} aria-invalid={bad.has(f.id)} className={field+(bad.has(f.id)?' border-red-500':'')} type={f.kind==='date'?'date':'text'} inputMode={f.kind==='number'?'decimal':undefined} maxLength={500} value={values[f.id]??''} disabled={busy} onChange={e=>{setValues({...values,[f.id]:e.target.value});if(bad.has(f.id)){const next=new Set(bad);next.delete(f.id);setBad(next);if(!next.size)setError('');}}}/>}</label>)}</div>}
   <div className="space-y-2"><datalist id={'contact-channel-labels-'+clientId}>{c.presets.map(p=><option key={p} value={p}/>)}</datalist>
    {channels.map((ch,i)=><div key={i} data-contact-extras-channel-row={i} className="grid min-w-0 grid-cols-[minmax(0,7rem)_minmax(0,1fr)] gap-2 rounded-xl border border-[#eef2f6] p-2 sm:grid-cols-[8rem_minmax(0,1fr)_9rem_auto] sm:items-end">
     <label className="block text-xs font-semibold">{c.kind}<select className={field} value={ch.kind} disabled={busy} onChange={e=>setChannels(channels.map((x,j)=>j===i?{...x,kind:e.target.value as Channel['kind']}:x))}><option value="phone">{c.phone}</option><option value="email">{c.email}</option></select></label>
     <label className="block min-w-0 text-xs font-semibold">{c.value}<input data-contact-extras-channel-value={i} className={field} type={ch.kind==='email'?'email':'tel'} inputMode={ch.kind==='email'?'email':'tel'} maxLength={ch.kind==='email'?254:30} value={ch.value} disabled={busy} onChange={e=>setChannels(channels.map((x,j)=>j===i?{...x,value:e.target.value}:x))}/></label>
     <label className="block min-w-0 text-xs font-semibold">{c.label}<input data-contact-extras-channel-label={i} list={'contact-channel-labels-'+clientId} className={field} maxLength={30} value={ch.label} disabled={busy} onChange={e=>setChannels(channels.map((x,j)=>j===i?{...x,label:e.target.value}:x))}/></label>
     <Button type="button" size="sm" variant="ghost" className="self-end justify-self-end text-[#8b1c1c] sm:justify-self-start" disabled={busy} onClick={()=>setChannels(channels.filter((_,j)=>j!==i))}>{c.remove}</Button></div>)}
    <div className="flex flex-wrap gap-2"><Button type="button" size="sm" variant="outline" data-contact-extras-add="phone" disabled={busy||channels.length>=10} onClick={()=>setChannels([...channels,{kind:'phone',value:'',label:c.presets[0]}])}>+ {c.addPhone}</Button><Button type="button" size="sm" variant="outline" data-contact-extras-add="email" disabled={busy||channels.length>=10} onClick={()=>setChannels([...channels,{kind:'email',value:'',label:c.presets[1]}])}>+ {c.addEmail}</Button></div></div>
   <div className="flex flex-wrap gap-2 border-t border-[#eef2f6] pt-3"><Button type="button" data-pro-write="sales.write" data-contact-extras-save disabled={busy} onClick={()=>void save()}>{busy?c.saving:c.save}</Button><Button type="button" variant="secondary" disabled={busy} onClick={()=>{setEditing(false);setError('');}}>{c.cancel}</Button></div>
  </div>}
  {manage&&<ContactFieldsManager actor={actor} onClose={()=>setManage(false)} onChanged={()=>void load()}/>}
 </section>;
}

type Draft={id:string;label:string;kind:ContactFieldKind;options:string};
export function ContactFieldsManager({actor,onClose,onChanged}:{actor:string;onClose:()=>void;onChanged?:()=>void}){
 const [c]=useCopy();
 const [data,setData]=useState<ContactFieldsRead|null>(null),[loadError,setLoadError]=useState(false),[draft,setDraft]=useState<Draft|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),pending=useRef<{key:string;actionId:string}|null>(null);
 const load=useCallback(async()=>{try{setLoadError(false);setData(contactFieldsReadSchema.parse(await get('/api/pro/client-contacts/fields?view=fields',actor)));}catch{setLoadError(true);}},[actor]);
 useEffect(()=>{const timer=setTimeout(()=>void load(),0);return()=>clearTimeout(timer);},[load]);
 const active=data?.fields.filter(f=>!f.archived)??[],archived=data?.fields.filter(f=>f.archived)??[];
 async function send(input:Record<string,unknown>,ok:string){if(!data||busy)return false;const body={...input,revision:data.revision},key=JSON.stringify(body);if(pending.current?.key!==key)pending.current={key,actionId:crypto.randomUUID()};
  setBusy(true);setError('');setNotice('');
  try{const r=await post({...body,actionId:pending.current.actionId},actor);
   if(r.status===403){pending.current=null;setError(c.roleDenied);return false;}
   if(r.status===409){pending.current=null;setError(r.data?.reason==='field_repeated'?c.fieldRepeated:c.mConflict);await load();return false;}
   if(r.status===400){pending.current=null;const reason=r.data?.reason;setError(reason==='pro_contact_field_capacity'?c.capacity:reason==='pro_contact_field_kind_in_use'?c.kindInUse:reason==='pro_contact_field_option_in_use'?c.optionInUse:c.invalid);return false;}
   if(!r.ok)throw Error();pending.current=null;setData(contactFieldsReadSchema.parse({revision:r.data?.revision,capacity:r.data?.capacity,fields:r.data?.fields}));setNotice(ok);onChanged?.();return true;}
  catch{setError(c.failed);return false;}finally{setBusy(false);}}
 async function saveDraft(){if(!draft)return;const label=draft.label.trim(),options=draft.kind==='select'?[...new Set(draft.options.split('\n').map(o=>o.trim()).filter(Boolean))].slice(0,20):[];
  if(!label){setError(c.needName);return;}if(draft.kind==='select'&&!options.length){setError(c.needOptions);return;}
  if(await send({action:'field_save',id:draft.id,label,kind:draft.kind,options},c.fieldSaved))setDraft(null);}
 function move(i:number,dir:-1|1){const ids=active.map(f=>f.id),j=i+dir;if(j<0||j>=ids.length)return;[ids[i],ids[j]]=[ids[j],ids[i]];void send({action:'field_reorder',ids},c.order);}
 return <Modal manageFocus open size="lg" title={c.mTitle} ariaLabel={c.mTitle} closeLabel={c.close} onClose={()=>{if(!busy)onClose();}}>
  <div data-contact-fields-manager className="min-w-0 space-y-4">
   <p className="text-sm text-[#52627a]">{c.mIntro}</p>
   {loadError&&<p role="alert" className="text-sm">{c.loadError} <Button size="sm" variant="outline" onClick={()=>void load()}>{c.retry}</Button></p>}
   {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}{notice&&<p role="status" data-contact-fields-notice className="text-sm text-[#1f6f43]">{notice}</p>}
   {data&&<div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-semibold text-[#162543]" data-contact-fields-count={active.length}>{c.active(active.length)}</p>
    {!draft&&<Button type="button" size="sm" data-pro-write="sales.write" data-contact-fields-new disabled={busy||active.length>=30} onClick={()=>{setDraft({id:crypto.randomUUID(),label:'',kind:'text',options:''});setError('');setNotice('');}}>+ {c.newField}</Button>}</div>}
   {draft&&<div data-contact-fields-draft className="space-y-3 rounded-2xl border border-[#b9dceb] bg-[#f4fafd] p-4">
    <div className="grid gap-3 sm:grid-cols-2"><label className="block text-sm font-semibold">{c.fieldName}<input data-contact-fields-label className={field} maxLength={60} value={draft.label} disabled={busy} onChange={e=>setDraft({...draft,label:e.target.value})}/></label>
     <label className="block text-sm font-semibold">{c.kind}<select data-contact-fields-kind className={field} value={draft.kind} disabled={busy} onChange={e=>setDraft({...draft,kind:e.target.value as ContactFieldKind})}>{contactFieldKinds.map(k=><option key={k} value={k}>{c.kinds[k]}</option>)}</select></label></div>
    {draft.kind==='select'&&<label className="block text-sm font-semibold">{c.options}<textarea data-contact-fields-options rows={4} className={field+' py-2'} value={draft.options} disabled={busy} onChange={e=>setDraft({...draft,options:e.target.value})}/></label>}
    <div className="flex flex-wrap gap-2"><Button type="button" data-pro-write="sales.write" data-contact-fields-save disabled={busy} onClick={()=>void saveDraft()}>{data?.fields.some(f=>f.id===draft.id)?c.update:c.create}</Button><Button type="button" variant="secondary" disabled={busy} onClick={()=>{setDraft(null);setError('');}}>{c.cancel}</Button></div></div>}
   {data&&active.length===0&&!draft&&<p className="text-sm text-[#52627a]">{c.noFields}</p>}
   <ul className="space-y-2">{active.map((f,i)=><li key={f.id} data-contact-fields-item={f.label} className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-xl border border-[#d7e1ea] bg-white p-3">
    <div className="min-w-0"><p className="break-words font-semibold text-[#162543]">{f.label}</p><p className="text-xs text-[#52627a]">{c.kinds[f.kind]}{f.kind==='select'?` · ${f.options.join(', ')}`:''} · {c.usage(f.usage)}</p></div>
    <div className="flex flex-wrap gap-1"><Button type="button" size="sm" variant="ghost" aria-label={`${c.up}: ${f.label}`} disabled={busy||i===0} onClick={()=>move(i,-1)}>↑</Button><Button type="button" size="sm" variant="ghost" aria-label={`${c.down}: ${f.label}`} disabled={busy||i===active.length-1} onClick={()=>move(i,1)}>↓</Button>
     <Button type="button" size="sm" variant="outline" data-pro-write="sales.write" data-contact-fields-edit={f.label} disabled={busy} onClick={()=>{setDraft({id:f.id,label:f.label,kind:f.kind,options:f.options.join('\n')});setError('');setNotice('');}}>{c.editField}</Button>
     <Button type="button" size="sm" variant="outline" data-pro-write="sales.write" data-contact-fields-archive={f.label} disabled={busy} onClick={()=>void send({action:'field_archive',id:f.id},c.archivedOk)}>{c.archive}</Button></div></li>)}</ul>
   {archived.length>0&&<details><summary className="cursor-pointer py-2 font-semibold">{c.archivedList} ({archived.length})</summary><ul className="space-y-2">{archived.map(f=><li key={f.id} className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-xl border border-[#eef2f6] p-3"><div className="min-w-0"><p className="break-words text-[#52627a]">{f.label}</p><p className="text-xs text-[#68778d]">{c.kinds[f.kind]} · {c.usage(f.usage)}</p></div>
    <Button type="button" size="sm" variant="outline" data-pro-write="sales.write" data-contact-fields-restore={f.label} disabled={busy} onClick={()=>void send({action:'field_restore',id:f.id},c.restoredOk)}>{c.restore}</Button></li>)}</ul></details>}
  </div>
 </Modal>;
}
export function ContactFieldsManagerDialog({onClose}:{onClose:()=>void}){const {user,loading}=useAuth();if(loading||!user)return null;return <ContactFieldsManager actor={user.id} onClose={onClose}/>;}
