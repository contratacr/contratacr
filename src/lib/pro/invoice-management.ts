import {z} from 'zod';
const revision={id:z.string().uuid(),revision:z.number().int().positive(),managementRevision:z.number().int().nonnegative()};
export const invoiceManagementSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('archive'),...revision}),z.object({action:z.literal('restore'),...revision}),
 z.object({action:z.literal('duplicate'),...revision,requestId:z.string().uuid()}),
]);
export type InvoiceManagement={id:string;revision:number;managementRevision:number;archived:boolean};
