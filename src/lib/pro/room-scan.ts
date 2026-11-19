import {floorPlanContentSchema,round3,type FloorPlanContent,type Point} from './floor-plan';

/**
 * Round 6D (row 65): import of a room scan into a floor plan. Formats:
 *  · JSON — our own floor plan JSON, or an Apple RoomPlan «CapturedRoom» export (walls/doors/windows with
 *    `dimensions` [w,h,d] and a column-major 4×4 `transform`): parsed locally, exactly.
 *  · OBJ — mesh from any scanner app: the footprint is the convex hull of the vertices on the floor plane
 *    (Y up), walls are the hull edges and the height is the mesh height. Approximate; the owner edits it.
 *  · USDZ — zipped USD (binary): there is no USD reader without a dependency, so the LOCAL parser is SIMULATED:
 *    it checks the ZIP signature and returns a fixture room sized from the file hash, clearly labelled.
 * The native scan (RoomPlan on iOS / ARCore on Android) produces the RoomPlan JSON above (see room-scan-native.ts).
 */
export type ScanFormat='json'|'obj'|'usdz'|'native';
export type ScanParse={ok:true;content:FloorPlanContent;parser:'local'|'simulado'|'native';notes:string[]}|{ok:false;reason:'format'|'empty'|'too_large'|'invalid'};
export const SCAN_MAX_BYTES=10*1024*1024;
export function convexHull(points:Point[]):Point[]{
 const pts=[...new Map(points.map(p=>[p[0].toFixed(3)+','+p[1].toFixed(3),p])).values()].sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
 if(pts.length<3)return pts;const cross=(o:Point,a:Point,b:Point)=>(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]);
 const lower:Point[]=[],upper:Point[]=[];
 for(const p of pts){while(lower.length>=2&&cross(lower[lower.length-2]!,lower[lower.length-1]!,p)<=0)lower.pop();lower.push(p);}
 for(const p of [...pts].reverse()){while(upper.length>=2&&cross(upper[upper.length-2]!,upper[upper.length-1]!,p)<=0)upper.pop();upper.push(p);}
 return [...lower.slice(0,-1),...upper.slice(0,-1)];
}
const r=(p:Point):Point=>[round3(p[0]),round3(p[1])];
function fromOutline(outline:Point[],height:number,name:string,extra?:{openings?:FloorPlanContent['openings'];walls?:FloorPlanContent['walls']}):FloorPlanContent{
 const minX=Math.min(...outline.map(p=>p[0])),minY=Math.min(...outline.map(p=>p[1])),shift=(p:Point):Point=>r([p[0]-minX,p[1]-minY]);
 const pts=outline.map(shift),walls=extra?.walls?.map(w=>({...w,a:shift(w.a),b:shift(w.b)}))??pts.map((p,i)=>({id:'w'+(i+1),a:p,b:pts[(i+1)%pts.length]!,thickness:0.12}));
 return floorPlanContentSchema.parse({walls,openings:extra?.openings??[],rooms:[{id:'r1',name,points:pts}],dimensions:[],wallHeight:Math.min(20,Math.max(1,round3(height)))});
}
type RoomPlanSurface={dimensions?:number[];transform?:number[]};
function roomPlanWalls(list:RoomPlanSurface[]){
 return list.filter(s=>Array.isArray(s.dimensions)&&Array.isArray(s.transform)&&s.transform.length===16).map((s,i)=>{
  const t=s.transform!,len=s.dimensions![0]!,cx=t[12]!,cz=t[14]!,dx=t[0]!,dz=t[2]!,norm=Math.hypot(dx,dz)||1;
  const a:Point=[cx-dx/norm*len/2,cz-dz/norm*len/2],b:Point=[cx+dx/norm*len/2,cz+dz/norm*len/2];
  return {id:'w'+(i+1),a,b,height:s.dimensions![1]??2.4,center:[cx,cz] as Point,len};
 });
}
export function parseScanJson(text:string,en:boolean):ScanParse{
 let data:unknown;try{data=JSON.parse(text);}catch{return {ok:false,reason:'invalid'};}
 const own=floorPlanContentSchema.safeParse(data);if(own.success)return own.data.walls.length||own.data.rooms.length?{ok:true,content:own.data,parser:'local',notes:[]}:{ok:false,reason:'empty'};
 const room=data as {walls?:RoomPlanSurface[];doors?:RoomPlanSurface[];windows?:RoomPlanSurface[];openings?:RoomPlanSurface[]};
 if(!room||!Array.isArray(room.walls))return {ok:false,reason:'format'};
 const walls=roomPlanWalls(room.walls);if(walls.length<3)return {ok:false,reason:'empty'};
 const hull=convexHull(walls.flatMap(w=>[w.a,w.b])),height=Math.max(...walls.map(w=>w.height));
 const openings:FloorPlanContent['openings']=[];
 for(const [kind,list] of [['door',room.doors??[]],['window',room.windows??[]]] as const){
  for(const [i,o] of roomPlanWalls(list).entries()){
   const wall=walls.reduce((best,w)=>{const d=Math.hypot(w.center[0]-o.center[0],w.center[1]-o.center[1]);return d<best.d?{w,d}:best;},{w:walls[0]!,d:Infinity}).w;
   const along=Math.hypot(o.a[0]-wall.a[0],o.a[1]-wall.a[1]);openings.push({id:kind[0]+(i+1),wallId:wall.id,kind,offset:round3(Math.max(0,Math.min(along,wall.len-0.1))),width:round3(Math.max(0.1,Math.min(o.len,20)))});
  }
 }
 const content=fromOutline(hull,height,en?'Scanned room':'Ambiente escaneado',{walls:walls.map(w=>({id:w.id,a:r(w.a),b:r(w.b),thickness:0.12})),openings});
 return {ok:true,content,parser:'local',notes:[en?'RoomPlan export: walls, doors and windows read exactly; the room outline is the convex hull of the walls.':'Exportación RoomPlan: paredes, puertas y ventanas leídas exactamente; el contorno del ambiente es la envolvente de las paredes.']};
}
export function parseScanObj(text:string,en:boolean):ScanParse{
 const vertices:[number,number,number][]=[];
 for(const line of text.split(/\r?\n/)){if(!line.startsWith('v '))continue;const [,x,y,z]=line.trim().split(/\s+/).map(Number);if([x,y,z].every(Number.isFinite))vertices.push([x!,y!,z!]);if(vertices.length>500000)break;}
 if(vertices.length<4)return {ok:false,reason:'empty'};
 const ys=vertices.map(v=>v[1]),minY=Math.min(...ys),maxY=Math.max(...ys);
 const hull=convexHull(vertices.map(v=>[v[0],v[2]]));if(hull.length<3)return {ok:false,reason:'empty'};
 return {ok:true,content:fromOutline(hull.slice(0,100),maxY-minY||2.4,en?'Scanned room':'Ambiente escaneado'),parser:'local',notes:[en?'OBJ mesh: footprint = outline of all vertices (approximate). Check walls and openings.':'Malla OBJ: planta = contorno de todos los vértices (aproximado). Revise paredes y aberturas.']};
}
/** SIMULATED USDZ reader: validates the ZIP container and returns a fixture room whose size depends on the hash. */
export function parseScanUsdzSimulated(bytes:Uint8Array,sha256:string,en:boolean):ScanParse{
 if(bytes.length<4||bytes[0]!==0x50||bytes[1]!==0x4b||bytes[2]!==0x03||bytes[3]!==0x04)return {ok:false,reason:'format'};
 const n=parseInt(sha256.slice(0,4),16),w=3+(n%30)/10,h=2.5+((n>>5)%25)/10;
 return {ok:true,content:fromOutline([[0,0],[w,0],[w,h],[0,h]],2.4,en?'Scanned room (simulated)':'Ambiente escaneado (simulado)'),parser:'simulado',notes:[en?'SIMULATED: USDZ is not read locally. This rectangle is a placeholder; real reading needs the native plugin or a USD reader.':'SIMULADO: el USDZ no se lee localmente. Este rectángulo es provisional; la lectura real requiere el complemento nativo o un lector USD.']};
}
export function scanFormatOf(name:string):ScanFormat|null{const ext=name.toLowerCase().split('.').pop();return ext==='json'?'json':ext==='obj'?'obj':ext==='usdz'?'usdz':null;}
