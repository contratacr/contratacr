import {distance,floorObjectCorners,floorObjectHeightOf,type FloorPlanContent,type Point} from './floor-plan';

/**
 * Row 64: first-person walkthrough of a floor plan, drawn on a 2D canvas (no dependency, no WebGL), plus a Wavefront OBJ
 * export of the extruded plan (walls, floors, furniture) to open it in any 3D viewer or in the phone's AR viewer.
 * Pure and deterministic: the projector clips every polygon against the near plane (without clipping, faces behind the
 * eye invert and smear across the screen), the collision test keeps the walker inside the walls (doors are passable).
 * Native AR (placing the model in the room through the camera) needs ARKit/ARCore and is NOT done here.
 */
export type WalkCamera={x:number;y:number;/** radians, 0 looks toward +x, plan y grows to the walker's right when facing +x */heading:number;eye:number;fov:number};
export type WalkFace={points:[number,number][];depth:number;shade:number;kind:'floor'|'wall'|'object'|'door'|'window';color?:string};
export const WALK_NEAR=0.08,WALK_RADIUS=0.25,WALK_EYE=1.6;
type V3=[number,number,number];
/** Plan (x,y,z up) to camera space: [right, up, forward]. */
function toCamera(c:WalkCamera,x:number,y:number,z:number):V3{
 const dx=x-c.x,dy=y-c.y,cos=Math.cos(c.heading),sin=Math.sin(c.heading);
 return [-dx*sin+dy*cos,z-c.eye,dx*cos+dy*sin];
}
/** Sutherland-Hodgman against the plane forward = WALK_NEAR (camera space). */
export function clipNear(polygon:V3[]):V3[]{
 const out:V3[]=[];
 for(let i=0;i<polygon.length;i++){
  const a=polygon[i]!,b=polygon[(i+1)%polygon.length]!,ain=a[2]>=WALK_NEAR,bin=b[2]>=WALK_NEAR;
  if(ain)out.push(a);
  if(ain!==bin){const t=(WALK_NEAR-a[2])/(b[2]-a[2]);out.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,WALK_NEAR]);}
 }
 return out;
}
function project(c:WalkCamera,size:{w:number;h:number},polygon:V3[],kind:WalkFace['kind'],shade:number,bias=0,color?:string):WalkFace|null{
 const clipped=clipNear(polygon);if(clipped.length<3)return null;
 const focal=size.w/2/Math.tan(c.fov/2);
 const points=clipped.map(p=>[size.w/2+p[0]/p[2]*focal,size.h/2-p[1]/p[2]*focal] as [number,number]);
 if(!points.every(p=>Number.isFinite(p[0])&&Number.isFinite(p[1])))return null;
 const depth=clipped.reduce((s,p)=>s+Math.hypot(p[0],p[2]),0)/clipped.length+bias;
 return {points,depth,shade,kind,...(color?{color}:{})};
}
const SECTION=1;
/** Faces visible from the camera, farthest first (painter's algorithm). Walls are cut into 1-unit sections so the sort stays right. */
export function walkthroughFaces(content:FloorPlanContent,camera:WalkCamera,size:{w:number;h:number}):WalkFace[]{
 const faces:WalkFace[]=[],push=(face:WalkFace|null)=>{if(face)faces.push(face);};
 const cam=(x:number,y:number,z:number)=>toCamera(camera,x,y,z);
 for(const room of content.rooms){push(project(camera,size,room.points.map(p=>cam(p[0],p[1],0)),'floor',0.92,1000));}
 for(const wall of content.walls){
  const len=distance(wall.a,wall.b);if(len<=0)continue;
  const ux=(wall.b[0]-wall.a[0])/len,uy=(wall.b[1]-wall.a[1])/len,nx=-uy*wall.thickness/2,ny=ux*wall.thickness/2,hgt=content.wallHeight;
  const sections=Math.max(1,Math.ceil(len/SECTION));
  for(let s=0;s<sections;s++){
   const s0=len*s/sections,s1=len*(s+1)/sections,p0:Point=[wall.a[0]+ux*s0,wall.a[1]+uy*s0],p1:Point=[wall.a[0]+ux*s1,wall.a[1]+uy*s1];
   // Both long faces and the two ends (ends only matter for the first and last section).
   const sides:[Point,Point,number][]=[[[p0[0]+nx,p0[1]+ny],[p1[0]+nx,p1[1]+ny],0.78],[[p1[0]-nx,p1[1]-ny],[p0[0]-nx,p0[1]-ny],0.62]];
   if(s===0)sides.push([[p0[0]-nx,p0[1]-ny],[p0[0]+nx,p0[1]+ny],0.55]);
   if(s===sections-1)sides.push([[p1[0]+nx,p1[1]+ny],[p1[0]-nx,p1[1]-ny],0.55]);
   for(const [a,b,shade] of sides)push(project(camera,size,[cam(a[0],a[1],0),cam(b[0],b[1],0),cam(b[0],b[1],hgt),cam(a[0],a[1],hgt)],'wall',shade));
  }
  for(const opening of content.openings){
   if(opening.wallId!==wall.id)continue;
   const s0=Math.min(opening.offset,len),s1=Math.min(opening.offset+opening.width,len);if(s1-s0<=0.05)continue;
   const z0=opening.kind==='door'?0:0.9,z1=opening.kind==='door'?Math.min(2.1,hgt):Math.min(2.1,hgt);
   for(const sign of [1,-1]){
    const e=sign*(wall.thickness/2+0.004),a:Point=[wall.a[0]+ux*s0-uy*e,wall.a[1]+uy*s0+ux*e],b:Point=[wall.a[0]+ux*s1-uy*e,wall.a[1]+uy*s1+ux*e];
    push(project(camera,size,[cam(a[0],a[1],z0),cam(b[0],b[1],z0),cam(b[0],b[1],z1),cam(a[0],a[1],z1)],opening.kind,opening.kind==='door'?0.5:0.9,-0.6));
   }
  }
 }
 for(const object of content.objects??[]){
  const base=floorObjectCorners(object),hgt=Math.min(floorObjectHeightOf(object),content.wallHeight);
  const quads:V3[][]=[[0,1],[1,2],[2,3],[3,0]].map(([i,j])=>[cam(base[i!]![0],base[i!]![1],0),cam(base[j!]![0],base[j!]![1],0),cam(base[j!]![0],base[j!]![1],hgt),cam(base[i!]![0],base[i!]![1],hgt)]);
  quads.push(base.map(p=>cam(p[0],p[1],hgt)));
  for(const [index,quad] of quads.entries())push(project(camera,size,quad,'object',index===4?0.85:0.55+0.1*index,-0.05,object.color));
 }
 return faces.sort((a,b)=>b.depth-a.depth);
}
function segmentDistance(p:Point,a:Point,b:Point){
 const len=distance(a,b);if(!len)return {d:distance(p,a),s:0};
 const ux=(b[0]-a[0])/len,uy=(b[1]-a[1])/len,s=Math.max(0,Math.min(len,(p[0]-a[0])*ux+(p[1]-a[1])*uy));
 return {d:distance(p,[a[0]+ux*s,a[1]+uy*s]),s};
}
/** True when the walker (a disc of WALK_RADIUS) would touch a wall that has no door at that spot. */
export function walkBlocked(content:FloorPlanContent,x:number,y:number,radius=WALK_RADIUS){
 for(const wall of content.walls){
  const {d,s}=segmentDistance([x,y],wall.a,wall.b);
  if(d>=radius+wall.thickness/2)continue;
  const doorway=content.openings.some(o=>o.wallId===wall.id&&o.kind==='door'&&s>=o.offset-0.05&&s<=o.offset+o.width+0.05);
  if(!doorway)return true;
 }
 return false;
}
/** Moves the walker by (dx,dy) sliding along walls: tries the full step, then each axis alone. */
export function walkStep(content:FloorPlanContent,camera:WalkCamera,dx:number,dy:number):WalkCamera{
 const nx=camera.x+dx,ny=camera.y+dy;
 if(!walkBlocked(content,nx,ny))return {...camera,x:nx,y:ny};
 if(!walkBlocked(content,nx,camera.y))return {...camera,x:nx};
 if(!walkBlocked(content,camera.x,ny))return {...camera,y:ny};
 return camera;
}
/** Starting camera: the centre of the first room (or the plan centre), looking along +x. */
export function walkStart(content:FloorPlanContent):WalkCamera{
 const pts=content.rooms[0]?.points??content.walls.flatMap(w=>[w.a,w.b]);
 const x=pts.length?pts.reduce((s,p)=>s+p[0],0)/pts.length:0,y=pts.length?pts.reduce((s,p)=>s+p[1],0)/pts.length:0;
 return {x,y,heading:0,eye:Math.min(WALK_EYE,content.wallHeight-0.3),fov:Math.PI/2.4};
}

/** Wavefront OBJ (metres, Y up) of the extruded plan: floors, walls and objects as boxes. Units of the plan are converted. */
export function floorPlanObj(plan:{name:string;unit:'m'|'ft';content:FloorPlanContent}):string{
 const k=plan.unit==='ft'?0.3048:1,lines:string[]=['# ContrataCR floor plan','# Units: metres, Y up. Reference model for viewing; not a structural drawing.'];let count=0;
 const vertex=(x:number,y:number,z:number)=>{lines.push(`v ${(x*k).toFixed(4)} ${(z*k).toFixed(4)} ${(y*k).toFixed(4)}`);return ++count;};
 const safe=(s:string)=>s.replace(/[^A-Za-z0-9_-]+/g,'_').slice(0,40)||'x';
 const box=(name:string,base:Point[],height:number)=>{
  lines.push('o '+safe(name));const lo=base.map(p=>vertex(p[0],p[1],0)),hi=base.map(p=>vertex(p[0],p[1],height));
  lines.push(`f ${lo[3]} ${lo[2]} ${lo[1]} ${lo[0]}`,`f ${hi[0]} ${hi[1]} ${hi[2]} ${hi[3]}`);
  for(let i=0;i<4;i++){const j=(i+1)%4;lines.push(`f ${lo[i]} ${lo[j]} ${hi[j]} ${hi[i]}`);}
 };
 for(const room of plan.content.rooms){
  lines.push('o floor_'+safe(room.name));const ids=room.points.map(p=>vertex(p[0],p[1],0));
  for(let i=1;i<ids.length-1;i++)lines.push(`f ${ids[0]} ${ids[i]} ${ids[i+1]}`);
 }
 for(const [index,wall] of plan.content.walls.entries()){
  const len=distance(wall.a,wall.b);if(len<=0)continue;const nx=-(wall.b[1]-wall.a[1])/len*wall.thickness/2,ny=(wall.b[0]-wall.a[0])/len*wall.thickness/2;
  box('wall_'+(index+1),[[wall.a[0]+nx,wall.a[1]+ny],[wall.b[0]+nx,wall.b[1]+ny],[wall.b[0]-nx,wall.b[1]-ny],[wall.a[0]-nx,wall.a[1]-ny]],plan.content.wallHeight);
 }
 for(const [index,object] of (plan.content.objects??[]).entries())box((object.kind==='custom'?object.label??'object':object.kind)+'_'+(index+1),floorObjectCorners(object),Math.min(floorObjectHeightOf(object),plan.content.wallHeight));
 return lines.join('\n')+'\n';
}

/** Row 63: «120 x 60 x 75 cm» (catalog "medidas" spec) to metres. Null when fewer than two numbers. Height is null when only two were given. */
export function parseDimensionsText(text:string):{w:number;d:number;h:number|null}|null{
 const normalized=text.toLowerCase().replace(/,/g,'.').replace(/[×*]/g,'x');
 const numbers=[...normalized.matchAll(/(\d+(?:\.\d+)?)/g)].map(m=>Number(m[1])).slice(0,3);
 if(numbers.length<2||!/\dx\s*\d|\d\s*x\s*\d|\d\s+\d/.test(normalized)&&!/x/.test(normalized))return null;
 const unit=/\bmm\b/.test(normalized)?0.001:/\bcm\b/.test(normalized)?0.01:/(\d\s*m\b|\bmetros?\b)/.test(normalized)&&!/\bmm\b|\bcm\b/.test(normalized)?1:/(\bin\b|")/.test(normalized)?0.0254:/\bft\b|'/.test(normalized)?0.3048:numbers.some(n=>n>10)?0.01:1;
 const [w,d,h]=numbers.map(n=>Math.round(n*unit*1000)/1000);
 if(!(w!>=0.05&&w!<=50&&d!>=0.05&&d!<=50))return null;
 return {w:w!,d:d!,h:h!==undefined&&h>=0.05&&h<=20?h:null};
}
