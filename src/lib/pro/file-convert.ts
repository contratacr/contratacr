import {PRO_FILE_MAX_BYTES} from './file-limit';
import {z} from 'zod';
/**
 * Ronda F2-E (row 28): Office (Word, Excel, PowerPoint) to PDF conversion behind an adapter interface.
 *  - "simulated" (the default): produces a clearly labelled placeholder PDF. It does NOT convert anything. It exists so the whole
 *    flow (button, new PDF in the same place, receipt) works and is tested without a service.
 *  - "service": sends the file to an external converter compatible with Gotenberg (POST {PRO_OFFICE_CONVERT_URL}/forms/libreoffice/convert,
 *    optional PRO_OFFICE_CONVERT_TOKEN). It is written against that public API and NOT exercised against a real service yet.
 * Real conversion therefore depends on that service existing: without it the app only offers the simulated placeholder, and says so.
 */
export type ConvertMode='simulated'|'service';
export const OFFICE_MIMES=['application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.openxmlformats-officedocument.presentationml.presentation'] as const;
export const isOfficeMime=(mime:string)=>(OFFICE_MIMES as readonly string[]).includes(mime);
export type ConvertErrorCode='not_configured'|'unavailable'|'invalid'|'size';
export class ConvertError extends Error{constructor(readonly code:ConvertErrorCode){super(code);this.name='ConvertError';}}
export interface OfficeConverter{readonly mode:ConvertMode;convert(input:{name:string;mimeType:string;bytes:Buffer}):Promise<Buffer>}
const ascii=(text:string)=>text.normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^\x20-\x7e]/g,'?').replace(/[\\()]/g,'');
/** A well formed one page PDF (real xref offsets) that says what it is. */
export function simulatedPdf(name:string,en:boolean){
 const lines=en?['SIMULATED PREVIEW','This is NOT a conversion of the document.',ascii(name).slice(0,80),'No conversion service is connected.']:['VISTA SIMULADA','Esto NO es una conversion del documento.',ascii(name).slice(0,80),'No hay un servicio de conversion conectado.'];
 const stream=['BT','/F1 16 Tf','72 740 Td',...lines.flatMap((l,i)=>[i?'0 -26 Td':'',`(${l}) Tj`].filter(Boolean)),'ET'].join('\n');
 const objs=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',`<< /Length ${Buffer.byteLength(stream,'latin1')} >>\nstream\n${stream}\nendstream`,'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
 let out='%PDF-1.4\n';const offsets:number[]=[];
 objs.forEach((body,i)=>{offsets.push(Buffer.byteLength(out,'latin1'));out+=`${i+1} 0 obj\n${body}\nendobj\n`;});
 const xref=Buffer.byteLength(out,'latin1');
 out+=`xref\n0 ${objs.length+1}\n0000000000 65535 f \n`+offsets.map(o=>String(o).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size ${objs.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
 return Buffer.from(out,'latin1');
}
export function simulatedConverter(en=false):OfficeConverter{return{mode:'simulated',async convert({name}){return simulatedPdf(name,en);}};}
type Env=Record<string,string|undefined>;
export function serviceConverter(env:Env,fetchImpl:typeof fetch=fetch):OfficeConverter{
 const base=env.PRO_OFFICE_CONVERT_URL?.replace(/\/+$/,''),token=env.PRO_OFFICE_CONVERT_TOKEN;
 if(!base||!/^https?:\/\//.test(base))throw new ConvertError('not_configured');
 return{mode:'service',async convert({name,mimeType,bytes}){
  if(!isOfficeMime(mimeType))throw new ConvertError('invalid');
  const form=new FormData();form.append('files',new Blob([new Uint8Array(bytes)],{type:mimeType}),name);
  const r=await fetchImpl(base+'/forms/libreoffice/convert',{method:'POST',body:form,headers:token?{Authorization:'Bearer '+token}:undefined,signal:AbortSignal.timeout(90000)}).catch(()=>null);
  if(!r||!r.ok)throw new ConvertError('unavailable');
  const pdf=Buffer.from(await r.arrayBuffer());
  if(pdf.length===0||pdf.length>PRO_FILE_MAX_BYTES)throw new ConvertError('size');
  if(pdf.subarray(0,5).toString('latin1')!=='%PDF-')throw new ConvertError('invalid');
  return pdf;
 }};
}
/** Simulated unless PRO_OFFICE_CONVERT_MODE=service. Service without a URL throws not_configured: never a silent fallback to the placeholder. */
export function officeConverter(env:Env=process.env,fetchImpl?:typeof fetch,en=false):OfficeConverter{
 return env.PRO_OFFICE_CONVERT_MODE==='service'?serviceConverter(env,fetchImpl):simulatedConverter(en);
}
const id=z.string().uuid();
export const convertInputSchema=z.discriminatedUnion('scope',[
 z.object({action:z.literal('convert'),scope:z.literal('company'),actionId:id,fileId:id,targetFileId:id}).strict(),
 z.object({action:z.literal('convert'),scope:z.literal('work'),workId:z.string().min(1).max(160),actionId:id,fileId:id,targetFileId:id}).strict(),
]);
export const convertResultSchema=z.object({mode:z.enum(['simulated','service']),fileId:z.string(),name:z.string(),simulated:z.boolean(),replayed:z.boolean()}).strict();
