import {z} from 'zod';
import {taskCenterItemSchema,taskCenterPlanningContextSchema,type TaskCenterItem,type TaskCenterPlanningContext} from './task-center';

const WIDTH=1240,HEIGHT=1754,MARGIN=80,CONTENT_TOP=237,CONTENT_BOTTOM=1634;
const BODY_FONT=22,TITLE_FONT=26,MAX_PAGES=120;
type Line={text:string;size:number;bold:boolean;height:number;gap:number};
type Draw={text:string;x:number;y:number;size:number;bold:boolean;line?:boolean};
function clean(value:string){return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069]/gu,'').replace(/[\t\n\r]+/gu,' ').replace(/\s+/gu,' ').trim();}
const font=(size:number,bold=false)=>`${bold?'700':'400'} ${size}px Arial, "Noto Sans", "Noto Sans CJK SC", "Apple Color Emoji", sans-serif`;
function graphemes(value:string){const segmenter=typeof Intl.Segmenter==='function'?new Intl.Segmenter(undefined,{granularity:'grapheme'}):null;return segmenter?Array.from(segmenter.segment(value),part=>part.segment):Array.from(value);}
function wrap(context:CanvasRenderingContext2D,value:string,maxWidth:number){
 const lines:string[]=[];let current='';
 for(const word of clean(value).split(' ')){
  if(!word)continue;
  const combined=current?current+' '+word:word;
  if(context.measureText(combined).width<=maxWidth){current=combined;continue;}
  if(current){lines.push(current);current='';}
  if(context.measureText(word).width<=maxWidth){current=word;continue;}
  for(const character of graphemes(word)){
   if(current&&context.measureText(current+character).width>maxWidth){lines.push(current);current='';}
   current+=character;
  }
 }
 if(current||!lines.length)lines.push(current);return lines;
}
function civilDate(value:string|null,english:boolean){if(value===null)return english?'No due date':'Sin fecha';return new Intl.DateTimeFormat(english?'en-US':'es-CR',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(value+'T12:00:00Z'));}
async function waitForFonts(){
 if(!document.fonts)return;
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{await Promise.race([document.fonts.ready,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('Fonts were not ready')),10000);})]);}finally{if(timer!==undefined)clearTimeout(timer);}
}
async function decodeLogo(blob:Blob){
 const url=URL.createObjectURL(blob),logo=new Image();let timer:ReturnType<typeof setTimeout>|undefined;
 try{
  await new Promise<void>((resolve,reject)=>{logo.onload=()=>resolve();logo.onerror=()=>reject(Error('Primary logo could not load'));timer=setTimeout(()=>reject(Error('Primary logo timed out')),10000);logo.src=url;});
  if(!logo.naturalWidth||!logo.naturalHeight)throw Error('Primary logo is empty');return logo;
 }finally{if(timer!==undefined)clearTimeout(timer);logo.onload=null;logo.onerror=null;URL.revokeObjectURL(url);}
}
/** Raster pages preserve browser Unicode glyphs. Text is intentionally not searchable.
 * The caller must check active account again before saving the returned blob.
 */
export async function createTaskCenterPdf(items:TaskCenterItem[],{english,currentAccount,accountId,planning}:{english:boolean;currentAccount:()=>string|undefined;accountId:string;planning?:TaskCenterPlanningContext[]}):Promise<Blob>{
 const actor=z.string().uuid().parse(accountId),scope=()=>{if(currentAccount()!==actor)throw Error('Task export account changed');};scope();
 // Capture/validate all rows before the first await; later UI edits cannot alter export.
 const snapshot=JSON.parse(JSON.stringify(z.array(taskCenterItemSchema).min(1).max(100).parse(items))) as TaskCenterItem[];
 if(new Set(snapshot.map(item=>item.task.id)).size!==snapshot.length)throw Error('Duplicate selected task');
 const metadata=planning===undefined?null:JSON.parse(JSON.stringify(z.array(taskCenterPlanningContextSchema).min(1).max(100).parse(planning))) as TaskCenterPlanningContext[];
 if(metadata&&(metadata.length!==snapshot.length||metadata.some((context,index)=>context.taskId!==snapshot[index].task.id)))throw Error('Task export metadata does not match selection');
 if(typeof document==='undefined')throw Error('Task export requires the browser');
 const createdAt=new Date(),date=new Intl.DateTimeFormat(english?'en-US':'es-CR',{year:'numeric',month:'short',day:'numeric',timeZone:'America/Costa_Rica'}).format(createdAt);
 scope();await waitForFonts();scope();
 const response=await fetch('/brand/logo-primary.png',{cache:'force-cache',credentials:'same-origin'});scope();if(!response.ok)throw Error('Primary logo unavailable');
 const logoBlob=await response.blob();scope();if(!logoBlob.type.startsWith('image/png'))throw Error('Primary logo format changed');
 const logo=await decodeLogo(logoBlob);scope();
 const {jsPDF}=await import('jspdf');scope();
 const canvas=document.createElement('canvas');canvas.width=WIDTH;canvas.height=HEIGHT;
 const context=canvas.getContext('2d');if(!context)throw Error('Canvas unavailable');
 const pages:Draw[][]=[[]];let y=CONTENT_TOP;
 const nextPage=()=>{if(pages.length>=MAX_PAGES)throw Error('Task export exceeded page limit');pages.push([]);y=CONTENT_TOP;};
 const contentWidth=WIDTH-2*MARGIN-24;
 for(let index=0;index<snapshot.length;index++){
  const {task,work}=snapshot[index],status=task.status==='done'?(english?'Completed':'Completada'):(english?'Pending':'Pendiente');
  const contextSnapshot=metadata?.[index],assignment=contextSnapshot?.assignment,plan=contextSnapshot?.plan;
  const responsible=assignment?(clean(assignment.name)||(english?'Team member':'Integrante'))+(assignment.active?'':(english?' (Unavailable)':' (No disponible)')):clean(task.assignee)+(contextSnapshot&&task.assignee?' (Manual)':'');
  const fields:Array<{value:string;size:number;bold:boolean;gap:number}>=[
   {value:`${index+1}. ${clean(task.title)}`,size:TITLE_FONT,bold:true,gap:7},
   {value:`${english?'Job':'Trabajo'}: ${clean(work.service)||(english?'Job':'Trabajo')}${work.cancelled?(english?' (cancelled)':' (cancelado)'):''}`,size:BODY_FONT,bold:false,gap:3},
   {value:`${english?'Customer':'Cliente'}: ${clean(work.client)||(english?'Not specified':'Sin especificar')}`,size:BODY_FONT,bold:false,gap:3},
   {value:`${english?'Due date':'Fecha límite'}: ${civilDate(task.dueDate,english)} - ${english?'Status':'Estado'}: ${status}`,size:BODY_FONT,bold:false,gap:3},
   {value:`${english?'Assignee':'Responsable'}: ${responsible||(english?'Unassigned':'Sin asignar')}`,size:BODY_FONT,bold:false,gap:3},
  ];
  if(assignment&&task.assignee&&task.assignee.trim().toLocaleLowerCase()!==assignment.name.trim().toLocaleLowerCase())fields.push({value:`${english?'Previous reference':'Referencia anterior'}: ${clean(task.assignee)}`,size:BODY_FONT,bold:false,gap:3});
  if(plan?.plannedStart)fields.push({value:`${english?'Planned':'Previsto'}: ${civilDate(plan.plannedStart,english)}${plan.plannedEnd!==plan.plannedStart?' - '+civilDate(plan.plannedEnd,english):''}`,size:BODY_FONT,bold:false,gap:3});
  if(plan?.phaseName)fields.push({value:`${english?'Phase':'Fase'}: ${clean(plan.phaseName)}${plan.phaseArchived?(english?' (archived)':' (archivada)'):''}`,size:BODY_FONT,bold:false,gap:3});
  const lines:Line[]=[];
  for(const field of fields){context.font=font(field.size,field.bold);const wrapped=wrap(context,field.value,contentWidth);wrapped.forEach((text,i)=>lines.push({text,size:field.size,bold:field.bold,height:field.size===TITLE_FONT?35:31,gap:i===wrapped.length-1?field.gap:0}));}
  if(y+Math.min(110,lines.reduce((sum,line)=>sum+line.height+line.gap,0))>CONTENT_BOTTOM)nextPage();
  let continuing=false;
  for(const line of lines){
   if(y+line.height>CONTENT_BOTTOM){nextPage();continuing=true;}
   if(continuing){pages.at(-1)!.push({text:`${index+1}. ${english?'Continued':'Continuación'}`,x:MARGIN+12,y:y+24,size:BODY_FONT,bold:true});y+=39;continuing=false;}
   pages.at(-1)!.push({text:line.text,x:MARGIN+12,y:y+line.size,size:line.size,bold:line.bold,line:y===CONTENT_TOP});y+=line.height+line.gap;
  }
  y+=28;
 }
 const pdf=new jsPDF({orientation:'portrait',unit:'mm',format:'a4',compress:true});pdf.setProperties({title:english?'Selected tasks':'Tareas seleccionadas',creator:'ContrataCR Pro'});pdf.setCreationDate(createdAt);
 try{
  for(let page=0;page<pages.length;page++){
   scope();if(page)pdf.addPage('a4','portrait');
   context.fillStyle='#ffffff';context.fillRect(0,0,WIDTH,HEIGHT);
   const logoWidth=260;context.drawImage(logo,MARGIN,61,logoWidth,logoWidth*logo.naturalHeight/logo.naturalWidth);
   context.fillStyle='#162543';context.font=font(34,true);context.fillText(english?'Selected tasks':'Tareas seleccionadas',MARGIN,171);
   context.fillStyle='#52627a';context.font=font(20);context.fillText(`${snapshot.length} ${english?(snapshot.length===1?'task selected':'tasks selected'):(snapshot.length===1?'tarea seleccionada':'tareas seleccionadas')} - ${date}`,MARGIN,205);
   context.strokeStyle='#d7e1ea';context.lineWidth=2;context.beginPath();context.moveTo(MARGIN,222);context.lineTo(WIDTH-MARGIN,222);context.stroke();
   for(const draw of pages[page]){context.fillStyle=draw.bold?'#162543':'#52627a';context.font=font(draw.size,draw.bold);context.fillText(draw.text,draw.x,draw.y);}
   context.strokeStyle='#d7e1ea';context.lineWidth=1;context.beginPath();context.moveTo(MARGIN,1660);context.lineTo(WIDTH-MARGIN,1660);context.stroke();
   context.fillStyle='#52627a';context.font=font(20);context.fillText(english?'Private task list':'Lista privada de tareas',MARGIN,1698);
   context.textAlign='right';context.fillText(`${page+1} / ${pages.length}`,WIDTH-MARGIN,1698);context.textAlign='left';
   // Let the browser encode the page; jsPDF PNG deflate was too slow on mobile WebKit.
   pdf.addImage(canvas.toDataURL('image/jpeg',0.94),'JPEG',0,0,210,297,`task-center-page-${page}`,'NONE');
   // Yield for account changes/cancellation between pages, never a background save.
   scope();await new Promise<void>(resolve=>setTimeout(resolve,0));scope();
  }
  const blob=pdf.output('blob');scope();return blob;
 }finally{canvas.width=1;canvas.height=1;}
}
