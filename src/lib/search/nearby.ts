import boundaries from '@/lib/data/cr-canton-boundaries.json';
import { PROVINCES, haversineKm } from '@/lib/data/cr-geography';
// Server-side only through the search query modules. No user coordinates leave
// the server for geocoding. Boundaries are a simplified ARESEP public snapshot.
type Point = number[];
function inRing(lng:number,lat:number,ring:Point[]){
 let inside=false;
 for(let i=0,j=ring.length-1;i<ring.length;j=i++){
  const [xi,yi]=ring[i],[xj,yj]=ring[j];
  if((yi>lat)!==(yj>lat)&&lng<(xj-xi)*(lat-yi)/(yj-yi)+xi)inside=!inside;
 }
 return inside;
}
function boundaryDistance(lat:number,lng:number,polygons:number[][][][]){
 let min=Infinity;const cos=Math.cos(lat*Math.PI/180),scale=111.195;
 for(const polygon of polygons){
  if(inRing(lng,lat,polygon[0])&&!polygon.slice(1).some(r=>inRing(lng,lat,r)))return 0;
  for(const ring of polygon)for(let i=1;i<ring.length;i++){
   const ax=(ring[i-1][0]-lng)*cos*scale,ay=(ring[i-1][1]-lat)*scale;
   const bx=(ring[i][0]-lng)*cos*scale,by=(ring[i][1]-lat)*scale;
   const dx=bx-ax,dy=by-ay,t=Math.max(0,Math.min(1,-(ax*dx+ay*dy)/(dx*dx+dy*dy||1)));
   min=Math.min(min,Math.hypot(ax+t*dx,ay+t*dy));
  }
 }
 return min;
}
export function nearbyContext(lat:number,lng:number){
 if(!Number.isFinite(lat)||!Number.isFinite(lng)||lat<8||lat>11.3||lng< -86||lng> -82.4)return null;
 lat=Number(lat.toFixed(3));lng=Number(lng.toFixed(3));
 const distances=new Map(boundaries.map(c=>[c.id,boundaryDistance(lat,lng,c.polygons)]));
 const containing=boundaries.find(c=>distances.get(c.id)===0);
 // Border/coastal rounding can put an approximate GPS point just outside land.
 const nearest=containing??[...boundaries].sort((a,b)=>distances.get(a.id)!-distances.get(b.id)!)[0];
 if(!nearest||distances.get(nearest.id)!>2)return null;
 const province=PROVINCES.find(p=>p.id===nearest.provinceId)!;
 const canton=province.cantons.find(c=>c.id===nearest.id)!;
 return {lat,lng,province,canton,distances};
}
export type NearbyContext=NonNullable<ReturnType<typeof nearbyContext>>;
type NearbyProfessional={
 provinceName?:string;cantonName?:string;serviceType?:string|null;videoconsulta?:boolean;
 workplaces?:Array<{cantonId?:string;provinciaId?:string;provinceId?:string;level?:string;lat?:number|null;lng?:number|null;name?:string}>;
 coverage?:{country?:boolean;provincias?:string[];cantones?:string[]};
};
const normalized=(value:string|undefined)=>(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const namedCantons=new Map(PROVINCES.flatMap(p=>p.cantons.map(c=>[normalized(`${c.name}, ${p.name}`),c.id])));
const cantonNames=new Map(PROVINCES.flatMap(p=>p.cantons.map(c=>[normalized(c.name),c.id])));
/** Local canton → nearby cantons (25 km from their boundary) → province.
 * Broad coverage qualifies but does not pretend to be a local establishment. */
export function nearbyRank(pro:NearbyProfessional,context:NearbyContext):[number,number]{
 const workplaces=pro.workplaces??[];const ids=new Set<string>();let pinDistance=Infinity;
 for(const w of workplaces){
  if(w.cantonId)ids.add(w.cantonId);
  if(typeof w.lat==='number'&&typeof w.lng==='number')pinDistance=Math.min(pinDistance,haversineKm(context.lat,context.lng,w.lat,w.lng));
 }
 if(!workplaces.length){const id=namedCantons.get(normalized(`${pro.cantonName}, ${pro.provinceName}`));if(id)ids.add(id);}
 for(const w of workplaces){const id=namedCantons.get(normalized(w.name));if(id)ids.add(id);}
 for(const name of pro.coverage?.cantones??[]){const id=cantonNames.get(normalized(name));if(id)ids.add(id);}
 if(ids.has(context.canton.id))return [0,Number.isFinite(pinDistance)?pinDistance:Infinity];
 const nearby=[...ids].map(id=>context.distances.get(id)??Infinity).filter(d=>d<=25);
 if(nearby.length)return [1,Math.min(...nearby)];
 // Only unstructured legacy pins use distance as a fallback; a map pin must
 // never override the canton explicitly chosen by a professional.
 if(!ids.size&&pinDistance<=25)return [1,pinDistance];
 const inProvince=[...ids].some(id=>context.province.cantons.some(c=>c.id===id));
 const provinceCoverage=pro.coverage?.provincias?.some(p=>normalized(p)===normalized(context.province.name))||workplaces.some(w=>!w.cantonId&&(w.provinciaId??w.provinceId)===context.province.id);
 const national=pro.coverage?.country&&(!pro.videoconsulta||pro.serviceType?.includes('mobile')||workplaces.some(w=>w.level==='country'));
 if(inProvince||provinceCoverage||national||(!workplaces.length&&normalized(pro.provinceName)===normalized(context.province.name)))return [2,inProvince?0:provinceCoverage?1:2];
 return [Infinity,Infinity];
}
export function compareNearby(a:[number,number],b:[number,number]){return (a[0]===b[0]?0:a[0]<b[0]?-1:1)||(a[1]===b[1]?0:a[1]<b[1]?-1:1);}
