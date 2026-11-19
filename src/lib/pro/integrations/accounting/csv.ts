import {invoiceBreakdown,vatCodes,type Sources} from './model';

/**
 * Round 6B: CSV export for ANY Costa Rica accounting system (the non-QuickBooks option). Pure.
 * · format «cr»: «;» separator, decimal comma, UTF-8 BOM (opens directly in Excel es-CR);
 *   format «standard»: «,» separator and decimal point (imports, scripts, Google Sheets).
 * · invoices: one row per invoice with base and IVA per rate (13, 4, 2, 1, 0,5 %), exempt/0 %, totals,
 *   number (consecutivo) and Hacienda key when emitted. payments and customers too.
 * · Spreadsheet formula injection is neutralized (cells starting with = + - @ get a leading apostrophe).
 */
export type CsvKind='invoices'|'payments'|'customers';
export type CsvFormat='cr'|'standard';
function cell(value:unknown,sep:string){
 let text=value===null||value===undefined?'':String(value);
 if(/^[=+\-@\t\r]/.test(text))text="'"+text;
 return text.includes(sep)||/["\r\n]/.test(text)?`"${text.replace(/"/g,'""')}"`:text;
}
const amount=(cents:number,format:CsvFormat)=>{const text=(cents/100).toFixed(2);return format==='cr'?text.replace('.',','):text;};
export function accountingCsv(sources:Sources,kind:CsvKind,format:CsvFormat,range:{from?:string;to?:string}={},en=false){
 const sep=format==='cr'?';':',',inRange=(date:string)=>(!range.from||date>=range.from)&&(!range.to||date<=range.to);
 const rows:unknown[][]=[];
 if(kind==='invoices'){
  const rated=vatCodes.filter(([,rate])=>rate>0);
  rows.push([en?'Date':'Fecha',en?'Number':'Número',en?'Hacienda key':'Clave Hacienda',en?'Status':'Estado',en?'Customer':'Cliente',en?'Customer ID':'Identificación',en?'Currency':'Moneda',
   ...rated.flatMap(([code,rate])=>[`${en?'Base':'Base'} ${String(rate).replace('.',format==='cr'?',':'.')}% (${code})`,`IVA ${String(rate).replace('.',format==='cr'?',':'.')}% (${code})`]),en?'Exempt / 0 %':'Exento / 0 %',en?'Total VAT':'Total IVA',en?'Total':'Total',en?'Description':'Descripción']);
  for(const invoice of sources.invoices.filter(i=>inRange(i.date))){
   const {byCode}=invoiceBreakdown(invoice),exempt=[...byCode.entries()].filter(([code])=>!rated.some(([c])=>c===code)).reduce((sum,[,v])=>sum+v.netCents,0);
   rows.push([invoice.date,invoice.number,invoice.clave??'',invoice.emitted?(en?'Issued':'Emitida'):(en?'Internal draft':'Borrador interno'),invoice.customer,invoice.customerId,invoice.currency,
    ...rated.flatMap(([code])=>{const v=byCode.get(code);return [amount(v?.netCents??0,format),amount(v?.taxCents??0,format)];}),amount(exempt,format),amount(invoice.taxCents,format),amount(invoice.totalCents,format),invoice.title]);
  }
 }else if(kind==='payments'){
  const numbers=new Map(sources.invoices.map(i=>[i.localId,i]));
  rows.push([en?'Date':'Fecha',en?'Invoice':'Factura',en?'Customer':'Cliente',en?'Method':'Medio',en?'Reference':'Referencia',en?'Amount':'Monto']);
  for(const p of sources.payments.filter(p=>inRange(p.date))){const invoice=numbers.get(p.invoiceId);rows.push([p.date,invoice?.number??'',invoice?.customer??'',p.method,p.reference,amount(p.amountCents,format)]);}
 }else{
  rows.push([en?'Name':'Nombre',en?'Trade name':'Nombre comercial',en?'ID':'Identificación',en?'Email':'Correo',en?'Phone':'Teléfono',en?'Address':'Dirección']);
  for(const c of sources.customers)rows.push([c.name,c.tradeName??'',c.identification??'',c.email,c.phone,c.address??'']);
 }
 const text=rows.map(row=>row.map(value=>cell(value,sep)).join(sep)).join('\r\n')+'\r\n';
 return format==='cr'?'﻿'+text:text;
}
