import type {PublicPlace} from './types';
import {checkPlacePhone} from './phone';

// SEO (2026-11-18): schema.org LocalBusiness (or its closest subtype) for /negocios/<slug>. Only fields the directory really
// has: name, address, coordinates, a valid Costa Rican phone, the business's own website, opening hours, photos and the
// rating of ContrataCR reviews (only when there is at least one). Nothing is invented (no price range, no cuisine).
const TYPES:Record<string,string>={
 restaurant:'Restaurant',cafe_bar:'CafeOrCoffeeShop',pharmacy:'Pharmacy',grocery:'GroceryStore',convenience:'ConvenienceStore',
 hardware:'HardwareStore',fuel:'GasStation',lodging:'LodgingBusiness',health:'MedicalBusiness',vet_pets:'VeterinaryCare',
 auto_services:'AutoRepair',beauty:'BeautySalon',fitness:'ExerciseGym',tours:'TravelAgency',banking:'BankOrCreditUnion',
 vehicle_dealer:'AutoDealer',real_estate:'RealEstateAgent',
};
const DAYS=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

export function placeJsonLd(place:PublicPlace,url:string):Record<string,unknown>{
 const phone=checkPlacePhone(place.phone);
 const a=place.address;
 const address=a.line||a.locality||a.adminArea1?{'@type':'PostalAddress',
  ...(a.line?{streetAddress:a.line}:{}),...(a.locality||a.adminArea3?{addressLocality:a.locality??a.adminArea3}:{}),
  ...(a.adminArea1?{addressRegion:a.adminArea1}:{}),addressCountry:place.countryCode||'CR'}:undefined;
 const photos=place.media.filter(m=>m.kind==='photo').map(m=>m.url);
 return {
  '@context':'https://schema.org','@type':TYPES[place.vertical.id]??'LocalBusiness','@id':url+'#lugar',name:place.name,url,
  ...(address?{address}:{}),
  ...(place.location&&place.location.precision!=='unknown'?{geo:{'@type':'GeoCoordinates',latitude:place.location.lat,longitude:place.location.lng}}:{}),
  ...(phone?.kind==='cr'?{telephone:phone.display}:{}),
  ...(place.website?{sameAs:[place.website]}:{}),
  ...(photos.length?{image:photos}:{}),
  ...(place.hours.length?{openingHoursSpecification:place.hours.map(h=>({'@type':'OpeningHoursSpecification',dayOfWeek:'https://schema.org/'+DAYS[h.weekday],opens:h.opens.slice(0,5),closes:h.closes.slice(0,5)}))}:{}),
  ...(place.rating.count>0&&place.rating.average!=null?{aggregateRating:{'@type':'AggregateRating',ratingValue:place.rating.average,reviewCount:place.rating.count,bestRating:5,worstRating:1}}:{}),
 };
}
