/** Area D: "Import from file" on the quotes list. Reads lines (description, quantity, unit price) from a CSV/TSV/TXT file into a quote draft. Pure functions. */
export type ImportedQuoteRow={description:string;quantity:string;unit_price:string};
export type QuoteFileImport={rows:ImportedQuoteRow[];skipped:number;truncated:boolean};
export const QUOTE_IMPORT_MAX_ROWS=20,QUOTE_IMPORT_MAX_BYTES=200000;
function splitLine(line:string,delimiter:string){
 const cells:string[]=[];let cell='',quoted=false;
 for(let i=0;i<line.length;i++){
  const ch=line[i];
  if(quoted){if(ch==='"'){if(line[i+1]==='"'){cell+='"';i++;}else quoted=false;}else cell+=ch;}
  else if(ch==='"'&&!cell.trim())quoted=true;
  else if(ch===delimiter){cells.push(cell.trim());cell='';}
  else cell+=ch;
 }
 cells.push(cell.trim());return cells;
}
function detectDelimiter(sample:string){
 const best=(['\t',';',','] as const).map(d=>[d,sample.split(d).length-1] as const).sort((a,b)=>b[1]-a[1])[0];
 return best[1]>0?best[0]:',';
}
/** "₡25.000,50", "25,000.50", "25 000" and "25000" all read as a number; anything else is NaN. */
export function parseImportNumber(raw:string){
 let text=raw.replace(/[₡$\s ]|CRC|USD/gi,'');
 if(!text||!/^[\d.,]+$/.test(text))return NaN;
 const lastDot=text.lastIndexOf('.'),lastComma=text.lastIndexOf(',');
 if(lastDot>=0&&lastComma>=0){const decimal=lastDot>lastComma?'.':',';text=text.split(decimal===','?'.':',').join('').replace(decimal,'.');}
 else if(lastComma>=0)text=/,\d{1,2}$/.test(text)&&text.split(',').length===2?text.replace(',','.'):text.split(',').join('');
 else if(lastDot>=0&&(text.split('.').length>2||/\.\d{3}$/.test(text)))text=text.split('.').join('');
 const value=Number(text);return Number.isFinite(value)?value:NaN;
}
const headerWords={description:/^(descripci[oó]n|description|concepto|detalle|item|[ií]tem|partida|nombre|name)$/i,quantity:/^(cantidad|cant\.?|quantity|qty)$/i,price:/^(precio( unitario)?|precio unit\.?|unit price|price|costo|cost|monto|valor)$/i};
export function parseQuoteFile(text:string):QuoteFileImport{
 const lines=text.replace(/^﻿/,'').split(/\r?\n/).map(line=>line.trim()).filter(Boolean);
 if(!lines.length)return{rows:[],skipped:0,truncated:false};
 const delimiter=detectDelimiter(lines.slice(0,5).join('\n'));
 let table=lines.map(line=>splitLine(line,delimiter)),map={description:0,quantity:1,price:2};
 const head=table[0];
 const found={description:head.findIndex(c=>headerWords.description.test(c.trim())),quantity:head.findIndex(c=>headerWords.quantity.test(c.trim())),price:head.findIndex(c=>headerWords.price.test(c.trim()))};
 if(found.description>=0||found.quantity>=0||found.price>=0){
  map={description:found.description>=0?found.description:0,quantity:found.quantity,price:found.price};table=table.slice(1);
 }
 const rows:ImportedQuoteRow[]=[];let skipped=0,truncated=false;
 for(const cells of table){
  const description=(cells[map.description]??'').replace(/\s+/g,' ').trim().slice(0,140);
  const quantity=map.quantity>=0&&cells[map.quantity]?parseImportNumber(cells[map.quantity]):1;
  const price=map.price>=0&&cells[map.price]?parseImportNumber(cells[map.price]):0;
  if(!description||!(quantity>0)||quantity>9999||!(price>=0)||price>222222222||Math.abs(quantity*100-Math.round(quantity*100))>1e-7){skipped++;continue;}
  if(rows.length>=QUOTE_IMPORT_MAX_ROWS){truncated=true;skipped++;continue;}
  rows.push({description,quantity:String(quantity),unit_price:String(Math.round(price))});
 }
 return{rows,skipped,truncated};
}
