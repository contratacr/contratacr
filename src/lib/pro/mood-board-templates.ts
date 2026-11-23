import {z} from 'zod';
import {MOOD_MAX_ELEMENTS,MOOD_NAME_MAX,moodElementInputSchema,moodHexSchema,moodPageFormats,type MoodDraftElement,type MoodElementInput} from './mood-boards';

/**
 * Row 61: page templates for the idea boards. A template keeps only the LAYOUT of a page (color swatches, notes,
 * free text, arrows and drawings): photos and catalog items belong to one job and are never stored in a template.
 * The built-in starters (kitchen, bathroom, living, palette) live in round12.ts and are applied when a board is created; the owner's own templates are stored by migration 423.
 */
export const MOOD_MAX_TEMPLATES=50;
const uuid=z.string().uuid();
/** Element kinds a template may hold. */
export const templateElementKinds=['swatch','note','text','arrow','drawing'] as const;
export type TemplateElement=Extract<MoodElementInput,{kind:typeof templateElementKinds[number]}>;
export const isTemplateElement=(element:{kind:string}):boolean=>(templateElementKinds as readonly string[]).includes(element.kind);

export const savedMoodTemplateSchema=z.object({
 id:uuid,name:z.string().min(1).max(MOOD_NAME_MAX),pageFormat:z.enum(moodPageFormats),background:moodHexSchema,
 elements:z.array(moodElementInputSchema).max(MOOD_MAX_ELEMENTS),revision:z.number().int().positive(),updatedAt:z.string(),
}).strict();
export type SavedMoodTemplate=z.infer<typeof savedMoodTemplateSchema>;
export const moodTemplateListSchema=z.object({items:z.array(savedMoodTemplateSchema).max(MOOD_MAX_TEMPLATES)}).strict();
const base={actionId:uuid,id:uuid};
export const moodTemplateMutationSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('create'),...base,name:z.string().trim().min(1).max(MOOD_NAME_MAX),pageFormat:z.enum(moodPageFormats),background:moodHexSchema,elements:z.array(moodElementInputSchema).max(MOOD_MAX_ELEMENTS)}).strict(),
 z.object({action:z.literal('rename'),...base,revision:z.number().int().positive().max(2147483646),name:z.string().trim().min(1).max(MOOD_NAME_MAX)}).strict(),
 z.object({action:z.literal('archive'),...base,revision:z.number().int().positive().max(2147483646)}).strict(),
]).superRefine((value,context)=>{if(value.action==='create'&&(value.elements.some(element=>!isTemplateElement(element))||new Set(value.elements.map(element=>element.id)).size!==value.elements.length))context.addIssue({code:'custom',message:'Template elements.'});});
export type MoodTemplateMutation=z.infer<typeof moodTemplateMutationSchema>;
export const moodTemplateResultSchema=z.object({template:savedMoodTemplateSchema}).strict();

/** What «Guardar como plantilla» keeps from a page: the layout without photos or items. */
export function templateFromPage(page:{background:string;elements:readonly MoodDraftElement[]},toInput:(element:MoodDraftElement)=>MoodElementInput):{background:string;elements:TemplateElement[];dropped:number}{
 const kept:TemplateElement[]=[];let dropped=0;
 for(const element of page.elements){if(element.kind==='image'||element.kind==='product'){dropped++;continue;}kept.push(toInput(element) as TemplateElement);}
 return {background:page.background,elements:kept,dropped};
}
/** A template applied to a page: fresh element ids so the same template can be applied again and again. */
export function elementsFromTemplate(template:{elements:readonly MoodElementInput[]},newId:()=>string=()=>crypto.randomUUID()):MoodDraftElement[]{
 return template.elements.filter(isTemplateElement).map(element=>({...element,id:newId()}) as MoodDraftElement);
}
