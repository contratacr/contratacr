'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {useLocale} from 'next-intl';
import {Button} from '@/components/ui/button';
import {stageRulesReadSchema,type StageRulesRead,type StageSettings} from '@/lib/pro/sales-pipeline';
import {leadStageName} from './lead-stages-editor';

/**
 * Row 07: rules per stage. A company asks for a follow-up N days after a lead enters a stage; the list below shows the
 * open leads that reached it. Work list only: nothing is sent and the leads are not changed. SQL decides; each write
 * keeps its actionId until confirmed (a retry never duplicates).
 */
const COPY={
 es:{title:'Reglas por etapa',intro:'Pida un seguimiento cuando una solicitud lleve varios días en una etapa. Es una lista de trabajo: no envía mensajes ni cambia la solicitud.',
  days:'Dar seguimiento a los (días)',none:'Sin regla',save:'Guardar regla',clear:'Quitar regla',saved:(n:string)=>`Regla de "${n}" guardada.`,cleared:(n:string)=>`Regla de "${n}" quitada.`,
  changed:'Las reglas cambiaron en otra pestaña. Se recargaron.',failed:'No se pudo guardar. Reintente: no se duplicará.',loadFailed:'No se pudieron cargar las reglas.',retry:'Reintentar',loading:'Cargando…',
  dueTitle:'Por dar seguimiento',dueEmpty:'Ninguna solicitud ha llegado al seguimiento de sus reglas.',inStage:(n:number)=>n===1?'1 día en la etapa':`${n} días en la etapa`,since:'Seguimiento desde',
  request:'Solicitud',manual:'Oportunidad',invalid:'Escriba un número de 1 a 90.',stage:'Etapa',open:'Reglas por etapa'},
 en:{title:'Rules per stage',intro:'Ask for a follow-up when a request has been in a stage for several days. It is a work list: it sends no messages and does not change the request.',
  days:'Follow up after (days)',none:'No rule',save:'Save rule',clear:'Remove rule',saved:(n:string)=>`Rule for "${n}" saved.`,cleared:(n:string)=>`Rule for "${n}" removed.`,
  changed:'The rules changed in another tab. They were reloaded.',failed:'Could not save. Try again: it will not be duplicated.',loadFailed:'Could not load the rules.',retry:'Retry',loading:'Loading…',
  dueTitle:'To follow up',dueEmpty:'No request has reached the follow-up of its rules.',inStage:(n:number)=>n===1?'1 day in the stage':`${n} days in the stage`,since:'Follow-up since',
  request:'Request',manual:'Opportunity',invalid:'Enter a number from 1 to 90.',stage:'Stage',open:'Rules per stage'},
};
async function get(actor:string){const r=await fetch('/api/pro/lead-pipeline/rules',{cache:'no-store',headers:{'X-Pro-Expected-Actor':actor}});if(!r.ok)throw Error(String(r.status));return r.json();}
async function post(actor:string,body:unknown){const r=await fetch('/api/pro/lead-pipeline/rules',{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json','X-Pro-Expected-Actor':actor},body:JSON.stringify(body)});return {status:r.status,ok:r.ok};}
export function StageRules({actor,settings,disabled}:{actor:string;settings:StageSettings|null;disabled:boolean}){
 const lang=useLocale()==='en'?'en':'es',c=COPY[lang],en=lang==='en';
 const [data,setData]=useState<StageRulesRead|null>(null),[error,setError]=useState(false),[drafts,setDrafts]=useState<Record<string,string>>({}),[busy,setBusy]=useState(''),[msg,setMsg]=useState(''),[bad,setBad]=useState(''),seq=useRef(0),pending=useRef<Record<string,{key:string;actionId:string}>>({});
 const load=useCallback(async()=>{const n=++seq.current;try{setError(false);const r=stageRulesReadSchema.parse(await get(actor));if(n===seq.current){setData(r);setDrafts({});}}catch{if(n===seq.current)setError(true);}},[actor]);
 useEffect(()=>{const timer=setTimeout(()=>void load(),0);return()=>clearTimeout(timer);},[load]);
 const stages=settings?.stages.filter(s=>!s.hidden)??[],name=(id:string)=>{const s=settings?.stages.find(x=>x.id===id);return s?leadStageName({id:s.id,builtin:s.builtin,name:s.name,position:s.position,hidden:s.hidden,reassignToId:null},en):id;};
 const current=(id:string)=>data?.rules.find(r=>r.stageId===id)?.followUpDays;
 async function save(id:string,clear=false){if(!data||busy)return;const raw=(drafts[id]??'').trim(),days=Number(raw);
  if(!clear&&(!/^\d{1,2}$/.test(raw)||days<1||days>90)){setBad(id);setMsg('');return;}
  setBad('');const body=clear?{action:'clear',revision:data.revision,stageId:id}:{action:'set',revision:data.revision,stageId:id,days},key=JSON.stringify(body);
  if(pending.current[id]?.key!==key)pending.current[id]={key,actionId:crypto.randomUUID()};
  setBusy(id);setMsg('');
  try{const r=await post(actor,{...body,actionId:pending.current[id].actionId});
   if(r.status===409){delete pending.current[id];setMsg(c.changed);await load();return;}if(!r.ok)throw Error();
   delete pending.current[id];setMsg(clear?c.cleared(name(id)):c.saved(name(id)));await load();}
  catch{setMsg(c.failed);}finally{setBusy('');}}
 const fmt=(day:string)=>new Intl.DateTimeFormat(en?'en-US':'es-CR',{dateStyle:'medium',timeZone:'UTC'}).format(new Date(day+'T12:00:00Z'));
 return <section data-stage-rules aria-label={c.title} className="min-w-0 rounded-2xl border border-[#d7e1ea] bg-white p-4">
  <h3 className="text-base font-bold text-[#162543]">{c.title}</h3><p className="mt-0.5 max-w-prose text-xs text-[#52627a]">{c.intro}</p>
  {error&&<p role="alert" className="mt-3 text-sm">{c.loadFailed} <Button variant="outline" size="sm" onClick={()=>void load()}>{c.retry}</Button></p>}
  {!data&&!error&&<p role="status" className="mt-3 text-sm text-[#52627a]">{c.loading}</p>}
  {msg&&<p role="status" data-stage-rules-notice className="mt-2 text-sm text-[#1f6f43]">{msg}</p>}
  {data&&<ul className="mt-3 grid gap-2 sm:grid-cols-2">{stages.map(s=>{const cur=current(s.id),draft=drafts[s.id]??(cur?String(cur):'');
   return <li key={s.id} data-stage-rule={s.id} className="min-w-0 rounded-xl border border-[#eef2f6] p-3">
    <p className="text-sm font-semibold text-[#162543]">{name(s.id)}</p>
    <div className="mt-2 flex flex-wrap items-end gap-2"><label className="block min-w-0 text-xs font-semibold text-[#52627a]">{c.days}
     <input data-stage-rule-days={s.id} aria-invalid={bad===s.id} inputMode="numeric" maxLength={2} placeholder={c.none} value={draft} disabled={disabled||busy===s.id}
      onChange={e=>{setDrafts({...drafts,[s.id]:e.target.value});if(bad===s.id)setBad('');}} className={'mt-1 min-h-11 w-24 rounded-xl border bg-white px-3 text-base text-[#162543] '+(bad===s.id?'border-red-500':'border-[#d7e1ea]')}/></label>
     <Button type="button" size="sm" data-pro-write="lead.write" data-stage-rule-save={s.id} disabled={disabled||!!busy||draft.trim()===(cur?String(cur):'')||!draft.trim()} onClick={()=>void save(s.id)}>{c.save}</Button>
     {cur!==undefined&&<Button type="button" size="sm" variant="outline" data-pro-write="lead.write" data-stage-rule-clear={s.id} disabled={disabled||!!busy} onClick={()=>void save(s.id,true)}>{c.clear}</Button>}</div>
    {bad===s.id&&<p role="alert" className="mt-1 text-xs text-red-700">{c.invalid}</p>}</li>;})}</ul>}
  {data&&<div className="mt-4"><h4 className="text-sm font-bold text-[#162543]">{c.dueTitle}</h4>
   {data.due.length===0?<p data-stage-rules-due-empty className="mt-1 text-sm text-[#52627a]">{c.dueEmpty}</p>
    :<ul className="mt-2 space-y-2">{data.due.map(d=><li key={d.kind+d.id} data-stage-rule-due={d.id} className="min-w-0 rounded-xl bg-[#f7f9fc] px-3 py-2 text-sm"><p className="break-words font-semibold text-[#162543]">{d.title||(d.kind==='request'?c.request:c.manual)}</p>
     <p className="text-xs text-[#52627a]">{name(d.stageId)} · {c.inStage(d.daysIn)} · {c.since} {fmt(d.dueOn)}</p></li>)}</ul>}</div>}
 </section>;
}
