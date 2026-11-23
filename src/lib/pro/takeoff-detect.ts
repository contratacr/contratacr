/**
 * Row 66: assisted detection of an area on a plan image. The owner taps INSIDE a room; this pure module
 * binarizes the grey image (dark = wall), closes small gaps (open doors) by dilating the walls, grows the region
 * from the tap, restores the wall gap, traces the outer contour and simplifies it (Douglas-Peucker). The result
 * is only a proposed polygon: the owner confirms or edits it and the existing measurement writer saves it.
 * No provider, no network, no dependencies.
 */
export type DetectPoint=[number,number];
export type DetectOptions={threshold?:number;closeRadius?:number;maxFraction?:number;epsilon?:number};
export type DetectResult={ok:true;polygon:DetectPoint[];areaPx:number}|{ok:false;reason:'on_wall'|'leaks'|'empty'|'out_of_bounds'};
/** Box dilation of a boolean mask by radius r (separable, linear time). */
export function dilate(mask:Uint8Array,w:number,h:number,r:number){
 if(r<=0)return mask.slice();
 const tmp=new Uint8Array(w*h),out=new Uint8Array(w*h);
 for(let y=0;y<h;y++){let count=0;const row=y*w;for(let x=-r;x<w;x++){const add=x+r,drop=x-r-1;if(add<w&&add>=0&&mask[row+add])count++;if(drop>=0&&mask[row+drop])count--;if(x>=0)tmp[row+x]=count>0?1:0;}}
 for(let x=0;x<w;x++){let count=0;for(let y=-r;y<h;y++){const add=y+r,drop=y-r-1;if(add<h&&add>=0&&tmp[add*w+x])count++;if(drop>=0&&tmp[drop*w+x])count--;if(y>=0)out[y*w+x]=count>0?1:0;}}
 return out;
}
function floodFill(blocked:Uint8Array,w:number,h:number,sx:number,sy:number){
 const region=new Uint8Array(w*h),stack=new Int32Array(w*h);let top=0,size=0,border=false;
 stack[top++]=sy*w+sx;region[sy*w+sx]=1;
 while(top){
  const i=stack[--top]!,x=i%w,y=(i-x)/w;size++;if(x===0||y===0||x===w-1||y===h-1)border=true;
  if(x>0&&!region[i-1]&&!blocked[i-1]){region[i-1]=1;stack[top++]=i-1;}
  if(x<w-1&&!region[i+1]&&!blocked[i+1]){region[i+1]=1;stack[top++]=i+1;}
  if(y>0&&!region[i-w]&&!blocked[i-w]){region[i-w]=1;stack[top++]=i-w;}
  if(y<h-1&&!region[i+w]&&!blocked[i+w]){region[i+w]=1;stack[top++]=i+w;}
 }
 return {region,size,border};
}
const dirs:DetectPoint[]=[[-1,0],[-1,-1],[0,-1],[1,-1],[1,0],[1,1],[0,1],[-1,1]];
/** Moore-neighbour outer contour of a mask (pixel centres, clockwise on screen). */
export function traceContour(mask:Uint8Array,w:number,h:number):DetectPoint[]{
 const inside=(x:number,y:number)=>x>=0&&y>=0&&x<w&&y<h&&mask[y*w+x]===1;
 let sx=-1,sy=-1;for(let i=0;i<w*h&&sx<0;i++)if(mask[i]){sx=i%w;sy=(i-sx)/w;}
 if(sx<0)return [];
 const path:DetectPoint[]=[[sx,sy]];let cx=sx,cy=sy,d=0,first:DetectPoint|null=null;
 for(let guard=0;guard<4*w*h+8;guard++){
  let moved=false;
  for(let k=1;k<=8;k++){
   const nd=(d+k)%8,nx=cx+dirs[nd]![0],ny=cy+dirs[nd]![1];
   if(!inside(nx,ny))continue;
   const pd=(nd+7)%8,bx=cx+dirs[pd]![0],by=cy+dirs[pd]![1];
   if(!first)first=[nx,ny];else if(cx===sx&&cy===sy&&nx===first[0]&&ny===first[1])return path;
   const back=dirs.findIndex(v=>v[0]===bx-nx&&v[1]===by-ny);
   cx=nx;cy=ny;d=back<0?0:back;path.push([cx,cy]);moved=true;break;
  }
  if(!moved)return path;
 }
 return path;
}
export function simplify(points:DetectPoint[],epsilon:number):DetectPoint[]{
 if(points.length<=3)return points;
 const dist=(p:DetectPoint,a:DetectPoint,b:DetectPoint)=>{const dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy);return len===0?Math.hypot(p[0]-a[0],p[1]-a[1]):Math.abs(dy*p[0]-dx*p[1]+b[0]*a[1]-b[1]*a[0])/len;};
 const rdp=(list:DetectPoint[]):DetectPoint[]=>{
  let max=0,index=0;for(let i=1;i<list.length-1;i++){const v=dist(list[i]!,list[0]!,list[list.length-1]!);if(v>max){max=v;index=i;}}
  if(max<=epsilon)return [list[0]!,list[list.length-1]!];
  return [...rdp(list.slice(0,index+1)).slice(0,-1),...rdp(list.slice(index))];
 };
 // Closed ring: split at the farthest point from the first so both halves are open polylines.
 let far=0,best=0;for(let i=1;i<points.length;i++){const v=Math.hypot(points[i]![0]-points[0]![0],points[i]![1]-points[0]![1]);if(v>best){best=v;far=i;}}
 const a=rdp(points.slice(0,far+1)),b=rdp([...points.slice(far),points[0]!]);
 return [...a.slice(0,-1),...b.slice(0,-1)];
}
export function polygonAreaPx(p:DetectPoint[]){let s=0;for(let i=0;i<p.length;i++){const a=p[i]!,b=p[(i+1)%p.length]!;s+=a[0]*b[1]-b[0]*a[1];}return Math.abs(s)/2;}
/** Grey (0-255) → detection. `gray` is w*h; the seed is a pixel inside the room. */
export function detectRoom(gray:Uint8Array|Uint8ClampedArray,w:number,h:number,seed:DetectPoint,options:DetectOptions={}):DetectResult{
 const threshold=options.threshold??140,r=Math.max(0,Math.min(12,Math.round(options.closeRadius??2))),maxFraction=options.maxFraction??0.7;
 const sx=Math.round(seed[0]),sy=Math.round(seed[1]);if(sx<0||sy<0||sx>=w||sy>=h)return {ok:false,reason:'out_of_bounds'};
 const wall=new Uint8Array(w*h);for(let i=0;i<w*h;i++)wall[i]=gray[i]!<threshold?1:0;
 if(wall[sy*w+sx])return {ok:false,reason:'on_wall'};
 const blocked=dilate(wall,w,h,r);
 let fx=sx,fy=sy;
 if(blocked[sy*w+sx]){ // the tap is within r pixels of a wall: step to the nearest open pixel
  let found=false;for(let rad=1;rad<=r+1&&!found;rad++)for(let dy=-rad;dy<=rad&&!found;dy++)for(let dx=-rad;dx<=rad&&!found;dx++){const x=sx+dx,y=sy+dy;if(x>=0&&y>=0&&x<w&&y<h&&!blocked[y*w+x]){fx=x;fy=y;found=true;}}
  if(!found)return {ok:false,reason:'empty'};
 }
 const {region,size,border}=floodFill(blocked,w,h,fx,fy);
 if(border||size>w*h*maxFraction)return {ok:false,reason:'leaks'};
 // Restore the gap taken by the wall dilation: grow back r pixels (8-neighbour, keeps square corners) into pixels that were open in the original.
 let grown=region;for(let step=0;step<r;step++){const next=grown.slice();for(let i=0;i<w*h;i++){if(grown[i]||wall[i])continue;const x=i%w,y=(i-x)/w;let hit=false;for(let dy=-1;dy<=1&&!hit;dy++)for(let dx=-1;dx<=1;dx++){const nx=x+dx,ny=y+dy;if(nx>=0&&ny>=0&&nx<w&&ny<h&&grown[ny*w+nx]){hit=true;break;}}if(hit)next[i]=1;}grown=next;}
 const contour=traceContour(grown,w,h);if(contour.length<3)return {ok:false,reason:'empty'};
 const polygon=simplify(contour,options.epsilon??Math.max(1.5,Math.hypot(w,h)*0.003));
 if(polygon.length<3)return {ok:false,reason:'empty'};
 return {ok:true,polygon,areaPx:polygonAreaPx(polygon)};
}
/** Pixel polygon → page coordinates (0-1, six decimals) for the measurement writer. */
export function toNormalized(polygon:DetectPoint[],w:number,h:number):[number,number][]{
 const c=(v:number)=>Math.round(Math.min(1,Math.max(0,v))*1e6)/1e6;return polygon.map(p=>[c((p[0]+0.5)/w),c((p[1]+0.5)/h)]);
}
