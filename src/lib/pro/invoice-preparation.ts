import {z} from 'zod';
import {daySchema} from './panel-queries';
export const invoiceIssuerSchema=z.object({
 issuerName:z.string().trim().max(160),issuerIdType:z.enum(['','individual','company','dimex','nite','foreign']),issuerId:z.string().trim().max(40),
 issuerEmail:z.union([z.literal(''),z.string().trim().email().max(254)]),issuerPhone:z.string().trim().max(30),issuerAddress:z.string().trim().max(500),issuerActivity:z.union([z.literal(''),z.string().regex(/^[0-9.]{1,12}$/)]),
});
export type InvoiceIssuer=z.infer<typeof invoiceIssuerSchema>;
export const emptyInvoiceIssuer=():InvoiceIssuer=>({issuerName:'',issuerIdType:'',issuerId:'',issuerEmail:'',issuerPhone:'',issuerAddress:'',issuerActivity:''});
export const invoicePreparationSchema=z.object({
 ...invoiceIssuerSchema.shape,
 plannedDate:z.union([z.literal(''),daySchema]),saleCondition:z.enum(['','cash','credit']),creditDays:z.number().int().min(0).max(3650),
 paymentMethod:z.enum(['','cash','card','transfer','sinpe','other']),orderReference:z.string().trim().max(80),
}).superRefine((value,ctx)=>{
 if(value.saleCondition==='credit'&&(value.creditDays<1||!value.plannedDate))ctx.addIssue({code:'custom',path:['creditDays'],message:'Para crédito, indique la fecha prevista y un plazo de 1 a 3650 días.'});
 if(value.saleCondition!=='credit'&&value.creditDays!==0)ctx.addIssue({code:'custom',path:['creditDays'],message:'El plazo solo se utiliza para ventas a crédito.'});
});
export type InvoicePreparation=z.infer<typeof invoicePreparationSchema>;
export const emptyInvoicePreparation=():InvoicePreparation=>({issuerName:'',issuerIdType:'',issuerId:'',issuerEmail:'',issuerPhone:'',issuerAddress:'',issuerActivity:'',plannedDate:'',saleCondition:'',creditDays:0,paymentMethod:'',orderReference:''});
export function preparationDueDate(value:InvoicePreparation){
 if(value.saleCondition!=='credit'||!value.plannedDate||value.creditDays<1)return null;
 const date=new Date(value.plannedDate+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+value.creditDays);return date;
}
