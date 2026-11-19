'use client';

import {useEffect,useLayoutEffect,useRef,useTransition} from 'react';
import {useRouter,useSearchParams} from 'next/navigation';
import {cancelPendingProSectionNavigation,completePendingProSectionNavigation,registerProSectionNavigator} from '@/lib/pro/navigation';

/** Let Next coordinate a new section with any in-flight history restoration.
 * History metadata is attached after commit, never to the outgoing entry. */
export const SECTION_DEADLINE_MS=30000;
export function useProSectionNavigation(actorId:string|undefined){
 const router=useRouter(),params=useSearchParams();
 const [pending,startTransition]=useTransition(),target=useRef<string|null>(null);
 useEffect(()=>{
  if(!actorId){cancelPendingProSectionNavigation();return;}
  const remove=registerProSectionNavigator(path=>{target.current=path;startTransition(()=>router.push(path,{scroll:false}));});
  window.addEventListener('popstate',cancelPendingProSectionNavigation);
  return()=>{remove();window.removeEventListener('popstate',cancelPendingProSectionNavigation);};
 },[actorId,router,startTransition]);
 useEffect(()=>{
  if(actorId)completePendingProSectionNavigation(actorId);
 },[actorId,params]);
 // Round 7B (bug 5): a section transition whose RSC payload never arrives left
 // «Abriendo sección…» on screen until a reload. After a deadline the same
 // address is opened as a normal document load (the user's intent is kept).
 useEffect(()=>{
  if(!pending||!actorId)return;
  const timer=setTimeout(()=>{const path=target.current;if(path)window.location.assign(path);},SECTION_DEADLINE_MS);
  return()=>clearTimeout(timer);
 },[pending,actorId]);
 useLayoutEffect(()=>{
  if(!pending||!actorId)return;
  // Interactive portals live outside the section's inert subtree. Freeze them
  // too, including portals mounted during transition, and restore prior state.
  const portals=new Map<HTMLElement,boolean>();
  const freeze=()=>{for(const portal of document.body.querySelectorAll<HTMLElement>('[role="dialog"],[role="menu"],[role="listbox"]')){if(!portals.has(portal)){portals.set(portal,portal.inert);portal.inert=true;}}};
  freeze();const observer=new MutationObserver(freeze);observer.observe(document.body,{childList:true,subtree:true});
  return()=>{observer.disconnect();for(const [portal,inert] of portals)portal.inert=inert;};
 },[pending,actorId]);
 return !!actorId&&pending;
}
