import {z} from 'zod';

/**
 * Row 67: record of the HUMAN review of an AI plan reading, plus the evaluation of the proposal against manual
 * measurements. Pure helpers shared by the route, the component and the unit spec.
 */
const row=z.object({name:z.string().trim().min(1).max(120),kind:z.enum(['area','length','count']),quantity:z.string().regex(/^\d{1,9}(\.\d{1,3})?$/)}).strict();
export const takeoffReviewSchema=z.object({
 suggestionId:z.string().uuid(),planId:z.string().uuid(),outcome:z.enum(['accepted','discarded']),
 rows:z.array(z.object({index:z.number().int().min(0).max(29),include:z.boolean(),proposed:row,saved:row.nullable()}).strict()).max(30),
}).strict().superRefine((value,context)=>{
 const accepted=value.rows.filter(item=>item.include);
 if((value.outcome==='accepted')!==(accepted.length>0))context.addIssue({code:'custom',message:'outcome'});
 if(value.rows.some(item=>item.include!==(item.saved!==null)))context.addIssue({code:'custom',message:'saved'});
});
export type TakeoffReview=z.infer<typeof takeoffReviewSchema>;
/** Quantities are normalized to a dot-decimal string with at most three decimals. */
export const reviewQuantity=(value:number|string)=>{const n=typeof value==='number'?value:Number(String(value).trim().replace(',','.'));return (Math.round(n*1000)/1000).toString();};
export type EvalItem={name:string;kind:'area'|'length'|'count';quantity:number};
export type EvalReport={matched:number;missing:string[];extra:string[];meanRelativeError:number|null;worstRelativeError:number|null;perItem:{name:string;kind:string;reference:number;proposed:number;relativeError:number}[]};
/**
 * Compares a proposal with manual reference measurements. Items are matched by kind and a normalized name
 * (case/accents/spaces insensitive). Relative error = |proposed - reference| / reference.
 */
export function evaluateTakeoff(reference:EvalItem[],proposed:EvalItem[]):EvalReport{
 const norm=(text:string)=>text.normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
 const used=new Set<number>(),perItem:EvalReport['perItem']=[],missing:string[]=[];
 for(const ref of reference){
  const at=proposed.findIndex((item,index)=>!used.has(index)&&item.kind===ref.kind&&norm(item.name)===norm(ref.name));
  if(at<0){missing.push(ref.name);continue;}
  used.add(at);const value=proposed[at]!.quantity;
  perItem.push({name:ref.name,kind:ref.kind,reference:ref.quantity,proposed:value,relativeError:ref.quantity>0?Math.abs(value-ref.quantity)/ref.quantity:value===0?0:1});
 }
 const errors=perItem.map(item=>item.relativeError);
 return {matched:perItem.length,missing,extra:proposed.filter((_,index)=>!used.has(index)).map(item=>item.name),
  meanRelativeError:errors.length?errors.reduce((s,v)=>s+v,0)/errors.length:null,worstRelativeError:errors.length?Math.max(...errors):null,perItem};
}
