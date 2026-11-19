'use client';

import {useCallback,useEffect,useRef,useState,type FormEvent} from 'react';
import {useLocale} from 'next-intl';
import {useAuth} from '@/hooks/use-auth';
import {Button} from '@/components/ui/button';
import {proMoney} from '@/lib/pro/money';
import {MOOD_COMMENT_MAX,moodClientImageUrl,moodClientResultSchema,moodClientViewSchema,type MoodClientBoard,type MoodClientElement,type MoodClientView} from '@/lib/pro/mood-boards';
import {MoodCanvas,MoodPresenter,type CanvasItem} from './mood-board-canvas';
import {useProChildGuard} from './use-pro-child-guard';

/**
 * Customer side of the idea boards (row 61), inside My projects. Shows only the
 * versions the professional shared, when the section is on in the customer view,
 * and lets the customer leave comments. Hidden while loading, like other sections.
 */
const api='/api/pro/mood-boards';
const stamp=(value:string,en:boolean)=>new Intl.DateTimeFormat(en?'en-US':'es-CR',{dateStyle:'medium',timeStyle:'short',timeZone:'America/Costa_Rica'}).format(new Date(value));
function copy(en:boolean){
 return en?{
  title:'Idea boards',intro:'Boards your professional shared with you. Leave a comment if you would like changes.',shared:(d:string,v:number)=>`Shared on ${d} · version\u00a0${v}`,
  page:(a:number,b:number)=>`Page ${a} of ${b}`,prev:'Previous page',next:'Next page',present:'View full screen',comments:'Comments',none:'No comments yet.',
  you:'You',professional:'Your professional',write:'Write a comment',send:'Send comment',sending:'Sending…',sent:'Comment sent.',required:'Write a comment.',
  loadError:'Could not load the idea boards.',retry:'Retry',conflict:'The board changed. We reloaded it so you can see the latest version before commenting.',
  uncertain:'We could not confirm whether it was sent. Retry the same comment; it will not be sent twice.',retrySame:'Retry the same comment',failed:'Could not send the comment.',
  leave:'Send or clear your comment before leaving.',kind:{image:'Photo',product:'Item',swatch:'Color',note:'Note',text:'Text',arrow:'Arrow',drawing:'Drawing'},
 }:{
  title:'Tableros de ideas',intro:'Tableros que su profesional compartió con usted. Deje un comentario si desea cambios.',shared:(d:string,v:number)=>`Compartido el ${d} · versión\u00a0${v}`,
  page:(a:number,b:number)=>`Página ${a} de ${b}`,prev:'Página anterior',next:'Página siguiente',present:'Ver en pantalla completa',comments:'Comentarios',none:'Todavía no hay comentarios.',
  you:'Usted',professional:'Su profesional',write:'Escribir un comentario',send:'Enviar comentario',sending:'Enviando…',sent:'Comentario enviado.',required:'Escriba un comentario.',
  loadError:'No se pudieron cargar los tableros de ideas.',retry:'Reintentar',conflict:'El tablero cambió. Lo recargamos para que vea la versión más reciente antes de comentar.',
  uncertain:'No pudimos confirmar si se envió. Reintente el mismo comentario; no se enviará dos veces.',retrySame:'Reintentar el mismo comentario',failed:'No se pudo enviar el comentario.',
  leave:'Envíe o borre su comentario antes de salir.',kind:{image:'Foto',product:'Artículo',swatch:'Color',note:'Nota',text:'Texto',arrow:'Flecha',drawing:'Dibujo'},
 };
}
type Copy=ReturnType<typeof copy>;

function items(board:MoodClientBoard,pageId:string,elements:MoodClientElement[],c:Copy):CanvasItem[]{
 return elements.map(element=>{
  const base={id:element.id,kind:element.kind,x:element.x,y:element.y,w:element.w,h:element.h,rotation:element.rotation,src:null,title:null,subtitle:null,color:null,text:null};
  if(element.kind==='image')return {...base,src:moodClientImageUrl(board.publicationId,pageId,element.id),label:c.kind.image};
  if(element.kind==='product'){const price=element.priceCents===null?null:proMoney(element.priceCents/100)+(element.unit?` / ${element.unit}`:'');
   return {...base,src:element.hasImage?moodClientImageUrl(board.publicationId,pageId,element.id):null,title:element.name,subtitle:price,label:`${c.kind.product}: ${element.name}`};}
  if(element.kind==='swatch')return {...base,color:element.color,title:element.label,label:`${c.kind.swatch}: ${element.label??element.color}`};
  if(element.kind==='text')return {...base,text:element.text,color:element.color,label:c.kind.text};
  if(element.kind==='arrow'||element.kind==='drawing')return {...base,color:element.color,points:element.points,label:c.kind[element.kind]};
  return {...base,text:element.text,label:c.kind.note};
 });
}

export function AppointmentMoodBoards({requestId}:{requestId:string}){
 const {user,loading}=useAuth();if(loading||!user)return null;
 return <ClientBoardsSession key={user.id+':'+requestId} accountId={user.id} requestId={requestId}/>;
}

function ClientBoardsSession({accountId,requestId}:{accountId:string;requestId:string}){
 const en=useLocale()==='en',c=copy(en);
 const [view,setView]=useState<MoodClientView|null>(null),[error,setError]=useState(false),[loading,setLoading]=useState(true);
 const [drafts,setDrafts]=useState<Record<string,string>>({}),[saving,setSaving]=useState(false),[uncertain,setUncertain]=useState(false),[message,setMessage]=useState(''),[notice,setNotice]=useState('');
 const active=useRef(true),sequence=useRef(0),lock=useRef(false),pending=useRef<string|null>(null);
 const invalidate=useCallback(()=>{sequence.current++;},[]);
 const dirty=Object.values(drafts).some(value=>value.trim().length>0),busy=saving||uncertain;
 useProChildGuard(dirty||busy,useCallback(()=>setMessage(c.leave),[c.leave]));
 const load=useCallback(async()=>{
  const id=++sequence.current;setLoading(true);setError(false);
  try{const response=await fetch(api+'?'+new URLSearchParams({requestId}),{cache:'no-store',headers:{'X-Pro-Expected-Actor':accountId}});
   if(response.status===404){if(active.current&&id===sequence.current)setView({visible:false});return;}if(!response.ok)throw Error();
   const body=moodClientViewSchema.parse(await response.json());if(active.current&&id===sequence.current)setView(body);}
  catch{if(active.current&&id===sequence.current)setError(true);}
  finally{if(active.current&&id===sequence.current)setLoading(false);}
 },[accountId,requestId]);
 useEffect(()=>{active.current=true;const timer=setTimeout(()=>void load(),0);return()=>{active.current=false;invalidate();clearTimeout(timer);};},[load,invalidate]);
 async function send(body:string,boardId:string){
  if(lock.current)return;lock.current=true;pending.current=body;setSaving(true);setMessage('');setNotice('');
  try{
   const response=await fetch(api,{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json','X-Pro-Expected-Actor':accountId},body});
   // 409/403: the professional shared a newer version, stopped sharing or turned the section off.
   if(response.status===409||response.status===403){pending.current=null;setUncertain(false);setMessage(c.conflict);lock.current=false;await load();return;}
   if(response.status>=500||response.status===429){setUncertain(true);setMessage(c.uncertain);return;}
   if(!response.ok){pending.current=null;setUncertain(false);setMessage(c.failed);return;}
   moodClientResultSchema.parse(await response.json());
   pending.current=null;setUncertain(false);setDrafts(old=>({...old,[boardId]:''}));setNotice(c.sent);lock.current=false;await load();
  }catch{setUncertain(true);setMessage(c.uncertain);}
  finally{lock.current=false;if(active.current)setSaving(false);}
 }
 function submit(event:FormEvent,board:MoodClientBoard){
  event.preventDefault();if(busy)return;const body=(drafts[board.id]??'').trim();if(!body){setMessage(c.required);return;}
  void send(JSON.stringify({action:'comment',actionId:crypto.randomUUID(),requestId,boardId:board.id,commentId:crypto.randomUUID(),version:board.version,body:body.slice(0,MOOD_COMMENT_MAX)}),board.id);
 }
 if(error)return <div role="alert" data-client-mood-boards-error className="space-y-2 rounded-2xl border border-[#d7e1ea] p-4"><p className="text-sm">{c.loadError}</p><Button className="min-h-11" type="button" variant="secondary" disabled={loading} onClick={()=>void load()}>{c.retry}</Button></div>;
 if(!view||!view.visible||view.boards.length===0)return null;
 return <section data-client-mood-boards className="space-y-4 rounded-2xl border border-[#d7e1ea] bg-white p-4 text-[#162543]">
  <div><h3 className="font-bold">{c.title}</h3><p className="mt-1 text-sm text-[#52627a]">{c.intro}</p></div>
  {notice&&<p role="status" className="rounded-xl bg-[#eef8f4] p-3 text-sm text-[#18573a]">{notice}</p>}
  {message&&<div role="alert" className="space-y-2 rounded-xl bg-[#fff4f2] p-3 text-sm text-[#8a2a1b]"><p>{message}</p>{uncertain&&<Button className="min-h-11" type="button" variant="secondary" disabled={saving} onClick={()=>{const body=pending.current;if(body){const parsed=JSON.parse(body) as {boardId:string};void send(body,parsed.boardId);}}}>{c.retrySame}</Button>}</div>}
  {view.boards.map(board=><ClientBoard key={board.publicationId} board={board} c={c} en={en} draft={drafts[board.id]??''} busy={busy} saving={saving}
   onDraft={value=>setDrafts(old=>({...old,[board.id]:value}))} onSubmit={event=>submit(event,board)}/>)}
 </section>;
}

function ClientBoard({board,c,en,draft,busy,saving,onDraft,onSubmit}:{board:MoodClientBoard;c:Copy;en:boolean;draft:string;busy:boolean;saving:boolean;onDraft:(value:string)=>void;onSubmit:(event:FormEvent)=>void}){
 const [index,setIndex]=useState(0),[presenting,setPresenting]=useState(false);
 const page=board.pages[Math.min(index,board.pages.length-1)];
 const pages=board.pages.map(p=>({id:p.id,name:p.name,background:p.background,items:items(board,p.id,p.elements,c)}));
 return <article data-client-mood-board={board.id} className="space-y-3 rounded-2xl bg-[#f7f9fc] p-3 sm:p-4">
  {presenting&&<MoodPresenter format={board.pageFormat} title={board.name} pages={pages} start={index} en={en} onClose={()=>setPresenting(false)}/>}
  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
   <div className="min-w-0"><h4 className="break-words font-semibold">{board.name}{board.room?` · ${board.room}`:''}</h4><p className="text-xs text-[#52627a]">{c.shared(stamp(board.publishedAt,en),board.version)}</p></div>
   <Button type="button" variant="secondary" className="min-h-11 shrink-0" onClick={()=>setPresenting(true)}>{c.present}</Button>
  </div>
  <MoodCanvas format={board.pageFormat} background={page.background} items={pages[Math.min(index,pages.length-1)].items} label={`${board.name}. ${c.page(index+1,board.pages.length)}`}/>
  {board.pages.length>1&&<div className="flex flex-wrap items-center justify-between gap-2">
   <Button type="button" variant="secondary" className="min-h-11" disabled={index===0} onClick={()=>setIndex(i=>Math.max(0,i-1))}>{c.prev}</Button>
   <p aria-live="polite" className="text-sm text-[#52627a]">{c.page(index+1,board.pages.length)}{page.name?` · ${page.name}`:''}</p>
   <Button type="button" variant="secondary" className="min-h-11" disabled={index>=board.pages.length-1} onClick={()=>setIndex(i=>Math.min(board.pages.length-1,i+1))}>{c.next}</Button>
  </div>}
  <section className="space-y-2"><h5 className="text-sm font-semibold">{c.comments}</h5>
   {board.comments.length===0?<p className="text-sm text-[#52627a]">{c.none}</p>:<ol className="space-y-2">{board.comments.map(comment=><li key={comment.id} data-client-mood-comment={comment.side} className="rounded-xl bg-white p-3 text-sm">
    <p className="flex flex-wrap justify-between gap-2 text-xs text-[#52627a]"><span className="font-semibold text-[#162543]">{comment.side==='client'?c.you:c.professional}</span><span>{stamp(comment.createdAt,en)}</span></p>
    <p className="mt-1 whitespace-pre-wrap break-words">{comment.body}</p></li>)}</ol>}
   <form onSubmit={onSubmit} className="space-y-2">
    <label className="block text-sm font-semibold">{c.write}<textarea data-client-mood-comment-field rows={2} maxLength={MOOD_COMMENT_MAX} disabled={busy} value={draft} onChange={e=>onDraft(e.target.value)} className="mt-1 block w-full min-w-0 rounded-xl border border-[#d7e1ea] bg-white px-3 py-2 text-base font-normal"/></label>
    <div className="flex justify-end"><Button type="submit" className="min-h-11" disabled={busy||!draft.trim()}>{saving?c.sending:c.send}</Button></div>
   </form>
  </section>
 </article>;
}
