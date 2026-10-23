import { build } from "esbuild";
import { test, expect } from "playwright/test";

for (const context of ["service","job","product"] as const) {
  test(`${context}: WhatsApp preserves the selected context in internal measurement`,async({page})=>{
    const props = context === "service" ? {analyticsSource:"search",categoryId:"electricidad",searchArea:{provinceId:"al",cantonId:"al-at"}} : context === "job" ? {analyticsSource:"jobs",intent:"job",jobId:"vacante"} : {analyticsSource:"offers",offerId:"promocion",offerType:"product"};
    const mocked:Record<string,string>={
      "next-intl":`export const useLocale=()=> 'es';export const useTranslations=()=>key=>key;`,
      "@/hooks/use-app-dialog":`export const useAppDialog=()=>({dialogNode:null,showMessage:async()=>{}});`,
      "@/hooks/use-native-app":`export const useNativeApp=()=>false;`,
      "@/hooks/use-profesional-con-app":`export const useProfesionalConApp=()=>false;`,
      "@/components/professionals/message-launcher":`export const MessageLauncher=()=>null;`,
      "@/components/professionals/contact-gate":`export const useContactGate=()=>({requireAccount:()=>{},modals:null});`,
      "@/lib/analytics/interaction-events":`export const trackInteraction=event=>{window.events.push(event);};`,
      "@/lib/analytics/meta-pixel":`export const trackMetaConversion=()=>{};`,
    };
    const bundle=await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import {DirectChatLauncher} from './src/components/professionals/direct-chat-launcher';window.events=[];window.open=()=>null;createRoot(document.getElementById('root')).render(<DirectChatLauncher professionalId="provider" professionalName="Prueba" {...${JSON.stringify(props)}}/>);`,resolveDir:process.cwd(),loader:"tsx"},bundle:true,write:false,format:"iife",platform:"browser",jsx:"automatic",plugins:[{name:"contact-context",setup(b){b.onResolve({filter:/^(next-intl|@\/)/},a=>mocked[a.path]?{path:a.path,namespace:"contact-context"}:undefined);b.onLoad({filter:/.*/,namespace:"contact-context"},a=>({contents:mocked[a.path]}));}}]});
    await page.route('**/contact-context-harness',r=>r.fulfill({contentType:'text/html',body:'<div id="root"></div>'}));
    await page.route('**/api/contact/whatsapp-link',r=>r.fulfill({json:{href:'https://wa.me/50600000000'}}));
    await page.goto('/contact-context-harness');await page.addScriptTag({content:bundle.outputFiles[0].text});
    await page.getByRole('button',{name:'WhatsApp',exact:true}).click();
    await expect.poll(()=>page.evaluate(()=>(window as unknown as {events:unknown[]}).events.length)).toBe(1);
    const event=await page.evaluate(()=>(window as unknown as {events:Array<{categoryId?:string;source:string;metadata:Record<string,unknown>}>}).events[0]);
    expect(event.source).toBe(props.analyticsSource);
    if(context==='service'){expect(event.categoryId).toBe('electricidad');expect(event.metadata).toEqual({provincia:'al',canton:'al-at'});}
    if(context==='job')expect(event.metadata).toEqual({jobId:'vacante',intent:'job'});
    if(context==='product')expect(event.metadata).toEqual({offerId:'promocion',offer_type:'product'});
    expect(JSON.stringify(event)).not.toContain('Prueba');
  });
}
