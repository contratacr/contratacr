'use client';

import {useState} from 'react';
import {Button} from '@/components/ui/button';
import {projectColorHex,projectColorNames,projectColors,type ProjectColor} from '@/lib/pro/project-details';
import type {HubStatus} from '@/lib/pro/projects-hub';

/** Area A: small editors of the Projects list (custom Kanban statuses and project managers). */
const field='mt-1 block min-h-11 w-full min-w-0 rounded-xl border border-[#d7e1ea] bg-white px-3 py-2 text-base font-normal';
export async function hubSend(accountId:string,body:object){
 const response=await fetch('/api/pro/projects-hub',{method:'POST',headers:{'Content-Type':'application/json','X-Pro-Expected-Actor':accountId},body:JSON.stringify(body)});
 const data=await response.json().catch(()=>({}));if(!response.ok)throw Object.assign(Error(data.error||'error'),{status:response.status});return data as {ok:true;statuses:HubStatus[]};
}

export function StatusManager({accountId,en,statuses,onChanged,onClose}:{accountId:string;en:boolean;statuses:HubStatus[];onChanged:()=>void;onClose:()=>void}){
 const t=(es:string,english:string)=>en?english:es,[name,setName]=useState(''),[color,setColor]=useState<ProjectColor>('blue'),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function run(body:object){setBusy(true);setError('');try{await hubSend(accountId,body);onChanged();return true;}catch(e){const status=(e as {status?:number}).status;setError(status===409?t('Ya existe un estado con ese nombre.','A status with that name already exists.'):status===429?t('Puede tener hasta 20 estados.','You can have up to 20 statuses.'):t('No se pudo guardar. Intente de nuevo.','Could not save. Try again.'));return false;}finally{setBusy(false);}}
 async function add(){if(!name.trim())return;if(await run({action:'status_create',id:crypto.randomUUID(),name:name.trim(),color}))setName('');}
 const move=(index:number,step:number)=>{const ids=statuses.map(status=>status.id),target=index+step;if(target<0||target>=ids.length)return;[ids[index],ids[target]]=[ids[target],ids[index]];void run({action:'status_reorder',ids});};
 return <section data-status-manager aria-label={t('Estados personalizados','Custom statuses')} className="min-w-0 space-y-3 rounded-2xl border border-[#d7e1ea] bg-white p-4">
  <div className="flex items-start justify-between gap-3"><div><h2 className="text-lg font-bold">{t('Personalizar estados','Customize statuses')}</h2><p className="text-sm text-[#52627a]">{t('Defina las columnas del tablero. Un proyecto sin estado propio queda en la primera columna.','Define the board columns. A project without its own status stays in the first column.')}</p></div><Button type="button" variant="secondary" data-status-manager-close onClick={onClose}>{t('Cerrar','Close')}</Button></div>
  {error&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
  <ul className="space-y-2">{statuses.map((status,index)=><StatusRow key={status.id+status.name+status.color} status={status} en={en} busy={busy} first={index===0} last={index===statuses.length-1} onSave={(next,nextColor)=>run({action:'status_rename',id:status.id,name:next,color:nextColor})} onDelete={()=>run({action:'status_delete',id:status.id})} onMove={step=>move(index,step)}/>)}</ul>
  <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_10rem_auto] sm:items-end">
   <label className="text-sm font-semibold">{t('Nuevo estado','New status')}<input data-status-new-name maxLength={40} value={name} onChange={event=>setName(event.target.value)} className={field}/></label>
   <label className="text-sm font-semibold">{t('Color','Colour')}<select data-status-new-color value={color} onChange={event=>setColor(event.target.value as ProjectColor)} className={field}>{projectColors.map(value=><option key={value} value={value}>{projectColorNames[en?'en':'es'][value]}</option>)}</select></label>
   <Button type="button" data-status-add disabled={busy||!name.trim()||statuses.length>=20} onClick={()=>void add()}>{t('Agregar estado','Add status')}</Button>
  </div>
 </section>;
}
function StatusRow({status,en,busy,first,last,onSave,onDelete,onMove}:{status:HubStatus;en:boolean;busy:boolean;first:boolean;last:boolean;onSave:(name:string,color:ProjectColor)=>Promise<boolean>;onDelete:()=>Promise<boolean>;onMove:(step:number)=>void}){
 const t=(es:string,english:string)=>en?english:es,[name,setName]=useState(status.name),[color,setColor]=useState<ProjectColor>(status.color);
 return <li data-status-row={status.id} className="flex min-w-0 flex-wrap items-end gap-2">
  <span aria-hidden className="mb-3 h-3 w-3 shrink-0 rounded-full" style={{background:projectColorHex[color]}}/>
  <label className="min-w-0 flex-1 text-sm font-semibold"><span className="sr-only">{t('Nombre del estado','Status name')}</span><input maxLength={40} value={name} onChange={event=>setName(event.target.value)} className={field}/></label>
  <label className="w-36 text-sm font-semibold"><span className="sr-only">{t('Color','Colour')}</span><select value={color} onChange={event=>setColor(event.target.value as ProjectColor)} className={field}>{projectColors.map(value=><option key={value} value={value}>{projectColorNames[en?'en':'es'][value]}</option>)}</select></label>
  <Button type="button" variant="secondary" disabled={busy||!name.trim()||(name.trim()===status.name&&color===status.color)} onClick={()=>void onSave(name.trim(),color)}>{t('Guardar','Save')}</Button>
  <Button type="button" variant="secondary" aria-label={t('Subir estado','Move status up')} disabled={busy||first} onClick={()=>onMove(-1)}>↑</Button>
  <Button type="button" variant="secondary" aria-label={t('Bajar estado','Move status down')} disabled={busy||last} onClick={()=>onMove(1)}>↓</Button>
  <Button type="button" variant="secondary" disabled={busy} onClick={()=>void onDelete()}>{t('Eliminar','Delete')}</Button>
 </li>;
}

export function ManagersEditor({accountId,en,workId,current,pool,disabled,onSaved}:{accountId:string;en:boolean;workId:string;current:{id:string;name:string}[];pool:{id:string;name:string}[];disabled:boolean;onSaved:()=>void}){
 const t=(es:string,english:string)=>en?english:es,[open,setOpen]=useState(false),[picked,setPicked]=useState<string[]>(current.map(person=>person.id)),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const label=current.length?current.map(person=>person.name||t('Sin nombre','No name')).join(', '):t('Sin responsables','No managers');
 async function save(){setBusy(true);setError('');try{await hubSend(accountId,{action:'managers',workId,memberIds:picked});setOpen(false);onSaved();}catch{setError(t('No se pudo guardar. Intente de nuevo.','Could not save. Try again.'));}finally{setBusy(false);}}
 return <div data-project-managers={workId} className="min-w-0 text-sm">
  <button type="button" data-project-managers-toggle disabled={disabled} aria-expanded={open} onClick={()=>{setPicked(current.map(person=>person.id));setOpen(value=>!value);}} className="max-w-full break-words text-left text-[#006f93] underline-offset-2 hover:underline">{label}</button>
  {open&&<fieldset className="mt-2 min-w-0 space-y-1 rounded-xl border border-[#d7e1ea] bg-white p-3"><legend className="px-1 text-xs font-semibold text-[#52627a]">{t('Responsables del proyecto','Project managers')}</legend>
   {pool.length===0?<p className="text-xs text-[#52627a]">{t('Invite colaboradores a un proyecto para poder asignarlos como responsables.','Invite collaborators to a project to assign them as managers.')}</p>:pool.map(person=><label key={person.id} className="flex min-h-11 items-center gap-2"><input type="checkbox" className="h-5 w-5" checked={picked.includes(person.id)} onChange={event=>setPicked(old=>event.target.checked?[...old,person.id]:old.filter(id=>id!==person.id))}/><span className="min-w-0 break-words">{person.name||t('Sin nombre','No name')}</span></label>)}
   {error&&<p role="alert" className="text-xs text-red-700">{error}</p>}
   <div className="flex gap-2"><Button type="button" data-project-managers-save disabled={busy||pool.length===0} onClick={()=>void save()}>{t('Guardar','Save')}</Button><Button type="button" variant="secondary" onClick={()=>setOpen(false)}>{t('Cancelar','Cancel')}</Button></div>
  </fieldset>}
 </div>;
}
