'use client';
import {useEffect,useId,useRef,useState} from 'react';
import {useLocale} from 'next-intl';
import {HelpCircle,Search,Settings} from 'lucide-react';
import {navigatePro} from '@/lib/pro/navigation';
import {proQuickGroups,proHelpGroups,proSettingsGroups,type QuickEntry,type QuickGroup} from '@/lib/pro/quick-menus';

/** Global chrome: Search, Help and Settings menus of the Pro header. Entries only navigate inside Pro. */
type MenuKind='search'|'help'|'settings';
function go(entry:QuickEntry){navigatePro(entry.tab,entry.extra);}
export function ProQuickMenus(){
 const en=useLocale()==='en',[open,setOpen]=useState<MenuKind|null>(null),[query,setQuery]=useState(''),root=useRef<HTMLDivElement>(null),id=useId();
 useEffect(()=>{
  if(!open)return;
  const key=(event:KeyboardEvent)=>{if(event.key==='Escape')setOpen(null);};
  const outside=(event:MouseEvent)=>{if(root.current&&!root.current.contains(event.target as Node))setOpen(null);};
  document.addEventListener('keydown',key);document.addEventListener('mousedown',outside);
  return()=>{document.removeEventListener('keydown',key);document.removeEventListener('mousedown',outside);};
 },[open]);
 const buttons:[MenuKind,string,typeof Search][]=[['search',en?'Search':'Buscar',Search],['help',en?'Help':'Ayuda',HelpCircle],['settings',en?'Settings':'Ajustes',Settings]];
 const groups:QuickGroup[]=open==='search'?proQuickGroups(en):open==='help'?proHelpGroups(en):open==='settings'?proSettingsGroups(en):[];
 const needle=query.trim().toLocaleLowerCase(en?'en':'es-CR');
 const shown=groups.map(group=>({...group,items:needle?group.items.filter(item=>item.label.toLocaleLowerCase(en?'en':'es-CR').includes(needle)):group.items})).filter(group=>group.items.length);
 return <div ref={root} data-pro-quick-menus className="relative flex items-center gap-1">
  {buttons.map(([kind,label,Icon])=><button key={kind} type="button" data-pro-quick={kind} aria-expanded={open===kind} aria-controls={id} onClick={()=>{setQuery('');setOpen(open===kind?null:kind);}} className={`flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold ${open===kind?'bg-[#eaf7fb] text-[#008bb5]':'text-[#52627a] hover:bg-[#f3f8fb]'}`}><Icon aria-hidden className="h-5 w-5"/><span className="sr-only sm:not-sr-only">{label}</span></button>)}
  {open&&<div id={id} role="dialog" aria-label={buttons.find(([kind])=>kind===open)![1]} data-pro-quick-panel={open} className="absolute right-0 top-full z-[100] mt-2 max-h-[70vh] w-[min(22rem,calc(100vw-2rem))] overflow-y-auto rounded-2xl border border-[#d7e1ea] bg-white p-3 shadow-lg">
   {open==='search'&&<label className="block text-sm font-semibold">{en?'Search Pro':'Buscar en Pro'}<input type="search" autoFocus value={query} onChange={event=>setQuery(event.target.value)} placeholder={en?'Quotes, hours, expenses…':'Cotizaciones, horas, gastos…'} className="mt-1 block min-h-11 w-full rounded-xl border border-[#d7e1ea] px-3 py-2 text-base font-normal"/></label>}
   {shown.length===0&&<p className="p-2 text-sm text-[#52627a]">{en?'No results.':'Sin resultados.'}</p>}
   {shown.map(group=><section key={group.key} aria-label={group.label} className="mt-3"><h2 className="px-2 text-xs font-bold uppercase tracking-wide text-[#68778d]">{group.label}</h2>
    <ul className="mt-1">{group.items.map(item=><li key={item.key}><button type="button" data-pro-quick-entry={item.key} onClick={()=>{setOpen(null);go(item);}} className="min-h-11 w-full rounded-xl px-2 py-2 text-left text-sm font-semibold text-[#162543] hover:bg-[#f3f8fb]">{item.label}{item.hint&&<span className="block text-xs font-normal text-[#68778d]">{item.hint}</span>}</button></li>)}</ul></section>)}
  </div>}
 </div>;
}
