import {z} from 'zod';
import {emptyInvoicePreparation,type InvoiceIssuer,type InvoicePreparation} from './invoice-preparation';
export const documentDefaultsSchema=z.object({saleCondition:z.enum(['','cash','credit']),creditDays:z.number().int().min(0).max(3650),paymentMethod:z.enum(['','cash','card','transfer','sinpe','other']),dateMode:z.enum(['blank','today']),notes:z.string().trim().max(2000)}).superRefine((value,ctx)=>{
 if(value.saleCondition==='credit'&&(value.creditDays<1||value.dateMode!=='today'))ctx.addIssue({code:'custom',path:['creditDays'],message:'Para crédito, use la fecha del día y un plazo de 1 a 3650 días.'});
 if(value.saleCondition!=='credit'&&value.creditDays!==0)ctx.addIssue({code:'custom',path:['creditDays'],message:'El plazo solo se utiliza para crédito.'});
});
export const documentSettingsMutationSchema=z.object({revision:z.number().int().nonnegative(),defaults:documentDefaultsSchema});
export type DocumentDefaults=z.infer<typeof documentDefaultsSchema>;
export const emptyDocumentDefaults=():DocumentDefaults=>({saleCondition:'',creditDays:0,paymentMethod:'',dateMode:'blank',notes:''});
export function preparationFromDefaults(defaults:DocumentDefaults,issuer:InvoiceIssuer,today:string):InvoicePreparation{return {...emptyInvoicePreparation(),...issuer,plannedDate:defaults.dateMode==='today'?today:'',saleCondition:defaults.saleCondition,creditDays:defaults.creditDays,paymentMethod:defaults.paymentMethod};}
