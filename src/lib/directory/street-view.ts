/**
 * «Vista de la calle» (2026-11-27, owner-approved): street-level imagery from Mapillary (CC BY-SA 4.0) for places that
 * have NO photo of their own. Pure selection logic shared by the backfill script (scripts/directory/mapillary-streetview.mjs)
 * and its unit tests; no network, no secrets. See docs/directory-photos.md («Mapillary»).
 *
 * Choice for one place: images in a small bbox around it (40 m, then 80 m), never panoramas (an equirectangular 360°
 * thumb looks broken in a card), the camera pointing at the place (bearing image → place within ±50° of compass_angle):
 *  1. captured in the last 6 years and facing the place;
 *  2. older (up to 10 years) and facing the place;
 *  3. captured in the last 6 years, not facing (or no compass), only when it is within 25 m.
 * Inside a tier the closest image wins (then the newest, then the id, so the result is stable).
 */
export const STREET_VIEW_FIELDS='id,thumb_1024_url,thumb_2048_url,captured_at,compass_angle,computed_geometry,geometry,creator,is_pano';
export const STREET_VIEW_RADII_M=[40,80] as const;
export const FACING_TOLERANCE_DEG=50;
export const RECENT_YEARS=6;
export const OLDEST_YEARS=10;
export const NOT_FACING_MAX_M=25;
/** Panoramas are left out (equirectangular thumbs are distorted in a 16:10 card or a round avatar). */
export const PANO_POLICY='exclude' as const;
/** Cached choice (found or none) is looked up again after this many days. */
export const STREET_VIEW_REFRESH_DAYS=90;
/** A cached thumb URL is re-fetched by image id after this long (Mapillary thumb URLs expire). */
export const THUMB_TTL_MS=60*60*1000;

export type LatLng={lat:number;lng:number};
export type MapillaryImage={id:string;captured_at?:number|string|null;compass_angle?:number|null;
 computed_geometry?:{type?:string;coordinates?:[number,number]}|null;geometry?:{type?:string;coordinates?:[number,number]}|null;
 creator?:{username?:string|null;id?:string|null}|null;is_pano?:boolean|null;thumb_1024_url?:string|null;thumb_2048_url?:string|null};
export type StreetViewChoice={image:MapillaryImage;distanceM:number;facing:boolean;tier:1|2|3;capturedAt:Date|null;position:LatLng};

const R=6371008.8,rad=(d:number)=>d*Math.PI/180,deg=(r:number)=>r*180/Math.PI;
/** Great-circle distance in metres. */
export function distanceM(a:LatLng,b:LatLng):number{
 const dLat=rad(b.lat-a.lat),dLng=rad(b.lng-a.lng);
 const h=Math.sin(dLat/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(dLng/2)**2;
 return 2*R*Math.asin(Math.min(1,Math.sqrt(h)));
}
/** Initial bearing from `from` to `to`, degrees clockwise from north in [0, 360). */
export function bearingDeg(from:LatLng,to:LatLng):number{
 const φ1=rad(from.lat),φ2=rad(to.lat),Δλ=rad(to.lng-from.lng);
 const y=Math.sin(Δλ)*Math.cos(φ2),x=Math.cos(φ1)*Math.sin(φ2)-Math.sin(φ1)*Math.cos(φ2)*Math.cos(Δλ);
 return (deg(Math.atan2(y,x))+360)%360;
}
/** Smallest difference between two angles, in [0, 180]. */
export function angleDiff(a:number,b:number):number{
 const d=Math.abs((((a-b)%360)+360)%360);return d>180?360-d:d;
}
/** [minLng, minLat, maxLng, maxLat] of a square of ±`radiusM` around a point (the Graph API `bbox` order). */
export function bboxAround(p:LatLng,radiusM:number):[number,number,number,number]{
 const dLat=radiusM/111320,dLng=radiusM/(111320*Math.max(0.01,Math.cos(rad(p.lat))));
 const r=(n:number)=>Math.round(n*1e6)/1e6;
 return [r(p.lng-dLng),r(p.lat-dLat),r(p.lng+dLng),r(p.lat+dLat)];
}
/** Where the image was taken: computed (SfM-corrected) geometry first, then the raw GPS one. */
export function imagePosition(img:MapillaryImage):LatLng|null{
 for(const g of [img.computed_geometry,img.geometry]){
  const c=g?.coordinates;if(Array.isArray(c)&&Number.isFinite(c[0])&&Number.isFinite(c[1])&&Math.abs(c[1])<=90&&Math.abs(c[0])<=180)return{lng:c[0],lat:c[1]};
 }
 return null;
}
/** captured_at is epoch milliseconds in the Graph API (an ISO string is accepted too). */
export function capturedDate(v:MapillaryImage['captured_at']):Date|null{
 if(v==null||v==='')return null;
 const d=typeof v==='number'?new Date(v):/^\d{10,}$/.test(String(v))?new Date(Number(v)):new Date(String(v));
 return Number.isNaN(d.getTime())?null:d;
}
/** Is the camera pointing at the place? No compass angle → not facing. */
export function facesPlace(img:MapillaryImage,at:LatLng,place:LatLng,tolerance=FACING_TOLERANCE_DEG):boolean{
 const c=img.compass_angle;if(typeof c!=='number'||!Number.isFinite(c))return false;
 return angleDiff(bearingDeg(at,place),c)<=tolerance;
}
/** Best image for a place among the images of one bbox search, or null (none good enough within `maxDistanceM`). */
export function selectStreetView(images:readonly MapillaryImage[],place:LatLng,{now=new Date(),maxDistanceM=STREET_VIEW_RADII_M[STREET_VIEW_RADII_M.length-1] as number}:{now?:Date;maxDistanceM?:number}={}):StreetViewChoice|null{
 const year=365.25*24*3600*1000,recentFrom=now.getTime()-RECENT_YEARS*year,oldestFrom=now.getTime()-OLDEST_YEARS*year;
 const cands:StreetViewChoice[]=[];
 for(const image of images){
  if(!image||typeof image.id!=='string'||!/^\d{1,20}$/.test(image.id))continue;
  if(image.is_pano===true&&PANO_POLICY==='exclude')continue;
  if(!image.creator?.username)continue; // CC BY-SA: no creator to credit → not usable
  const position=imagePosition(image);if(!position)continue;
  const d=distanceM(position,place);if(d>maxDistanceM)continue;
  const capturedAt=capturedDate(image.captured_at),t=capturedAt?.getTime()??null;
  if(t==null||t>now.getTime()+24*3600*1000)continue;
  const facing=d<3?true:facesPlace(image,position,place); // standing on the point: any direction shows it
  const tier=facing&&t>=recentFrom?1:facing&&t>=oldestFrom?2:!facing&&t>=recentFrom&&d<=NOT_FACING_MAX_M?3:null;
  if(tier)cands.push({image,distanceM:d,facing,tier,capturedAt,position});
 }
 cands.sort((a,b)=>a.tier-b.tier||a.distanceM-b.distanceM||(b.capturedAt!.getTime()-a.capturedAt!.getTime())||a.image.id.localeCompare(b.image.id));
 return cands[0]??null;
}
/** Public page of a Mapillary image (the attribution link). */
export const mapillaryImageUrl=(imageId:string)=>`https://www.mapillary.com/app/?pKey=${encodeURIComponent(imageId)}&focus=photo`;
/** Only Mapillary's own CDN may be redirected to (the thumb URLs live on fbcdn.net / mapillary.com). */
export function isMapillaryThumbUrl(v:unknown):v is string{
 if(typeof v!=='string'||v.length>2048)return false;
 let u:URL;try{u=new URL(v);}catch{return false;}
 return u.protocol==='https:'&&/(^|\.)(fbcdn\.net|mapillary\.com)$/i.test(u.hostname);
}
/** What the UI needs about a street view; `src` is our own redirecting route, never the Mapillary URL. */
export type StreetView={imageId:string;creator:string;capturedAt:string|null;pageUrl:string;src:string};
export const streetViewSrc=(placeId:string,size:1024|2048=1024)=>`/api/vista-calle/${placeId}${size===2048?'?s=2048':''}`;
/** Label shown on every street view (never presented as the business's own photo). */
export const streetViewLabel=(en:boolean)=>en?'Street view':'Vista de la calle';
