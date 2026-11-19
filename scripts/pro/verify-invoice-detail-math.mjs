import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
// Native Node's TypeScript stripping does not resolve extensionless TS imports.
registerHooks({resolve(specifier,context,next){return next(['./invoice-tax','./invoice-extras'].includes(specifier)?specifier+'.ts':specifier,context);}});
const {invoiceDetailSchema,blankInvoiceLine,detailAmounts,sourceDetail,lineAmounts,decimalUnits,invoiceAmounts}=await import('../../src/lib/pro/invoice-detail.ts');
const {taxSchema,VAT_OPTIONS,EXEMPTION_DOCUMENTS,EXEMPTION_INSTITUTIONS,blankExemption}=await import('../../src/lib/pro/invoice-tax.ts');
const line=(extra={})=>({...blankInvoiceLine(),description:'Prueba',taxTreatment:'vat',taxRate:'13',...extra});
const calc=lines=>detailAmounts(invoiceDetailSchema.parse(lines));
assert.equal(calc([line({quantity:'2',unitPrice:'100',discount:'10'})]).totalCents,20340);
assert.equal(calc([line({quantity:'1.5',unitPrice:'100.12345',discountType:'amount',discount:'0.18518'})]).totalCents,16950);
assert.equal(calc([line({quantity:'0,1',unitPrice:'0,1',taxTreatment:'exempt',taxRate:'0'})]).totalCents,1);
assert.equal(calc([line({unitPrice:'1.005',taxTreatment:'not_subject',taxRate:'0'})]).totalCents,101);
assert.equal(calc([line({unitPrice:'100',discount:'100'})]).totalCents,0);
assert.equal(calc([line({unitPrice:'100',taxTreatment:'pending',taxRate:'0'})]).taxCents,0);
assert.equal(calc(Array.from({length:100},()=>line({quantity:'0.00001',unitPrice:'500',taxTreatment:'exempt',taxRate:'0'}))).totalCents,50);
for(const bad of [{quantity:'0'},{quantity:'-1'},{quantity:'1e2'},{quantity:'0.000001'},{quantity:'abc'},{unitPrice:'NaN'},{unitPrice:'Infinity'},{unitPrice:'1.000001'},{discount:'100.00001'},{discountType:'amount',discount:'101',unitPrice:'100'},{taxTreatment:'exempt',taxRate:'13'},{taxRate:'100.00001'},{cabys:'123'},{productId:'p',kind:'service'}])assert.equal(invoiceDetailSchema.safeParse([line(bad)]).success,false,JSON.stringify(bad));
assert.equal(invoiceDetailSchema.safeParse([]).success,false);assert.equal(invoiceDetailSchema.safeParse(Array.from({length:101},()=>line())).success,false);
assert.equal(invoiceDetailSchema.safeParse([line({quantity:'2',unitPrice:'100000000'})]).success,false);
assert.equal(sourceDetail([{description:'Conservar cero',quantity:1,unitAmount:0,taxRate:0}])[0].unitPrice,'0');
assert.equal(sourceDetail([{description:'No inferir exento',quantity:1,unitAmount:100,taxRate:0}])[0].taxTreatment,'pending');
console.log('PASS exact BigInt draft arithmetic, fractional quantities/prices, both discounts, boundary rounding, summed precision, zero, invalid syntax/CABYS/tax and caps.');

// Legacy/no-key inputs stay byte-for-byte compatible at the domain boundary.
assert.equal(Object.hasOwn(blankInvoiceLine(),'tax'),false);
assert.equal(Object.hasOwn(sourceDetail([{description:'Original',quantity:1,unitAmount:100,taxRate:13}])[0],'tax'),false);
const old=line({unitPrice:'100'});assert.deepEqual(invoiceDetailSchema.parse([old]),[old]);
assert.deepEqual(invoiceDetailSchema.parse([{...old,tax:null}]),[{...old,tax:null}]);
assert.equal(calc([old]).grossTax,BigInt('1300000'));assert.equal(calc([old]).exonerated,BigInt('0'));
const exemption=(extra={})=>({documentType:'04',documentOther:'',documentNumber:'AL-123-CR',article:'',paragraph:'',institution:'01',institutionOther:'',issuedOn:'2024-02-29',rate:'5',...extra});
const taxed=(extra={},ex=exemption())=>line({unitPrice:'100',tax:{vatCode:'08',exemption:ex},...extra});
const partial=calc([taxed()]);assert.equal(partial.grossTax,BigInt('1300000'));assert.equal(partial.exonerated,BigInt('500000'));assert.equal(partial.tax,BigInt('800000'));assert.equal(partial.taxCents,800);assert.equal(partial.totalCents,10800);
const full=calc([taxed({},exemption({rate:'13'}))]);assert.equal(full.tax,BigInt('0'));assert.equal(full.totalCents,10000);
const discounted=calc([taxed({quantity:'2',unitPrice:'100',discount:'10'},exemption({rate:'5'}))]);assert.equal(discounted.net,BigInt('18000000'));assert.equal(discounted.grossTax,BigInt('2340000'));assert.equal(discounted.exonerated,BigInt('900000'));assert.equal(discounted.tax,BigInt('1440000'));assert.equal(discounted.totalCents,19440);
const fixedDiscount=calc([taxed({quantity:'1.5',unitPrice:'100.12345',discountType:'amount',discount:'0.18518'})]);assert.equal(fixedDiscount.net,BigInt('15000000'));assert.equal(fixedDiscount.totalCents,16200);
const zero=calc([taxed({discount:'100'})]);assert.equal(zero.grossTax,BigInt('0'));assert.equal(zero.exonerated,BigInt('0'));assert.equal(zero.totalCents,0);
const tiny=calc([taxed({unitPrice:'0.0001'},exemption({rate:'5'}))]);assert.equal(tiny.grossTax,BigInt('1'));assert.equal(tiny.exonerated,BigInt('1'));assert.equal(tiny.tax,BigInt('0'));
const fractional=calc([taxed({taxRate:'0.5',tax:{vatCode:'09',exemption:exemption({rate:'0,25'})}})]);assert.equal(fractional.taxCents,25);assert.equal(fractional.totalCents,10025);
const exactLine=lineAmounts(invoiceDetailSchema.parse([taxed({quantity:'0.00001',unitPrice:'1.23456'},exemption({rate:'4.25'}))])[0]);assert.equal(exactLine.gross,BigInt('1'));assert.equal(exactLine.tax,BigInt('0'));
const multi=calc([taxed(),taxed({},exemption({rate:'13'})),old]);assert.equal(multi.grossTax,BigInt('3900000'));assert.equal(multi.exonerated,BigInt('1800000'));assert.equal(multi.taxCents,2100);assert.equal(multi.totalCents,32100);
for(const option of VAT_OPTIONS){const treatment=option.code==='10'?'exempt':option.code==='11'?'not_subject':'vat';assert.equal(invoiceDetailSchema.safeParse([line({taxTreatment:treatment,taxRate:option.rate,tax:{vatCode:option.code,exemption:null}})]).success,true,option.code);}
for(const vatCode of ['05','06','07','00','99'])assert.equal(taxSchema.safeParse({vatCode,exemption:null}).success,false);
for(const extra of [{documentType:'01'},{documentType:'05'},{documentType:'06'},{documentType:'07'},{documentType:'11'},{documentType:'99',documentOther:'four'},{documentType:'99',documentOther:'x'.repeat(101)},{documentOther:'No corresponde'},{documentNumber:'ab'},{documentNumber:'x'.repeat(41)},{article:'0'},{article:'1234567'},{article:'1.1'},{article:'-1'},{paragraph:'1'},{article:'1',paragraph:'1234567'},{article:'1',paragraph:'a'},{institution:'00'},{institution:'13'},{institution:'99',institutionOther:'four'},{institution:'99',institutionOther:'x'.repeat(161)},{institutionOther:'No corresponde'},{issuedOn:'2023-02-29'},{issuedOn:'2026-04-31'},{issuedOn:'2026-13-01'},{issuedOn:'2026-01-01T00:00:00Z'},{rate:'0'},{rate:'13.01'},{rate:'0.001'},{rate:'-1'},{rate:'1e1'},{rate:'Infinity'}])assert.equal(taxSchema.safeParse({vatCode:'08',exemption:exemption(extra)}).success,false,JSON.stringify(extra));
for(const documentType of ['02','03','08']){assert.equal(taxSchema.safeParse({vatCode:'08',exemption:exemption({documentType})}).success,false);assert.equal(taxSchema.safeParse({vatCode:'08',exemption:exemption({documentType,article:'1'})}).success,true);}
for(const documentType of ['04','09','10'])assert.equal(taxSchema.safeParse({vatCode:'08',exemption:exemption({documentType,article:'',paragraph:''})}).success,true);
assert.equal(taxSchema.parse({vatCode:'08',exemption:exemption()}).exemption.documentNumber,'AL-123-CR');
assert.equal(taxSchema.safeParse({vatCode:'08',exemption:exemption({documentType:'99',documentOther:'Autorización propia',institution:'99',institutionOther:'Institución propia',article:'12',paragraph:'0'})}).success,true);
for(const extra of [{taxRate:'4',tax:{vatCode:'08',exemption:null}},{taxTreatment:'pending',taxRate:'0',tax:{vatCode:'01',exemption:null}},{taxTreatment:'vat',taxRate:'0',tax:{vatCode:'10',exemption:null}},{taxTreatment:'exempt',taxRate:'0',tax:{vatCode:'11',exemption:null}},{taxTreatment:'not_subject',taxRate:'0',tax:{vatCode:'10',exemption:null}},{taxRate:'4',tax:{vatCode:'04',exemption:exemption({rate:'5'})}},{taxRate:'0',tax:{vatCode:'01',exemption:exemption({rate:'0.5'})}},{taxTreatment:'exempt',taxRate:'0',tax:{vatCode:'10',exemption:exemption()}},{taxTreatment:'not_subject',taxRate:'0',tax:{vatCode:'11',exemption:exemption()}}])assert.equal(invoiceDetailSchema.safeParse([line(extra)]).success,false,JSON.stringify(extra));
assert.deepEqual(blankExemption(),{documentType:'',documentOther:'',documentNumber:'',article:'',paragraph:'',institution:'01',institutionOther:'',issuedOn:'',rate:''});
assert.equal(taxSchema.safeParse({vatCode:'08',exemption:blankExemption()}).success,false);
assert.equal(EXEMPTION_DOCUMENTS.length,7);assert.equal(EXEMPTION_INSTITUTIONS.length,13);assert.equal(decimalUnits('0.5'),BigInt('50000'));
console.log('PASS ordinary VAT codes, exemption metadata/date/legal basis, partial/full rates, discount base, five-decimal rounding, mixed sums and untouched legacy inputs.');

// The legacy SQL writer enforces its header cap before subtracting exemptions.
const grossCap=invoiceDetailSchema.safeParse([taxed({unitPrice:'99000000'},exemption({rate:'13'}))]);
assert.equal(grossCap.success,false);
assert.ok(grossCap.error.issues.some(issue=>issue.message==='El total antes de exoneración supera el límite del borrador.'));
assert.equal(calc([taxed({unitPrice:'88000000'},exemption({rate:'13'}))]).totalCents,8800000000);
console.log('PASS conservative draft cap before exemption, including full-exemption boundary.');

assert.equal(taxSchema.safeParse({vatCode:'08',exemption:{...blankExemption(),documentType:'04',documentNumber:'AUT-LOCAL',issuedOn:'0000-01-01',rate:'8'}}).success,false);
console.log('PASS reject year zero before PostgreSQL date conversion.');

const {specialTaxesSchema,invoiceChargesSchema,specialTaxAmounts,chargeAmounts,blankSpecialTax}=await import('../../src/lib/pro/invoice-extras.ts');
const cement={code:'12',rate:'5',quantityPerUnit:'',amountPerUnit:''};
const fuel={code:'03',rate:'',quantityPerUnit:'10',amountPerUnit:'50'};
const tobacco={code:'06',rate:'',quantityPerUnit:'20',amountPerUnit:'2.5'};
const extrasCalc=(extra={})=>calc([line({quantity:'2',unitPrice:'100',...extra})]);
assert.equal(Object.hasOwn(blankInvoiceLine(),'specialTaxes'),false);assert.equal(Object.hasOwn(sourceDetail([{description:'Original',quantity:1,unitAmount:100,taxRate:13}])[0],'specialTaxes'),false);
const cementTotals=extrasCalc({specialTaxes:[cement]});assert.equal(cementTotals.net,BigInt('20000000'));assert.equal(cementTotals.specialTax,BigInt('1000000'));assert.equal(cementTotals.vatBase,BigInt('21000000'));assert.equal(cementTotals.grossTax,BigInt('2730000'));assert.equal(cementTotals.taxCents,3730);assert.equal(cementTotals.vatCents,2730);assert.equal(cementTotals.totalCents,23730);
const fuelTotals=extrasCalc({specialTaxes:[fuel]});assert.equal(fuelTotals.specialTax,BigInt('50000000'));assert.equal(fuelTotals.vatBase,BigInt('20000000'));assert.equal(fuelTotals.totalCents,72600); // Total liters, never multiply by line quantity again.
const tobaccoTotals=extrasCalc({specialTaxes:[tobacco]});assert.equal(tobaccoTotals.specialTax,BigInt('10000000'));assert.equal(tobaccoTotals.vatBase,BigInt('20000000'));assert.equal(tobaccoTotals.totalCents,32600);
const combined=extrasCalc({discount:'10',specialTaxes:[cement,fuel,tobacco]});assert.equal(combined.net,BigInt('18000000'));assert.equal(combined.specialTax,BigInt('60900000'));assert.equal(combined.vatBase,BigInt('18900000'));assert.equal(combined.grossTax,BigInt('2457000'));assert.equal(combined.taxCents,63357);assert.equal(combined.totalCents,81357);
const cementExonerated=extrasCalc({specialTaxes:[cement],tax:{vatCode:'08',exemption:exemption({rate:'13'})}});assert.equal(cementExonerated.exonerated,BigInt('2730000'));assert.equal(cementExonerated.tax,BigInt('0'));assert.equal(cementExonerated.taxCents,1000);assert.equal(cementExonerated.totalCents,21000);
assert.deepEqual(specialTaxAmounts('0.12345',decimalUnits('12.34567'),[{...tobacco,quantityPerUnit:'1.23',amountPerUnit:'0.12345'}]),{specialTax:BigInt('1875'),vatBaseExtra:BigInt('0')});
for(const bad of [[cement,cement],[{...cement,code:'02'}],[{...cement,code:'04'}],[{...cement,code:'99'}],[{...cement,rate:''}],[{...cement,rate:'0'}],[{...cement,rate:'100.01'}],[{...cement,rate:'5.001'}],[{...cement,quantityPerUnit:'1'}],[{...cement,amountPerUnit:'1'}],[{...fuel,rate:'5'}],[{...fuel,quantityPerUnit:''}],[{...fuel,quantityPerUnit:'0'}],[{...fuel,quantityPerUnit:'1.001'}],[{...fuel,quantityPerUnit:'100000'}],[{...fuel,amountPerUnit:''}],[{...fuel,amountPerUnit:'0'}],[{...fuel,amountPerUnit:'100000001'}],[{...fuel,amountPerUnit:'1e2'}],[cement,fuel,tobacco,cement]])assert.equal(specialTaxesSchema.safeParse(bad).success,false,JSON.stringify(bad));
assert.equal(invoiceDetailSchema.safeParse([line({unitPrice:'88000000',specialTaxes:[cement]})]).success,false); // Cap includes specific taxes and VAT on the expanded base.
const charge=(extra={})=>({code:'01',otherDetail:'',description:'Cargo registrado',mode:'amount',value:'10',base:'',thirdParty:null,...extra});
const charges=invoiceChargesSchema.parse([charge(),charge({code:'06',mode:'percent',value:'10',base:'200'})]);assert.equal(chargeAmounts(charges),BigInt('3000000'));
const invoice=invoiceAmounts(invoiceDetailSchema.parse([line({quantity:'2',unitPrice:'100',specialTaxes:[cement]})]),charges);assert.equal(invoice.chargeTotal,BigInt('3000000'));assert.equal(invoice.otherCharges,invoice.chargeTotal);assert.equal(invoice.totalCents,26730);assert.equal(invoice.taxCents,3730);assert.equal(invoice.beforeExemptionCents,26730);
const tinyCharge=invoiceChargesSchema.parse([charge({mode:'percent',value:'5',base:'0.0001'})]);assert.equal(chargeAmounts(tinyCharge),BigInt('1'));
for(const bad of [{code:'11'},{code:'99',otherDetail:''},{code:'99',otherDetail:'four'},{code:'99',otherDetail:'x'.repeat(101)},{otherDetail:'Unexpected'},{description:''},{description:'x'.repeat(161)},{value:'0'},{value:'-1'},{value:'1e2'},{value:'100000001'},{value:'0.000001'},{base:'1'},{mode:'percent',base:''},{mode:'percent',base:'0'},{mode:'percent',base:'1',value:'100.00001'},{mode:'percent',base:'0.00001',value:'0.00001'},{code:'06'},{code:'06',mode:'percent',base:'100',value:'9.99'},{code:'04'},{code:'04',thirdParty:{idType:'01',id:'012345678',name:'Nombre válido'}},{code:'04',thirdParty:{idType:'01',id:'123456789',name:'four'}},{code:'04',thirdParty:{idType:'03',id:'1234567890',name:'Nombre válido'}},{code:'04',thirdParty:{idType:'04',id:'A123456789',name:'Nombre válido'}}])assert.equal(invoiceChargesSchema.safeParse([charge(bad)]).success,false,JSON.stringify(bad));
for(const thirdParty of [{idType:'01',id:'123456789',name:'Nombre válido'},{idType:'02',id:'3A12345678',name:'Entidad válida'},{idType:'03',id:'12345678901',name:'Nombre DIMEX'},{idType:'03',id:'123456789012',name:'Nombre DIMEX'},{idType:'04',id:'0123456789',name:'Nombre NITE'}])assert.equal(invoiceChargesSchema.safeParse([charge({code:'04',thirdParty})]).success,true);
assert.equal(invoiceChargesSchema.safeParse([charge({code:'99',otherDetail:'Descripción propia'})]).success,true);
assert.equal(invoiceChargesSchema.safeParse(Array.from({length:15},()=>charge())).success,true);assert.equal(invoiceChargesSchema.safeParse(Array.from({length:16},()=>charge())).success,false);
assert.deepEqual(invoiceChargesSchema.parse([]),[]);assert.equal(invoiceAmounts(invoiceDetailSchema.parse([old])).totalCents,calc([old]).totalCents);
console.log('PASS ordinary cement/fuel/tobacco formulas, IVA base/exemption, special-tax precision/caps, charges/third parties and unchanged defaults.');

const nativeExample=invoiceAmounts(invoiceDetailSchema.parse([line({unitPrice:'10000',specialTaxes:[cement]})]),invoiceChargesSchema.parse([charge({value:'250'})]));
assert.equal(nativeExample.specialTax,BigInt('50000000'));assert.equal(nativeExample.grossTax,BigInt('136500000'));assert.equal(nativeExample.chargeTotal,BigInt('25000000'));assert.equal(nativeExample.totalCents,1211500);
const combinedCap=invoiceAmounts(invoiceDetailSchema.parse([taxed({unitPrice:'88000000'},exemption({rate:'13'}))]),invoiceChargesSchema.parse([charge({value:'1000000'})]));
assert.equal(combinedCap.totalCents,8900000000);assert.equal(combinedCap.beforeExemptionCents,10044000000);assert.ok(combinedCap.beforeExemptionCents>10000000000); // API/UI reject even when the net after exemption fits.
const noExemptionCap=invoiceAmounts(invoiceDetailSchema.parse([line({unitPrice:'99500000',taxTreatment:'exempt',taxRate:'0'})]),invoiceChargesSchema.parse([charge({value:'1000000'})]));assert.equal(noExemptionCap.totalCents,10050000000);assert.equal(noExemptionCap.beforeExemptionCents,10050000000);
const thirdPartyError=invoiceChargesSchema.safeParse([charge({code:'04',thirdParty:{idType:'01',id:'123456789',name:'four'}})]);assert.equal(thirdPartyError.success,false);assert.ok(thirdPartyError.error.issues.some(issue=>issue.message==='El nombre del tercero debe tener al menos 5 caracteres.'));
console.log('PASS combined pre-exemption charge cap, native reference total and Spanish third-party validation.');

// v4 adds scoped metadata; the already-saved v3 tax shape is neither extended nor reinterpreted.
assert.deepEqual(specialTaxesSchema.parse([cement,fuel,tobacco]),[cement,fuel,tobacco]);
const selective={code:'02',rate:'10',quantityPerUnit:'',amountPerUnit:'',selective:{base:'9000',legalReference:'Ley 4961 artículo 10, base declarada'}};
const alcohol={code:'04',rate:'',quantityPerUnit:'350',amountPerUnit:'1',alcohol:{percentage:'5'}};
const beverage={code:'05',rate:'',quantityPerUnit:'500',amountPerUnit:'18',beverage:{kind:'beverage',referenceVolume:'250'}};
const newTaxCalc=(taxes,extra={})=>calc([line({unitPrice:'10000',specialTaxes:taxes,...extra})]);
const selectiveTotal=newTaxCalc([selective]);assert.equal(selectiveTotal.specialTax,BigInt('90000000'));assert.equal(selectiveTotal.vatBase,BigInt('1090000000'));assert.equal(selectiveTotal.totalCents,1231700);
const alcoholTotal=newTaxCalc([alcohol]);assert.equal(alcoholTotal.specialTax,BigInt('1750000'));assert.equal(alcoholTotal.vatBase,BigInt('1001750000'));assert.equal(alcoholTotal.grossTax,BigInt('130227500'));assert.equal(alcoholTotal.totalCents,1131978);
const beverageTotal=newTaxCalc([beverage]);assert.equal(beverageTotal.specialTax,BigInt('3600000'));assert.equal(beverageTotal.vatBase,BigInt('1003600000'));assert.equal(beverageTotal.totalCents,1134068);
const allSix=specialTaxesSchema.parse([selective,fuel,alcohol,beverage,tobacco,cement]);assert.equal(allSix.length,6);const sixTotal=newTaxCalc(allSix);assert.equal(sixTotal.specialTax,BigInt('200350000'));assert.equal(sixTotal.vatBase,BigInt('1145350000'));assert.equal(sixTotal.grossTax,BigInt('148895500'));assert.equal(sixTotal.totalCents,1349246);
const sixExempt=newTaxCalc(allSix,{tax:{vatCode:'08',exemption:exemption({rate:'13'})}});assert.equal(sixExempt.tax,BigInt('0'));assert.equal(sixExempt.exonerated,BigInt('148895500'));assert.equal(sixExempt.taxCents,200350);assert.equal(sixExempt.totalCents,1200350);
const sixDiscounted=newTaxCalc(allSix,{discount:'10'});assert.equal(sixDiscounted.specialTax,BigInt('195350000'));assert.equal(sixDiscounted.vatBase,BigInt('1040350000'));assert.equal(sixDiscounted.totalCents,1230596); // Explicit selective base is not inferred again after a line discount.
assert.deepEqual(specialTaxAmounts('1',BigInt('0'),[{...alcohol,quantityPerUnit:'0.01',amountPerUnit:'100',alcohol:{percentage:'0.15'}}]),{specialTax:BigInt('200'),vatBaseExtra:BigInt('200')}); // Round the mandatory proportion field first.
assert.deepEqual(specialTaxAmounts('3',BigInt('0'),[{...beverage,quantityPerUnit:'1',amountPerUnit:'1',beverage:{kind:'beverage',referenceVolume:'3'}}]),{specialTax:BigInt('100000'),vatBaseExtra:BigInt('100000')}); // Preserve the repeating ratio until the final rounding.
assert.deepEqual(specialTaxAmounts('1',BigInt('0'),[{...beverage,quantityPerUnit:'1',amountPerUnit:'1',beverage:{kind:'beverage',referenceVolume:'3'}}]),{specialTax:BigInt('33333'),vatBaseExtra:BigInt('33333')});
for(const bad of [
 {...selective,selective:undefined},{...selective,rate:''},{...selective,rate:'100'},{...selective,rate:'99.991'},{...selective,quantityPerUnit:'1'},{...selective,amountPerUnit:'1'},
 ...[{base:''},{base:'0'},{base:'-1'},{base:'1e2'},{base:'100000001'},{base:'1.000001'},{legalReference:''},{legalReference:'four'},{legalReference:'x'.repeat(161)}].map(extra=>({...selective,selective:{...selective.selective,...extra}})),
 {...alcohol,alcohol:undefined},{...alcohol,rate:'5'},{...alcohol,quantityPerUnit:''},{...alcohol,amountPerUnit:''},
 ...['','0','100','99.991','1e1','-1'].map(percentage=>({...alcohol,alcohol:{percentage}})),
 {...beverage,beverage:undefined},{...beverage,beverage:{kind:'soap',referenceVolume:'250'}},{...beverage,rate:'5'},
 ...['','0','-1','100000','1.001','1e2'].map(referenceVolume=>({...beverage,beverage:{kind:'beverage',referenceVolume}})),
 {...cement,selective:selective.selective},{...fuel,alcohol:alcohol.alcohol},{...tobacco,beverage:beverage.beverage},
 {...selective,alcohol:alcohol.alcohol},{...alcohol,beverage:beverage.beverage},{...beverage,selective:selective.selective},
])assert.equal(specialTaxesSchema.safeParse([bad]).success,false,JSON.stringify(bad));
assert.equal(specialTaxesSchema.safeParse([...allSix,selective]).success,false);assert.equal(specialTaxesSchema.safeParse([selective,selective]).success,false);
assert.equal(specialTaxesSchema.safeParse([{...selective,rate:'99.99',selective:{...selective.selective,base:'100000000'}}]).success,true);
assert.equal(specialTaxesSchema.safeParse([{...alcohol,quantityPerUnit:'99999.99',alcohol:{percentage:'99.99'}}]).success,true);
assert.equal(specialTaxesSchema.safeParse([{...beverage,beverage:{kind:'beverage',referenceVolume:'99999.99'}}]).success,true);
assert.deepEqual(blankSpecialTax('12'),cement);assert.deepEqual(blankSpecialTax('03'),{code:'03',rate:'',quantityPerUnit:'1',amountPerUnit:''});assert.deepEqual(blankSpecialTax('06'),{code:'06',rate:'',quantityPerUnit:'1',amountPerUnit:''});
assert.deepEqual(blankSpecialTax('02'),{code:'02',rate:'',quantityPerUnit:'',amountPerUnit:'',selective:{base:'',legalReference:''}});
assert.deepEqual(blankSpecialTax('04'),{code:'04',rate:'',quantityPerUnit:'',amountPerUnit:'',alcohol:{percentage:''}});
assert.deepEqual(blankSpecialTax('05'),{code:'05',rate:'',quantityPerUnit:'',amountPerUnit:'',beverage:{kind:'beverage',referenceVolume:''}});
for(const code of ['02','03','04','05','06','12'])assert.equal(specialTaxesSchema.safeParse([blankSpecialTax(code)]).success,code==='12');
const specialFormatError=specialTaxesSchema.safeParse([{...alcohol,quantityPerUnit:'abc'}]);assert.equal(specialFormatError.success,false);assert.ok(specialFormatError.error.issues.some(issue=>issue.message==='La cantidad debe ser mayor que cero y hasta 99999.99, con dos decimales.'));
assert.equal(invoiceDetailSchema.safeParse([line({unitPrice:'88000000',specialTaxes:[{...selective,selective:{base:'90000000',legalReference:selective.selective.legalReference}}]})]).success,false);
console.log('PASS selective explicit base, alcohol proportion, beverage reference ratio, six-code coexistence/IVA/exemption, scoped metadata and preserved v3 shapes.');

// PostgreSQL numeric division may round a rational to a midpoint before round(...,5).
// The domain keeps the entire integer numerator/denominator until its single final rounding.
for(const [unitTax,expected] of [['76539.61942','100000'],['76539.61943','100000'],['76539.61944','100001']]){
 const exactRatio=specialTaxAmounts('0.01871',BigInt('0'),[{...beverage,quantityPerUnit:'69.83',amountPerUnit:unitTax,beverage:{kind:'beverage',referenceVolume:'99999.99'}}]);
 assert.deepEqual(exactRatio,{specialTax:BigInt(expected),vatBaseExtra:BigInt(expected)},unitTax);
}
console.log('PASS beverage exact-rational midpoint regression and immediate unit-tariff neighbors.');
