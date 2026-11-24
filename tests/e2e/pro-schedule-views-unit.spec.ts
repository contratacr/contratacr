import {test,expect} from 'playwright/test';
import {addDays,calendarEntries,inRange,matchesStatus,monthGrid,monthStart,shiftMonth,upcomingBounds,upcomingItems} from '../../src/lib/pro/schedule-views';
import type {GanttMilestone,GanttTask} from '../../src/lib/pro/project-schedule';

const task=(id:string,o:Partial<GanttTask>={}):GanttTask=>({id,title:'T'+id,status:'open',revision:1,dueDate:null,phaseId:null,plannedStart:null,plannedEnd:null,dependsOn:[],baselineStart:null,baselineEnd:null,startVarianceDays:null,endVarianceDays:null,...o} as GanttTask);
const key=(id:string,date:string):GanttMilestone=>({id,title:'K'+id,date,notes:'',baselineDate:null,varianceDays:null} as GanttMilestone);

test('month grid starts on Monday and covers whole weeks',()=>{
 const grid=monthGrid('2026-11-01');
 expect(grid[0][0]).toBe('2026-10-26');expect(grid.every(w=>w.length===7)).toBe(true);
 expect(grid.flat()).toContain('2026-11-30');expect(grid.length).toBeGreaterThanOrEqual(4);expect(grid.length).toBeLessThanOrEqual(6);
 expect(shiftMonth('2026-12-01',1)).toBe('2027-01-01');expect(monthStart('2026-11-23')).toBe('2026-11-01');
});
test('calendar spans task periods, adds key dates and honours the filter',()=>{
 const map=calendarEntries([task('1',{plannedStart:'2026-11-02',plannedEnd:'2026-11-04'}),task('2',{plannedStart:'2026-11-03',status:'done'})],[key('a','2026-11-04')],t=>matchesStatus(t,'open'));
 expect(map.get('2026-11-02')?.length).toBe(1);expect(map.get('2026-11-04')?.map(e=>e.kind).sort()).toEqual(['milestone','task']);expect(map.get('2026-11-03')?.length).toBe(1);
});
test('upcoming windows are exclusive: today, rest of week, next week',()=>{
 const today='2026-11-23';// Monday
 const b=upcomingBounds(today);
 expect(b.today).toEqual({from:today,to:today});expect(b.week).toEqual({from:'2026-11-24',to:'2026-11-29'});expect(b.next).toEqual({from:'2026-11-30',to:'2026-12-06'});
 const items=upcomingItems(today,[task('1',{dueDate:'2026-11-23'}),task('2',{plannedStart:'2026-11-25'}),task('3',{dueDate:'2026-12-01'}),task('4',{dueDate:'2026-11-01'}),task('5',{status:'done',dueDate:'2026-11-23'})],[key('k','2026-11-30')]);
 expect(inRange(items,b.today,'all').map(i=>i.id)).toEqual(['1']);
 expect(inRange(items,b.week,'schedule').map(i=>i.id)).toEqual(['2']);
 expect(inRange(items,b.next,'all').map(i=>i.id)).toEqual(['k','3']);
 expect(inRange(items,b.next,'task').map(i=>i.id)).toEqual(['3']);
 expect(addDays('2026-12-31',1)).toBe('2027-01-01');
});
