import {test,expect} from 'playwright/test';
import {assigneeNames,filterBoards,selectionsDeepLink,UNASSIGNED_FILTER} from '../../src/lib/pro/selection-boards';

// Row 12 - unit checks (no browser, server or database): boards search, sort, multi-assignee filter, team names, deep link.
const areas=[{id:'a',name:'Cocina',position:2},{id:'b',name:'Baño principal',position:1},{id:'c',name:'Árbol sala',position:3}];
const meta=new Map<string,{assignee:string|null}>([['a',{assignee:'Ana'}],['b',{assignee:null}],['c',{assignee:' Luis '}]]);
const none=new Set<string>();
test('Row 12: custom order, name order and search',()=>{
 expect(filterBoards(areas,meta,{query:'',sort:'custom',assignees:none}).map(a=>a.id)).toEqual(['b','a','c']);
 expect(filterBoards(areas,meta,{query:'',sort:'name',assignees:none}).map(a=>a.id)).toEqual(['c','b','a']);
 expect(filterBoards(areas,meta,{query:'  BAÑO ',sort:'custom',assignees:none}).map(a=>a.id)).toEqual(['b']);
});
test('Row 12: assignee filter with Unassigned',()=>{
 expect(filterBoards(areas,meta,{query:'',sort:'custom',assignees:new Set(['Ana'])}).map(a=>a.id)).toEqual(['a']);
 expect(filterBoards(areas,meta,{query:'',sort:'custom',assignees:new Set([UNASSIGNED_FILTER])}).map(a=>a.id)).toEqual(['b']);
 expect(filterBoards(areas,meta,{query:'',sort:'custom',assignees:new Set(['Ana',UNASSIGNED_FILTER])}).map(a=>a.id)).toEqual(['b','a']);
 expect(filterBoards(areas,meta,{query:'cocina',sort:'custom',assignees:new Set(['Luis'])})).toEqual([]);
});
test('Row 12: team names and deep link',()=>{
 expect(assigneeNames([{displayName:' Zoe ',active:true},{displayName:'Ana',active:true},{displayName:'Ana',active:true},{displayName:'Off',active:false},{displayName:'  ',active:true}])).toEqual(['Ana','Zoe']);
 expect(selectionsDeepLink('https://x.test','es','w1')).toBe('https://x.test/dashboard/pro?tab=pro_agenda&cita=w1&vistaTrabajo=selections');
 expect(selectionsDeepLink('https://x.test','en','w1')).toBe('https://x.test/en/dashboard/pro?tab=pro_agenda&cita=w1&vistaTrabajo=selections');
});
