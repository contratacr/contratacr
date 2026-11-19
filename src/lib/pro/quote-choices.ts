import {z} from 'zod';
import {quoteTotals,type QuoteItem,type QuoteTaxMode} from '../quotes';
export const choiceLineSchema=z.object({id:z.string().uuid(),description:z.string().trim().min(1).max(140),quantity:z.number().positive().max(9999).multipleOf(0.01),unit_price:z.number().int().min(0).max(100000000)}).strict();
const operation={quoteId:z.string().uuid(),actionId:z.string().uuid(),revision:z.number().int().nonnegative()};
export const quoteChoiceMutationSchema=z.discriminatedUnion('action',[
 z.object({...operation,action:z.literal('configure'),extras:z.array(choiceLineSchema).min(1).max(10)}).strict(),
 z.object({...operation,action:z.literal('accept'),selected:z.array(z.string().uuid()).max(10)}).strict(),
 z.object({...operation,action:z.literal('decline')}).strict(),
]).superRefine((value,ctx)=>{const ids=value.action==='configure'?value.extras.map(r=>r.id):value.action==='accept'?value.selected:[];if(new Set(ids).size!==ids.length)ctx.addIssue({code:'custom',path:['extras'],message:'No repita un complemento.'});});
export type ChoiceLine=z.infer<typeof choiceLineSchema>;
export type QuoteChoiceState={quoteId:string;title:string;status:string;revision:number;version:number;side:'provider'|'client';canConfigure:boolean;linked:boolean;configured:boolean;taxMode:QuoteTaxMode;baseItems:QuoteItem[];extras:ChoiceLine[];selected:string[];subtotal:number;taxAmount:number;total:number;events:{position:number;action:string;version:number;at:string;selected:string[];total:number}[];nextCursor:number|null};
export type QuoteChoicePage={items:{kind?:'ordinary'|'extras';quoteId:string;title:string;status:string;version:number;total:number;professionalName:string}[];nextCursor:string|null};
export function selectedQuoteTotals(state:Pick<QuoteChoiceState,'baseItems'|'extras'|'taxMode'>,selected:string[]){return quoteTotals([...state.baseItems,...state.extras.filter(row=>selected.includes(row.id)).map(({description,quantity,unit_price})=>({description,quantity,unit_price}))],state.taxMode);}
