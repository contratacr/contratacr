import {test,expect} from 'playwright/test';
import {mockVoiceExtraction} from '../../src/lib/pro/ai/adapters';
import {normalizeExpenseOutput,parseCrAmount,parseCrDate,parseVatBps,validateOutput} from '../../src/lib/pro/ai/validate';

// Round 13 (row 77): deterministic normalization of what an AI provider returns for a receipt or a voice note,
// measured per field against FICTITIOUS Costa Rican receipts (no real vendor, person or document).
// IMPORTANT: this measures our own cleanup and validation only. The accuracy of the real model reading a photo
// or an audio needs the provider keys and a labelled set of photos; it is NOT claimed here (row stays E for that).
type Expected={vendor:string;date:string|null;totalAmount:number|null;vatRateBps:number|null;paymentMethod:string|null};
const fixtures:{name:string;raw:Record<string,unknown>;expected:Expected}[]=[
 {name:'ferreteria card 13 percent',raw:{vendor:'Ferretería Ficticia',date:'05/03/2026',totalAmount:'₡12.500,00',vatRateBps:'13%',vatAmount:'1.438,05',paymentMethod:'Tarjeta de crédito',concept:'Tornillos',confidence:'high'},expected:{vendor:'Ferretería Ficticia',date:'2026-03-05',totalAmount:12500,vatRateBps:1300,paymentMethod:'card'}},
 {name:'sinpe 1 percent',raw:{vendor:'Abastecedor Imaginario',date:'31-12-26',totalAmount:'45 250',vatRateBps:1,vatAmount:null,paymentMethod:'SINPE Móvil',concept:'Víveres',confidence:'medium'},expected:{vendor:'Abastecedor Imaginario',date:'2026-12-31',totalAmount:45250,vatRateBps:100,paymentMethod:'sinpe'}},
 {name:'cash 2 percent decimal point',raw:{vendor:'Clínica Ejemplo',date:'2026-02-28',totalAmount:'12,500.50',vatRateBps:'2',vatAmount:null,paymentMethod:'efectivo',concept:'Consulta',confidence:'medium'},expected:{vendor:'Clínica Ejemplo',date:'2026-02-28',totalAmount:12500.5,vatRateBps:200,paymentMethod:'cash'}},
 {name:'4 percent number already in bps',raw:{vendor:'Taller Modelo',date:'1.7.2026',totalAmount:98000,vatRateBps:400,vatAmount:null,paymentMethod:'transferencia',concept:'Reparación',confidence:'high'},expected:{vendor:'Taller Modelo',date:'2026-07-01',totalAmount:98000,vatRateBps:400,paymentMethod:'transfer'}},
 {name:'impossible date and unknown vat are dropped, never guessed',raw:{vendor:'Comercio Falso',date:'31/02/2026',totalAmount:'₡1.250,5',vatRateBps:'7%',vatAmount:null,paymentMethod:null,concept:'x',confidence:'low'},expected:{vendor:'Comercio Falso',date:null,totalAmount:1250.5,vatRateBps:null,paymentMethod:null}},
 {name:'unreadable amount becomes null',raw:{vendor:'Papelería Dudosa',date:null,totalAmount:'doce mil',vatRateBps:null,vatAmount:null,paymentMethod:'other',concept:'x',confidence:'low'},expected:{vendor:'Papelería Dudosa',date:null,totalAmount:null,vatRateBps:null,paymentMethod:'other'}},
];
test('Round 13: provider answers in Costa Rican formats are normalized and validated, with per-field accuracy',()=>{
 const fields:(keyof Expected)[]=['vendor','date','totalAmount','vatRateBps','paymentMethod'],hits:Record<string,number>=Object.fromEntries(fields.map(f=>[f,0]));
 for(const fixture of fixtures){
  const out=validateOutput('expense_receipt',fixture.raw) as Record<string,unknown>|null;
  expect(out,fixture.name).not.toBeNull();
  for(const f of fields)if(out![f]===fixture.expected[f])hits[f]!++;else console.log(`${fixture.name}: ${f} got ${String(out![f])} expected ${String(fixture.expected[f])}`);
 }
 const report=Object.fromEntries(fields.map(f=>[f,hits[f]!/fixtures.length]));console.log('accuracy per field',JSON.stringify(report));
 for(const f of fields)expect(report[f],f).toBe(1);
});
test('Round 13: amount, date and VAT parsers',()=>{
 for(const [raw,value] of [['₡12.500,00',12500],['12 500',12500],['12,500.50',12500.5],['12.500',12500],['1.250,5',1250.5],['CRC 3.000.000,00',3000000],['125,50',125.5],['0',null],['abc',null],['',null]] as const)expect(parseCrAmount(raw),String(raw)).toBe(value);
 expect(parseCrDate('29/02/2028')).toBe('2028-02-29');expect(parseCrDate('29/02/2027')).toBeNull();expect(parseCrDate('2026-13-01')).toBeNull();expect(parseCrDate('mañana')).toBeNull();
 for(const [raw,value] of [[13,1300],['13%',1300],[0.13,1300],[1300,1300],['4',400],['0.5%',50],[8,null],['x',null]] as const)expect(parseVatBps(raw),String(raw)).toBe(value);
 expect(normalizeExpenseOutput('x')).toBe('x');
});
test('Round 13: voice note transcripts (fictitious) give amount, method and vendor; nothing is invented',()=>{
 const cases:[string,number|null,string|null][]=[
  ['Pagué 12.500,00 colones en Ferretería Ficticia con tarjeta',12500,'card'],
  ['Gasto de 45.250 colones en Abastecedor Imaginario por SINPE',45250,'sinpe'],
  ['Compré clavos en efectivo',null,'cash'],
 ];
 for(const [text,amount,method] of cases){const out=mockVoiceExtraction(text,false);expect(out.totalAmount,text).toBe(amount);expect(out.paymentMethod,text).toBe(method);expect(out.vatRateBps).toBeNull();}
});
