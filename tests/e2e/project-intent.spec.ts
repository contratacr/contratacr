import {test,expect} from 'playwright/test';
import {build} from 'esbuild';
import {readFileSync} from 'node:fs';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
let script:string,css:string;
test.beforeAll(async()=>{
 const mocks:Record<string,string>={
 'next-intl':`const messages=${JSON.stringify({es:JSON.parse(readFileSync('messages/es.json','utf8')).publicarProyecto,en:JSON.parse(readFileSync('messages/en.json','utf8')).publicarProyecto})};export const useLocale=()=>document.documentElement.lang;export const useTranslations=()=>key=>messages[document.documentElement.lang][key]??key;`,
 'next/navigation':`const params=new URLSearchParams(location.search);export const useSearchParams=()=>params;`,
 '@/hooks/use-auth':`const mode=new URLSearchParams(location.search).get('account');const user=mode?{id:'fixture',user_metadata:{is_provider:mode==='pro'}}:null;export const useAuth=()=>({user});`,
 '@/i18n/navigation':`import React from 'react';export const Link=({prefetch,...props})=><a {...props}/>;`,
 '@/lib/supabase/client':`export const createClient=()=>({rpc:()=>Promise.resolve({data:null})});`,
 '@/components/ui/category-search':`import React from 'react';export const CategorySearch=()=> <input aria-label="category"/>;`,
 '@/components/ui/sugerencia-de-servicio':`export const SugerenciaDeServicio=()=>null;`,
 '@/components/ui/phone-input':`import React from 'react';export const PhoneInput=()=> <input type="tel"/>;export const isPhoneComplete=()=>true;`,
 '@/components/ui/cedula-input':`export const CedulaInput=()=>null;`,
 '@/lib/borrador-sin-sesion':`export const leerBorrador=async()=>new URLSearchParams(location.search).has('saved')?{datos:{form:{categoryId:'',description:'Solicitud restaurada',provinciaId:'',cantonId:''},telefono:''}}:null;export const guardarBorrador=async()=>{};export const borrarBorrador=()=>{};export const rutaParaEntrar=()=>'/ingresar';`,
 };
 const result=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`import React from 'react';import{createRoot}from'react-dom/client';import{PublishProjectModal}from'./src/components/projects/publish-project-modal';const edit=new URLSearchParams(location.search).has('edit');createRoot(document.getElementById('root')).render(<PublishProjectModal onClose={()=>{}} editar={edit?{id:'test',categoryId:'',description:'Necesito pintar una casa',provinciaId:'',cantonId:''}:undefined}/>);`},bundle:true,write:false,jsx:'automatic',format:'iife',platform:'browser',tsconfig:'tsconfig.json',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'boundaries',setup(b){b.onResolve({filter:/.*/},a=>a.path in mocks?{path:a.path,namespace:'mock'}:undefined);b.onLoad({filter:/.*/,namespace:'mock'},a=>({contents:mocks[a.path],loader:'jsx',resolveDir:process.cwd()}));}}]});
 script=result.outputFiles[0].text;css=(await postcss([tailwind()]).process(readFileSync('src/app/globals.css','utf8'),{from:'src/app/globals.css'})).css;
});
async function mount(page:import('playwright/test').Page,locale:string,query=''){
 await page.route('**/intent-harness*',r=>r.fulfill({contentType:'text/html',body:`<!doctype html><html lang="${locale}"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div></body></html>`}));
 await page.goto('/intent-harness'+query);await page.addStyleTag({content:css});await page.addScriptTag({content:script});
}
for(const locale of ['es','en'])for(const account of ['','client','pro'])test(`project intention ${locale} ${account||'guest'} routes and preserves request`,async({page})=>{
 await mount(page,locale,account?'?account='+account:'');
 await expect(page.getByTestId('project-intent-choice')).toBeVisible();
 await expect(page.locator('button[type=submit]')).toHaveCount(0);
 const offer=page.getByRole('link',{name:locale==='es'?'Quiero ofrecer mis servicios':'I want to offer my services',exact:true});
 await expect(offer).toHaveAttribute('href',account==='pro'?'/dashboard/profesional?tab=profile&mode=offer':'/registro/profesional');
 await expect(page.getByText(locale==='es'?'Quiero publicar un servicio que necesito.':'I want to post a service I need.',{exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 if(locale==='es'&&!account)await page.screenshot({path:test.info().outputPath('project-intent.png')});
 await page.getByRole('button',{name:locale==='es'?'Necesito un profesional':'I need a professional',exact:true}).click();
 const text=page.locator('textarea');await text.fill('Necesito pintar una casa');
 await page.getByRole('button',{name:locale==='es'?'Volver a elegir':'Back to choices',exact:true}).click();
 await expect(page.getByTestId('project-intent-choice')).toBeVisible();
 await page.getByRole('button',{name:locale==='es'?'Necesito un profesional':'I need a professional',exact:true}).click();
 await expect(text).toHaveValue('Necesito pintar una casa');await expect(page.locator('button[type=submit]')).toBeVisible();
});
test('editing bypasses intention and retains description',async({page})=>{await mount(page,'es','?edit=1');await expect(page.getByTestId('project-intent-choice')).toHaveCount(0);await expect(page.locator('textarea')).toHaveValue('Necesito pintar una casa');});

test('saved draft resumes the form while an expired draft returns to choices',async({page})=>{
 await mount(page,'es','?borrador=1&saved=1');await expect(page.locator('textarea')).toHaveValue('Solicitud restaurada');await expect(page.getByTestId('project-intent-choice')).toHaveCount(0);
 await mount(page,'es','?borrador=1');await expect(page.getByTestId('project-intent-choice')).toBeVisible();
});
for(const width of [320,1440])test(`project choices fit width ${width}`,async({page})=>{await page.setViewportSize({width,height:900});await mount(page,'es');await expect(page.getByTestId('project-intent-choice')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await expect(page.getByRole('link',{name:'Quiero ofrecer mis servicios',exact:true})).toBeInViewport();});
