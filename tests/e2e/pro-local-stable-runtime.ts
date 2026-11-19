import {expect,type BrowserContext} from 'playwright/test';
const installed=new WeakSet<BrowserContext>();
const rebuildNotifications=new Set(['building','reloadPage','serverComponentChanges','serverOnlyChanges','clientChanges','addedPage','removedPage','middlewareChanges','staticParamsChanged']);
/** Opt-in for frozen-source local Pro UI tests. Next 16 multiplexes essential
 * React debug/hydration bytes on /_next/hmr: keep the real connection and forward
 * all binary, errors, runtime diagnostics and unknown messages. Sync metadata is
 * retained, but clean compilation hashes are pinned per HTML request ID. Only clean
 * dev rebuild/reload notifications are suppressed while sibling routes compile.
 * Never intercept app HTTP, authentication or Supabase's separate realtime WS.
 * Protocol: next/dist/server/dev/hot-reloader-types.js and hot-middleware.js.
 * Evidence: pro-task-mentions-regression trace owner5 received a clean changed
 * sync hash at 102586ms and reloaded at 102601ms, losing its open access editor.
 * hot-middleware.js publishes sync to all clients when another page connects;
 * client/dev/hot-reloader/app/web-socket.js reloads on any changed sync hash.
 * Frozen source hashes are verified by the runner; this is dev-only isolation,
 * not permission to hide errors or suppress production behavior. */
export async function stabilizeLocalProRuntime(context:BrowserContext,baseURL:string){
 expect(baseURL).toBe(process.env.PRO_LOCAL_ORIGIN??'http://127.0.0.1:3185');
 expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe('http://127.0.0.1:54321');
 if(installed.has(context))return;
 const compilationHashes=new Map<string,string>(); // Same HTML ID survives WS reconnects.
 await context.routeWebSocket(url=>url.hostname==='127.0.0.1'&&url.port==='3185'&&url.pathname==='/_next/hmr',socket=>{
  const htmlRequestId=new URL(socket.url()).searchParams.get('id');
  const server=socket.connectToServer(); // Outgoing messages retain default forwarding.
  server.onMessage(message=>{
   if(typeof message==='string'){
    try{
     const data:unknown=JSON.parse(message);
     if(data&&typeof data==='object'){
      const event=data as {type?:unknown;hash?:unknown;errors?:unknown;warnings?:unknown};
      if(event.type==='sync'&&htmlRequestId&&typeof event.hash==='string'&&Array.isArray(event.errors)&&event.errors.length===0){
       const first=compilationHashes.get(htmlRequestId);
       if(first===undefined)compilationHashes.set(htmlRequestId,event.hash);
       else if(first!==event.hash){socket.send(JSON.stringify({...data,hash:first}));return;}
      }
      // Never conceal a build error/warning, including unexpected future shapes.
      if(event.type==='built'&&Array.isArray(event.errors)&&event.errors.length===0&&Array.isArray(event.warnings)&&event.warnings.length===0)return;
      if(typeof event.type==='string'&&rebuildNotifications.has(event.type)&&event.errors===undefined)return;
     }
    }catch{/* Non-JSON protocol messages pass through unchanged. */}
   }
   socket.send(message);
  });
 });
 installed.add(context);
}
