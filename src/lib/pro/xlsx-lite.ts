import {zipSync,strToU8} from 'fflate';
/**
 * Row 15: minimal single-sheet XLSX writer (no server modules, safe in the browser). Every cell is an inline string, so
 * a value such as "=1+1" is stored and shown as text and is never evaluated as a formula. Control characters are removed.
 */
const MAX_CELL=32000;
const esc=(v:string)=>v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ud800-\udfff￾￿]/g,'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
function column(i:number){let n=i+1,s='';while(n>0){const r=(n-1)%26;s=String.fromCharCode(65+r)+s;n=Math.floor((n-1)/26);}return s;}
export function xlsxFromRows(rows:string[][],sheetName:string):Uint8Array{
 const name=esc(sheetName.replace(/[\\/?*[\]:]/g,' ').trim().slice(0,31)||'Hoja1');
 const sheetRows=rows.map((row,r)=>`<row r="${r+1}">${row.map((cell,c)=>`<c r="${column(c)}${r+1}" t="inlineStr"${r===0?' s="1"':''}><is><t xml:space="preserve">${esc(String(cell??'').slice(0,MAX_CELL))}</t></is></c>`).join('')}</row>`).join('');
 const xml='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
 const files:Record<string,Uint8Array>={
  '[Content_Types].xml':strToU8(xml+'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>'),
  '_rels/.rels':strToU8(xml+'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'),
  'xl/workbook.xml':strToU8(xml+`<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${name}" sheetId="1" r:id="rId1"/></sheets></workbook>`),
  'xl/_rels/workbook.xml.rels':strToU8(xml+'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'),
  'xl/styles.xml':strToU8(xml+'<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs></styleSheet>'),
  'xl/worksheets/sheet1.xml':strToU8(xml+`<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols><col min="1" max="${Math.max(1,rows[0]?.length??1)}" width="24" customWidth="1"/></cols><sheetData>${sheetRows}</sheetData></worksheet>`),
 };
 return zipSync(files,{level:6});
}
export const XLSX_MIME='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
