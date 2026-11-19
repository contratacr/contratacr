/**
 * Round 6B: minimal text-only PDF 1.4 writer (no dependency). Helvetica / Helvetica-Bold with WinAnsi
 * encoding, A4 pages, automatic wrapping and page breaks. Output is deterministic for the same input (no
 * timestamps or ids are added), so the SHA-256 of a rendered document is reproducible.
 */
export type PdfLine={text:string;bold?:boolean;size?:number;gap?:number;color?:'black'|'gray'|'white'};
const PAGE_W=595,PAGE_H=842,MARGIN=50;
const map:Record<string,string>={'₡':'CRC ','—':'-','–':'-','“':'"','”':'"','‘':"'",'’':"'",'…':'...','•':'·','→':'->','✓':'OK',' ':' ',' ':' '};
export function winAnsi(text:string){return [...text].map(ch=>map[ch]??(ch.charCodeAt(0)<=0xff&&(ch.charCodeAt(0)>=0x20||ch==='\t')?ch:'?')).join('');}
const esc=(text:string)=>text.replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)');
function wrap(text:string,size:number){
 const max=Math.max(20,Math.floor((PAGE_W-2*MARGIN)/(size*0.5))),out:string[]=[];
 for(const paragraph of winAnsi(text).split(/\r?\n/)){
  let line='';for(const word of paragraph.split(' ')){
   if(word.length>max){if(line)out.push(line);for(let i=0;i<word.length;i+=max)out.push(word.slice(i,i+max));line='';continue;}
   const next=line?line+' '+word:word;if(next.length>max){out.push(line);line=word;}else line=next;
  }
  out.push(line);
 }
 return out;
}
export function textPdf(lines:PdfLine[],footer:string):Buffer{
 const pages:string[][]=[[]];let y=PAGE_H-MARGIN;
 for(const line of lines){
  const size=line.size??10,lead=size*1.35;y-=line.gap??0;
  for(const part of wrap(line.text,size)){
   if(y-lead<MARGIN+20){pages.push([]);y=PAGE_H-MARGIN;}
   y-=lead;const rgb=line.color==='gray'?'0.35 0.38 0.45':line.color==='white'?'1 1 1':'0.09 0.15 0.26';
   pages[pages.length-1]!.push(`BT /${line.bold?'F2':'F1'} ${size} Tf ${rgb} rg ${MARGIN} ${y.toFixed(2)} Td (${esc(part)}) Tj ET`);
  }
 }
 const objects:string[]=[];const add=(body:string)=>{objects.push(body);return objects.length;};
 const catalog=add(''),pagesId=add(''),f1=add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'),f2=add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
 const kids:number[]=[];
 pages.forEach((content,index)=>{
  const foot=`BT /F1 8 Tf 0.35 0.38 0.45 rg ${MARGIN} 30 Td (${esc(winAnsi(footer).slice(0,150))} - ${index+1}/${pages.length}) Tj ET`;
  const stream=[...content,foot].join('\n'),streamId=add(`<< /Length ${Buffer.byteLength(stream,'latin1')} >>\nstream\n${stream}\nendstream`);
  kids.push(add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> /Contents ${streamId} 0 R >>`));
 });
 objects[catalog-1]=`<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
 objects[pagesId-1]=`<< /Type /Pages /Kids [${kids.map(k=>k+' 0 R').join(' ')}] /Count ${kids.length} >>`;
 let out='%PDF-1.4\n%\xe2\xe3\xcf\xd3\n';const offsets:number[]=[];
 objects.forEach((body,i)=>{offsets.push(Buffer.byteLength(out,'latin1'));out+=`${i+1} 0 obj\n${body}\nendobj\n`;});
 const xref=Buffer.byteLength(out,'latin1');
 out+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`+offsets.map(o=>String(o).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size ${objects.length+1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
 return Buffer.from(out,'latin1');
}
