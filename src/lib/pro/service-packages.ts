import {z} from 'zod';
import type {Product} from './business';
import {blankInvoiceLine,invoiceDetailSchema,type EditableInvoiceLine} from './invoice-detail';
import type {QuoteTaxMode} from '../quotes';
const quantity=z.string().trim().regex(/^\d{1,4}(?:[.,]\d{1,2})?$/,'La cantidad admite hasta dos decimales.').transform(value=>value.replace(',','.')).refine(value=>Number(value)>0&&Number(value)<=9999,'La cantidad debe ser mayor que cero y hasta 9999.');
const price=z.string().trim().regex(/^\d{1,9}$/,'Use un precio en colones enteros.').refine(value=>Number(value)<=100000000,'El precio no puede superar 100000000.');
/** Neutral commercial snapshot: no customer exemptions, document taxes or inventory side effects. */
export const servicePackageLineSchema=z.object({kind:z.enum(['product','service']),description:z.string().trim().min(1,'Escriba una descripción.').max(140,'La descripción admite hasta 140 caracteres.'),quantity,unitPrice:price,sku:z.string().trim().max(160),unit:z.string().trim().max(30),cabys:z.string().regex(/^(?:\d{13})?$/,'CABYS debe estar vacío o tener 13 dígitos.')}).strict();
export type ServicePackageLine=z.infer<typeof servicePackageLineSchema>;
export function packageInvoiceLines(lines:ServicePackageLine[]):EditableInvoiceLine[]{return lines.map(line=>({...blankInvoiceLine(),...servicePackageLineSchema.parse(line),productId:null}));}
export const servicePackageSchema=z.object({name:z.string().trim().min(1,'Escriba un nombre.').max(80),notes:z.string().trim().max(1000).default(''),lines:z.array(servicePackageLineSchema).min(1,'Agregue al menos una línea.').max(20,'Una plantilla admite hasta 20 líneas.')}).strict().superRefine((value,ctx)=>{if(!invoiceDetailSchema.safeParse(value.lines.map(line=>({...blankInvoiceLine(),...line,productId:null}))).success)ctx.addIssue({code:'custom',path:['lines'],message:'El total de la plantilla no puede superar 100000000 de colones.'});});
export type ServicePackageInput=z.infer<typeof servicePackageSchema>;
export type ServicePackage=ServicePackageInput&{id:string;archived:boolean};
export type ServicePackagePage={revision:number;items:ServicePackage[];nextCursor:string|null};
export const servicePackageMutationSchema=z.object({action:z.enum(['save','archive','restore']),id:z.string().uuid(),revision:z.number().int().nonnegative(),requestId:z.string().uuid(),package:servicePackageSchema.optional()}).strict().superRefine((input,ctx)=>{if(input.action==='save'&&!input.package)ctx.addIssue({code:'custom',path:['package'],message:'Indique la plantilla que desea guardar.'});if(input.action!=='save'&&input.package)ctx.addIssue({code:'custom',path:['package'],message:'La acción no admite cambios de contenido.'});});
/** Copy without truncation/rounding; the editor asks for explicit correction of incompatible catalog values. */
export function servicePackageCatalogLine(item:Product):ServicePackageLine{return {kind:item.itemType==='service'?'service':'product',description:item.name,quantity:'1',unitPrice:String(item.price),sku:item.sku,unit:item.unit??'',cabys:item.cabys??''};}
/** Quote editor stores integer CRC unit prices. Its current tax mode remains unchanged. */
export function packageQuoteRows(lines:ServicePackageLine[],taxMode:QuoteTaxMode){return lines.map(raw=>{const line=servicePackageLineSchema.parse(raw);return {description:line.description,quantity:line.quantity,unit_price:String(Math.round(Number(line.unitPrice)*(taxMode==='incluido'?1.13:1)))};});}
export function servicePackageBaseTotal(lines:ServicePackageLine[]){return lines.reduce((total,line)=>total+Number(line.quantity)*Number(line.unitPrice),0);}
