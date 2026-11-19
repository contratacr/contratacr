import {PRO_FILE_MAX_BYTES} from './file-limit';
/**
 * PDF plans for Mediciones (row 66). The PDF never leaves the browser: the chosen page is
 * rendered to a canvas and saved as the same JPEG plan image the existing upload, scale and
 * measurement flow already uses.
 *
 * pdf.js 6.4.299 (official npm tarball, integrity checked by scripts/pro/verify-pdfjs-vendor.mjs)
 * is served from /vendor/pdfjs/ with its worker; no CDN. It is loaded on demand only when a
 * PDF is chosen.
 */
export const PDFJS_VERSION='6.4.299';
export const TAKEOFF_PDF_MAX_BYTES=25*1024*1024;
export const TAKEOFF_PDF_MAX_PAGES=200;
/** Longest rendered side; the server keeps plan images inside 1600 px as well. */
export const TAKEOFF_PDF_RENDER_MAX_SIDE=1600;
const IMAGE_MAX_BYTES=PRO_FILE_MAX_BYTES;
const base='/vendor/pdfjs/';
export type TakeoffPdfErrorCode='size'|'invalid'|'pages'|'password'|'load'|'render';
export class TakeoffPdfError extends Error{constructor(readonly code:TakeoffPdfErrorCode){super(code);this.name='TakeoffPdfError';}}
type Viewport={width:number;height:number};
type RenderTask={promise:Promise<void>;cancel():void};
export type TakeoffPdfPage={getViewport(options:{scale:number}):Viewport;render(options:{canvas:HTMLCanvasElement;canvasContext:CanvasRenderingContext2D;viewport:Viewport;background?:string}):RenderTask;cleanup():void};
/** Opened PDF; destroy() ends its loading task (and worker use). */
export type TakeoffPdfDocument={numPages:number;getPage(page:number):Promise<TakeoffPdfPage>;destroy():Promise<void>};
type PdfProxy={numPages:number;getPage(page:number):Promise<TakeoffPdfPage>};
type PdfJs={version:string;GlobalWorkerOptions:{workerSrc:string};getDocument(options:{data:Uint8Array;isEvalSupported:boolean;enableXfa:boolean;stopAtErrors:boolean;verbosity:number}):{promise:Promise<PdfProxy>;destroy():Promise<void>}};
let library:Promise<PdfJs>|null=null;
function loadPdfJs(){
 library??=(import(/* webpackIgnore: true */ /* turbopackIgnore: true */ `${base}pdf-${PDFJS_VERSION}.min.mjs`) as Promise<PdfJs>).then(lib=>{
  if(lib.version!==PDFJS_VERSION)throw new TakeoffPdfError('load');
  lib.GlobalWorkerOptions.workerSrc=`${base}pdf.worker-${PDFJS_VERSION}.min.mjs`;return lib;
 }).catch(error=>{library=null;throw error instanceof TakeoffPdfError?error:new TakeoffPdfError('load');});
 return library;
}
export function isPdfFile(file:File){return file.type==='application/pdf'||/\.pdf$/i.test(file.name);}
/** Opens a local PDF after size, header and page-count checks. The caller destroys it. */
export async function openTakeoffPdf(file:File):Promise<TakeoffPdfDocument>{
 if(file.size<8||file.size>TAKEOFF_PDF_MAX_BYTES)throw new TakeoffPdfError('size');
 const data=new Uint8Array(await file.arrayBuffer());
 if(new TextDecoder('latin1').decode(data.subarray(0,5))!=='%PDF-')throw new TakeoffPdfError('invalid');
 const lib=await loadPdfJs();
 const task=lib.getDocument({data,isEvalSupported:false,enableXfa:false,stopAtErrors:false,verbosity:0});
 let proxy:PdfProxy;
 try{proxy=await task.promise;}
 catch(error){await task.destroy().catch(()=>{});throw new TakeoffPdfError((error as {name?:string})?.name==='PasswordException'?'password':'invalid');}
 const document:TakeoffPdfDocument={numPages:proxy.numPages,getPage:page=>proxy.getPage(page),destroy:()=>task.destroy()};
 if(!Number.isInteger(document.numPages)||document.numPages<1||document.numPages>TAKEOFF_PDF_MAX_PAGES){await document.destroy().catch(()=>{});throw new TakeoffPdfError('pages');}
 return document;
}
/** Renders one page on a white background, its longest side at most maxSide CSS pixels. */
export async function renderTakeoffPdfPage(document:TakeoffPdfDocument,pageNumber:number,canvas:HTMLCanvasElement,maxSide=TAKEOFF_PDF_RENDER_MAX_SIDE){
 if(!Number.isInteger(pageNumber)||pageNumber<1||pageNumber>document.numPages)throw new TakeoffPdfError('pages');
 let page:TakeoffPdfPage|null=null;
 try{
  page=await document.getPage(pageNumber);
  const unit=page.getViewport({scale:1}),scale=Math.min(8,maxSide/Math.max(unit.width,unit.height,1)),viewport=page.getViewport({scale});
  canvas.width=Math.max(1,Math.floor(viewport.width));canvas.height=Math.max(1,Math.floor(viewport.height));
  const context=canvas.getContext('2d');if(!context)throw new TakeoffPdfError('render');
  context.fillStyle='#ffffff';context.fillRect(0,0,canvas.width,canvas.height);
  await page.render({canvas,canvasContext:context,viewport,background:'#ffffff'}).promise;
  return {width:canvas.width,height:canvas.height};
 }catch(error){throw error instanceof TakeoffPdfError?error:new TakeoffPdfError('render');}
 finally{page?.cleanup();}
}
/** JPEG within the plan image limit (20 MB); lowers quality before giving up. */
export async function takeoffPdfCanvasJpeg(canvas:HTMLCanvasElement):Promise<Blob>{
 for(const quality of [0.88,0.75,0.6]){
  const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/jpeg',quality));
  if(blob&&blob.size>0&&blob.size<=IMAGE_MAX_BYTES)return blob;
 }
 throw new TakeoffPdfError('render');
}
/** «plano.pdf», page 3 → «plano · p. 3.jpg» (title «plano · p. 3»). */
export function takeoffPdfPageName(fileName:string,pageNumber:number){
 const stem=(fileName.replace(/\.pdf$/i,'').replace(/[\u0000-\u001f\u007f/\\]/gu,' ').trim()||'plano').slice(0,140);
 return `${stem} · p. ${pageNumber}.jpg`;
}
