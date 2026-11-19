import {z} from 'zod';
const text=(max:number)=>z.string().trim().max(max);
export const deliveryContentSchema=z.object({summary:text(2000),checklist:z.array(z.object({label:text(160).min(1),done:z.boolean()}).strict()).max(20),recommendations:text(2000),photoIds:z.array(z.string().uuid()).max(6)}).strict().refine(value=>new Set(value.photoIds).size===value.photoIds.length,'Fotografías repetidas.');
const base={workId:text(160).min(1),actionId:z.string().uuid(),revision:z.number().int().nonnegative()};
export const deliveryMutationSchema=z.discriminatedUnion('action',[
 z.object({...base,action:z.literal('save'),content:deliveryContentSchema,internalNote:text(2000)}).strict(),
 z.object({...base,action:z.literal('publish')}).strict(),
 z.object({action:z.literal('acknowledge'),requestId:z.string().uuid(),version:z.number().int().positive(),actionId:z.string().uuid()}).strict(),
 z.object({action:z.literal('photo'),workId:base.workId,actionId:z.string().uuid(),name:text(160).min(1),data:z.string().min(1).max(4200000)}).strict(),
]);
export type DeliveryContent=z.infer<typeof deliveryContentSchema>;
export type DeliveryMutation=z.infer<typeof deliveryMutationSchema>;
export type DeliveryPhoto={id:string;name:string;ready:boolean};
export type DeliveryVersion={version:number;content:DeliveryContent;service:string;completedAt:string;publishedAt:string;acknowledgedAt:string|null};
export type DeliveryView={side:'provider'|'client';workId:string;canPublish:boolean;revision:number;draft:DeliveryContent|null;internalNote?:string;photos:DeliveryPhoto[];versions:DeliveryVersion[];nextCursor:number|null};
export const emptyDelivery=():DeliveryContent=>({summary:'',checklist:[],recommendations:'',photoIds:[]});
