'use client';
import {useRef,useState,useSyncExternalStore} from 'react';
import {featureReasonText,type PublicQuestions} from '@/lib/directory/place-features';
import {REVIEW_FLAG_LABELS,REVIEW_FLAG_REASONS} from '@/lib/directory/moderation-schemas';
import {BIZ} from './biz-ui';

/**
 * LOCAL PRO ONLY (place features round, 2026-11-17): «Preguntas y respuestas» on every place page. Anyone signed in asks
 * and answers; answers from the business (its managers or its Pro team with listing.publish) are marked «Respuesta del
 * negocio» and listed first. Every question/answer can be reported (staff queue in /admin/directorio). No links or
 * @handles; newest questions first (never by payment). Idempotent: a retry reuses the same actionId.
 */
const ring='focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#009FD9]';
const button=`inline-flex min-h-11 items-center justify-center rounded-full bg-[#162543] px-5 font-semibold text-white disabled:opacity-60 ${ring}`;
const link=`min-h-11 text-sm font-semibold underline underline-offset-2 ${ring}`;
const field='w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base text-[#162543]';
const noSubscribe=()=>()=>{};
export function PlaceQuestions({slug,locale,initial,signedIn,loginHref,isManager}:{slug:string;locale:string;initial:PublicQuestions;signedIn:boolean;loginHref:string|null;isManager:boolean}){
 const en=locale==='en',t=(es:string,english:string)=>en?english:es;
 const ready=useSyncExternalStore(noSubscribe,()=>true,()=>false);
 const [data,setData]=useState(initial),[notice,setNotice]=useState<{ok:boolean;text:string;at:string}|null>(null),[busy,setBusy]=useState<string|null>(null);
 const [answering,setAnswering]=useState<string|null>(null),[reporting,setReporting]=useState<string|null>(null);
 const actions=useRef(new Map<string,{id:string;item:string;body:string}>());
 const date=(iso:string)=>new Intl.DateTimeFormat(en?'en-US':'es-CR',{dateStyle:'medium',timeZone:'America/Costa_Rica'}).format(new Date(iso));
 const reload=async()=>{const r=await fetch(`/api/lugar/${encodeURIComponent(slug)}/preguntas`,{cache:'no-store'});if(r.ok)setData(await r.json() as PublicQuestions);};
 const send=async(key:string,payload:Record<string,unknown>,at:string)=>{
  const bodyKey=JSON.stringify(payload);let a=actions.current.get(key);if(!a||a.body!==bodyKey){a={id:crypto.randomUUID(),item:crypto.randomUUID(),body:bodyKey};actions.current.set(key,a);}
  setBusy(key);setNotice(null);
  try{
   // Same action → same ids on a retry (the server answers the first result again).
   const ids=payload.type==='flag'?{flagId:a.id}:payload.type==='question'?{actionId:a.id,questionId:a.item}:{actionId:a.id,answerId:a.item};
   const r=await fetch(`/api/lugar/${encodeURIComponent(slug)}/preguntas`,{method:'POST',headers:{'content-type':'application/json','accept-language':en?'en':'es'},body:JSON.stringify({...payload,...ids})});
   const j=await r.json().catch(()=>({})) as {reason?:string};
   if(!r.ok){setNotice({ok:false,text:featureReasonText(j.reason,en),at});return false;}
   actions.current.delete(key);
   setNotice({ok:true,text:payload.type==='flag'?t('Gracias. El equipo de ContrataCR revisará el reporte.','Thank you. The ContrataCR team will review the report.'):payload.type==='question'?t('Pregunta publicada.','Question posted.'):t('Respuesta publicada.','Answer posted.'),at});
   if(payload.type!=='flag')await reload();
   return true;
  }catch{setNotice({ok:false,text:featureReasonText('unavailable',en),at});return false;}finally{setBusy(null);}
 };
 const note=(at:string)=>notice&&notice.at===at?<p role={notice.ok?'status':'alert'} className={`text-sm font-semibold ${notice.ok?'text-emerald-800':'text-red-800'}`} data-qa-notice={notice.ok?'ok':'error'}>{notice.text}</p>:null;
 const reportForm=(kind:'question'|'answer',id:string)=><form data-qa-report-form className="mt-2 space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3" onSubmit={async e=>{e.preventDefault();const f=new FormData(e.currentTarget);
   const message=String(f.get('message')??'').trim();if(await send('flag:'+id,{type:'flag',targetKind:kind,targetId:id,reason:String(f.get('reason')),...(message?{message}:{})},'item:'+id))setReporting(null);}}>
  <label className="block text-sm font-semibold">{t('Motivo','Reason')}<select name="reason" className={`${field} min-h-11`} defaultValue="spam">{REVIEW_FLAG_REASONS.map(r=><option key={r} value={r}>{REVIEW_FLAG_LABELS[r][en?1:0]}</option>)}</select></label>
  <label className="block text-sm font-semibold">{t('Detalle (opcional)','Details (optional)')}<input name="message" className={`${field} min-h-11`} maxLength={500}/></label>
  <button type="submit" className={button} disabled={busy!==null}>{t('Enviar reporte','Send report')}</button></form>;
 return <section id="preguntas" aria-labelledby="place-questions" data-place-questions={data.total} data-ready={ready||undefined} className="scroll-mt-24 space-y-4 text-[#162543]">
  <h2 id="place-questions" className={BIZ.h2}>{t('Preguntas a la comunidad','Ask the community')}</h2>
  {signedIn&&!isManager?<form data-qa-ask className="space-y-2" onSubmit={async e=>{e.preventDefault();const el=e.currentTarget,body=String(new FormData(el).get('body')??'').trim();
    if(body.length<5){setNotice({ok:false,text:t('Escriba una pregunta de al menos 5 caracteres.','Write a question of at least 5 characters.'),at:'ask'});return;}
    if(await send('ask',{type:'question',body},'ask'))el.reset();}}>
   <label htmlFor="qa-ask" className="block text-sm font-semibold">{t('Pregunte algo a este negocio o a la comunidad','Ask this business or the community')}</label>
   <textarea id="qa-ask" name="body" rows={2} maxLength={300} className={field} placeholder={t('Ej.: ¿Tienen parqueo?','E.g. Is there parking?')}/>
   {note('ask')}
   <button type="submit" className={button} disabled={busy!==null||!ready} data-qa-ask-submit>{t('Publicar pregunta','Post question')}</button>
  </form>:!signedIn&&loginHref?<p className="text-sm"><a className={link} href={loginHref}>{t('Inicie sesión para preguntar o responder','Sign in to ask or answer')}</a></p>:null}
  {data.items.length===0?<div className="rounded-2xl bg-[#f7fafc] p-5" data-qa-empty><p className="text-base font-semibold text-[#162543]">{t('Todavía no hay preguntas.','No questions yet.')}</p></div>
   :<ul className="space-y-4">{data.items.map(q=><li key={q.id} data-qa-question={q.id} className="space-y-2 rounded-2xl border border-[#d7e1ea] p-4">
    <p className="font-semibold">{q.body}</p>
    <p className="text-xs text-slate-700">{q.name} · {date(q.createdAt)}</p>
    {q.answers.length>0&&<ul className="space-y-2 border-l-2 border-[#d7e1ea] pl-3">{q.answers.map(a=><li key={a.id} data-qa-answer={a.id} data-qa-owner={a.isOwner||undefined}>
     {a.isOwner&&<span className="mb-1 inline-block rounded-full bg-[#eaf6fb] px-2 py-0.5 text-xs font-bold text-[#0b4f6c]">{t('Respuesta del negocio','Answer from the business')}</span>}
     <p>{a.body}</p><p className="text-xs text-slate-700">{a.name} · {date(a.createdAt)}
      {signedIn&&<>{' · '}<button type="button" className={`text-xs underline ${ring}`} data-qa-report="answer" onClick={()=>setReporting(reporting===a.id?null:a.id)}>{t('Reportar','Report')}</button></>}</p>
     {reporting===a.id&&reportForm('answer',a.id)}{note('item:'+a.id)}</li>)}</ul>}
    <div className="flex flex-wrap gap-4">
     {signedIn&&<button type="button" className={link} data-qa-answer-open={q.id} onClick={()=>setAnswering(answering===q.id?null:q.id)}>{isManager?t('Responder como el negocio','Answer as the business'):t('Responder','Answer')}</button>}
     {signedIn&&<button type="button" className={link} data-qa-report="question" onClick={()=>setReporting(reporting===q.id?null:q.id)}>{t('Reportar pregunta','Report question')}</button>}
    </div>
    {reporting===q.id&&reportForm('question',q.id)}
    {answering===q.id&&<form data-qa-answer-form className="space-y-2" onSubmit={async e=>{e.preventDefault();const el=e.currentTarget,body=String(new FormData(el).get('body')??'').trim();if(!body)return;
      if(await send('answer:'+q.id,{type:'answer',questionId:q.id,body},'item:'+q.id)){el.reset();setAnswering(null);}}}>
     <label className="block text-sm font-semibold" htmlFor={'qa-answer-'+q.id}>{t('Su respuesta','Your answer')}</label>
     <textarea id={'qa-answer-'+q.id} name="body" rows={2} maxLength={500} className={field}/>
     <button type="submit" className={button} disabled={busy!==null} data-qa-answer-submit>{t('Publicar respuesta','Post answer')}</button></form>}
    {note('item:'+q.id)}
   </li>)}</ul>}
 </section>;
}
