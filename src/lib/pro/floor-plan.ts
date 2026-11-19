import {z} from 'zod';
import {winAnsi} from './integrations/esign/pdf';

/**
 * Round 6D (row 64): 2D floor plans of a job in real units (metres or feet). Walls are segments with a
 * thickness, doors/windows sit on a wall (offset from its start + width), rooms are polygons whose area and
 * perimeter are computed here (editor) and again in SQL (stored summary), dimensions are measured segments.
 * Pure: shared by the editor, the API, the PNG/PDF export and the extruded 3D view.
 */
export type Point=[number,number];
/** Round 12: furniture and fixtures that can be placed on a plan (size in plan units, footprint only). */
export const floorObjectKinds=['bed','sofa','table','chair','desk','wardrobe','cabinet','stove','fridge','sink','toilet','shower','bathtub','washer','stairs'] as const;
export type FloorObjectKind=typeof floorObjectKinds[number];
/** Default footprint in metres (width × depth). */
export const floorObjectSize:Record<FloorObjectKind,[number,number]>={bed:[1.6,2],sofa:[2,0.9],table:[1.6,0.9],chair:[0.5,0.5],desk:[1.2,0.6],wardrobe:[1.2,0.6],cabinet:[0.6,0.6],stove:[0.76,0.65],fridge:[0.8,0.75],sink:[0.6,0.5],toilet:[0.4,0.7],shower:[0.9,0.9],bathtub:[1.7,0.75],washer:[0.6,0.6],stairs:[1,3]};
export function floorObjectLabel(kind:FloorObjectKind,en:boolean){return (en?{bed:'Bed',sofa:'Sofa',table:'Table',chair:'Chair',desk:'Desk',wardrobe:'Wardrobe',cabinet:'Cabinet',stove:'Stove',fridge:'Fridge',sink:'Sink',toilet:'Toilet',shower:'Shower',bathtub:'Bathtub',washer:'Washer',stairs:'Stairs'}
 :{bed:'Cama',sofa:'Sofá',table:'Mesa',chair:'Silla',desk:'Escritorio',wardrobe:'Clóset',cabinet:'Mueble',stove:'Cocina',fridge:'Refrigeradora',sink:'Fregadero',toilet:'Inodoro',shower:'Ducha',bathtub:'Tina',washer:'Lavadora',stairs:'Escalera'})[kind];}
/** Corners of an object footprint (rotation in quarter turns around its centre). */
export function floorObjectCorners(o:{x:number;y:number;w:number;d:number;rotation:number}):Point[]{const quarter=o.rotation===90||o.rotation===270,w=quarter?o.d:o.w,d=quarter?o.w:o.d;return [[o.x-w/2,o.y-d/2],[o.x+w/2,o.y-d/2],[o.x+w/2,o.y+d/2],[o.x-w/2,o.y+d/2]];}
const coord=z.number().finite().min(-10000).max(10000);
const point=z.tuple([coord,coord]);
const shortId=z.string().regex(/^[A-Za-z0-9_-]{1,40}$/);
export const floorPlanContentSchema=z.object({
 walls:z.array(z.object({id:shortId,a:point,b:point,thickness:z.number().min(0.01).max(2)}).strict()).max(500),
 openings:z.array(z.object({id:shortId,wallId:shortId,kind:z.enum(['door','window']),offset:z.number().min(0).max(10000),width:z.number().min(0.1).max(20)}).strict()).max(300),
 rooms:z.array(z.object({id:shortId,name:z.string().trim().min(1).max(80),points:z.array(point).min(3).max(100)}).strict()).max(100),
 dimensions:z.array(z.object({id:shortId,a:point,b:point}).strict()).max(200),
 wallHeight:z.number().min(1).max(20),
 // Round 12 (row 63): optional level of the building this plan draws, and furniture/fixture objects.
 level:z.object({name:z.string().trim().min(1).max(60),order:z.number().int().min(-5).max(50)}).strict().optional(),
 objects:z.array(z.object({id:shortId,kind:z.enum(floorObjectKinds),x:coord,y:coord,w:z.number().min(0.1).max(50),d:z.number().min(0.1).max(50),rotation:z.union([z.literal(0),z.literal(90),z.literal(180),z.literal(270)])}).strict()).max(300).optional(),
}).strict().superRefine((value,context)=>{const walls=new Set(value.walls.map(w=>w.id));if(value.openings.some(o=>!walls.has(o.wallId)))context.addIssue({code:'custom',message:'opening wall'});});
export type FloorPlanContent=z.infer<typeof floorPlanContentSchema>;
export type FloorPlanSummary={rooms:{id:string;name:string;area:number;perimeter:number}[];totalArea:number;wallLength:number;doors:number;windows:number};
export type FloorPlan={id:string;workId:string;name:string;unit:'m'|'ft';content:FloorPlanContent;summary:FloorPlanSummary;source:'manual'|'scan';scanId:string|null;takeoffLink:{planId:string;measurements:{roomId:string;measurementId:string}[];at:string}|null;archived:boolean;revision:number;createdAt:string;updatedAt:string};
export const emptyFloorPlan=():FloorPlanContent=>({walls:[],openings:[],rooms:[],dimensions:[],wallHeight:2.4});
export const round3=(n:number)=>Math.round(n*1000)/1000;
export const distance=(a:Point,b:Point)=>Math.hypot(b[0]-a[0],b[1]-a[1]);
export function polygonArea(points:Point[]){let sum=0;for(let i=0;i<points.length;i++){const a=points[i]!,b=points[(i+1)%points.length]!;sum+=a[0]*b[1]-b[0]*a[1];}return Math.abs(sum)/2;}
export function polygonPerimeter(points:Point[]){let sum=0;for(let i=0;i<points.length;i++)sum+=distance(points[i]!,points[(i+1)%points.length]!);return sum;}
export function centroid(points:Point[]):Point{const n=points.length||1;return [points.reduce((s,p)=>s+p[0],0)/n,points.reduce((s,p)=>s+p[1],0)/n];}
export function summarize(content:FloorPlanContent):FloorPlanSummary{
 const rooms=content.rooms.map(r=>({id:r.id,name:r.name,area:round3(polygonArea(r.points)),perimeter:round3(polygonPerimeter(r.points))}));
 return {rooms,totalArea:round3(rooms.reduce((s,r)=>s+r.area,0)),wallLength:round3(content.walls.reduce((s,w)=>s+distance(w.a,w.b),0)),doors:content.openings.filter(o=>o.kind==='door').length,windows:content.openings.filter(o=>o.kind==='window').length};
}
export function bounds(content:FloorPlanContent){
 const pts:Point[]=[...content.walls.flatMap(w=>[w.a,w.b]),...content.rooms.flatMap(r=>r.points),...content.dimensions.flatMap(d=>[d.a,d.b]),...(content.objects??[]).flatMap(o=>floorObjectCorners(o))];
 if(!pts.length)return {minX:0,minY:0,maxX:10,maxY:8};
 return {minX:Math.min(...pts.map(p=>p[0])),minY:Math.min(...pts.map(p=>p[1])),maxX:Math.max(...pts.map(p=>p[0])),maxY:Math.max(...pts.map(p=>p[1]))};
}
/** Start/end points of an opening along its wall (clamped to the wall). */
export function openingSegment(content:FloorPlanContent,opening:FloorPlanContent['openings'][number]):[Point,Point]|null{
 const wall=content.walls.find(w=>w.id===opening.wallId);if(!wall)return null;const length=distance(wall.a,wall.b);if(length<=0)return null;
 const s=Math.min(opening.offset,length),e=Math.min(opening.offset+opening.width,length),ux=(wall.b[0]-wall.a[0])/length,uy=(wall.b[1]-wall.a[1])/length;
 return [[wall.a[0]+ux*s,wall.a[1]+uy*s],[wall.a[0]+ux*e,wall.a[1]+uy*e]];
}
/** Snap a value to a grid step (editor). */
export const snap=(value:number,step:number)=>step>0?Math.round(value/step)*step:value;
const unitLabel=(unit:'m'|'ft')=>unit==='m'?'m':'ft';
export const areaLabel=(value:number,unit:'m'|'ft',en:boolean)=>`${value.toLocaleString(en?'en-US':'es-CR',{maximumFractionDigits:2})} ${unitLabel(unit)}²`;
export const lengthLabel=(value:number,unit:'m'|'ft',en:boolean)=>`${value.toLocaleString(en?'en-US':'es-CR',{maximumFractionDigits:2})} ${unitLabel(unit)}`;
const xml=(text:string)=>text.replace(/[&<>"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[ch]!);
/** Standalone SVG (export source): white background, rooms with name + area, walls, openings, dimensions, scale bar. */
export function floorPlanSvg(plan:{name:string;unit:'m'|'ft';content:FloorPlanContent},en:boolean,widthPx=1600){
 const b=bounds(plan.content),pad=1,w=b.maxX-b.minX+2*pad,h=b.maxY-b.minY+2*pad,scale=widthPx/w,heightPx=Math.max(200,Math.round(h*scale))+60;
 const X=(x:number)=>((x-b.minX+pad)*scale).toFixed(1),Y=(y:number)=>((y-b.minY+pad)*scale+40).toFixed(1);
 const parts:string[]=[`<svg xmlns="http://www.w3.org/2000/svg" width="${widthPx}" height="${heightPx}" viewBox="0 0 ${widthPx} ${heightPx}" font-family="Helvetica, Arial, sans-serif">`,`<rect width="100%" height="100%" fill="#ffffff"/>`,`<text x="16" y="28" font-size="20" font-weight="700" fill="#162543">${xml(plan.content.level?plan.name+' · '+plan.content.level.name:plan.name)}</text>`];
 for(const room of plan.content.rooms){const c=centroid(room.points);parts.push(`<polygon points="${room.points.map(p=>X(p[0])+','+Y(p[1])).join(' ')}" fill="#eaf7fb" stroke="#9fc9da" stroke-width="1"/>`,`<text x="${X(c[0])}" y="${Y(c[1])}" text-anchor="middle" font-size="16" fill="#162543">${xml(room.name)}</text>`,`<text x="${X(c[0])}" y="${(Number(Y(c[1]))+20).toFixed(1)}" text-anchor="middle" font-size="14" fill="#52627a">${xml(areaLabel(polygonArea(room.points),plan.unit,en))}</text>`);}
 for(const object of plan.content.objects??[]){const c=floorObjectCorners(object);parts.push(`<polygon points="${c.map(p=>X(p[0])+','+Y(p[1])).join(' ')}" fill="#fff7e6" stroke="#b7791f" stroke-width="1.5"/>`,`<text x="${X(object.x)}" y="${(Number(Y(object.y))+4).toFixed(1)}" text-anchor="middle" font-size="11" fill="#7a4f0b">${xml(floorObjectLabel(object.kind,en))}</text>`);}
 for(const wall of plan.content.walls)parts.push(`<line x1="${X(wall.a[0])}" y1="${Y(wall.a[1])}" x2="${X(wall.b[0])}" y2="${Y(wall.b[1])}" stroke="#162543" stroke-width="${Math.max(2,wall.thickness*scale).toFixed(1)}" stroke-linecap="square"/>`);
 for(const opening of plan.content.openings){const seg=openingSegment(plan.content,opening);if(!seg)continue;parts.push(`<line x1="${X(seg[0][0])}" y1="${Y(seg[0][1])}" x2="${X(seg[1][0])}" y2="${Y(seg[1][1])}" stroke="${opening.kind==='door'?'#d9480f':'#1c7ed6'}" stroke-width="${opening.kind==='door'?6:4}"/>`);}
 for(const dim of plan.content.dimensions){const m:Point=[(dim.a[0]+dim.b[0])/2,(dim.a[1]+dim.b[1])/2];parts.push(`<line x1="${X(dim.a[0])}" y1="${Y(dim.a[1])}" x2="${X(dim.b[0])}" y2="${Y(dim.b[1])}" stroke="#7048e8" stroke-width="1.5" stroke-dasharray="6 4"/>`,`<text x="${X(m[0])}" y="${(Number(Y(m[1]))-6).toFixed(1)}" text-anchor="middle" font-size="13" fill="#7048e8">${xml(lengthLabel(distance(dim.a,dim.b),plan.unit,en))}</text>`);}
 parts.push(`<line x1="16" y1="${heightPx-16}" x2="${(16+scale).toFixed(1)}" y2="${heightPx-16}" stroke="#162543" stroke-width="3"/>`,`<text x="${(22+scale).toFixed(1)}" y="${heightPx-11}" font-size="13" fill="#162543">1 ${unitLabel(plan.unit)}</text>`,'</svg>');
 return parts.join('');
}
/** Vector PDF (A4 landscape): the plan fitted to the page + room table. No dependency; WinAnsi text. */
export function floorPlanPdf(plan:{name:string;unit:'m'|'ft';content:FloorPlanContent},en:boolean,workLabel:string):Uint8Array{
 const W=842,H=595,M=36,tableW=230,b=bounds(plan.content),pw=Math.max(b.maxX-b.minX,0.1),ph=Math.max(b.maxY-b.minY,0.1);
 const s=Math.min((W-3*M-tableW)/pw,(H-2*M-40)/ph),X=(x:number)=>(M+(x-b.minX)*s).toFixed(2),Y=(y:number)=>(H-M-40-(y-b.minY)*s).toFixed(2);
 const esc=(t:string)=>winAnsi(t).replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)');
 const text=(x:number|string,y:number|string,size:number,t:string,bold=false)=>`BT /${bold?'F2':'F1'} ${size} Tf ${x} ${y} Td (${esc(t)}) Tj ET`;
 const ops:string[]=['0.09 0.15 0.26 rg',text(M,H-M-14,16,plan.content.level?plan.name+' · '+plan.content.level.name:plan.name,true),'0.32 0.38 0.48 rg',text(M,H-M-30,9,workLabel+' · '+(en?'Scale':'Escala')+` 1 ${unitLabel(plan.unit)} = ${(s/72*25.4).toFixed(1)} mm`)];
 for(const r of plan.content.rooms){ops.push('0.92 0.97 0.98 rg',r.points.map((p,i)=>`${X(p[0])} ${Y(p[1])} ${i?'l':'m'}`).join(' ')+' h f');}
 for(const ob of plan.content.objects??[]){const c=floorObjectCorners(ob);ops.push('1 0.97 0.9 rg 0.72 0.47 0.12 RG 0.8 w',c.map((p,i)=>`${X(p[0])} ${Y(p[1])} ${i?'l':'m'}`).join(' ')+' h B','0.48 0.31 0.04 rg',text((Number(X(ob.x))-12).toFixed(2),(Number(Y(ob.y))-3).toFixed(2),6,floorObjectLabel(ob.kind,en)));}
 ops.push('0.09 0.15 0.26 RG');for(const w of plan.content.walls)ops.push(`${Math.max(1,w.thickness*s).toFixed(2)} w ${X(w.a[0])} ${Y(w.a[1])} m ${X(w.b[0])} ${Y(w.b[1])} l S`);
 for(const o of plan.content.openings){const seg=openingSegment(plan.content,o);if(seg)ops.push(`${o.kind==='door'?'0.85 0.28 0.06':'0.11 0.49 0.84'} RG 3 w ${X(seg[0][0])} ${Y(seg[0][1])} m ${X(seg[1][0])} ${Y(seg[1][1])} l S`);}
 ops.push('0.44 0.28 0.91 RG 0.8 w [4 3] 0 d');for(const d of plan.content.dimensions)ops.push(`${X(d.a[0])} ${Y(d.a[1])} m ${X(d.b[0])} ${Y(d.b[1])} l S`);ops.push('[] 0 d');
 for(const d of plan.content.dimensions){ops.push('0.44 0.28 0.91 rg',text(((Number(X(d.a[0]))+Number(X(d.b[0])))/2).toFixed(2),((Number(Y(d.a[1]))+Number(Y(d.b[1])))/2+4).toFixed(2),8,lengthLabel(distance(d.a,d.b),plan.unit,en)));}
 for(const r of plan.content.rooms){const c=centroid(r.points);ops.push('0.09 0.15 0.26 rg',text((Number(X(c[0]))-20).toFixed(2),Y(c[1]),9,r.name,true),text((Number(X(c[0]))-20).toFixed(2),(Number(Y(c[1]))-11).toFixed(2),8,areaLabel(polygonArea(r.points),plan.unit,en)));}
 const tx=W-M-tableW,summary=summarize(plan.content);let ty=H-M-60;
 ops.push('0.09 0.15 0.26 rg',text(tx,ty,11,en?'Rooms':'Ambientes',true));ty-=16;
 for(const r of summary.rooms.slice(0,28)){ops.push(text(tx,ty,9,`${r.name}: ${areaLabel(r.area,plan.unit,en)} · ${en?'perimeter':'perímetro'} ${lengthLabel(r.perimeter,plan.unit,en)}`));ty-=13;}
 ty-=6;ops.push(text(tx,ty,9,`${en?'Total area':'Área total'}: ${areaLabel(summary.totalArea,plan.unit,en)}`,true));ty-=13;
 ops.push(text(tx,ty,9,`${en?'Walls':'Paredes'}: ${lengthLabel(summary.wallLength,plan.unit,en)} · ${en?'height':'altura'} ${lengthLabel(plan.content.wallHeight,plan.unit,en)}`));ty-=13;
 ops.push(text(tx,ty,9,`${en?'Doors':'Puertas'}: ${summary.doors} · ${en?'Windows':'Ventanas'}: ${summary.windows}`));
 ops.push('0.32 0.38 0.48 rg',text(M,M-14,7,en?'Reference drawing for quoting; not a structural or engineering drawing.':'Dibujo de referencia para cotizar; no es un plano estructural ni de ingeniería.'));
 const stream=ops.join('\n'),objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>',`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>`,`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'];
 let out='%PDF-1.4\n';const offsets:number[]=[];objects.forEach((o,i)=>{offsets.push(out.length);out+=`${i+1} 0 obj\n${o}\nendobj\n`;});
 const xref=out.length;out+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`+offsets.map(o=>String(o).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
 const bytes=new Uint8Array(out.length);for(let i=0;i<out.length;i++)bytes[i]=out.charCodeAt(i)&0xff;return bytes;
}
/** 3D: each wall extruded to the wall height as a box; returns quads projected with a simple orbit camera. */
export type Face={points:[number,number][];depth:number;shade:number;kind:'wall'|'floor'};
export function extrudedFaces(content:FloorPlanContent,yaw:number,pitch:number,size:{w:number;h:number}):Face[]{
 const b=bounds(content),cx=(b.minX+b.maxX)/2,cy=(b.minY+b.maxY)/2,span=Math.max(b.maxX-b.minX,b.maxY-b.minY,1),k=Math.min(size.w,size.h)/(span*1.6);
 const cosY=Math.cos(yaw),sinY=Math.sin(yaw),cosP=Math.cos(pitch),sinP=Math.sin(pitch);
 const project=(x:number,y:number,z:number):[number,number,number]=>{const px=x-cx,py=y-cy,rx=px*cosY-py*sinY,ry=px*sinY+py*cosY,ty=ry*cosP-z*sinP,tz=ry*sinP+z*cosP;return [size.w/2+rx*k,size.h/2+ty*k,tz];};
 const faces:Face[]=[];
 for(const r of content.rooms){const pts=r.points.map(p=>project(p[0],p[1],0));faces.push({points:pts.map(p=>[p[0],p[1]]),depth:pts.reduce((s,p)=>s+p[2],0)/pts.length-1000,shade:0.94,kind:'floor'});}
 for(const w of content.walls){
  const len=distance(w.a,w.b);if(len<=0)continue;const nx=-(w.b[1]-w.a[1])/len*w.thickness/2,ny=(w.b[0]-w.a[0])/len*w.thickness/2,hgt=content.wallHeight;
  const base:[number,number][]=[[w.a[0]+nx,w.a[1]+ny],[w.b[0]+nx,w.b[1]+ny],[w.b[0]-nx,w.b[1]-ny],[w.a[0]-nx,w.a[1]-ny]];
  const quads:[number,number,number][][]=[[0,1],[1,2],[2,3],[3,0]].map(([i,j])=>[[...base[i!]!,0],[...base[j!]!,0],[...base[j!]!,hgt],[...base[i!]!,hgt]] as [number,number,number][]);
  quads.push(base.map(p=>[p[0],p[1],hgt] as [number,number,number]));
  for(const [index,quad] of quads.entries()){const pts=quad.map(p=>project(p[0],p[1],p[2]));const lightAngle=index===4?1:Math.abs(Math.cos(Math.atan2(ny,nx)+yaw+(index%2?Math.PI/2:0)));faces.push({points:pts.map(p=>[p[0],p[1]]),depth:pts.reduce((s,p)=>s+p[2],0)/4,shade:index===4?0.55:0.45+0.4*lightAngle,kind:'wall'});}
 }
 return faces.sort((a,b2)=>a.depth-b2.depth);
}
