import {z} from 'zod';
import {daySchema} from './panel-queries';
import {paymentMethodSchema,paymentToday,type PaymentMethod} from './invoice-payments';
import type {PaymentOverviewRow} from './payment-overview';
export const paymentMetadataQuery=z.object({id:z.string().uuid(),after:z.string().max(1000).default('')});
export const paymentMetadataCursor=z.object({at:z.string().datetime({offset:true}).max(40),id:z.string().uuid()});
export const paymentMetadataCorrection=z.object({id:z.string().uuid(),requestId:z.string().uuid(),revision:z.number().int().nonnegative(),receivedOn:daySchema.refine(value=>value>='1900-01-01'&&value<=paymentToday()),method:paymentMethodSchema,reference:z.string().trim().max(160).default(''),reason:z.string().trim().min(1).max(160)});
export type PaymentMetadataChange={id:string;revision:number;receivedOn:string;method:PaymentMethod;reference:string;previousReceivedOn:string|null;previousMethod:PaymentMethod|null;previousReference:string|null;reason:string;changedAt:string;actorId:string};
export type PaymentMetadataPage={payment:PaymentOverviewRow;revision:number;items:PaymentMetadataChange[];nextCursor:string|null};
