import type {z} from 'zod';
import {aiExpenseOutputSchema,aiMeetingOutputSchema,aiTakeoffOutputSchema,aiTextOutputSchema,type AiFeature} from './features';

/**
 * Round 6C: every provider answer is validated again with zod (whatever the provider says it returned) and
 * links are removed from free text: drafts never need them and a link is the typical injection payload.
 * Anything that does not validate is discarded (the suggestion is stored as failed, nothing is shown).
 */
/** Links in model output are dropped (drafts never need them; a link is the typical injection payload). */
export const stripLinks=(text:string)=>text.replace(/\b(?:https?:\/\/|www\.)\S+/gi,'').replace(/[ \t]{2,}/g,' ').trim();
/** Costa Rican amounts as providers write them: «₡12.500,00», «12 500», «12,500.50», «CRC 1.250,5». Null when ambiguous or not positive. */
export function parseCrAmount(value:unknown):number|null{
 if(typeof value==='number')return Number.isFinite(value)&&value>0?value:null;
 if(typeof value!=='string')return null;
 const raw=value.replace(/₡|crc|colones?|\s/gi,'');if(!/^\d[\d.,]*$/.test(raw))return null;
 const dot=raw.lastIndexOf('.'),comma=raw.lastIndexOf(','),last=Math.max(dot,comma);let text=raw;
 if(last>=0){const decimals=raw.length-last-1;
  // The last separator is decimal when followed by 1-2 digits, or by 3 digits only if the other separator type also appears.
  const decimal=decimals>=1&&decimals<=2||decimals===3&&dot>=0&&comma>=0;
  text=decimal?raw.slice(0,last).replace(/[.,]/g,'')+'.'+raw.slice(last+1):raw.replace(/[.,]/g,'');}
 const number=Number(text);return Number.isFinite(number)&&number>0?number:null;
}
/** «31/12/2026», «31-12-26», «2026-12-31» to ISO; invalid calendar days are null. */
export function parseCrDate(value:unknown):string|null{
 if(typeof value!=='string')return null;const text=value.trim();let y:number,m:number,d:number;
 const iso=text.match(/^(\d{4})-(\d{2})-(\d{2})$/),cr=text.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/);
 if(iso){y=+iso[1]!;m=+iso[2]!;d=+iso[3]!;}else if(cr){d=+cr[1]!;m=+cr[2]!;y=+cr[3]!;if(cr[3]!.length===2)y+=2000;}else return null;
 const date=new Date(Date.UTC(y,m-1,d));return date.getUTCFullYear()===y&&date.getUTCMonth()===m-1&&date.getUTCDate()===d?`${String(y).padStart(4,'0')}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`:null;
}
/** VAT as «13», «13%», 0.13, 1300 to basis points; only the Costa Rican rates are accepted. */
export function parseVatBps(value:unknown):1300|400|200|100|50|null{
 const number=typeof value==='string'?Number(value.replace('%','').replace(',','.').trim()):typeof value==='number'?value:NaN;if(!Number.isFinite(number)||number<=0)return null;
 const bps=typeof value==='number'&&number<1?number*10000:number<=100?number*100:number;const rounded=Math.round(bps);
 return rounded===1300||rounded===400||rounded===200||rounded===100||rounded===50?rounded:null;
}
const methodWords:[RegExp,string][]=[[/sinpe/i,'sinpe'],[/tarjeta|card|cr[eé]dito|d[eé]bito/i,'card'],[/efectivo|cash/i,'cash'],[/transfer/i,'transfer']];
/** Deterministic cleanup of an expense answer before zod: lenient provider formats become the strict shape; anything unreadable becomes null (never a guess). */
export function normalizeExpenseOutput(output:unknown):unknown{
 if(!output||typeof output!=='object'||Array.isArray(output))return output;
 const o={...(output as Record<string,unknown>)},method=typeof o.paymentMethod==='string'?methodWords.find(([re])=>re.test(o.paymentMethod as string))?.[1]??(['sinpe','card','cash','transfer','check','other'].includes(o.paymentMethod)?o.paymentMethod:null):o.paymentMethod;
 if('totalAmount' in o)o.totalAmount=o.totalAmount===null?null:parseCrAmount(o.totalAmount);
 if('vatAmount' in o&&o.vatAmount!==null){const v=typeof o.vatAmount==='number'?o.vatAmount:parseCrAmount(o.vatAmount);o.vatAmount=v!==null&&v>=0?v:null;}
 if('date' in o)o.date=o.date===null?null:parseCrDate(o.date);
 if('vatRateBps' in o)o.vatRateBps=o.vatRateBps===null?null:parseVatBps(o.vatRateBps);
 if('paymentMethod' in o)o.paymentMethod=method;
 return o;
}
export function validateOutput(feature:AiFeature,output:unknown):Record<string,unknown>|null{
 if(feature==='expense_receipt'||feature==='expense_voice')output=normalizeExpenseOutput(output);
 const schema:z.ZodTypeAny=feature==='takeoff'?aiTakeoffOutputSchema:feature==='expense_receipt'||feature==='expense_voice'?aiExpenseOutputSchema:feature==='meeting'?aiMeetingOutputSchema:aiTextOutputSchema;
 const parsed=schema.safeParse(output);if(!parsed.success)return null;
 const value=parsed.data as Record<string,unknown>;
 if(typeof value.text==='string'){const text=stripLinks(value.text);return text?{text}:null;}
 if(typeof value.summary==='string')return {...value,summary:stripLinks(value.summary)};
 return value;
}
