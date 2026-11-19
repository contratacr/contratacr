'use client';
import {useEffect} from 'react';
import {currentProPath,currentCanonicalProPath,PRO_PATH_CHANGED,PRO_BEFORE_PATH_CHANGE} from '@/lib/pro/navigation';
import {registerProTraversalGuard} from './use-pro-search-params';
/** Parent detail cannot discard a dirty/uncertain embedded editor. The editor offers save/cancel. */
/** Fix 14: every blocked move also raises one notice next to the header (bell), not only the editor's own message far below. */
export const PRO_NAVIGATION_BLOCKED='ccr:pro-navigation-blocked';
function announceBlocked(){window.dispatchEvent(new Event(PRO_NAVIGATION_BLOCKED));}
export function useProChildGuard(blocked:boolean,onBlocked:()=>void){
 useProChildNavigationGuard(blocked,onBlocked);
 useEffect(()=>{if(!blocked)return;const path=currentProPath(),state={...window.history.state};const unload=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue='';};const back=(event:PopStateEvent)=>{event.stopImmediatePropagation();window.history.pushState(state,'',path);window.dispatchEvent(new Event(PRO_PATH_CHANGED));onBlocked();announceBlocked();return true;};const remove=registerProTraversalGuard(back);window.addEventListener('beforeunload',unload);return()=>{remove();window.removeEventListener('beforeunload',unload);};},[blocked,onBlocked]);
}

/** Prevent in-app sidebar navigation from unmounting a dirty or uncertain editor. */
export function useProChildNavigationGuard(blocked:boolean,onBlocked:()=>void){
 useEffect(()=>{if(!blocked)return;const before=(event:Event)=>{const path=(event as CustomEvent<{path:string}>).detail?.path;if(!path)return;const current=new URL(currentCanonicalProPath(),window.location.origin),target=new URL(path,window.location.origin);const keys=['tab','cita','citaSolicitud','solicitudManual','nuevaSolicitud','cotizacion','cliente','producto','nueva','editar','prepararVisita','vistaTrabajo','nuevaEstimacion','estimacionPrivada','cotizacionCliente','origenEstimacion','idOrigenEstimacion','revisionOrigenEstimacion','huellaOrigenEstimacion','volverEstimacion'];if(current.pathname!==target.pathname||keys.some(key=>current.searchParams.get(key)!==target.searchParams.get(key))){event.preventDefault();onBlocked();announceBlocked();}};window.addEventListener(PRO_BEFORE_PATH_CHANGE,before);return()=>window.removeEventListener(PRO_BEFORE_PATH_CHANGE,before);},[blocked,onBlocked]);
}

export const PRO_SERVICE_REFRESH='contratacr:service-refresh';
export function useProServiceRefresh(load:()=>unknown,blocked=false){
 useEffect(()=>{const refresh=()=>{if(!blocked)void load();};window.addEventListener(PRO_SERVICE_REFRESH,refresh);return()=>window.removeEventListener(PRO_SERVICE_REFRESH,refresh);},[load,blocked]);
}
