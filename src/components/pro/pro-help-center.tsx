'use client';
import {useState} from 'react';
import {useLocale} from 'next-intl';
import {Button} from '@/components/ui/button';
import {navigatePro} from '@/lib/pro/navigation';
import {fold,helpAreas,helpArticles,helpQuickTopics} from '@/lib/pro/help-content';

/** Row 74: searchable help center inside Pro. Static, bilingual guides that open the tool they explain. */
export function ProHelpCenter(){
 const en=useLocale()==='en',t=(es:string,english:string)=>en?english:es,[query,setQuery]=useState(''),[open,setOpen]=useState<string|null>(null),[area,setArea]=useState<keyof typeof helpAreas|'all'>('all');
 const needle=fold(query.trim()),shown=helpArticles.filter(a=>(area==='all'||a.area===area)&&(!needle||fold(a.title[en?'en':'es']+' '+a.body[en?'en':'es']).includes(needle)));
 const areas=(Object.keys(helpAreas) as (keyof typeof helpAreas)[]).filter(area=>shown.some(a=>a.area===area));
 return <div data-help-center className="min-w-0 space-y-4">
  <label className="block text-sm font-bold">{t('Buscar en la ayuda','Search the help')}<input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder={t('Por ejemplo: cotización, cobro, equipo','For example: quote, payment, team')} className="mt-1 block min-h-11 w-full min-w-0 rounded-xl border border-[#d7e1ea] bg-white px-3 text-base font-normal"/></label>
  <div className="flex flex-wrap gap-2" aria-label={t('Temas sugeridos','Suggested topics')}>{helpQuickTopics.map(topic=><button key={topic.label.es} type="button" data-help-quick onClick={()=>{setQuery(topic.query[en?'en':'es']);setArea('all');}} className="min-h-11 rounded-full border border-[#d7e1ea] bg-white px-3 text-sm font-semibold text-[#007aa0]">{topic.label[en?'en':'es']}</button>)}</div>
  <div role="group" aria-label={t('Explorar por función','Browse by feature')} className="flex max-w-full gap-1 overflow-x-auto rounded-xl bg-[#e9eff5] p-1 sm:flex-wrap">{(['all',...Object.keys(helpAreas)] as (keyof typeof helpAreas|'all')[]).map(key=><button key={key} type="button" data-help-area-chip={key} aria-pressed={area===key} onClick={()=>setArea(key)} className={`min-h-11 shrink-0 whitespace-nowrap rounded-lg px-3 text-sm font-semibold ${area===key?'bg-white text-[#008bb5] shadow-sm':'text-[#52627a]'}`}>{key==='all'?t('Todas','All'):helpAreas[key][en?'en':'es']}</button>)}</div>
  <p role="status" data-help-count className="text-sm text-[#52627a]">{t(`${shown.length} guías`,`${shown.length} guides`)}</p>
  {!shown.length&&<p data-help-empty className="text-sm text-[#52627a]">{t('No encontramos una guía con esas palabras. Escriba a Soporte Pro y le ayudamos.','We did not find a guide with those words. Write to Pro support and we will help.')} <button type="button" className="font-semibold text-[#007aa0] underline" onClick={()=>navigatePro('pro_company',{empresa:'soporte'})}>{t('Abrir Soporte Pro','Open Pro support')}</button></p>}
  {areas.map(area=><section key={area} data-help-area={area} aria-label={helpAreas[area][en?'en':'es']} className="min-w-0 space-y-2 rounded-2xl border border-[#d7e1ea] bg-white p-4"><h3 className="font-bold">{helpAreas[area][en?'en':'es']} <span className="text-sm font-normal text-[#52627a]">({shown.filter(a=>a.area===area).length})</span></h3>
   <ul className="divide-y divide-[#e6edf3]">{shown.filter(a=>a.area===area).map(a=>{const expanded=open===a.key;return <li key={a.key} data-help-article={a.key} className="py-1">
    <button type="button" aria-expanded={expanded} onClick={()=>setOpen(expanded?null:a.key)} className="min-h-11 w-full text-left text-sm font-semibold text-[#162543]">{a.title[en?'en':'es']}</button>
    {expanded&&<div className="space-y-2 pb-2"><p className="break-words text-sm text-[#52627a]">{a.body[en?'en':'es']}</p><Button type="button" variant="secondary" onClick={()=>navigatePro(a.go.tab,a.go.params)}>{t('Abrir esta herramienta','Open this tool')}</Button></div>}</li>;})}</ul></section>)}
 <section data-help-resources className="grid min-w-0 gap-3 sm:grid-cols-2" aria-label={t('Más recursos','More resources')}>{([['formacion',t('Formación de Pro','Pro training'),t('Lecciones cortas paso a paso para aprender cada herramienta.','Short step-by-step lessons to learn each tool.')],['soporte',t('Soporte Pro','Pro support'),t('¿No encuentra su respuesta? Escríbanos y le ayudamos.','Cannot find your answer? Write to us and we will help.')]] as const).map(([view,title,text])=><button key={view} type="button" data-help-resource={view} onClick={()=>navigatePro('pro_company',{empresa:view})} className="min-h-11 rounded-2xl border border-[#d7e1ea] bg-white p-4 text-left"><span className="block font-bold text-[#162543]">{title}</span><span className="block text-sm text-[#52627a]">{text}</span></button>)}</section>
 </div>;
}
