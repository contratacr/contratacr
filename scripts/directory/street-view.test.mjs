// Run: node --test scripts/directory/street-view.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {angleDiff,bearingDeg,bboxAround,capturedDate,distanceM,facesPlace,imagePosition,isMapillaryThumbUrl,mapillaryImageUrl,selectStreetView} from '../../src/lib/directory/street-view.ts';

const place={lat:9.938352,lng:-84.101937};
const now=new Date('2026-11-27T12:00:00Z');
const year=365.25*24*3600*1000;
/** Image `m` metres from the place in direction `dir` (deg from north), looking at `compass`. */
function img(id,{m=20,dir=180,compass,years=1,pano=false,user='ana',raw=false}={}){
 const dLat=m*Math.cos(dir*Math.PI/180)/111320,dLng=m*Math.sin(dir*Math.PI/180)/(111320*Math.cos(place.lat*Math.PI/180));
 const coords=[place.lng+dLng,place.lat+dLat];
 return {id,captured_at:now.getTime()-years*year,compass_angle:compass??((dir+180)%360),is_pano:pano,creator:user?{username:user,id:'1'}:null,
  ...(raw?{geometry:{type:'Point',coordinates:coords}}:{computed_geometry:{type:'Point',coordinates:coords}})};
}

test('angle difference wraps around north',()=>{
 assert.equal(angleDiff(359,1),2);assert.equal(angleDiff(1,359),2);assert.equal(angleDiff(0,180),180);assert.equal(angleDiff(-90,270),0);assert.equal(angleDiff(720,10),10);
});
test('bearing and distance',()=>{
 const north={lat:place.lat+0.001,lng:place.lng},east={lat:place.lat,lng:place.lng+0.001};
 assert.ok(angleDiff(bearingDeg(place,north),0)<0.5);assert.ok(angleDiff(bearingDeg(place,east),90)<0.5);assert.ok(angleDiff(bearingDeg(north,place),180)<0.5);
 assert.ok(Math.abs(distanceM(place,north)-111.3)<1);
});
test('bbox order is minLng,minLat,maxLng,maxLat and about ±radius',()=>{
 const [a,b,c,d]=bboxAround(place,40);assert.ok(a<place.lng&&c>place.lng&&b<place.lat&&d>place.lat);
 assert.ok(Math.abs(distanceM({lat:b,lng:place.lng},place)-40)<1);
});
test('facing: within ±50°, no compass → not facing',()=>{
 const i=img('1',{dir:180,compass:10});const at=imagePosition(i);
 assert.equal(facesPlace(i,at,place),true);
 assert.equal(facesPlace({...i,compass_angle:60},at,place),false);
 assert.equal(facesPlace({...i,compass_angle:null},at,place),false);
 const w=img('2',{dir:180,compass:355});assert.equal(facesPlace(w,imagePosition(w),place),true); // 355° vs 0° across north
});
test('captured_at in ms, ISO, or digits; bad → null',()=>{
 assert.equal(capturedDate(1700000000000).toISOString(),'2023-11-14T22:13:20.000Z');
 assert.equal(capturedDate('1700000000000').getTime(),1700000000000);
 assert.equal(capturedDate('2024-01-02T00:00:00Z').getUTCFullYear(),2024);
 assert.equal(capturedDate(null),null);assert.equal(capturedDate('x'),null);
});
test('position falls back from computed_geometry to geometry',()=>{
 assert.ok(imagePosition(img('1',{raw:true})));assert.equal(imagePosition({id:'1'}),null);
});
test('prefers facing over closer non-facing, then the closest',()=>{
 const pick=selectStreetView([img('10',{m:5,compass:0,dir:0}),img('11',{m:30}),img('12',{m:15})],place,{now});
 assert.equal(pick.image.id,'12');assert.equal(pick.tier,1);assert.equal(pick.facing,true);
});
test('panoramas are never chosen',()=>{
 assert.equal(selectStreetView([img('1',{pano:true,m:5})],place,{now}),null);
});
test('recent beats old; old facing beats nothing; too old is dropped',()=>{
 assert.equal(selectStreetView([img('1',{m:5,years:8}),img('2',{m:35,years:2})],place,{now}).image.id,'2');
 assert.equal(selectStreetView([img('1',{m:5,years:8})],place,{now}).tier,2);
 assert.equal(selectStreetView([img('1',{m:5,years:11})],place,{now}),null);
});
test('non-facing only when recent and within 25 m',()=>{
 assert.equal(selectStreetView([img('1',{m:20,compass:180})],place,{now}).tier,3);
 assert.equal(selectStreetView([img('1',{m:40,compass:180})],place,{now}),null);
});
test('distance limit and creator required',()=>{
 assert.equal(selectStreetView([img('1',{m:60})],place,{now,maxDistanceM:40}),null);
 assert.ok(selectStreetView([img('1',{m:60})],place,{now,maxDistanceM:80}));
 assert.equal(selectStreetView([img('1',{user:null})],place,{now}),null);
 assert.equal(selectStreetView([{...img('1'),id:'abc'}],place,{now}),null);
});
test('ties are stable (newer, then id)',()=>{
 const a=img('5',{m:20,years:2}),b=img('4',{m:20,years:1});
 assert.equal(selectStreetView([a,b],place,{now}).image.id,'4');
 assert.equal(selectStreetView([b,a],place,{now}).image.id,'4');
});
test('thumb redirect host allow-list and image page',()=>{
 assert.equal(isMapillaryThumbUrl('https://scontent-mia3-1.xx.fbcdn.net/m1/v/t6/x.jpg?stp=1'),true);
 assert.equal(isMapillaryThumbUrl('https://evil.example.com/fbcdn.net'),false);
 assert.equal(isMapillaryThumbUrl('http://scontent.xx.fbcdn.net/a'),false);
 assert.equal(isMapillaryThumbUrl('https://fbcdn.net.evil.com/a'),false);
 assert.equal(mapillaryImageUrl('123'),'https://www.mapillary.com/app/?pKey=123&focus=photo');
});
