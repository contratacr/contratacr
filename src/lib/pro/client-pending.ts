import {z} from 'zod';
export const clientPendingCursor=z.object({priority:z.number().int().min(0).max(4),at:z.string().max(40),key:z.string().min(1).max(180),asOf:z.string().datetime({offset:true})});
export type ClientPendingRow={id:string;key:string;kind:'work'|'quote'|'request';title:string;reason:'plan'|'review'|'upcoming'|'prepare'|'response'|'schedule'|'request'|'confirmation'|'expired';at:string;legacy:boolean;priority:number;sourceRevision?:number|null;requestStatus?:'requested'|'proposed'|null};
export type ClientPendingPage={fingerprint:string;asOf:string;summary:Record<ClientPendingRow['reason'],number>;items:ClientPendingRow[];nextCursor:string|null};
