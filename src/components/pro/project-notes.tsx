'use client';

import {useCallback,useEffect,useId,useLayoutEffect,useRef,useState,type FormEvent} from 'react';
import {useLocale} from 'next-intl';
import {useAuth} from '@/hooks/use-auth';
import {useAppDialog} from '@/hooks/use-app-dialog';
import {Button} from '@/components/ui/button';
import {
 NOTE_BODY_MAX,crNowMinute,noteHistorySchema,noteKindIssues,noteMutationSchema,notePageSchema,noteResultSchema,
 type CallDirection,type NoteFilter,type NoteHistory,type NoteKind,type NoteMutation,type NotePage,type NoteState,type ProjectNote,
} from '@/lib/pro/project-notes';
import {useProChildGuard} from './use-pro-child-guard';

/**
 * Notas y llamadas del proyecto: private log of the professional for one job.
 * Nothing here is visible to the customer or the team, and no call is placed.
 */
const api='/api/pro/project-notes';
const field='mt-1 block min-h-11 w-full min-w-0 rounded-xl border border-[#d7e1ea] bg-white px-3 py-2 text-base font-normal text-[#162543]';
const label='block min-w-0 text-sm font-semibold text-[#162543]';
type StateCallback={onStateChange?:(state:{dirty:boolean;busy:boolean})=>void};
type Draft={kind:NoteKind;body:string;occurredAt:string;duration:string;direction:CallDirection;contact:string};
type Form={mode:'create'|'edit';note:ProjectNote|null;draft:Draft;initial:Draft};
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);

function copy(en:boolean){
 return en?{
  title:'Notes and calls',intro:'A private log for this project. Only you can see it: it is not shared with the customer or your team.',
  filters:{all:'All',note:'Notes',call:'Calls'} as Record<NoteFilter,string>,filterLabel:'Show',state:'Entries',states:{active:'Current',archived:'Archived'} as Record<NoteState,string>,
  search:'Search notes',searchHint:'Text or contact',newNote:'New note',newCall:'Log a call',
  when:'Date and time · Costa Rica',whenHelp:'It cannot be in the future.',text:'Note',summary:'Summary (optional)',chars:(n:number)=>`${n} of ${NOTE_BODY_MAX} characters`,
  duration:'Duration (minutes)',direction:'Direction',directions:{inbound:'Incoming',outbound:'Outgoing'} as Record<CallDirection,string>,contact:'Contact (optional)',
  save:'Save note',saveCall:'Save call',saveEdit:'Save changes',cancel:'Cancel',saving:'Saving…',editTitle:'Edit entry',createNote:'New note',createCall:'New call record',
  edit:'Edit',pin:'Pin',unpin:'Unpin',archive:'Archive',restore:'Restore',history:'History',hideHistory:'Hide history',pinned:'Pinned',edited:'Edited',
  kind:{note:'Note',call:'Call'} as Record<NoteKind,string>,minutes:(n:number)=>`${n} min`,with:(name:string)=>`with ${name}`,
  archiveTitle:'Archive this entry?',archiveText:'It leaves the current list. You can restore it from Archived.',
  empty:'There are no entries with this filter.',emptyAll:'No notes or calls yet. Write the first one to keep track of agreements and conversations.',emptyArchived:'There are no archived entries.',
  loading:'Loading notes…',loadError:'Could not load the notes.',retry:'Retry',more:'Show more',moreError:'Could not load more entries.',reload:'Reload',
  historyLoading:'Loading history…',historyError:'Could not load the history.',actions:{create:'Created',update:'Edited',pin:'Pinned',unpin:'Unpinned',archive:'Archived',restore:'Restored'} as Record<string,string>,previous:'Previous text',
  invalidNote:'Write the note (up to 4000 characters). The date cannot be in the future.',invalidCall:'Enter the date and time, the duration (0 to 1440 minutes) and the direction. The date cannot be in the future.',
  noChanges:'There are no changes to save.',pinLimit:'You can pin up to 10 entries per project.',
  conflict:'This entry changed in another window. Reload before trying again.',uncertain:'We could not confirm whether it was saved. Retry the same operation; it will not be applied twice.',retrySame:'Retry the same operation',
  failed:'Could not save. Check the data and try again.',tooLarge:'The text is too long.',leave:'Save or cancel the note you are editing before leaving.',
  savedNote:'Note saved.',savedCall:'Call saved.',pinnedNotice:'Entry pinned.',unpinnedNotice:'Entry unpinned.',archivedNotice:'Entry archived.',restoredNotice:'Entry restored.',
  counts:(n:number)=>`${n} ${n===1?'entry':'entries'}`,
 }:{
  title:'Notas y llamadas',intro:'Bitácora privada de este proyecto. Solo usted la ve: no se comparte con el cliente ni con su equipo.',
  filters:{all:'Todas',note:'Notas',call:'Llamadas'} as Record<NoteFilter,string>,filterLabel:'Mostrar',state:'Registros',states:{active:'Vigentes',archived:'Archivados'} as Record<NoteState,string>,
  search:'Buscar en las notas',searchHint:'Texto o contacto',newNote:'Nueva nota',newCall:'Registrar llamada',
  when:'Fecha y hora · Costa Rica',whenHelp:'No puede ser una fecha futura.',text:'Nota',summary:'Resumen (opcional)',chars:(n:number)=>`${n} de ${NOTE_BODY_MAX} caracteres`,
  duration:'Duración (minutos)',direction:'Dirección',directions:{inbound:'Entrante',outbound:'Saliente'} as Record<CallDirection,string>,contact:'Contacto (opcional)',
  save:'Guardar nota',saveCall:'Guardar llamada',saveEdit:'Guardar cambios',cancel:'Cancelar',saving:'Guardando…',editTitle:'Editar registro',createNote:'Nueva nota',createCall:'Nuevo registro de llamada',
  edit:'Editar',pin:'Fijar',unpin:'Desfijar',archive:'Archivar',restore:'Restaurar',history:'Historial',hideHistory:'Ocultar historial',pinned:'Fijadas',edited:'Editada',
  kind:{note:'Nota',call:'Llamada'} as Record<NoteKind,string>,minutes:(n:number)=>`${n} min`,with:(name:string)=>`con ${name}`,
  archiveTitle:'¿Archivar este registro?',archiveText:'Sale de la lista vigente. Puede restaurarlo desde Archivados.',
  empty:'No hay registros con este filtro.',emptyAll:'Todavía no hay notas ni llamadas. Escriba la primera para llevar control de acuerdos y conversaciones.',emptyArchived:'No hay registros archivados.',
  loading:'Cargando notas…',loadError:'No se pudieron cargar las notas.',retry:'Reintentar',more:'Ver más',moreError:'No se pudieron cargar más registros.',reload:'Recargar',
  historyLoading:'Cargando historial…',historyError:'No se pudo cargar el historial.',actions:{create:'Creada',update:'Editada',pin:'Fijada',unpin:'Desfijada',archive:'Archivada',restore:'Restaurada'} as Record<string,string>,previous:'Texto anterior',
  invalidNote:'Escriba la nota (hasta 4000 caracteres). La fecha no puede ser futura.',invalidCall:'Indique la fecha y hora, la duración (0 a 1440 minutos) y la dirección. La fecha no puede ser futura.',
  noChanges:'No hay cambios por guardar.',pinLimit:'Puede fijar hasta 10 registros por proyecto.',
  conflict:'Este registro cambió en otra ventana. Recargue antes de intentarlo de nuevo.',uncertain:'No se pudo confirmar si se guardó. Reintente la misma operación; no se aplicará dos veces.',retrySame:'Reintentar la misma operación',
  failed:'No se pudo guardar. Revise los datos e intente de nuevo.',tooLarge:'El texto es demasiado largo.',leave:'Guarde o cancele la nota que está editando antes de salir.',
  savedNote:'Nota guardada.',savedCall:'Llamada guardada.',pinnedNotice:'Registro fijado.',unpinnedNotice:'Registro desfijado.',archivedNotice:'Registro archivado.',restoredNotice:'Registro restaurado.',
  counts:(n:number)=>`${n} ${n===1?'registro':'registros'}`,
 };
}
type Copy=ReturnType<typeof copy>;
const stamp=(value:string,en:boolean)=>new Intl.DateTimeFormat(en?'en-US':'es-CR',{dateStyle:'medium',timeStyle:'short',timeZone:'America/Costa_Rica'}).format(new Date(value));

export function ProjectNotes({workId,clientName='',onStateChange}:{workId:string;clientName?:string}&StateCallback){
 const {user,loading}=useAuth();if(loading||!user)return null;
 return <NotesSession key={user.id+':'+workId} accountId={user.id} workId={workId} clientName={clientName} onStateChange={onStateChange}/>;
}

function NotesSession({accountId,workId,clientName,onStateChange}:{accountId:string;workId:string;clientName:string}&StateCallback){
 const en=useLocale()==='en',c=copy(en),{confirm,dialogNode}=useAppDialog(),formId=useId();
 const [kind,setKind]=useState<NoteFilter>('all'),[state,setState]=useState<NoteState>('active'),[search,setSearch]=useState(''),[query,setQuery]=useState('');
 const [page,setPage]=useState<NotePage|null>(null),[loading,setLoading]=useState<false|'page'|'more'>('page'),[loadError,setLoadError]=useState<false|{after:string|null}>(false);
 const [form,setForm]=useState<Form|null>(null),[saving,setSaving]=useState(false),[uncertain,setUncertain]=useState(false),[conflict,setConflict]=useState(false);
 const [error,setError]=useState(''),[notice,setNotice]=useState('');
 const [historyFor,setHistoryFor]=useState<string|null>(null),[history,setHistory]=useState<NoteHistory|null|'error'>(null);
 const active=useRef(true),sequence=useRef(0),lock=useRef(false),pending=useRef<{input:NoteMutation;notice:string}|null>(null);
 const dirty=!!form&&!same(form.draft,form.initial),busy=saving||uncertain;
 useProChildGuard(!onStateChange&&(dirty||busy),useCallback(()=>setError(c.leave),[c.leave]));
 useLayoutEffect(()=>{onStateChange?.({dirty,busy});return()=>onStateChange?.({dirty:false,busy:false});},[dirty,busy,onStateChange]);
 const load=useCallback(async(after:string|null=null)=>{
  const id=++sequence.current;setLoading(after?'more':'page');setLoadError(false);
  try{
   const response=await fetch(api+'?'+new URLSearchParams({view:'list',workId,kind,state,q:query,...after?{after}:{}}),{cache:'no-store',headers:{'X-Pro-Expected-Actor':accountId}});if(!response.ok)throw Error();
   const body=notePageSchema.parse(await response.json());if(body.project.workId!==workId)throw Error();
   if(active.current&&id===sequence.current){setPage(old=>after&&old?{...body,pinned:old.pinned,items:[...old.items,...body.items.filter(item=>!old.items.some(prior=>prior.id===item.id))]}:body);setConflict(false);}
  }catch{if(active.current&&id===sequence.current)setLoadError({after});}
  finally{if(active.current&&id===sequence.current)setLoading(false);}
 },[accountId,workId,kind,state,query]);
 const invalidate=useCallback(()=>{sequence.current++;},[]);
 useEffect(()=>{active.current=true;const timer=setTimeout(()=>void load(),0);return()=>{active.current=false;invalidate();clearTimeout(timer);};},[load,invalidate]);
 useEffect(()=>{const timer=setTimeout(()=>setQuery(search.trim()),300);return()=>clearTimeout(timer);},[search]);
 const loadHistory=useCallback(async(noteId:string)=>{
  setHistory(null);
  try{
   const response=await fetch(api+'?'+new URLSearchParams({view:'history',workId,id:noteId}),{cache:'no-store',headers:{'X-Pro-Expected-Actor':accountId}});if(!response.ok)throw Error();
   const body=noteHistorySchema.parse(await response.json());if(body.note.id!==noteId)throw Error();if(active.current)setHistory(body);
  }catch{if(active.current)setHistory('error');}
 },[accountId,workId]);

 async function send(input:NoteMutation,success:string){
  if(lock.current)return false;lock.current=true;pending.current={input,notice:success};setSaving(true);setError('');setNotice('');
  try{
   const response=await fetch(api,{method:'POST',cache:'no-store',headers:{'X-Pro-Expected-Actor':accountId,'Content-Type':'application/json'},body:JSON.stringify(input)});
   if(response.status===409){pending.current=null;setUncertain(false);setConflict(true);setError(c.conflict);return false;}
   if(response.status>=500||response.status===429){setUncertain(true);setError(c.uncertain);return false;}
   if(!response.ok){pending.current=null;setUncertain(false);setError(response.status===413?c.tooLarge:input.action==='pin'?c.pinLimit:input.action==='create'||input.action==='update'?c.failed:c.failed);return false;}
   const body=noteResultSchema.parse(await response.json());if(body.note.id!==input.id||body.note.workId!==workId)throw Error();
   pending.current=null;setUncertain(false);
   if(active.current){setForm(null);setNotice(success);if(historyFor===body.note.id)void loadHistory(body.note.id);}
   lock.current=false;await load();return true;
  }catch{setUncertain(true);setError(c.uncertain);return false;}
  finally{lock.current=false;if(active.current)setSaving(false);}
 }
 function retrySame(){const last=pending.current;if(last)void send(last.input,last.notice);}
 function reloadAll(){setConflict(false);setError('');setForm(null);void load();}
 function begin(next:NoteKind|ProjectNote){
  if(busy||form)return;setError('');setNotice('');
  if(typeof next==='string'){const draft:Draft={kind:next,body:'',occurredAt:crNowMinute(),duration:'',direction:'outbound',contact:next==='call'?clientName.slice(0,160):''};setForm({mode:'create',note:null,draft,initial:{...draft,contact:''}});return;}
  const draft:Draft={kind:next.kind,body:next.body??'',occurredAt:next.occurredLocal,duration:next.durationMinutes===null?'':String(next.durationMinutes),direction:next.direction??'outbound',contact:next.contact??''};
  setForm({mode:'edit',note:next,draft,initial:draft});
 }
 const patch=(value:Partial<Draft>)=>setForm(old=>old?{...old,draft:{...old.draft,...value}}:old);
 function submit(event:FormEvent){
  event.preventDefault();if(!form||busy||conflict)return;const d=form.draft,call=d.kind==='call';
  const duration=d.duration.trim()===''?null:/^\d{1,4}$/.test(d.duration.trim())?Number(d.duration.trim()):-1;
  const fields={body:d.body.trim()||null,occurredAt:d.occurredAt||null,durationMinutes:call?duration:null,direction:call?d.direction:null,contact:call?d.contact.trim()||null:null};
  const invalid=call?c.invalidCall:c.invalidNote;
  if((d.occurredAt&&d.occurredAt>crNowMinute())||noteKindIssues(d.kind,fields).length){setError(invalid);return;}
  if(form.mode==='edit'&&same(form.draft,form.initial)){setError(c.noChanges);return;}
  const parsed=noteMutationSchema.safeParse(form.mode==='create'?{action:'create',actionId:crypto.randomUUID(),workId,id:crypto.randomUUID(),kind:d.kind,...fields}:{action:'update',actionId:crypto.randomUUID(),workId,id:form.note!.id,revision:form.note!.revision,...fields});
  if(!parsed.success){setError(invalid);return;}
  void send(parsed.data,call?c.savedCall:c.savedNote);
 }
 async function simple(note:ProjectNote,action:'pin'|'unpin'|'archive'|'restore'){
  if(busy||form)return;
  if(action==='archive'){const answer=await confirm({title:c.archiveTitle,description:note.body?.slice(0,120)||c.kind[note.kind],detail:c.archiveText,confirmLabel:c.archive,cancelLabel:c.cancel});if(!answer.confirmed)return;}
  const notices={pin:c.pinnedNotice,unpin:c.unpinnedNotice,archive:c.archivedNotice,restore:c.restoredNotice};
  void send({action,actionId:crypto.randomUUID(),workId,id:note.id,revision:note.revision},notices[action]);
 }
 function toggleHistory(note:ProjectNote){if(historyFor===note.id){setHistoryFor(null);return;}setHistoryFor(note.id);void loadHistory(note.id);}

 const counts=page?.counts,countFor=(filter:NoteFilter)=>counts?counts[filter]:null;
 const editor=form&&<form onSubmit={submit} data-project-note-form className="min-w-0 space-y-3 rounded-2xl border border-[#b8e4f2] bg-white p-4" aria-label={form.mode==='edit'?c.editTitle:form.draft.kind==='call'?c.createCall:c.createNote}>
  <h4 className="text-base font-semibold text-[#162543]">{form.mode==='edit'?c.editTitle:form.draft.kind==='call'?c.createCall:c.createNote}</h4>
  <div className="grid min-w-0 gap-3 sm:grid-cols-2">
   <div className="min-w-0"><label className={label}>{c.when}<input type="datetime-local" required={form.draft.kind==='call'} max={crNowMinute()} aria-describedby={formId+'-when'} value={form.draft.occurredAt} onChange={event=>patch({occurredAt:event.target.value})} className={field}/></label><p id={formId+'-when'} className="mt-1 text-xs text-[#52627a]">{c.whenHelp}</p></div>
   {form.draft.kind==='call'&&<label className={label}>{c.duration}<input type="number" inputMode="numeric" min={0} max={1440} step={1} required value={form.draft.duration} onChange={event=>patch({duration:event.target.value})} className={field}/></label>}
  </div>
  {form.draft.kind==='call'&&<div className="grid min-w-0 gap-3 sm:grid-cols-2">
   <fieldset className="min-w-0"><legend className="text-sm font-semibold text-[#162543]">{c.direction}</legend><div className="mt-1 flex flex-wrap gap-2">
    {(['outbound','inbound'] as CallDirection[]).map(value=><label key={value} className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-3 text-sm ${form.draft.direction===value?'border-[#008bb5] bg-[#eaf7fb] text-[#006f93]':'border-[#d7e1ea] text-[#162543]'}`}><input type="radio" name="call-direction" value={value} checked={form.draft.direction===value} onChange={()=>patch({direction:value})}/>{c.directions[value]}</label>)}
   </div></fieldset>
   <label className={label}>{c.contact}<input value={form.draft.contact} maxLength={160} onChange={event=>patch({contact:event.target.value})} className={field}/></label>
  </div>}
  <div className="min-w-0"><label className={label}>{form.draft.kind==='call'?c.summary:c.text}<textarea rows={5} maxLength={NOTE_BODY_MAX} required={form.draft.kind==='note'} aria-describedby={formId+'-chars'} value={form.draft.body} onChange={event=>patch({body:event.target.value})} className={field+' resize-y'}/></label>
   <p id={formId+'-chars'} className="mt-1 text-right text-xs text-[#52627a]">{c.chars(form.draft.body.length)}</p></div>
  <div className="flex flex-wrap gap-2"><Button className="min-h-11" type="submit" disabled={busy||conflict}>{saving?c.saving:form.mode==='edit'?c.saveEdit:form.draft.kind==='call'?c.saveCall:c.save}</Button><Button className="min-h-11" type="button" variant="secondary" disabled={saving} onClick={()=>{setForm(null);setError('');}}>{c.cancel}</Button></div>
 </form>;
 const row=(note:ProjectNote)=><li key={note.id} data-project-note={note.id} data-project-note-kind={note.kind} className="min-w-0 rounded-2xl border border-[#d7e1ea] bg-white p-4">
  <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-[#52627a]">
   <span className={`inline-flex min-h-7 items-center rounded-full px-2.5 font-semibold ${note.kind==='call'?'bg-[#fff6e0] text-[#7a5400]':'bg-[#eaf7fb] text-[#006f93]'}`}>{c.kind[note.kind]}</span>
   <time dateTime={note.occurredAt}>{stamp(note.occurredAt,en)}</time>
   {note.kind==='call'&&<span>{[note.direction?c.directions[note.direction]:null,note.durationMinutes!==null?c.minutes(note.durationMinutes):null,note.contact?c.with(note.contact):null].filter(Boolean).join(' · ')}</span>}
   {note.edited&&<span className="italic">{c.edited}</span>}
  </div>
  {note.body&&<p className="mt-2 whitespace-pre-wrap break-words text-sm text-[#162543]">{note.body}</p>}
  <div className="mt-3 flex flex-wrap gap-2">
   {!note.archived&&<Button className="min-h-11" type="button" variant="secondary" disabled={busy||!!form} onClick={()=>begin(note)}>{c.edit}</Button>}
   {!note.archived&&<Button className="min-h-11" type="button" variant="secondary" disabled={busy||!!form} aria-pressed={note.pinned} onClick={()=>void simple(note,note.pinned?'unpin':'pin')}>{note.pinned?c.unpin:c.pin}</Button>}
   <Button className="min-h-11" type="button" variant="secondary" disabled={busy||!!form} onClick={()=>void simple(note,note.archived?'restore':'archive')}>{note.archived?c.restore:c.archive}</Button>
   <Button className="min-h-11" type="button" variant="secondary" aria-expanded={historyFor===note.id} onClick={()=>toggleHistory(note)}>{historyFor===note.id?c.hideHistory:c.history}</Button>
  </div>
  {historyFor===note.id&&<HistoryList history={history} c={c} en={en}/>}
 </li>;
 const emptyText=state==='archived'?c.emptyArchived:counts&&counts.all+counts.archived>0?c.empty:c.emptyAll;
 return <section data-project-notes className="min-w-0 space-y-4">
  {dialogNode}
  <div><h3 className="text-lg font-semibold text-[#162543]">{c.title}</h3><p className="mt-1 text-sm text-[#52627a]">{c.intro}</p></div>
  <div className="flex flex-wrap gap-2"><Button className="min-h-11" type="button" data-project-note-new="note" disabled={busy||!!form||conflict} onClick={()=>begin('note')}>{c.newNote}</Button><Button className="min-h-11" type="button" variant="secondary" data-project-note-new="call" disabled={busy||!!form||conflict} onClick={()=>begin('call')}>{c.newCall}</Button></div>
  {form?.mode==='create'&&editor}
  <div role="group" aria-label={c.filterLabel} className="flex flex-wrap gap-1.5 rounded-2xl bg-[#e9eff5] p-1.5">
   {(['all','note','call'] as NoteFilter[]).map(filter=>{const n=countFor(filter);return <button key={filter} type="button" aria-pressed={kind===filter} onClick={()=>setKind(filter)} className={`min-h-11 min-w-0 flex-1 rounded-xl px-3 text-sm font-semibold ${kind===filter?'bg-white text-[#008bb5] shadow-sm':'text-[#52627a] hover:bg-white/60'}`}>{c.filters[filter]}{n===null?'':` (${n})`}</button>;})}
  </div>
  <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,12rem)]">
   <label className={label}>{c.search}<input type="search" placeholder={c.searchHint} value={search} maxLength={160} onChange={event=>setSearch(event.target.value)} className={field}/></label>
   <label className={label}>{c.state}<select value={state} onChange={event=>setState(event.target.value as NoteState)} className={field}>{(['active','archived'] as NoteState[]).map(value=><option key={value} value={value}>{c.states[value]}{value==='archived'&&counts?` (${counts.archived})`:''}</option>)}</select></label>
  </div>
  {notice&&<p role="status" className="rounded-xl bg-[#eef8f4] px-3 py-2 text-sm text-[#18573a]">{notice}</p>}
  {error&&<div role="alert" className="space-y-2 rounded-xl bg-[#fdf0f0] px-3 py-2 text-sm text-[#9b2c2c]"><p>{error}</p>{uncertain&&<Button className="min-h-11" type="button" variant="secondary" disabled={saving} onClick={retrySame}>{c.retrySame}</Button>}{conflict&&<Button className="min-h-11" type="button" variant="secondary" onClick={reloadAll}>{c.reload}</Button>}</div>}
  {loadError&&!loadError.after&&<div role="alert" className="space-y-2"><p className="text-sm">{c.loadError}</p><Button className="min-h-11" type="button" variant="secondary" disabled={!!loading} onClick={()=>void load()}>{c.retry}</Button></div>}
  {loading==='page'&&<p role="status" className="text-sm text-[#52627a]">{c.loading}</p>}
  {page&&<div aria-busy={loading==='page'} className={`min-w-0 space-y-4 ${loading==='page'?'opacity-60':''}`}>
   {page.pinned.length>0&&<div><h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-[#52627a]">{c.pinned}</h4><ul className="space-y-3" data-project-notes-pinned>{page.pinned.map(note=>form?.mode==='edit'&&form.note?.id===note.id?<li key={note.id}>{editor}</li>:row(note))}</ul></div>}
   {page.items.length>0?<ul className="space-y-3" data-project-notes-list>{page.items.map(note=>form?.mode==='edit'&&form.note?.id===note.id?<li key={note.id}>{editor}</li>:row(note))}</ul>
    :page.pinned.length===0&&<p data-project-notes-empty className="rounded-2xl border border-dashed border-[#d7e1ea] bg-white p-6 text-sm text-[#52627a]">{emptyText}</p>}
   {loadError&&loadError.after&&<div role="alert" className="space-y-2"><p className="text-sm">{c.moreError}</p><Button className="min-h-11" type="button" variant="secondary" disabled={!!loading} onClick={()=>void load(loadError.after)}>{c.retry}</Button></div>}
   {page.nextCursor!==null&&!(loadError&&loadError.after)&&<Button className="min-h-11" type="button" variant="secondary" disabled={!!loading} onClick={()=>void load(page.nextCursor)}>{loading==='more'?c.loading:c.more}</Button>}
  </div>}
 </section>;
}

function HistoryList({history,c,en}:{history:NoteHistory|null|'error';c:Copy;en:boolean}){
 if(history===null)return <p role="status" className="mt-3 text-sm text-[#52627a]">{c.historyLoading}</p>;
 if(history==='error')return <p role="alert" className="mt-3 text-sm text-[#9b2c2c]">{c.historyError}</p>;
 return <ol className="mt-3 space-y-2 border-l-2 border-[#d7e1ea] pl-3" data-project-note-history>{history.versions.map(version=><li key={version.actionId} className="min-w-0 text-sm">
  <p className="text-xs text-[#52627a]"><span className="font-semibold text-[#162543]">{c.actions[version.action]}</span> · {stamp(version.at,en)}</p>
  {version.action==='update'&&version.before?.body!==version.after.body&&version.before?.body&&<p className="mt-1 whitespace-pre-wrap break-words text-xs text-[#52627a]"><span className="font-semibold">{c.previous}:</span> {version.before.body}</p>}
 </li>)}</ol>;
}
