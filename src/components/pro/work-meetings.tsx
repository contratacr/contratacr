'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {Button} from '@/components/ui/button';
import {useAppDialog} from '@/hooks/use-app-dialog';
import {AI_AUDIO_MAX_BYTES,meetingConsentText,type AiMeetingOutput,type AiSuggestion,type Transcript} from '@/lib/pro/ai/features';
import {AiLabel,ConsentHint,aiPost,reviewSuggestion,useAiCopy} from './ai-assistant';

/**
 * Round 6C (row 76): meeting / call recordings of a job. Upload (or record in the browser) only after ticking
 * that everyone was informed and consented. «Transcribir y resumir» returns a transcript + summary + action
 * items as an editable SUGGESTION; the meeting notes are created only when the owner saves them. Each action
 * item can become a job task (existing /api/pro/work-tasks writer) and is then linked to the meeting.
 */
const api='/api/pro/ai-meetings',field='mt-1 block min-h-11 w-full min-w-0 rounded-xl border border-[#d7e1ea] bg-white px-3 py-2 text-base font-normal';
const card='min-w-0 space-y-3 rounded-2xl border border-[#d7e1ea] bg-white p-4';
type Item={id:string;text:string;dueDate:string|null;taskId:string|null};
type Recording={id:string;workId:string;title:string;mime:string;sizeBytes:number;consentAt:string;createdAt:string};
type Meeting={id:string;workId:string;recordingId:string|null;suggestionId:string|null;title:string;transcript:string;summary:string;actionItems:Item[];decisions:string[];aiGenerated:boolean;revision:number;createdAt:string;updatedAt:string};
type Editor={mode:'create'|'update';id:string;revision:number;recordingId:string|null;suggestionId:string|null;title:string;transcript:string;summary:string;items:Item[];decisions:string[]};
export function WorkMeetings({workId}:{workId:string}){
 const {en,t,errorText}=useAiCopy(),{confirm,dialogNode}=useAppDialog();
 const [data,setData]=useState<{recordings:Recording[];meetings:Meeting[]}|null>(null),[failed,setFailed]=useState(false),[busy,setBusy]=useState(''),[error,setError]=useState<{reason:string;text:string}|null>(null),[notice,setNotice]=useState('');
 const [title,setTitle]=useState(''),[consent,setConsent]=useState(false),[file,setFile]=useState<File|null>(null),[editor,setEditor]=useState<Editor|null>(null),[recording,setRecording]=useState(false),[canRecord,setCanRecord]=useState(false);
 const recorder=useRef<MediaRecorder|null>(null),chunks=useRef<Blob[]>([]),fileRef=useRef<HTMLInputElement>(null),seq=useRef(0);
 const load=useCallback(async()=>{const n=++seq.current;setFailed(false);try{const response=await fetch(api+'?'+new URLSearchParams({workId}),{cache:'no-store'});if(!response.ok)throw Error();const body=await response.json() as {recordings:Recording[];meetings:Meeting[]};if(n===seq.current)setData(body);}catch{if(n===seq.current)setFailed(true);}},[workId]);
 useEffect(()=>{const counter=seq,timer=setTimeout(()=>{void load();setCanRecord('MediaRecorder' in window&&!!navigator.mediaDevices?.getUserMedia);},0);return()=>{clearTimeout(timer);counter.current++;recorder.current?.stream.getTracks().forEach(track=>track.stop());};},[load]);
 const fail=(reason:string|undefined,fallback:string)=>setError({reason:reason??'error',text:errorText(reason,fallback)});
 async function upload(blob:Blob,name:string){
  if(!consent){fail('consent_meeting','');return;}
  if(blob.size>AI_AUDIO_MAX_BYTES){fail('unsupported_file','');return;}
  setBusy('upload');setError(null);setNotice('');
  const form=new FormData();form.append('id',crypto.randomUUID());form.append('workId',workId);form.append('title',title.trim()||t('Reunión','Meeting'));form.append('consentAllParties','true');form.append('language',en?'en':'es');form.append('file',blob,name);
  const result=await aiPost(form,api);setBusy('');
  if(!result.ok){fail(result.reason,t('No se pudo subir la grabación.','Could not upload the recording.'));return;}
  setTitle('');setConsent(false);setFile(null);if(fileRef.current)fileRef.current.value='';setNotice(t('Grabación guardada en el trabajo (privada).','Recording saved to the job (private).'));await load();
 }
 async function toggleRecording(){
  if(recording){recorder.current?.stop();return;}
  if(!consent){fail('consent_meeting','');return;}
  try{const stream=await navigator.mediaDevices.getUserMedia({audio:true}),media=new MediaRecorder(stream);chunks.current=[];
   media.ondataavailable=event=>{if(event.data.size)chunks.current.push(event.data);};
   media.onstop=()=>{stream.getTracks().forEach(track=>track.stop());setRecording(false);const blob=new Blob(chunks.current,{type:media.mimeType||'audio/webm'});if(blob.size)void upload(blob,'reunion.'+(blob.type.includes('mp4')?'m4a':'webm'));};
   recorder.current=media;media.start();setRecording(true);}
  catch{setError({reason:'microphone',text:t('No se pudo usar el micrófono. Puede subir un archivo de audio.','The microphone could not be used. You can upload an audio file.')});}
 }
 async function transcribe(rec:Recording){
  setBusy('transcribe:'+rec.id);setError(null);setNotice('');
  const result=await aiPost({action:'transcribe',actionId:crypto.randomUUID(),recordingId:rec.id,language:en?'en':'es'},api);setBusy('');
  if(!result.ok){fail(result.reason,t('No se pudo transcribir. Reintente.','Could not transcribe. Retry.'));return;}
  const transcription=result.body.transcription as AiSuggestion,suggestion=result.body.suggestion as AiSuggestion|null;
  if(transcription.status!=='ready'||!suggestion||suggestion.status!=='ready'){fail('provider_failed','');return;}
  const output=suggestion.output as AiMeetingOutput;
  setEditor({mode:'create',id:crypto.randomUUID(),revision:0,recordingId:rec.id,suggestionId:suggestion.id,title:rec.title,transcript:(transcription.output as Transcript).text,summary:output.summary,items:output.actionItems.map(item=>({id:crypto.randomUUID(),text:item.text,dueDate:item.dueDate,taskId:null})),decisions:output.decisions});
 }
 async function save(){
  if(!editor)return;const items=editor.items.filter(item=>item.text.trim());
  if(!editor.title.trim()||!editor.summary.trim()){setError({reason:'invalid',text:t('Escriba el título y el resumen.','Write the title and the summary.')});return;}
  setBusy('save');setError(null);
  const content={title:editor.title.trim(),transcript:editor.transcript,summary:editor.summary.trim(),actionItems:items.map(item=>({...item,text:item.text.trim()})),decisions:editor.decisions.map(d=>d.trim()).filter(Boolean)};
  const result=await aiPost(editor.mode==='create'?{action:'create',actionId:crypto.randomUUID(),id:editor.id,workId,recordingId:editor.recordingId,suggestionId:editor.suggestionId,...content}:{action:'update',actionId:crypto.randomUUID(),id:editor.id,revision:editor.revision,...content},api);
  setBusy('');
  if(!result.ok){fail(result.reason,result.status===409?t('La reunión cambió. Se recargó.','The meeting changed. It was reloaded.'):t('No se pudo guardar.','Could not save.'));if(result.status===409){setEditor(null);await load();}return;}
  if(editor.mode==='create'&&editor.suggestionId)reviewSuggestion(editor.suggestionId,'used');
  setEditor(null);setNotice(t('Notas de la reunión guardadas en el trabajo.','Meeting notes saved to the job.'));await load();
 }
 async function createTask(meeting:Meeting,item:Item){
  setBusy('task:'+item.id);setError(null);
  const taskId=crypto.randomUUID();
  try{
   const response=await fetch('/api/pro/work-tasks',{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'create',workId,taskId,actionId:crypto.randomUUID(),revision:0,title:item.text.slice(0,160),details:(en?'From meeting: ':'De la reunión: ')+meeting.title.slice(0,140),dueDate:item.dueDate,assignee:''})});
   if(!response.ok)throw Error();
   const linked=await aiPost({action:'link_task',actionId:crypto.randomUUID(),id:meeting.id,revision:meeting.revision,itemId:item.id,taskId},api);
   if(!linked.ok)throw Error();
   window.dispatchEvent(new CustomEvent('contratacr:work-tasks-changed',{detail:{workId}}));
   setNotice(t('Tarea creada en el trabajo.','Task created in the job.'));
  }catch{setError({reason:'task',text:t('No se pudo crear la tarea. Revise Tareas antes de reintentar.','Could not create the task. Check Tasks before retrying.')});}
  finally{setBusy('');await load();}
 }
 async function remove(rec:Recording){
  const answer=await confirm({title:t('¿Borrar la grabación?','Delete the recording?'),description:t('Se borra el audio. Las notas guardadas de la reunión se conservan.','The audio is deleted. Saved meeting notes are kept.'),confirmLabel:t('Borrar','Delete'),cancelLabel:t('Cancelar','Cancel'),tone:'danger'});
  if(!answer.confirmed)return;setBusy('delete');const result=await aiPost({action:'delete_recording',id:rec.id},api);setBusy('');
  if(!result.ok){fail(result.reason,t('No se pudo borrar.','Could not delete.'));return;}await load();
 }
 const when=(value:string)=>new Date(value).toLocaleString(en?'en-US':'es-CR',{timeZone:'America/Costa_Rica',dateStyle:'medium',timeStyle:'short'});
 const patchItem=(id:string,text:string)=>setEditor(old=>old?{...old,items:old.items.map(item=>item.id===id?{...item,text}:item)}:old);
 if(failed&&!data)return <div role="alert" className={card}><p className="text-sm">{t('No se pudieron cargar las reuniones.','Could not load meetings.')}</p><Button type="button" variant="secondary" onClick={()=>void load()}>{t('Reintentar','Retry')}</Button></div>;
 if(!data)return <p role="status" className="text-sm text-[#52627a]">{t('Cargando reuniones…','Loading meetings…')}</p>;
 return <section data-work-meetings className={card} aria-labelledby={'meetings-'+workId}>
  <h3 id={'meetings-'+workId} className="font-bold">{t('Reuniones y llamadas grabadas','Recorded meetings and calls')}</h3>
  <p className="text-sm text-[#52627a]">{t('Suba o grabe el audio de una reunión. Con IA obtiene la transcripción, un resumen y los pendientes, que usted revisa antes de guardarlos. El audio es privado y puede borrarlo.','Upload or record a meeting. With AI you get the transcript, a summary and action items, which you review before saving. The audio is private and you can delete it.')}</p>
  {error&&(error.reason==='consent_required'?<ConsentHint/>:<p role="alert" data-ai-error={error.reason} className="text-sm text-red-700">{error.text}</p>)}
  {notice&&<p role="status" className="text-sm text-emerald-800">{notice}</p>}
  <div data-meeting-upload className="space-y-3 rounded-xl border border-[#e5e7eb] p-3">
   <label className="block min-w-0 text-sm font-semibold">{t('Título de la reunión','Meeting title')}<input data-meeting-title className={field} maxLength={160} value={title} onChange={event=>setTitle(event.target.value)} placeholder={t('Ej.: Visita con el cliente','E.g. Site visit with the customer')}/></label>
   <label className="flex min-w-0 items-start gap-3 text-sm"><input type="checkbox" data-meeting-consent className="mt-1 h-5 w-5 shrink-0 accent-[#0089bb]" checked={consent} onChange={event=>setConsent(event.target.checked)}/><span>{en?meetingConsentText.en:meetingConsentText.es}</span></label>
   <div className="flex flex-wrap items-center gap-2">
    <input ref={fileRef} type="file" accept="audio/*" data-meeting-file aria-label={t('Archivo de audio','Audio file')} className="min-w-0 max-w-full text-sm" onChange={event=>setFile(event.target.files?.[0]??null)}/>
    <Button type="button" data-meeting-upload-submit disabled={!file||!consent||!!busy} onClick={()=>file&&void upload(file,file.name)}>{busy==='upload'?t('Subiendo…','Uploading…'):t('Subir grabación','Upload recording')}</Button>
    {canRecord&&<Button type="button" variant="secondary" data-meeting-record disabled={!consent||(!!busy&&!recording)} onClick={()=>void toggleRecording()}>{recording?t('■ Detener y guardar','■ Stop and save'):t('🎙 Grabar ahora','🎙 Record now')}</Button>}
   </div>
   {!consent&&<p className="text-xs text-[#7a4b00]">{t('Marque la confirmación de consentimiento para poder grabar o subir.','Tick the consent confirmation to record or upload.')}</p>}
  </div>
  {data.recordings.length>0&&<ul data-meeting-recordings className="space-y-2">{data.recordings.map(rec=><li key={rec.id} data-meeting-recording={rec.id} className="min-w-0 space-y-2 rounded-xl border border-[#e5e7eb] p-3 text-sm">
   <div className="flex min-w-0 flex-wrap justify-between gap-2"><strong className="min-w-0 break-words">{rec.title}</strong><span className="text-xs text-[#52627a]">{when(rec.createdAt)} · {Math.max(1,Math.round(rec.sizeBytes/1024))} KB · {t('consentimiento confirmado','consent confirmed')}</span></div>
   <audio controls preload="none" className="w-full max-w-full" src={api+'?'+new URLSearchParams({audio:rec.id})}/>
   <div className="flex flex-wrap gap-2"><Button type="button" variant="secondary" data-meeting-transcribe disabled={!!busy||!!editor} onClick={()=>void transcribe(rec)}>{busy==='transcribe:'+rec.id?t('Transcribiendo…','Transcribing…'):t('✦ Transcribir y resumir con IA','✦ Transcribe and summarize with AI')}</Button>
    <Button type="button" variant="ghost" className="text-red-700" data-meeting-delete disabled={!!busy} onClick={()=>void remove(rec)}>{t('Borrar audio','Delete audio')}</Button></div>
  </li>)}</ul>}
  {editor&&<div data-meeting-editor={editor.mode} className="space-y-3 rounded-xl border border-[#d9ccff] bg-[#faf8ff] p-3">
   {editor.suggestionId&&<AiLabel/>}
   <label className="block text-sm font-semibold">{t('Título','Title')}<input data-meeting-field="title" className={field} maxLength={160} value={editor.title} onChange={event=>setEditor({...editor,title:event.target.value})}/></label>
   <label className="block text-sm font-semibold">{t('Resumen','Summary')}<textarea data-meeting-field="summary" className={field+' min-h-28'} maxLength={4000} value={editor.summary} onChange={event=>setEditor({...editor,summary:event.target.value})}/></label>
   <fieldset className="space-y-2"><legend className="text-sm font-semibold">{t('Pendientes','Action items')}</legend>
    {editor.items.map(item=><div key={item.id} className="flex min-w-0 gap-2"><input aria-label={t('Pendiente','Action item')} data-meeting-item className={field+' !mt-0'} maxLength={160} value={item.text} onChange={event=>patchItem(item.id,event.target.value)}/><Button type="button" variant="ghost" aria-label={t('Quitar pendiente','Remove item')} onClick={()=>setEditor({...editor,items:editor.items.filter(row=>row.id!==item.id)})}>✕</Button></div>)}
    {editor.items.length<20&&<Button type="button" variant="secondary" onClick={()=>setEditor({...editor,items:[...editor.items,{id:crypto.randomUUID(),text:'',dueDate:null,taskId:null}]})}>{t('Agregar pendiente','Add action item')}</Button>}</fieldset>
   <details><summary className="min-h-11 cursor-pointer text-sm font-semibold">{t('Transcripción (editable)','Transcript (editable)')}</summary><textarea data-meeting-field="transcript" className={field+' min-h-40'} maxLength={60000} value={editor.transcript} onChange={event=>setEditor({...editor,transcript:event.target.value})}/></details>
   <p className="text-xs text-[#52627a]">{t('Revise y corrija antes de guardar: nada queda en el trabajo hasta que pulse "Guardar en el trabajo".','Review and correct before saving: nothing is kept in the job until you press "Save to job".')}</p>
   <div className="flex flex-wrap gap-2"><Button type="button" data-meeting-save disabled={busy==='save'} onClick={()=>void save()}>{busy==='save'?t('Guardando…','Saving…'):t('Guardar en el trabajo','Save to job')}</Button>
    <Button type="button" variant="secondary" data-ai-discard onClick={()=>{if(editor.mode==='create'&&editor.suggestionId)reviewSuggestion(editor.suggestionId,'discarded');setEditor(null);}}>{t('Descartar','Discard')}</Button></div>
  </div>}
  {data.meetings.length>0&&<ul data-meeting-notes className="space-y-3">{data.meetings.map(meeting=><li key={meeting.id} data-meeting-note={meeting.id} className="min-w-0 space-y-2 rounded-xl border border-[#e5e7eb] p-3 text-sm">
   <div className="flex min-w-0 flex-wrap items-center justify-between gap-2"><strong className="min-w-0 break-words">{meeting.title}</strong>{meeting.aiGenerated&&<AiLabel/>}</div>
   <p className="whitespace-pre-wrap break-words">{meeting.summary}</p>
   {meeting.decisions.length>0&&<ul className="list-disc pl-5 text-[#38485f]">{meeting.decisions.map((d,i)=><li key={i}>{d}</li>)}</ul>}
   {meeting.actionItems.length>0&&<ul className="space-y-1">{meeting.actionItems.map(item=><li key={item.id} data-meeting-action-item={item.taskId?'task':'open'} className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-lg bg-[#f7f9fc] px-2 py-1"><span className="min-w-0 break-words">{item.text}</span>
    {item.taskId?<span className="text-xs font-semibold text-emerald-800">{t('Tarea creada','Task created')}</span>:<Button type="button" variant="secondary" data-meeting-create-task disabled={!!busy} onClick={()=>void createTask(meeting,item)}>{busy==='task:'+item.id?t('Creando…','Creating…'):t('Crear tarea','Create task')}</Button>}</li>)}</ul>}
   <p className="text-xs text-[#52627a]">{t('Guardada ','Saved ')}{when(meeting.updatedAt)}</p>
   <Button type="button" variant="ghost" data-meeting-edit disabled={!!editor||!!busy} onClick={()=>setEditor({mode:'update',id:meeting.id,revision:meeting.revision,recordingId:meeting.recordingId,suggestionId:null,title:meeting.title,transcript:meeting.transcript,summary:meeting.summary,items:meeting.actionItems,decisions:meeting.decisions})}>{t('Editar','Edit')}</Button>
  </li>)}</ul>}
  {dialogNode}
 </section>;
}
