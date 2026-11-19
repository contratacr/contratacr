import {z} from 'zod';
/** Hacienda v4.4 (22/04/2026), pp. 37–44, 47–49, 56, 71, 80.
 * Ordinary collected taxes 02/03/04/05/06/12 are modeled here. Selective tax uses an explicit declared base; beverage unit tariffs are entered manually. No factory-assumed tax,
 * automatic legal tariff lookup, surtidos, or arbitrary tax base is inferred.
 */
const SCALE=BigInt('100000'),ZERO=BigInt('0');
function units(value:string){if(!/^\d{1,9}(?:[.,]\d{1,5})?$/.test(value))return ZERO;const [whole,fraction='']=value.replace(',','.').split('.');return BigInt(whole)*SCALE+BigInt((fraction+'00000').slice(0,5));}
function rounded(value:bigint,divisor:bigint){return (value+divisor/BigInt('2'))/divisor;}
const decimal=z.string().trim().regex(/^\d{1,9}(?:[.,]\d{1,5})?$/,'Use hasta cinco decimales.').transform(value=>value.replace(',','.'));
const positiveAmount=decimal.refine(value=>units(value)>ZERO&&units(value)<=BigInt('100000000')*SCALE,'Indique un importe mayor que cero y hasta 100000000.');
const optionalAmount=z.union([z.literal(''),positiveAmount]);
const percentage=decimal.refine(value=>units(value)>ZERO&&units(value)<=BigInt('100')*SCALE,'Indique un porcentaje mayor que cero y hasta 100.');
export const SPECIAL_TAX_OPTIONS=[
 {code:'02',label:'Impuesto Selectivo de Consumo'},
 {code:'03',label:'Impuesto Único a los Combustibles'},
 {code:'04',label:'Impuesto específico de Bebidas Alcohólicas'},
 {code:'05',label:'Impuesto Específico sobre las bebidas envasadas sin contenido alcohólico y jabones de tocador'},
 {code:'06',label:'Impuesto a los Productos de Tabaco'},
 {code:'12',label:'Impuesto Específico al Cemento'},
] as const;
export const CHARGE_OPTIONS=[
 {code:'01',label:'Contribución parafiscal'},
 {code:'02',label:'Timbre de la Cruz Roja'},
 {code:'03',label:'Timbre de Benemérito Cuerpo de Bomberos de Costa Rica.'},
 {code:'04',label:'Cobro de un tercero'},
 {code:'05',label:'Costos de Exportación'},
 {code:'06',label:'Impuesto de servicio 10 %'},
 {code:'07',label:'Timbre de Colegios Profesionales'},
 {code:'08',label:'Depósitos de Garantía'},
 {code:'09',label:'Multas o Penalizaciones'},
 {code:'10',label:'Intereses Moratorios'},
 {code:'99',label:'Otros Cargos'},
] as const;
const optionalSpecialRate=z.string({message:'Indique la tarifa como texto decimal.'}).trim().transform(value=>value.replace(',','.')).refine(value=>value===''||/^\d{1,3}(?:\.\d{1,2})?$/.test(value)&&units(value)>ZERO&&units(value)<=BigInt('100')*SCALE,'La tarifa debe ser mayor que cero y hasta 100, con dos decimales.');
const optionalSpecialQuantity=z.string({message:'Indique la cantidad como texto decimal.'}).trim().transform(value=>value.replace(',','.')).refine(value=>value===''||/^\d{1,5}(?:\.\d{1,2})?$/.test(value)&&units(value)>ZERO,'La cantidad debe ser mayor que cero y hasta 99999.99, con dos decimales.');
const optionalSpecialAmount=z.string({message:'Indique el impuesto por unidad como texto decimal.'}).trim().transform(value=>value.replace(',','.')).refine(value=>value===''||/^\d{1,9}(?:\.\d{1,5})?$/.test(value)&&units(value)>ZERO&&units(value)<=BigInt('100000000')*SCALE,'El impuesto por unidad debe ser mayor que cero y hasta 100000000, con cinco decimales.');
const beverageQuantity=z.string({message:'Indique el volumen como texto decimal.'}).trim().transform(value=>value.replace(',','.')).refine(value=>/^\d{1,5}(?:\.\d{1,2})?$/.test(value)&&units(value)>ZERO,'El volumen de referencia debe ser mayor que cero y hasta 99999.99, con dos decimales.');
const selectiveSchema=z.object({
 base:z.string({message:'Indique la base imponible del selectivo.'}).trim().transform(value=>value.replace(',','.')).refine(value=>/^\d{1,9}(?:\.\d{1,5})?$/.test(value)&&units(value)>ZERO&&units(value)<=BigInt('100000000')*SCALE,'La base del selectivo debe ser mayor que cero y hasta 100000000, con cinco decimales.'),
 legalReference:z.string({message:'Indique la referencia normativa de la base del selectivo.'}).trim().min(5,'La referencia normativa del selectivo debe tener al menos 5 caracteres.').max(160,'La referencia normativa del selectivo no puede superar 160 caracteres.'),
}).strict();
const alcoholSchema=z.object({percentage:z.string({message:'Indique el porcentaje de alcohol.'}).trim().transform(value=>value.replace(',','.')).refine(value=>/^\d{1,2}(?:\.\d{1,2})?$/.test(value)&&units(value)>ZERO&&units(value)<=BigInt('9999000'),'El porcentaje de alcohol debe ser mayor que cero y hasta 99.99, con dos decimales.')}).strict();
const beverageSchema=z.object({kind:z.literal('beverage',{message:'En esta preparación solo se admiten bebidas sin alcohol; el jabón requiere otro modelo.'}),referenceVolume:beverageQuantity}).strict();
const specialTaxSchema=z.object({
 code:z.enum(['02','03','04','05','06','12'],{message:'Seleccione un impuesto especial disponible.'}),
 rate:optionalSpecialRate,quantityPerUnit:optionalSpecialQuantity,amountPerUnit:optionalSpecialAmount,
 selective:selectiveSchema.optional(),alcohol:alcoholSchema.optional(),beverage:beverageSchema.optional(),
}).strict().superRefine((tax,ctx)=>{
 if(tax.selective&&tax.code!=='02')ctx.addIssue({code:'custom',path:['selective'],message:'La base del selectivo solo corresponde al impuesto 02.'});
 if(tax.alcohol&&tax.code!=='04')ctx.addIssue({code:'custom',path:['alcohol'],message:'El porcentaje de alcohol solo corresponde al impuesto 04.'});
 if(tax.beverage&&tax.code!=='05')ctx.addIssue({code:'custom',path:['beverage'],message:'El volumen de referencia de bebidas solo corresponde al impuesto 05.'});
 if(tax.code==='02'||tax.code==='12'){
  if(!tax.rate)ctx.addIssue({code:'custom',path:['rate'],message:tax.code==='02'?'Indique la tarifa del impuesto selectivo.':'Indique la tarifa del impuesto al cemento.'});
  if(tax.quantityPerUnit||tax.amountPerUnit)ctx.addIssue({code:'custom',path:['quantityPerUnit'],message:'Este impuesto utiliza una base y una tarifa; deje las cantidades e importes por unidad vacíos.'});
  if(tax.code==='02'){
   if(!tax.selective)ctx.addIssue({code:'custom',path:['selective'],message:'Indique la base explícita y la referencia normativa del selectivo.'});
   if(units(tax.rate)>BigInt('9999000'))ctx.addIssue({code:'custom',path:['rate'],message:'La tarifa del selectivo no puede superar 99.99.'});
  }
 }else{
  if(tax.rate)ctx.addIssue({code:'custom',path:['rate'],message:'Este impuesto utiliza un importe por unidad; deje la tarifa vacía.'});
  if(!tax.quantityPerUnit)ctx.addIssue({code:'custom',path:['quantityPerUnit'],message:'Indique la cantidad para el cálculo del impuesto específico.'});
  if(!tax.amountPerUnit)ctx.addIssue({code:'custom',path:['amountPerUnit'],message:'Indique el impuesto por unidad.'});
  if(tax.code==='04'&&!tax.alcohol)ctx.addIssue({code:'custom',path:['alcohol'],message:'Indique el porcentaje de alcohol por volumen.'});
  if(tax.code==='05'&&!tax.beverage)ctx.addIssue({code:'custom',path:['beverage'],message:'Indique el volumen de referencia de la bebida sin alcohol.'});
 }
});
export const specialTaxesSchema=z.array(specialTaxSchema).max(6,'Puede agregar hasta seis impuestos especiales por línea.').superRefine((taxes,ctx)=>{if(new Set(taxes.map(tax=>tax.code)).size!==taxes.length)ctx.addIssue({code:'custom',message:'No repita el mismo impuesto específico en una línea.'});});
export type InvoiceSpecialTax=z.infer<typeof specialTaxSchema>;
/** A type switch creates only its required input shape; old tax fields are never retained. */
export function blankSpecialTax(code:InvoiceSpecialTax['code']):InvoiceSpecialTax{
 if(code==='02')return {code,rate:'',quantityPerUnit:'',amountPerUnit:'',selective:{base:'',legalReference:''}};
 if(code==='04')return {code,rate:'',quantityPerUnit:'',amountPerUnit:'',alcohol:{percentage:''}};
 if(code==='05')return {code,rate:'',quantityPerUnit:'',amountPerUnit:'',beverage:{kind:'beverage',referenceVolume:''}};
 return {code,rate:code==='12'?'5':'',quantityPerUnit:code==='12'?'':'1',amountPerUnit:''};
}
const thirdPartySchema=z.object({idType:z.enum(['01','02','03','04'],{message:'Seleccione el tipo de identificación del tercero.'}),id:z.string().trim().max(20,'La identificación del tercero no puede superar 20 caracteres.'),name:z.string().trim().min(5,'El nombre del tercero debe tener al menos 5 caracteres.').max(100,'El nombre del tercero no puede superar 100 caracteres.')}).strict().superRefine((party,ctx)=>{
 const pattern=party.idType==='01'?/^[1-9]\d{8}$/:party.idType==='02'?/^[a-zA-Z0-9]{10}$/:party.idType==='03'?/^[1-9]\d{10,11}$/:/^\d{10}$/;
 if(!pattern.test(party.id))ctx.addIssue({code:'custom',path:['id'],message:'Revise el formato de la identificación del tercero.'});
});
const chargeSchema=z.object({
 code:z.enum(['01','02','03','04','05','06','07','08','09','10','99'],{message:'Seleccione un tipo de cargo.'}),otherDetail:z.string().trim().max(100,'La descripción de Otros no puede superar 100 caracteres.'),description:z.string().trim().min(1,'Indique una descripción del cargo.').max(160,'La descripción del cargo no puede superar 160 caracteres.'),
 mode:z.enum(['amount','percent']),value:positiveAmount,base:optionalAmount,thirdParty:thirdPartySchema.nullable(),
}).strict().superRefine((charge,ctx)=>{
 if(charge.code==='99'?charge.otherDetail.length<5:charge.otherDetail!=='')ctx.addIssue({code:'custom',path:['otherDetail'],message:'Describa Otros con entre 5 y 100 caracteres; en los demás tipos deje este campo vacío.'});
 if(charge.mode==='amount'&&charge.base)ctx.addIssue({code:'custom',path:['base'],message:'Un cargo de monto fijo no utiliza base de porcentaje.'});
 if(charge.mode==='percent'){
  if(!charge.base)ctx.addIssue({code:'custom',path:['base'],message:'Indique la base explícita para el porcentaje.'});
  if(!percentage.safeParse(charge.value).success)ctx.addIssue({code:'custom',path:['value'],message:'Indique un porcentaje mayor que cero y hasta 100.'});
 }
 if(charge.code==='06'&&(charge.mode!=='percent'||units(charge.value)!==BigInt('10')*SCALE))ctx.addIssue({code:'custom',path:['value'],message:'El impuesto de servicio requiere 10 % sobre una base explícita.'});
 if(charge.code==='04'&&!charge.thirdParty)ctx.addIssue({code:'custom',path:['thirdParty'],message:'Indique la identificación y el nombre del tercero.'});
 if(charge.mode==='percent'&&charge.base&&rounded(units(charge.base)*units(charge.value),BigInt('100')*SCALE)===ZERO)ctx.addIssue({code:'custom',path:['value'],message:'El importe calculado del cargo debe ser mayor que cero.'});
});
export const invoiceChargesSchema=z.array(chargeSchema).max(15,'Puede agregar hasta 15 cargos.');
export type InvoiceCharge=z.infer<typeof chargeSchema>;
export function specialTaxAmounts(quantity:string,net:bigint,taxes:InvoiceSpecialTax[]=[]){
 let specialTax=ZERO,vatBaseExtra=ZERO;
 for(const tax of taxes){
  let amount=ZERO;
  if(tax.code==='12')amount=rounded(net*units(tax.rate),BigInt('100')*SCALE);
  else if(tax.code==='02')amount=rounded(units(tax.selective?.base??'')*units(tax.rate),BigInt('100')*SCALE);
  else if(tax.code==='03')amount=rounded(units(tax.quantityPerUnit)*units(tax.amountPerUnit),SCALE);
  else if(tax.code==='04'){
   // The intermediate absolute-alcohol proportion is a five-decimal fiscal field.
   const proportion=rounded(units(tax.quantityPerUnit)*units(tax.alcohol?.percentage??''),BigInt('100')*SCALE);
   amount=rounded(units(quantity)*proportion*units(tax.amountPerUnit),SCALE*SCALE);
  }else if(tax.code==='05'){
   // Divide only once after multiplication, preserving repeating ratios until final rounding.
   const volume=units(tax.beverage?.referenceVolume??'');
   if(volume>ZERO)amount=rounded(units(quantity)*units(tax.quantityPerUnit)*units(tax.amountPerUnit),SCALE*volume);
  }else amount=rounded(units(quantity)*units(tax.quantityPerUnit)*units(tax.amountPerUnit),SCALE*SCALE);
  specialTax+=amount;if(['02','04','05','12'].includes(tax.code))vatBaseExtra+=amount;
 }
 return {specialTax,vatBaseExtra};
}
export function chargeAmounts(charges:InvoiceCharge[]=[]){return charges.reduce((sum,charge)=>sum+(charge.mode==='percent'?rounded(units(charge.base)*units(charge.value),BigInt('100')*SCALE):units(charge.value)),ZERO);}
