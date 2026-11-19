import {z} from 'zod';
const duration=z.number().int().min(15).max(480).multipleOf(15);
const common={requestId:z.string().uuid(),id:z.string().uuid(),actionId:z.string().uuid()};
export const appointmentRescheduleMutation=z.discriminatedUnion('action',[
 z.object({...common,action:z.literal('propose'),requestRevision:z.number().int().nonnegative(),start:z.string().datetime({offset:true}),durationMinutes:duration,note:z.string().trim().max(500)}).strict(),
 z.object({...common,action:z.enum(['accept','decline','withdraw']),revision:z.number().int().positive()}).strict(),
]);
export type AppointmentRescheduleMutation=z.infer<typeof appointmentRescheduleMutation>;
export type AppointmentRescheduleItem={id:string;position:number;revision:number;status:'proposed'|'accepted'|'declined'|'withdrawn';stale:boolean;fromStart:string;fromEnd:string;start:string;end:string;durationMinutes:number;note:string;requestRevision:number;createdAt:string;updatedAt:string};
export type AppointmentReschedulePage={requestId:string;side:'provider'|'client';requestRevision:number;current:{start:string;end:string;durationMinutes:number};canPropose:boolean;items:AppointmentRescheduleItem[];nextCursor:number|null};
// Short aliases used by the local service view.
export const rescheduleMutationSchema=appointmentRescheduleMutation;
export type RescheduleMutation=AppointmentRescheduleMutation;
export type RescheduleProposal=AppointmentRescheduleItem;
export type ReschedulePage=AppointmentReschedulePage;
