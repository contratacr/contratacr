import {z} from 'zod';

/**
 * Leads area: contact form builder. One form per company. The configuration is validated here (API and screen share it);
 * the public page validates a submission against the same configuration, and SQL stores it.
 */
export const contactFormBuiltinIds=['name','email','phone','zip','address','message'] as const;
export type ContactFormBuiltinId=typeof contactFormBuiltinIds[number];
export const contactFormQuestionTypes=['short','long','single','multiple'] as const;
export type ContactFormQuestionType=typeof contactFormQuestionTypes[number];
export const contactFormLimits={questions:10,options:10,label:120,option:60,confirmation:500,shortAnswer:200,longAnswer:2000} as const;
const uuid=z.string().uuid();
const clean=(max:number)=>z.string().trim().max(max).refine(v=>!/[\u0000-\u0008\u000b-\u001f\u007f]/.test(v));
const questionSchema=z.object({
 id:uuid,label:clean(contactFormLimits.label).min(1),type:z.enum(contactFormQuestionTypes),required:z.boolean(),
 options:z.array(clean(contactFormLimits.option).min(1)).max(contactFormLimits.options),
}).strict().refine(q=>q.type==='single'||q.type==='multiple'?q.options.length>=2&&new Set(q.options.map(o=>o.toLowerCase())).size===q.options.length:q.options.length===0);
export const contactFormConfigSchema=z.object({
 labels:z.record(z.enum(contactFormBuiltinIds),clean(60)),
 zip:z.object({show:z.boolean(),required:z.boolean()}).strict(),
 address:z.object({show:z.boolean(),required:z.boolean()}).strict(),
 questions:z.array(questionSchema).max(contactFormLimits.questions),
 order:z.array(z.string().max(40)).max(contactFormBuiltinIds.length+contactFormLimits.questions),
 confirmation:clean(contactFormLimits.confirmation).min(1),
}).strict().superRefine((v,ctx)=>{
 const expected=[...contactFormBuiltinIds,...v.questions.map(q=>q.id)];
 if(v.order.length!==expected.length||!expected.every(id=>v.order.includes(id))||new Set(v.order).size!==v.order.length)ctx.addIssue({code:'custom',message:'order'});
 if(new Set(v.questions.map(q=>q.id)).size!==v.questions.length)ctx.addIssue({code:'custom',message:'questions'});
});
export type ContactFormConfig=z.infer<typeof contactFormConfigSchema>;
export type ContactFormQuestion=z.infer<typeof questionSchema>;

export const defaultContactFormLabels={
 es:{name:'Nombre',email:'Correo electrónico',phone:'Teléfono',zip:'Código postal',address:'Dirección',message:'Mensaje'},
 en:{name:'Name',email:'Email',phone:'Phone',zip:'Zip code',address:'Address',message:'Message'},
} as const;
export const defaultContactFormConfirmation={
 es:'Gracias por escribirnos. Recibimos sus datos y le responderemos muy pronto.',
 en:'Thank you for writing to us. We received your details and will get back to you very soon.',
} as const;
export function defaultContactFormConfig(language:'es'|'en'):ContactFormConfig{
 return {labels:{...defaultContactFormLabels[language]},zip:{show:true,required:false},address:{show:false,required:false},questions:[],order:[...contactFormBuiltinIds],confirmation:defaultContactFormConfirmation[language]};
}
/** The label shown for a built-in field (the owner can rename it; an empty label falls back to the default). */
export const contactFormLabel=(config:ContactFormConfig,id:ContactFormBuiltinId,language:'es'|'en')=>config.labels[id]?.trim()||defaultContactFormLabels[language][id];
/** Fields in display order, hiding the optional ones that are turned off. */
export function contactFormVisibleOrder(config:ContactFormConfig){return config.order.filter(id=>!(id==='zip'&&!config.zip.show)&&!(id==='address'&&!config.address.show));}

export const contactFormRecordSchema=z.object({
 publicId:uuid,status:z.enum(['draft','published']),config:contactFormConfigSchema,revision:z.number().int().positive(),
 publishedAt:z.string().nullable(),updatedAt:z.string(),submissions:z.number().int().nonnegative(),
}).strict();
export type ContactFormRecord=z.infer<typeof contactFormRecordSchema>;
export const contactFormReadSchema=z.object({form:contactFormRecordSchema.nullable()}).strict();
export const contactFormMutationSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('save'),revision:z.number().int().nonnegative().max(2147483646),config:contactFormConfigSchema}).strict(),
 z.object({action:z.enum(['publish','unpublish']),revision:z.number().int().positive().max(2147483646)}).strict(),
]);
export const contactFormPublicSchema=z.object({config:contactFormConfigSchema,business:z.string().max(200)}).strict();
export const contactFormAnswersSchema=z.object({answers:z.array(z.object({label:z.string().max(200),value:z.string().max(2200)}).strict()).max(20).nullable(),receivedAt:z.string().optional()}).strict();

export const contactFormSubmissionSchema=z.object({
 id:uuid,submissionId:uuid,consent:z.literal(true),website:z.string().max(200),
 answers:z.record(z.string().max(40),z.union([z.string().max(2200),z.array(z.string().max(contactFormLimits.option)).max(contactFormLimits.options)])),
}).strict();
export type ContactFormErrorKey='required'|'email'|'phone'|'choice'|'long';
export type ContactFormValidation={ok:true;values:Record<string,string|string[]>}|{ok:false;errors:Record<string,ContactFormErrorKey>};
const emailRe=/^[^@\s]+@[^@\s]+\.[^@\s]+$/;
/** Validates the answers of a submission against the configuration. Pure: used by the page (to show errors) and the API (to enforce). */
export function validateContactFormAnswers(config:ContactFormConfig,answers:Record<string,string|string[]>):ContactFormValidation{
 const errors:Record<string,ContactFormErrorKey>={},values:Record<string,string|string[]>={};
 const text=(id:string)=>{const v=answers[id];return typeof v==='string'?v.trim():'';};
 const need=(id:string,max:number,kind?:'email'|'phone')=>{const v=text(id);if(!v){errors[id]='required';return;}if(v.length>max){errors[id]='long';return;}
  if(kind==='email'&&(v.length>254||!emailRe.test(v)))errors[id]='email';
  if(kind==='phone'&&(v.length>30||!/^[+0-9 ().-]+$/.test(v)||v.replace(/[^0-9]/g,'').length<8||v.replace(/[^0-9]/g,'').length>15))errors[id]='phone';
  values[id]=v;};
 need('name',120);need('email',254,'email');need('phone',30,'phone');need('message',contactFormLimits.longAnswer);
 for(const [id,max] of [['zip',10],['address',300]] as const){
  if(!config[id].show)continue;const v=text(id);
  if(!v){if(config[id].required)errors[id]='required';continue;}
  if(v.length>max)errors[id]='long';else values[id]=v;
 }
 for(const q of config.questions){
  if(q.type==='multiple'){const raw=answers[q.id],list=Array.isArray(raw)?raw.map(x=>x.trim()).filter(Boolean):[];
   if(!list.length){if(q.required)errors[q.id]='required';continue;}
   if(!list.every(x=>q.options.includes(x))||new Set(list).size!==list.length){errors[q.id]='choice';continue;}values[q.id]=list;continue;}
  const v=text(q.id);
  if(!v){if(q.required)errors[q.id]='required';continue;}
  if(q.type==='single'){if(!q.options.includes(v))errors[q.id]='choice';else values[q.id]=v;continue;}
  if(v.length>(q.type==='short'?contactFormLimits.shortAnswer:contactFormLimits.longAnswer))errors[q.id]='long';else values[q.id]=v;
 }
 return Object.keys(errors).length?{ok:false,errors}:{ok:true,values};
}
/** Readable answers stored with the lead (label at the time of sending, so later edits do not rewrite history). */
export function contactFormReadableAnswers(config:ContactFormConfig,values:Record<string,string|string[]>,language:'es'|'en'){
 const out:{label:string;value:string}[]=[];
 for(const id of config.order){const v=values[id];if(v===undefined||id==='name'||id==='email'||id==='phone')continue;
  const label=(contactFormBuiltinIds as readonly string[]).includes(id)?contactFormLabel(config,id as ContactFormBuiltinId,language):config.questions.find(q=>q.id===id)?.label??id;
  out.push({label:label.slice(0,200),value:(Array.isArray(v)?v.join(', '):v).slice(0,2200)});}
 return out;
}
