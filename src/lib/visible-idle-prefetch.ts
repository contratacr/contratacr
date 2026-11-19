type LifecycleTarget=Pick<EventTarget,'addEventListener'|'removeEventListener'>;
type IdleHost=LifecycleTarget&{
 setTimeout:(callback:()=>void,delay:number)=>number;
 clearTimeout:(id:number)=>void;
 requestIdleCallback?:(callback:()=>void,options:{timeout:number})=>number;
 cancelIdleCallback?:(id:number)=>void;
};
type VisibilityPage=LifecycleTarget&{readonly visibilityState:DocumentVisibilityState};

/** Prefetch only while this document is active. A hidden/unloaded document
 * must not start queued fetches, and cancelled work must not publish results. */
export function scheduleVisibleIdlePrefetch(work:(isActive:()=>boolean)=>void,host:IdleHost=window,page:VisibilityPage=document){
 let disposed=false,active=page.visibilityState!=='hidden',started=false,generation=0;
 let idle:number|undefined,timer:number|undefined;
 function cancel(){
  generation++;
  if(idle!==undefined)host.cancelIdleCallback?.(idle);
  if(timer!==undefined)host.clearTimeout(timer);
  idle=undefined;timer=undefined;
 }
 function schedule(){
  if(disposed||!active||page.visibilityState==='hidden'||started||idle!==undefined||timer!==undefined)return;
  const current=++generation;
  const isActive=()=>!disposed&&active&&page.visibilityState!=='hidden'&&current===generation;
  const run=()=>{if(current!==generation)return;idle=undefined;timer=undefined;if(!isActive()||started)return;started=true;work(isActive);};
  if(typeof host.requestIdleCallback==='function')idle=host.requestIdleCallback(run,{timeout:4000});
  else timer=host.setTimeout(run,1500);
 }
 const hide=()=>{active=false;cancel();};
 const show=()=>{if(disposed)return;active=page.visibilityState!=='hidden';schedule();};
 const visible=()=>page.visibilityState==='hidden'?hide():show();
 // beforeunload precedes pagehide: WebKit can stop accepting fetches in the
 // intervening navigation gap. If navigation is cancelled, optional prefetch
 // waits for a later visibility/pageshow transition rather than racing again.
 host.addEventListener('beforeunload',hide);host.addEventListener('pagehide',hide);host.addEventListener('pageshow',show);page.addEventListener('visibilitychange',visible);
 schedule();
 return()=>{disposed=true;cancel();host.removeEventListener('beforeunload',hide);host.removeEventListener('pagehide',hide);host.removeEventListener('pageshow',show);page.removeEventListener('visibilitychange',visible);};
}
