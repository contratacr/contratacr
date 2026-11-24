'use client';
import {useEffect,useMemo,useState,useSyncExternalStore} from 'react';
import Link from 'next/link';
import {ArrowUpDown,Check,Lock,MapPin,Plus,Share2,SlidersHorizontal,Unlock,Bookmark,Trash2,Map as MapIcon} from 'lucide-react';
import {featureReasonText,type SavedList} from '@/lib/directory/place-features';
import {BEEN_GOAL,BEEN_NAME,WANT_NAME,fetchLists,isSystemList,rememberBeenHereCount,setSystemList} from '@/components/saved/lists-client';
import {SavedListsManager} from '@/components/directory/saved-lists-manager';

/**
 * «Mis listas» (WS4): header with the «Mapa» pill, tabs He estado | Quiero ir | Listas, toolbar (filtro, Reordenar, +, compartir),
 * the progress card of the top-10 unlock (counts the real "He estado" places) and «¿Ya ha estado aquí?» suggestions.
 */
export type ListSuggestion={slug:string;name:string;area:string;kinds:string};
const ring='focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#009FD9]';
const noSubscribe=()=>()=>{};
const tile=['bg-[#eaf6fb] text-[#0089bb]','bg-[#e8ecf4] text-[#162543]','bg-[#e3f4ee] text-[#17795a]'];
function Thumb({name,i}:{name:string;i:number}){return <span aria-hidden="true" className={`grid h-14 w-14 shrink-0 place-items-center rounded-xl text-lg font-extrabold ${tile[i%3]}`}>{name.trim().charAt(0).toUpperCase()}</span>;}
type Tab='been'|'want'|'lists';

export function MyListsTabs({locale,initial,origin,suggestions}:{locale:string;initial:SavedList[];origin:string;suggestions:ListSuggestion[]}){
 const en=locale==='en',t=(es:string,english:string)=>en?english:es,prefix=en?'/en':'';
 const [lists,setLists]=useState(initial),[tab,setTab]=useState<Tab>('been'),[q,setQ]=useState(''),[showFilter,setShowFilter]=useState(false),[alpha,setAlpha]=useState(false);
 const [msg,setMsg]=useState<{ok:boolean;text:string}|null>(null),[busy,setBusy]=useState<string|null>(null),[map,setMap]=useState(false);
 const ready=useSyncExternalStore(noSubscribe,()=>true,()=>false);
 useEffect(()=>{rememberBeenHereCount(initial);},[initial]);
 const reload=async()=>{const l=await fetchLists();if(l){setLists(l);rememberBeenHereCount(l);}};
 const sys=(n:string)=>lists.find(l=>l.name===n);
 const been=sys(BEEN_NAME),want=sys(WANT_NAME);
 const count=been?.count??0,left=Math.max(0,BEEN_GOAL-count);
 const source=tab==='want'?want:been;
 const places=useMemo(()=>source?.places??[],[source]);
 const shown=useMemo(()=>{
  const f=q.trim().toLowerCase(),p=places.filter(x=>!f||x.name.toLowerCase().includes(f)||x.area.toLowerCase().includes(f));
  return alpha?[...p].sort((a,b)=>a.name.localeCompare(b.name,locale)):p;
 },[places,q,alpha,locale]);
 const mark=async(slug:string,name:typeof BEEN_NAME|typeof WANT_NAME,on:boolean)=>{
  setBusy(slug);setMsg(null);const r=await setSystemList(name,slug,on);
  setMsg(r.ok?{ok:true,text:on?t('Guardado en su lista.','Saved to your list.'):t('Lugar quitado.','Place removed.')}:{ok:false,text:featureReasonText(r.reason,en)});
  await reload();setBusy(null);
 };
 const share=async()=>{
  const names=places.map(p=>p.name).join(', ');
  const text=tab==='want'?t('Lugares a los que quiero ir: ','Places I want to go: ')+names:t('Lugares donde he estado: ','Places I have been: ')+names;
  try{if(navigator.share){await navigator.share({title:t('Mis listas','My lists'),text});return;}await navigator.clipboard.writeText(text);setMsg({ok:true,text:t('Copiado.','Copied.')});}catch{/* share cancelled */}
 };
 const hint=suggestions.filter(s=>!lists.some(l=>l.places.some(p=>p.slug===s.slug&&(l.name===BEEN_NAME)))).slice(0,6);
 const tabBtn=(id:Tab,label:string,icon:React.ReactNode)=><button key={id} type="button" role="tab" aria-selected={tab===id} data-lists-tab={id} onClick={()=>setTab(id)}
  className={`flex flex-1 items-center justify-center gap-1.5 border-b-2 px-2 py-3 text-sm font-bold ${ring} ${tab===id?'border-[#009FD9] text-[#162543]':'border-transparent text-slate-600'}`}>{icon}{label}</button>;
 return <div data-my-lists data-ready={ready||undefined} className="space-y-4">
  <header className="flex items-center justify-between gap-3"><h1 className="text-2xl font-extrabold text-[#162543]">{t('Mis listas','My lists')}</h1>
   <button type="button" data-lists-map aria-pressed={map} onClick={()=>setMap(v=>!v)} className={`inline-flex min-h-10 items-center gap-1.5 rounded-full border border-[#d7e1ea] px-4 text-sm font-bold text-[#162543] ${ring} ${map?'bg-[#eaf6fb]':'bg-white'}`}><MapIcon aria-hidden="true" className="h-4 w-4"/>{t('Mapa','Map')}</button></header>
  {map&&<section data-lists-map-panel aria-label={t('Mapa de lugares guardados','Map of saved places')} className="space-y-2 rounded-2xl border border-[#d7e1ea] bg-[#f6f9fb] p-4">
   {(been?.places.length||want?.places.length)?<ul className="space-y-2">{[...(been?.places??[]),...(want?.places??[])].slice(0,12).map(p=><li key={p.slug} className="flex items-center justify-between gap-2 text-sm">
    <span className="flex min-w-0 items-center gap-2"><MapPin aria-hidden="true" className="h-4 w-4 shrink-0 text-[#009FD9]"/><span className="truncate font-semibold">{p.name}</span></span>
    <a className={`shrink-0 font-semibold text-[#0089bb] underline ${ring}`} target="_blank" rel="noopener noreferrer" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.name+' '+p.area)}`}>{t('Ver en el mapa','View on map')}</a></li>)}</ul>
    :<p className="text-sm text-slate-700">{t('Cuando guarde lugares, aparecerán aquí para verlos en el mapa.','Once you save places, they will appear here so you can see them on the map.')}</p>}
  </section>}
  <div role="tablist" aria-label={t('Mis listas','My lists')} className="flex border-b border-[#e3eaf1]">
   {tabBtn('been',t('He estado','Been here'),<Check aria-hidden="true" className="h-4 w-4"/>)}{tabBtn('want',t('Quiero ir','Want to go'),<Bookmark aria-hidden="true" className="h-4 w-4"/>)}{tabBtn('lists',t('Listas','Lists'),null)}
  </div>
  {msg&&<p role={msg.ok?'status':'alert'} className={`text-sm font-semibold ${msg.ok?'text-emerald-800':'text-red-800'}`}>{msg.text}</p>}
  {tab!=='lists'?<div className="space-y-4">
   <div className="flex items-center gap-2" data-lists-toolbar>
    <button type="button" aria-label={t('Filtrar','Filter')} aria-pressed={showFilter} onClick={()=>setShowFilter(v=>!v)} className={`grid h-10 w-10 place-items-center rounded-full border border-[#d7e1ea] ${ring} ${showFilter?'bg-[#eaf6fb]':'bg-white'}`}><SlidersHorizontal aria-hidden="true" className="h-4 w-4"/></button>
    <button type="button" data-lists-rerank aria-pressed={alpha} onClick={()=>setAlpha(v=>!v)} className={`inline-flex h-10 items-center gap-1.5 rounded-full border border-[#d7e1ea] px-3 text-sm font-bold ${ring} ${alpha?'bg-[#eaf6fb]':'bg-white'}`}><ArrowUpDown aria-hidden="true" className="h-4 w-4"/>{t('Reordenar','Rerank')}</button>
    <Link href={`${prefix}/buscar`} aria-label={t('Agregar lugares','Add places')} className={`grid h-10 w-10 place-items-center rounded-full border border-[#d7e1ea] bg-white ${ring}`}><Plus aria-hidden="true" className="h-4 w-4"/></Link>
    <button type="button" aria-label={t('Compartir','Share')} disabled={places.length===0} onClick={share} className={`ml-auto grid h-10 w-10 place-items-center rounded-full border border-[#d7e1ea] bg-white disabled:opacity-40 ${ring}`}><Share2 aria-hidden="true" className="h-4 w-4"/></button></div>
   {showFilter&&<div><label className="sr-only" htmlFor="lists-filter">{t('Filtrar por nombre o zona','Filter by name or area')}</label>
    <input id="lists-filter" value={q} onChange={e=>setQ(e.target.value)} placeholder={t('Filtrar por nombre o zona','Filter by name or area')} className="min-h-11 w-full rounded-xl border border-slate-300 px-3 text-base"/></div>}
   {tab==='been'&&<section data-lists-progress aria-label={t('Progreso','Progress')} className="flex items-center gap-4 rounded-2xl bg-[#f1f6fa] p-4">
    <div className="min-w-0 flex-1"><p className="text-lg font-extrabold text-[#162543]"><span data-lists-count>{Math.min(count,BEEN_GOAL)}</span>/{BEEN_GOAL}</p>
     <p className="text-sm text-slate-700">{left>0?(en?`Unlock your top 10 list by adding ${left} more`:`Desbloquee su lista top 10 agregando ${left} más`):t('Su lista top 10 está desbloqueada.','Your top 10 list is unlocked.')}</p></div>
    <div className="flex gap-1.5" aria-hidden="true">{[0,1,2].map(i=><span key={i} className={`grid h-9 w-9 place-items-center rounded-full ${left>0?'bg-white text-slate-500':'bg-[#009FD9] text-white'}`}>{left>0?<Lock className="h-4 w-4"/>:<Unlock className="h-4 w-4"/>}</span>)}</div></section>}
   {shown.length===0?<p data-lists-empty className="rounded-2xl bg-slate-50 p-5 text-center text-slate-700">{tab==='been'?t('Agregue lugares para registrar, clasificar y compartir dónde ha estado.','Add places to track, rank and share where you have been.'):t('Agregue lugares que quiere visitar para tenerlos a mano.','Add places you want to visit to keep them handy.')}</p>
   :<ul className="divide-y divide-[#eef2f6]" data-lists-places>{shown.map((p,i)=><li key={p.slug} className="flex items-center gap-3 py-3"><Thumb name={p.name} i={i}/>
    <Link href={`${prefix}/lugar/${p.slug}`} className={`min-w-0 flex-1 ${ring}`}><span className="block truncate font-bold text-[#162543]">{p.name}</span><span className="block truncate text-sm text-slate-600">{p.area||p.vertical}</span></Link>
    <button type="button" disabled={busy===p.slug} aria-label={`${t('Quitar','Remove')} ${p.name}`} onClick={()=>mark(p.slug,tab==='want'?WANT_NAME:BEEN_NAME,false)} className={`grid h-10 w-10 place-items-center rounded-full text-slate-600 hover:bg-slate-100 ${ring}`}><Trash2 aria-hidden="true" className="h-4 w-4"/></button></li>)}</ul>}
   {hint.length>0&&<section data-lists-suggestions className="space-y-1"><h2 className="text-lg font-extrabold text-[#162543]">{t('¿Ya ha estado aquí?','Have you been here yet?')}</h2>
    <ul className="divide-y divide-[#eef2f6]">{hint.map((s,i)=><li key={s.slug} className="flex items-center gap-3 py-3"><Thumb name={s.name} i={i+1}/>
     <Link href={`${prefix}/lugar/${s.slug}`} className={`min-w-0 flex-1 ${ring}`}><span className="block truncate font-bold text-[#162543]">{s.name}</span><span className="block truncate text-sm text-slate-600">{[s.area,s.kinds].filter(Boolean).join(' • ')}</span></Link>
     <button type="button" data-mark-been={s.slug} disabled={busy===s.slug} aria-label={`${t('Marcar como "He estado"','Mark as "Been here"')}: ${s.name}`} onClick={()=>mark(s.slug,BEEN_NAME,true)} className={`grid h-11 w-11 place-items-center rounded-full border border-[#d7e1ea] text-[#0089bb] ${ring}`}><MapPin aria-hidden="true" className="h-5 w-5"/></button></li>)}</ul></section>}
  </div>:<div role="tabpanel"><SavedListsManager locale={locale} initial={lists.filter(l=>!isSystemList(l.name))} origin={origin}/></div>}
 </div>;
}
