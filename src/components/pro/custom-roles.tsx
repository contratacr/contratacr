'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {useLocale} from 'next-intl';
import {Button} from '@/components/ui/button';
import {capabilityLabel,roleLabel} from '@/lib/pro/team-roles';
import {customRoleResultSchema,customRolesSchema,type CustomRoles} from '@/lib/pro/operations';

/**
 * Ronda F2-C (row 17): custom roles of the company. A custom role is a copy of a base role (Administrator,
 * Manager, Member, Read-only) that can only take permissions away; it never grants more than its base. The
 * server applies it to every Pro write (pro_role_require) and the interface hides what it no longer allows.
 */
type Draft={id:string;revision:number;name:string;baseRole:'admin'|'manager'|'member'|'read_only';caps:string[]};
const card='rounded-2xl border border-[#d7e1ea] bg-white p-4 space-y-3';
const control='block min-h-11 w-full min-w-0 rounded-xl border border-[#d7e1ea] bg-white px-3 py-2 text-base';
export function CustomRolesPanel(){
 const en=useLocale()==='en',t=(es:string,english:string)=>en?english:es;
 const [data,setData]=useState<CustomRoles|null>(null),[failed,setFailed]=useState(false),[draft,setDraft]=useState<Draft|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),pending=useRef<{key:string;id:string}|null>(null);
 const load=useCallback(async()=>{try{const r=await fetch('/api/pro/team-roles/custom',{cache:'no-store'});if(!r.ok)throw Error();setData(customRolesSchema.parse(await r.json()));setFailed(false);}catch{setFailed(true);}},[]);
 useEffect(()=>{const timer=setTimeout(()=>void load(),0);return()=>clearTimeout(timer);},[load]);
 async function send(body:Record<string,unknown>,done:string){
  if(busy)return false;const key=JSON.stringify(body);if(pending.current?.key!==key)pending.current={key,id:crypto.randomUUID()};
  setBusy(true);setMessage('');
  try{const r=await fetch('/api/pro/team-roles/custom',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,actionId:pending.current.id})});const res=await r.json().catch(()=>({}));
   if(!r.ok){if(r.status===409)pending.current=null;setMessage(typeof res.error==='string'?res.error:t('No se pudo guardar.','Could not save.'));await load();return false;}
   customRoleResultSchema.parse(res);pending.current=null;setMessage(done);await load();return true;}
  catch{setMessage(t('No se pudo comprobar el cambio. Reintente: no se duplicará.','Could not confirm the change. Retry: it will not be duplicated.'));return false;}finally{setBusy(false);}
 }
 if(failed)return <div className={card} role="alert"><p>{t('No se pudieron cargar los roles personalizados.','Could not load custom roles.')}</p><Button variant="outline" onClick={()=>void load()}>{t('Reintentar','Retry')}</Button></div>;
 if(!data)return <p role="status" className="text-sm text-[#52627a]">{t('Cargando roles personalizados…','Loading custom roles…')}</p>;
 const base=draft?data.matrix[draft.baseRole]??[]:[];
 const startClone=(role:Draft['baseRole'])=>{setDraft({id:crypto.randomUUID(),revision:0,name:t('Copia de ','Copy of ')+roleLabel(role,en),baseRole:role,caps:[...(data.matrix[role]??[])]});setMessage('');};
 const active=data.roles.filter(r=>!r.archived),archived=data.roles.filter(r=>r.archived);
 return <div data-custom-roles className={card}>
  <div><h3 className="font-semibold">{t('Roles personalizados','Custom roles')}</h3><p className="text-sm text-[#52627a]">{t('Copie un rol y quite los permisos que no necesita. Un rol personalizado nunca da más permisos que el rol del que parte.','Copy a role and remove the permissions it does not need. A custom role never grants more than the role it starts from.')}</p></div>
  {message&&<p role="status" className="rounded-xl bg-[#f7f9fc] p-2 text-sm">{message}</p>}
  {data.canManage&&!draft&&<div className="flex flex-wrap gap-2">{(['manager','member','read_only'] as const).map(r=><Button key={r} type="button" variant="outline" data-custom-role-clone={r} disabled={busy} onClick={()=>startClone(r)}>{t('Copiar ','Copy ')}{roleLabel(r,en)}</Button>)}</div>}
  {draft&&<form data-custom-role-form className="space-y-3 rounded-xl border border-[#008fb8] bg-[#f7fbfd] p-3" onSubmit={event=>{event.preventDefault();void send({action:'save',roleId:draft.id,revision:draft.revision,name:draft.name.trim(),baseRole:draft.baseRole,capabilities:draft.caps},t('Rol guardado.','Role saved.')).then(ok=>{if(ok)setDraft(null);});}}>
   <label className="block text-sm font-semibold">{t('Nombre del rol','Role name')}<input required maxLength={40} className={control+' mt-1'} value={draft.name} disabled={busy} onChange={e=>setDraft({...draft,name:e.target.value})}/></label>
   <p className="text-sm text-[#52627a]">{t('Parte de: ','Based on: ')}<strong>{roleLabel(draft.baseRole,en)}</strong></p>
   <fieldset className="space-y-1"><legend className="text-sm font-semibold">{t('Permisos','Permissions')}</legend>{base.map(c=><label key={c} className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" data-custom-role-cap={c} className="h-5 w-5" checked={draft.caps.includes(c)} disabled={busy||c==='read'} onChange={e=>setDraft({...draft,caps:e.target.checked?[...draft.caps,c]:draft.caps.filter(x=>x!==c)})}/>{capabilityLabel(c,en)}</label>)}</fieldset>
   <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={()=>setDraft(null)}>{t('Cancelar','Cancel')}</Button><Button type="submit" disabled={busy||!draft.name.trim()}>{busy?t('Guardando…','Saving…'):t('Guardar rol','Save role')}</Button></div>
  </form>}
  {active.length===0&&!draft&&<p className="text-sm">{t('Todavía no hay roles personalizados.','No custom roles yet.')}</p>}
  {active.map(role=><div key={role.id} data-custom-role={role.name} className="space-y-1 border-t border-[#eef2f6] pt-2">
   <div className="flex flex-wrap items-center justify-between gap-2"><p className="min-w-0 break-words font-semibold">{role.name} <span className="ml-1 rounded-lg bg-[#eaf7fb] px-2 py-0.5 text-xs font-semibold text-[#00739a]">{t('Basado en ','Based on ')}{roleLabel(role.baseRole,en)}</span></p>
    {data.canManage&&<div className="flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={busy} onClick={()=>setDraft({id:role.id,revision:role.revision,name:role.name,baseRole:role.baseRole,caps:role.capabilities})}>{t('Editar','Edit')}</Button><Button type="button" variant="outline" disabled={busy||role.members>0} title={role.members>0?t('Quite primero a las personas que lo usan.','Remove the people using it first.'):undefined} onClick={()=>void send({action:'archive',roleId:role.id,revision:role.revision},t('Rol archivado.','Role archived.'))}>{t('Archivar','Archive')}</Button></div>}</div>
   <p className="text-sm text-[#52627a]">{(data.matrix[role.baseRole]??[]).filter(c=>!role.capabilities.includes(c)).map(c=>capabilityLabel(c,en)).join(' · ')?t('Sin: ','Without: ')+(data.matrix[role.baseRole]??[]).filter(c=>!role.capabilities.includes(c)).map(c=>capabilityLabel(c,en)).join(' · '):t('Mismos permisos que su rol base.','Same permissions as its base role.')}</p>
  </div>)}
  {data.assignments.length>0&&active.length>0&&<div data-custom-role-assignments className="space-y-2 border-t border-[#eef2f6] pt-2"><p className="text-sm font-semibold">{t('Asignar a integrantes','Assign to members')}</p>{data.assignments.map(a=>{const options=active.filter(r=>r.baseRole===a.role);return <label key={a.memberId} className="flex min-w-0 flex-wrap items-center justify-between gap-2 text-sm"><span className="min-w-0 break-words">{a.memberName} · {roleLabel(a.role,en)}</span>
   <select aria-label={t('Rol personalizado de ','Custom role of ')+a.memberName} data-custom-role-assign={a.memberName} className={control+' sm:w-64'} value={a.customRoleId??''} disabled={busy||!data.canManage} onChange={e=>void send({action:'assign',memberId:a.memberId,roleId:e.target.value||null},t('Asignación guardada.','Assignment saved.'))}><option value="">{t('Sin rol personalizado','No custom role')}</option>{options.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}{a.customRoleId&&!options.some(r=>r.id===a.customRoleId)&&<option value={a.customRoleId}>{data.roles.find(r=>r.id===a.customRoleId)?.name??'—'}</option>}</select></label>;})}
   <p className="text-xs text-[#52627a]">{t('Solo se ofrecen los roles basados en el rol actual de cada integrante.','Only roles based on each member’s current role are offered.')}</p></div>}
  {archived.length>0&&<details className="text-sm"><summary className="min-h-11 cursor-pointer py-2 font-semibold">{t('Archivados','Archived')} ({archived.length})</summary>{archived.map(r=><div key={r.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-[#eef2f6] py-2"><span>{r.name}</span>{data.canManage&&<Button type="button" variant="outline" disabled={busy} onClick={()=>void send({action:'restore',roleId:r.id,revision:r.revision},t('Rol restaurado.','Role restored.'))}>{t('Restaurar','Restore')}</Button>}</div>)}</details>}
 </div>;
}
