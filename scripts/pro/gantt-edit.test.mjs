// Run: node --test scripts/pro/gantt-edit.test.mjs
// LOCAL PRO ONLY (gap 13, editable Gantt). Pure unit tests of src/lib/pro/gantt-edit.ts, no DB/network.
import test from 'node:test';
import assert from 'node:assert/strict';

const G=await import('../../src/lib/pro/gantt-edit.ts');

test('civil day helpers cross months, leap days and years without timezones',()=>{
 assert.equal(G.civilAddDays('2024-02-28',1),'2024-02-29');assert.equal(G.civilAddDays('2024-02-29',1),'2024-03-01');
 assert.equal(G.civilAddDays('2026-12-31',1),'2027-01-01');assert.equal(G.civilAddDays('2026-03-01',-1),'2026-02-28');
 assert.equal(G.civilDayDiff('2026-11-17','2026-11-24'),7);assert.equal(G.civilDayDiff('2026-11-24','2026-11-17'),-7);
 assert.ok(G.isCivilDay('2024-02-29'));assert.ok(!G.isCivilDay('2023-02-29'));assert.ok(!G.isCivilDay('1899-12-31'));assert.ok(!G.isCivilDay('2101-01-01'));assert.ok(!G.isCivilDay('2026-1-01'));
});

test('move keeps the duration; resizing changes one edge only',()=>{
 assert.deepEqual(G.shiftPeriod('2026-11-17','2026-11-20','move',3),{start:'2026-11-20',end:'2026-11-23'});
 assert.deepEqual(G.shiftPeriod('2026-11-17','2026-11-20','move',-17),{start:'2026-10-31',end:'2026-11-03'});
 assert.deepEqual(G.shiftPeriod('2026-11-17','2026-11-20','end',2),{start:'2026-11-17',end:'2026-11-22'});
 assert.deepEqual(G.shiftPeriod('2026-11-17','2026-11-20','start',-1),{start:'2026-11-16',end:'2026-11-20'});
});

test('a resize never crosses the other edge (one-day minimum) and moves stay inside 1900–2100',()=>{
 assert.deepEqual(G.shiftPeriod('2026-11-17','2026-11-20','end',-10),{start:'2026-11-17',end:'2026-11-17'});
 assert.deepEqual(G.shiftPeriod('2026-11-17','2026-11-20','start',10),{start:'2026-11-20',end:'2026-11-20'});
 assert.deepEqual(G.shiftPeriod('2100-12-30','2100-12-31','move',5),{start:'2100-12-30',end:'2100-12-31'});
 assert.deepEqual(G.shiftPeriod('1900-01-01','1900-01-03','move',-4),{start:'1900-01-01',end:'1900-01-03'});
 assert.deepEqual(G.shiftPeriod('1900-01-02','1900-01-03','start',-9),{start:'1900-01-01',end:'1900-01-03'});
 assert.deepEqual(G.shiftPeriod('2026-11-17','2026-11-20','move',1.7),{start:'2026-11-18',end:'2026-11-21'},'fractional deltas are truncated');
});

test('pixels become whole days and keys map to move/resize',()=>{
 assert.equal(G.daysFromPixels(47,32),1);assert.equal(G.daysFromPixels(15,32),0);assert.ok(Object.is(G.daysFromPixels(-10,32),0));assert.equal(G.daysFromPixels(-50,32),-2);assert.equal(G.daysFromPixels(30,0),0);assert.equal(G.daysFromPixels(Number.NaN,32),0);
 assert.deepEqual(G.keyEdit('ArrowRight',{}),{mode:'move',delta:1});assert.deepEqual(G.keyEdit('ArrowLeft',{shiftKey:true}),{mode:'end',delta:-1});
 assert.deepEqual(G.keyEdit('ArrowRight',{altKey:true}),{mode:'start',delta:1});assert.equal(G.keyEdit('Enter',{}),null);
});

test('dependency issues: start after each predecessor ends; successors start after the end',()=>{
 const tasks=[{id:'a',plannedStart:'2026-11-10',plannedEnd:'2026-11-12',dependsOn:[]},{id:'b',plannedStart:'2026-11-13',plannedEnd:'2026-11-15',dependsOn:['a']},{id:'c',plannedStart:'2026-11-16',plannedEnd:'2026-11-18',dependsOn:['b']},{id:'u',plannedStart:null,plannedEnd:null,dependsOn:['b']}];
 assert.deepEqual(G.dependencyIssues(tasks,'b',{start:'2026-11-13',end:'2026-11-15'}),{predecessors:[],successors:[],blocking:false});
 assert.deepEqual(G.dependencyIssues(tasks,'b',{start:'2026-11-12',end:'2026-11-14'}),{predecessors:['a'],successors:[],blocking:true},'same day as the predecessor end is a conflict');
 assert.deepEqual(G.dependencyIssues(tasks,'b',{start:'2026-11-14',end:'2026-11-16'}),{predecessors:[],successors:['c'],blocking:true});
 assert.deepEqual(G.dependencyIssues(tasks,'a',{start:'2026-11-20',end:'2026-11-21'}).successors,['b']);
 assert.equal(G.dependencyIssues(tasks,'missing',{start:'2026-11-01',end:'2026-11-02'}).blocking,false);
});

test('assignee filter and undo safety',()=>{
 const assigned={t1:'g1',t2:null};
 assert.ok(G.matchesAssignee('t1',assigned,''));assert.ok(G.matchesAssignee('t1',assigned,'g1'));assert.ok(!G.matchesAssignee('t2',assigned,'g1'));
 assert.ok(G.matchesAssignee('t2',assigned,G.UNASSIGNED));assert.ok(G.matchesAssignee('t3',assigned,G.UNASSIGNED),'a task without a loaded assignment counts as unassigned');assert.ok(!G.matchesAssignee('t1',assigned,G.UNASSIGNED));
 const change={nextStart:'2026-11-18',nextEnd:'2026-11-20'};
 assert.equal(G.undoState(change,{plannedStart:'2026-11-18',plannedEnd:'2026-11-20'}),'ok');
 assert.equal(G.undoState(change,{plannedStart:'2026-11-19',plannedEnd:'2026-11-20'}),'changed');assert.equal(G.undoState(change,undefined),'missing');
});
