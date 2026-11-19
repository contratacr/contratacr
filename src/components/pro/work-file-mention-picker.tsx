'use client';
import {useCallback,useEffect,useId,useRef,useState,type KeyboardEvent} from 'react';
import {useLocale} from 'next-intl';
import {FILE_MENTION_MAX,fileCommentMentionsSchema,fileMentionTargetsSchema,mentionSegments,mentionsInText,type FileMentionSnapshot,type FileMentionTarget} from '@/lib/pro/file-mentions';
/* Fila 30: @menciones del equipo en el hilo privado de un archivo del trabajo. The picker lists
   only active collaborators of THIS job (server-verified again on save). Mentioned members get
   an internal notice in Equipo; nothing is sent and they never get access to the file. */
export const fileMentionsApi='/api/pro/file-mentions';
const field='mt-1 block w-full min-w-0 rounded-xl border border-[#d7e1ea] bg-white px-3 py-2 text-sm text-[#162543] focus:border-[#008bb5] focus:outline-none focus:ring-2 focus:ring-[#008bb5]/30';

/** Targets of one job, loaded once when the composer is first used (and again after a 409). */
export function useFileMentionTargets(accountId:string,workId:string){
 const [items,setItems]=useState<FileMentionTarget[]|null>(null),[error,setError]=useState(false),[loading,setLoading]=useState(false),alive=useRef(true),sequence=useRef(0);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 const load=useCallback(async()=>{
  const id=++sequence.current;setLoading(true);
  try{const response=await fetch(fileMentionsApi+'?'+new URLSearchParams({view:'targets',workId}),{cache:'no-store',headers:{'X-Pro-Expected-Actor':accountId}});if(!response.ok)throw Error();
   const body=fileMentionTargetsSchema.parse(await response.json());if(body.workId!==workId)throw Error();if(alive.current&&id===sequence.current){setItems(body.items);setError(false);}}
  catch{if(alive.current&&id===sequence.current)setError(true);}
  finally{if(alive.current&&id===sequence.current)setLoading(false);}
 },[accountId,workId]);
 return{items,error,loading,load};
}

/** Recorded mentions of the visible team comments (one request per page). */
export function useFileCommentMentions(accountId:string,workId:string,commentIds:string[]){
 const key=commentIds.slice(0,20).join(','),[map,setMap]=useState<Map<string,FileMentionSnapshot[]>>(()=>new Map());
 useEffect(()=>{
  let live=true;if(!key)return;
  const timer=setTimeout(()=>{void (async()=>{try{const response=await fetch(fileMentionsApi+'?'+new URLSearchParams({view:'comments',workId,ids:key}),{cache:'no-store',headers:{'X-Pro-Expected-Actor':accountId}});if(!response.ok)throw Error();
   const body=fileCommentMentionsSchema.parse(await response.json());if(live)setMap(new Map(body.items.map(item=>[item.commentId,item.mentions])));}catch{if(live)setMap(new Map());}})();},0);
  return()=>{clearTimeout(timer);live=false;};
 },[accountId,workId,key]);
 return key?map:new Map<string,FileMentionSnapshot[]>();
}

/** Comment body with the recorded "@name" mentions highlighted, plus an accessible list of who was mentioned. */
export function MentionedBody({body,mentions}:{body:string;mentions:FileMentionSnapshot[]|undefined}){
 const en=useLocale()==='en',t=(es:string,english:string)=>en?english:es;
 if(!mentions?.length)return <p className="whitespace-pre-wrap break-words text-sm text-[#162543]">{body}</p>;
 return <div className="min-w-0 space-y-1">
  <p className="whitespace-pre-wrap break-words text-sm text-[#162543]">{mentionSegments(body,mentions.map(person=>person.name)).map((part,index)=>part.mention
   ?<span key={index} data-file-comment-mention-text className="rounded-md bg-[#e6f6fb] px-1 font-semibold text-[#006e8f]">{part.text}</span>:<span key={index}>{part.text}</span>)}</p>
  <p data-file-comment-mentions className="flex min-w-0 flex-wrap items-center gap-1 text-xs text-[#52627a]"><span>{t('Mencionó a:','Mentioned:')}</span>
   {mentions.map(person=><span key={person.userId} data-file-comment-mention={person.userId} className="max-w-full break-words rounded-full border border-[#b9e3f0] bg-white px-2 py-0.5 font-semibold text-[#006e8f]">@{person.name}</span>)}</p>
 </div>;
}

/** Team comment textarea with an @ picker. `chosen` keeps the explicit picks; only those still written in the text are saved. */
export function MentionTextarea({id,value,onChange,chosen,onChosenChange,disabled,maxLength,describedBy,targets}:{id:string;value:string;onChange:(value:string)=>void;
 chosen:FileMentionTarget[];onChosenChange:(value:FileMentionTarget[])=>void;disabled:boolean;maxLength:number;describedBy?:string;targets:ReturnType<typeof useFileMentionTargets>}){
 const en=useLocale()==='en',t=(es:string,english:string)=>en?english:es,listId=useId(),hintId=useId(),box=useRef<HTMLTextAreaElement|null>(null),panel=useRef<HTMLDivElement|null>(null);
 const [query,setQuery]=useState<{start:number;text:string}|null>(null),[active,setActive]=useState(0);
 const inText=mentionsInText(value,chosen),full=inText.length>=FILE_MENTION_MAX;
 const options=query&&targets.items?targets.items.filter(person=>!inText.some(picked=>picked.userId===person.userId)&&person.name.toLowerCase().includes(query.text.toLowerCase())).slice(0,8):[];
 const open=!!query;
 useEffect(()=>{if(open&&!targets.items&&!targets.loading&&!targets.error)void targets.load();},[open,targets]);
 // On phones the list could sit under the sticky job actions bar: bring it to the middle of the screen once it opens.
 useEffect(()=>{if(!open)return;const frame=requestAnimationFrame(()=>panel.current?.scrollIntoView({block:'center',behavior:'auto'}));return()=>cancelAnimationFrame(frame);},[open,targets.items]);
 /** "@word" right before the caret (at the start or after a space/new line) opens the picker. */
 function track(text:string,caret:number){
  const before=text.slice(0,caret),at=before.lastIndexOf('@');
  if(at<0||at>0&&!/\s/.test(before[at-1])){setQuery(null);return;}
  const typed=before.slice(at+1);if(typed.length>40||/\n/.test(typed)||/\s\s/.test(typed)){setQuery(null);return;}
  setQuery({start:at,text:typed});setActive(0);
 }
 function choose(person:FileMentionTarget){
  if(!query||full)return;const caret=query.start+1+query.text.length,insert='@'+person.name+' ';
  const next=(value.slice(0,query.start)+insert+value.slice(caret)).slice(0,maxLength);onChange(next);
  onChosenChange([...chosen.filter(picked=>picked.userId!==person.userId),person]);setQuery(null);
  const position=Math.min(query.start+insert.length,next.length);requestAnimationFrame(()=>{box.current?.focus();box.current?.setSelectionRange(position,position);});
 }
 function startMention(){
  const element=box.current;if(!element||disabled)return;if(!targets.items&&!targets.loading)void targets.load();
  const caret=element.selectionStart??value.length,needsSpace=caret>0&&!/\s/.test(value[caret-1]??''),insert=(needsSpace?' ':'')+'@';
  if(value.length+insert.length>maxLength)return;const next=value.slice(0,caret)+insert+value.slice(caret);onChange(next);
  const position=caret+insert.length;setQuery({start:position-1,text:''});setActive(0);requestAnimationFrame(()=>{element.focus();element.setSelectionRange(position,position);});
 }
 function remove(person:FileMentionTarget){
  const pattern=new RegExp('@'+person.name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+' ?','gi');onChange(value.replace(pattern,''));onChosenChange(chosen.filter(picked=>picked.userId!==person.userId));box.current?.focus();
 }
 function keyDown(event:KeyboardEvent<HTMLTextAreaElement>){
  if(!open)return;
  if(event.key==='Escape'){event.preventDefault();setQuery(null);return;}
  if(!options.length)return;
  if(event.key==='ArrowDown'){event.preventDefault();setActive((active+1)%options.length);}
  else if(event.key==='ArrowUp'){event.preventDefault();setActive((active-1+options.length)%options.length);}
  else if(event.key==='Enter'||event.key==='Tab'){event.preventDefault();choose(options[Math.min(active,options.length-1)]);}
 }
 const optionId=(index:number)=>listId+'-'+index;
 return <div data-file-mention-composer className="relative min-w-0 space-y-2">
  <textarea ref={box} id={id} value={value} rows={3} maxLength={maxLength} disabled={disabled} className={field}
   aria-describedby={[describedBy,hintId].filter(Boolean).join(' ')} aria-controls={open?listId:undefined} aria-expanded={open} aria-autocomplete="list" role="combobox"
   aria-activedescendant={open&&options.length?optionId(Math.min(active,options.length-1)):undefined}
   onChange={event=>{onChange(event.target.value);track(event.target.value,event.target.selectionStart??event.target.value.length);}}
   onSelect={event=>{const element=event.currentTarget;if(open)track(element.value,element.selectionStart??element.value.length);}}
   onKeyDown={keyDown} onBlur={()=>setTimeout(()=>{if(document.activeElement!==box.current)setQuery(null);},150)}/>
  {open&&<div ref={panel} data-file-mention-picker className="z-10 min-w-0 rounded-xl border border-[#d7e1ea] bg-white p-1 shadow-lg">
   {targets.error?<div role="alert" className="flex flex-wrap items-center gap-2 p-2 text-sm"><span>{t('No se pudo cargar el equipo.','Could not load the team.')}</span>
    <button type="button" className="min-h-11 rounded-lg px-3 font-semibold text-[#008bb5] hover:bg-[#f1f8fb]" onMouseDown={event=>event.preventDefault()} onClick={()=>void targets.load()}>{t('Reintentar','Retry')}</button></div>
   :!targets.items?<p role="status" className="p-2 text-sm text-[#52627a]">{t('Cargando equipo…','Loading team…')}</p>
   :full?<p role="status" className="p-2 text-sm text-[#52627a]">{t(`Puede mencionar hasta ${FILE_MENTION_MAX} personas por comentario.`,`You can mention up to ${FILE_MENTION_MAX} people per comment.`)}</p>
   :!targets.items.length?<p role="status" className="p-2 text-sm text-[#52627a]">{t('Este trabajo no tiene integrantes con acceso activo. Puede darles acceso desde Equipo.','This job has no members with active access. You can give them access from Team.')}</p>
   :!options.length?<p role="status" className="p-2 text-sm text-[#52627a]">{t('Nadie del equipo coincide con ese nombre.','No team member matches that name.')}</p>
   :<ul id={listId} role="listbox" aria-label={t('Integrantes del equipo de este trabajo','Team members of this job')} className="max-h-64 overflow-y-auto">
    {options.map((person,index)=><li key={person.userId} id={optionId(index)} role="option" aria-selected={index===active} data-file-mention-option={person.userId}
     onMouseDown={event=>event.preventDefault()} onClick={()=>choose(person)} onMouseEnter={()=>setActive(index)}
     className={`flex min-h-11 cursor-pointer items-center gap-2 break-words rounded-lg px-3 py-2 text-sm ${index===active?'bg-[#e6f6fb] text-[#006e8f]':'text-[#162543]'}`}>
     <span aria-hidden="true" className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[#162543] text-xs font-bold text-white">{person.name.slice(0,1).toUpperCase()}</span><span className="min-w-0 font-semibold">{person.name}</span></li>)}
   </ul>}
  </div>}
  <div className="flex min-w-0 flex-wrap items-center gap-2">
   <button type="button" data-file-mention-start disabled={disabled||full} onClick={startMention} aria-haspopup="listbox"
    className="min-h-11 rounded-xl border border-[#d7e1ea] bg-white px-3 py-2 text-sm font-semibold text-[#008bb5] hover:bg-[#f1f8fb] disabled:opacity-50">@ {t('Mencionar','Mention')}</button>
   {inText.map(person=><button type="button" key={person.userId} data-file-mention-chip={person.userId} disabled={disabled} onClick={()=>remove(person)}
    aria-label={t('Quitar mención: ','Remove mention: ')+person.name} className="min-h-11 max-w-full break-words rounded-full border border-[#b9e3f0] bg-[#e6f6fb] px-3 py-1 text-sm font-semibold text-[#006e8f] disabled:opacity-50">@{person.name} <span aria-hidden="true">×</span></button>)}
  </div>
  <p id={hintId} className="text-xs text-[#52627a]">{t('Escriba @ para mencionar a alguien del equipo de este trabajo. Recibirá un aviso interno en Equipo, sin acceso al archivo.','Type @ to mention someone on this job’s team. They get an internal notice in Team, without access to the file.')}</p>
 </div>;
}
