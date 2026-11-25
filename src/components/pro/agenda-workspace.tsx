'use client';
import {AppointmentReminderPreference} from './appointment-reminder-preference';
import { useCallback,useEffect,useRef,useState } from 'react';
import {useProSearchParams} from './use-pro-search-params';
import {replaceProParams} from '@/lib/pro/navigation';
import {useTranslations} from 'next-intl';
import { BusinessPanel } from './business-panel';
import {AppointmentInbox} from './appointment-inbox';
import {AgendaCalendar} from './agenda-calendar';
import {useLocale} from 'next-intl';
import { businessSchema,emptyBusiness,type Business,type Client } from '@/lib/pro/business';
import {agendaDay} from '@/lib/pro/agenda-time';
import { crTodayISO } from '@/lib/time-cr';
import type { ProQuoteRow } from '@/lib/pro/panel-queries';
export type AgendaControls={mode:'day'|'upcoming';search:string;setMode:(mode:'day'|'upcoming')=>void;setSearch:(value:string)=>void;day:string;month:string;marks:string[];ids:string[];detail:(id:string)=>Promise<Business['work'][number]|false>;loading:boolean;hasMore:boolean;setDay:(day:string)=>void;setMonth:(month:string)=>void;more:()=>void;clients:(rows:Client[])=>void;quote:(row:ProQuoteRow|undefined)=>void;exportRows:()=>Promise<Business>};
const validDay=(value:string|null)=>value&&/^\d{4}-\d{2}-\d{2}$/.test(value)?value:crTodayISO();
export function AgendaWorkspace(){
 const en=useLocale()==='en';
 const copy=useTranslations("ProControlsUX"),params=useProSearchParams();
 const [data,setData]=useState<Business>(emptyBusiness),[marks,setMarks]=useState<string[]>([]);
 const day=validDay(params.get('dia')),month=/^\d{4}-\d{2}$/.test(params.get('mes')||'')?params.get('mes')!:day.slice(0,7);
 const mode=params.get('vista')==='upcoming'?'upcoming':'day',search=params.get('q')||'';
 const [accountId,setAccountId]=useState(''),[ready,setReady]=useState(false),[loading,setLoading]=useState(false),[saving,setSaving]=useState(false),[error,setError]=useState(''),[cursor,setCursor]=useState<string|null>(null);
 const [ids,setIds]=useState<string[]>([]);const contextWork=useRef<Business['work']>([]);
 const contextVersion=useRef<{id:string;revision:number}|null>(null),detailSequence=useRef(0);
 useEffect(()=>()=>{detailSequence.current++;},[]);
 const revision=useRef(0),sequence=useRef(0),busy=useRef(false),lock=useRef(false);
 const invalidate=useCallback(()=>{sequence.current++;busy.current=false;},[]);
 const query=useCallback((after='')=>'/api/pro/agenda?'+new URLSearchParams({day,month,after,mode,q:mode==='upcoming'?search:''}),[day,month,mode,search]);
 const load=useCallback(async(after='')=>{
 if(after&&busy.current)return;const request=++sequence.current;busy.current=true;setLoading(true);setError('');
 try{
 const r=await fetch(query(after),{cache:'no-store'}),b=await r.json();if(!r.ok)throw Error(b.error);if(request!==sequence.current)return;
 if(after&&revision.current!==b.revision)throw Error(copy('changed'));
 const work=businessSchema.shape.work.parse(b.work),availability=businessSchema.shape.availability.parse(b.availability);
 if(!after)revision.current=b.revision;
 if(contextVersion.current){const fresh=work.find(row=>row.id===contextVersion.current!.id);if(fresh){contextWork.current=[fresh];contextVersion.current={id:fresh.id,revision:b.revision};}else if(contextVersion.current.revision!==b.revision)contextWork.current=[];}
 setIds(old=>after?[...new Set([...old,...work.map(w=>w.id)])]:work.map(w=>w.id));
      setData(old=>({...old,work:after?[...old.work.filter(w=>!work.some(n=>n.id===w.id)),...work]:[...work,...contextWork.current.filter(w=>!work.some(n=>n.id===w.id))],availability}));setMarks(b.marks);setCursor(b.nextCursor);setAccountId(b.userId);setReady(true);
 }catch(e){if(request===sequence.current)setError((e as Error).message);}finally{if(request===sequence.current){busy.current=false;setLoading(false);}}
 },[query,copy]);
 useEffect(()=>{invalidate();const timer=setTimeout(()=>void load(),mode==='upcoming'?250:0);return()=>{clearTimeout(timer);invalidate();};},[load,invalidate,mode]);
 useEffect(()=>{const refresh=()=>{if(!lock.current){invalidate();void load();}};window.addEventListener('contratacr:appointments-changed',refresh);return()=>window.removeEventListener('contratacr:appointments-changed',refresh);},[invalidate,load]);
 async function detail(id:string,retried=false):Promise<Business['work'][number]|false>{const request=++detailSequence.current;try{const r=await fetch('/api/pro/agenda?'+new URLSearchParams({id}),{cache:'no-store'}),b=await r.json();if(!r.ok)throw Error(b.error);if(request!==detailSequence.current)return false;if(b.revision<revision.current){if(!retried)return detail(id,true);throw Error(copy('changed'));}const work=businessSchema.shape.work.element.parse(b.work);contextWork.current=[work];contextVersion.current={id,revision:b.revision};setData(old=>({...old,work:[...old.work.filter(w=>w.id!==id),work]}));const date=agendaDay(work.start);if(date&&date!==day&&mode==='day'){invalidate();replaceProParams({dia:date,mes:date.slice(0,7)});}return work;}catch(e){if(request===detailSequence.current)setError((e as Error).message);return false;}}
 async function commit(next:Business){
 if(lock.current||loading||!ready)return false;lock.current=true;setSaving(true);setError('');
 try{
 const work=next.work.filter(w=>JSON.stringify(w)!==JSON.stringify(data.work.find(p=>p.id===w.id)));
 const add=next.availability.filter(s=>!data.availability.some(p=>p.start===s.start));const remove=data.availability.filter(s=>!next.availability.some(n=>n.start===s.start));
 if(!work.length&&!add.length&&!remove.length)return true;
 if(contextVersion.current&&work.some(row=>row.id===contextVersion.current!.id)&&contextVersion.current.revision!==revision.current)throw Error(copy('changed'));
 if(work.length+add.length+remove.length!==1)throw Error('Guarde un cambio a la vez.');
 const r=await fetch('/api/pro/agenda',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision:revision.current,work:work[0],add:add[0],remove:remove[0]?.start})}),b=await r.json();if(!r.ok)throw Error(b.code==='converted_work_identity'?(en?'This job stays linked to its original customer.':'Este trabajo conserva su cliente original.'):b.error);
 revision.current=b.revision;
 window.dispatchEvent(new Event('contratacr:appointments-changed'));
 if(contextVersion.current&&work[0]?.id===contextVersion.current.id){contextWork.current=[work[0]];contextVersion.current={id:work[0].id,revision:b.revision};}
 const target=(work[0]?agendaDay(work[0].start)||day:day);
 if(target!==day){invalidate();replaceProParams({dia:target,mes:target.slice(0,7)});}else await load();
 return true;
 }catch(e){setError((e as Error).message);return false;}finally{lock.current=false;setSaving(false);}
 }
 async function exportRows(){const result=emptyBusiness();let after='',expected:number|undefined;do{const r=await fetch(query(after),{cache:'no-store'}),b=await r.json();if(!r.ok)throw Error(b.error);if(expected!==undefined&&expected!==b.revision)throw Error('Los datos cambiaron.');expected=b.revision;result.work.push(...businessSchema.shape.work.parse(b.work));after=b.nextCursor||'';}while(after);return result;}
 return <div data-pro-workspace="" className="space-y-6"><div hidden={!!params.get("cita")||!!params.get("nueva")||!!params.get("editar")} inert={!!params.get("cita")||!!params.get("nueva")||!!params.get("editar")}><AppointmentInbox ready={ready}/><details data-availability-secondary className="mt-5 rounded-2xl border border-[#d7e1ea] p-4"><summary className="min-h-11 cursor-pointer font-semibold">{en?"Public availability":"Disponibilidad pública"}</summary><AgendaCalendar data={data} commit={commit} saving={saving} loading={loading} day={day} onDay={value=>replaceProParams({dia:value,mes:value.slice(0,7)})}/></details><AppointmentReminderPreference/></div><BusinessPanel dialogsOnly section="Agenda" accountId={accountId} data={data} ready={ready} error={error} saving={saving||loading} commit={commit} reload={()=>{if(!lock.current)void load();}} agenda={{mode,search,setMode:value=>{if(value===mode)return;invalidate();replaceProParams({vista:value==='day'?null:value});setIds([]);setCursor(null);setLoading(true);},setSearch:value=>{if(value===search)return;invalidate();replaceProParams({q:value});setIds([]);setCursor(null);setLoading(true);},day,month,marks,ids,detail,loading,hasMore:!!cursor,setDay:value=>{if(!value||value===day)return;invalidate();replaceProParams({dia:value,mes:value.slice(0,7)});setCursor(null);setLoading(true);},setMonth:value=>{if(value===month)return;invalidate();replaceProParams({mes:value});},more:()=>{if(cursor)void load(cursor);},clients:rows=>setData(old=>({...old,clients:[...old.clients.filter(c=>!rows.some(r=>r.id===c.id)),...rows]})),quote:row=>{if(row)setData(old=>({...old,quoteLinks:row.legacy?old.quoteLinks:[...old.quoteLinks.filter(l=>l.quoteId!==row.id),{quoteId:row.id,clientId:row.clientId!}]}));},exportRows}}/></div>;
}
