import {z} from 'zod';
/** Round 7C: Daily Log («Bitácora») fields beside each entry, and the customer view. */
export const workJournalEntrySchema=z.object({clientVisible:z.boolean(),crewCount:z.number().int().min(0).max(500).nullable(),crewMinutes:z.number().int().min(0).max(600000).nullable(),fromUpdate:z.boolean(),revision:z.number().int().positive()});
export const workJournalSchema=z.object({workId:z.string(),entries:z.record(z.string(),workJournalEntrySchema),visibleCount:z.number().int().nonnegative(),migratedUpdates:z.number().int().nonnegative()});
export const workJournalMutationSchema=z.object({action:z.literal('journal_set'),actionId:z.string().uuid(),workId:z.string().min(1).max(160),logId:z.string().uuid(),revision:z.number().int().positive(),clientVisible:z.boolean(),crewCount:z.number().int().min(0).max(500).nullable(),crewMinutes:z.number().int().min(0).max(600000).nullable()}).strict();
export const clientJournalSchema=z.object({workId:z.string(),items:z.array(z.object({id:z.string().uuid(),date:z.string(),title:z.string(),notes:z.string(),weather:z.unknown().nullable(),crewCount:z.number().int().nullable(),crewMinutes:z.number().int().nullable(),fromUpdate:z.boolean(),photos:z.array(z.object({id:z.string().uuid(),name:z.string()}))}))});
export type ClientJournal=z.infer<typeof clientJournalSchema>;
/** «3 personas · 12,5 h» */
export function crewSummary(count:number|null,minutes:number|null,en:boolean){const parts:string[]=[];if(count!==null)parts.push(new Intl.NumberFormat(en?'en-US':'es-CR').format(count)+' '+(en?(count===1?'person':'people'):(count===1?'persona':'personas')));if(minutes!==null)parts.push(new Intl.NumberFormat(en?'en-US':'es-CR',{maximumFractionDigits:2}).format(minutes/60)+' h');return parts.join(' · ');}
