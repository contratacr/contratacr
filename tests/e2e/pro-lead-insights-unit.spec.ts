import {test,expect} from 'playwright/test';
import {funnelRows,insightPeriods,pctChange,sourceRows} from '../../src/lib/pro/lead-insights';

// Row 19 - unit checks (no browser, server or database): periods, percent change, source table and stage funnel.
test('Row 19: periods end today and the previous one is the same length right before',()=>{
 expect(insightPeriods('1m','2026-11-24')).toEqual({current:{from:'2026-10-25',to:'2026-11-24'},previous:{from:'2026-09-25',to:'2026-10-24'}});
 expect(insightPeriods('6m','2026-11-24').current).toEqual({from:'2026-05-25',to:'2026-11-24'});
 expect(insightPeriods('6m','2026-11-24').previous).toEqual({from:'2025-11-25',to:'2026-05-24'});
 expect(insightPeriods('1y','2026-11-24').previous.to).toBe('2025-11-24');
 expect(insightPeriods('1m','2026-03-31').current.from).toBe('2026-03-01');
 expect(insightPeriods('3m','2026-01-15').current.from).toBe('2025-10-16');
});
test('Row 19: percent change and source rows',()=>{
 expect(pctChange(15,10)).toBe(50);expect(pctChange(5,10)).toBe(-50);expect(pctChange(3,0)).toBeNull();expect(pctChange(1,3)).toBe(-66.7);
 const rows=sourceRows([{id:'web',name:'Sitio',total:6,won:2},{id:null,name:'Sin especificar',total:6,won:0},{id:'ref',name:'Referido',total:2,won:1},{id:'x',name:'Vacío',total:0,won:0}],[{id:'web',name:'Sitio',total:3,won:0},{id:null,name:'Sin especificar',total:6,won:0}]);
 expect(rows.map(r=>r.id)).toEqual([null,'web','ref']);
 expect(rows.find(r=>r.id==='web')).toMatchObject({previous:3,change:100,won:2,share:42.9});expect(rows.find(r=>r.id==='ref')).toMatchObject({previous:0,change:null});
 expect(sourceRows(Array.from({length:12},(_,i)=>({id:'c'+i,name:'C'+i,total:12-i,won:0})),[],10)).toHaveLength(10);
});
test('Row 19: funnel counts a lead in its stage and the earlier ones, hidden stages are left out',()=>{
 const stages=[{id:'new',position:0,hidden:false},{id:'followed_up',position:1,hidden:false},{id:'connected',position:2,hidden:true},{id:'won',position:3,hidden:false}];
 const rows=funnelRows(stages,[{stageId:'new',count:6},{stageId:'followed_up',count:3},{stageId:'connected',count:0},{stageId:'won',count:1}],id=>id.toUpperCase());
 expect(rows.map(r=>[r.name,r.leads,r.reached,r.rate])).toEqual([['NEW',6,10,100],['FOLLOWED_UP',3,4,40],['WON',1,1,10]]);
 expect(funnelRows(stages,[],id=>id).every(r=>r.rate===0)).toBe(true);
});
