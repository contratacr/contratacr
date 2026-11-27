import {checkPlacePhone} from './phone';
import {directionsLinks} from '@/lib/maps/maplibre';

/**
 * Primary actions of a place per category (owner request 2026-11-23, «como la app móvil de Yelp»): ONE typed mapping
 * from section (dir_verticals id) to the buttons offered in three places:
 * - `bar`: the sticky bottom bar of phones (at most four, icon over label; the first available one is the filled one);
 * - `side`: the contact card of the place page (right column from lg, under the header on phones);
 * - `head`: extra buttons at the start of the header action row (before «Dejar una reseña», photo, share, save);
 * - `card`: the result cards (at most two).
 * A button exists ONLY when its data exists (never a dead button): `resolvePlaceActions` returns the available ones, in
 * the order of the mapping. Pure and shared by the page, the cards and the spec.
 *
 * Data limits (honest): there is no «reservation URL» field, so «Reservar» is the in-app reservation tool when the
 * owner enabled it, otherwise «Llamar para reservar» (valid Costa Rican phone). WhatsApp comes only from the owner's
 * «Pedir» link (dir_order_link_public, channel whatsapp); «Cotizar» is that same WhatsApp with a prefilled message.
 * «Agendar cita» has no data source today and is not offered; health places keep «Llamar».
 */
export type PlaceActionId='reserve'|'call'|'whatsapp'|'quote'|'order'|'directions'|'hours'|'menu'|'prices'|'website'|'review';
export type PlaceActionSpec={bar:PlaceActionId[];side:PlaceActionId[];head:PlaceActionId[];card:PlaceActionId[]};

const DEFAULT:PlaceActionSpec={bar:['call','directions','website','review'],side:['call','directions','website'],head:[],card:['call','directions']};
export const PLACE_ACTIONS:Record<string,PlaceActionSpec>={
 restaurant:{bar:['reserve','call','directions','review'],side:['reserve','call','order','directions','menu','website'],head:['reserve','menu'],card:['call','directions']},
 cafe_bar:{bar:['call','directions','menu','review'],side:['reserve','call','order','directions','menu','website'],head:['reserve','menu'],card:['call','directions']},
 fuel:{bar:['directions','prices','call','review'],side:['call','directions','prices','website'],head:['prices'],card:['directions','call']},
 pharmacy:{bar:['call','directions','whatsapp','hours','review'],side:['call','whatsapp','directions','hours','website'],head:[],card:['call','directions']},
 grocery:{bar:['call','directions','hours','review'],side:['call','order','whatsapp','directions','hours','website'],head:[],card:['call','directions']},
 convenience:{bar:['call','directions','hours','review'],side:['call','order','whatsapp','directions','hours','website'],head:[],card:['call','directions']},
 hardware:{bar:['call','quote','directions','review'],side:['call','quote','whatsapp','directions','website'],head:[],card:['call','directions']},
 lodging:{bar:['call','website','directions','review'],side:['call','website','directions'],head:[],card:['call','directions']},
 health:{bar:['call','directions','hours','review'],side:['call','directions','hours','website'],head:[],card:['call','directions']},
 vet_pets:{bar:['call','whatsapp','directions','review'],side:['call','whatsapp','order','directions','website'],head:[],card:['call','directions']},
 auto_services:{bar:['call','quote','directions','review'],side:['call','quote','whatsapp','directions','website'],head:[],card:['call','directions']},
 beauty:{bar:['call','whatsapp','directions','review'],side:['call','whatsapp','directions','website'],head:[],card:['call','directions']},
 fitness:{bar:['call','directions','hours','review'],side:['call','directions','hours','website'],head:[],card:['call','directions']},
 tours:{bar:['website','call','directions','review'],side:['website','call','directions'],head:[],card:['directions','call']},
 banking:{bar:['directions','call','hours','review'],side:['directions','call','hours','website'],head:[],card:['directions','call']},
 parking:{bar:['directions','call','hours','review'],side:['directions','call','whatsapp','hours','website'],head:[],card:['directions','call']},
 car_wash:{bar:['call','whatsapp','directions','review'],side:['call','whatsapp','directions','hours','website'],head:[],card:['call','directions']},
 // 2026-11-26 (migration 537). `review` is dropped at render time where reviewsOn() is false (public offices, malls, schools, terminals).
 attraction:{bar:['directions','call','hours','review'],side:['directions','call','whatsapp','hours','website'],head:[],card:['directions','call']},
 retail:{bar:['call','whatsapp','directions','review'],side:['call','whatsapp','directions','hours','website'],head:[],card:['call','directions']},
 mall:{bar:['directions','call','hours'],side:['directions','call','hours','website'],head:[],card:['directions','call']},
 food_shop:{bar:['call','whatsapp','directions','review'],side:['call','whatsapp','directions','hours','website'],head:[],card:['call','directions']},
 government:{bar:['directions','call','hours'],side:['directions','call','hours','website'],head:[],card:['directions','call']},
 education:{bar:['call','website','directions','review'],side:['call','website','whatsapp','directions','hours'],head:[],card:['call','directions']},
 transport:{bar:['directions','call','hours','review'],side:['directions','call','whatsapp','hours','website'],head:[],card:['directions','call']},
 vehicle_dealer:{bar:['call','directions','website','review'],side:['call','directions','website'],head:[],card:['call','directions']},
 real_estate:{bar:['call','directions','website','review'],side:['call','directions','website'],head:[],card:['call','directions']},
};
export const placeActionSpec=(verticalId:string):PlaceActionSpec=>PLACE_ACTIONS[verticalId]??DEFAULT;

/** What the place has (all optional). */
export type PlaceActionInput={
 slug:string;name:string;verticalId:string;locale:string;
 phone?:string|null;website?:string|null;location?:{lat:number;lng:number}|null;
 hasHours?:boolean;hasMenu?:boolean;hasPrices?:boolean;
 /** Owner enabled the in-app reservation tool. */reservation?:boolean;
 /** Owner «Pedir» link. */order?:{channel:'whatsapp'|'web'|'phone';value:string}|null;
 /** Review form exists (every published place). */reviewable?:boolean;
};
export type PlaceAction={
 id:PlaceActionId;label:string;short:string;
 /** `directions` is rendered as a chooser (Waze, Google Maps, Apple Maps). */
 type:'link'|'directions';href:string;external?:boolean;
 /** Contact channel recorded before navigating (call / whatsapp). */contact?:'call'|'whatsapp';
 maps?:{google:string;waze:string;apple:string};
};

const waDigits=(v:string)=>v.replace(/[^0-9]/g,'');
const wa=(value:string,text?:string)=>{
 const d=waDigits(value);if(!d)return null;
 return `https://wa.me/${d.length===8?'506'+d:d}${text?`?text=${encodeURIComponent(text)}`:''}`;
};
export const mapLinks=(lat:number,lng:number)=>({...directionsLinks(lat,lng),apple:`https://maps.apple.com/?daddr=${encodeURIComponent(`${lat},${lng}`)}&dirflg=d`});

/** The button for one id, or null when the place has not got the data for it. */
export function resolvePlaceAction(id:PlaceActionId,p:PlaceActionInput):PlaceAction|null{
 const en=p.locale==='en',t=(es:string,english:string)=>en?english:es,prefix=en?'/en':'';
 const phone=checkPlacePhone(p.phone),tel=phone?.kind==='cr'?`tel:${phone.tel}`:null;
 const order=p.order??null;
 const waLink=order?.channel==='whatsapp'?(id==='quote'?wa(order.value,t(`Hola, quisiera una cotización. Vi su ficha en ContrataCR (${p.name}).`,`Hello, I would like a quote. I found your listing on ContrataCR (${p.name}).`)):wa(order.value)):null;
 switch(id){
  case 'reserve':
   if(p.reservation)return {id,label:t('Reservar','Reserve'),short:t('Reservar','Reserve'),type:'link',href:'#place-reservations'};
   return tel?{id,label:t('Llamar para reservar','Call to reserve'),short:t('Reservar','Reserve'),type:'link',href:tel,contact:'call'}:null;
  case 'call':return tel?{id,label:t('Llamar','Call'),short:t('Llamar','Call'),type:'link',href:tel,contact:'call'}:null;
  case 'whatsapp':return waLink?{id,label:'WhatsApp',short:'WhatsApp',type:'link',href:waLink,external:true,contact:'whatsapp'}:null;
  case 'quote':return waLink?{id,label:t('Cotizar','Get a quote'),short:t('Cotizar','Quote'),type:'link',href:waLink,external:true,contact:'whatsapp'}:null;
  case 'order':{
   if(!order||order.channel==='whatsapp'&&!waLink)return null;
   const href=order.channel==='phone'?`tel:${order.value.replace(/[^+0-9]/g,'')}`:order.channel==='whatsapp'?waLink!:order.value;
   return {id,label:t('Pedir','Order'),short:t('Pedir','Order'),type:'link',href,external:order.channel!=='phone'};
  }
  case 'directions':{
   if(!p.location)return null;const maps=mapLinks(p.location.lat,p.location.lng);
   return {id,label:t('Cómo llegar','Get directions'),short:t('Cómo llegar','Directions'),type:'directions',href:maps.google,external:true,maps:{google:maps.google,waze:maps.waze,apple:maps.apple}};
  }
  case 'hours':return p.hasHours?{id,label:t('Ver horario','See hours'),short:t('Horario','Hours'),type:'link',href:'#horario'}:null;
  case 'menu':return p.hasMenu?{id,label:t('Ver el menú','See the menu'),short:t('Menú','Menu'),type:'link',href:`${prefix}/negocios/${p.slug}/menu`}:null;
  case 'prices':return p.hasPrices?{id,label:t('Ver precios','See prices'),short:t('Precios','Prices'),type:'link',href:'#precios'}:null;
  case 'website':{
   if(!p.website||!/^https?:\/\//i.test(p.website))return null;
   return {id,label:t('Sitio web','Website'),short:t('Sitio web','Website'),type:'link',href:p.website,external:true};
  }
  case 'review':return p.reviewable===false?null:{id,label:t('Dejar una reseña','Leave a review'),short:t('Reseña','Review'),type:'link',href:'#escribir-resena'};
 }
}

/** Available actions of a list, in order; the same destination is never offered twice and «Cotizar» replaces «WhatsApp». */
export function resolvePlaceActions(ids:PlaceActionId[],p:PlaceActionInput):PlaceAction[]{
 const out:PlaceAction[]=[],seen=new Set<string>();
 const hasQuote=ids.includes('quote')&&!!resolvePlaceAction('quote',p);
 for(const id of ids){
  if(id==='whatsapp'&&hasQuote)continue;
  const a=resolvePlaceAction(id,p);if(!a)continue;
  const key=a.type==='directions'?'directions':a.href;
  if(seen.has(key))continue;seen.add(key);out.push(a);
 }
 return out;
}
export const placeBarActions=(p:PlaceActionInput)=>resolvePlaceActions(placeActionSpec(p.verticalId).bar,p).slice(0,4);
export const placeSideActions=(p:PlaceActionInput)=>resolvePlaceActions(placeActionSpec(p.verticalId).side,p);
export const placeHeadActions=(p:PlaceActionInput)=>resolvePlaceActions(placeActionSpec(p.verticalId).head,p);
export const placeCardActions=(p:PlaceActionInput)=>resolvePlaceActions(placeActionSpec(p.verticalId).card,p).slice(0,2);
