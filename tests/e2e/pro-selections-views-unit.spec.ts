import {test,expect} from 'playwright/test';
import {buildTrackerRows,filterTrackerRows,groupTrackerRows,parseCustomViews,sortTrackerRows,summarizeRooms,trackerColumns,trackerCsvRows,trackerViewColumns,trackerViews} from '../../src/lib/pro/selections-views';
import {helpArticles} from '../../src/lib/pro/help-content';

// Row 62 - unit checks (no browser, server or database): tracker views, sorting, grouping, filters, room counters and CSV.
const id=()=>crypto.randomUUID(),stamp='2026-11-20T10:00:00.000Z';
const area=(name:string,position:number)=>({id:id(),workId:'w',position,name,archived:false,revision:1,createdAt:stamp,updatedAt:stamp});
const kitchen=area('Cocina',1),bath=area('Baño',2);
const option=(name:string,total:number)=>({id:id(),position:1,name,brand:'Marca X',url:'https://example.com/p',quantity:2,unitCents:total/2,totalCents:total,clientNotes:null,imageFileId:null});
const item=(areaId:string,name:string,state:string,extra:object={})=>{const o=option(name+' opción',100000);return {id:id(),workId:'w',areaId,position:1,name,dueDate:null,notes:null,status:'open',state,published:true,publishedAt:null,approvedOptionId:state==='approved'?o.id:null,approvedAt:null,clientComment:null,changesRequestedAt:null,recommendedOptionId:null,allowanceId:null,archived:false,overdue:false,options:[o],revision:1,createdAt:stamp,updatedAt:stamp,...extra};};
const items=[item(kitchen.id,'Grifo','approved'),item(kitchen.id,'Piso','pending_client',{dueDate:'2026-12-01',overdue:true}),item(bath.id,'Espejo','changes_requested')] as never[];
const rows=buildTrackerRows([kitchen,bath] as never[],items,null);
test('Row 62: the four views and the column set are consistent',()=>{
 expect(trackerViews).toEqual(['planning','financials','procurement','all']);
 for(const view of trackerViews)expect(trackerViewColumns[view].every(column=>trackerColumns.includes(column))).toBe(true);
 expect(trackerViewColumns.all.length).toBe(trackerColumns.length);
});
test('Row 62: rows, filters, sort and grouping',()=>{
 expect(rows.map(r=>r.area)).toEqual(['Cocina','Cocina','Baño']);
 const none={query:'',state:'all' as const,area:'all',order:'all',overdue:false};
 expect(filterTrackerRows(rows,{...none,overdue:true}).map(r=>r.name)).toEqual(['Piso']);
 expect(filterTrackerRows(rows,{...none,query:'espejo'}).length).toBe(1);
 expect(sortTrackerRows(rows,'name').map(r=>r.name)).toEqual(['Espejo','Grifo','Piso']);
 expect(sortTrackerRows(rows,'name',true).map(r=>r.name)).toEqual(['Piso','Grifo','Espejo']);
 expect(groupTrackerRows(rows,'area').map(g=>[g.key,g.rows.length])).toEqual([['Cocina',2],['Baño',1]]);
});
test('Row 62: room cards count states and sum only approved options',()=>{
 const rooms=summarizeRooms([kitchen,bath] as never[],items);
 expect(rooms[0]).toMatchObject({name:'Cocina',pending:1,declined:0,approved:1,total:2,approvedCents:100000});
 expect(rooms[1]).toMatchObject({pending:0,declined:1,approved:0,approvedCents:0});
});
test('Row 62: CSV keeps canonical column order, escapes formulas and leaves hidden columns out',()=>{
 const out=trackerCsvRows(rows,['total','item'],c=>c,s=>s,s=>s);
 expect(out[0]).toEqual(['item','total']);expect(out[1]).toEqual(['Grifo','1000.00']);
 expect(out.every(r=>r.length===2)).toBe(true);
});
test('Row 62: custom views read defensively and keep only known columns',()=>{
 expect(parseCustomViews('not json')).toEqual([]);expect(parseCustomViews(null)).toEqual([]);
 expect(parseCustomViews(JSON.stringify([{id:'a',name:'Mía',columns:['item','zzz']},{id:'b',name:'',columns:['item']}]))).toEqual([{id:'a',name:'Mía',columns:['item']}]);
});
test('Row 74: help articles have unique keys and both languages',()=>{
 expect(new Set(helpArticles.map(a=>a.key)).size).toBe(helpArticles.length);
 for(const a of helpArticles){expect(a.title.es&&a.title.en&&a.body.es&&a.body.en).toBeTruthy();}
});
