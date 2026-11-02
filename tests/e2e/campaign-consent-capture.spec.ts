import { test, expect } from "playwright/test";
import { build } from "esbuild";
let script: string;
test.beforeAll(async () => {
 const mocks:Record<string,string>={
  "next/navigation":"export const usePathname=()=>location.pathname;const params=new URLSearchParams(location.search);export const useSearchParams=()=>params;",
  "@/hooks/use-auth":"export const useAuth=()=>({user:null});",
  "@/lib/analytics/attribution":"export const captureAttribution=()=>null;export const readAttribution=()=>null;",
  "@/lib/analytics/interaction-events":"export const trackInteraction=event=>{window.events.push(event);};",
  "@/lib/privacy/optional-consent":"export const analyticsMeasurementEnabled=()=>window.allowed;export const subscribeOptionalConsent=cb=>{window.addEventListener('choice',cb);return ()=>window.removeEventListener('choice',cb);};export const syncAdvertisingCookie=()=>{};export const syncAnalyticsCookie=()=>{};export const retryAdvertisingWithdrawal=async()=>{};export const retryStatisticsCleanup=async()=>{};",
 };
 const result=await build({stdin:{contents:"import React from 'react';import {createRoot} from 'react-dom/client';import {AttributionCapture} from './src/components/analytics/attribution-capture';window.allowed=false;window.events=[];createRoot(document.getElementById('root')).render(<AttributionCapture/>);",resolveDir:process.cwd(),loader:"tsx"},bundle:true,write:false,format:"iife",platform:"browser",jsx:"automatic",plugins:[{name:"boundaries",setup(b){b.onResolve({filter:/^(next\/|@\/)/},a=>mocks[a.path]?{path:a.path,namespace:"fixture"}:undefined);b.onLoad({filter:/.*/,namespace:"fixture"},a=>({contents:mocks[a.path]}));}}]});
 script=result.outputFiles[0].text;
});
for(const medium of ["paid_social","paid","cpc","ads","ppc","campana"]) test(`${medium}: capture waits for statistics consent, records once, and does not call Meta`, async ({page})=>{
 const outbound:string[]=[];
 await page.route('**/*',route=>{
  if(new URL(route.request().url()).pathname==='/campaign-harness')return route.fulfill({contentType:'text/html',body:'<div id="root"></div>'});
  outbound.push(route.request().url());return route.abort();
 });
 await page.goto(`http://localhost/campaign-harness?utm_source=meta&utm_medium=${medium}&utm_campaign=clientes_cr_202611`);
 await page.addScriptTag({content:script});
 await expect.poll(()=>page.evaluate(()=>document.getElementById('root')!==null)).toBe(true);
 expect(await page.evaluate(()=>(window as unknown as {events:unknown[]}).events)).toEqual([]);
 await page.evaluate(()=>{(window as unknown as {allowed:boolean}).allowed=true;window.dispatchEvent(new Event('choice'));});
 await expect.poll(()=>page.evaluate(()=>(window as unknown as {events:unknown[]}).events.length)).toBe(1);
 const event=await page.evaluate(()=>(window as unknown as {events:Array<{type:string;metadata:Record<string,string>}>}).events[0]);
 expect(event.type).toBe('campaign_click');expect(event.metadata.medio).toBe(medium);expect(event.metadata.campana).toBe('clientes_cr_202611');
 await page.evaluate(()=>{window.dispatchEvent(new Event('choice'));});
 expect(await page.evaluate(()=>(window as unknown as {events:unknown[]}).events.length)).toBe(1);
 expect(outbound).toEqual([]);
});
