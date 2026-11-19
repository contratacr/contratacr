type Host=Pick<Window,'addEventListener'|'removeEventListener'|'setTimeout'|'clearTimeout'>;
type Page=Pick<Document,'addEventListener'|'removeEventListener'|'visibilityState'>;
/** Optional background work pauses during navigation. A cancelled unload waits
 * for focus, visibility or pageshow rather than racing a slow navigation. */
export function followUpLifecycle(work:(isActive:()=>boolean,signal:AbortSignal)=>Promise<void>,host:Host=window,page:Page=document,shouldReactivate:()=>boolean=()=>true){
 let disposed=false,active=page.visibilityState!=='hidden',generation=0,running=false;
 let controller:AbortController|null=null;
 const timers=new Set<number>();
 const schedule=(delay:number)=>{if(disposed||!active)return;const timer=host.setTimeout(()=>{timers.delete(timer);void run();},delay);timers.add(timer);};
 async function run(){
  if(disposed||!active||running||page.visibilityState==='hidden')return;
  const epoch=generation,request=new AbortController();controller=request;running=true;
  const isActive=()=>!disposed&&active&&epoch===generation&&!request.signal.aborted&&page.visibilityState!=='hidden';
  try{await work(isActive,request.signal);}finally{if(controller===request){controller=null;running=false;}}
 }
 const pause=()=>{active=false;generation++;for(const timer of timers)host.clearTimeout(timer);timers.clear();controller?.abort();controller=null;running=false;};
 const activate=()=>{if(disposed||page.visibilityState==='hidden')return;if(!active){active=true;if(shouldReactivate())schedule(4000);}};
 const visibility=()=>page.visibilityState==='hidden'?pause():activate();
 host.addEventListener('beforeunload',pause);host.addEventListener('pagehide',pause);host.addEventListener('pageshow',activate);host.addEventListener('focus',activate);page.addEventListener('visibilitychange',visibility);
 schedule(4000);
 return {schedule,check:()=>void run(),dispose(){disposed=true;pause();host.removeEventListener('beforeunload',pause);host.removeEventListener('pagehide',pause);host.removeEventListener('pageshow',activate);host.removeEventListener('focus',activate);page.removeEventListener('visibilitychange',visibility);}};
}
