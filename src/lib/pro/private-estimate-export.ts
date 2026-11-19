import {z} from 'zod';
import {proPhone} from '@/lib/pro/phone';
import {privateEstimateSchema,calculatePrivateEstimate,type PrivateEstimate,privateEstimateGroups} from './private-estimates';

const WIDTH=1275,MARGIN=72,BOTTOM=1530,MM=215.9/WIDTH,PT=72/150;
const NAVY='#162543',MUTED='#52627a',CYAN='#009fd9',BORDER='#d7e1ea';
type Text={kind:'text';text:string;x:number;y:number;size:number;bold?:boolean;align?:'left'|'right'|'center';color?:string};
type Shape={kind:'line'|'rect';x:number;y:number;width:number;height:number;color:string};
type Draw=Text|Shape;
type Assets={regular:ArrayBuffer;bold:ArrayBuffer;logo:HTMLImageElement;logoData:string};
let assets:Promise<Assets>|undefined;
const font=(size:number,bold=false)=>`${bold?'700':'400'} ${size}px "CCRPrivateEstimatePdf", Arial, sans-serif`;
function binary(bytes:Uint8Array){let value='';for(let i=0;i<bytes.length;i+=16384)value+=String.fromCharCode(...bytes.subarray(i,i+16384));return value;}
async function resource(path:string){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
  try{const response=await fetch(path,{cache:'force-cache',credentials:'same-origin',signal:controller.signal});if(!response.ok)throw Error('Export resource unavailable');return await response.arrayBuffer();}finally{clearTimeout(timer);}
}
function loadAssets(){
  if(!assets)assets=(async()=>{
    const [regular,bold,logoBytes]=await Promise.all([resource('/exports/private-estimates/NotoSans-Regular.ttf'),resource('/exports/private-estimates/NotoSans-Bold.ttf'),resource('/brand/logo-primary.png')]);
    for(const value of [regular,bold]){const bytes=new Uint8Array(value);if(bytes.length<10000||bytes.length>2000000||bytes[0]!==0||bytes[1]!==1||bytes[2]!==0||bytes[3]!==0)throw Error('Invalid export font');}
    const faces=await Promise.all([new FontFace('CCRPrivateEstimatePdf',regular,{weight:'400'}).load(),new FontFace('CCRPrivateEstimatePdf',bold,{weight:'700'}).load()]);
    faces.forEach(face=>document.fonts.add(face));
    const logoData='data:image/png;base64,'+btoa(binary(new Uint8Array(logoBytes))),logo=new Image();
    await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Export logo timed out')),15000);logo.onload=()=>{clearTimeout(timer);resolve();};logo.onerror=()=>{clearTimeout(timer);reject(Error('Invalid export logo'));};logo.src=logoData;});
    if(!logo.naturalWidth||!logo.naturalHeight)throw Error('Empty export logo');
    return{regular,bold,logo,logoData};
  })().catch(error=>{assets=undefined;throw error;});
  return assets;
}
function graphemes(value:string){
  return typeof Intl.Segmenter==='function'?[...new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(value)].map(part=>part.segment):Array.from(value);
}
function wrap(context:CanvasRenderingContext2D,value:string,width:number){
  const result:string[]=[];
  for(const paragraph of value.replace(/\r\n?/g,'\n').split('\n')){
    if(!paragraph){result.push('');continue;}
    let current='';
    for(const token of paragraph.split(/(\s+)/)){
      if(context.measureText(current+token).width<=width){current+=token;continue;}
      if(current.trim()){result.push(current.trimEnd());current='';}
      if(context.measureText(token.trimStart()).width<=width){current=token.trimStart();continue;}
      for(const character of graphemes(token.trimStart())){
        if(current&&context.measureText(current+character).width>width){result.push(current);current='';}
        current+=character;
      }
    }
    if(current||!result.length)result.push(current.trimEnd());
  }
  return result;
}
function canonical(value:unknown):string{
  const sorted=(item:unknown):unknown=>Array.isArray(item)?item.map(sorted):item!==null&&typeof item==='object'?Object.fromEntries(Object.entries(item).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([key,v])=>[key,sorted(v)])):item;
  return JSON.stringify(sorted(value));
}
function date(value:string|null,en:boolean){return value?new Intl.DateTimeFormat(en?'en-US':'es-CR',{year:'numeric',month:'short',day:'numeric',timeZone:'UTC'}).format(new Date(value+'T12:00:00Z')):(en?'Not specified':'Sin indicar');}

/** Only saved, current owner documents are exported. No publication or send occurs.
 * Latin text remains searchable; unsupported glyph runs use a browser-rendered
 * image rather than dropping valid Unicode or rendering missing-glyph squares.
 */
export async function createPrivateEstimatePdf(value:PrivateEstimate,{english:en,accountId,currentAccount,verifySaved}:{english:boolean;accountId:string;currentAccount:()=>string|undefined;verifySaved:()=>Promise<PrivateEstimate>}):Promise<Blob>{
  const actor=z.string().uuid().parse(accountId),snapshot=privateEstimateSchema.parse(JSON.parse(JSON.stringify(value))) as PrivateEstimate;
  const scope=()=>{if(currentAccount()!==actor||snapshot.ownerId!==actor)throw Error('Quote export account changed');};
  const verify=async()=>{scope();const current=privateEstimateSchema.parse(await verifySaved());scope();if(canonical(current)!==canonical(snapshot))throw Error(en?'The quote changed. Refresh the preview before exporting.':'La cotización cambió. Actualice la vista previa antes de exportar.');};
  // Round 4A: the internal unit cost is owner-only; it is removed before anything is laid out.
  const printable={...snapshot,lines:snapshot.lines.map(({unitCostCents,...line})=>{void unitCostCents;return line;})};
  return renderPrivateEstimatePdfDocument(printable,{english:en,scope,verify,reference:snapshot.id.slice(0,8).toUpperCase(),version:snapshot.revision,badge:snapshot.status==='archived'?(en?'Archived draft':'Borrador archivado'):(en?'Draft':'Borrador'),footer:en?'Private draft':'Borrador privado',subject:(en?'Private draft - version ':'Borrador privado - versión ')+snapshot.revision});
}

/** Shared layout only. Both public entry points validate and privately clone their
 * own distinct document schema and supply mandatory scope/authorization checks. */
export type PrivateEstimatePdfDocument=Pick<PrivateEstimate,'title'|'currency'|'validUntil'|'notes'|'subtotalCents'|'discountCents'|'taxCents'|'totalCents'>&{
 issuer:Pick<PrivateEstimate['issuer'],'issuerName'|'issuerId'|'issuerEmail'|'issuerPhone'|'issuerAddress'>;
 client:Pick<PrivateEstimate['client'],'name'|'tradeName'|'identification'|'address'>&Partial<Pick<PrivateEstimate['client'],'email'|'phone'>>;
 // Round 4A: the internal unit cost can never reach the PDF; groups print as sections with subtotals.
 lines:Array<Omit<PrivateEstimate['lines'][number],'catalogProductId'|'unitCostCents'>>;
};
export async function renderPrivateEstimatePdfDocument(snapshot:PrivateEstimatePdfDocument,{english:en,scope,verify,reference,version,badge,footer,subject,publishedAt}:{english:boolean;scope:()=>void;verify:()=>Promise<void>;reference:string;version:number;badge:string;footer:string;subject:string;publishedAt?:string}):Promise<Blob>{
  scope();await verify();scope();
  const shared=await loadAssets();scope();
  const {jsPDF}=await import('jspdf');scope();
  const measure=document.createElement('canvas'),context=measure.getContext('2d');if(!context)throw Error('Canvas unavailable');
  const pages:Draw[][]=[[]];let y=180;
  const text=(value:string,x:number,at:number,size=22,bold=false,align:Text['align']='left',color=NAVY)=>pages.at(-1)!.push({kind:'text',text:value,x,y:at,size,bold,align,color});
  const line=()=>pages.at(-1)!.push({kind:'line',x:MARGIN,y,width:WIDTH-2*MARGIN,height:1,color:BORDER});
  const tableHeader=()=>{pages.at(-1)!.push({kind:'rect',x:MARGIN,y,width:WIDTH-2*MARGIN,height:44,color:'#eaf7fb'});text(en?'Product or service':'Producto o servicio',MARGIN+10,y+29,20,true);text(en?'Qty.':'Cant.',MARGIN+605,y+29,20,true);text((en?'Price ':'Precio ')+snapshot.currency,MARGIN+875,y+29,20,true,'right');text((en?'Total ':'Total ')+snapshot.currency,WIDTH-MARGIN-10,y+29,20,true,'right');y+=55;};
  const next=(table=false)=>{if(pages.length>=250)throw Error('Quote export is too long');pages.push([]);y=180;if(table)tableHeader();};
  const ensure=(height:number,table=false)=>{if(y+height>BOTTOM)next(table);};
  const paragraph=(value:string,{size=22,bold=false,gap=12}:{size?:number;bold?:boolean;gap?:number}={})=>{
    context.font=font(size,bold);for(const row of wrap(context,value,WIDTH-2*MARGIN)){ensure(size+9);text(row,MARGIN,y+size,size,bold);y+=size+9;}y+=gap;
  };
  paragraph(snapshot.title,{size:30,bold:true,gap:10});
  paragraph(`${en?'Reference':'Referencia'} ${reference} - ${en?'Version':'Versión'} ${version} - ${snapshot.currency}`,{size:19,gap:5});
  if(publishedAt)paragraph(`${en?'Shared on':'Compartida el'}: ${new Intl.DateTimeFormat(en?'en-US':'es-CR',{year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'America/Costa_Rica'}).format(new Date(publishedAt))}`,{size:20,gap:5});
  paragraph(`${en?'Valid until':'Válida hasta'}: ${date(snapshot.validUntil,en)}`,{size:20,gap:25});
  const contacts=[
    {heading:en?'From':'De',values:[snapshot.issuer.issuerName,snapshot.issuer.issuerId,snapshot.issuer.issuerEmail,snapshot.issuer.issuerPhone,snapshot.issuer.issuerAddress]},
    {heading:en?'To':'Para',values:[snapshot.client.tradeName||snapshot.client.name,snapshot.client.tradeName?snapshot.client.name:'',snapshot.client.identification,snapshot.client.email,proPhone(snapshot.client.phone),snapshot.client.address]},
  ];
  context.font=font(22);
  const columns=contacts.map(contact=>({heading:contact.heading,lines:contact.values.filter((entry):entry is string=>!!entry).flatMap(entry=>wrap(context,entry,(WIDTH-2*MARGIN-48)/2))}));
  const rows=Math.max(...columns.map(column=>column.lines.length));ensure(85);
  const contactHeadings=(continued=false)=>{columns.forEach((column,index)=>text(column.heading+(continued?(en?' (continued)':' (continuación)'):''),MARGIN+index*(WIDTH-2*MARGIN+48)/2,y+22,21,true));y+=42;};
  contactHeadings();
  for(let row=0;row<rows;row++){
    if(y+30>BOTTOM){next();contactHeadings(true);}
    columns.forEach((column,index)=>{if(column.lines[row])text(column.lines[row],MARGIN+index*(WIDTH-2*MARGIN+48)/2,y+22,22,false,'left',MUTED);});
    y+=29;
  }
  y+=25;
  ensure(120);tableHeader();
  const totals=calculatePrivateEstimate(snapshot.lines.map(line=>({...line,catalogProductId:null}))),number=new Intl.NumberFormat(en?'en-US':'es-CR',{minimumFractionDigits:2,maximumFractionDigits:2}),quantity=new Intl.NumberFormat(en?'en-US':'es-CR',{maximumFractionDigits:3});
  const groups=privateEstimateGroups(snapshot.lines,totals.rows),grouped=groups.some(group=>group.name);
  for(let index=0;index<snapshot.lines.length;index++){
    const item=snapshot.lines[index];context.font=font(22);
    const section=grouped?groups.find(group=>group.start===index):undefined;
    if(section){ensure(84,true);text(section.name??(en?'Other items':'Otros conceptos'),MARGIN+10,y+24,22,true);y+=36;}
    const description=wrap(context,`${index+1}. ${item.description}`,570),qty=wrap(context,quantity.format(item.qtyMilli/1000)+(item.unit?' '+item.unit:''),115),count=Math.max(description.length,qty.length,1);
    ensure(Math.min(count,3)*30+35,true);
    let continued=false;
    for(let row=0;row<count;row++){
      // Keep the final description line with its discount/tax and continuation
      // total, so a page never begins with an unidentified adjustment alone.
      const tail=row===count-1?((item.discountBps||item.taxBps?30:0)+28+26):0;
      if(y+30+tail>BOTTOM){next(true);text(`${index+1}. ${en?'Continued':'Continuación'}`,MARGIN+10,y+22,20,true);y+=34;continued=true;}
      if(description[row])text(description[row],MARGIN+10,y+23,22);
      if(qty[row])text(qty[row],MARGIN+605,y+23,21);
      if(row===0){text(number.format(item.unitPriceCents/100),MARGIN+875,y+23,20,false,'right');text(number.format(totals.rows[index].totalCents/100),WIDTH-MARGIN-10,y+23,20,true,'right');}
      y+=30;
    }
    if(item.discountBps||item.taxBps){const detail=[item.discountBps?(en?'Discount ':'Descuento ')+quantity.format(item.discountBps/100)+(en?'%':' %'):'',item.taxBps?(en?'Tax ':'Impuesto ')+quantity.format(item.taxBps/100)+(en?'%':' %'):''].filter(Boolean).join(' - ');ensure(30,true);text(detail,MARGIN+10,y+21,19,false,'left',MUTED);y+=30;}
    if(continued){ensure(28,true);text((en?'Line total: ':'Total del concepto: ')+snapshot.currency+' '+number.format(totals.rows[index].totalCents/100),WIDTH-MARGIN-10,y+20,19,true,'right');y+=28;}
    y+=10;line();y+=16;
    const closing=grouped?groups.find(group=>group.end===index):undefined;
    if(closing){ensure(34,true);text((en?'Section subtotal':'Subtotal de la sección')+(closing.name?' · '+closing.name:'')+': '+snapshot.currency+' '+number.format(closing.totalCents/100),WIDTH-MARGIN-10,y+20,19,true,'right');y+=38;}
  }
  ensure(snapshot.discountCents?205:165);y+=10;
  const summary:Array<[string,number,boolean]>=[[en?'Subtotal':'Subtotal',snapshot.subtotalCents,false],...(snapshot.discountCents?[[en?'Discounts':'Descuentos',-snapshot.discountCents,false] as [string,number,boolean]]:[]),[en?'Tax':'Impuestos',snapshot.taxCents,false],[en?'Total':'Total',snapshot.totalCents,true]];
  for(const[label,amount,bold]of summary){text(label,MARGIN+630,y+26,bold?27:22,bold);text(snapshot.currency+' '+number.format(amount/100),WIDTH-MARGIN-10,y+26,bold?25:22,bold,'right');y+=bold?49:38;}
  if(snapshot.notes){y+=30;ensure(80);paragraph(en?'Notes':'Observaciones',{size:24,bold:true,gap:4});paragraph(snapshot.notes,{size:22,gap:5});}

  const pdf=new jsPDF({orientation:'portrait',unit:'mm',format:'letter',compress:true,putOnlyUsedFonts:true});
  pdf.addFileToVFS('PrivateEstimate-Regular.ttf',btoa(binary(new Uint8Array(shared.regular))));pdf.addFont('PrivateEstimate-Regular.ttf','CCRPrivateEstimate','normal');
  pdf.addFileToVFS('PrivateEstimate-Bold.ttf',btoa(binary(new Uint8Array(shared.bold))));pdf.addFont('PrivateEstimate-Bold.ttf','CCRPrivateEstimate','bold');
  pdf.setProperties({title:(en?'Quote - ':'Cotización - ')+snapshot.title,creator:'ContrataCR Pro',subject});
  const fallback=document.createElement('canvas'),fallbackContext=fallback.getContext('2d');if(!fallbackContext)throw Error('Canvas unavailable');
  try{
    for(let page=0;page<pages.length;page++){
      scope();if(page)pdf.addPage('letter','portrait');
      pdf.addImage(shared.logoData,'PNG',MARGIN*MM,45*MM,230*MM,230*shared.logo.naturalHeight/shared.logo.naturalWidth*MM,'primary-logo','NONE');
      pdf.setFont('CCRPrivateEstimate','bold');pdf.setFontSize(30*PT);pdf.setTextColor(NAVY);pdf.text(en?'Quote':'Cotización',MARGIN*MM,145*MM);
      pdf.setFontSize(21*PT);pdf.setTextColor(CYAN);pdf.text(badge,(WIDTH-MARGIN)*MM,85*MM,{align:'right'});
      for(const op of pages[page]){
        if(op.kind==='rect'){pdf.setFillColor(op.color);pdf.rect(op.x*MM,op.y*MM,op.width*MM,op.height*MM,'F');continue;}
        if(op.kind==='line'){pdf.setDrawColor(op.color);pdf.setLineWidth(MM);pdf.line(op.x*MM,op.y*MM,(op.x+op.width)*MM,op.y*MM);continue;}
        if(op.kind!=='text')continue;
        pdf.setFont('CCRPrivateEstimate',op.bold?'bold':'normal');pdf.setFontSize(op.size*PT);pdf.setTextColor(op.color??NAVY);
        const metadata=pdf.getFont().metadata as {characterToGlyph?:(code:number)=>number};
        const native=typeof metadata.characterToGlyph==='function'&&Array.from(op.text).every(character=>{const code=character.codePointAt(0)!;return code<=65535&&(code===32||metadata.characterToGlyph!(code)!==0);});
        if(native){pdf.text(op.text,op.x*MM,op.y*MM,{align:op.align??'left'});continue;}
        context.font=font(op.size,op.bold);const measured=context.measureText(op.text),width=Math.ceil(measured.width),ascent=Math.ceil(measured.actualBoundingBoxAscent||op.size*1.2),descent=Math.ceil(measured.actualBoundingBoxDescent||op.size*0.3),padding=4;
        fallback.width=Math.max(1,width+padding*2);fallback.height=ascent+descent+padding*2;
        fallbackContext.font=font(op.size,op.bold);fallbackContext.fillStyle=op.color??NAVY;fallbackContext.textBaseline='alphabetic';fallbackContext.fillText(op.text,padding,ascent+padding);
        const left=op.align==='right'?op.x-measured.width:op.align==='center'?op.x-measured.width/2:op.x;
        pdf.addImage(fallback.toDataURL('image/png'),'PNG',(left-padding)*MM,(op.y-ascent-padding)*MM,fallback.width*MM,fallback.height*MM,undefined,'FAST');
      }
      pdf.setDrawColor(BORDER);pdf.line(MARGIN*MM,1570*MM,(WIDTH-MARGIN)*MM,1570*MM);pdf.setFont('CCRPrivateEstimate','normal');pdf.setFontSize(18*PT);pdf.setTextColor(MUTED);
      pdf.text(footer+' - '+reference+' - '+(en?'Version ':'Versión ')+version,MARGIN*MM,1600*MM);
      pdf.text(`${page+1} / ${pages.length}`,(WIDTH-MARGIN)*MM,1600*MM,{align:'right'});
      await new Promise<void>(resolve=>setTimeout(resolve,0));scope();
    }
    await verify();scope();return pdf.output('blob');
  }finally{measure.width=1;measure.height=1;fallback.width=1;fallback.height=1;}
}
