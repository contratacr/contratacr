import {z} from 'zod';
import type {InvoiceDraft} from '../../invoice-drafts';
import {decimalUnits,lineAmounts,roundDivide,type EditableInvoiceLine} from '../../invoice-detail';
import {specialTaxAmounts,type InvoiceCharge} from '../../invoice-extras';
import {DISCOUNT_CODE,ID_TYPES,PAYMENT_METHODS,SALE_CONDITIONS,SERVICE_UNITS,UNITS,VAT_RATES,idNumberValid,type EinvoiceDocType} from './codes';

/**
 * Round 6A: the NORMALIZED fiscal document built from an invoice draft + the emisor settings, with every
 * amount as a fixed 5-decimal string (Hacienda DecimalDineroType 18,5) computed with the same integer
 * arithmetic as the draft (invoice-detail.ts, 1 unit = 0.00001). Validation runs BEFORE any consecutivo
 * is reserved, so a draft that cannot be emitted never consumes a number.
 */
const SCALE=BigInt('100000'),ZERO=BigInt('0'),HUNDRED=BigInt('100');
export const units=(value:string)=>decimalUnits(value);
export function money5(value:bigint){const negative=value<ZERO,abs=negative?-value:value;return (negative?'-':'')+(abs/SCALE).toString()+'.'+(abs%SCALE).toString().padStart(5,'0');}
export function parseMoney5(value:string){const match=/^(-?)(\d+)\.(\d{5})$/.exec(value);if(!match)throw RangeError('money5 '+value);const out=BigInt(match[2]!)*SCALE+BigInt(match[3]!);return match[1]?-out:out;}
const rate2=(value:string)=>{const u=units(value);return (u/SCALE).toString()+'.'+((u%SCALE)/BigInt('1000')).toString().padStart(2,'0');};
const qty3=(value:string)=>{const u=units(value);return (u/SCALE).toString()+'.'+((u%SCALE)/BigInt('100')).toString().padStart(3,'0');};
export const centsOf=(value:bigint)=>Number(roundDivide(value,BigInt('1000')));

export const emisorShape=z.object({
 idType:z.enum(['01','02','03','04']),idNumber:z.string().trim(),name:z.string().trim().min(5,'El nombre del emisor requiere de 5 a 100 caracteres.').max(100),
 commercialName:z.union([z.literal(''),z.string().trim().min(3).max(80)]),activityCode:z.string().regex(/^\d{6}$/,'El código de actividad tiene 6 dígitos.'),
 province:z.string().regex(/^[1-7]$/,'Provincia: un dígito del 1 al 7.'),canton:z.string().regex(/^\d{2}$/,'Cantón: dos dígitos.'),district:z.string().regex(/^\d{2}$/,'Distrito: dos dígitos.'),
 barrio:z.union([z.literal(''),z.string().trim().min(5).max(50)]),otherSigns:z.string().trim().min(5,'Otras señas: de 5 a 250 caracteres.').max(250),
 phone:z.union([z.literal(''),z.string().regex(/^\d{8,20}$/,'Teléfono: de 8 a 20 dígitos.')]),email:z.string().trim().email('Indique un correo válido.').max(160),
 branch:z.string().regex(/^\d{3}$/).refine(value=>value!=='000','Sucursal 001 o mayor.'),terminal:z.string().regex(/^\d{5}$/).refine(value=>value!=='00000','Terminal 00001 o mayor.'),
 providerSystems:z.string().regex(/^[A-Za-z0-9]{9,20}$/,'Proveedor de sistemas: la identificación (9 a 20 caracteres, sin guiones).'),
 // Ronda F2-A: electronic-invoice provider chosen for this emisor (src/lib/pro/einvoice/provider.ts). Optional so older
 // saved settings stay valid; the SQL default is 'mock'. The MODE is never stored here: the server resolves it.
 provider:z.enum(['mock','hacienda-sandbox','gti']).optional(),
}).strict();
export const emisorSettingsSchema=emisorShape.superRefine((value,ctx)=>{if(!idNumberValid(value.idType,value.idNumber))ctx.addIssue({code:'custom',path:['idNumber'],message:'El número no coincide con el tipo de identificación (física 9 dígitos sin cero inicial, jurídica 10, DIMEX 11 o 12, NITE 10).'});});
export type EmisorSettings=z.infer<typeof emisorSettingsSchema>;
export const blankEmisor=():EmisorSettings=>({idType:'02',idNumber:'',name:'',commercialName:'',activityCode:'',province:'1',canton:'01',district:'01',barrio:'',otherSigns:'',phone:'',email:'',branch:'001',terminal:'00001',providerSystems:''});

export type ModelExemption={type:string;typeOther:string;number:string;article:string;clause:string;institution:string;institutionOther:string;issuedOn:string;rate:string;amount:string};
export type ModelTax={code:string;vatCode?:string;rate?:string;specific?:{quantity?:string;percent?:string;proportion?:string;volume?:string;unitTax?:string};amount:string;exemption?:ModelExemption};
export type ModelLine={number:number;cabys:string;sku:string;quantity:string;unit:string;detail:string;unitPrice:string;total:string;discount?:{amount:string;code:string;nature:string};subtotal:string;base:string;taxes:ModelTax[];assumed:string;netTax:string;lineTotal:string;service:boolean};
export type ModelCharge={code:string;otherDetail:string;thirdParty:{idType:string;id:string;name:string}|null;detail:string;percent:string;amount:string};
export type ModelParty={name:string;idType:string;idNumber:string;commercialName:string;email:string;phone:string};
export type EinvoiceModel={
 docType:EinvoiceDocType;providerSystems:string;activityCode:string;receiverActivity:string;
 emisor:EmisorSettings;receptor:ModelParty|null;saleCondition:string;creditDays:number;paymentMethod:string;
 lines:ModelLine[];charges:ModelCharge[];summary:EinvoiceSummary;
 reference:{docType:string;number:string;issuedAt:string;code:string;reason:string}|null;
 notes:string;draftTitle:string;
};
export type EinvoiceSummary={currency:'CRC'|'USD';exchangeRate:string;servTaxed:string;servExempt:string;servExonerated:string;servNotSubject:string;mercTaxed:string;mercExempt:string;mercExonerated:string;mercNotSubject:string;
 taxed:string;exempt:string;exonerated:string;notSubject:string;sale:string;discounts:string;netSale:string;breakdown:{code:string;vatCode:string;amount:string}[];tax:string;assumed:string;ivaReturned:string;otherCharges:string;
 paymentMethods:{code:string;other:string;amount:string}[];total:string};
export type ValidationIssue={field:string;es:string;en:string};
const issue=(field:string,es:string,en:string):ValidationIssue=>({field,es,en});

function modelLine(line:EditableInvoiceLine,index:number):{line:ModelLine;issues:ValidationIssue[]}{
 const issues:ValidationIssue[]=[],n=index+1,a=lineAmounts(line);
 if(!/^\d{13}$/.test(line.cabys))issues.push(issue(`lines.${n}.cabys`,`Línea ${n}: indique el código CAByS de 13 dígitos.`,`Line ${n}: enter the 13-digit CAByS code.`));
 if(line.taxTreatment==='pending')issues.push(issue(`lines.${n}.tax`,`Línea ${n}: defina el IVA (tarifa, exenta o no sujeta).`,`Line ${n}: set the VAT (rate, exempt or not subject).`));
 const unit=line.unit||'Sp';
 if(!UNITS.includes(unit))issues.push(issue(`lines.${n}.unit`,`Línea ${n}: la unidad "${line.unit}" no está en la nota 15 de Hacienda (use Sp, Unid, m², h…).`,`Line ${n}: unit "${line.unit}" is not in Hacienda note 15 (use Sp, Unid, m², h…).`));
 if(units(line.quantity)%BigInt('100')!==ZERO)issues.push(issue(`lines.${n}.quantity`,`Línea ${n}: la cantidad admite hasta 3 decimales.`,`Line ${n}: quantity allows up to 3 decimals.`));
 if(line.description.length<3)issues.push(issue(`lines.${n}.detail`,`Línea ${n}: la descripción necesita al menos 3 caracteres.`,`Line ${n}: the description needs at least 3 characters.`));
 const vatCode=line.tax?.vatCode??(line.taxTreatment==='exempt'?'10':line.taxTreatment==='not_subject'?'11':Object.entries(VAT_RATES).find(([code,rate])=>!['01','10','11'].includes(code)&&units(rate)===units(line.taxRate))?.[0]??(units(line.taxRate)===ZERO?'01':''));
 if(line.taxTreatment!=='pending'&&!vatCode)issues.push(issue(`lines.${n}.tax`,`Línea ${n}: la tarifa ${line.taxRate} % no corresponde a un código de IVA vigente.`,`Line ${n}: rate ${line.taxRate}% is not a current VAT code.`));
 const taxes:ModelTax[]=[];
 for(const special of line.specialTaxes??[]){
  const amount=specialTaxAmounts(line.quantity,a.net,[special]).specialTax;
  const proportion=special.code==='04'?roundDivide(units(special.quantityPerUnit)*units(special.alcohol?.percentage??'0'),HUNDRED*SCALE):null;
  taxes.push({code:special.code,...(special.code==='02'||special.code==='12'?{rate:rate2(special.rate)}:{specific:{quantity:special.quantityPerUnit?rate2(special.quantityPerUnit):undefined,percent:special.alcohol?rate2(special.alcohol.percentage):undefined,proportion:proportion!==null?money5(proportion):undefined,volume:special.beverage?rate2(special.beverage.referenceVolume):undefined,unitTax:special.amountPerUnit?money5(units(special.amountPerUnit)):undefined}}),amount:money5(amount)});
 }
 const exemption=line.tax?.exemption&&line.taxTreatment==='vat'?{type:line.tax.exemption.documentType,typeOther:line.tax.exemption.documentOther,number:line.tax.exemption.documentNumber,article:line.tax.exemption.article,clause:line.tax.exemption.paragraph,institution:line.tax.exemption.institution,institutionOther:line.tax.exemption.institutionOther,issuedOn:line.tax.exemption.issuedOn,rate:rate2(line.tax.exemption.rate),amount:money5(a.exonerated)}:undefined;
 taxes.push({code:'01',vatCode:vatCode||'08',rate:rate2(line.taxTreatment==='vat'?line.taxRate:'0'),amount:money5(a.grossTax),...(exemption?{exemption}:{})});
 const service=line.kind==='service'||SERVICE_UNITS.includes(unit);
 return {issues,line:{number:n,cabys:line.cabys,sku:line.sku,quantity:qty3(line.quantity),unit,detail:line.description.slice(0,200),unitPrice:money5(units(line.unitPrice)),total:money5(a.gross),
  ...(a.discount>ZERO?{discount:{amount:money5(a.discount),code:DISCOUNT_CODE,nature:line.discountReason.slice(0,80)}}:{}),
  subtotal:money5(a.net),base:money5(a.vatBase),taxes,assumed:money5(ZERO),netTax:money5(a.totalTax),lineTotal:money5(a.total),service}};
}
function modelCharge(charge:InvoiceCharge):ModelCharge{
 const amount=charge.mode==='percent'?roundDivide(units(charge.base)*units(charge.value),HUNDRED*SCALE):units(charge.value);
 return {code:charge.code,otherDetail:charge.otherDetail,thirdParty:charge.thirdParty,detail:charge.description.slice(0,160),percent:charge.mode==='percent'?money5(units(charge.value)):'',amount:money5(amount)};
}
/** Summary (ResumenFactura) recomputed from the model lines: the same function for FE, TE and NC. */
export type SummaryCurrency={code:'CRC'|'USD';exchangeRate:string};
/** CodigoTipoMoneda: CRC → TipoCambio 1.00000; USD needs the BCCR sell rate of the issue date (5 decimals). */
export const CRC:SummaryCurrency={code:'CRC',exchangeRate:'1.00000'};
export function summarize(lines:ModelLine[],charges:ModelCharge[],paymentMethod:string,currency:SummaryCurrency=CRC):EinvoiceSummary{
 if(!/^\d{1,13}\.\d{5}$/.test(currency.exchangeRate)||parseMoney5(currency.exchangeRate)<=ZERO||currency.code==='CRC'&&currency.exchangeRate!=='1.00000')throw RangeError('exchangeRate');
 const sum={servTaxed:ZERO,servExempt:ZERO,servExonerated:ZERO,servNotSubject:ZERO,mercTaxed:ZERO,mercExempt:ZERO,mercExonerated:ZERO,mercNotSubject:ZERO,discounts:ZERO,tax:ZERO};
 const breakdown=new Map<string,bigint>();
 for(const line of lines){
  const total=parseMoney5(line.total),vat=line.taxes.find(tax=>tax.code==='01')!,prefix=line.service?'serv':'merc';
  if(vat.vatCode==='10')sum[`${prefix}Exempt`]+=total;
  else if(vat.vatCode==='11')sum[`${prefix}NotSubject`]+=total;
  else if(vat.exemption&&units(vat.rate??'0')>ZERO){
   const exonerated=roundDivide(total*units(vat.exemption.rate),units(vat.rate!));
   sum[`${prefix}Exonerated`]+=exonerated;sum[`${prefix}Taxed`]+=total-exonerated;
  }else sum[`${prefix}Taxed`]+=total;
  if(line.discount)sum.discounts+=parseMoney5(line.discount.amount);
  sum.tax+=parseMoney5(line.netTax);
  for(const tax of line.taxes){const key=tax.code+':'+(tax.code==='01'?tax.vatCode:'');breakdown.set(key,(breakdown.get(key)??ZERO)+parseMoney5(tax.amount)-(tax.exemption?parseMoney5(tax.exemption.amount):ZERO));}
 }
 const taxed=sum.servTaxed+sum.mercTaxed,exempt=sum.servExempt+sum.mercExempt,exonerated=sum.servExonerated+sum.mercExonerated,notSubject=sum.servNotSubject+sum.mercNotSubject;
 const sale=taxed+exempt+exonerated+notSubject,netSale=sale-sum.discounts,otherCharges=charges.reduce((total,charge)=>total+parseMoney5(charge.amount),ZERO),total=netSale+sum.tax+otherCharges;
 return {currency:currency.code,exchangeRate:currency.exchangeRate,servTaxed:money5(sum.servTaxed),servExempt:money5(sum.servExempt),servExonerated:money5(sum.servExonerated),servNotSubject:money5(sum.servNotSubject),
  mercTaxed:money5(sum.mercTaxed),mercExempt:money5(sum.mercExempt),mercExonerated:money5(sum.mercExonerated),mercNotSubject:money5(sum.mercNotSubject),
  taxed:money5(taxed),exempt:money5(exempt),exonerated:money5(exonerated),notSubject:money5(notSubject),sale:money5(sale),discounts:money5(sum.discounts),netSale:money5(netSale),
  breakdown:[...breakdown.entries()].map(([key,amount])=>{const [code,vatCode]=key.split(':');return {code:code!,vatCode:vatCode??'',amount:money5(amount)};}),
  tax:money5(sum.tax),assumed:money5(ZERO),ivaReturned:money5(ZERO),otherCharges:money5(otherCharges),paymentMethods:[{code:paymentMethod,other:paymentMethod==='99'?'Otros medios acordados':'',amount:money5(total)}],total:money5(total)};
}
const digits=(value:string)=>value.replace(/\D/g,'');
function party(draft:InvoiceDraft):{party:ModelParty|null;issues:ValidationIssue[];complete:boolean}{
 const r=draft.receiver,issues:ValidationIssue[]=[];
 const idType=r.identificationType?ID_TYPES[r.identificationType as keyof typeof ID_TYPES]??'':'',idNumber=r.identification.replace(/[\s-]/g,'');
 if(r.name.trim().length<3)issues.push(issue('receiver.name','El receptor necesita un nombre de 3 a 100 caracteres.','The recipient needs a 3–100 character name.'));
 if(!idType)issues.push(issue('receiver.identificationType','Indique el tipo de identificación del receptor (datos fiscales del borrador).','Set the recipient’s identification type (draft fiscal details).'));
 else if(!idNumberValid(idType,idNumber))issues.push(issue('receiver.identification','La identificación del receptor no coincide con su tipo.','The recipient’s identification does not match its type.'));
 const phone=digits(r.phone).replace(/^506(?=\d{8}$)/,'');
 const complete=issues.length===0;
 return {complete,issues,party:{name:r.name.trim().slice(0,100),idType,idNumber,commercialName:'',email:r.email.trim(),phone:phone.length>=8&&phone.length<=20?phone:''}};
}
export type BuildResult={ok:true;model:EinvoiceModel;totalCents:number;taxCents:number}|{ok:false;issues:ValidationIssue[]};
/** FE (01) or TE (04) from a draft. */
export function buildFromDraft(draft:InvoiceDraft,settings:EmisorSettings|null,docType:'01'|'04'):BuildResult{
 const issues:ValidationIssue[]=[];
 const emisor=settings?emisorSettingsSchema.safeParse(settings):null;
 if(!emisor||!emisor.success)issues.push(issue('settings','Complete los datos del emisor en Empresa › Integraciones › Hacienda.','Complete the issuer details in Company › Integrations › Hacienda.'));
 const detail=draft.editedDetail;
 if(!detail||!detail.lines.length)issues.push(issue('lines','Edite el detalle de factura: cada línea necesita CAByS, unidad e impuesto.','Edit the invoice details: every line needs CAByS, unit and tax.'));
 const built=(detail?.lines??[]).map(modelLine);for(const row of built)issues.push(...row.issues);
 const prep=draft.preparation;
 const saleCondition=prep?.saleCondition?SALE_CONDITIONS[prep.saleCondition]:'';
 if(!saleCondition)issues.push(issue('preparation.saleCondition','Indique la condición de venta (contado o crédito) en el borrador.','Set the sale condition (cash or credit) on the draft.'));
 if(prep?.saleCondition==='credit'&&!(prep.creditDays>0))issues.push(issue('preparation.creditDays','Para crédito indique el plazo en días.','For credit, set the term in days.'));
 const paymentMethod=prep?.paymentMethod?PAYMENT_METHODS[prep.paymentMethod]:'';
 if(!paymentMethod)issues.push(issue('preparation.paymentMethod','Indique el medio de pago en el borrador.','Set the payment method on the draft.'));
 const receiver=party(draft);
 let receptor:ModelParty|null=null;
 if(docType==='01'){issues.push(...receiver.issues);if(receiver.party?.idType==='05')issues.push(issue('receiver.identificationType','En factura electrónica no se usa "extranjero no domiciliado" (salvo mercancía no nacionalizada); emita un tiquete.','An electronic invoice cannot use "non-resident foreigner" here; issue a ticket.'));receptor=receiver.party;}
 else if(receiver.complete)receptor=receiver.party;
 if(receptor?.email&&!z.string().email().safeParse(receptor.email).success)issues.push(issue('receiver.email','El correo del receptor no es válido.','The recipient email is invalid.'));
 const charges=(draft.charges??[]).map(modelCharge);
 if(issues.length||!emisor?.success)return {ok:false,issues};
 const lines=built.map(row=>row.line),summary=summarize(lines,charges,paymentMethod);
 const totalCents=centsOf(parseMoney5(summary.total)),taxCents=centsOf(parseMoney5(summary.tax));
 if(totalCents!==draft.totalCents)return {ok:false,issues:[issue('totals',`El total calculado (${summary.total}) no coincide con el del borrador. Vuelva a guardar el detalle de factura.`,`The computed total (${summary.total}) does not match the draft. Save the invoice details again.`)]};
 if(totalCents<=0)return {ok:false,issues:[issue('totals','El total debe ser mayor que cero.','The total must be greater than zero.')]};
 const activity=digits(draft.receiver.activity??'');
 return {ok:true,totalCents,taxCents,model:{docType,providerSystems:emisor.data.providerSystems,activityCode:emisor.data.activityCode,receiverActivity:docType==='01'&&activity.length===6?activity:'',
  emisor:emisor.data,receptor,saleCondition,creditDays:prep?.saleCondition==='credit'?prep.creditDays:0,paymentMethod,lines,charges,summary,reference:null,notes:draft.notes.slice(0,500),draftTitle:draft.title}};
}
/** Credit note (03) referencing an accepted original: whole document (code 01) or selected lines (code 02). */
export function buildCreditNote(original:EinvoiceModel,ref:{clave:string;issuedAt:string;docType:'01'|'04'},input:{code:'01'|'02';reason:string;lines:number[]}):BuildResult{
 const reason=input.reason.trim();
 if(reason.length<5||reason.length>180)return {ok:false,issues:[issue('reason','Explique el motivo de la nota (5 a 180 caracteres).','Explain the reason (5–180 characters).')]};
 const lines=input.code==='01'?original.lines:original.lines.filter(line=>input.lines.includes(line.number));
 if(!lines.length)return {ok:false,issues:[issue('lines','Elija al menos una línea para acreditar.','Choose at least one line to credit.')]};
 const renumbered=lines.map((line,index)=>({...line,number:index+1})),charges=input.code==='01'?original.charges:[];
 const summary=summarize(renumbered,charges,original.paymentMethod,{code:original.summary.currency,exchangeRate:original.summary.exchangeRate});
 return {ok:true,totalCents:centsOf(parseMoney5(summary.total)),taxCents:centsOf(parseMoney5(summary.tax)),model:{...original,docType:'03',lines:renumbered,charges,summary,
  reference:{docType:ref.docType,number:ref.clave,issuedAt:ref.issuedAt,code:input.code,reason}}};
}

/**
 * Ronda F2-A: debit note (02) against an ACCEPTED FE/TE — an amount added after the fact (price difference, extra
 * work, interest). One line that inherits CAByS, unit, kind and VAT code of the referenced original line; the tax is
 * recomputed at that rate (half away from zero at 5 decimals). Reference code 02 «Corrige monto». The SQL never
 * caps a debit note (it adds to what the customer owes).
 */
export function buildDebitNote(original:EinvoiceModel,ref:{clave:string;issuedAt:string;docType:'01'|'04'},input:{reason:string;lineNumber:number;amount:string;detail?:string}):BuildResult{
 const reason=input.reason.trim();
 if(reason.length<5||reason.length>180)return {ok:false,issues:[issue('reason','Explique el motivo de la nota (5 a 180 caracteres).','Explain the reason (5–180 characters).')]};
 const source=original.lines.find(line=>line.number===input.lineNumber);
 if(!source)return {ok:false,issues:[issue('lines','Elija la línea del original a la que corresponde el cargo.','Choose the original line the charge belongs to.')]};
 if(!/^\d{1,13}(\.\d{1,5})?$/.test(input.amount.trim()))return {ok:false,issues:[issue('amount','Indique un monto mayor que cero (hasta 5 decimales).','Enter an amount greater than zero (up to 5 decimals).')]};
 const amount=units(input.amount.trim());
 if(amount<=ZERO)return {ok:false,issues:[issue('amount','Indique un monto mayor que cero (hasta 5 decimales).','Enter an amount greater than zero (up to 5 decimals).')]};
 const vat=source.taxes.find(tax=>tax.code==='01');
 const rate=vat?.rate?units(vat.rate):ZERO,tax=roundDivide(amount*rate,HUNDRED*SCALE);
 const detail=(input.detail?.trim()||reason).slice(0,200);
 const line:ModelLine={number:1,cabys:source.cabys,sku:source.sku,quantity:'1.000',unit:source.unit,detail:detail.length>=3?detail:reason,unitPrice:money5(amount),total:money5(amount),
  subtotal:money5(amount),base:money5(amount),taxes:[{code:'01',vatCode:vat?.vatCode||'08',rate:vat?.rate??'0.00',amount:money5(tax)}],assumed:money5(ZERO),netTax:money5(tax),lineTotal:money5(amount+tax),service:source.service};
 const summary=summarize([line],[],original.paymentMethod,{code:original.summary.currency,exchangeRate:original.summary.exchangeRate});
 return {ok:true,totalCents:centsOf(parseMoney5(summary.total)),taxCents:centsOf(parseMoney5(summary.tax)),model:{...original,docType:'02',lines:[line],charges:[],summary,
  reference:{docType:ref.docType,number:ref.clave,issuedAt:ref.issuedAt,code:'02',reason}}};
}
