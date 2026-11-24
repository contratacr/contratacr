import {z} from 'zod';
/** Area E (calendar): owner meeting types (name, length, where, video app, description). */
export const meetingLocationKinds=['phone','project_address','video'] as const;
export const meetingVideoApps=['meet','teams','zoom','other'] as const;
export const meetingTypeSchema=z.object({id:z.string().uuid(),name:z.string(),minutes:z.number().int().min(5).max(480),locationKind:z.enum(meetingLocationKinds),videoApp:z.enum(meetingVideoApps).nullable(),description:z.string(),revision:z.number().int().positive()});
export const meetingTypesSchema=z.object({types:z.array(meetingTypeSchema)});
export type MeetingType=z.infer<typeof meetingTypeSchema>;
const base={id:z.string().uuid()};
export const meetingTypeMutationSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('save'),...base,revision:z.number().int().min(0).max(999999999),name:z.string().trim().min(1).max(80),minutes:z.number().int().min(5).max(480),locationKind:z.enum(meetingLocationKinds),videoApp:z.enum(meetingVideoApps).nullable(),description:z.string().trim().max(300)}).strict()
  .refine(v=>v.locationKind==='video'||v.videoApp===null),
 z.object({action:z.literal('delete'),...base}).strict(),
]);
