import type {z} from 'zod';
import {aiExpenseOutputSchema,aiMeetingOutputSchema,aiTakeoffOutputSchema,aiTextOutputSchema,type AiFeature} from './features';

/**
 * Round 6C: every provider answer is validated again with zod (whatever the provider says it returned) and
 * links are removed from free text: drafts never need them and a link is the typical injection payload.
 * Anything that does not validate is discarded (the suggestion is stored as failed, nothing is shown).
 */
/** Links in model output are dropped (drafts never need them; a link is the typical injection payload). */
export const stripLinks=(text:string)=>text.replace(/\b(?:https?:\/\/|www\.)\S+/gi,'').replace(/[ \t]{2,}/g,' ').trim();
export function validateOutput(feature:AiFeature,output:unknown):Record<string,unknown>|null{
 const schema:z.ZodTypeAny=feature==='takeoff'?aiTakeoffOutputSchema:feature==='expense_receipt'||feature==='expense_voice'?aiExpenseOutputSchema:feature==='meeting'?aiMeetingOutputSchema:aiTextOutputSchema;
 const parsed=schema.safeParse(output);if(!parsed.success)return null;
 const value=parsed.data as Record<string,unknown>;
 if(typeof value.text==='string'){const text=stripLinks(value.text);return text?{text}:null;}
 if(typeof value.summary==='string')return {...value,summary:stripLinks(value.summary)};
 return value;
}
