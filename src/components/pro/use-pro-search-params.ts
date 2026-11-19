'use client';
import {useMemo,useSyncExternalStore} from 'react';
import {usePathname,useSearchParams} from 'next/navigation';
import {PRO_PATH_CHANGED,proCanonicalPath} from '@/lib/pro/navigation';
let traversalGuard:((event:PopStateEvent)=>boolean)|null=null;
// External-store updates can synchronously replace the active modal guard. A
// single browser traversal must keep the decision made before those updates.
const traversalDecisions=new WeakMap<PopStateEvent,boolean>();
function blocksTraversal(event:PopStateEvent){
 if(traversalDecisions.has(event))return traversalDecisions.get(event)!;
 const blocked=traversalGuard?.(event)??false;traversalDecisions.set(event,blocked);return blocked;
}
// N1: Next's own popstate listener commits the popped URL synchronously (React
// renders transitions started in popstate immediately), which unmounted a dirty
// editor and its guard before the bubbling store listener could ask it. A
// capture listener decides first; a blocking guard stops Next's traversal.
if(typeof window!=='undefined')window.addEventListener('popstate',event=>{blocksTraversal(event);},true);
export function registerProTraversalGuard(guard:(event:PopStateEvent)=>boolean){traversalGuard=guard;return()=>{if(traversalGuard===guard)traversalGuard=null;};}
function subscribe(update:()=>void){const notify=(event:Event)=>{if(event.type==='popstate'&&blocksTraversal(event as PopStateEvent))return;update();};window.addEventListener('popstate',notify);window.addEventListener(PRO_PATH_CHANGED,notify);return()=>{window.removeEventListener('popstate',notify);window.removeEventListener(PRO_PATH_CHANGED,notify);};}
// Round 9: a job route (/dashboard/pro/trabajo/<id>/<section>) reads as its query form
// (tab=pro_agenda&cita=<id>&vistaTrabajo=<section>), so every Pro screen keeps one address model.
const canonicalSearch=(path:string)=>{const canonical=proCanonicalPath(path),index=canonical.indexOf('?');return index<0?'':canonical.slice(index);};
const snapshot=()=>canonicalSearch(window.location.pathname+window.location.search);
// Pro uses query-only screens. After a history traversal Next can retain the
// rendered search of its cached tree; the browser URL remains authoritative.
export function useProSearchParams(enabled=true,additionalTabs:readonly string[]=[]){
 const next=useSearchParams(),pathname=usePathname()??'';
 const search=useSyncExternalStore(subscribe,snapshot,()=>canonicalSearch(pathname+'?'+next.toString()));
 const params=useMemo(()=>new URLSearchParams(search),[search]);
 const localScreen=additionalTabs.includes(params.get('tab')||'')||additionalTabs.includes(next.get('tab')||'');
 return enabled||localScreen?params:next;
}
