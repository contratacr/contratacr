'use client';
import {useCallback,useEffect,useState} from 'react';
import {useLocale} from 'next-intl';
import {Folder} from 'lucide-react';
import {useAuth} from '@/hooks/use-auth';
import {Button} from '@/components/ui/button';
import {proFileSize} from '@/lib/pro/file-size';
import {proDocBadge,proDocKindLabel} from '@/lib/pro/file-formats';
import {sharedFoldersSchema,type SharedFolderFile} from '@/lib/pro/work-files';
import {ProFilePreview,canPreview,type PreviewTarget} from './pro-file-preview';

/**
 * Ronda F2-D (row 33), customer side: the job folders the professional marked «Visible para el
 * cliente» (only while «Archivos y fotos» is on). Read only: view (photo/PDF/video) and download,
 * each request reauthorized by the server. The owner's «as client» preview renders this same
 * component with the reader running as the linked customer.
 */
export function AppointmentSharedFolders({requestId}:{requestId:string}){
 const {user,loading}=useAuth();if(loading||!user)return null;return <SharedFolders key={user.id+':'+requestId} accountId={user.id} requestId={requestId}/>;
}
function SharedFolders({accountId,requestId}:{accountId:string;requestId:string}){
 const en=useLocale()==='en',t=(es:string,english:string)=>en?english:es;
 const [data,setData]=useState<{id:string;name:string;files:SharedFolderFile[]}[]|null>(null),[error,setError]=useState(false),[preview,setPreview]=useState<PreviewTarget|null>(null);
 const load=useCallback(async()=>{try{const r=await fetch('/api/pro/work-files?'+new URLSearchParams({requestId,view:'folders'}),{cache:'no-store',headers:{'X-Pro-Expected-Actor':accountId}});if(!r.ok)throw Error();setData(sharedFoldersSchema.parse(await r.json()).folders);setError(false);}catch{setError(true);}},[accountId,requestId]);
 useEffect(()=>{const timer=setTimeout(()=>void load(),0);return()=>clearTimeout(timer);},[load]);
 if(error)return <div role="alert" data-client-shared-folders-error className="space-y-2 rounded-2xl border border-[#d7e1ea] p-4"><p className="text-sm">{t('No se pudieron cargar las carpetas compartidas.','Could not load the shared folders.')}</p><Button type="button" variant="secondary" onClick={()=>void load()}>{t('Reintentar','Retry')}</Button></div>;
 if(!data?.length)return null;
 const href=(id:string)=>'/api/pro/work-files?'+new URLSearchParams({requestId,sharedFileId:id});
 return <section data-client-shared-folders className="space-y-3 rounded-2xl border border-[#d7e1ea] p-4">
  <h3 className="font-bold">{t('Carpetas compartidas','Shared folders')}</h3>
  {data.map(folder=><details key={folder.id} data-client-shared-folder={folder.id} open={data.length===1} className="rounded-xl border border-[#e3eaf1]">
   <summary className="flex min-h-11 cursor-pointer items-center gap-2 px-3 font-semibold"><Folder aria-hidden className="h-5 w-5 text-[#008bb5]"/><span className="break-words">{folder.name}</span><span className="text-xs font-normal text-[#68778d]">· {folder.files.length} {folder.files.length===1?t('archivo','file'):t('archivos','files')}</span></summary>
   {folder.files.length?<ul className="space-y-2 p-3 pt-0">{folder.files.map(file=><li key={file.id} data-client-shared-file={file.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-[#f8fbfd] p-2">
    <span aria-hidden className="flex h-10 w-12 shrink-0 items-center justify-center rounded-md bg-white text-[11px] font-bold text-[#1d4f91]">{proDocBadge(file.mimeType)}</span>
    <div className="min-w-0 flex-1"><p className="break-all text-sm font-semibold">{file.name}</p><p className="text-xs text-[#52627a]">{proDocKindLabel(file.mimeType,en)} · {proFileSize(file.sizeBytes,en)}</p></div>
    {canPreview(file.mimeType)&&<Button type="button" variant="secondary" onClick={()=>setPreview({name:file.name,mimeType:file.mimeType,sizeBytes:file.sizeBytes,sha256:file.sha256,href:href(file.id)})}>{t('Ver','View')}</Button>}
    <Button asChild variant="secondary"><a href={href(file.id)} download={file.name}>{t('Descargar','Download')}</a></Button>
   </li>)}</ul>:<p className="px-3 pb-3 text-sm text-[#52627a]">{t('Esta carpeta todavía no tiene archivos.','This folder has no files yet.')}</p>}
  </details>)}
  {preview&&<ProFilePreview target={preview} onClose={()=>setPreview(null)}/>}
 </section>;
}
