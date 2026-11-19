/** Real React lifecycle regression, entirely in memory: no app server, DB or network.
 * Build-only by default. --run-local-browser opens one disposable Chromium context.
 * esbuild and Playwright must already be installed; this script installs nothing.
 */
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));
const bundle=await build({stdin:{contents:`
import React from 'react';
import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import {useLocalProAccess} from './src/components/pro/use-local-pro-access';
const requests=[],renders=[];
let latest;
window.fetch=(url,options)=>{
 if(url!=='/api/pro/access')throw Error('Unexpected network request');
 return new Promise((resolve,reject)=>requests.push({resolve,reject,signal:options.signal}));
};
function Probe({userId,tag}){
 latest=useLocalProAccess(userId);
 renders.push({tag,ready:!!latest.ready,enabled:!!latest.enabled,error:!!latest.error});
 return React.createElement('output',null,JSON.stringify(renders.at(-1)));
}
const root=createRoot(document.getElementById('root'));
window.harness={
 render(userId,tag){flushSync(()=>root.render(React.createElement(Probe,{userId,tag})));return renders.filter(row=>row.tag===tag);},
 reply(index,status,body){requests[index].resolve({status,ok:status>=200&&status<300,json:async()=>body});},
 fail(index){requests[index].reject(new TypeError('Synthetic offline'));},
 retry(){flushSync(()=>latest.retry());},
 snapshot(){return {renders:[...renders],requests:requests.map(row=>({aborted:row.signal.aborted})),current:renders.at(-1)};},
 unmount(){flushSync(()=>root.unmount());}
};
`,resolveDir:root,loader:'tsx'},bundle:true,write:false,platform:'browser',format:'iife',define:{'process.env.NODE_ENV':'"development"'},logLevel:'silent'});
assert.equal(bundle.outputFiles.length,1);
if(!process.argv.includes('--run-local-browser')){
 console.log('PASS: real React hook harness bundles in memory; browser execution not requested.');
 process.exit(0);
}
const {chromium}=await import('playwright');
const browser=await chromium.launch({headless:true});
try{
 const context=await browser.newContext();
 const page=await context.newPage(),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/*',route=>route.abort());
 await page.setContent('<!doctype html><html><body><div id="root"></div></body></html>');
 await page.addScriptTag({content:bundle.outputFiles[0].text});
 const render=(id,tag)=>page.evaluate(({id,tag})=>window.harness.render(id,tag),{id,tag});
 const snapshot=()=>page.evaluate(()=>window.harness.snapshot());
 const count=n=>page.waitForFunction(n=>window.harness.snapshot().requests.length===n,n);
 const checked=enabled=>page.waitForFunction(enabled=>{const row=window.harness.snapshot().current;return row.ready&&row.enabled===enabled&&!row.error;},enabled);
 const pending=rows=>{assert.ok(rows.length);for(const row of rows)assert.deepEqual({ready:row.ready,enabled:row.enabled,error:row.error},{ready:false,enabled:false,error:false});};
 pending(await render('account-A','A-initial'));await count(1);
 await page.evaluate(()=>window.harness.reply(0,200,{enabled:true}));await checked(true);
 pending(await render('account-B','B-pending'));await count(2);
 // A has a saved success in hook state, but returning to A is a NEW scope.
 pending(await render('account-A','A-return-pending'));await count(3);
 assert.equal((await snapshot()).requests[1].aborted,true);
 // Ignore abort in the fake transport deliberately: a stale payload must not win.
 await page.evaluate(()=>window.harness.reply(1,403,{error:'Synthetic denied'}));
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 assert.equal((await snapshot()).current.ready,false);
 await page.evaluate(()=>window.harness.reply(2,200,{enabled:true}));await checked(true);
 // A transport failure is recoverable, not a checked negative authorization.
 await page.evaluate(()=>window.harness.retry());await count(4);
 await page.evaluate(()=>window.harness.fail(3));
 await page.waitForFunction(()=>window.harness.snapshot().current.error);
 assert.equal((await snapshot()).current.ready,false);
 await page.evaluate(()=>window.harness.retry());await count(5);
 await page.evaluate(()=>window.harness.reply(4,200,{enabled:true}));await checked(true);
 // Leaving the account also prevents an in-flight success from becoming current.
 await page.evaluate(()=>window.harness.retry());await count(6);
 pending(await render(undefined,'signed-out'));
 await page.evaluate(()=>window.harness.reply(5,200,{enabled:true}));
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 assert.equal((await snapshot()).current.enabled,false);
 await page.evaluate(()=>window.harness.unmount());
 assert.deepEqual(errors,[]);
 console.log('PASS: real React first renders A→B pending→A pending, stale response suppression, transport retry and account cleanup; no app, DB or network.');
 await context.close();
}finally{await browser.close();}
