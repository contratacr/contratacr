/** Number of parts of a template row: records of a category, tasks of a task template, phases + tasks + milestones of a plan, lines of a service package. */
export function templatePartCount(row:{recordCount?:unknown;count?:unknown;phaseCount?:unknown;taskCount?:unknown;milestoneCount?:unknown;lines?:unknown}){
 if(typeof row.recordCount==='number')return row.recordCount;
 if(typeof row.count==='number')return row.count;
 if(typeof row.phaseCount==='number'&&typeof row.taskCount==='number'&&typeof row.milestoneCount==='number')return row.phaseCount+row.taskCount+row.milestoneCount;
 if(Array.isArray(row.lines))return row.lines.length;
 return undefined;
}
