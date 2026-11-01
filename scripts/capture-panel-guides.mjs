// Reproducible screenshots of the real panel components, with synthetic data.
// All network requests are intercepted; this never logs in or writes to a backend.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import { chromium } from 'playwright';
const root=process.cwd(),out=path.join(root,'public/panel-guides');
await fs.mkdir(out,{recursive:true});
const user={id:'00000000-0000-4000-8000-000000000001',email:'example@contratacr.test',user_metadata:{full_name:'Cuenta de ejemplo',is_provider:true,onboarding_completed:true}};
const app=`import React from 'react';import{createRoot}from'react-dom/client';import{NextIntlClientProvider}from'next-intl';
import{ServicesEditor}from'./src/components/dashboard/pro/services-editor';import{ProfileEditor}from'./src/components/dashboard/pro/profile-editor';import{ProfileCompletion}from'./src/components/dashboard/pro/profile-completion';import{PublishProjectModal}from'./src/components/projects/publish-project-modal';import{OfferForm}from'./src/components/offers/offer-form';
const loc=new URLSearchParams(location.search).get('lang')||'es',view=new URLSearchParams(location.search).get('view');
const initial={id:'example',bio:'',whatsapp:'',profiles:{full_name:loc==='en'?'Example professional':'Profesional de ejemplo'},workplaces:[],professions:[view==='workplacesGuide'?'desarrollo_web':'electricidad'],services:[],verification_status:'verified',slug:'example-profile'};
const service={id:'electricidad',name:loc==='en'?'Electrical':'Electricidad',description:'',priceType:'a_convenir',startedAt:'2020-01'};
const content=view==='services'?<ServicesEditor professionalId="example" primaryCategory="electricidad" initialServices={[service]} focusField="servicePrice" focusKey={1}/>:view==='workplacesGuide'?<ProfileEditor professionalId="example" profileId="example" initial={initial} focusField="location" focusKey={1}/>:view==='clientProjects'?<PublishProjectModal onClose={()=>{}}/>:view==='offersPanel'?<OfferForm professionalId="example" serviceOptions={[{value:'electricidad',label:loc==='en'?'Electrical':'Electricidad'}]} presentation="page"/>:<ProfileCompletion pro={initial} variant="details" onGo={()=>{}}/>;
createRoot(document.getElementById('root')).render(<NextIntlClientProvider locale={loc} messages={window.GUIDE_MESSAGES} timeZone="America/Costa_Rica"><div style={{padding:16}}>{content}</div></NextIntlClientProvider>);`;
const mocks={
 '@/lib/supabase/client':`const q={select(){return this},eq(){return this},in(){return this},order(){return this},limit(){return this},maybeSingle(){return this},single(){return this},then(fn){return Promise.resolve({data:[],error:null}).then(fn)}};export const createClient=()=>({from:()=>q,rpc:async()=>({data:{phone:'',cedula:'',client_identity_status:'unverified'},error:null}),auth:{getSession:async()=>({data:{session:null}})}});`,
 '@/hooks/use-auth':`export const useAuth=()=>({user:${JSON.stringify(user)},loading:false,fetchProfile:async()=>{}});`,
 '@/hooks/use-app-dialog':`export const useAppDialog=()=>({alert:async()=>{},confirm:async()=>false});`,
 '@/lib/analytics/meta-pixel':`export const trackMetaConversion=()=>{};export const trackMetaEvent=()=>{};`,
 '@/i18n/navigation':`import React from'react';export const Link=({children,href,...p})=><a href={typeof href==='string'?href:'#'} {...p}>{children}</a>;export const useRouter=()=>({push:()=>{},replace:()=>{},refresh:()=>{},back:()=>{}});export const usePathname=()=>'/dashboard/profesional';`,
 'next/navigation':`export const useSearchParams=()=>new URLSearchParams(location.search);export const useRouter=()=>({push:()=>{},replace:()=>{},refresh:()=>{},back:()=>{}});export const usePathname=()=>'/dashboard/profesional';`,
 'next/image':`import React from'react';export default function Image({src,unoptimized,priority,fill,...p}){return <img src={typeof src==='string'?src:src.src} {...p}/>;}`,
};
const built=await build({stdin:{contents:app,loader:'tsx',resolveDir:root},bundle:true,write:false,format:'iife',define:{'process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY':'"guide-fixture-map-unused"','process.env':'{"NODE_ENV":"production"}'},plugins:[{name:'isolated-capture',setup(b){b.onResolve({filter:/.*/},args=>mocks[args.path]?{path:args.path,namespace:'fixture'}:null);b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:mocks[args.path],loader:'tsx',resolveDir:root}));}}]});
const js=built.outputFiles[0].text;
const css=(await postcss([tailwind()]).process(await fs.readFile('src/app/globals.css','utf8'),{from:path.join(root,'src/app/globals.css')})).css;
const browser=await chromium.launch();
try{for(const lang of ['es','en'])for(const view of ['completionGuide','services','workplacesGuide','clientProjects','offersPanel']){
 if(process.argv[2] && process.argv[2] !== `${lang}:${view}`)continue;
 const page=await browser.newPage({viewport:{width:390,height:780},deviceScaleFactor:1});page.setDefaultTimeout(5000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>r.abort());
 const messages=await fs.readFile(`messages/${lang}.json`,'utf8');
 await page.route('https://guide.test/**',async r=>{
  const url=new URL(r.request().url());
  if(url.pathname.startsWith('/api/'))return r.fulfill({json:{categories:[],categoryFlags:[],groups:[],total:0}});
  if(url.pathname.startsWith('/brand/')){try{return r.fulfill({body:await fs.readFile(path.join(root,'public',url.pathname)),contentType:url.pathname.endsWith('.svg')?'image/svg+xml':'image/png'});}catch{return r.fulfill({status:404,body:''});}}
  return r.fulfill({contentType:'text/html; charset=utf-8',body:`<style>${css}</style><div id="root"></div><script>window.GUIDE_MESSAGES=${messages}</script><script>${js}</script>`});
 });
 await page.goto(`https://guide.test/?view=${view}&lang=${lang}&categoria=electricidad`);await page.waitForTimeout(500);
 if(errors.length)throw Error(view+': '+errors.join('\n'));
 const steps=async()=>{
  const es=lang==='es';
  const choose=async(name,value)=>{await page.getByRole('button',{name,exact:true}).click();await page.getByRole('option',{name:value,exact:true}).click();};
  if(view==='services')return [
   ()=>page.getByRole('button',{name:es?/Cambiar/:/Change/}),
   async()=>{const field=page.locator('textarea').first();await field.fill(es?'Instalación y revisión de tomacorrientes en viviendas.':'Installation and inspection of home electrical outlets.');return field;},
   async()=>{await page.getByTestId('servicio-consultar-precio').click();const field=page.locator('[data-service-price-field] input').first();await field.fill('12000');return page.locator('[data-service-price-field]');},
   ()=>page.locator('[data-service-price-field]').locator('xpath=following-sibling::div[1]'),
  ];
  if(view==='workplacesGuide')return [
   ()=>page.locator('[data-field="location"]'),
   async()=>{await choose(es?'Provincia':'Province','Alajuela');await choose(es?'Cantón':'Canton','Atenas');return page.locator('[data-field="location"]');},
   async()=>{await page.getByRole('button',{name:es?'Agregar este lugar':'Add this place',exact:true}).click();const field=page.getByRole('switch').first();if(await field.getAttribute('aria-checked')==='false')await field.click();return field;},
   ()=>page.getByRole('button',{name:es?'Guardar cambios':'Save changes',exact:true}).last(),
  ];
  if(view==='clientProjects')return [
   async()=>{const field=page.locator('textarea').first();await field.fill(es?'Necesito revisar un tomacorriente que dejó de funcionar en mi casa.':'I need an electrical outlet that stopped working in my home checked.');return field;},
   ()=>page.locator('input[type="tel"]').first(),
   ()=>page.getByRole('button',{name:es?'Publicar proyecto':'Post project',exact:true}).last(),
  ];
  if(view==='offersPanel')return [
   async()=>{await page.locator('input[name="title"]').fill(es?'Revisión de tomacorrientes':'Electrical outlet inspection');await page.locator('#offer-service').click();await page.getByRole('option',{name:es?'Electricidad':'Electrical',exact:true}).click();return page.locator('input[name="title"]');},
   async()=>{const field=page.locator('textarea[name="description"]');await field.fill(es?'Revisión de hasta tres tomacorrientes. Repuestos se cotizan por separado.':'Inspection of up to three outlets. Replacement parts quoted separately.');return field;},
   async()=>{const field=page.locator('input[name="price_now"]');await field.fill('25000');return field;},
   ()=>page.locator('input[name="location_label_fallback"]').locator('..'),
  ];
  return [
   ()=>page.locator('[data-completion-step]').first(),
   ()=>page.locator('[data-completion-step="location"]'),
   ()=>page.locator('[data-completion-step="publicLinks"]'),
   ()=>page.locator('[data-completion-step="bio"]'),
  ];
 };
 const actions=await steps();
 for(let i=0;i<actions.length;i++){
  await page.locator('[data-guide-highlight]').evaluateAll(nodes=>nodes.forEach(n=>{n.style.outline='';n.style.outlineOffset='';n.removeAttribute('data-guide-highlight');}));
  const target=await actions[i]();await target.scrollIntoViewIfNeeded();
  await target.evaluate(n=>{n.setAttribute('data-guide-highlight','');n.style.outline='3px solid #009fd9';n.style.outlineOffset='4px';});
  await page.waitForTimeout(150);
  const box=await target.boundingBox();if(!box)throw Error(view+' missing step '+i);
  const y=Math.max(0,Math.min(300,Math.round(box.y+Math.min(box.height,200)/2-240)));
  await page.screenshot({path:`${out}/${lang}-${view}-${i+1}.jpg`,type:'jpeg',quality:85,clip:{x:0,y,width:390,height:480}});
 }
 if(errors.length)throw Error(view+': '+errors.join('\n'));
 console.log(`${lang}/${view}: ${actions.length} real-component captures`);
 await page.close();
}}finally{await browser.close()}

const sources=['src/components/dashboard/pro/services-editor.tsx','src/components/dashboard/pro/profile-editor.tsx','src/components/dashboard/pro/profile-completion.tsx','src/components/projects/publish-project-modal.tsx','src/components/offers/offer-form.tsx','messages/es.json','messages/en.json'];
const hashes=Object.fromEntries(await Promise.all(sources.map(async file=>[file,createHash('sha256').update(await fs.readFile(file)).digest('hex')])));
const images=(await fs.readdir(out)).filter(f=>f.endsWith('.jpg')).sort();
await fs.writeFile(path.join(out,'provenance.json'),JSON.stringify({description:'Real current React components rendered in an isolated browser with synthetic example data. No authenticated session or backend writes. Cyan outlines identify the current step. Screenshots are illustrative, not proof of a saved or published item.',generator:'scripts/capture-panel-guides.mjs',sources:hashes,images},null,2)+'\n');
