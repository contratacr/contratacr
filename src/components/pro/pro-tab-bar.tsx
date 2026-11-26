'use client';

import {useState} from 'react';
import {useLocale} from 'next-intl';
import {CalendarDays,FileText,House,Menu,UsersRound,type LucideIcon} from 'lucide-react';
import {Modal} from '@/components/ui/modal';
import {CAPA_BARRA_ABAJO} from '@/lib/capas';
import {navigatePro} from '@/lib/pro/navigation';
import {useProPlaceHub} from '@/lib/pro/place-hub-client';
import {cn} from '@/lib/utils';
import {ProHubNav} from './management-shell';

/** The Pro work app's own bottom tab bar on phones and tablets (< lg), like Houzz Pro's mobile app:
 * four daily sections and «Más», which opens the full section list (the desktop side menu). The
 * directory's 5-tab bar is not shown inside Pro (see native-bottom-nav.tsx). */
const TABS:[string,LucideIcon][]=[['pro_tools',House],['pro_agenda',CalendarDays],['pro_clients',UsersRound],['quotes',FileText]];
export const PRO_TAB_BAR_TABS=TABS.map(([key])=>key);

function tabLabels(en:boolean):Record<string,string>{
 return en?{pro_tools:'Home',pro_agenda:'Schedule',pro_clients:'Customers',quotes:'Quotes',more:'More'}:{pro_tools:'Inicio',pro_agenda:'Citas',pro_clients:'Clientes',quotes:'Cotizaciones',more:'Más'};
}

export function ProTabBar({tab,navigating}:{tab:string;navigating:boolean}){
 const en=useLocale()==='en',labels=tabLabels(en),[more,setMore]=useState(false);
 const inBar=PRO_TAB_BAR_TABS.includes(tab);
 const cell=(active:boolean)=>cn('flex min-h-11 min-w-0 flex-1 basis-0 flex-col items-center justify-center gap-1 rounded-xl px-0 text-[11px] leading-none tracking-tight disabled:opacity-60',active?'font-extrabold text-[#008bb5]':'font-semibold text-[#52627a]');
 return <>
  <nav data-pro-tab-bar aria-label={en?'Pro sections':'Secciones de Pro'} style={{paddingBottom:'env(safe-area-inset-bottom, 0px)'}} className={cn('fixed inset-x-0 bottom-0 border-t border-[#e5e7eb] bg-white shadow-[0_-6px_20px_-16px_rgba(22,37,67,0.45)] lg:hidden',CAPA_BARRA_ABAJO)}>
   <div className="mx-auto flex h-16 max-w-xl items-stretch gap-0.5 px-1 py-1">
    {TABS.map(([key,Icon])=>{const active=tab===key;return <button key={key} type="button" data-pro-tab={key} aria-current={active?'page':undefined} disabled={navigating} onClick={()=>navigatePro(key)} className={cell(active)}><Icon aria-hidden className="h-[22px] w-[22px]" strokeWidth={active?2.4:1.9}/><span className="max-w-full truncate">{labels[key]}</span></button>;})}
    <button type="button" data-pro-tab="more" aria-haspopup="dialog" aria-expanded={more} aria-current={!inBar?'page':undefined} disabled={navigating} onClick={()=>setMore(true)} className={cell(!inBar)}><Menu aria-hidden className="h-[22px] w-[22px]" strokeWidth={!inBar?2.4:1.9}/><span className="max-w-full truncate">{labels.more}</span></button>
   </div>
  </nav>
  {more&&<Modal manageFocus open title={en?'All sections':'Todas las secciones'} closeLabel={en?'Close':'Cerrar'} onClose={()=>setMore(false)}><ProMoreSections tab={tab} close={()=>setMore(false)}/></Modal>}
 </>;
}

function ProMoreSections({tab,close}:{tab:string;close:()=>void}){
 const en=useLocale()==='en',placeHub=useProPlaceHub(true);
 return <div data-pro-more-sections><ProHubNav label={en?'All Pro sections':'Todas las secciones de Pro'} activeTab={tab} taskCenter placeHub={placeHub} onPick={close}/></div>;
}
