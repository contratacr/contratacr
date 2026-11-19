import {z} from 'zod';
import {taxSchema,VAT_OPTIONS} from './invoice-tax';
import {specialTaxesSchema,specialTaxAmounts,chargeAmounts,type InvoiceCharge} from './invoice-extras';
const SCALE=BigInt('100000');
const decimal=z.string().trim().regex(/^\d{1,9}(?:[.,]\d{1,5})?$/,'Use un número positivo con hasta cinco decimales.').transform(s=>s.replace(',','.'));
export function decimalUnits(value:string):bigint{if(!/^\d{1,9}(?:[.,]\d{1,5})?$/.test(value))return BigInt('0');const [whole,fraction='']=value.replace(',','.').split('.');return BigInt(whole)*SCALE+BigInt((fraction+'00000').slice(0,5));}
const positive=decimal.refine(s=>decimalUnits(s)>BigInt('0')&&decimalUnits(s)<=BigInt('1000000')*SCALE,'La cantidad debe ser mayor que cero y hasta 1000000.');
const amount=decimal.refine(s=>decimalUnits(s)<=BigInt('100000000')*SCALE,'El importe supera el límite del borrador.');
export const editableInvoiceLineSchema=z.object({
 kind:z.enum(['pending','product','service']),productId:z.string().min(1).max(160).nullable(),sku:z.string().trim().max(160),
 description:z.string().trim().min(1,'Indique una descripción.').max(200),unit:z.string().trim().max(30),cabys:z.string().regex(/^(?:\d{13})?$/,'CABYS debe estar vacío o tener 13 dígitos.'),
 quantity:positive,unitPrice:amount,discountType:z.enum(['percent','amount']),discount:amount,discountReason:z.string().trim().max(160),
 tax:taxSchema.nullable().optional(),specialTaxes:specialTaxesSchema.optional(),
 taxTreatment:z.enum(['pending','vat','exempt','not_subject']),taxRate:decimal.refine(s=>decimalUnits(s)<=BigInt('100')*SCALE,'La tarifa no puede superar 100 %.'),
}).superRefine((line,ctx)=>{
 if(line.tax){
  const option=VAT_OPTIONS.find(option=>option.code===line.tax!.vatCode)!;
  const treatment=option.code==='10'?'exempt':option.code==='11'?'not_subject':'vat';
  if(line.taxTreatment!==treatment||decimalUnits(line.taxRate)!==decimalUnits(option.rate))ctx.addIssue({code:'custom',path:['tax','vatCode'],message:'El código de IVA debe coincidir con el tratamiento y la tarifa de la línea.'});
  const exemption=line.tax.exemption;
  if(exemption&&(line.taxTreatment!=='vat'||decimalUnits(line.taxRate)===BigInt('0')||decimalUnits(exemption.rate)>decimalUnits(line.taxRate)))ctx.addIssue({code:'custom',path:['tax','exemption','rate'],message:'La exoneración requiere IVA positivo y no puede superar su tarifa.'});
 }
 if(line.productId&&line.kind!=='product')ctx.addIssue({code:'custom',path:['kind'],message:'El vínculo al inventario corresponde a un producto.'});
 if(line.discountType==='percent'&&decimalUnits(line.discount)>BigInt('100')*SCALE)ctx.addIssue({code:'custom',path:['discount'],message:'El descuento no puede superar 100 %.'});
 if(line.taxTreatment!=='vat'&&decimalUnits(line.taxRate)!==BigInt('0'))ctx.addIssue({code:'custom',path:['taxRate'],message:'Solo IVA admite una tarifa distinta de cero.'});
 if(line.discountType==='amount'&&decimalUnits(line.discount)>roundDivide(decimalUnits(line.quantity)*decimalUnits(line.unitPrice),SCALE))ctx.addIssue({code:'custom',path:['discount'],message:'El descuento no puede superar el importe de la línea.'});
});
export type EditableInvoiceLine=z.infer<typeof editableInvoiceLineSchema>;
export function roundDivide(value:bigint,divisor:bigint){return (value+divisor/BigInt('2'))/divisor;}
export function lineAmounts(line:EditableInvoiceLine){
 const gross=roundDivide(decimalUnits(line.quantity)*decimalUnits(line.unitPrice),SCALE);
 const discount=line.discountType==='percent'?roundDivide(gross*decimalUnits(line.discount),BigInt('100')*SCALE):decimalUnits(line.discount);
 const net=gross-discount,{specialTax,vatBaseExtra}=specialTaxAmounts(line.quantity,net,line.specialTaxes),vatBase=net+vatBaseExtra;
 const grossTax=line.taxTreatment==='vat'?roundDivide(vatBase*decimalUnits(line.taxRate),BigInt('100')*SCALE):BigInt('0');
 const exonerated=line.taxTreatment==='vat'&&line.tax?.exemption?roundDivide(vatBase*decimalUnits(line.tax.exemption.rate),BigInt('100')*SCALE):BigInt('0');
 const tax=grossTax-exonerated;
 return {gross,discount,net,vatBase,specialTax,grossTax,exonerated,tax,totalTax:tax+specialTax,total:net+tax+specialTax};
}
export function detailAmounts(lines:EditableInvoiceLine[]){
 const sum=lines.reduce((a,line)=>{const b=lineAmounts(line);return {gross:a.gross+b.gross,discount:a.discount+b.discount,net:a.net+b.net,vatBase:a.vatBase+b.vatBase,specialTax:a.specialTax+b.specialTax,grossTax:a.grossTax+b.grossTax,exonerated:a.exonerated+b.exonerated,tax:a.tax+b.tax,totalTax:a.totalTax+b.totalTax,total:a.total+b.total};},{gross:BigInt('0'),discount:BigInt('0'),net:BigInt('0'),vatBase:BigInt('0'),specialTax:BigInt('0'),grossTax:BigInt('0'),exonerated:BigInt('0'),tax:BigInt('0'),totalTax:BigInt('0'),total:BigInt('0')});
 return {...sum,totalCents:Number(roundDivide(sum.total,BigInt('1000'))),taxCents:Number(roundDivide(sum.totalTax,BigInt('1000'))),vatCents:Number(roundDivide(sum.tax,BigInt('1000')))};
}
export function invoiceAmounts(lines:EditableInvoiceLine[],charges:InvoiceCharge[]=[]){
 const amounts=detailAmounts(lines),chargeTotal=chargeAmounts(charges),total=amounts.total+chargeTotal;
 return {...amounts,chargeTotal,otherCharges:chargeTotal,total,totalCents:Number(roundDivide(total,BigInt('1000'))),beforeExemptionCents:Number(roundDivide(amounts.net+amounts.specialTax+amounts.grossTax+chargeTotal,BigInt('1000')))};
}
export const invoiceDetailSchema=z.array(editableInvoiceLineSchema).min(1,'Agregue al menos una línea.').max(100).superRefine((lines,ctx)=>{const amounts=detailAmounts(lines);if(amounts.totalCents>10000000000)ctx.addIssue({code:'custom',message:'El total supera el límite del borrador.'});if(roundDivide(amounts.net+amounts.specialTax+amounts.grossTax,BigInt('1000'))>BigInt('10000000000'))ctx.addIssue({code:'custom',message:'El total antes de exoneración supera el límite del borrador.'});});
export const blankInvoiceLine=():EditableInvoiceLine=>({kind:'service',productId:null,sku:'',description:'',unit:'Sp',cabys:'',quantity:'1',unitPrice:'0',discountType:'percent',discount:'0',discountReason:'',taxTreatment:'pending',taxRate:'0'});
/** Project default VAT (Detalles del proyecto) for a line still «Por definir»; any other line is kept. */
export function applyProjectVat(line:EditableInvoiceLine,code:string|null|undefined):EditableInvoiceLine{
 const option=code&&line.taxTreatment==='pending'?VAT_OPTIONS.find(row=>row.code===code):undefined;if(!option)return line;
 return {...line,taxTreatment:option.code==='10'?'exempt':option.code==='11'?'not_subject':'vat',taxRate:option.rate,tax:{vatCode:option.code,exemption:null}};
}
export function sourceDetail(lines:{description:string;quantity:number;unitAmount:number;taxRate:number|null}[]):EditableInvoiceLine[]{return lines.map(line=>({...blankInvoiceLine(),kind:'pending',description:line.description,unit:'',quantity:String(Number(line.quantity.toFixed(5))),unitPrice:String(Number(line.unitAmount.toFixed(5))),taxTreatment:line.taxRate&&line.taxRate>0?'vat':'pending',taxRate:line.taxRate&&line.taxRate>0?String(Number(line.taxRate.toFixed(5))):'0'}));}
export function unitsText(value:bigint){return (value/SCALE).toString()+'.'+(value%SCALE).toString().padStart(5,'0');}

export function formatDraftUnits(value:bigint,en=false){
 const fraction=((value<BigInt(0)?-value:value)%SCALE).toString().padStart(5,'0').replace(/0+$/,'').padEnd(2,'0');
 const whole=(value<BigInt(0)?-value:value)/SCALE;return (value<BigInt(0)?'−':'')+'₡'+whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g,en?',':'.')+(en?'.':',')+fraction;
}
