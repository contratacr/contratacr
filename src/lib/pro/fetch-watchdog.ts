// Round 7B (bug 5): Pro screens read through many parallel GET /api/pro/* calls
// and each shows «Cargando…» until its fetch settles. A request that never
// settles (a dev compile that stalls, a dropped keep-alive socket, a browser
// connection slot held by a stuck response) left that text on screen until a
// full reload, and the held slots made later reads queue behind it as well.
// Every same-origin Pro read now has a deadline: one silent retry, then the
// screen's own error + «Reintentar» path. Writes (any non-GET) are never
// touched or retried: they keep their idempotent actionId/CAS handling.
const installed=Symbol.for('ccr.pro.fetchWatchdog');
export const PRO_READ_DEADLINE_MS=25000;

function proRead(input:RequestInfo|URL,init?:RequestInit){
 const method=(init?.method??(input instanceof Request?input.method:'GET')).toUpperCase();
 if(method!=='GET')return false;
 let url:URL;
 try{url=new URL(input instanceof Request?input.url:String(input),window.location.href);}catch{return false;}
 return url.origin===window.location.origin&&url.pathname.startsWith('/api/pro/');
}

function withDeadline(signal:AbortSignal|null|undefined,ms:number){
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(new DOMException('Pro read deadline exceeded','TimeoutError')),ms);
 const forward=()=>controller.abort(signal?.reason);
 if(signal){if(signal.aborted)forward();else signal.addEventListener('abort',forward,{once:true});}
 return {signal:controller.signal,done:()=>{clearTimeout(timer);signal?.removeEventListener('abort',forward);},timedOut:()=>controller.signal.aborted&&!signal?.aborted};
}

export function installProFetchWatchdog(deadline=PRO_READ_DEADLINE_MS){
 if(typeof window==='undefined')return;
 const scope=window as unknown as Record<symbol,boolean>;
 if(scope[installed])return;scope[installed]=true;
 const original=window.fetch.bind(window);
 window.fetch=async function watchedFetch(input:RequestInfo|URL,init?:RequestInit){
  if(!proRead(input,init))return original(input,init);
  const callerSignal=init?.signal??(input instanceof Request?input.signal:undefined);
  for(let attempt=0;;attempt++){
   const guard=withDeadline(callerSignal,deadline);
   try{return await original(input instanceof Request?input.clone():input,{...init,signal:guard.signal});}
   catch(error){if(guard.timedOut()&&attempt===0)continue;throw error;}
   finally{guard.done();}
  }
 };
}
