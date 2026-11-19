import {z} from 'zod';
import {decimalUnits,roundDivide,type EditableInvoiceLine} from './invoice-detail';
const valueSchema=z.string().trim().regex(/^\d{1,9}(?:[.,]\d{1,5})?$/,'Use un valor con hasta cinco decimales.').transform(value=>value.replace(',','.')).refine(value=>decimalUnits(value)>BigInt(0)&&decimalUnits(value)<=BigInt(100000000)*BigInt(100000),'El descuento debe ser positivo y hasta 100000000.');
export const discountPresetSchema=z.object({name:z.string().trim().min(1,'Escriba un nombre.').max(80,'El nombre admite hasta 80 caracteres.'),reason:z.string().trim().min(1,'Escriba el motivo comercial.').max(160,'El motivo admite hasta 160 caracteres.'),method:z.enum(['percent','amount']),value:valueSchema}).superRefine((preset,ctx)=>{if(preset.method==='percent'&&decimalUnits(preset.value)>BigInt(100)*BigInt(100000))ctx.addIssue({code:'custom',path:['value'],message:'El porcentaje no puede superar 100 %.'});});
export type DiscountPresetInput=z.infer<typeof discountPresetSchema>;
export type DiscountPreset=DiscountPresetInput&{id:string;archived:boolean};
export const discountPresetMutationSchema=z.object({action:z.enum(['save','archive','restore']),id:z.uuid(),revision:z.number().int().nonnegative(),preset:discountPresetSchema.optional()}).superRefine((input,ctx)=>{if(input.action==='save'&&!input.preset)ctx.addIssue({code:'custom',path:['preset'],message:'Indique el descuento que desea guardar.'});});
export function discountPresetPatch(line:EditableInvoiceLine,preset:DiscountPresetInput):Pick<EditableInvoiceLine,'discountType'|'discount'|'discountReason'>{
 const checked=discountPresetSchema.parse(preset);
 if(checked.method==='amount'&&decimalUnits(checked.value)>roundDivide(decimalUnits(line.quantity.trim())*decimalUnits(line.unitPrice.trim()),BigInt(100000)))throw Error('El descuento guardado supera el importe de esta línea.');
 return {discountType:checked.method,discount:checked.value,discountReason:checked.reason};
}
