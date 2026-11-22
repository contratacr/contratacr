'use client';
import {useCallback,useEffect,useRef,useState,type ReactNode} from 'react';

/**
 * Tab bar and panels of a place page. Same look as the tab bar of the professional profile (profile-client.tsx): a
 * bordered card, tabs in a horizontal scroller, the active one in brand cyan with a 2 px underline. Every panel is
 * rendered by the server (crawlers and no-JS readers see all content); only the active one is shown. Anchors that live
 * inside a panel (`anchors`: «#resenas», «#horario»...) open their tab on arrival and on later hash changes, and
 * `data-place-tab-open="<id>"` links open a tab by id.
 */
export type PlaceTab={id:string;label:string;anchors?:string[];content:ReactNode};

export function PlaceTabs({tabs,label,defaultTab}:{tabs:PlaceTab[];label:string;defaultTab?:string}){
 const first=defaultTab&&tabs.some(t=>t.id===defaultTab)?defaultTab:tabs[0]?.id??'';
 const [active,setActive]=useState(first);
 const rail=useRef<HTMLDivElement>(null);
 // The tab list is recreated on every render of the page; the listeners read it through a ref and are bound once.
 const tabsRef=useRef(tabs);
 useEffect(()=>{tabsRef.current=tabs;});
 const fromHash=useCallback((scroll:boolean)=>{
  const tabs=tabsRef.current;
  const hash=decodeURIComponent(window.location.hash.replace(/^#/,''));if(!hash)return;
  const tab=tabs.find(t=>t.id===hash||t.anchors?.includes(hash));if(!tab)return;
  setActive(tab.id);
  if(scroll)requestAnimationFrame(()=>requestAnimationFrame(()=>document.getElementById(hash)?.scrollIntoView({block:'start'})));
 },[]);
 useEffect(()=>{
  fromHash(true);
  const onHash=()=>fromHash(true);
  const onClick=(e:MouseEvent)=>{
   const tabs=tabsRef.current;
   const el=(e.target as HTMLElement|null)?.closest?.('[data-place-tab-open]') as HTMLElement|null;
   if(el){const id=el.getAttribute('data-place-tab-open');if(id&&tabs.some(t=>t.id===id)){setActive(id);}}
   // A link to an anchor that lives in another tab opens that tab first (also when the hash is already the same).
   const a=(e.target as HTMLElement|null)?.closest?.('a[href^="#"]') as HTMLAnchorElement|null;
   if(a){const id=decodeURIComponent((a.getAttribute('href')??'').slice(1));const tab=tabs.find(t=>t.id===id||t.anchors?.includes(id));
    if(tab){setActive(tab.id);requestAnimationFrame(()=>requestAnimationFrame(()=>document.getElementById(id)?.scrollIntoView({block:'start'})));}}
  };
  window.addEventListener('hashchange',onHash);document.addEventListener('click',onClick);
  return()=>{window.removeEventListener('hashchange',onHash);document.removeEventListener('click',onClick);};
 },[fromHash]);
 const onKey=(e:React.KeyboardEvent,i:number)=>{
  if(e.key!=='ArrowRight'&&e.key!=='ArrowLeft')return;
  const next=tabs[(i+(e.key==='ArrowRight'?1:tabs.length-1))%tabs.length]!;setActive(next.id);
  requestAnimationFrame(()=>document.getElementById(`place-tab-${next.id}`)?.focus());
 };
 if(!tabs.length)return null;
 return <div className="rounded-2xl border border-[#e5e7eb] bg-white shadow-sm" data-place-tabs>
  <div data-profile-tabs="" className="sticky top-16 z-20 rounded-t-2xl border-b border-[#e5e7eb] bg-white lg:static [.ccr-native-app_&]:top-0">
   <div role="tablist" aria-label={label} ref={rail} className="scrollbar-none flex overflow-x-auto scroll-smooth">
    {tabs.map((tab,i)=><button key={tab.id} id={`place-tab-${tab.id}`} type="button" role="tab" data-place-tab={tab.id} aria-selected={active===tab.id}
     aria-controls={`place-panel-${tab.id}`} tabIndex={active===tab.id?0:-1} onClick={()=>setActive(tab.id)} onKeyDown={e=>onKey(e,i)}
     className="relative shrink-0 px-4 py-4 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#009FD9]"
     style={{color:active===tab.id?'#009FD9':'#6b7280'}}>
     {tab.label}{active===tab.id&&<span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-[#009FD9]"/>}
    </button>)}
   </div>
  </div>
  {tabs.map(tab=><div key={tab.id} id={`place-panel-${tab.id}`} role="tabpanel" aria-labelledby={`place-tab-${tab.id}`} hidden={active!==tab.id}
   data-place-panel={tab.id} className="space-y-8 p-4 sm:p-6">{tab.content}</div>)}
 </div>;
}
