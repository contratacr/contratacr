import {test,expect} from 'playwright/test';
import {randomBytes,randomUUID} from 'node:crypto';
import {parseTags,markupCents,parseExtrasData,statusesExtrasSchema} from '../../src/lib/pro/project-extras';
import {csvCell,daysBetween,scheduleCsv} from '../../src/lib/pro/schedule-views';
import {messageTemplates,renderMessageTemplate} from '../../src/lib/pro/message-templates';
import {emptyFileFilters,fileFiltersActive,filterFiles} from '../../src/lib/pro/file-filters';
import {expenseKpis} from '../../src/components/pro/expense-extras';
import {ownerFixture,local,origin,headersFor} from './pro-round2-fixture';
import {applyFormat,isSafeLink,parseInline,parseMessage,plainMessage} from '../../src/lib/pro/message-format';
import {connectorMutationSchema} from '../../src/lib/pro/integrations/workspace/api';
import {gotoOK,expectNoHorizontalOverflow} from './helpers';

// Area C: task tags + schedule link, time markup/taxable, project preferences, statuses and templates.
test('Project extras: pure helpers',()=>{
 expect(parseTags('a, b;a\n  c ,, ')).toEqual(['a','b','c']);
 expect(parseTags('x'.repeat(50))[0]).toHaveLength(30);
 expect(markupCents(10000,1500)).toBe(1500);
 expect(parseExtrasData('work','task',{tags:['uno']})).toEqual({tags:['uno']});
 expect(parseExtrasData('work','task',{tags:['uno'],extra:1})).toBeNull();
 expect(parseExtrasData('work','time',{markupBps:-1,taxable:true})).toBeNull();
 expect(parseExtrasData('owner','expense',{})).toBeNull();
 expect(statusesExtrasSchema.safeParse({items:[{id:'s1',name:'En pausa',color:'#ff8800'}]}).success).toBe(true);
 expect(statusesExtrasSchema.safeParse({items:[{id:'s1',name:'x',color:'red'}]}).success).toBe(false);
 expect(expenseKpis([{amountCents:100,billable:true,invoicedDraftId:null},{amountCents:200,billable:true,invoicedDraftId:'d'},{amountCents:400,billable:false,invoicedDraftId:null}])).toEqual({billable:100,invoiced:200,cost:400});
});
test('Project extras: API',async({page},info)=>{
 test.setTimeout(600000);local(info.project.use.baseURL);const id=randomBytes(3).toString('hex');
 const f=await ownerFixture(page.context(),'extras'+id);
 try{
  const headers=headersFor(f.owner),post=(data:Record<string,unknown>)=>page.request.post(origin+'/api/pro/project-extras',{headers,data}),get=(q:string)=>page.request.get(origin+'/api/pro/project-extras?'+q,{headers});
  const taskId=randomUUID();
  const created=await page.request.post(origin+'/api/pro/work-tasks',{headers,data:{action:'create',workId:f.workId,taskId,actionId:randomUUID(),revision:0,title:'Tarea '+id,details:'',dueDate:null,assignee:''}});expect(created.status(),await created.text()).toBe(200);
  const base={scope:'work',workId:f.workId,kind:'task',key:taskId};
  const first=await post({...base,revision:0,data:{tags:['urgente','cocina']}});expect(first.status(),await first.text()).toBe(200);expect((await first.json()).item).toMatchObject({revision:1,data:{tags:['urgente','cocina']}});
  expect((await post({...base,revision:0,data:{tags:['x']}})).status()).toBe(409);
  expect((await post({...base,revision:1,data:{tags:Array(9).fill('t')}})).status()).toBe(400);
  expect((await post({...base,key:randomUUID(),revision:0,data:{tags:[]}})).status()).toBe(404);
  const read=await get('scope=work&kind=task&workId='+f.workId+'&keys='+taskId);expect(read.status()).toBe(200);
  const body=await read.json();expect(body.items[taskId].data.tags).toEqual(['urgente','cocina']);expect(body.links).toBeDefined();
  // time: markup and taxable need a real entry
  expect((await post({scope:'work',workId:f.workId,kind:'time',key:randomUUID(),revision:0,data:{markupBps:1000,taxable:true}})).status()).toBe(404);
  // prefs: overview arrangement for this project only
  const prefs=await post({scope:'work',workId:f.workId,kind:'prefs',key:'',revision:0,data:{layout:{hidden:['finance'],order:['open','client','next','schedule','finance','activity']}}});expect(prefs.status(),await prefs.text()).toBe(200);
  expect((await post({scope:'work',workId:f.workId,kind:'prefs',key:'',revision:1,data:{layout:{hidden:['nope'],order:[]}}})).status()).toBe(400);
  expect((await get('scope=work&kind=prefs&workId='+f.workId)).status()).toBe(200);
  expect((await post({scope:'work',workId:f.workId,kind:'prefs',key:'x',revision:0,data:{layout:null}})).status()).toBe(400);
  // pin flag and custom statuses are read from the projects hub state
  const menu=await page.request.get(origin+'/api/pro/project-menu?workId='+f.workId,{headers});const menuBody=menu.status()===200?await menu.json():null;if(menu.status()!==404)expect(menuBody).toMatchObject({pinned:false,statusId:null});
  // owner templates
  const tpl=await post({scope:'owner',kind:'templates',key:'',revision:0,data:{items:[{id:randomUUID(),name:'Cocina',type:'Remodelación',tags:['a'],tasks:['Demolición'],savedAt:'2026-11-24'}]}});expect(tpl.status(),await tpl.text()).toBe(200);
  const anonymous=await page.context().browser()!.newContext({baseURL:origin});expect((await anonymous.request.post(origin+'/api/pro/project-extras',{headers:{Origin:origin},data:{}})).status()).toBe(401);await anonymous.close();
 }finally{await f.cleanup();}
});

test('Project files: filters by date range and type',()=>{
 const rows=[{createdAt:'2026-11-10T15:00:00Z',mimeType:'image/jpeg'},{createdAt:'2026-11-20T03:00:00Z',mimeType:'application/pdf'},{createdAt:'2026-11-22T12:00:00Z',mimeType:'text/plain'}];
 expect(filterFiles(rows,emptyFileFilters)).toHaveLength(3);
 expect(filterFiles(rows,{...emptyFileFilters,type:'pdf'})).toEqual([rows[1]]);
 // 2026-11-20T03:00Z is still November 19 in Costa Rica (UTC-6)
 expect(filterFiles(rows,{...emptyFileFilters,from:'2026-11-20'})).toEqual([rows[2]]);
 expect(filterFiles(rows,{...emptyFileFilters,to:'2026-11-19',type:'all'})).toEqual([rows[0],rows[1]]);
 expect(fileFiltersActive(emptyFileFilters)).toBe(false);expect(fileFiltersActive({...emptyFileFilters,type:'image'})).toBe(true);
});

test('Schedule actions: CSV export and date offset',()=>{
 expect(csvCell('=SUM(A1)')).toBe("'=SUM(A1)");expect(csvCell('a;b')).toBe('"a;b"');expect(csvCell('di "x"')).toBe('"di ""x"""');
 expect(daysBetween('2026-11-01','2026-11-10')).toBe(9);expect(daysBetween('2026-03-01','2026-02-01')).toBe(-28);
 const csv=scheduleCsv({phases:[{id:'p',title:'Obra'}],tasks:[{id:'t',title:'=Cmd',status:'open',phaseId:'p',plannedStart:'2026-11-01',plannedEnd:'2026-11-03'} as never],milestones:[{id:'m',title:'Entrega',date:'2026-11-30'} as never]},false);
 expect(csv.startsWith('﻿Tipo;Fase;Título;Inicio;Fin;Estado\r\n')).toBe(true);
 expect(csv).toContain("Elemento;Obra;'=Cmd;2026-11-01;2026-11-03;Abierto");expect(csv).toContain('Fecha clave;;Entrega;2026-11-30;2026-11-30;');
});

test('Message templates render with the first name',()=>{
 expect(renderMessageTemplate('interested',false,'María Pérez')).toContain('Hola María,');
 expect(renderMessageTemplate('unavailable',true,'John Smith')).toContain('Hi John,');
 expect(renderMessageTemplate('interested',true,'')).toContain('Hi there,');
 expect(renderMessageTemplate('nope',true,'x')).toBe('');
 for(const item of messageTemplates)expect(item.es.body.length).toBeLessThan(1000);
});

test('Project activities and rates: shapes',()=>{
 const ok={costCents:null,rateCents:250000,markupBps:1500,taxable:true,billable:false};
 expect(parseExtrasData('work','activity',ok)).toEqual(ok);
 expect(parseExtrasData('work','activity',{...ok,rateCents:-1})).toBeNull();
 expect(parseExtrasData('work','activity',{...ok,markupBps:100001})).toBeNull();
 expect(parseExtrasData('work','activity',{...ok,extra:1})).toBeNull();
 expect(parseExtrasData('work','activity',{costCents:null,rateCents:null,markupBps:0,taxable:false})).toBeNull();
});
test('Project activities and rates: API override applies to new entries',async({page},info)=>{
 test.setTimeout(600000);local(info.project.use.baseURL);const id=randomBytes(3).toString('hex');
 const f=await ownerFixture(page.context(),'actrate'+id);
 try{
  const headers=headersFor(f.owner),extras=(data:Record<string,unknown>)=>page.request.post(origin+'/api/pro/project-extras',{headers,data}),time=(data:Record<string,unknown>)=>page.request.post(origin+'/api/pro/time-tracking',{headers,data});
  const activityId=randomUUID(),today=new Date(Date.now()-6*3600000).toISOString().slice(0,10);
  expect((await time({action:'activity_save',actionId:randomUUID(),activityId,revision:0,name:'Instalación '+id,rateCents:2000000,costCents:1200000,billable:true})).status()).toBe(200);
  const base={scope:'work',workId:f.workId,kind:'activity',key:activityId};
  const saved=await extras({...base,revision:0,data:{costCents:null,rateCents:3000000,markupBps:1000,taxable:true,billable:true}});expect(saved.status(),await saved.text()).toBe(200);
  expect((await extras({...base,revision:0,data:{costCents:null,rateCents:1,markupBps:0,taxable:false,billable:true}})).status()).toBe(409);
  expect((await extras({...base,key:randomUUID(),revision:0,data:{costCents:null,rateCents:1,markupBps:0,taxable:false,billable:true}})).status()).toBe(404);
  const read=await page.request.get(origin+'/api/pro/project-extras?scope=work&kind=activity&workId='+f.workId+'&keys='+activityId,{headers});expect((await read.json()).items[activityId].data.rateCents).toBe(3000000);
  const entryId=randomUUID(),manual=await time({action:'manual',actionId:randomUUID(),entryId,workId:f.workId,activityId,billable:true,date:today,minutes:60,note:'Con tarifa del proyecto'});expect(manual.status(),await manual.text()).toBe(200);
  const entry=(await manual.json()).entry;expect(entry.rateCents).toBe(3000000);expect(entry.billable).toBe(true);
  // UI: the table is in Project details, in both languages, and shows the saved override.
  for(const language of ['es','en'] as const){
   const en=language==='en';await gotoOK(page,`/${language}/dashboard/pro?`+new URLSearchParams({tab:'pro_agenda',cita:f.workId}));
   const workspace=page.locator('[data-job-workspace]');await expect(workspace).toBeVisible({timeout:60000});
   await workspace.locator('[data-job-workspace-header]').getByRole('button',{name:en?'Project details':'Detalles del proyecto',exact:true}).click();
   const table=workspace.locator('[data-project-activity-rates]');await expect(table).toBeVisible({timeout:60000});
   const row=table.locator(`[data-activity-row="${activityId}"]`);await expect(row).toBeVisible();
   await expect(row.locator('[data-activity-field="rate"]')).toHaveValue('30000');await expect(row.locator('[data-activity-field="markup"]')).toHaveValue('10');
   await expect(table).toContainText(en?'Activities and rates':'Actividades y tarifas');await expectNoHorizontalOverflow(page);
  }
 }finally{await f.cleanup();}
});

test('Messages: light formatting is parsed safely',()=>{
 expect(parseInline('a **b** *c* __d__')).toEqual([{t:'text',v:'a '},{t:'b',c:[{t:'text',v:'b'}]},{t:'text',v:' '},{t:'i',c:[{t:'text',v:'c'}]},{t:'text',v:' '},{t:'u',c:[{t:'text',v:'d'}]}]);
 expect(parseInline('[sitio](https://contratacr.com/x)')).toEqual([{t:'a',href:'https://contratacr.com/x',c:[{t:'text',v:'sitio'}]}]);
 // unsafe links stay as plain text, never become anchors
 expect(JSON.stringify(parseInline('[x](javascript:alert(1)) [y](http://a.com)'))).not.toContain('"t":"a"');
 expect(isSafeLink('https://a.com/b')).toBe(true);expect(isSafeLink('data:text/html,x')).toBe(false);
 const blocks=parseMessage('# Asunto\n\nHola\n- uno\n- dos\n1. a\n2. b');
 expect(blocks.map(b=>b.t)).toEqual(['subject','p','ul','ol']);
 expect(plainMessage('# Hola\n\n**Gracias** por [ver](https://a.com)')).toBe('Hola\nGracias por ver');
 expect(applyFormat('hola mundo',5,10,'bold')).toMatchObject({value:'hola **mundo**'});
 expect(applyFormat('uno\ndos',0,7,'bullets').value).toBe('- uno\n- dos');
 expect(applyFormat('- uno\n- dos',0,11,'bullets').value).toBe('uno\ndos');
 expect(applyFormat('x',0,1,'link','javascript:1').value).toBe('x');
 expect(applyFormat('[a](https://b.com)',0,18,'unlink').value).toBe('a');
});

test('Project email: Cc is validated',()=>{
 const base={action:'send_email',actionId:randomUUID(),provider:'google',confirmed:true,to:['a@b.cc'],subject:'S',body:'B',workId:null,attachments:[]};
 expect(connectorMutationSchema.safeParse(base).success).toBe(true);
 expect(connectorMutationSchema.safeParse({...base,cc:['c@d.cc']}).success).toBe(true);
 expect(connectorMutationSchema.safeParse({...base,cc:['not-an-email']}).success).toBe(false);
 expect(connectorMutationSchema.safeParse({...base,cc:Array(11).fill('c@d.cc')}).success).toBe(false);
});
