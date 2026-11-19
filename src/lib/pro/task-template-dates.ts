import {taskDueDate} from './work-tasks';
const civil=taskDueDate.unwrap();
/** A civil job start already names a CR day. Convert only explicit zoned instants. */
export function taskTemplateJobStartDate(value:string,fallbackCivil:string){
 const fallback=civil.parse(fallbackCivil),source=value.trim();
 if(civil.safeParse(source).success)return source;
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(source)||!civil.safeParse(source.slice(0,10)).success)return fallback;
 const instant=new Date(source);if(!Number.isFinite(instant.getTime()))return fallback;
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'America/Costa_Rica',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(instant).map(part=>[part.type,part.value]));
 const result=parts.year+'-'+parts.month+'-'+parts.day;return civil.safeParse(result).success?result:fallback;
}
