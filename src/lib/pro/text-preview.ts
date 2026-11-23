/**
 * Ronda F2-E (row 28): safe in-app preview of CSV and TXT files. Only the first bytes are decoded (UTF-8, invalid sequences replaced),
 * control characters are removed and everything is shown as plain text (React escapes it; nothing is ever interpreted as HTML).
 * CSV is split into a small grid (comma, semicolon or tab, quotes supported), capped in rows and columns.
 */
export const TEXT_PREVIEW_MAX_BYTES=64*1024;
export const CSV_PREVIEW_MAX_ROWS=50;
export const CSV_PREVIEW_MAX_COLS=20;
export type TextPreview={text:string;truncated:boolean};
export function decodeTextPreview(buffer:ArrayBuffer,maxBytes=TEXT_PREVIEW_MAX_BYTES):TextPreview{
 const slice=new Uint8Array(buffer,0,Math.min(buffer.byteLength,maxBytes));
 let text=new TextDecoder('utf-8',{fatal:false}).decode(slice).replace(/^﻿/,'');
 // A cut in the middle of a character leaves a replacement mark at the end: drop it when we truncated.
 const truncated=buffer.byteLength>maxBytes;if(truncated)text=text.replace(/�$/u,'');
 return{text:text.replace(/\r\n?/g,'\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,''),truncated};
}
export function detectDelimiter(sample:string){
 const first=sample.split('\n',1)[0]??'';const counts=[',',';','\t'].map(d=>({d,n:first.split(d).length-1}));
 const best=counts.sort((a,b)=>b.n-a.n)[0];return best.n>0?best.d:',';
}
export type CsvPreview={rows:string[][];truncatedRows:boolean;truncatedCols:boolean};
export function parseCsvPreview(text:string,maxRows=CSV_PREVIEW_MAX_ROWS,maxCols=CSV_PREVIEW_MAX_COLS):CsvPreview{
 const delimiter=detectDelimiter(text),rows:string[][]=[];let row:string[]=[],cell='',quoted=false,truncatedCols=false,truncatedRows=false;
 const endCell=()=>{if(row.length<maxCols)row.push(cell);else truncatedCols=true;cell='';};
 const endRow=()=>{endCell();rows.push(row);row=[];};
 for(let i=0;i<text.length;i++){
  const ch=text[i];
  if(quoted){if(ch==='"'){if(text[i+1]==='"'){cell+='"';i++;}else quoted=false;}else cell+=ch;continue;}
  if(ch==='"'&&cell==='')quoted=true;
  else if(ch===delimiter)endCell();
  else if(ch==='\n'){endRow();if(rows.length>=maxRows){truncatedRows=i<text.length-1&&text.slice(i+1).trim()!=='';return{rows,truncatedRows,truncatedCols};}}
  else cell+=ch;
 }
 if(cell!==''||row.length>0)endRow();
 return{rows:rows.slice(0,maxRows),truncatedRows,truncatedCols};
}
export function formatDuration(seconds:number){
 if(!Number.isFinite(seconds)||seconds<0)return '';const total=Math.round(seconds),h=Math.floor(total/3600),m=Math.floor((total%3600)/60),s=total%60;
 return (h?h+':'+String(m).padStart(2,'0'):String(m))+':'+String(s).padStart(2,'0');
}
