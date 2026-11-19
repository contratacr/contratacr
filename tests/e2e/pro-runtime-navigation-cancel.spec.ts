import {test,expect} from 'playwright/test';
import {collectPageErrors,installRuntimeGuards,isNavigationCancellation,onAppPageError} from './helpers';

// Shared criterion for Pro specs: a same-origin fetch that the browser cancels
// because the document reloads is not a page error (WebKit reports it as
// «Fetch API cannot load … due to access control checks.»), while real page
// errors (uncaught exceptions, unhandled rejections) are still collected.
// Everything is served by page.route on the loopback origin: no app data.
test('navigation-cancelled fetches are not page errors; real errors still are',async({page,baseURL,browserName})=>{
 expect(baseURL).toMatch(/^http:\/\/(?:127\.0\.0\.1|localhost):3185\/?$/);
 const origin=new URL(baseURL!).origin,probe=origin+'/__runtime-probe';
 let releaseSlow:()=>void=()=>{};const slowStarted=new Promise<void>(resolve=>{releaseSlow=resolve;});
 await page.route(probe+'/slow**',async route=>{releaseSlow();await new Promise(resolve=>setTimeout(resolve,4000));await route.fulfill({status:200,contentType:'application/json',body:'{}'}).catch(()=>{});});
 await page.route(probe,route=>route.fulfill({status:200,contentType:'text/html',body:`<!doctype html><meta charset="utf-8"><title>probe</title><button id="slow" onclick="fetch('/__runtime-probe/slow?n='+Date.now()).then(r=>r.json()).catch(()=>{})">slow</button><button id="network" onclick="for(let i=0;i<6;i++)fetch('/en?runtimeProbe='+i+'-'+Date.now(),{cache:'no-store'}).then(r=>r.text()).catch(()=>{})">network</button><button id="cors" onclick="fetch(location.href.replace('127.0.0.1','localhost')+'?cors=1',{cache:'no-store'}).catch(()=>{})">cors</button><button id="same" onclick="setTimeout(()=>{throw new TypeError('Fetch API cannot load '+location.origin+'/__runtime-probe/never due to access control checks.')},0)">same</button><button id="split" onclick="setTimeout(()=>{throw new TypeError('/'+location.host+'/__runtime-probe/split due to access control checks.')},0)">split</button><button id="other" onclick="setTimeout(()=>{throw new TypeError('Fetch API cannot load http://example.invalid/x due to access control checks.')},0)">other</button><button id="boom" onclick="setTimeout(()=>{throw new Error('real probe failure')},0)">boom</button><button id="reject" onclick="Promise.reject(new Error('unhandled probe rejection'))">reject</button>`}));
 installRuntimeGuards(page);const pageErrors=collectPageErrors(page);const failed:string[]=[],raw:string[]=[];onAppPageError(page,message=>raw.push(message));page.on('requestfailed',request=>failed.push(request.failure()?.errorText??''));
 await page.goto(probe);
 // 1) A fetch in flight while the page reloads: browser cancellation only.
 await page.locator('#slow').click();await slowStarted;await page.reload();await expect(page.locator('#slow')).toBeVisible();
 // 1b) Real network fetches (not intercepted) cut by a reload, as in the app.
 const networkStarted=page.waitForRequest(request=>request.url().includes('runtimeProbe='));await page.locator('#network').click();await networkStarted;await page.reload();await expect(page.locator('#slow')).toBeVisible();
 await page.waitForTimeout(500);
 expect(pageErrors()).toEqual([]);
 expect(failed.every(isNavigationCancellation)).toBe(true);
 // 2) Real failures after that navigation are still reported, in every browser.
 await page.locator('#boom').click();await page.locator('#reject').click();
 await expect.poll(()=>pageErrors().join('\n')).toContain('real probe failure');
 await expect.poll(()=>pageErrors().join('\n')).toContain('unhandled probe rejection');
 expect(pageErrors()).toHaveLength(2);
 // 3) A real access-control failure (cross-origin) right after a reload is
 // never mistaken for a cancellation. Only WebKit reports it as a page error.
 await page.reload();await expect(page.locator('#cors')).toBeVisible();const corsFailed=page.waitForEvent('requestfailed',request=>request.url().includes('cors=1'));await page.locator('#cors').click();await corsFailed;
 if(browserName==='webkit')await expect.poll(()=>pageErrors().join('\n'),{timeout:20000}).toMatch(/localhost:3185\/__runtime-probe\?cors=1 due to access control checks/);
 else await page.waitForTimeout(500);
 expect(pageErrors().length).toBe(browserName==='webkit'?3:2);
 expect(raw.length).toBe(pageErrors().length);
 // 4) The exact WebKit wording, same-origin, right after a navigation is the
 // only case ignored; cross-origin, or long after any navigation, is kept.
 const before=pageErrors().length;await page.reload();await expect(page.locator('#same')).toBeVisible();
 // Same, in the split form Playwright gives WebKit console errors («/host:port/path due to …»).
 await page.locator('#same').click();await page.locator('#split').click();await page.locator('#other').click();
 await expect.poll(()=>pageErrors().length).toBe(before+1);expect(pageErrors().at(-1)).toContain('example.invalid');
 await page.waitForTimeout(5500);await page.locator('#same').click();
 await expect.poll(()=>pageErrors().length).toBe(before+2);expect(pageErrors().at(-1)).toContain('/__runtime-probe/never');
});
