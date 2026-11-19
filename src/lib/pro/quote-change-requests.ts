import {z} from 'zod';
export const quoteChangeInput=z.object({quoteId:z.string().uuid(),actionId:z.string().uuid(),revision:z.number().int().min(0).max(999999999),fingerprint:z.string().regex(/^[a-f0-9]{32}$/),action:z.enum(['request','respond','cancel']),note:z.string().trim().min(1).max(1000)}).strict();
export type QuoteChangeInput=z.infer<typeof quoteChangeInput>;
export type QuoteChangePage={quoteId:string;enabled:boolean;side:'provider'|'client';revision:number;pending:boolean;canWrite:boolean;fingerprint:string;events:{position:number;action:'request'|'respond'|'cancel';note:string;at:string;snapshot:{title:string|null;items:{description:string;quantity:number;unit_price:number}[];total:number;status:string}}[];nextCursor:number|null};
