import {floorPlanContentSchema,round3,type FloorPlanContent,type Point} from './floor-plan';
import {readZipEntries,readZipEntry} from './zip-lite';

/**
 * Round 6D (row 65): import of a room scan into a floor plan. Formats:
 *  · JSON — our own floor plan JSON, or an Apple RoomPlan «CapturedRoom» export (walls/doors/windows with
 *    `dimensions` [w,h,d] and a column-major 4×4 `transform`): parsed locally, exactly.
 *  · OBJ — mesh from any scanner app: the footprint is the convex hull of the vertices on the floor plane
 *    (Y up), walls are the hull edges and the height is the mesh height. Approximate; the owner edits it.
 *  · USDZ — zipped USD (binary): there is no USD reader without a dependency, so the LOCAL parser is SIMULATED:
 *    it checks the ZIP signature and returns a fixture room sized from the file hash, clearly labelled.
 *    Row 65 update: parseScanUsdz now reads a .usda / .obj inside the ZIP for real; only the binary .usdc case is simulated.
 * The native scan (RoomPlan on iOS / ARCore on Android) produces the RoomPlan JSON above (see room-scan-native.ts).
 */
export type ScanFormat='json'|'obj'|'usdz'|'native';
export type ScanUnit='m'|'cm'|'mm'|'in'|'ft';
export type ScanUpAxis='y'|'z';
export type ScanOptions={unit?:ScanUnit;upAxis?:ScanUpAxis};
/** Row 65: dimensions read from the scan, in metres (bounding box, footprint outline). */
export type ScanMeasures={width:number;depth:number;height:number;footprintArea:number;boxVolume:number;wallLengths:number[]};
export type ScanParse={ok:true;content:FloorPlanContent;parser:'local'|'simulado'|'native';notes:string[];measures?:ScanMeasures}|{ok:false;reason:'format'|'empty'|'too_large'|'invalid'};
export const scanUnitScale:Record<ScanUnit,number>={m:1,cm:0.01,mm:0.001,in:0.0254,ft:0.3048};
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
/** Footprint (convex hull on the floor plane), height and bounding box of a vertex cloud, scaled to metres. */
export function measureVertices(vertices:[number,number,number][],options:ScanOptions={}):{outline:Point[];height:number;measures:ScanMeasures}|null{
 const k=scanUnitScale[options.unit??'m'],up=options.upAxis??'y';
 const floor=vertices.map(v=>up==='y'?[v[0]*k,v[2]*k] as Point:[v[0]*k,v[1]*k] as Point),heights=vertices.map(v=>(up==='y'?v[1]:v[2])*k);
 const minH=Math.min(...heights),height=Math.max(...heights)-minH;
 const hull=convexHull(floor.map(p=>[round3(p[0]),round3(p[1])] as Point)).slice(0,100);if(hull.length<3)return null;
 const xs=floor.map(p=>p[0]),ys=floor.map(p=>p[1]),width=Math.max(...xs)-Math.min(...xs),depth=Math.max(...ys)-Math.min(...ys);
 const wallLengths=hull.map((p,i)=>round3(Math.hypot(hull[(i+1)%hull.length]![0]-p[0],hull[(i+1)%hull.length]![1]-p[1])));
 let area=0;for(let i=0;i<hull.length;i++){const a=hull[i]!,c=hull[(i+1)%hull.length]!;area+=a[0]*c[1]-c[0]*a[1];}
 return {outline:hull,height,measures:{width:round3(width),depth:round3(depth),height:round3(height),footprintArea:round3(Math.abs(area)/2),boxVolume:round3(width*depth*height),wallLengths}};
}
function fromVertices(vertices:[number,number,number][],options:ScanOptions,en:boolean,source:string):ScanParse{
 if(vertices.length<4)return {ok:false,reason:'empty'};
 const m=measureVertices(vertices,options);if(!m)return {ok:false,reason:'empty'};
 if(m.measures.width>200||m.measures.depth>200||m.measures.height>50||m.measures.width<0.2||m.measures.depth<0.2)return {ok:false,reason:'invalid'};
 return {ok:true,content:fromOutline(m.outline,m.height||2.4,en?'Scanned room':'Ambiente escaneado'),parser:'local',measures:m.measures,
  notes:[en?`${source}: footprint = convex outline of all vertices (approximate: an L-shaped room becomes its convex hull). Check walls and openings.`:`${source}: planta = contorno convexo de todos los vértices (aproximado: un ambiente en L se convierte en su envolvente). Revise paredes y aberturas.`]};
}
export function parseObjVertices(text:string){
 const vertices:[number,number,number][]=[];
 for(const line of text.split(/\r?\n/)){if(!line.startsWith('v '))continue;const [,x,y,z]=line.trim().split(/\s+/).map(Number);if([x,y,z].every(Number.isFinite))vertices.push([x!,y!,z!]);if(vertices.length>500000)break;}
 return vertices;
}
export function parseScanObj(text:string,en:boolean,options:ScanOptions={}):ScanParse{
 return fromVertices(parseObjVertices(text),options,en,en?'OBJ mesh':'Malla OBJ');
}
/** USDA (text USD): reads every `point3f[] points = [(x, y, z), ...]` plus metersPerUnit / upAxis of the stage. */
export function parseScanUsda(text:string,en:boolean,options:ScanOptions={}):ScanParse{
 const meters=/metersPerUnit\s*=\s*([0-9.eE+-]+)/.exec(text),up=/upAxis\s*=\s*"([YZyz])"/.exec(text);
 const vertices:[number,number,number][]=[];
 for(const block of text.matchAll(/point3f\[\]\s+points\s*=\s*\[([^\]]*)\]/g)){
  for(const tuple of block[1]!.matchAll(/\(\s*([-0-9.eE+]+)\s*,\s*([-0-9.eE+]+)\s*,\s*([-0-9.eE+]+)\s*\)/g)){vertices.push([Number(tuple[1]),Number(tuple[2]),Number(tuple[3])]);if(vertices.length>500000)break;}
 }
 const scale=meters?Number(meters[1]):null,stageUnit:ScanUnit|null=scale===null?null:(Object.entries(scanUnitScale).find(([,v])=>Math.abs(v-scale)<1e-9)?.[0] as ScanUnit|undefined)??null;
 const result=fromVertices(vertices,{unit:stageUnit??options.unit??'m',upAxis:up?(up[1]!.toLowerCase() as ScanUpAxis):options.upAxis??'y'},en,'USDA');
 if(result.ok&&stageUnit)result.notes.push(en?`Units and up axis taken from the file (metersPerUnit ${scale}).`:`Unidades y eje vertical tomados del archivo (metersPerUnit ${scale}).`);
 return result;
}
/**
 * USDZ: real reading of the ZIP container. If it holds a text USD (.usda) or an OBJ, the geometry is read for real. The binary
 * crate (.usdc, what Apple RoomPlan exports) has no reader here: that case stays SIMULATED and labelled (see parseScanUsdzSimulated).
 */
export function parseScanUsdz(bytes:Uint8Array,sha256:string,en:boolean,options:ScanOptions={},inflate?:(data:Uint8Array)=>Uint8Array):ScanParse{
 const entries=readZipEntries(bytes);if(!entries)return {ok:false,reason:'format'};
 const decoder=new TextDecoder('utf-8');
 for(const entry of entries){
  const lower=entry.name.toLowerCase(),data=lower.endsWith('.usda')||lower.endsWith('.obj')||lower.endsWith('.usd')?readZipEntry(bytes,entry,inflate):null;
  if(!data)continue;
  const head=decoder.decode(data.subarray(0,16));
  if(lower.endsWith('.obj'))return parseScanObj(decoder.decode(data),en,options);
  if(head.startsWith('#usda'))return parseScanUsda(decoder.decode(data),en,options);
 }
 return parseScanUsdzSimulated(bytes,sha256,en);
}
/** SIMULATED USDZ reader: validates the ZIP container and returns a fixture room whose size depends on the hash. */
export function parseScanUsdzSimulated(bytes:Uint8Array,sha256:string,en:boolean):ScanParse{
 if(bytes.length<4||bytes[0]!==0x50||bytes[1]!==0x4b||bytes[2]!==0x03||bytes[3]!==0x04)return {ok:false,reason:'format'};
 const n=parseInt(sha256.slice(0,4),16),w=3+(n%30)/10,h=2.5+((n>>5)%25)/10;
 return {ok:true,content:fromOutline([[0,0],[w,0],[w,h],[0,h]],2.4,en?'Scanned room (simulated)':'Ambiente escaneado (simulado)'),parser:'simulado',notes:[en?'SIMULATED: USDZ is not read locally. This rectangle is a placeholder; real reading needs the native plugin or a USD reader.':'SIMULADO: el USDZ no se lee localmente. Este rectángulo es provisional; la lectura real requiere el complemento nativo o un lector USD.']};
}
export function scanFormatOf(name:string):ScanFormat|null{const ext=name.toLowerCase().split('.').pop();return ext==='json'?'json':ext==='obj'?'obj':ext==='usdz'?'usdz':null;}
