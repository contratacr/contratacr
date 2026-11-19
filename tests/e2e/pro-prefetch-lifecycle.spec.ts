import {test,expect} from 'playwright/test';
import {scheduleVisibleIdlePrefetch} from '../../src/lib/visible-idle-prefetch';

function fixture(idleSupported=true){
 const lifecycle=new EventTarget(),visibility=new EventTarget();let state:DocumentVisibilityState='visible',next=0;
 const queued=new Map<number,()=>void>(),cancelled=new Set<number>();
 const add=(callback:()=>void)=>{const id=++next;queued.set(id,callback);return id;};
 const cancel=(id:number)=>{cancelled.add(id);};
 const host={addEventListener:lifecycle.addEventListener.bind(lifecycle),removeEventListener:lifecycle.removeEventListener.bind(lifecycle),setTimeout:add,clearTimeout:cancel,...idleSupported?{requestIdleCallback:add,cancelIdleCallback:cancel}:{}};
 const page={addEventListener:visibility.addEventListener.bind(visibility),removeEventListener:visibility.removeEventListener.bind(visibility),get visibilityState(){return state;}};
 return {host,page,queued,cancelled,unload:()=>lifecycle.dispatchEvent(new Event('beforeunload')),hide:()=>lifecycle.dispatchEvent(new Event('pagehide')),show:()=>lifecycle.dispatchEvent(new Event('pageshow')),visibility:(value:DocumentVisibilityState)=>{state=value;visibility.dispatchEvent(new Event('visibilitychange'));}};
}
for(const idleSupported of [true,false])test(`${idleSupported?'idle':'timeout'} prefetch cancels queued work on pagehide and restarts once visible`,()=>{
 const f=fixture(idleSupported);let fetches=0;
 const stop=scheduleVisibleIdlePrefetch(()=>{fetches++;},f.host,f.page);
 const first=[...f.queued.keys()][0];expect(first).toBeDefined();f.hide();expect(f.cancelled.has(first)).toBe(true);
 // A browser may already have dequeued a callback when cancellation happens.
 f.queued.get(first)!();expect(fetches).toBe(0);
 f.show();const resumed=[...f.queued.keys()].at(-1)!;expect(resumed).not.toBe(first);
 f.queued.get(first)!();expect(fetches).toBe(0);f.queued.get(resumed)!();expect(fetches).toBe(1);
 f.hide();f.show();expect(f.queued.size).toBe(2);stop();
});
test('hidden documents defer prefetch and cleanup prevents late callbacks or cache writes',()=>{
 const f=fixture();f.visibility('hidden');let fetches=0,isActive:()=>boolean=()=>false;
 const stop=scheduleVisibleIdlePrefetch(active=>{fetches++;isActive=active;},f.host,f.page);expect(f.queued.size).toBe(0);
 f.visibility('visible');const id=[...f.queued.keys()][0];f.queued.get(id)!();expect(fetches).toBe(1);expect(isActive()).toBe(true);
 f.hide();expect(isActive()).toBe(false);f.show();expect(isActive()).toBe(false);expect(fetches).toBe(1);stop();expect(isActive()).toBe(false);
});
test('cleanup cancels both scheduler variants before any fetch',()=>{
 for(const idleSupported of [true,false]){const f=fixture(idleSupported);let fetches=0;const stop=scheduleVisibleIdlePrefetch(()=>fetches++,f.host,f.page);const id=[...f.queued.keys()][0];stop();expect(f.cancelled.has(id)).toBe(true);f.queued.get(id)!();f.show();f.visibility('visible');expect(fetches).toBe(0);expect(f.queued.size).toBe(1);}
});
test('beforeunload cancels prefetch before pagehide even if navigation is cancelled',()=>{
 for(const idleSupported of [true,false]){
  const f=fixture(idleSupported);let fetches=0;const stop=scheduleVisibleIdlePrefetch(()=>fetches++,f.host,f.page);const original=[...f.queued.keys()][0];
  f.unload();expect(f.cancelled.has(original)).toBe(true);expect(f.page.visibilityState).toBe('visible');
  f.queued.get(original)!();expect(fetches).toBe(0);expect(f.queued.size).toBe(1);
  // A cancelled browser navigation does not immediately restart optional work.
  f.visibility('hidden');f.visibility('visible');const resumed=[...f.queued.keys()].at(-1)!;expect(resumed).not.toBe(original);f.queued.get(original)!();expect(fetches).toBe(0);f.queued.get(resumed)!();expect(fetches).toBe(1);stop();
 }
});
