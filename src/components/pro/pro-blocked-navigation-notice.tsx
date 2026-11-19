'use client';
import {useEffect,useState} from 'react';
import {useLocale} from 'next-intl';
import {PRO_NAVIGATION_BLOCKED} from './use-pro-child-guard';

/**
 * Fix 14: when the bell (or any Pro link) is blocked by an editor with unsaved changes, say so right
 * under the header, next to what was clicked. The editor keeps its own detailed message; this one points to it.
 */
export function ProBlockedNavigationNotice(){
 const en=useLocale()==='en',[shown,setShown]=useState(0);
 useEffect(()=>{const on=()=>setShown(Date.now());window.addEventListener(PRO_NAVIGATION_BLOCKED,on);return()=>window.removeEventListener(PRO_NAVIGATION_BLOCKED,on);},[]);
 useEffect(()=>{if(!shown)return;const timer=setTimeout(()=>setShown(0),7000);return()=>clearTimeout(timer);},[shown]);
 if(!shown)return null;
 const goToEditor=()=>{const target=document.querySelector<HTMLElement>('[role="alert"]:not([data-pro-blocked-navigation]), form[data-work-plan-form]');target?.scrollIntoView({behavior:'smooth',block:'center'});setShown(0);};
 return <div data-pro-blocked-navigation role="alert" className="fixed right-4 top-[4.5rem] z-[80] flex max-w-[min(24rem,calc(100vw-2rem))] flex-wrap items-center gap-2 rounded-2xl border pr-12 border-[#f3c98b] bg-[#fff8eb] p-3 text-sm text-[#5c3b00] shadow-lg">
  <p className="min-w-0 flex-1 basis-48 font-semibold">{en?'You have unsaved changes. Save or cancel them before leaving this screen.':'Tiene cambios sin guardar. Guárdelos o cancélelos antes de salir de esta pantalla.'}</p>
  <button type="button" onClick={goToEditor} className="min-h-11 rounded-xl border border-[#e7b35f] bg-white px-3 font-semibold">{en?'Show changes':'Ver cambios'}</button>
  <button type="button" onClick={()=>setShown(0)} aria-label={en?'Close notice':'Cerrar aviso'} className="absolute right-1 top-1 min-h-11 min-w-11 rounded-xl px-2 font-semibold">×</button>
 </div>;
}
