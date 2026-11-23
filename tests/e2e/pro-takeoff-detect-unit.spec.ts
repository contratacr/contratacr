import {test,expect} from 'playwright/test';
import {detectRoom,polygonAreaPx,simplify,toNormalized,traceContour} from '../../src/lib/pro/takeoff-detect';
import {evaluateTakeoff,reviewQuantity,takeoffReviewSchema} from '../../src/lib/pro/takeoff-review';

// Rows 66/67: pure logic, no database or browser. Synthetic grey bitmaps: 255 = paper, 0 = wall ink.
const W=120,H=100;
function bitmap(){const g=new Uint8Array(W*H).fill(255);return {g,rect(x0:number,y0:number,x1:number,y1:number,v=0){for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++)g[y*W+x]=v;},};}
function walls(b:ReturnType<typeof bitmap>,x0:number,y0:number,x1:number,y1:number,t=3){b.rect(x0,y0,x1,y0+t-1);b.rect(x0,y1-t+1,x1,y1);b.rect(x0,y0,x0+t-1,y1);b.rect(x1-t+1,y0,x1,y1);}
const near=(a:number,b:number,tol:number)=>expect(Math.abs(a-b)/b).toBeLessThanOrEqual(tol);

test('row 66: a closed rectangular room is detected with its inner area', async()=>{
 const b=bitmap();walls(b,10,10,90,70);// interior 74 x 54 px
 const r=detectRoom(b.g,W,H,[50,40],{closeRadius:2});expect(r.ok).toBe(true);if(!r.ok)return;
 near(r.areaPx,74*54,0.06);expect(r.polygon.length).toBeLessThanOrEqual(6);
 const n=toNormalized(r.polygon,W,H);expect(n.every(p=>p[0]>0&&p[0]<1&&p[1]>0&&p[1]<1)).toBe(true);
});
test('row 66: an L-shaped room keeps its concave corner', async()=>{
 const b=bitmap();b.rect(10,10,89,19);b.rect(10,10,19,79);b.rect(10,70,59,79);b.rect(50,40,59,79);b.rect(50,40,89,49);b.rect(80,10,89,49);// L: interior = 70x60 minus 30x30 corner... 
 const r=detectRoom(b.g,W,H,[30,30],{closeRadius:1});expect(r.ok).toBe(true);if(!r.ok)return;
 expect(r.polygon.length).toBeGreaterThanOrEqual(6);
 const hull=r.polygon.length;expect(hull).toBeLessThanOrEqual(10);
 // The L is not a rectangle: the area must be clearly smaller than its bounding box.
 const xs=r.polygon.map(p=>p[0]),ys=r.polygon.map(p=>p[1]),box=(Math.max(...xs)-Math.min(...xs))*(Math.max(...ys)-Math.min(...ys));
 expect(r.areaPx).toBeLessThan(box*0.85);
});
test('row 66: furniture inside does not shrink the outer outline (holes are subtracted separately)', async()=>{
 const b=bitmap();walls(b,10,10,90,70);b.rect(40,30,55,45);
 const r=detectRoom(b.g,W,H,[20,20]);expect(r.ok).toBe(true);if(!r.ok)return;near(r.areaPx,74*54,0.06);
});
test('row 66: a small open door is bridged by the door-closing setting, a big opening is refused', async()=>{
 const b=bitmap();walls(b,10,10,90,70);b.rect(10,30,12,37,255);// 8 px door on the left wall
 expect(detectRoom(b.g,W,H,[50,40],{closeRadius:0}).ok).toBe(false);// no closing: leaks
 const closed=detectRoom(b.g,W,H,[50,40],{closeRadius:5});expect(closed.ok).toBe(true);if(closed.ok)near(closed.areaPx,74*54,0.12);
 const wide=bitmap();walls(wide,10,10,90,70);wide.rect(10,20,12,60,255);
 const refused=detectRoom(wide.g,W,H,[50,40],{closeRadius:5});expect(refused.ok).toBe(false);if(!refused.ok)expect(refused.reason).toBe('leaks');
});
test('row 66: taps on a wall or outside the image are rejected', async()=>{
 const b=bitmap();walls(b,10,10,90,70);
 const wall=detectRoom(b.g,W,H,[11,40]);expect(wall.ok).toBe(false);if(!wall.ok)expect(wall.reason).toBe('on_wall');
 const out=detectRoom(b.g,W,H,[500,40]);expect(out.ok).toBe(false);if(!out.ok)expect(out.reason).toBe('out_of_bounds');
 const outside=detectRoom(b.g,W,H,[3,3]);expect(outside.ok).toBe(false);// the exterior touches the border
});
test('row 66: contour and simplification helpers', async()=>{
 const m=new Uint8Array(W*H);for(let y=20;y<40;y++)for(let x=20;x<60;x++)m[y*W+x]=1;
 const c=traceContour(m,W,H);expect(c.length).toBeGreaterThan(100);
 const s=simplify(c,1);expect(s.length).toBe(4);near(polygonAreaPx(s),19*39,0.01);
 expect(traceContour(new Uint8Array(W*H),W,H)).toEqual([]);
});
test('row 67: the review record accepts kept rows with their edits and rejects inconsistent ones', async()=>{
 const id='3b241101-e2bb-4255-8caf-4136c566a962',proposed={name:'Sala',kind:'area' as const,quantity:'20'};
 const ok=takeoffReviewSchema.safeParse({suggestionId:id,planId:id,outcome:'accepted',rows:[{index:0,include:true,proposed,saved:{...proposed,quantity:'18.5'}},{index:1,include:false,proposed,saved:null}]});
 expect(ok.success).toBe(true);
 expect(takeoffReviewSchema.safeParse({suggestionId:id,planId:id,outcome:'discarded',rows:[{index:0,include:true,proposed,saved:proposed}]}).success).toBe(false);
 expect(takeoffReviewSchema.safeParse({suggestionId:id,planId:id,outcome:'accepted',rows:[{index:0,include:false,proposed,saved:null}]}).success).toBe(false);
 expect(takeoffReviewSchema.safeParse({suggestionId:id,planId:id,outcome:'accepted',rows:[{index:0,include:true,proposed,saved:null}]}).success).toBe(false);
 expect(reviewQuantity('12,3456')).toBe('12.346');expect(reviewQuantity(7)).toBe('7');
});
test('row 67: evaluation fixture compares the AI proposal with manual measurements', async()=>{
 // Synthetic plan: manual reference (what a person measured) vs a typical proposal with one miss, one extra and some error.
 const reference=[{name:'Sala',kind:'area' as const,quantity:24},{name:'Cocina',kind:'area' as const,quantity:12},{name:'Paredes sala',kind:'length' as const,quantity:19.6},{name:'Puertas',kind:'count' as const,quantity:4},{name:'Baño',kind:'area' as const,quantity:5}];
 const proposal=[{name:'sala',kind:'area' as const,quantity:26.4},{name:'Cocína',kind:'area' as const,quantity:12},{name:'Paredes sala',kind:'length' as const,quantity:18.62},{name:'Puertas',kind:'count' as const,quantity:3},{name:'Patio',kind:'area' as const,quantity:9}];
 const report=evaluateTakeoff(reference,proposal);
 expect(report.matched).toBe(4);expect(report.missing).toEqual(['Baño']);expect(report.extra).toEqual(['Patio']);
 expect(report.perItem.find(i=>i.name==='Cocina')!.relativeError).toBe(0);
 near(report.perItem.find(i=>i.name==='Sala')!.relativeError+1,1.1,0.001);
 expect(report.worstRelativeError).toBeCloseTo(0.25,5);expect(report.meanRelativeError).toBeCloseTo((0.1+0+0.05+0.25)/4,5);
 expect(evaluateTakeoff([],[]).meanRelativeError).toBeNull();
});
