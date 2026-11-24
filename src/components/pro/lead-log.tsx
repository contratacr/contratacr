'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {useLocale} from 'next-intl';
import {Button} from '@/components/ui/button';
import {ContactFormAnswers} from './contact-form-answers';
import {leadCallOutcomes,leadLogSchema,type LeadLog,type LeadLogInput} from '@/lib/pro/lead-log';

/**
 * Leads area: private notes, call log and tags of a lead. Nothing is sent to the customer. Every write carries an actionId
 * that is kept while a retry is pending, so a repeated tap never duplicates an entry.
 */
const field='block min-h-11 w-full min-w-0 rounded-xl border border-[#d7e1ea] bg-white px-3 py-2 text-base font-normal';
type Filter='all'|'note'|'call';
export function LeadLogPanel({actor,kind,leadId,disabled=false}:{actor:string;kind:'manual'|'request';leadId:string;disabled?:boolean}){
 const en=useLocale()==='en',t=(es:string,english:string)=>en?english:es,headers={'X-Pro-Expected-Actor':actor,'Content-Type':'application/json'};
 const [log,setLog]=useState<LeadLog|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[filter,setFilter]=useState<Filter>('all'),[note,setNote]=useState(''),[outcome,setOutcome]=useState<string>(leadCallOutcomes[0]),[callText,setCallText]=useState(''),[tag,setTag]=useState(''),[editing,setEditing]=useState<{id:string;body:string;revision:number}|null>(null),pending=useRef<{key:string;actionId:string;entryId:string}|null>(null),mutex=useRef(false);
 const outcomeLabel=(v:string)=>({good_discussion:t('Buena conversación','Good discussion'),no_answer:t('Sin respuesta','No answer'),call_later:t('Llamar más tarde','Call later'),not_interested:t('No le interesa','Not interested')} as Record<string,string>)[v]??v;
 const load=useCallback(async()=>{
  try{const r=await fetch('/api/pro/lead-log?'+new URLSearchParams({kind,leadId}),{cache:'no-store',headers:{'X-Pro-Expected-Actor':actor}});if(!r.ok)throw Error();setLog(leadLogSchema.parse(await r.json()));setError('');}
  catch{setLog(null);setError(t('No se pudieron cargar las notas de la solicitud.','Could not load the lead notes.'));}
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[actor,kind,leadId,en]);
 useEffect(()=>{const timer=setTimeout(()=>void load(),0);return()=>clearTimeout(timer);},[load]);
 async function send(body:LeadLogInput|Record<string,unknown>,done:()=>void){
  if(mutex.current||disabled)return;mutex.current=true;setBusy(true);setError('');
  try{
   const r=await fetch('/api/pro/lead-log',{method:'POST',headers,body:JSON.stringify(body)});
   if(r.status===409){await load();setError(t('La entrada cambió. Se actualizó la lista; revise e intente de nuevo.','The entry changed. The list was refreshed; review it and try again.'));pending.current=null;return;}
   if(!r.ok)throw Error();setLog(leadLogSchema.parse(await r.json()));pending.current=null;done();
  }catch{setError(t('No se pudo comprobar el guardado. Reintente: no se duplicará.','Could not confirm the save. Retry: it will not be duplicated.'));}
  finally{mutex.current=false;setBusy(false);}
 }
 function attempt(key:string){if(pending.current?.key!==key)pending.current={key,actionId:crypto.randomUUID(),entryId:crypto.randomUUID()};return pending.current;}
 const addNote=()=>{const text=note.trim();if(!text)return;const p=attempt('note:'+text);void send({action:'add',actionId:p.actionId,id:p.entryId,kind,leadId,entry:'note',outcome:null,body:text},()=>setNote(''));};
 const addCall=()=>{const text=callText.trim(),p=attempt('call:'+outcome+':'+text);void send({action:'add',actionId:p.actionId,id:p.entryId,kind,leadId,entry:'call',outcome,body:text},()=>setCallText(''));};
 const addTag=()=>{const text=tag.trim();if(!text)return;void send({action:'tag_add',kind,leadId,tag:text},()=>setTag(''));};
 const items=(log?.items??[]).filter(i=>filter==='all'||i.entry===filter);
 const when=(v:string)=>new Intl.DateTimeFormat(en?'en-US':'es-CR',{dateStyle:'medium',timeStyle:'short',timeZone:'America/Costa_Rica'}).format(new Date(v));
 return <section data-lead-log className="min-w-0 space-y-3 rounded-xl border border-[#d7e1ea] bg-white p-3">
  {kind==='manual'&&<ContactFormAnswers actor={actor} leadId={leadId}/>}
  <h3 className="font-semibold">{t('Notas, llamadas y etiquetas','Notes, calls and tags')}</h3>
  <p className="text-xs text-[#52627a]">{t('Es un registro privado: no se envía nada a la persona cliente.','This is a private record: nothing is sent to the customer.')}</p>
  {error&&<p role="alert" className="text-sm text-[#b42318]">{error}</p>}
  <div data-lead-tags className="space-y-2">
   <p className="text-sm font-semibold">{t('Etiquetas','Tags')}</p>
   <ul className="flex flex-wrap gap-2">{(log?.tags??[]).map(x=><li key={x} className="inline-flex items-center gap-1 rounded-full bg-[#e8f6fb] px-3 py-1 text-sm"><span>{x}</span><button type="button" disabled={busy||disabled} aria-label={t('Quitar etiqueta ','Remove tag ')+x} className="min-h-6 min-w-6 rounded-full" onClick={()=>void send({action:'tag_remove',kind,leadId,tag:x},()=>undefined)}>×</button></li>)}</ul>
   <div className="flex flex-wrap gap-2"><label className="min-w-0 flex-1 text-sm font-semibold">{t('Agregar etiqueta','Add tag')}<input data-lead-tag-input value={tag} maxLength={40} disabled={busy||disabled} onChange={e=>setTag(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();addTag();}}} className={field+' mt-1'}/></label><Button type="button" variant="outline" disabled={busy||disabled||!tag.trim()} onClick={addTag} className="self-end">{t('Agregar','Add')}</Button></div>
  </div>
  <div className="grid gap-3 md:grid-cols-2">
   <div className="space-y-2"><label className="block text-sm font-semibold">{t('Nota privada','Private note')}<textarea data-lead-note-input value={note} maxLength={2000} rows={3} disabled={busy||disabled} onChange={e=>setNote(e.target.value)} className={field+' mt-1'}/></label><Button type="button" disabled={busy||disabled||!note.trim()} onClick={addNote}>{t('Agregar nota','Add note')}</Button></div>
   <div className="space-y-2"><label className="block text-sm font-semibold">{t('¿Qué pasó en la llamada?','What happened on the call?')}<select data-lead-call-outcome value={outcome} disabled={busy||disabled} onChange={e=>setOutcome(e.target.value)} className={field+' mt-1'}>{leadCallOutcomes.map(v=><option key={v} value={v}>{outcomeLabel(v)}</option>)}</select></label><label className="block text-sm font-semibold">{t('Nota privada de la llamada','Private note about the call')}<textarea data-lead-call-input value={callText} maxLength={2000} rows={2} disabled={busy||disabled} onChange={e=>setCallText(e.target.value)} className={field+' mt-1'}/></label><Button type="button" disabled={busy||disabled} onClick={addCall}>{t('Agregar registro de llamada','Add call entry')}</Button></div>
  </div>
  <div role="group" aria-label={t('Filtrar entradas','Filter entries')} className="flex flex-wrap gap-2">{([['all',t('Todas las entradas','All entries')],['note',t('Notas','Notes')],['call',t('Llamadas','Calls')]] as [Filter,string][]).map(([v,label])=><button key={v} type="button" aria-pressed={filter===v} onClick={()=>setFilter(v)} className={'min-h-9 rounded-full border px-3 text-sm '+(filter===v?'border-[#008bb5] bg-[#e8f6fb] font-semibold':'border-[#d7e1ea]')}>{label}</button>)}</div>
  <p className="text-sm font-semibold" data-lead-log-count>{log?(en?`${log.items.length} entries`:`${log.items.length} entradas`):t('Cargando…','Loading…')}</p>
  {log&&items.length===0&&<p className="text-sm">{t('Todavía no hay entradas.','No entries yet.')}</p>}
  <ul className="space-y-2">{items.map(i=><li key={i.id} data-lead-log-entry={i.entry} className="min-w-0 space-y-1 rounded-xl border border-[#d7e1ea] p-3">
   <p className="text-xs text-[#52627a]">{i.entry==='call'?t('Llamada','Call')+' · '+outcomeLabel(i.outcome!):t('Nota','Note')} · {when(i.createdAt)}</p>
   {editing?.id===i.id?<div className="space-y-2"><textarea aria-label={t('Editar texto','Edit text')} value={editing.body} maxLength={2000} rows={3} onChange={e=>setEditing({...editing,body:e.target.value})} className={field}/><div className="flex gap-2"><Button type="button" disabled={busy||disabled||(i.entry==='note'&&!editing.body.trim())} onClick={()=>{const p=attempt('edit:'+i.id+':'+editing.revision+':'+editing.body);void send({action:'edit',actionId:p.actionId,id:i.id,kind,leadId,revision:editing.revision,body:editing.body.trim()},()=>setEditing(null));}}>{t('Guardar','Save')}</Button><Button type="button" variant="outline" onClick={()=>setEditing(null)}>{t('Cancelar','Cancel')}</Button></div></div>
   :<><p className="whitespace-pre-wrap break-words text-sm">{i.body||'—'}</p><div className="flex gap-2"><Button type="button" variant="outline" disabled={busy||disabled} onClick={()=>setEditing({id:i.id,body:i.body,revision:i.revision})}>{t('Editar','Edit')}</Button><Button type="button" variant="outline" disabled={busy||disabled} onClick={()=>{const p=attempt('remove:'+i.id+':'+i.revision);void send({action:'remove',actionId:p.actionId,id:i.id,kind,leadId,revision:i.revision},()=>undefined);}}>{t('Eliminar','Delete')}</Button></div></>}
  </li>)}</ul>
 </section>;
}
