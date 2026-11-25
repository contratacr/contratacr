'use client';

import {useEffect,useRef,useState,type CSSProperties,type KeyboardEvent,type PointerEvent} from 'react';
import {CAPA_HOJA} from '@/lib/capas';
import {MOOD_COORD_MAX,MOOD_MIN_SIZE,MOOD_POINTS_MAX,clampBox,moodPageRatio,type MoodPageFormat,type MoodRotation} from '@/lib/pro/mood-boards';

/**
 * One fixed-size page of an idea board. Geometry is normalized (0..10000), so the
 * page scales to any width: positions are percentages and text uses container
 * units. Editing uses native pointer events (no drag library); every change is
 * reported once, when the gesture ends, so undo keeps one step per gesture.
 */
export type CanvasItem={
 id:string;kind:'image'|'product'|'swatch'|'note'|'text'|'arrow'|'drawing';x:number;y:number;w:number;h:number;rotation:MoodRotation;
 /** Reauthorized private image URL, or null. */
 src:string|null;title:string|null;subtitle:string|null;color:string|null;text:string|null;label:string;
 /** Round 7C: arrow / freehand points relative to the box (0..1000). */
 points?:[number,number][];
};
export type Box={x:number;y:number;w:number;h:number};
type Drag={id:string;mode:'move'|'resize';startX:number;startY:number;origin:Box;width:number;height:number;moved:boolean;last:Box};
const pct=(value:number)=>`${value/100}%`;
export const STEP_SMALL=50,STEP_LARGE=500;

export function moodNudge(box:Box,key:string,large:boolean):Box|null{
 const step=large?STEP_LARGE:STEP_SMALL;
 if(key==='ArrowLeft')return clampBox({...box,x:box.x-step});
 if(key==='ArrowRight')return clampBox({...box,x:box.x+step});
 if(key==='ArrowUp')return clampBox({...box,y:box.y-step});
 if(key==='ArrowDown')return clampBox({...box,y:box.y+step});
 return null;
}

export function MoodCanvas({format,background,items,label,selectedId=null,editable=false,thumbnail=false,onSelect,onCommit,onRemove,resizeLabel,drawColor=null,drawLabel,onDraw}:{
 format:MoodPageFormat;background:string;items:CanvasItem[];label:string;selectedId?:string|null;editable?:boolean;thumbnail?:boolean;
 onSelect?:(id:string|null)=>void;onCommit?:(id:string,box:Box)=>void;onRemove?:(id:string)=>void;resizeLabel?:string;
 /** Round 7C: freehand drawing mode (one stroke = one element), pointer and touch. */
 drawColor?:string|null;drawLabel?:string;onDraw?:(stroke:Box&{points:[number,number][]})=>void;
}){
 const ref=useRef<HTMLDivElement>(null),drag=useRef<Drag|null>(null);
 const [live,setLive]=useState<{id:string;box:Box}|null>(null);
 const ratio=moodPageRatio[format],stroke=useRef<{pointer:number;points:[number,number][]}|null>(null),[livePath,setLivePath]=useState<[number,number][]>([]);
 function pagePoint(event:PointerEvent<HTMLElement>):[number,number]|null{const rect=ref.current?.getBoundingClientRect();if(!rect||rect.width<1||rect.height<1)return null;return[Math.round(Math.min(MOOD_COORD_MAX,Math.max(0,(event.clientX-rect.left)/rect.width*MOOD_COORD_MAX))),Math.round(Math.min(MOOD_COORD_MAX,Math.max(0,(event.clientY-rect.top)/rect.height*MOOD_COORD_MAX)))];}
 function drawStart(event:PointerEvent<HTMLElement>){const p=pagePoint(event);if(!p)return;event.preventDefault();try{event.currentTarget.setPointerCapture(event.pointerId);}catch{/* capture is best effort */}stroke.current={pointer:event.pointerId,points:[p]};setLivePath([p]);}
 function drawMove(event:PointerEvent<HTMLElement>){const s=stroke.current;if(!s||s.pointer!==event.pointerId)return;const p=pagePoint(event);if(!p)return;const last=s.points[s.points.length-1];if(Math.abs(p[0]-last[0])+Math.abs(p[1]-last[1])<40)return;s.points.push(p);setLivePath([...s.points]);}
 function drawEnd(event:PointerEvent<HTMLElement>){const s=stroke.current;stroke.current=null;setLivePath([]);if(!s||s.pointer!==event.pointerId||s.points.length<2)return;onDraw?.(moodStroke(s.points));}
 function begin(event:PointerEvent<HTMLElement>,item:CanvasItem,mode:Drag['mode']){
  if(!editable||event.button!==0&&event.pointerType==='mouse')return;
  event.stopPropagation();onSelect?.(item.id);
  const rect=ref.current?.getBoundingClientRect();if(!rect||rect.width<1||rect.height<1)return;
  drag.current={id:item.id,mode,startX:event.clientX,startY:event.clientY,origin:{x:item.x,y:item.y,w:item.w,h:item.h},width:rect.width,height:rect.height,moved:false,last:{x:item.x,y:item.y,w:item.w,h:item.h}};
  event.currentTarget.setPointerCapture(event.pointerId);
 }
 function move(event:PointerEvent<HTMLElement>){
  const d=drag.current;if(!d)return;
  const dx=(event.clientX-d.startX)/d.width*MOOD_COORD_MAX,dy=(event.clientY-d.startY)/d.height*MOOD_COORD_MAX;
  if(!d.moved&&Math.abs(event.clientX-d.startX)+Math.abs(event.clientY-d.startY)<3)return;
  d.moved=true;event.preventDefault();
  const o=d.origin;
  const box=d.mode==='move'?clampBox({...o,x:o.x+dx,y:o.y+dy})
   :{x:o.x,y:o.y,w:Math.round(Math.max(MOOD_MIN_SIZE,Math.min(MOOD_COORD_MAX-o.x,o.w+dx))),h:Math.round(Math.max(MOOD_MIN_SIZE,Math.min(MOOD_COORD_MAX-o.y,o.h+dy)))};
  d.last=box;setLive({id:d.id,box});
 }
 function end(event:PointerEvent<HTMLElement>){
  const d=drag.current;drag.current=null;
  if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
  if(d?.moved){const box=d.last,o=d.origin;if(box.x!==o.x||box.y!==o.y||box.w!==o.w||box.h!==o.h)onCommit?.(d.id,box);}
  setLive(null);
 }
 function cancel(){drag.current=null;setLive(null);}
 function key(event:KeyboardEvent<HTMLElement>,item:CanvasItem){
  if(!editable)return;
  if(event.key==='Delete'||event.key==='Backspace'){event.preventDefault();onRemove?.(item.id);return;}
  const box=moodNudge(item,event.key,event.shiftKey);if(!box)return;
  event.preventDefault();onSelect?.(item.id);if(box.x!==item.x||box.y!==item.y)onCommit?.(item.id,box);
 }
 const font=(size:number):CSSProperties=>({fontSize:thumbnail?`${size}cqw`:`max(10px, ${size}cqw)`});
 return <div ref={ref} role={editable?'group':'img'} aria-label={label} data-mood-canvas={thumbnail?'thumbnail':editable?'editor':'view'}
  onPointerDown={editable?event=>{if(event.target===event.currentTarget)onSelect?.(null);}:undefined}
  className={`relative w-full select-none overflow-hidden ${thumbnail?'rounded-lg':'rounded-xl shadow-sm ring-1 ring-[#d7e1ea]'}`}
  style={{aspectRatio:`${1/ratio}`,background,containerType:'inline-size'}}>
  {items.map((item,index)=>{
   const box=live?.id===item.id?live.box:item,selected=editable&&item.id===selectedId;
   return <div key={item.id} data-mood-element={item.kind} data-mood-element-id={item.id} data-selected={selected||undefined}
    role={editable?'button':undefined} tabIndex={editable?0:undefined} aria-pressed={editable?selected:undefined} aria-label={editable?item.label:undefined}
    onPointerDown={editable?event=>begin(event,item,'move'):undefined} onPointerMove={editable?move:undefined} onPointerUp={editable?end:undefined} onPointerCancel={editable?cancel:undefined}
    onKeyDown={editable?event=>key(event,item):undefined} onFocus={editable?()=>onSelect?.(item.id):undefined}
    className={`absolute outline-none ${editable?'cursor-move touch-none focus-visible:ring-4 focus-visible:ring-[#0089bb]/40':''} ${selected?'ring-2 ring-[#0089bb] ring-offset-1':''}`}
    style={{left:pct(box.x),top:pct(box.y),width:pct(box.w),height:pct(box.h),zIndex:index+1,transform:item.rotation?`rotate(${item.rotation}deg)`:undefined}}>
    <ElementBody item={item} font={font}/>
    {selected&&<button type="button" aria-label={resizeLabel} data-mood-resize onPointerDown={event=>begin(event,item,'resize')} onPointerMove={move} onPointerUp={end} onPointerCancel={cancel}
     className="absolute bottom-0 right-0 z-10 flex h-8 w-8 cursor-nwse-resize touch-none items-end justify-end p-1"><span aria-hidden="true" className="block h-4 w-4 rounded-sm border-2 border-white bg-[#0089bb] shadow"/></button>}
   </div>;
  })}
  {editable&&drawColor&&<div data-mood-draw-layer role="application" aria-label={drawLabel} className="absolute inset-0 z-[200] cursor-crosshair touch-none" onPointerDown={drawStart} onPointerMove={drawMove} onPointerUp={drawEnd} onPointerCancel={()=>{stroke.current=null;setLivePath([]);}}>{livePath.length>1&&<svg viewBox="0 0 10000 10000" preserveAspectRatio="none" className="pointer-events-none h-full w-full" aria-hidden="true"><polyline points={livePath.map(p=>p.join(',')).join(' ')} fill="none" stroke={drawColor} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke"/></svg>}</div>}
 </div>;
}

/** Page points (0..10000) → element box (≥ minimum size, inside the page) and points relative to it (0..1000), at most MOOD_POINTS_MAX. */
export function moodStroke(points:[number,number][]):Box&{points:[number,number][]}{
 const step=Math.max(1,Math.ceil(points.length/MOOD_POINTS_MAX)),kept=points.filter((_,i)=>i%step===0||i===points.length-1).slice(-MOOD_POINTS_MAX);
 const xs=kept.map(p=>p[0]),ys=kept.map(p=>p[1]);let x=Math.min(...xs),y=Math.min(...ys),w=Math.max(...xs)-x,h=Math.max(...ys)-y;
 if(w<MOOD_MIN_SIZE){x=Math.max(0,Math.min(MOOD_COORD_MAX-MOOD_MIN_SIZE,x-Math.round((MOOD_MIN_SIZE-w)/2)));w=MOOD_MIN_SIZE;}
 if(h<MOOD_MIN_SIZE){y=Math.max(0,Math.min(MOOD_COORD_MAX-MOOD_MIN_SIZE,y-Math.round((MOOD_MIN_SIZE-h)/2)));h=MOOD_MIN_SIZE;}
 return{x,y,w,h,points:kept.map(p=>[Math.round(Math.min(1000,Math.max(0,(p[0]-x)/w*1000))),Math.round(Math.min(1000,Math.max(0,(p[1]-y)/h*1000)))] as [number,number])};
}

function ElementBody({item,font}:{item:CanvasItem;font:(size:number)=>CSSProperties}){
 /* eslint-disable @next/next/no-img-element -- private image route reauthorized on every request */
 if(item.kind==='image')return item.src?<img src={item.src} alt={item.label} draggable={false} loading="lazy" className="pointer-events-none h-full w-full bg-[#eef2f6] object-cover"/>:<div className="h-full w-full bg-[#eef2f6]"/>;
 if(item.kind==='swatch')return <div className="flex h-full w-full flex-col overflow-hidden rounded-md border border-black/10 bg-white">
  <div className="min-h-0 flex-1" style={{background:item.color??'#ffffff'}}/>
  {(item.title||item.color)&&<p className="truncate px-[4%] py-[3%] font-semibold leading-tight text-[#162543]" style={font(1.3)}>{item.title??item.color}</p>}
 </div>;
 // Round 7C: free text (no card), arrow and freehand stroke (SVG scaled to the box).
 if(item.kind==='text')return <p data-mood-free-text className="h-full w-full overflow-hidden whitespace-pre-wrap break-words font-semibold leading-snug" style={{...font(2),color:item.color??'#162543'}}>{item.text}</p>;
 if(item.kind==='arrow'||item.kind==='drawing'){const pts=item.points??[],color=item.color??'#162543',marker='mood-arrow-'+item.id;
  return <svg data-mood-stroke={item.kind} viewBox="0 0 1000 1000" preserveAspectRatio="none" className="pointer-events-none h-full w-full overflow-visible" aria-hidden="true">
   {item.kind==='arrow'&&<defs><marker id={marker} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill={color}/></marker></defs>}
   <polyline points={pts.map(p=>p.join(',')).join(' ')} fill="none" stroke={color} strokeWidth={item.kind==='arrow'?4:3} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" markerEnd={item.kind==='arrow'?`url(#${marker})`:undefined}/>
  </svg>;}
 if(item.kind==='note')return <div className="h-full w-full overflow-hidden rounded-md border border-[#e6d9a8] bg-[#fff8dc] p-[4%] text-[#162543]">
  <p className="whitespace-pre-wrap break-words leading-snug" style={font(1.5)}>{item.text}</p>
 </div>;
 return <div className="flex h-full w-full flex-col overflow-hidden rounded-md border border-[#d7e1ea] bg-white">
  {item.src&&<img src={item.src} alt="" draggable={false} loading="lazy" className="pointer-events-none min-h-0 w-full flex-1 bg-[#eef2f6] object-cover"/>}
  <div className={`px-[5%] py-[4%] ${item.src?'':'flex flex-1 flex-col justify-center'}`}>
   <p className="line-clamp-2 font-semibold leading-tight text-[#162543]" style={font(1.3)}>{item.title}</p>
   {item.subtitle&&<p className="mt-[2%] truncate leading-tight text-[#52627a]" style={font(1.1)}>{item.subtitle}</p>}
  </div>
 </div>;
 /* eslint-enable @next/next/no-img-element */
}

/**
 * Full-screen presentation, one page at a time. Uses the Fullscreen API when the
 * browser allows it and otherwise covers the window. Arrows move, Escape closes.
 */
export function MoodPresenter({format,title,pages,start=0,onClose,en}:{
 format:MoodPageFormat;title:string;pages:Array<{id:string;name:string|null;background:string;items:CanvasItem[]}>;start?:number;onClose:()=>void;en:boolean;
}){
 const [index,setIndex]=useState(Math.min(Math.max(0,start),pages.length-1));
 const root=useRef<HTMLDivElement>(null),close=useRef<HTMLButtonElement>(null),closeRef=useRef(onClose);
 useEffect(()=>{closeRef.current=onClose;},[onClose]);
 useEffect(()=>{
  const node=root.current,previous=document.activeElement as HTMLElement|null;close.current?.focus();
  if(node?.requestFullscreen&&!document.fullscreenElement)node.requestFullscreen().catch(()=>undefined);
  const exit=()=>{if(!document.fullscreenElement&&node&&document.body.contains(node))closeRef.current();};
  document.addEventListener('fullscreenchange',exit);
  return()=>{document.removeEventListener('fullscreenchange',exit);if(document.fullscreenElement)void document.exitFullscreen().catch(()=>undefined);previous?.focus?.();};
 },[]);
 const page=pages[index],ratio=moodPageRatio[format];
 const t=en?{close:'Close presentation',prev:'Previous page',next:'Next page',page:(a:number,b:number)=>`Page ${a} of ${b}`}:{close:'Cerrar presentación',prev:'Página anterior',next:'Página siguiente',page:(a:number,b:number)=>`Página ${a} de ${b}`};
 if(!page)return null;
 // CAPA_HOJA: at z-[90] it tied with the mobile tab bar, which is later in the DOM and covered the page buttons on
 // phones (iPhone Safari has no element fullscreen, so this overlay is what people see). Not portalled: it can open
 // inside a managed ProModal, whose focus trap and Escape handling must keep treating it as part of the dialog.
 return <div ref={root} role="dialog" aria-modal="true" aria-label={title} data-mood-presenter
  onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();onClose();}else if(event.key==='ArrowRight'||event.key==='PageDown'){event.preventDefault();setIndex(i=>Math.min(pages.length-1,i+1));}else if(event.key==='ArrowLeft'||event.key==='PageUp'){event.preventDefault();setIndex(i=>Math.max(0,i-1));}}}
  className={`fixed inset-0 ${CAPA_HOJA} flex flex-col bg-[#0f1b2d] text-white`}>
  <div className="flex min-h-14 items-center gap-3 px-4 py-2">
   <p className="min-w-0 flex-1 truncate text-sm font-semibold">{title}{page.name?` · ${page.name}`:''}</p>
   <p aria-live="polite" className="shrink-0 text-sm text-white/80">{t.page(index+1,pages.length)}</p>
   <button ref={close} type="button" onClick={onClose} className="min-h-11 shrink-0 rounded-xl bg-white/10 px-4 text-sm font-semibold hover:bg-white/20">{t.close}</button>
  </div>
  <div className="flex min-h-0 flex-1 items-center justify-center px-3 pb-3">
   <div style={{width:`min(100%, calc((100dvh - 9.5rem) / ${ratio}))`}}><MoodCanvas format={format} background={page.background} items={page.items} label={t.page(index+1,pages.length)}/></div>
  </div>
  <div className="flex min-h-16 items-center justify-center gap-3 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
   <button type="button" disabled={index===0} onClick={()=>setIndex(i=>Math.max(0,i-1))} className="min-h-11 rounded-xl bg-white/10 px-5 text-sm font-semibold hover:bg-white/20 disabled:opacity-40">{t.prev}</button>
   <button type="button" disabled={index>=pages.length-1} onClick={()=>setIndex(i=>Math.min(pages.length-1,i+1))} className="min-h-11 rounded-xl bg-white/10 px-5 text-sm font-semibold hover:bg-white/20 disabled:opacity-40">{t.next}</button>
  </div>
 </div>;
}
