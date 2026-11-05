import { test,expect,type Page } from "playwright/test";
import { createRequire } from "node:module";
const requireNode=createRequire(`${process.cwd()}/tests/e2e/admin-moderation.spec.ts`);
const {build}=requireNode('esbuild') as typeof import('esbuild');
const cid="00000000-0000-4000-8000-000000000020",rid="00000000-0000-4000-8000-000000000022";
async function mount(page:Page,component:string,route:(url:URL,body:Record<string,unknown>|null)=>unknown|Promise<unknown>){
 const result=await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import{${component}}from'./src/components/admin/${component==='AdminReports'?'admin-reports':component==='AdminHealth'?'admin-health':'admin-conversations'}';createRoot(document.getElementById('root')).render(React.createElement(${component}));`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,format:'iife',define:{'process.env.NODE_ENV':'"test"'},plugins:[{name:'isolated-navigation',setup(b){b.onResolve({filter:/^@\/i18n\/navigation$/},()=>({path:'navigation',namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:`import React from 'react';export const Link=({href,children,...props})=>React.createElement('a',{href,...props},children);`,loader:'jsx',resolveDir:process.cwd()}));}}]});
 const bundle=result.outputFiles[0].text;
 await page.route('**/*',async r=>{
  const url=new URL(r.request().url());
  if(url.pathname==='/__admin-test')return r.fulfill({contentType:'text/html',body:`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{font:16px system-ui;margin:16px;color:#162543}input,textarea{max-width:100%}article,section{padding:12px;margin:12px 0;border:1px solid #ddd}label{display:block;margin:8px 0}button,select,input,textarea{font:inherit;padding:8px}p{overflow-wrap:anywhere}</style></head><body><div id="root"></div><script>${bundle.replace(/<\/script/gi,'<\\/script')}</script></body></html>`});
  if(url.pathname.startsWith('/api/')){
   let body:Record<string,unknown>|null=null;try{body=r.request().postDataJSON();}catch{}
   const data=await route(url,body);
   if(data instanceof Error)return r.fulfill({status:503,json:{error:data.message}});
   return r.fulfill({json:data});
  }
  return r.abort();
 });
 await page.goto('http://127.0.0.1:3997/__admin-test');
}

test('admin chat metadata, filters, audited opening and closing use the real component',async({page})=>{
 const calls:Array<Record<string,unknown>>=[];
 await mount(page,'AdminConversations',(url,body)=>{
  if(body){calls.push(body);return {auditId:'audit-test',messages:[{id:'message',from_client:true,created_at:'2026-11-01T12:00:00Z',body:'Contenido sintético de prueba',deleted:false,edited_at:null}]};}
  return {rows:[{id:cid,client_name:'Cliente de prueba',professional_name:'Profesional de prueba',waiting_for:'professional',since:'2026-11-01T12:00:00Z',last_message_at:'2026-11-02T12:00:00Z'}],total:1,canReview:true};
 });
 await expect(page.getByText('Cliente de prueba',{exact:false}).first()).toBeVisible();
 await expect(page.getByText('Contenido sintético de prueba')).toHaveCount(0);
 await page.getByLabel('Tiempo').selectOption('24');
 await page.getByRole('button',{name:'Revisar por un caso de soporte'}).click();
 await page.getByLabel('Tipo de caso').selectOption('report');
 await page.getByLabel('ID del caso',{exact:true}).fill(rid);
 await page.getByLabel('Motivo de consulta').fill('Investigar el reporte del participante');
 await page.getByRole('button',{name:'Registrar consulta y abrir mensajes'}).click();
 await expect(page.getByText('Contenido sintético de prueba')).toBeVisible();
 expect(calls).toHaveLength(1);expect(calls[0]).toMatchObject({conversation:cid,report:rid,ticket:null,offset:0});
 await expect(page.getByText('Consulta registrada: audit-test')).toBeVisible();
 await page.getByRole('button',{name:'Cerrar y ocultar contenido'}).click();
 await expect(page.getByText('Contenido sintético de prueba')).toHaveCount(0);
});

test('a failed chat review never displays content or a successful audit receipt',async({page})=>{
 await mount(page,'AdminConversations',(_url,body)=>body?new Error('Auditoría no disponible'):{rows:[{id:cid,client_name:'Cliente QA',professional_name:'Profesional QA',waiting_for:'professional',since:'2026-11-01T12:00:00Z'}],total:1,canReview:true});
 await page.getByRole('button',{name:'Revisar por un caso de soporte'}).click();
 await page.getByLabel('ID del caso',{exact:true}).fill(rid);await page.getByLabel('Motivo de consulta').fill('Caso de soporte que requiere revisión');
 await page.getByRole('button',{name:'Registrar consulta y abrir mensajes'}).click();
 await expect(page.getByRole('alert')).toHaveText('Auditoría no disponible');
 await expect(page.getByText(/Consulta registrada:/)).toHaveCount(0);
});

test('reports identify a client, require a reason and preserve the case on resolution',async({page})=>{
 const calls:Array<Record<string,unknown>>=[];
 await mount(page,'AdminReports',(url,body)=>{
  if(body){calls.push(body);return {ok:true};}
  if(url.pathname==='/api/admin/moderacion')return {rows:[]};
  return {reports:[{id:rid,subject_name:'Cliente reportado QA',subject_user_id:cid,professional_id:null,target_type:'account',target_id:cid,conversation_id:cid,reason:'Reporte de prueba',status:'open',priority:'high',assigned_name:null,created_at:'2026-11-01T12:00:00Z'}],total:1};
 });
 await expect(page.getByRole('heading',{name:/Cliente reportado QA/})).toBeVisible();
 await page.getByRole('button',{name:'Atender y ver historial'}).click();
 await expect(page.getByRole('button',{name:'Resolver con motivo'})).toBeDisabled();
 const reason=page.getByRole('textbox',{name:'Motivo (visible al afectado si se registra como decisión)',exact:true});
 await reason.fill('Se revisó la evidencia y se atendió el caso.');
 await page.getByRole('button',{name:'Resolver con motivo'}).click();
 expect(calls).toHaveLength(1);expect(calls[0]).toMatchObject({id:rid,status:'resolved',priority:'high'});
 await expect(page.getByRole('button',{name:/^Eliminar$/})).toHaveCount(0);
 await expect(page.getByRole('link',{name:'Revisión restringida del chat'})).toHaveAttribute('href',`/admin/conversaciones?conversation=${cid}&report=${rid}`);
 await expect(page.getByRole('button',{name:'Guardar acción y auditoría',exact:true})).toBeEnabled();
 await page.evaluate(()=>{const root=document.getElementById('root')!;const main=document.createElement('main');root.replaceWith(main);main.append(root);const announcer=document.createElement('div');announcer.setAttribute('role','alert');document.body.append(announcer);});
 await expect(page.getByRole('main').getByRole('alert')).toHaveCount(0);
 expect(await page.getByRole('alert').count()).toBe(1);
 await reason.fill('Nuevo motivo para una revisión posterior.');
 await expect(reason).toHaveValue('Nuevo motivo para una revisión posterior.');
 expect(calls).toHaveLength(1);
});

test('operational health distinguishes unavailable from zero and never offers a push replay',async({page})=>{
 await mount(page,'AdminHealth',url=>url.pathname==='/api/admin/permisos'?new Error('Solo administración completa'):{checkedAt:'2026-11-04T12:00:00Z',scannerConfigured:false,note:'Sin reenvíos automáticos',rows:[{key:'push_failed',label:'Push fallidos',count:null,error:true},{key:'deletions',label:'Eliminaciones pendientes',count:0,error:false}]});
 await expect(page.getByText('No disponible',{exact:true})).toBeVisible();
 await expect(page.getByText('0',{exact:true})).toBeVisible();
 await expect(page.getByText(/Pendiente de configurar un servicio privado/)).toBeVisible();
 await expect(page.getByRole('button',{name:/Reenviar push/})).toHaveCount(0);
});
