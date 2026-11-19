import {z} from 'zod';
const text=(max:number)=>z.string().trim().max(max);
const duration=z.number().int().min(15).max(480).multipleOf(15);
const instant=z.string().datetime({offset:true});
const day=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value=>{const parsed=new Date(value+'T12:00:00Z');return Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===value;},'Revise la fecha.');
export const appointmentStatuses=['requested','proposed','confirmed','declined','cancelled','completed'] as const;
export type AppointmentStatus=typeof appointmentStatuses[number];
const operation={id:z.string().uuid(),actionId:z.string().uuid(),revision:z.number().int().nonnegative()};
export const appointmentMutationSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('create'),id:z.string().uuid(),actionId:z.string().uuid(),professionalId:z.string().uuid(),service:text(160).min(1),durationMinutes:duration,locationKind:z.enum(['agree','provider','customer','online']),locationText:text(500),note:text(500),start:instant.nullable(),preferredDay:day.nullable(),preference:text(200)}).strict(),
 z.object({...operation,action:z.literal('propose'),start:instant,durationMinutes:duration,note:text(500)}).strict(),
 z.object({...operation,action:z.literal('confirm')}).strict(),
 z.object({...operation,action:z.literal('accept')}).strict(),
 z.object({...operation,action:z.literal('decline'),note:text(500)}).strict(),
 z.object({...operation,action:z.literal('cancel'),note:text(500)}).strict(),
]).superRefine((value,ctx)=>{if(value.action==='create'&&value.locationKind==='customer'&&!value.locationText)ctx.addIssue({code:'custom',path:['locationText'],message:'Indique dónde necesita el servicio.'});});
export type AppointmentMutation=z.infer<typeof appointmentMutationSchema>;
export type AppointmentRequest={id:string;position:number;professionalId:string;professionalName:string;professionalSlug:string|null;clientName:string;service:string;durationMinutes:number;locationKind:'agree'|'provider'|'customer'|'online';locationText:string;note:string;requestedStart:string|null;proposedStart:string|null;proposedDurationMinutes:number|null;preferredDay:string|null;preference:string;status:AppointmentStatus;revision:number;workId:string|null;start:string|null;end:string|null;workStage:string|null;workCancelled:boolean;origin?:'booking'|'project_invite';createdAt:string;updatedAt:string;side:'provider'|'client'};
export type AppointmentEvent={position:number;action:string;side:'provider'|'client';note:string;start:string|null;end:string|null;status:AppointmentStatus;at:string};
export type AppointmentPage={items:AppointmentRequest[];nextCursor:number|null};
export type AppointmentDetail={request:AppointmentRequest;events:AppointmentEvent[];nextCursor:number|null};
