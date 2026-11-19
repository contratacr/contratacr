/** Display-only hints. Missing optional metadata stays missing in persisted choices. */
export function privateEstimateDestinationCopyDate(value:string,english:boolean,includeTime=false):string|null{
 const match=/^(\d{4})-(\d{2})-(\d{2})(.*)$/.exec(value);if(!match)return null;
 const civil=match[1]+'-'+match[2]+'-'+match[3],day=new Date(civil+'T12:00:00Z');
 if(!Number.isFinite(day.getTime())||day.toISOString().slice(0,10)!==civil)return null;
 let instant:string;
 if(match[4]==='')instant=civil+'T12:00:00-06:00';
 else if(/^T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?$/.test(match[4]))instant=value+'-06:00';
 else if(/^T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(match[4]))instant=value;
 else return null;
 if(match[4]!==''&&(Number(value.slice(11,13))>23||Number(value.slice(14,16))>59||/^:\d{2}/.test(value.slice(16))&&Number(value.slice(17,19))>59))return null;
 const date=new Date(instant);if(!Number.isFinite(date.getTime()))return null;
 return new Intl.DateTimeFormat(english?'en-US':'es-CR',{dateStyle:'medium',...(includeTime&&match[4]!==''?{timeStyle:'short' as const}:{}),timeZone:'America/Costa_Rica'}).format(date);
}
export function privateEstimateDestinationCopyHint(row:{date?:string|null;hasLinkedWork?:boolean},kind:'client'|'work'|'manual',english:boolean):string|null{
 if(kind==='client')return null;
 const date=typeof row.date==='string'?privateEstimateDestinationCopyDate(row.date,english,kind==='work'):null;
 if(kind==='work')return row.date===null?(english?'No date':'Sin fecha'):date;
 const parts:string[]=[];
 if(row.hasLinkedWork===true)parts.push(english?'Linked job':'Con trabajo asociado');
 else if(row.hasLinkedWork===false)parts.push(english?'No linked job':'Sin trabajo asociado');
 if(date)parts.push((english?'Created ':'Creada el ')+date);
 return parts.length?parts.join(' · '):null;
}
