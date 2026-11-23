'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {useLocale} from 'next-intl';
import {Button} from '@/components/ui/button';
import {Modal} from '@/components/ui/modal';
import {folderAccessMineSchema,folderAccessReadSchema,folderAccessResultSchema,type FolderAccessRead} from '@/lib/pro/company-folder-access';

/**
 * Row 31 (Ronda F2-E): permissions per folder of the company library. Default: only the owner. The owner picks, for each current
 * team member, "No access", "Can view" or "Can edit" on a folder (it covers subfolders and files). A member sees the folders shared
 * with them. Bulk actions, permanent delete, tags, versions and trash stay with the owner.
 */
const api='/api/pro/company-folder-access';
export function useCompanyFolderMine(actor:string){
 const [state,setState]=useState<{loaded:boolean;isMember:boolean;folders:Array<{id:string;name:string;level:'view'|'edit'}>}>({loaded:false,isMember:false,folders:[]});
 useEffect(()=>{let live=true;const timer=setTimeout(()=>{void(async()=>{try{const r=await fetch(api+'?view=mine',{cache:'no-store',headers:{'X-Pro-Expected-Actor':actor}});if(!r.ok)throw Error();const data=folderAccessMineSchema.parse(await r.json());if(live)setState({loaded:true,isMember:data.isMember,folders:data.folders.map(f=>({id:f.id,name:f.name,level:f.level}))});}catch{if(live)setState(s=>({...s,loaded:true}));}})();},0);return()=>{live=false;clearTimeout(timer);};},[actor]);
 return state;
}
export function SharedFoldersForMe({folders,onOpen,disabled}:{folders:Array<{id:string;name:string;level:'view'|'edit'}>;onOpen:(id:string)=>void;disabled?:boolean}){
 const en=useLocale()==='en',t=(es:string,english:string)=>en?english:es;
 return <section data-company-shared-with-me aria-label={t('Carpetas compartidas con usted','Folders shared with you')} className="min-w-0 space-y-2 rounded-2xl border border-[#d7e1ea] bg-[#f3f8fb] p-4">
  <h3 className="font-bold">{t('Carpetas compartidas con usted','Folders shared with you')}</h3>
  {folders.length===0?<p className="text-sm text-[#52627a]">{t('Todavía no le compartieron ninguna carpeta de la biblioteca. Solicítela a la cuenta principal.','No library folder has been shared with you yet. Ask the main account.')}</p>
   :<ul className="flex flex-wrap gap-2">{folders.map(f=><li key={f.id}><Button type="button" variant="outline" className="whitespace-normal break-words" disabled={disabled} onClick={()=>onOpen(f.id)}>{f.name} · {f.level==='edit'?t('puede editar','can edit'):t('solo ver','view only')}</Button></li>)}</ul>}
 </section>;
}
export function FolderAccessModal({actor,folder,onClose}:{actor:string;folder:{id:string;name:string};onClose:()=>void}){
 const en=useLocale()==='en',t=(es:string,english:string)=>en?english:es;
 const [data,setData]=useState<FolderAccessRead|null>(null),[failed,setFailed]=useState(false),[busy,setBusy]=useState<string|null>(null),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const pending=useRef<{key:string;id:string}|null>(null);
 const load=useCallback(async()=>{try{const r=await fetch(api+'?'+new URLSearchParams({folderId:folder.id}),{cache:'no-store',headers:{'X-Pro-Expected-Actor':actor}});if(!r.ok)throw Error();setData(folderAccessReadSchema.parse(await r.json()));setFailed(false);}catch{setFailed(true);}},[actor,folder.id]);
 useEffect(()=>{const timer=setTimeout(()=>void load(),0);return()=>clearTimeout(timer);},[load]);
 async function change(userId:string,value:string){
  const body=value==='none'?{action:'revoke',folderId:folder.id,memberUserId:userId}:{action:'grant',folderId:folder.id,memberUserId:userId,level:value},key=JSON.stringify(body);
  if(pending.current?.key!==key)pending.current={key,id:crypto.randomUUID()};setBusy(userId);setError('');setNotice('');
  try{const r=await fetch(api,{method:'POST',headers:{'Content-Type':'application/json','X-Pro-Expected-Actor':actor},body:JSON.stringify({...body,actionId:pending.current.id})});
   if(!r.ok)throw Error();const res=folderAccessResultSchema.parse(await r.json());pending.current=null;setData(res.access);setNotice(t('Permiso guardado.','Permission saved.'));
  }catch{setError(t('No se pudo guardar el permiso. Reintente: no se duplicará.','Could not save the permission. Retry: it will not be duplicated.'));}finally{setBusy(null);}
 }
 return <Modal title={t('Permisos de la carpeta: ','Folder permissions: ')+folder.name} ariaLabel={t('Permisos de la carpeta','Folder permissions')} onClose={()=>{if(!busy)onClose();}} closeLabel={t('Cerrar','Close')} mobilePresentation="fullscreen" footer={<Button type="button" onClick={onClose} disabled={!!busy}>{t('Cerrar','Close')}</Button>}>
  <div data-folder-access className="space-y-3">
   <p className="text-sm text-[#52627a]">{t('Por defecto solo usted ve la biblioteca. El permiso incluye las subcarpetas y sus archivos. Solo cuentan los integrantes vigentes del equipo; quitar a alguien del equipo le cierra el acceso de inmediato.','By default only you see the library. A permission includes subfolders and their files. Only current team members count; removing someone from the team closes their access at once.')}</p>
   {failed?<div role="alert" className="space-y-2"><p className="text-sm">{t('No se pudieron cargar los permisos.','Could not load the permissions.')}</p><Button type="button" variant="secondary" onClick={()=>void load()}>{t('Reintentar','Retry')}</Button></div>
    :!data?<p role="status" className="text-sm">{t('Cargando…','Loading…')}</p>
    :data.members.length===0?<p className="rounded-xl bg-[#f3f8fb] p-3 text-sm text-[#52627a]">{t('Todavía no tiene integrantes en el equipo. Invítelos desde Empresa > Equipo.','You have no team members yet. Invite them from Company > Team.')}</p>
    :<ul className="space-y-2">{data.members.map(m=><li key={m.userId} data-folder-access-member={m.userId} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#d7e1ea] bg-white p-3">
      <div className="min-w-0"><p className="break-words font-semibold">{m.name}</p>{m.level===null&&m.effective&&<p className="text-xs text-[#52627a]">{t('Hereda de una carpeta superior: ','Inherited from a parent folder: ')}{m.effective==='edit'?t('puede editar','can edit'):t('solo ver','view only')}</p>}</div>
      <select aria-label={t(`Permiso de ${m.name}`,`Permission for ${m.name}`)} value={m.level??'none'} disabled={busy!==null} onChange={event=>void change(m.userId,event.target.value)} className="min-h-11 rounded-xl border border-[#d7e1ea] bg-white px-2">
       <option value="none">{t('Sin acceso propio','No own access')}</option><option value="view">{t('Puede ver','Can view')}</option><option value="edit">{t('Puede editar','Can edit')}</option></select></li>)}</ul>}
   {notice&&<p role="status" className="text-sm text-green-800">{notice}</p>}{error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
  </div>
 </Modal>;
}
