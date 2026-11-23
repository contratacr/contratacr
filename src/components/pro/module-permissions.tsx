'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {useLocale} from 'next-intl';
import {Button} from '@/components/ui/button';
import {roleLabel} from '@/lib/pro/team-roles';
import {actionLabel,modulePermissionsResultSchema,modulePermissionsSchema,moduleLabel,normalizeDenies,PERMISSION_ACTIONS,type ModuleDenies,type ModulePermissions} from '@/lib/pro/module-permissions';

/**
 * Row 17 (404): permissions by module and action. For each role (and custom role) the Administrator unticks what
 * that role must NOT do in a module: view, create/edit, delete, export/print. It never grants more than the role
 * already has; the server gate (pro_team_route_authorize) answers 403 and the interface hides the controls.
 */
const card='rounded-2xl border border-[#d7e1ea] bg-white p-4 space-y-3';
const control='block min-h-11 w-full min-w-0 rounded-xl border border-[#d7e1ea] bg-white px-3 py-2 text-base';
export function ModulePermissionsPanel(){
 const en=useLocale()==='en',t=(es:string,english:string)=>en?english:es;
 const [data,setData]=useState<ModulePermissions|null>(null),[failed,setFailed]=useState(false),[subject,setSubject]=useState('manager'),[draft,setDraft]=useState<ModuleDenies>({}),[dirty,setDirty]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),pending=useRef<{key:string;id:string}|null>(null);
 const load=useCallback(async()=>{try{const r=await fetch('/api/pro/team-roles/modules',{cache:'no-store'});if(!r.ok)throw Error();const v=modulePermissionsSchema.parse(await r.json());setData(v);setDraft(v.denies);setDirty(false);setFailed(false);}catch{setFailed(true);}},[]);
 useEffect(()=>{const timer=setTimeout(()=>void load(),0);return()=>clearTimeout(timer);},[load]);
 if(failed)return <div className={card} role="alert"><p>{t('No se pudieron cargar los permisos por módulo.','Could not load module permissions.')}</p><Button variant="outline" onClick={()=>void load()}>{t('Reintentar','Retry')}</Button></div>;
 if(!data)return <p role="status" className="text-sm text-[#52627a]">{t('Cargando permisos por módulo…','Loading module permissions…')}</p>;
 const current=draft[subject]??{},canManage=data.canManage;
 const toggle=(m:string,a:string,deny:boolean)=>{const list=new Set<string>((current as Record<string,string[]>)[m]??[]);if(deny)list.add(a);else list.delete(a);setDraft({...draft,[subject]:{...current,[m]:[...list]}} as ModuleDenies);setDirty(true);setMessage('');};
 async function save(){
  if(busy||!data)return;const body={action:'save' as const,revision:data.revision,denies:normalizeDenies(draft)},key=JSON.stringify(body);
  if(pending.current?.key!==key)pending.current={key,id:crypto.randomUUID()};setBusy(true);setMessage('');
  try{const r=await fetch('/api/pro/team-roles/modules',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,actionId:pending.current.id})});const res=await r.json().catch(()=>({}));
   if(!r.ok){if(r.status===409)pending.current=null;setMessage(typeof res.error==='string'?res.error:t('No se pudo guardar.','Could not save.'));await load();return;}
   modulePermissionsResultSchema.parse(res);pending.current=null;setMessage(t('Permisos guardados.','Permissions saved.'));await load();}
  catch{setMessage(t('No se pudo comprobar el cambio. Reintente: no se duplicará.','Could not confirm the change. Retry: it will not be duplicated.'));}finally{setBusy(false);}
 }
 const name=(s:ModulePermissions['subjects'][number])=>s.kind==='role'?roleLabel(s.name,en):s.name;
 return <div data-module-permissions className={card}>
  <div><h3 className="font-semibold">{t('Permisos por módulo','Permissions by module')}</h3><p className="text-sm text-[#52627a]">{t('Elija un rol y marque lo que NO debe poder hacer en cada módulo. Solo se pueden quitar permisos; el Administrador nunca se restringe. Crear y editar comparten las mismas rutas del servidor.','Pick a role and tick what it must NOT be able to do in each module. Permissions can only be removed; the Administrator is never restricted. Create and edit share the same server routes.')}</p></div>
  {message&&<p role="status" className="rounded-xl bg-[#f7f9fc] p-2 text-sm">{message}</p>}
  <label className="block text-sm font-semibold">{t('Rol','Role')}<select data-module-subject className={control+' mt-1 sm:w-72'} value={subject} disabled={busy} onChange={e=>setSubject(e.target.value)}>{data.subjects.map(s=><option key={s.key} value={s.key}>{name(s)}</option>)}</select></label>
  <div className="overflow-x-auto"><table className="w-full min-w-[34rem] text-left text-sm"><thead><tr><th className="py-2 pr-2">{t('Módulo','Module')}</th>{PERMISSION_ACTIONS.map(a=><th key={a} className="px-2 py-2">{t('Quitar: ','Deny: ')}{actionLabel(a,en)}</th>)}</tr></thead>
   <tbody>{data.modules.map(m=><tr key={m} className="border-t border-[#eef2f6]"><td className="py-2 pr-2">{moduleLabel(m,en)}</td>{PERMISSION_ACTIONS.map(a=>{const locked=m==='work'&&a==='view';const on=!!(current as Record<string,string[]>)[m]?.includes(a);return <td key={a} className="px-2 py-1"><input type="checkbox" className="h-5 w-5" data-module-deny={m+':'+a} aria-label={moduleLabel(m,en)+' · '+actionLabel(a,en)} checked={on} disabled={busy||!canManage||locked} onChange={e=>toggle(m,a,e.target.checked)}/></td>;})}</tr>)}</tbody></table></div>
  {canManage&&<div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" disabled={busy||!dirty} onClick={()=>{setDraft(data.denies);setDirty(false);}}>{t('Descartar','Discard')}</Button><Button type="button" data-module-save disabled={busy||!dirty} onClick={()=>void save()}>{busy?t('Guardando…','Saving…'):t('Guardar permisos','Save permissions')}</Button></div>}
 </div>;
}
