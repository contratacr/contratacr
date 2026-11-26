'use client';

import type {ReactNode} from 'react';
import {useLocale} from 'next-intl';
import {navigatePro} from '@/lib/pro/navigation';
import {openTeamSpace} from '@/lib/pro/team-navigation';
import {useProSearchParams} from './use-pro-search-params';
import {proHubGroups,proHubItemActive,type ProPlaceHub} from '@/lib/pro/hub-sections';
import {openProModulePage,useProPlaceHub} from '@/lib/pro/place-hub-client';

const sections=new Set(['pro_tools','pro_company','pro_projects','pro_files','pro_tasks','pro_hours','pro_notifications','pro_leads','pro_agenda','pro_clients','pro_inventory','pro_expenses','quotes','statistics','pro_payments','pro_billing','team','pro_team','pro_editions']);

/** A second navigation level for business tools; public marketplace stays intact. */
export function ProManagementShell({enabled,activeTab,children,taskCenter=false}:{enabled:boolean;activeTab:string;children:ReactNode;taskCenter?:boolean}){
 const en=useLocale()==='en',placeHub=useProPlaceHub(taskCenter);
 if(!enabled||!sections.has(activeTab)||['pro_tasks','pro_hours','pro_notifications','pro_files','pro_leads','pro_projects','pro_company'].includes(activeTab)&&!taskCenter)return children;
 return <div data-pro-management-shell className="min-w-0 lg:grid lg:grid-cols-[190px_minmax(0,1fr)] lg:items-start lg:gap-6">
  <aside className="hidden min-w-0 rounded-2xl border border-[#e5e7eb] bg-white p-3 lg:block">
   <ProHubNav label={en?'Business navigation':'Navegación del negocio'} activeTab={activeTab} taskCenter={taskCenter} placeHub={placeHub}/>
  </aside>
  <div className="min-w-0">{children}</div>
 </div>;
}

/** The full list of Pro sections: the desktop side menu and the mobile «Más» sheet of the Pro tab bar. */
export function ProHubNav({label,activeTab,taskCenter,placeHub,onPick}:{label:string;activeTab:string;taskCenter:boolean;placeHub:ProPlaceHub|null|undefined;onPick?:()=>void}){
 const en=useLocale()==='en',params=useProSearchParams();
 const groups=proHubGroups(en,taskCenter,placeHub),all=groups.flatMap(group=>group.items);
 return <nav aria-label={label} className="space-y-5">
  <button type="button" onClick={()=>{onPick?.();navigatePro('pro_tools');}} aria-current={activeTab==='pro_tools'?'page':undefined} className="min-h-11 w-full rounded-xl px-3 text-left text-sm font-bold text-[#008bb5] hover:bg-[#f3f8fb]">{en?'Tools overview':'Herramientas'}</button>
  {groups.map(group=><section key={group.key} aria-label={group.label}><h2 className="px-3 text-xs font-bold uppercase tracking-wide text-[#68778d]">{group.label}</h2><div className="mt-1 space-y-1">{group.items.map(item=>{
   const extra=item.extra;
   const active=proHubItemActive(item,all,activeTab,params);
   return <button key={item.key} type="button" data-pro-hub-entry={item.key} aria-current={active?'page':undefined} onClick={()=>{onPick?.();if(item.href)openProModulePage(item.href);else if(item.team)openTeamSpace(en);else navigatePro(item.tab,extra);}} className={`min-h-11 w-full break-words rounded-xl px-3 py-2 text-left text-sm ${active?'bg-[#eaf7fb] font-bold text-[#008bb5]':'font-semibold text-[#52627a] hover:bg-[#f3f8fb]'}`}>{item.label}</button>;
  })}</div></section>)}
 </nav>;
}
