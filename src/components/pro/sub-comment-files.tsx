'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {z} from 'zod';
import {Paperclip} from 'lucide-react';
import {WORK_FILE_MAX_BYTES} from '@/lib/pro/work-files';

/**
 * Round 9: attachments in subcontractor task comments (owner and subcontractor). Photo or PDF up to
 * 20 MB; the comment and its file are written together; downloads always go through the API (scope
 * re-checked in SQL), never a public link.
 */
const fileSchema=z.object({id:z.string().uuid(),commentId:z.string().uuid(),taskId:z.string().uuid(),side:z.enum(['pro','sub']),name:z.string(),mimeType:z.enum(['image/jpeg','application/pdf']),sizeBytes:z.number().int(),createdAt:z.string()});
export type SubCommentFile=z.infer<typeof fileSchema>;
type Scope={endpoint:string;ownerId?:string;accessId:string};
export function useSubCommentFiles({endpoint,ownerId,accessId}:Scope){
 const [files,setFiles]=useState<Record<string,SubCommentFile>>({});
 const reload=useCallback(async()=>{try{const r=await fetch(endpoint+'?'+new URLSearchParams({...(ownerId?{ownerId}:{}),accessId}),{cache:'no-store'});if(!r.ok)return;const list=z.array(fileSchema).parse((await r.json()).files);setFiles(Object.fromEntries(list.map(f=>[f.commentId,f])));}catch{}},[endpoint,ownerId,accessId]);
 useEffect(()=>{const timer=setTimeout(()=>void reload(),0);return()=>clearTimeout(timer);},[reload]);
 return {files,reload};
}
export function SubCommentFileLink({file,endpoint,ownerId,en}:{file:SubCommentFile;endpoint:string;ownerId?:string;en:boolean}){
 const href=endpoint+'?'+new URLSearchParams({...(ownerId?{ownerId}:{ownerId:'00000000-0000-0000-0000-000000000000'}),fileId:file.id});
 return <a data-sub-comment-file={file.mimeType==='application/pdf'?'pdf':'photo'} href={href} download={file.name} className="mt-1 flex max-w-full items-center gap-2 text-sm font-semibold text-[#008bb5] underline-offset-2 hover:underline">
  {file.mimeType==='image/jpeg'?(
   // eslint-disable-next-line @next/next/no-img-element -- private bytes served by the API after reauthorization
   <img src={href} alt={(en?'Photo: ':'Foto: ')+file.name} className="h-16 w-16 shrink-0 rounded-lg border border-[#e5e7eb] object-cover"/>):<Paperclip className="h-4 w-4 shrink-0"/>}<span className="min-w-0 break-all">{file.name}</span>
 </a>;
}
/** Attach button: sends the typed text (or the file name) as the comment with the file. */
export function SubCommentAttach({endpoint,ownerId,accessId,taskId,draft,disabled,en,onDone}:Scope&{taskId:string;draft:string;disabled:boolean;en:boolean;onDone:()=>void}){
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),action=useRef<{key:string;id:string}|null>(null);
 async function send(file:File){
  if(file.size<=0||file.size>WORK_FILE_MAX_BYTES||!['image/jpeg','image/png','image/webp','application/pdf'].includes(file.type)){setError(en?'Choose a JPG, PNG, WebP photo or a PDF up to 20 MB.':'Elija una foto JPG, PNG o WebP o un PDF de hasta 20 MB.');return;}
  setBusy(true);setError('');
  // Same file + same text keeps the same action id: a retry never duplicates the comment.
  const key=[taskId,file.name,file.size,file.lastModified,draft.trim()].join('|');if(action.current?.key!==key)action.current={key,id:crypto.randomUUID()};
  try{const base64=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).replace(/^data:[^,]*,/,''));reader.onerror=()=>reject(Error());reader.readAsDataURL(file);});
   const r=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ownerId:ownerId??'00000000-0000-0000-0000-000000000000',accessId,taskId,actionId:action.current.id,body:draft.trim(),name:file.name.slice(-160),base64})});
   if(!r.ok){const body=await r.json().catch(()=>({}));throw Error(body.error||'');}
   action.current=null;onDone();
  }catch(e){setError((e as Error).message||(en?'The file could not be sent. Retry: it will not duplicate.':'No se pudo enviar el archivo. Reintente: no se duplicará.'));}
  finally{setBusy(false);}
 }
 return <span className="flex flex-col gap-1">
  <label className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-[#d7e1ea] bg-white px-3 text-sm font-semibold text-[#162543] hover:bg-[#f3f8fb] ${disabled||busy?'pointer-events-none opacity-50':''}`}><Paperclip className="h-4 w-4"/>{busy?(en?'Sending…':'Enviando…'):(en?'Attach':'Adjuntar')}<input type="file" className="sr-only" accept="image/jpeg,image/png,image/webp,application/pdf" aria-label={en?'Attach a photo or PDF to the comment':'Adjuntar una foto o PDF al comentario'} disabled={disabled||busy} onChange={event=>{const file=event.currentTarget.files?.[0];event.currentTarget.value='';if(file)void send(file);}}/></label>
  {error&&<span role="alert" className="text-xs text-red-700">{error}</span>}
 </span>;
}
