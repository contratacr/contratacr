import {test,expect} from 'playwright/test';
import {randomBytes,randomUUID} from 'node:crypto';
import {parseTags,markupCents,parseExtrasData,statusesExtrasSchema} from '../../src/lib/pro/project-extras';
import {emptyFileFilters,fileFiltersActive,filterFiles} from '../../src/lib/pro/file-filters';
import {expenseKpis} from '../../src/components/pro/expense-extras';
import {ownerFixture,local,origin,headersFor} from './pro-round2-fixture';

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
