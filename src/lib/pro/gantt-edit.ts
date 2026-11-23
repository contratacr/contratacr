// Gap 13 (Houzz parity): pure date math of the editable job Gantt (Cronograma).
// Civil dates only (YYYY-MM-DD, Costa Rica); never converted through the browser timezone.
// Self-contained (no imports) so `node --test scripts/pro/gantt-edit.test.mjs` can load it directly.

export type GanttEditMode='move'|'start'|'end';
export type GanttPeriod={start:string;end:string};
export type GanttDependencyTask={id:string;plannedStart:string|null;plannedEnd:string|null;dependsOn:readonly string[]};

const MIN='1900-01-01',MAX='2100-12-31',DAY=86400000;
const index=(day:string)=>Math.round(Date.parse(day+'T00:00:00Z')/DAY);
const fromIndex=(n:number)=>new Date(n*DAY).toISOString().slice(0,10);

/** True for a real civil date between 1900-01-01 and 2100-12-31. */
export function isCivilDay(value:string){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;const time=Date.parse(value+'T00:00:00Z');
 return Number.isFinite(time)&&new Date(time).toISOString().slice(0,10)===value&&value>=MIN&&value<=MAX;
}
/** Signed whole days from `from` to `to`. */
export function civilDayDiff(from:string,to:string){return index(to)-index(from);}
export function civilAddDays(day:string,days:number){return fromIndex(index(day)+days);}

/**
 * New period after moving (`move`) or resizing one edge (`start`/`end`) by `delta` days.
 * A move keeps the duration and stays inside 1900–2100; a resize never crosses the other edge
 * (the shortest task lasts one day).
 */
export function shiftPeriod(start:string,end:string,mode:GanttEditMode,delta:number):GanttPeriod{
 const a=index(start),b=index(end),min=index(MIN),max=index(MAX),d=Math.trunc(delta)||0;
 if(mode==='move'){const shift=Math.max(min-a,Math.min(max-b,d));return{start:fromIndex(a+shift),end:fromIndex(b+shift)};}
 if(mode==='start')return{start:fromIndex(Math.max(min,Math.min(b,a+d))),end};
 return{start,end:fromIndex(Math.min(max,Math.max(a,b+d)))};
}

/** Whole days for a horizontal pointer displacement (no negative zero). */
export function daysFromPixels(dx:number,dayWidth:number){if(!(dayWidth>0)||!Number.isFinite(dx))return 0;const n=Math.round(dx/dayWidth);return n===0?0:n;}

/**
 * Keyboard alternative to dragging a focused bar:
 * ←/→ move one day, Shift+←/→ change the end, Alt+←/→ change the start.
 */
export function keyEdit(key:string,mods:{shiftKey?:boolean;altKey?:boolean}):{mode:GanttEditMode;delta:number}|null{
 if(key!=='ArrowLeft'&&key!=='ArrowRight')return null;
 return{mode:mods.shiftKey?'end':mods.altKey?'start':'move',delta:key==='ArrowLeft'?-1:1};
}

/**
 * Finish-to-start rule of the plan: a task must start after each predecessor ends.
 * Returns the predecessors that would end on/after the new start and the successors
 * that would start on/before the new end.
 */
export function dependencyIssues(tasks:readonly GanttDependencyTask[],taskId:string,period:GanttPeriod){
 const byId=new Map(tasks.map(t=>[t.id,t])),self=byId.get(taskId),predecessors:string[]=[],successors:string[]=[];
 for(const id of self?.dependsOn??[]){const p=byId.get(id);if(p?.plannedEnd&&period.start<=p.plannedEnd)predecessors.push(id);}
 for(const t of tasks)if(t.id!==taskId&&t.dependsOn.includes(taskId)&&t.plannedStart&&t.plannedStart<=period.end)successors.push(t.id);
 return{predecessors,successors,blocking:predecessors.length+successors.length>0};
}

/** True when making `predecessorId` a predecessor of `taskId` would close a loop (the predecessor already depends on the task, directly or not). */
export function wouldCreateCycle(tasks:readonly GanttDependencyTask[],predecessorId:string,taskId:string){
 if(predecessorId===taskId)return true;
 const byId=new Map(tasks.map(t=>[t.id,t])),seen=new Set<string>(),stack=[predecessorId];
 while(stack.length){const id=stack.pop()!;if(id===taskId)return true;if(seen.has(id))continue;seen.add(id);for(const dep of byId.get(id)?.dependsOn??[])stack.push(dep);}
 return false;
}

/** Assignee filter: '' = everyone, '__none' = unassigned, otherwise a Team grant id. */
export const UNASSIGNED='__none';
export function matchesAssignee(taskId:string,assignments:Readonly<Record<string,string|null|undefined>>,filter:string){
 if(!filter)return true;const grant=assignments[taskId]??null;return filter===UNASSIGNED?grant===null:grant===filter;
}

/** Undo is only safe while the task still has the dates this session wrote. */
export function undoState(change:{nextStart:string;nextEnd:string},current:{plannedStart:string|null;plannedEnd:string|null}|undefined):'ok'|'missing'|'changed'{
 if(!current)return'missing';return current.plannedStart===change.nextStart&&current.plannedEnd===change.nextEnd?'ok':'changed';
}
