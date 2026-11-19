import {z} from 'zod';
export const recurrenceDay=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value=>{const d=new Date(value+'T00:00:00Z');return value>='0001-01-01'&&Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===value;},'Fecha inválida');
const revision=z.number().int().nonnegative();
export const invoiceRecurrenceMutation=z.discriminatedUnion('action',[
 z.object({action:z.literal('template'),requestId:z.string().uuid(),id:z.string().uuid(),revision,name:z.string().trim().min(1).max(160),sourceDraftId:z.string().uuid(),sourceRevision:z.number().int().positive(),frequency:z.enum(['weekly','monthly']),startDate:recurrenceDay,paused:z.boolean()}),
 z.object({action:z.literal('generate'),requestId:z.string().uuid(),templateId:z.string().uuid(),revision,date:recurrenceDay}),
]);
export type InvoiceRecurrence={id:string;name:string;sourceDraftId:string;sourceRevision:number;frequency:'weekly'|'monthly';startDate:string;paused:boolean;revision:number;sourceTitle:string;currentSourceRevision:number;sourceArchived:boolean};
export type RecurrenceOccurrence={date:string;draftId:string};
export type InvoiceRecurrencePage={items:InvoiceRecurrence[];nextCursor:string|null;template?:InvoiceRecurrence|null;occurrences?:RecurrenceOccurrence[];today:string;horizon:string};
function parse(value:string){return new Date(recurrenceDay.parse(value)+'T00:00:00Z');}
function monthDate(start:Date,offset:number){const year=start.getUTCFullYear(),month=start.getUTCMonth()+offset;const first=new Date(0);first.setUTCFullYear(year,month,1);first.setUTCHours(0,0,0,0);const end=new Date(first);end.setUTCMonth(end.getUTCMonth()+1);end.setUTCDate(0);first.setUTCDate(Math.min(start.getUTCDate(),end.getUTCDate()));return first.toISOString().slice(0,10);}
/** Monthly dates always anchor to the original day, clamping only that month. */
export function recurrenceDate(start:string,frequency:'weekly'|'monthly',index:number):string{if(!Number.isSafeInteger(index)||index<0||index>520000)throw Error('Índice inválido');const d=parse(start);if(frequency==='monthly')return monthDate(d,index);d.setUTCDate(d.getUTCDate()+7*index);return d.toISOString().slice(0,10);}
export function recurrenceMatches(start:string,frequency:'weekly'|'monthly',date:string):boolean{if(!recurrenceDay.safeParse(start).success||!recurrenceDay.safeParse(date).success)return false;const a=parse(start),b=parse(date);if(date<start)return false;const index=frequency==='weekly'?(b.getTime()-a.getTime())/604800000:(b.getUTCFullYear()-a.getUTCFullYear())*12+b.getUTCMonth()-a.getUTCMonth();return Number.isInteger(index)&&recurrenceDate(start,frequency,index)===date;}
export function nextRecurrenceDates(start:string,frequency:'weekly'|'monthly',from:string,count=6):string[]{const a=parse(start),b=parse(from);let index=Math.max(0,frequency==='weekly'?Math.ceil((b.getTime()-a.getTime())/604800000):(b.getUTCFullYear()-a.getUTCFullYear())*12+b.getUTCMonth()-a.getUTCMonth());const result:string[]=[];for(let n=0;n<Math.min(count,24)+1;n++){const day=recurrenceDate(start,frequency,index++);if(day>=from)result.push(day);if(result.length>=Math.min(count,24))break;}return result;}
