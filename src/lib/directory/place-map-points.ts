import type {PlacesMapPoint} from '@/components/maps/places-map';
import type {PlaceSearchItem} from './search-schemas';
import {mapLinks,placeCardActions} from './place-actions';
import {kindLabel,reviewsOn} from './place-verticals';

/**
 * Pins of a page of place results for the results map (PlacesMap), numbered like the cards from `startRank`. Shared by
 * the first page (PlacesSectionHome) and the infinite-scroll pages (morePlaces), so the pins loaded later are the same.
 */
export function placeMapPoints(places:PlaceSearchItem[],locale:string,startRank=1):PlacesMapPoint[]{
 const en=locale==='en',t=(es:string,english:string)=>en?english:es;
 return places.flatMap((p,n)=>p.location?[{id:p.slug,lat:p.location.lat,lng:p.location.lng,label:`${startRank+n}. ${p.name}`,href:`${en?'/en':''}/negocios/${p.slug}`,rank:startRank+n,name:p.name,sub:[en?p.vertical.nameEn:p.vertical.nameEs,kindLabel(p.vertical.id,p.attributes.kind,en)].filter(Boolean).join(' · '),rating:p.rating.average!=null&&reviewsOn(p.vertical.id,p.attributes.kind)?Number(p.rating.average):null,ratingCount:reviewsOn(p.vertical.id,p.attributes.kind)?p.rating.count:0,
  // Map-first sections (owner 2026-11-26): the pin card carries open-now and the two card actions (Llamar, Cómo llegar).
  open:p.openNow===true?t('Abierto ahora','Open now'):p.openNow===false?t('Cerrado ahora','Closed now'):undefined,openNow:p.openNow,
  // 2026-11-27: on the map, «Cómo llegar» becomes the two navigation apps (Waze first, then Google Maps), like the card sheet.
  actions:placeCardActions({slug:p.slug,name:p.name,verticalId:p.vertical.id,locale,phone:p.phone,location:p.location}).flatMap((a):{id:string;label:string;href:string;external:boolean}[]=>a.type==='directions'&&p.location
   ?[{id:'waze',label:'Waze',href:mapLinks(p.location.lat,p.location.lng).waze,external:true},{id:'maps',label:'Google Maps',href:mapLinks(p.location.lat,p.location.lng).google,external:true}]
   :[{id:a.id,label:a.short||a.label,href:a.href,external:!!a.external}])}]:[]);
}
